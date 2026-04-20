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
using System.Linq;

namespace CephAnalysis.Infrastructure.Services;

/// <summary>
/// Professional PDF report generator with refined clinical design:
/// - Structured header with facility branding strip and confidence indicator
/// - Elevated color system: deep navy (#0D1F3C) primary, slate accents, minimal red/amber alerts
/// - Compact yet readable typography: 8.5 pt body, 11/13/16 pt heading scale
/// - Section dividers with icon-style numbered badges
/// - SD-based severity column (Normal / 1 SD / 2 SD / >2 SD)
/// - Inline horizontal deviation bar per measurement
/// - Borderline skeletal differential probability table
/// - Separated growth tendency section (Björk + JRatio)
/// - Bolton discrepancy block when available
/// - Expected measurement error (uncertainty) column
/// - Full landmark confidence table (two-column, sorted by confidence)
/// - Evidence / reference footnotes per analysis category
/// - Watermark strip for draft sessions
/// - Two-column measurement layout for dense A4 usage
/// </summary>
public class QuestPdfReportGenerator(
    IStorageService storage,
    IImageOverlayService imageOverlayService,
    ILogger<QuestPdfReportGenerator> logger) : IReportGenerator
{
    private readonly IStorageService _storage = storage;
    private readonly IImageOverlayService _imageOverlayService = imageOverlayService;
    private readonly ILogger<QuestPdfReportGenerator> _logger = logger;

    // ── Design tokens ─────────────────────────────────────────────────────
    // Primary palette — deep navy clinical theme
    private static class Colors2
    {
        public const string NavyDeep = "#0A1A2F";   // ultra-dark clinical navy
        public const string NavyMid = "#162B45";    // deep mid-tone
        public const string NavyLight = "#F0F4F9";  // light tinted background
        public const string NavyFaint = "#F8FAFC";  // ultra-light surface

        public const string SlateText = "#1E293B";  // dark slate body
        public const string SlateLight = "#64748B"; // slate secondary
        public const string SlateFaint = "#94A3B8"; // muted slate

        public const string BrandPrimary = "#6366F1"; // vibrant indigo accent
        public const string BrandSecondary = "#A855F7"; // purple accent

        public const string AccentTeal = "#0D9488";   // information
        public const string AccentGreen = "#10B981";  // normal
        public const string AccentAmber = "#F59E0B";  // warning
        public const string AccentRed = "#EF4444";    // critical
        public const string AccentGold = "#D97706";   // highlighted items

        public const string BorderLight = "#E2E8F0";  // subtle borders
        public const string BorderStrong = "#CBD5E1"; // pronounced dividers

        public const string White = "#FFFFFF";
        public const string PageBg = "#F8FAFC";
    }

    // ── Category evidence references ─────────────────────────────────────
    private static readonly Dictionary<string, string> CategoryReferences = new()
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
    private static readonly Dictionary<string, (float Mean, float SD)> MeasurementSDs = new()
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

    // ── Section counter for numbered badges ───────────────────────────────
    private static int _sectionIndex = 0;

    // ══════════════════════════════════════════════════════════════════════
    // Entry point
    // ══════════════════════════════════════════════════════════════════════
    public async Task<byte[]> GeneratePdfReportAsync(
        AnalysisSession session,
        GenerateReportRequest request,
        CancellationToken ct)
    {
        bool isDraft = session.Status != SessionStatus.Finalized
                    && session.Status != SessionStatus.Completed;

        _sectionIndex = 0; // reset per document

        // ── Pre-fetch images ──────────────────────────────────────────────
        byte[]? originalXrayBytes = null;
        byte[]? overlaidXrayBytes = null;

        if (request.IncludesXray && session.XRayImage != null)
        {
            try
            {
                // Always fetch the original X-ray if IncludesXray is true
                using var stream = await _storage.DownloadFileAsync(session.XRayImage.StorageUrl, ct);
                using var ms = new MemoryStream();
                await stream.CopyToAsync(ms, ct);
                originalXrayBytes = ms.ToArray();

                if (request.IncludesLandmarkOverlay)
                {
                    Stream? imageStream = null;
                    if (!string.IsNullOrEmpty(session.ResultImageUrl))
                    {
                        try { imageStream = await _storage.DownloadFileAsync(session.ResultImageUrl, ct); }
                        catch (Exception ex)
                        {
                            _logger.LogWarning(ex, "Snapshot download failed — falling back to dynamic generation.");
                        }
                    }

                    if (imageStream == null)
                    {
                        using var baseStream = new MemoryStream(originalXrayBytes);
                        imageStream = await _imageOverlayService.GenerateOverlaidImageAsync(baseStream, session, ct);
                    }

                    using (imageStream)
                    using (var msOverlay = new MemoryStream())
                    {
                        await imageStream.CopyToAsync(msOverlay, ct);
                        overlaidXrayBytes = msOverlay.ToArray();
                    }
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Image pre-fetch failed for session {SessionId}", session.Id);
            }
        }

        var document = Document.Create(container =>
        {
            container.Page(page =>
            {
                page.Size(PageSizes.A4);
                page.Margin(0, Unit.Centimetre);          // margins handled per-zone
                page.PageColor(Colors2.PageBg);
                page.DefaultTextStyle(x =>
                    x.FontSize(8.5f)
                     .FontFamily("Georgia")               // elegant serif for body
                     .FontColor(Colors2.SlateText));

                page.Header().Element(c => ComposeHeader(c, session, isDraft));
                page.Content().Element(c => ComposeContent(c, session, request, originalXrayBytes, overlaidXrayBytes));
                page.Footer().Element(c => ComposeFooter(c, isDraft));
            });
        });

        using var pdfStream = new MemoryStream();
        document.GeneratePdf(pdfStream);
        return await Task.FromResult(pdfStream.ToArray());
    }

    // ══════════════════════════════════════════════════════════════════════
    // Header — full-width navy branding bar + patient meta strip
    // ══════════════════════════════════════════════════════════════════════
    private static void ComposeHeader(IContainer container, AnalysisSession session, bool isDraft)
    {
        container.Column(col =>
        {
            // ── Dynamic Branding Strip ───────────────────────────────────
            col.Item()
               .Background(Colors2.NavyDeep)
               .PaddingHorizontal(24).PaddingVertical(16)
               .Row(row =>
               {
                   // Wordmark + Analysis Focus
                   row.RelativeItem().Column(inner =>
                   {
                       inner.Item().Text("CephAI")
                            .FontSize(20).Bold()
                            .FontFamily("Trebuchet MS")
                            .FontColor(Colors2.White);

                       inner.Item().PaddingTop(2)
                            .Text($"{session.AnalysisType} Precision Analysis")
                            .FontSize(8).SemiBold()
                            .FontColor(Colors2.BrandPrimary)
                            .LetterSpacing(0.04f);
                   });

                   // Clinical Badge
                   row.RelativeItem(2).AlignCenter().Column(inner =>
                   {
                       inner.Item().AlignCenter()
                            .Text("CLINICAL DIAGNOSTIC REPORT")
                            .FontSize(11).Bold()
                            .FontFamily("Trebuchet MS")
                            .LetterSpacing(0.1f)
                            .FontColor(Colors2.White);

                       if (isDraft)
                       {
                           inner.Item().AlignCenter().PaddingTop(5)
                                .Border(0.5f).BorderColor(Colors2.AccentAmber)
                                .PaddingHorizontal(6).PaddingVertical(2)
                                .Text("DRAFT — PRELIMINARY DATA")
                                .FontSize(7).Bold()
                                .FontColor(Colors2.AccentAmber);
                       }
                   });

                   // Right: metadata
                   row.RelativeItem().AlignRight().Column(inner =>
                   {
                       inner.Item().AlignRight()
                             .Text($"Ref: {session.Id.ToString().ToUpper()[..8]}")
                            .FontSize(8.5f).Bold().FontColor(Colors2.SlateFaint);

                       inner.Item().AlignRight().PaddingTop(2)
                            .Text(DateTime.UtcNow.ToString("dd MMM yyyy • HH:mm UTC"))
                            .FontSize(7.5f).FontColor(Colors2.SlateFaint);

                       // Confidence badge
                       var score = session.Diagnosis?.ConfidenceScore ?? 0m;
                       string badgeColor = score > 0.80m ? Colors2.AccentGreen
                                         : score > 0.50m ? Colors2.AccentAmber
                                         : Colors2.AccentRed;

                       inner.Item().AlignRight().PaddingTop(5)
                            .Background(badgeColor)
                            .Padding(3)
                            .Text($"AI Confidence  {score:P0}")
                            .FontSize(7.5f).Bold()
                            .FontColor(Colors2.White);
                   });
               });

            // ── Patient Quick-Strip ──────────────────────────────────────
            col.Item()
               .Background(Colors2.NavyMid)
               .PaddingHorizontal(24).PaddingVertical(6)
               .Row(row =>
               {
                   void Meta(string label, string val) => row.AutoItem().PaddingRight(20).Row(r =>
                   {
                       r.AutoItem().Text(label + ": ").FontSize(7).FontColor(Colors2.SlateFaint);
                       r.AutoItem().Text(val).FontSize(7.5f).Bold().FontColor(Colors2.White);
                   });

                   Meta("PATIENT", $"{session.XRayImage?.Study?.Patient?.FirstName} {session.XRayImage?.Study?.Patient?.LastName}");
                   Meta("ID", session.XRayImage?.Study?.Patient?.MedicalRecordNo ?? "—");
                   Meta("SYSTEM", session.ModelVersion ?? "v2.4-Hybrid");
               });
        });
    }

    // ══════════════════════════════════════════════════════════════════════
    // Content orchestration
    // ══════════════════════════════════════════════════════════════════════
    private static void ComposeContent(
        IContainer container,
        AnalysisSession session,
        GenerateReportRequest request,
        byte[]? originalXrayBytes,
        byte[]? overlaidXrayBytes)
    {
        container.PaddingHorizontal(22).PaddingVertical(16).Column(col =>
        {
            col.Spacing(20);

            // 1. Patient information
            ComposeSection(col, "Patient Information",
                c => ComposePatientDetails(c, session.XRayImage?.Study?.Patient));

            // 2. X-ray image (Side-by-side or single)
            if (request.IncludesXray && originalXrayBytes != null)
            {
                if (request.IncludesLandmarkOverlay && overlaidXrayBytes != null)
                {
                    ComposeSection(col, "Cephalometric Tracing Overlay",
                        c => ComposeSideBySideImages(c, session, originalXrayBytes, overlaidXrayBytes));
                }
                else
                {
                    ComposeSection(col, "X-Ray Record",
                        c => ComposeXRayImage(c, session, session.XRayImage!, originalXrayBytes));
                }

                if (request.IncludesLandmarkOverlay && (session.Landmarks?.Count ?? 0) > 0)
                {
                    ComposeSection(col, "AI Landmark Detection Confidence",
                        c => ComposeLandmarksTable(c, session));
                }
            }

            // 3. Clinical assessment summary
            if (session.Diagnosis != null)
                ComposeSection(col, "Clinical Assessment Summary",
                    c => ComposeDiagnosis(c, session.Diagnosis));

            // 4. Growth tendency
            if (session.Diagnosis != null)
                ComposeSection(col, "Growth Pattern Assessment",
                    c => ComposeGrowthTendency(c, session));

            // 5. Bolton discrepancy
            if (session.Diagnosis?.BoltonResult != null)
                ComposeSection(col, "Bolton Tooth-Size Analysis",
                    c => ComposeBolton(c, session.Diagnosis.BoltonResult));

            if (request.IncludesMeasurements && (session.Measurements?.Count ?? 0) > 0)
                ComposeSection(col, $"{session.AnalysisType} Quantitative Analysis",
                    c => ComposeMeasurements(c, session.Measurements!, session.AnalysisType));

            // 7. Treatment plans
            if (request.IncludesTreatmentPlan && (session.Diagnosis?.TreatmentPlans?.Count ?? 0) > 0)
                ComposeSection(col, "Recommended Treatment Plans",
                    c => ComposeTreatmentPlans(c, session.Diagnosis!.TreatmentPlans));

            // 8. Signature
            col.Item().PaddingTop(10).Element(c => ComposeSignatureArea(c));
        });
    }

    // ══════════════════════════════════════════════════════════════════════
    // Section wrapper — numbered badge + rule heading
    // ══════════════════════════════════════════════════════════════════════
    private static void ComposeSection(
        ColumnDescriptor col,
        string title,
        Action<IContainer> body)
    {
        int idx = ++_sectionIndex;

        col.Item().Column(inner =>
        {
            // Section heading row
            inner.Item().PaddingBottom(8).Row(row =>
            {
                // Numbered badge
                row.ConstantItem(22).Height(22)
                   .Background(Colors2.NavyDeep)
                   .AlignCenter().AlignMiddle()
                   .Text(idx.ToString())
                   .FontSize(8.5f).Bold()
                   .FontColor(Colors2.White);

                // Title + rule
                row.RelativeItem().PaddingLeft(8).Column(tc =>
                {
                    tc.Item().AlignBottom()
                      .Text(title.ToUpperInvariant())
                      .FontSize(9.5f).Bold()
                      .FontFamily("Trebuchet MS")
                      .FontColor(Colors2.NavyDeep)
                      .LetterSpacing(0.05f);

                    tc.Item().PaddingTop(3)
                      .LineHorizontal(1).LineColor(Colors2.BorderLight);
                });
            });

            // Section body
            inner.Item().Element(body);
        });
    }

    // ══════════════════════════════════════════════════════════════════════
    // Patient details
    // ══════════════════════════════════════════════════════════════════════
    private static void ComposePatientDetails(IContainer c, Patient? patient)
    {
        if (patient == null)
        {
            c.Text("No patient record attached.").FontColor(Colors2.SlateLight).Italic();
            return;
        }

        c.Background(Colors2.White)
         .Border(0.5f).BorderColor(Colors2.BorderLight)
         .Padding(16)
         .Table(table =>
         {
             table.ColumnsDefinition(tc =>
             {
                 tc.RelativeColumn(); tc.RelativeColumn();
                 tc.RelativeColumn(); tc.RelativeColumn();
             });

             void Row(string label, string value, string label2, string value2)
             {
                 table.Cell().PaddingVertical(4).Column(col =>
                 {
                     col.Item().Text(label).FontSize(6.5f).Bold().FontColor(Colors2.SlateFaint).LetterSpacing(0.02f);
                     col.Item().Text(value).FontSize(8.5f).FontColor(Colors2.SlateText);
                 });
                 table.Cell().PaddingVertical(4).Column(col =>
                 {
                     col.Item().Text(label2).FontSize(6.5f).Bold().FontColor(Colors2.SlateFaint).LetterSpacing(0.02f);
                     col.Item().Text(value2).FontSize(8.5f).FontColor(Colors2.SlateText);
                 });
             }

             Row("FULL NAME", $"{patient.FirstName} {patient.LastName}",
                 "PATIENT MRN", patient.MedicalRecordNo ?? "PTN-AUTO");

             Row("DATE OF BIRTH", patient.DateOfBirth.ToString("dd MMM yyyy"),
                 "GENDER / SEX", patient.Gender.ToString().ToUpper());

             if (!string.IsNullOrEmpty(patient.ContactNumber))
                 Row("CONTACT CHANNEL", patient.ContactNumber, "REGISTERED AT", patient.CreatedAt.ToString("dd MMM yyyy"));
         });
    }

    // ══════════════════════════════════════════════════════════════════════
    // Images
    // ══════════════════════════════════════════════════════════════════════
    private static void ComposeSideBySideImages(IContainer c, AnalysisSession session, byte[] originalBytes, byte[] overlaidBytes)
    {
        c.Column(col =>
        {
            col.Item()
               .Row(row =>
               {
                   // Left: Original X-Ray
                   row.RelativeItem().Column(imgCol =>
                   {
                       imgCol.Item()
                             .Border(0.5f).BorderColor(Colors2.BorderLight)
                             .Background(Colors2.White)
                             .Image(originalBytes).FitWidth();

                       imgCol.Item().PaddingTop(4).AlignCenter()
                             .Text("Original Radiograph")
                             .FontSize(8f).Bold().FontColor(Colors2.NavyMid);
                   });

                   row.ConstantItem(16); // Gap

                   // Right: Overlaid Tracing
                   row.RelativeItem().Column(imgCol =>
                   {
                       imgCol.Item()
                             .Border(0.5f).BorderColor(Colors2.BorderLight)
                             .Background(Colors2.White)
                             .Image(overlaidBytes).FitWidth();

                       imgCol.Item().PaddingTop(4).AlignCenter()
                             .Text("AI Cephalometric Tracing")
                             .FontSize(8f).Bold().FontColor(Colors2.NavyMid);
                   });
               });

            col.Item().PaddingTop(8).AlignRight()
               .Text($"Source: {session.XRayImage?.FileName}  ·  " +
                     $"Pixel spacing: {session.XRayImage?.PixelSpacingMm:F3} mm/px" +
                     (!string.IsNullOrEmpty(session.ResultImageUrl) ? "  ·  Archive Snapshot Used" : ""))
               .FontSize(7.5f).Italic().FontColor(Colors2.SlateLight);
        });
    }

    private static void ComposeXRayImage(IContainer c, AnalysisSession session, XRayImage image, byte[] bytes)
    {
        c.Column(col =>
        {
            col.Item()
               .Border(0.5f).BorderColor(Colors2.BorderLight)
               .Background(Colors2.White)
               .Column(imgCol => imgCol.Item().Image(bytes).FitWidth());

            col.Item().PaddingTop(5).AlignRight()
               .Text($"Source: {image.FileName}  ·  " +
                     $"Pixel spacing: {image.PixelSpacingMm:F3} mm/px" +
                     (!string.IsNullOrEmpty(session.ResultImageUrl) ? "  ·  Archive Snapshot" : ""))
               .FontSize(7.5f).Italic().FontColor(Colors2.SlateLight);
        });
    }

    // ══════════════════════════════════════════════════════════════════════
    // Landmarks table — sorted by confidence descending, two-column grid
    // ══════════════════════════════════════════════════════════════════════
    private static void ComposeLandmarksTable(IContainer c, AnalysisSession session)
    {
        List<Landmark> sorted = [.. session.Landmarks.OrderByDescending(l => l.Confidence)];
        var meta = session.LandmarkMeta ?? [];
        int half = (sorted.Count + 1) / 2;

        c.Background(Colors2.White)
         .Border(0.5f).BorderColor(Colors2.BorderLight)
         .Padding(12)
         .Table(table =>
         {
             table.ColumnsDefinition(tc =>
             {
                 tc.ConstantColumn(30); tc.RelativeColumn(); tc.ConstantColumn(40); tc.ConstantColumn(44);
                 tc.ConstantColumn(12); // gutter
                 tc.ConstantColumn(30); tc.RelativeColumn(); tc.ConstantColumn(40); tc.ConstantColumn(44);
             });

             void HCell(string txt) => table.Cell()
                  .PaddingBottom(4).BorderBottom(0.75f).BorderColor(Colors2.BorderLight)
                  .Text(txt).Bold().FontSize(7.5f).FontColor(Colors2.NavyDeep);

             HCell("Code"); HCell("Landmark"); HCell("Conf."); HCell("Err (mm)");
             table.Cell(); // gutter
             HCell("Code"); HCell("Landmark"); HCell("Conf."); HCell("Err (mm)");

             for (int i = 0; i < half; i++)
             {
                 var l1 = sorted[i];
                 meta.TryGetValue(l1.LandmarkCode, out var m1);

                 string cc1 = (l1.Confidence ?? 0m) > 0.85m ? Colors2.AccentGreen
                            : (l1.Confidence ?? 0m) > 0.65m ? Colors2.AccentAmber
                            : Colors2.AccentRed;

                 table.Cell().PaddingVertical(2.5f).Text(l1.LandmarkCode).FontSize(7.5f).Bold().FontColor(Colors2.NavyMid);
                 table.Cell().PaddingVertical(2.5f).Text(l1.LandmarkName).FontSize(7.5f);
                 table.Cell().PaddingVertical(2.5f).AlignRight().Text($"{l1.Confidence:P0}").FontSize(7.5f).FontColor(cc1).Bold();
                 table.Cell().PaddingVertical(2.5f).AlignRight()
                      .Text(m1 != null ? $"±{m1.ExpectedErrorMm:F1}" : "—").FontSize(7.5f).FontColor(Colors2.SlateLight);
                 table.Cell(); // gutter

                 if (i + half < sorted.Count)
                 {
                     var l2 = sorted[i + half];
                     meta.TryGetValue(l2.LandmarkCode, out var m2);

                     string cc2 = (l2.Confidence ?? 0m) > 0.85m ? Colors2.AccentGreen
                                : (l2.Confidence ?? 0m) > 0.65m ? Colors2.AccentAmber
                                : Colors2.AccentRed;

                     table.Cell().PaddingVertical(2.5f).Text(l2.LandmarkCode).FontSize(7.5f).Bold().FontColor(Colors2.NavyMid);
                     table.Cell().PaddingVertical(2.5f).Text(l2.LandmarkName).FontSize(7.5f);
                     table.Cell().PaddingVertical(2.5f).AlignRight().Text($"{l2.Confidence:P0}").FontSize(7.5f).FontColor(cc2).Bold();
                     table.Cell().PaddingVertical(2.5f).AlignRight()
                          .Text(m2 != null ? $"±{m2.ExpectedErrorMm:F1}" : "—").FontSize(7.5f).FontColor(Colors2.SlateLight);
                 }
                 else
                 {
                     table.Cell(); table.Cell(); table.Cell(); table.Cell();
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

            // ── Classification row ────────────────────────────────────────
            outer.Item().Row(row =>
            {
                // Skeletal class card
                row.RelativeItem().Background(Colors2.NavyLight)
                   .Border(0.5f).BorderColor(Colors2.BorderLight)
                   .Padding(12).Column(card =>
                {
                    card.Item().Text("SKELETAL CLASS")
                         .FontSize(7).Bold().FontColor(Colors2.SlateLight).LetterSpacing(0.06f);

                    card.Item().PaddingTop(4).Row(r =>
                    {
                        r.RelativeItem().Text(diagnosis.SkeletalClass.ToString())
                         .FontSize(14).Bold().FontColor(Colors2.NavyDeep);

                        if (diagnosis.SkeletalBorderline)
                            r.AutoItem().AlignBottom().PaddingLeft(6).PaddingBottom(2)
                             .Background(Colors2.AccentAmber).Padding(2)
                             .Text("BORDERLINE").FontSize(6.5f).Bold().FontColor(Colors2.White);
                    });

                    // Differential probability mini-table
                    if (diagnosis.SkeletalDifferential != null)
                    {
                        card.Item().PaddingTop(8)
                             .Text("Differential Probability")
                             .FontSize(7.5f).Bold().FontColor(Colors2.SlateLight);

                        card.Item().PaddingTop(3).Table(dt =>
                        {
                            dt.ColumnsDefinition(tc =>
                            {
                                foreach (var _ in diagnosis.SkeletalDifferential)
                                    tc.RelativeColumn();
                            });

                            foreach (var (cls, prob) in diagnosis.SkeletalDifferential)
                            {
                                dt.Cell()
                                  .Background(prob > 0.50 ? Colors2.NavyMid : Colors2.White)
                                  .Border(0.5f).BorderColor(Colors2.BorderLight)
                                  .Padding(4).AlignCenter()
                                  .Text(cls).FontSize(7.5f).Bold()
                                  .FontColor(prob > 0.50 ? Colors2.White : Colors2.SlateText);
                            }
                            foreach (var (_, prob) in diagnosis.SkeletalDifferential)
                            {
                                dt.Cell()
                                  .Background(prob > 0.50 ? Colors2.NavyLight : Colors2.White)
                                  .Border(0.5f).BorderColor(Colors2.BorderLight)
                                  .Padding(4).AlignCenter()
                                  .Text($"{prob:P0}").FontSize(7.5f)
                                  .FontColor(Colors2.SlateText);
                            }
                        });
                    }
                });

                row.ConstantItem(10); // gutter

                // Secondary metrics card
                row.RelativeItem().Background(Colors2.White)
                   .Border(0.5f).BorderColor(Colors2.BorderLight)
                   .Padding(12).Column(card =>
                {
                    void MetaRow(string lbl, string val)
                    {
                        card.Item().PaddingBottom(5).Row(r =>
                        {
                            r.ConstantItem(110).Text(lbl)
                             .Bold().FontSize(7.5f).FontColor(Colors2.SlateLight);
                            r.RelativeItem().Text(val)
                             .FontSize(8.5f).FontColor(Colors2.SlateText);
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
                             .Background(Colors2.NavyFaint)
                             .Padding(6)
                             .Text(diagnosis.OdiNote)
                             .FontSize(7.5f).Italic()
                             .FontColor(Colors2.AccentAmber);
                });
            });

            // ── Summary narrative ─────────────────────────────────────────
            if (!string.IsNullOrEmpty(diagnosis.SummaryText))
            {
                outer.Item()
                     .Background(Colors2.White)
                     .BorderLeft(3).BorderColor(Colors2.AccentTeal)
                     .Border(0.5f).BorderColor(Colors2.BorderLight)
                     .PaddingHorizontal(14).PaddingVertical(10)
                     .Text(diagnosis.SummaryText)
                     .FontSize(8.5f).LineHeight(1.6f);
            }
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
        string tendency = session.Diagnosis?.GrowthTendency ?? "";

        if (jMeas == null && upperGonial == null) return;

        c.Background(Colors2.White)
         .Border(0.5f).BorderColor(Colors2.BorderLight)
         .Padding(12).Column(col =>
         {
             col.Spacing(8);

             col.Item().Text("Björk 1969  /  Jarabak Ratio Analysis")
                  .FontSize(8).Bold().FontColor(Colors2.AccentTeal).Italic();

             if (!string.IsNullOrEmpty(tendency))
                 col.Item().Text(tendency).FontSize(8.5f).LineHeight(1.5f);

             col.Item().Row(row =>
             {
                 // Left side: Jarabak Table
                 row.RelativeItem(3).Column(tCol =>
                 {
                     tCol.Item().Table(table =>
                     {
                         table.ColumnsDefinition(tc =>
                         {
                             tc.RelativeColumn(3f); tc.RelativeColumn(1.2f); tc.RelativeColumn(1.5f); tc.RelativeColumn(2.5f);
                         });

                         void HCell(string t) => table.Cell()
                              .PaddingBottom(4).BorderBottom(0.75f).BorderColor(Colors2.BorderLight)
                              .Text(t).Bold().FontSize(7.5f).FontColor(Colors2.NavyDeep);

                         HCell("Indicator"); HCell("Value"); HCell("Norm"); HCell("Interpretation");

                         void DataRow(string name, decimal? val, string norm, string interp, bool alert = false)
                         {
                             table.Cell().PaddingVertical(3).Text(name).FontSize(8);
                             table.Cell().PaddingVertical(3).AlignRight()
                                  .Text(val.HasValue ? $"{val:F1}" : "—").FontSize(8).Bold()
                                  .FontColor(alert ? Colors2.AccentAmber : Colors2.SlateText);
                             table.Cell().PaddingVertical(3).AlignCenter()
                                  .Text(norm).FontSize(7.5f).FontColor(Colors2.SlateFaint);
                             table.Cell().PaddingVertical(3)
                                  .Text(interp).FontSize(7.5f).Italic()
                                  .FontColor(alert ? Colors2.AccentAmber : Colors2.SlateLight);
                         }

                         DataRow("Jarabak Ratio", jMeas?.Value, "62–65 %",
                             jMeas?.Value > 65 ? "Horizontal" : jMeas?.Value < 59 ? "Vertical" : "Neutral",
                             jMeas?.Value > 65 || jMeas?.Value < 59);

                         DataRow("Upper Gonial", upperGonial?.Value, "52–58°",
                             upperGonial?.Value > 58 ? "Post. incl." : upperGonial?.Value < 52 ? "Ant. incl." : "Normal",
                             upperGonial?.Value > 58 || upperGonial?.Value < 52);

                         DataRow("Lower Gonial", lowerGonial?.Value, "70–75°",
                             lowerGonial?.Value > 75 ? "Open" : lowerGonial?.Value < 70 ? "Closed" : "Normal",
                             lowerGonial?.Value > 75 || lowerGonial?.Value < 70);
                     });
                 });

                 row.ConstantItem(15);

                 // Right side: Visual Wiggle Chart
                 row.RelativeItem(2).Column(wCol =>
                 {
                     wCol.Item().PaddingBottom(6).AlignCenter()
                          .Text("BJÖRK-SKIELLER WIGGLE CHART")
                          .FontSize(7).Bold().FontColor(Colors2.SlateLight);

                     wCol.Item().Element(cont => ComposeWiggleChart(cont, session));
                 });
             });
         });
    }

    private static void ComposeWiggleChart(IContainer c, AnalysisSession session)
    {
        string[] codes = { "SaddleAngle", "ArticularAngle", "GonialAngle", "BJORK_SUM", "UpperGonial", "LowerGonial", "SN-GoGn" };
        var measMap = session.Measurements?.ToDictionary(m => m.MeasurementCode, m => m) ?? new Dictionary<string, Measurement>();

        c.Table(table =>
        {
            table.ColumnsDefinition(tc => { tc.ConstantColumn(60); tc.RelativeColumn(); });

            foreach (var code in codes)
            {
                table.Cell().PaddingVertical(2).Text(code == "BJORK_SUM" ? "Sum of ∠" : code).FontSize(6.5f).FontColor(Colors2.SlateLight);

                if (measMap.TryGetValue(code, out var m))
                {
                    float dev = (float)(m.Value - (m.NormalMin + m.NormalMax) / 2m);
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
        c.Background(Colors2.White)
         .Border(0.5f).BorderColor(Colors2.BorderLight)
         .Padding(12).Column(col =>
         {
             col.Spacing(8);

             col.Item().Text("Bolton (1962) Tooth-Size Discrepancy")
                  .FontSize(8).Bold().FontColor(Colors2.NavyMid).Italic();

             col.Item().Table(table =>
             {
                 table.ColumnsDefinition(tc =>
                 {
                     tc.RelativeColumn(2.5f); tc.RelativeColumn(); tc.RelativeColumn(1.8f); tc.RelativeColumn(2f);
                 });

                 void HCell(string t) => table.Cell()
                      .PaddingBottom(4).BorderBottom(0.75f).BorderColor(Colors2.BorderLight)
                      .Text(t).Bold().FontSize(7.5f).FontColor(Colors2.NavyDeep);

                 HCell("Ratio"); HCell("Value"); HCell("Norm ± SD"); HCell("Finding");

                 void BoltonRow(string label, decimal? val, string norm, string finding)
                 {
                     bool isNormal = finding?.Contains("Normal", StringComparison.OrdinalIgnoreCase) ?? false;

                     table.Cell().PaddingVertical(3).Text(label).FontSize(8);
                     table.Cell().PaddingVertical(3).AlignRight()
                          .Text(val.HasValue ? $"{val:F1}%" : "—").FontSize(8).Bold();
                     table.Cell().PaddingVertical(3).AlignCenter()
                          .Text(norm).FontSize(7.5f).FontColor(Colors2.SlateFaint);
                     table.Cell().PaddingVertical(3)
                          .Text(finding ?? "—").FontSize(8)
                          .FontColor(isNormal ? Colors2.AccentGreen : Colors2.AccentAmber);
                 }

                 BoltonRow("Anterior ratio (6/6)", bolton.AnteriorRatio, "77.2 ± 1.65%", bolton.AnteriorFinding ?? "—");
                 BoltonRow("Overall ratio (12/12)", bolton.OverallRatio, "91.3 ± 1.91%", bolton.OverallFinding ?? "—");
             });

             col.Item().PaddingTop(2)
                  .Background(Colors2.NavyFaint).Padding(6)
                  .Text("Clinical note: Mandibular excess → consider maxillary expansion or mandibular IPR. " +
                        "Maxillary excess → consider maxillary IPR or mandibular prosthetic buildup.")
                  .FontSize(7.5f).Italic().FontColor(Colors2.SlateLight);
         });
    }

    private static void ComposeMeasurements(IContainer c, IEnumerable<Measurement> measurements, AnalysisType priority)
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
                bool hasRef = CategoryReferences.TryGetValue(catName, out var catRef);

                col.Item().Column(catCol =>
                {
                    // Category sub-heading
                    catCol.Item().PaddingBottom(5).Row(r =>
                    {
                        r.AutoItem().PaddingRight(8).Text(catName.ToUpperInvariant() + " ANALYSIS")
                            .FontSize(8.5f).Bold()
                            .FontFamily("Trebuchet MS")
                            .FontColor(isPrimary ? Colors2.BrandPrimary : Colors2.NavyMid)
                            .LetterSpacing(0.04f);

                        if (isPrimary)
                            r.AutoItem().Background(Colors2.BrandPrimary + "15").PaddingHorizontal(6).PaddingVertical(1)
                             .Text("SELECTED PROTOCOL").FontSize(6.5f).Bold().FontColor(Colors2.BrandPrimary);
                    });

                    catCol.Item().Table(table =>
                    {
                        table.ColumnsDefinition(tc =>
                        {
                            tc.RelativeColumn(3.2f); // Measurement name
                            tc.RelativeColumn(1.4f); // Value
                            tc.RelativeColumn(2.4f); // Normative
                            tc.RelativeColumn(2.6f); // Deviation bar
                            tc.RelativeColumn(1.4f); // Status
                            tc.RelativeColumn(1.4f); // Severity
                            tc.RelativeColumn(1.4f); // ±Error
                        });

                        // Column headers
                        table.Header(h =>
                        {
                            void HCell(string t) => h.Cell()
                                 .Background(Colors2.NavyDeep)
                                 .PaddingHorizontal(4).PaddingVertical(5)
                                 .Text(t).Bold().FontSize(7.5f)
                                 .FontColor(Colors2.White);

                            HCell("Measurement"); HCell("Value"); HCell("Normative");
                            HCell("Deviation"); HCell("Status"); HCell("Severity"); HCell("±Error");
                        });

                        int rowIdx = 0;
                        foreach (var m in group.OrderBy(m => m.MeasurementName))
                        {
                            string rowBg = rowIdx % 2 == 0 ? Colors2.White : Colors2.NavyFaint;
                            rowIdx++;

                            string unitSuffix = m.Unit switch
                            {
                                MeasurementUnit.Degrees => "°",
                                MeasurementUnit.Percent => "%",
                                _ => " mm"
                            };

                            float deviation = (float)(m.Value - (m.NormalMin + m.NormalMax) / 2m);
                            string severity = ComputeSeverity(m);
                            string statusClr = GetStatusColor(m.Status);
                            string severityClr = severity == "Normal" ? Colors2.AccentGreen
                                               : severity == "1 SD" ? Colors2.AccentAmber
                                               : Colors2.AccentRed;

                            void DataCell(Action<IContainer> content)
                                => table.Cell().Background(rowBg).PaddingHorizontal(4).PaddingVertical(3).Element(content);

                            DataCell(cell => cell.Text(m.MeasurementName).FontSize(8));

                            DataCell(cell => cell.AlignRight()
                                 .Text($"{m.Value:F1}{unitSuffix}")
                                 .FontSize(8).Bold().FontColor(Colors2.SlateText));

                            DataCell(cell => cell.AlignCenter().Column(inner =>
                            {
                                if (MeasurementSDs.TryGetValue(m.MeasurementCode, out var sd))
                                {
                                    inner.Item().Text($"{sd.Mean:F1} ± {sd.SD:F1}").FontSize(7.5f).Bold();
                                    inner.Item().Text($"[{m.NormalMin:F1} – {m.NormalMax:F1}]")
                                         .FontSize(6.5f).FontColor(Colors2.SlateFaint);
                                }
                                else
                                {
                                    inner.Item().Text($"{m.NormalMin:F1} – {m.NormalMax:F1}").FontSize(7.5f);
                                }
                            }));

                            DataCell(cell => DrawDeviationBar(cell, m, deviation));

                            DataCell(cell => cell.AlignCenter()
                                 .Text(m.Status.ToString()).FontSize(7.5f).Bold()
                                 .FontColor(statusClr));

                            DataCell(cell => cell.AlignCenter()
                                 .Text(severity).FontSize(7.5f).Bold()
                                 .FontColor(severityClr));

                            DataCell(cell => cell.AlignCenter()
                                 .Text(m.ExpectedError.HasValue
                                     ? $"±{m.ExpectedError.Value:F1}{unitSuffix}"
                                     : "—")
                                 .FontSize(7f).FontColor(Colors2.SlateFaint));
                        }
                    });

                    if (hasRef)
                    {
                        catCol.Item().PaddingTop(4).PaddingLeft(2)
                               .Text($"Ref: {catRef}")
                               .FontSize(6.5f).Italic().FontColor(Colors2.SlateFaint);
                    }
                });
            }
        });
    }

    // ── Inline deviation bar ──────────────────────────────────────────────
    private static void DrawDeviationBar(IContainer cell, Measurement m, float deviation)
    {
        float maxDev = MeasurementSDs.TryGetValue(m.MeasurementCode, out var sdVal)
            ? sdVal.SD * 2.5f : 10f;

        if (maxDev <= 0) maxDev = 1f;

        float barFrac = Math.Clamp(Math.Abs(deviation) / maxDev, 0f, 1f);
        string barColor = GetStatusColor(m.Status);
        const float epsilon = 0.001f;

        cell.Height(10).Width(50).PaddingVertical(3).Layers(layers =>
        {
            // Centre marker
            layers.Layer().AlignCenter().Width(1).Background(Colors2.BorderStrong);

            // Filled bar
            layers.PrimaryLayer().Row(row =>
            {
                if (deviation < 0)
                {
                    row.RelativeItem(Math.Max(epsilon, 50 * (1 - barFrac)));
                    row.RelativeItem(Math.Max(epsilon, 50 * barFrac)).Background(barColor);
                    row.RelativeItem(50);
                }
                else
                {
                    row.RelativeItem(50);
                    row.RelativeItem(Math.Max(epsilon, 50 * barFrac)).Background(barColor);
                    row.RelativeItem(Math.Max(epsilon, 50 * (1 - barFrac)));
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
                   .Background(Colors2.White)
                   .Border(0.5f).BorderColor(primary ? Colors2.NavyMid : Colors2.BorderLight)
                   .BorderLeft(primary ? 4 : 1.5f).BorderColor(primary ? Colors2.NavyDeep : Colors2.BorderStrong)
                   .PaddingHorizontal(12).PaddingVertical(10)
                   .Column(pCol =>
                   {
                       pCol.Item().Row(r =>
                       {
                           r.RelativeItem()
                            .Text(plan.TreatmentName)
                            .FontSize(9.5f).Bold()
                            .FontColor(Colors2.NavyDeep);

                           if (primary)
                               r.AutoItem().AlignBottom().PaddingLeft(8)
                                .Background(Colors2.AccentGold).Padding(3)
                                .Text("PRIMARY").FontSize(6.5f).Bold().FontColor(Colors2.White);
                       });

                       pCol.Item().PaddingTop(5)
                            .Text(plan.Description)
                            .LineHeight(1.5f).FontSize(8.5f)
                            .FontColor(Colors2.SlateText);

                       if (!string.IsNullOrEmpty(plan.Rationale))
                       {
                           pCol.Item().PaddingTop(5).Row(r =>
                           {
                               r.ConstantItem(56).Text("Rationale").FontSize(7.5f).Bold().FontColor(Colors2.SlateLight);
                               r.RelativeItem().Text(plan.Rationale).FontSize(7.5f).Italic().FontColor(Colors2.SlateLight);
                           });
                       }

                       if (!string.IsNullOrEmpty(plan.EvidenceReference))
                       {
                           pCol.Item().PaddingTop(3)
                                .Text($"Ref: {plan.EvidenceReference}")
                                .FontSize(6.5f).Italic().FontColor(Colors2.SlateFaint);
                       }
                   });
            }
        });
    }

    // ══════════════════════════════════════════════════════════════════════
    // Footer
    // ══════════════════════════════════════════════════════════════════════
    private static void ComposeFooter(IContainer c, bool isDraft)
    {
        c.Background(Colors2.NavyDeep)
         .PaddingHorizontal(22).PaddingVertical(7)
         .Row(row =>
         {
             row.RelativeItem().Column(inner =>
             {
                 inner.Item().Text("CephAI Advanced Imaging — Cephalometric Analysis Report")
                      .FontSize(7.5f).FontColor(Colors2.SlateFaint);

                 if (isDraft)
                     inner.Item().Text("⚠  DRAFT DOCUMENT — NOT FOR CLINICAL USE")
                          .FontSize(7.5f).Bold().FontColor(Colors2.AccentAmber);
             });

             row.ConstantItem(90).AlignRight().Column(inner =>
             {
                 inner.Item().AlignRight().Text(text =>
                 {
                     text.DefaultTextStyle(x => x.FontSize(7.5f).FontColor(Colors2.SlateFaint));
                     text.Span("Page ");
                     text.CurrentPageNumber().Bold().FontColor(Colors2.White);
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
            row.RelativeItem(); // spacer

            row.ConstantItem(240)
               .Background(Colors2.White)
               .Border(0.5f).BorderColor(Colors2.BorderLight)
               .Padding(14).Column(col =>
               {
                   col.Item().Text("Authorised Clinician")
                        .FontSize(7.5f).Bold().FontColor(Colors2.SlateLight).LetterSpacing(0.04f);

                   col.Item().PaddingTop(28)
                        .LineHorizontal(0.75f).LineColor(Colors2.BorderStrong);

                   col.Item().PaddingTop(4).Row(r =>
                   {
                       r.RelativeItem().Text("Signature / Stamp")
                            .FontSize(7.5f).FontColor(Colors2.SlateFaint);
                       r.RelativeItem().AlignRight()
                        .Text($"Date:  {DateTime.Now:dd MMM yyyy}")
                            .FontSize(7.5f).FontColor(Colors2.SlateFaint);
                   });

                   col.Item().PaddingTop(6)
                        .Text("CephAI Advanced Imaging Center")
                        .FontSize(7.5f).FontColor(Colors2.SlateLight);
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
             : dev <= sd.SD * 2 ? "1 SD"
             : dev <= sd.SD * 3 ? "2 SD"
             : ">2 SD";
    }

    private static string GetStatusColor(MeasurementStatus status) => status switch
    {
        MeasurementStatus.Normal => Colors2.AccentGreen,
        MeasurementStatus.Increased => Colors2.AccentAmber,
        MeasurementStatus.Decreased => Colors2.AccentRed,
        _ => Colors2.SlateText
    };
}