using CephAnalysis.Application.Features.Reports.Commands;
using CephAnalysis.Application.Interfaces;
using CephAnalysis.Domain.Entities;
using CephAnalysis.Domain.Enums;
using CephAnalysis.Shared.Common;
using Microsoft.Extensions.Logging;
using QuestPDF.Fluent;
using QuestPDF.Helpers;
using QuestPDF.Infrastructure;
using SkiaSharp;

namespace CephAnalysis.Infrastructure.Services;

/// <summary>
/// Professional PDF report generator — v3.
///
/// Fixes and improvements over v2:
///   ■ Thread-safety: _sectionIndex was a static mutable field — concurrent
///     requests would corrupt numbering. Replaced with a per-render
///     <see cref="ReportContext"/> record that owns the counter.
///   ■ ComposeWiggleChart: measurement nodes without NormalMin/NormalMax
///     now fall back to the SD reference table instead of dividing by zero.
///   ■ DrawDeviationBar: the epsilon guard is applied to both halves of the
///     neutral side; previously only the filled half was guarded, causing
///     QuestPDF to throw on perfectly on-norm measurements.
///   ■ ComposeLandmarksTable: off-by-one in the half-split for odd-length
///     lists is fixed (use (count + 1) / 2 already correct; left-column
///     blank cells now fill all four slots instead of only one).
///   ■ GeneratePdfReportAsync: removed spurious await Task.FromResult() that
///     wrapped a synchronous buffer copy — byte array returned directly.
///   ■ ComposeHeader, ComposeFooter and all non-capturing helpers are static.
///   ■ Colors2 members renamed to PascalCase for C# convention; the inner
///     class itself is sealed.
/// </summary>
public sealed class QuestPdfReportGenerator(
    IStorageService storage,
    IImageOverlayService imageOverlayService,
    ILogger<QuestPdfReportGenerator> logger) : IReportGenerator
{
    private readonly IStorageService _storage = storage;
    private readonly IImageOverlayService _imageOverlayService = imageOverlayService;
    private readonly ILogger<QuestPdfReportGenerator> _logger = logger;

    // ── Design tokens ─────────────────────────────────────────────────────
    private static class C
    {
        public const string NavyDeep = "#0A1A2F";
        public const string NavyMid = "#162B45";
        public const string NavyLight = "#F0F4F9";
        public const string NavyFaint = "#F8FAFC";
        public const string SlateText = "#1E293B";
        public const string SlateLight = "#64748B";
        public const string SlateFaint = "#94A3B8";
        public const string BrandPrimary = "#6366F1";
        public const string AccentTeal = "#0D9488";
        public const string AccentGreen = "#10B981";
        public const string AccentAmber = "#F59E0B";
        public const string AccentRed = "#EF4444";
        public const string AccentGold = "#D97706";
        public const string BorderLight = "#E2E8F0";
        public const string BorderStrong = "#CBD5E1";
        public const string White = "#FFFFFF";
        public const string PageBg = "#F8FAFC";
    }

    // ── Category reference footnotes ──────────────────────────────────────
    private static readonly IReadOnlyDictionary<string, string> CategoryReferences =
        new Dictionary<string, string>
        {
            ["Steiner"] = "Steiner CC (1953). Cephalometrics for you and me. Am J Orthod 39(10):729-755.",
            ["Tweed"] = "Tweed CH (1954). The Frankfort mandibular incisor angle. Am J Orthod 40(3):162-197.",
            ["Eastman"] = "Eastman Dental Center (1981). Cephalometric analysis. Eastman Dental Center.",
            ["McNamara"] = "McNamara JA (1984). A method of cephalometric evaluation. Am J Orthod 86(6):449-469.",
            ["Jarabak"] = "Jarabak JR & Fizzell JA (1972). Technique and Treatment with Lightwire Edgewise Appliances. Mosby.",
            ["Ricketts"] = "Ricketts RM (1960). A foundation for cephalometric communication. Am J Orthod 46(5):330-357.",
            ["Advanced"] = "Kim YH & Vietas JJ (1978). Anteroposterior dysplasia indicator. Am J Orthod 73(6):619-633.",
            ["Dental"] = "Proffit WR et al. (2019). Contemporary Orthodontics, 6th ed. Elsevier.",
            ["Skeletal"] = "Björk A (1969). Prediction of mandibular growth rotation. Am J Orthod 55(6):585-599.",
        };

    // ── SD reference table (Riolo et al. norms) ──────────────────────────
    private static readonly IReadOnlyDictionary<string, (float Mean, float SD)> MeasurementSDs =
        new Dictionary<string, (float Mean, float SD)>
        {
            ["SNA"] = (82.0f, 3.0f),
            ["SNB"] = (80.0f, 3.0f),
            ["ANB"] = (2.0f, 2.0f),
            ["FMA"] = (25.0f, 4.5f),
            ["IMPA"] = (90.0f, 5.0f),
            ["FMIA"] = (65.0f, 5.0f),
            ["SN-GoGn"] = (32.0f, 5.0f),
            ["JRatio"] = (63.5f, 3.0f),
            ["GonialAngle"] = (130.0f, 7.0f),
            ["SN-MP"] = (32.0f, 5.0f),
            ["UI-NA_DEG"] = (22.0f, 5.0f),
            ["LI-NB_DEG"] = (25.0f, 5.0f),
            ["APDI"] = (81.4f, 4.1f),
            ["ODI"] = (74.5f, 6.1f),
            ["H-Angle"] = (10.0f, 3.5f),
            ["UPPER_AIRWAY"] = (13.0f, 4.0f),
            ["A-NPerp"] = (0.0f, 2.0f),
            ["Pog-NPerp"] = (-4.0f, 3.5f),
            ["SaddleAngle"] = (123.0f, 5.0f),
            ["ArticularAngle"] = (143.0f, 6.0f),
            ["BJORK_SUM"] = (396.0f, 4.0f),
            ["UpperGonial"] = (54.0f, 2.5f),
            ["LowerGonial"] = (73.0f, 3.0f),
        };

    // ── Per-render context (replaces static mutable _sectionIndex) ───────
    private sealed class ReportContext
    {
        private int _index;
        public int NextSection() => ++_index;
    }

    // ══════════════════════════════════════════════════════════════════════
    // Entry point
    // ══════════════════════════════════════════════════════════════════════
    public async Task<byte[]> GeneratePdfReportAsync(
        AnalysisSession session,
        GenerateReportRequest request,
        CancellationToken ct)
    {
        bool isDraft = session.Status is not (SessionStatus.Finalized or SessionStatus.Completed);
        var ctx = new ReportContext();

        byte[]? originalXrayBytes = null;
        byte[]? overlaidXrayBytes = null;

        if (request.IncludesXray && session.XRayImage is not null)
        {
            try
            {
                await using var stream = await _storage.DownloadFileAsync(session.XRayImage.StorageUrl, ct);
                using var ms = new MemoryStream();
                await stream.CopyToAsync(ms, ct);
                originalXrayBytes = ms.ToArray();

                if (request.IncludesLandmarkOverlay)
                {
                    Stream? imageStream = null;

                    if (!string.IsNullOrEmpty(session.ResultImageUrl))
                    {
                        try
                        {
                            imageStream = await _storage.DownloadFileAsync(session.ResultImageUrl, ct);
                        }
                        catch (Exception ex)
                        {
                            _logger.LogWarning(ex, "Snapshot download failed — falling back to dynamic generation.");
                        }
                    }

                    if (imageStream is null)
                    {
                        using var baseStream = new MemoryStream(originalXrayBytes);
                        imageStream = await _imageOverlayService.GenerateOverlaidImageAsync(baseStream, session, ct);
                    }

                    await using (imageStream)
                    {
                        using var msOverlay = new MemoryStream();
                        await imageStream.CopyToAsync(msOverlay, ct);
                        overlaidXrayBytes = msOverlay.ToArray();
                    }
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Image pre-fetch failed for session {SessionId}.", session.Id);
            }
        }

        var document = Document.Create(container =>
        {
            container.Page(page =>
            {
                page.Size(PageSizes.A4);
                page.Margin(0, Unit.Centimetre);
                page.PageColor(C.PageBg);
                page.DefaultTextStyle(x => x.FontSize(8.5f).FontFamily("Georgia").FontColor(C.SlateText));

                page.Header().Element(c => ComposeHeader(c, session, isDraft));
                page.Content().Element(c => ComposeContent(c, ctx, session, request, originalXrayBytes, overlaidXrayBytes));
                page.Footer().Element(c => ComposeFooter(c, isDraft));
            });
        });

        using var pdfStream = new MemoryStream();
        document.GeneratePdf(pdfStream);
        return pdfStream.ToArray();
    }

    // ══════════════════════════════════════════════════════════════════════
    // Header
    // ══════════════════════════════════════════════════════════════════════
    private static void ComposeHeader(IContainer container, AnalysisSession session, bool isDraft)
    {
        container.Column(col =>
        {
            col.Item()
               .Background(C.NavyDeep)
               .PaddingHorizontal(24).PaddingVertical(16)
               .Row(row =>
               {
                   row.RelativeItem().Column(inner =>
                   {
                       inner.Item().Text("CephAI")
                            .FontSize(20).Bold().FontFamily("Trebuchet MS").FontColor(C.White);

                       inner.Item().PaddingTop(2)
                            .Text($"{session.AnalysisType} Precision Analysis")
                            .FontSize(8).SemiBold().FontColor(C.BrandPrimary).LetterSpacing(0.04f);
                   });

                   row.RelativeItem(2).AlignCenter().Column(inner =>
                   {
                       inner.Item().AlignCenter()
                            .Text("CLINICAL DIAGNOSTIC REPORT")
                            .FontSize(11).Bold().FontFamily("Trebuchet MS")
                            .LetterSpacing(0.1f).FontColor(C.White);

                       if (isDraft)
                           inner.Item().AlignCenter().PaddingTop(5)
                                .Border(0.5f).BorderColor(C.AccentAmber)
                                .PaddingHorizontal(6).PaddingVertical(2)
                                .Text("DRAFT — PRELIMINARY DATA")
                                .FontSize(7).Bold().FontColor(C.AccentAmber);
                   });

                   row.RelativeItem().AlignRight().Column(inner =>
                   {
                       inner.Item().AlignRight()
                            .Text($"Ref: {session.Id.ToString().ToUpper()[..8]}")
                            .FontSize(8.5f).Bold().FontColor(C.SlateFaint);

                       inner.Item().AlignRight().PaddingTop(2)
                            .Text(DateTime.UtcNow.ToString("dd MMM yyyy • HH:mm UTC"))
                            .FontSize(7.5f).FontColor(C.SlateFaint);

                       var score = session.Diagnosis?.ConfidenceScore ?? 0m;
                       string badgeColor = score > 0.80m ? C.AccentGreen
                                         : score > 0.50m ? C.AccentAmber
                                         : C.AccentRed;

                       inner.Item().AlignRight().PaddingTop(5)
                            .Background(badgeColor).Padding(3)
                            .Text($"AI Confidence  {score:P0}")
                            .FontSize(7.5f).Bold().FontColor(C.White);
                   });
               });

            col.Item()
               .Background(C.NavyMid)
               .PaddingHorizontal(24).PaddingVertical(6)
               .Row(row =>
               {
                   void Meta(string label, string val) => row.AutoItem().PaddingRight(20).Row(r =>
                   {
                       r.AutoItem().Text(label + ": ").FontSize(7).FontColor(C.SlateFaint);
                       r.AutoItem().Text(val).FontSize(7.5f).Bold().FontColor(C.White);
                   });

                   var p = session.XRayImage?.Study?.Patient;
                   Meta("PATIENT", $"{p?.FirstName} {p?.LastName}");
                   Meta("ID", p?.MedicalRecordNo ?? "—");
                   Meta("SYSTEM", session.ModelVersion ?? "v2.4-Hybrid");
               });
        });
    }

    // ══════════════════════════════════════════════════════════════════════
    // Content orchestration
    // ══════════════════════════════════════════════════════════════════════
    private static void ComposeContent(
        IContainer container,
        ReportContext ctx,
        AnalysisSession session,
        GenerateReportRequest request,
        byte[]? originalXrayBytes,
        byte[]? overlaidXrayBytes)
    {
        container.PaddingHorizontal(22).PaddingVertical(16).Column(col =>
        {
            col.Spacing(20);

            ComposeSection(col, ctx, "Patient Information",
                c => ComposePatientDetails(c, session.XRayImage?.Study?.Patient));

            if (request.IncludesXray && originalXrayBytes is not null)
            {
                if (request.IncludesLandmarkOverlay && overlaidXrayBytes is not null)
                    ComposeSection(col, ctx, "Cephalometric Tracing Overlay",
                        c => ComposeSideBySideImages(c, session, originalXrayBytes, overlaidXrayBytes));
                else
                    ComposeSection(col, ctx, "X-Ray Record",
                        c => ComposeXRayImage(c, session, session.XRayImage!, originalXrayBytes));

                if (request.IncludesLandmarkOverlay && (session.Landmarks?.Count ?? 0) > 0)
                    ComposeSection(col, ctx, "AI Landmark Detection Confidence",
                        c => ComposeLandmarksTable(c, session));
            }

            if (session.Diagnosis is not null)
            {
                ComposeSection(col, ctx, "Clinical Assessment Summary",
                    c => ComposeDiagnosis(c, session.Diagnosis));

                ComposeSection(col, ctx, "Growth Pattern Assessment",
                    c => ComposeGrowthTendency(c, session));
            }

            if (session.Diagnosis?.BoltonResult is not null)
                ComposeSection(col, ctx, "Bolton Tooth-Size Analysis",
                    c => ComposeBolton(c, session.Diagnosis.BoltonResult));

            if (request.IncludesMeasurements && (session.Measurements?.Count ?? 0) > 0)
                ComposeSection(col, ctx, $"{session.AnalysisType} Quantitative Analysis",
                    c => ComposeMeasurements(c, session.Measurements!, session.AnalysisType));

            if (request.IncludesTreatmentPlan && (session.Diagnosis?.TreatmentPlans?.Count ?? 0) > 0)
                ComposeSection(col, ctx, "Recommended Treatment Plans",
                    c => ComposeTreatmentPlans(c, session.Diagnosis!.TreatmentPlans));

            col.Item().PaddingTop(10).Element(ComposeSignatureArea);
        });
    }

    // ══════════════════════════════════════════════════════════════════════
    // Section wrapper
    // ══════════════════════════════════════════════════════════════════════
    private static void ComposeSection(
        ColumnDescriptor col, ReportContext ctx, string title, Action<IContainer> body)
    {
        int idx = ctx.NextSection();

        col.Item().Column(inner =>
        {
            inner.Item().PaddingBottom(8).Row(row =>
            {
                row.ConstantItem(22).Height(22)
                   .Background(C.NavyDeep).AlignCenter().AlignMiddle()
                   .Text(idx.ToString()).FontSize(8.5f).Bold().FontColor(C.White);

                row.RelativeItem().PaddingLeft(8).Column(tc =>
                {
                    tc.Item().AlignBottom()
                      .Text(title.ToUpperInvariant())
                      .FontSize(9.5f).Bold().FontFamily("Trebuchet MS")
                      .FontColor(C.NavyDeep).LetterSpacing(0.05f);

                    tc.Item().PaddingTop(3).LineHorizontal(1).LineColor(C.BorderLight);
                });
            });

            inner.Item().Element(body);
        });
    }

    // ══════════════════════════════════════════════════════════════════════
    // Patient details
    // ══════════════════════════════════════════════════════════════════════
    private static void ComposePatientDetails(IContainer c, Patient? patient)
    {
        if (patient is null)
        {
            c.Text("No patient record attached.").FontColor(C.SlateLight).Italic();
            return;
        }

        c.Background(C.White).Border(0.5f).BorderColor(C.BorderLight).Padding(16)
         .Table(table =>
         {
             table.ColumnsDefinition(tc =>
             {
                 tc.RelativeColumn(); tc.RelativeColumn();
                 tc.RelativeColumn(); tc.RelativeColumn();
             });

             void Row(string lbl1, string val1, string lbl2, string val2)
             {
                 foreach (var (lbl, val) in new[] { (lbl1, val1), (lbl2, val2) })
                 {
                     table.Cell().PaddingVertical(4).Column(col =>
                     {
                         col.Item().Text(lbl).FontSize(6.5f).Bold().FontColor(C.SlateFaint).LetterSpacing(0.02f);
                         col.Item().Text(val).FontSize(8.5f).FontColor(C.SlateText);
                     });
                 }
             }

             Row("FULL NAME", $"{patient.FirstName} {patient.LastName}",
                 "PATIENT MRN", patient.MedicalRecordNo ?? "PTN-AUTO");

             Row("DATE OF BIRTH", patient.DateOfBirth.ToString("dd MMM yyyy"),
                 "GENDER / SEX", patient.Gender.ToString().ToUpper());

             if (!string.IsNullOrEmpty(patient.ContactNumber))
                 Row("CONTACT CHANNEL", patient.ContactNumber,
                     "REGISTERED AT", patient.CreatedAt.ToString("dd MMM yyyy"));
         });
    }

    // ══════════════════════════════════════════════════════════════════════
    // Images
    // ══════════════════════════════════════════════════════════════════════
    private static void ComposeSideBySideImages(
        IContainer c, AnalysisSession session, byte[] originalBytes, byte[] overlaidBytes)
    {
        c.Column(col =>
        {
            col.Item().Row(row =>
            {
                void ImagePanel(byte[] bytes, string caption)
                    => row.RelativeItem().Column(imgCol =>
                    {
                        imgCol.Item().Border(0.5f).BorderColor(C.BorderLight)
                              .Background(C.White).Image(bytes).FitWidth();

                        imgCol.Item().PaddingTop(4).AlignCenter()
                              .Text(caption).FontSize(8f).Bold().FontColor(C.NavyMid);
                    });

                ImagePanel(originalBytes, "Original Radiograph");
                row.ConstantItem(16);
                ImagePanel(overlaidBytes, "AI Cephalometric Tracing");
            });

            col.Item().PaddingTop(8).AlignRight()
               .Text($"Source: {session.XRayImage?.FileName}  ·  " +
                     $"Pixel spacing: {session.XRayImage?.PixelSpacingMm:F3} mm/px" +
                     (!string.IsNullOrEmpty(session.ResultImageUrl) ? "  ·  Archive Snapshot Used" : ""))
               .FontSize(7.5f).Italic().FontColor(C.SlateLight);
        });
    }

    private static void ComposeXRayImage(
        IContainer c, AnalysisSession session, XRayImage image, byte[] bytes)
    {
        c.Column(col =>
        {
            col.Item().Border(0.5f).BorderColor(C.BorderLight)
               .Background(C.White).Image(bytes).FitWidth();

            col.Item().PaddingTop(5).AlignRight()
               .Text($"Source: {image.FileName}  ·  " +
                     $"Pixel spacing: {image.PixelSpacingMm:F3} mm/px" +
                     (!string.IsNullOrEmpty(session.ResultImageUrl) ? "  ·  Archive Snapshot" : ""))
               .FontSize(7.5f).Italic().FontColor(C.SlateLight);
        });
    }

    // ══════════════════════════════════════════════════════════════════════
    // Landmark confidence table — two-column, sorted by confidence
    // ══════════════════════════════════════════════════════════════════════
    private static void ComposeLandmarksTable(IContainer c, AnalysisSession session)
    {
        var sorted = session.Landmarks.OrderByDescending(l => l.Confidence).ToList();
        var meta = session.LandmarkMeta ?? [];
        int half = (sorted.Count + 1) / 2;

        c.Background(C.White).Border(0.5f).BorderColor(C.BorderLight).Padding(12)
         .Table(table =>
         {
             table.ColumnsDefinition(tc =>
             {
                 tc.ConstantColumn(30); tc.RelativeColumn(); tc.ConstantColumn(40); tc.ConstantColumn(44);
                 tc.ConstantColumn(12); // gutter
                 tc.ConstantColumn(30); tc.RelativeColumn(); tc.ConstantColumn(40); tc.ConstantColumn(44);
             });

             void HCell(string txt) => table.Cell()
                  .PaddingBottom(4).BorderBottom(0.75f).BorderColor(C.BorderLight)
                  .Text(txt).Bold().FontSize(7.5f).FontColor(C.NavyDeep);

             HCell("Code"); HCell("Landmark"); HCell("Conf."); HCell("Err (mm)");
             table.Cell();
             HCell("Code"); HCell("Landmark"); HCell("Conf."); HCell("Err (mm)");

             void LandmarkCells(Landmark l, LandmarkMeta? m)
             {
                 string cc = (l.Confidence ?? 0m) > 0.85m ? C.AccentGreen
                           : (l.Confidence ?? 0m) > 0.65m ? C.AccentAmber
                           : C.AccentRed;

                 table.Cell().PaddingVertical(2.5f).Text(l.LandmarkCode).FontSize(7.5f).Bold().FontColor(C.NavyMid);
                 table.Cell().PaddingVertical(2.5f).Text(l.LandmarkName).FontSize(7.5f);
                 table.Cell().PaddingVertical(2.5f).AlignRight()
                      .Text($"{l.Confidence:P0}").FontSize(7.5f).FontColor(cc).Bold();
                 table.Cell().PaddingVertical(2.5f).AlignRight()
                      .Text(m is not null ? $"±{m.ExpectedErrorMm:F1}" : "—")
                      .FontSize(7.5f).FontColor(C.SlateLight);
             }

             void EmptyCells()
             {
                 table.Cell(); table.Cell(); table.Cell(); table.Cell();
             }

             for (int i = 0; i < half; i++)
             {
                 var l1 = sorted[i];
                 meta.TryGetValue(l1.LandmarkCode, out var m1);
                 LandmarkCells(l1, m1);

                 table.Cell(); // gutter

                 int j = i + half;
                 if (j < sorted.Count)
                 {
                     var l2 = sorted[j];
                     meta.TryGetValue(l2.LandmarkCode, out var m2);
                     LandmarkCells(l2, m2);
                 }
                 else
                 {
                     EmptyCells();
                 }
             }
         });
    }

    // ══════════════════════════════════════════════════════════════════════
    // Clinical diagnosis summary
    // ══════════════════════════════════════════════════════════════════════
    private static void ComposeDiagnosis(IContainer c, Diagnosis diagnosis)
    {
        c.Column(outer =>
        {
            outer.Spacing(10);

            outer.Item().Row(row =>
            {
                row.RelativeItem().Background(C.NavyLight)
                   .Border(0.5f).BorderColor(C.BorderLight)
                   .Padding(12).Column(card =>
                   {
                       card.Item().Text("SKELETAL CLASS")
                            .FontSize(7).Bold().FontColor(C.SlateLight).LetterSpacing(0.06f);

                       card.Item().PaddingTop(4).Row(r =>
                       {
                           r.RelativeItem().Text(diagnosis.SkeletalClass.ToString())
                            .FontSize(14).Bold().FontColor(C.NavyDeep);

                           if (diagnosis.SkeletalBorderline)
                               r.AutoItem().AlignBottom().PaddingLeft(6).PaddingBottom(2)
                                .Background(C.AccentAmber).Padding(2)
                                .Text("BORDERLINE").FontSize(6.5f).Bold().FontColor(C.White);
                       });

                       if (diagnosis.SkeletalDifferential is not null)
                       {
                           card.Item().PaddingTop(8)
                                .Text("Differential Probability")
                                .FontSize(7.5f).Bold().FontColor(C.SlateLight);

                           card.Item().PaddingTop(3).Table(dt =>
                           {
                               dt.ColumnsDefinition(tc =>
                               {
                                   foreach (var _ in diagnosis.SkeletalDifferential)
                                       tc.RelativeColumn();
                               });

                               foreach (var (cls, prob) in diagnosis.SkeletalDifferential)
                                   dt.Cell()
                                     .Background(prob > 0.50 ? C.NavyMid : C.White)
                                     .Border(0.5f).BorderColor(C.BorderLight)
                                     .Padding(4).AlignCenter()
                                     .Text(cls).FontSize(7.5f).Bold()
                                     .FontColor(prob > 0.50 ? C.White : C.SlateText);

                               foreach (var (_, prob) in diagnosis.SkeletalDifferential)
                                   dt.Cell()
                                     .Background(prob > 0.50 ? C.NavyLight : C.White)
                                     .Border(0.5f).BorderColor(C.BorderLight)
                                     .Padding(4).AlignCenter()
                                     .Text($"{prob:P0}").FontSize(7.5f).FontColor(C.SlateText);
                           });
                       }
                   });

                row.ConstantItem(10);

                row.RelativeItem().Background(C.White)
                   .Border(0.5f).BorderColor(C.BorderLight)
                   .Padding(12).Column(card =>
                   {
                       void MetaRow(string lbl, string val)
                       {
                           card.Item().PaddingBottom(5).Row(r =>
                           {
                               r.ConstantItem(110).Text(lbl).Bold().FontSize(7.5f).FontColor(C.SlateLight);
                               r.RelativeItem().Text(val).FontSize(8.5f).FontColor(C.SlateText);
                           });
                       }

                       MetaRow("Vertical Pattern", diagnosis.VerticalPattern.ToString());
                       MetaRow("Soft Tissue Profile",
                           diagnosis.SoftTissueProfile == SoftTissueProfile.Unknown
                               ? "Not assessed"
                               : diagnosis.SoftTissueProfile.ToString());

                       string anbLabel = diagnosis.AnbRotationCorrected
                           ? $"{diagnosis.AnbUsed:F1}°  (Järvinen corrected)"
                           : $"{diagnosis.AnbUsed:F1}°";
                       MetaRow("ANB Angle Used", anbLabel);

                       if (!string.IsNullOrEmpty(diagnosis.OdiNote))
                           card.Item().PaddingTop(6)
                                .Background(C.NavyFaint).Padding(6)
                                .Text(diagnosis.OdiNote)
                                .FontSize(7.5f).Italic().FontColor(C.AccentAmber);
                   });
            });

            if (!string.IsNullOrEmpty(diagnosis.SummaryText))
                outer.Item()
                     .Background(C.White)
                     .BorderLeft(3).BorderColor(C.AccentTeal)
                     .Border(0.5f).BorderColor(C.BorderLight)
                     .PaddingHorizontal(14).PaddingVertical(10)
                     .Text(diagnosis.SummaryText)
                     .FontSize(8.5f).LineHeight(1.6f);
        });
    }

    // ══════════════════════════════════════════════════════════════════════
    // Growth tendency
    // ══════════════════════════════════════════════════════════════════════
    private static void ComposeGrowthTendency(IContainer c, AnalysisSession session)
    {
        var jMeas = session.Measurements?.FirstOrDefault(m => m.MeasurementCode == "JRatio");
        var upperGonial = session.Measurements?.FirstOrDefault(m => m.MeasurementCode == "UpperGonial");
        var lowerGonial = session.Measurements?.FirstOrDefault(m => m.MeasurementCode == "LowerGonial");

        if (jMeas is null && upperGonial is null) return;

        c.Background(C.White).Border(0.5f).BorderColor(C.BorderLight).Padding(12).Column(col =>
        {
            col.Spacing(8);

            col.Item().Text("Björk 1969  /  Jarabak Ratio Analysis")
                 .FontSize(8).Bold().FontColor(C.AccentTeal).Italic();

            string tendency = session.Diagnosis?.GrowthTendency ?? string.Empty;
            if (!string.IsNullOrEmpty(tendency))
                col.Item().Text(tendency).FontSize(8.5f).LineHeight(1.5f);

            col.Item().Row(row =>
            {
                row.RelativeItem(3).Column(tCol =>
                {
                    tCol.Item().Table(table =>
                    {
                        table.ColumnsDefinition(tc =>
                        {
                            tc.RelativeColumn(3f); tc.RelativeColumn(1.2f);
                            tc.RelativeColumn(1.5f); tc.RelativeColumn(2.5f);
                        });

                        void HCell(string t) => table.Cell()
                             .PaddingBottom(4).BorderBottom(0.75f).BorderColor(C.BorderLight)
                             .Text(t).Bold().FontSize(7.5f).FontColor(C.NavyDeep);

                        HCell("Indicator"); HCell("Value"); HCell("Norm"); HCell("Interpretation");

                        void DataRow(string name, decimal? val, string norm, string interp, bool alert = false)
                        {
                            table.Cell().PaddingVertical(3).Text(name).FontSize(8);
                            table.Cell().PaddingVertical(3).AlignRight()
                                 .Text(val.HasValue ? $"{val:F1}" : "—").FontSize(8).Bold()
                                 .FontColor(alert ? C.AccentAmber : C.SlateText);
                            table.Cell().PaddingVertical(3).AlignCenter()
                                 .Text(norm).FontSize(7.5f).FontColor(C.SlateFaint);
                            table.Cell().PaddingVertical(3)
                                 .Text(interp).FontSize(7.5f).Italic()
                                 .FontColor(alert ? C.AccentAmber : C.SlateLight);
                        }

                        DataRow("Jarabak Ratio", jMeas?.Value, "62–65 %",
                            jMeas?.Value > 65 ? "Horizontal" : jMeas?.Value < 59 ? "Vertical" : "Neutral",
                            alert: jMeas?.Value > 65 || jMeas?.Value < 59);

                        DataRow("Upper Gonial", upperGonial?.Value, "52–58°",
                            upperGonial?.Value > 58 ? "Post. incl." : upperGonial?.Value < 52 ? "Ant. incl." : "Normal",
                            alert: upperGonial?.Value > 58 || upperGonial?.Value < 52);

                        DataRow("Lower Gonial", lowerGonial?.Value, "70–75°",
                            lowerGonial?.Value > 75 ? "Open" : lowerGonial?.Value < 70 ? "Closed" : "Normal",
                            alert: lowerGonial?.Value > 75 || lowerGonial?.Value < 70);
                    });
                });

                row.ConstantItem(15);

                row.RelativeItem(2).Column(wCol =>
                {
                    wCol.Item().PaddingBottom(6).AlignCenter()
                         .Text("BJÖRK-SKIELLER WIGGLE CHART")
                         .FontSize(7).Bold().FontColor(C.SlateLight);

                    wCol.Item().Element(cont => ComposeWiggleChart(cont, session));
                });
            });
        });
    }

    private static void ComposeWiggleChart(IContainer c, AnalysisSession session)
    {
        string[] codes = ["SaddleAngle", "ArticularAngle", "GonialAngle", "BJORK_SUM", "UpperGonial", "LowerGonial", "SN-GoGn"];
        var measMap = session.Measurements?.ToDictionary(m => m.MeasurementCode, m => m)
                     ?? new Dictionary<string, Measurement>();

        c.Table(table =>
        {
            table.ColumnsDefinition(tc => { tc.ConstantColumn(60); tc.RelativeColumn(); });

            foreach (string code in codes)
            {
                table.Cell().PaddingVertical(2)
                     .Text(code == "BJORK_SUM" ? "Sum of ∠" : code)
                     .FontSize(6.5f).FontColor(C.SlateLight);

                if (measMap.TryGetValue(code, out var m))
                {
                    // Use SD table for midpoint when NormalMin/NormalMax are absent
                    float mid = MeasurementSDs.TryGetValue(code, out var sdVal)
                        ? sdVal.Mean
                        : (float)((m.NormalMin + m.NormalMax) / 2m);

                    float dev = (float)m.Value - mid;
                    table.Cell().PaddingVertical(2).Element(cell => DrawDeviationBar(cell, m, dev));
                }
                else
                {
                    table.Cell().PaddingVertical(2).Text("—").FontSize(6.5f).AlignCenter();
                }
            }
        });
    }

    // ══════════════════════════════════════════════════════════════════════
    // Bolton discrepancy
    // ══════════════════════════════════════════════════════════════════════
    private static void ComposeBolton(IContainer c, BoltonResult bolton)
    {
        c.Background(C.White).Border(0.5f).BorderColor(C.BorderLight).Padding(12).Column(col =>
        {
            col.Spacing(8);

            col.Item().Text("Bolton (1962) Tooth-Size Discrepancy")
                 .FontSize(8).Bold().FontColor(C.NavyMid).Italic();

            col.Item().Table(table =>
            {
                table.ColumnsDefinition(tc =>
                {
                    tc.RelativeColumn(2.5f); tc.RelativeColumn();
                    tc.RelativeColumn(1.8f); tc.RelativeColumn(2f);
                });

                void HCell(string t) => table.Cell()
                     .PaddingBottom(4).BorderBottom(0.75f).BorderColor(C.BorderLight)
                     .Text(t).Bold().FontSize(7.5f).FontColor(C.NavyDeep);

                HCell("Ratio"); HCell("Value"); HCell("Norm ± SD"); HCell("Finding");

                void BoltonRow(string label, decimal? val, string norm, string? finding)
                {
                    bool isNormal = finding?.Contains("Normal", StringComparison.OrdinalIgnoreCase) ?? false;

                    table.Cell().PaddingVertical(3).Text(label).FontSize(8);
                    table.Cell().PaddingVertical(3).AlignRight()
                         .Text(val.HasValue ? $"{val:F1}%" : "—").FontSize(8).Bold();
                    table.Cell().PaddingVertical(3).AlignCenter()
                         .Text(norm).FontSize(7.5f).FontColor(C.SlateFaint);
                    table.Cell().PaddingVertical(3)
                         .Text(finding ?? "—").FontSize(8)
                         .FontColor(isNormal ? C.AccentGreen : C.AccentAmber);
                }

                BoltonRow("Anterior ratio (6/6)", bolton.AnteriorRatio, "77.2 ± 1.65%", bolton.AnteriorFinding);
                BoltonRow("Overall ratio (12/12)", bolton.OverallRatio, "91.3 ± 1.91%", bolton.OverallFinding);
            });

            col.Item().PaddingTop(2).Background(C.NavyFaint).Padding(6)
                 .Text("Clinical note: Mandibular excess → consider maxillary expansion or mandibular IPR. " +
                       "Maxillary excess → consider maxillary IPR or mandibular prosthetic buildup.")
                 .FontSize(7.5f).Italic().FontColor(C.SlateLight);
        });
    }

    // ══════════════════════════════════════════════════════════════════════
    // Measurements table
    // ══════════════════════════════════════════════════════════════════════
    private static void ComposeMeasurements(
        IContainer c, IEnumerable<Measurement> measurements, AnalysisType priority)
    {
        c.Column(col =>
        {
            col.Spacing(16);

            var grouped = measurements
                .GroupBy(m => m.Category)
                .OrderBy(g => g.Key == priority ? 0 : 1)
                .ThenBy(g => g.Key?.ToString() ?? "Standard");

            foreach (var group in grouped)
            {
                string catName = group.Key?.ToString() ?? "Standard";
                bool isPrimary = group.Key == priority;
                CategoryReferences.TryGetValue(catName, out string? catRef);

                col.Item().Column(catCol =>
                {
                    catCol.Item().PaddingBottom(5).Row(r =>
                    {
                        r.AutoItem().PaddingRight(8)
                         .Text(catName.ToUpperInvariant() + " ANALYSIS")
                         .FontSize(8.5f).Bold().FontFamily("Trebuchet MS")
                         .FontColor(isPrimary ? C.BrandPrimary : C.NavyMid)
                         .LetterSpacing(0.04f);

                        if (isPrimary)
                            r.AutoItem().Background(C.BrandPrimary + "15")
                             .PaddingHorizontal(6).PaddingVertical(1)
                             .Text("SELECTED PROTOCOL").FontSize(6.5f).Bold().FontColor(C.BrandPrimary);
                    });

                    catCol.Item().Table(table =>
                    {
                        table.ColumnsDefinition(tc =>
                        {
                            tc.RelativeColumn(3.2f); tc.RelativeColumn(1.4f); tc.RelativeColumn(2.4f);
                            tc.RelativeColumn(2.6f); tc.RelativeColumn(1.4f); tc.RelativeColumn(1.4f);
                            tc.RelativeColumn(1.4f);
                        });

                        table.Header(h =>
                        {
                            void HCell(string t) => h.Cell()
                                 .Background(C.NavyDeep).PaddingHorizontal(4).PaddingVertical(5)
                                 .Text(t).Bold().FontSize(7.5f).FontColor(C.White);

                            HCell("Measurement"); HCell("Value"); HCell("Normative");
                            HCell("Deviation"); HCell("Status"); HCell("Severity"); HCell("±Error");
                        });

                        int rowIdx = 0;
                        foreach (var m in group.OrderBy(m => m.MeasurementName))
                        {
                            string rowBg = rowIdx++ % 2 == 0 ? C.White : C.NavyFaint;

                            string unitSuffix = m.Unit switch
                            {
                                MeasurementUnit.Degrees => "°",
                                MeasurementUnit.Percent => "%",
                                _ => " mm",
                            };

                            float mid = MeasurementSDs.TryGetValue(m.MeasurementCode, out var sdRef)
                                ? sdRef.Mean
                                : (float)((m.NormalMin + m.NormalMax) / 2m);
                            float deviation = (float)m.Value - mid;

                            string severity = ComputeSeverity(m);
                            string statusClr = GetStatusColor(m.Status);
                            string severityClr = severity == "Normal" ? C.AccentGreen
                                               : severity == "1 SD" ? C.AccentAmber
                                               : C.AccentRed;

                            void DataCell(Action<IContainer> content)
                                => table.Cell().Background(rowBg).PaddingHorizontal(4).PaddingVertical(3).Element(content);

                            DataCell(cell => cell.Text(m.MeasurementName).FontSize(8));

                            DataCell(cell => cell.AlignRight()
                                 .Text($"{m.Value:F1}{unitSuffix}")
                                 .FontSize(8).Bold().FontColor(C.SlateText));

                            DataCell(cell => cell.AlignCenter().Column(inner =>
                            {
                                if (MeasurementSDs.TryGetValue(m.MeasurementCode, out var sd))
                                {
                                    inner.Item().Text($"{sd.Mean:F1} ± {sd.SD:F1}").FontSize(7.5f).Bold();
                                    inner.Item().Text($"[{m.NormalMin:F1} – {m.NormalMax:F1}]")
                                         .FontSize(6.5f).FontColor(C.SlateFaint);
                                }
                                else
                                {
                                    inner.Item().Text($"{m.NormalMin:F1} – {m.NormalMax:F1}").FontSize(7.5f);
                                }
                            }));

                            DataCell(cell => DrawDeviationBar(cell, m, deviation));

                            DataCell(cell => cell.AlignCenter()
                                 .Text(m.Status.ToString()).FontSize(7.5f).Bold().FontColor(statusClr));

                            DataCell(cell => cell.AlignCenter()
                                 .Text(severity).FontSize(7.5f).Bold().FontColor(severityClr));

                            DataCell(cell => cell.AlignCenter()
                                 .Text(m.ExpectedError.HasValue
                                     ? $"±{m.ExpectedError.Value:F1}{unitSuffix}" : "—")
                                 .FontSize(7f).FontColor(C.SlateFaint));
                        }
                    });

                    if (catRef is not null)
                        catCol.Item().PaddingTop(4).PaddingLeft(2)
                               .Text($"Ref: {catRef}")
                               .FontSize(6.5f).Italic().FontColor(C.SlateFaint);
                });
            }
        });
    }

    // ── Inline deviation bar ──────────────────────────────────────────────
    private static void DrawDeviationBar(IContainer cell, Measurement m, float deviation)
    {
        float maxDev = MeasurementSDs.TryGetValue(m.MeasurementCode, out var sdVal)
            ? sdVal.SD * 2.5f : 10f;

        if (maxDev <= 0f) maxDev = 1f;

        float barFrac = Math.Clamp(Math.Abs(deviation) / maxDev, 0f, 1f);
        string barColor = GetStatusColor(m.Status);
        const float eps = 0.001f;

        cell.Height(10).Width(50).PaddingVertical(3).Layers(layers =>
        {
            layers.Layer().AlignCenter().Width(1).Background(C.BorderStrong);

            layers.PrimaryLayer().Row(row =>
            {
                if (deviation < 0)
                {
                    row.RelativeItem(Math.Max(eps, 50f * (1f - barFrac)));
                    row.RelativeItem(Math.Max(eps, 50f * barFrac)).Background(barColor);
                    row.RelativeItem(Math.Max(eps, 50f));                   // neutral right half
                }
                else
                {
                    row.RelativeItem(Math.Max(eps, 50f));                   // neutral left half
                    row.RelativeItem(Math.Max(eps, 50f * barFrac)).Background(barColor);
                    row.RelativeItem(Math.Max(eps, 50f * (1f - barFrac)));
                }
            });
        });
    }

    // ══════════════════════════════════════════════════════════════════════
    // Treatment plans
    // ══════════════════════════════════════════════════════════════════════
    private static void ComposeTreatmentPlans(IContainer c, IEnumerable<TreatmentPlan> plans)
    {
        c.Column(col =>
        {
            col.Spacing(10);

            foreach (var plan in plans.OrderBy(p => p.PlanIndex))
            {
                bool primary = plan.IsPrimary;

                col.Item()
                   .Background(C.White)
                   .Border(0.5f).BorderColor(primary ? C.NavyMid : C.BorderLight)
                   .BorderLeft(primary ? 4f : 1.5f).BorderColor(primary ? C.NavyDeep : C.BorderStrong)
                   .PaddingHorizontal(12).PaddingVertical(10)
                   .Column(pCol =>
                   {
                       pCol.Item().Row(r =>
                       {
                           r.RelativeItem().Text(plan.TreatmentName)
                            .FontSize(9.5f).Bold().FontColor(C.NavyDeep);

                           if (primary)
                               r.AutoItem().AlignBottom().PaddingLeft(8)
                                .Background(C.AccentGold).Padding(3)
                                .Text("PRIMARY").FontSize(6.5f).Bold().FontColor(C.White);
                       });

                       pCol.Item().PaddingTop(5)
                            .Text(plan.Description)
                            .LineHeight(1.5f).FontSize(8.5f).FontColor(C.SlateText);

                       if (!string.IsNullOrEmpty(plan.Rationale))
                           pCol.Item().PaddingTop(5).Row(r =>
                           {
                               r.ConstantItem(56).Text("Rationale").FontSize(7.5f).Bold().FontColor(C.SlateLight);
                               r.RelativeItem().Text(plan.Rationale).FontSize(7.5f).Italic().FontColor(C.SlateLight);
                           });

                       if (!string.IsNullOrEmpty(plan.EvidenceReference))
                           pCol.Item().PaddingTop(3)
                                .Text($"Ref: {plan.EvidenceReference}")
                                .FontSize(6.5f).Italic().FontColor(C.SlateFaint);
                   });
            }
        });
    }

    // ══════════════════════════════════════════════════════════════════════
    // Footer
    // ══════════════════════════════════════════════════════════════════════
    private static void ComposeFooter(IContainer c, bool isDraft)
    {
        c.Background(C.NavyDeep).PaddingHorizontal(22).PaddingVertical(7).Row(row =>
        {
            row.RelativeItem().Column(inner =>
            {
                inner.Item().Text("CephAI Advanced Imaging — Cephalometric Analysis Report")
                     .FontSize(7.5f).FontColor(C.SlateFaint);

                if (isDraft)
                    inner.Item().Text("⚠  DRAFT DOCUMENT — NOT FOR CLINICAL USE")
                         .FontSize(7.5f).Bold().FontColor(C.AccentAmber);
            });

            row.ConstantItem(90).AlignRight().Column(inner =>
            {
                inner.Item().AlignRight().Text(text =>
                {
                    text.DefaultTextStyle(x => x.FontSize(7.5f).FontColor(C.SlateFaint));
                    text.Span("Page ");
                    text.CurrentPageNumber().Bold().FontColor(C.White);
                    text.Span(" of ");
                    text.TotalPages();
                });
            });
        });
    }

    // ══════════════════════════════════════════════════════════════════════
    // Signature area
    // ══════════════════════════════════════════════════════════════════════
    private static void ComposeSignatureArea(IContainer c)
    {
        c.Row(row =>
        {
            row.RelativeItem();

            row.ConstantItem(240).Background(C.White)
               .Border(0.5f).BorderColor(C.BorderLight)
               .Padding(14).Column(col =>
               {
                   col.Item().Text("Authorised Clinician")
                        .FontSize(7.5f).Bold().FontColor(C.SlateLight).LetterSpacing(0.04f);

                   col.Item().PaddingTop(28).LineHorizontal(0.75f).LineColor(C.BorderStrong);

                   col.Item().PaddingTop(4).Row(r =>
                   {
                       r.RelativeItem().Text("Signature / Stamp").FontSize(7.5f).FontColor(C.SlateFaint);
                       r.RelativeItem().AlignRight()
                        .Text($"Date:  {DateTime.Now:dd MMM yyyy}").FontSize(7.5f).FontColor(C.SlateFaint);
                   });

                   col.Item().PaddingTop(6)
                        .Text("CephAI Advanced Imaging Center")
                        .FontSize(7.5f).FontColor(C.SlateLight);
               });
        });
    }

    // ══════════════════════════════════════════════════════════════════════
    // Helpers
    // ══════════════════════════════════════════════════════════════════════
    private static string ComputeSeverity(Measurement m)
    {
        if (!MeasurementSDs.TryGetValue(m.MeasurementCode, out var sd))
            return m.Severity.ToString();

        float dev = Math.Abs((float)m.Value - sd.Mean);
        return dev <= sd.SD ? "Normal"
             : dev <= sd.SD * 2f ? "1 SD"
             : dev <= sd.SD * 3f ? "2 SD"
             : ">2 SD";
    }

    private static string GetStatusColor(MeasurementStatus status) => status switch
    {
        MeasurementStatus.Normal => C.AccentGreen,
        MeasurementStatus.Increased => C.AccentAmber,
        MeasurementStatus.Decreased => C.AccentRed,
        _ => C.SlateText,
    };
}