using CephAnalysis.Application.Features.Reports.Commands;
using CephAnalysis.Application.Interfaces;
using CephAnalysis.Domain.Entities;
using CephAnalysis.Domain.Enums;
using Microsoft.Extensions.Logging;
using QuestPDF.Fluent;
using QuestPDF.Helpers;
using QuestPDF.Infrastructure;

namespace CephAnalysis.Infrastructure.Services;

/// <summary>
/// Generates a clinical-grade cephalometric PDF report.
///
/// Design system: refined slate/teal palette, generous whitespace, tight typographic
/// hierarchy. Sections use a left-accent bar motif; tables use alternating-row
/// micro-contrast; status chips are pill-shaped with semibold labels.
/// </summary>
public sealed class QuestPdfReportGenerator(
    IStorageService storage,
    IImageOverlayService imageOverlayService,
    ILogger<QuestPdfReportGenerator> logger) : IReportGenerator
{
    private readonly IStorageService _storage = storage;
    private readonly IImageOverlayService _imageOverlayService = imageOverlayService;
    private readonly ILogger<QuestPdfReportGenerator> _logger = logger;

    // ─── Design tokens ────────────────────────────────────────────────────────

    private static class T
    {
        // Neutrals
        public const string Ink = "#0D1117";   // near-black body text
        public const string InkSoft = "#2D3748";   // secondary body
        public const string Muted = "#718096";   // captions / labels
        public const string Faint = "#A0AEC0";   // de-emphasised detail
        public const string White = "#FFFFFF";

        // Surfaces
        public const string Canvas = "#F7F9FC";   // page background
        public const string Surface = "#FFFFFF";   // card face
        public const string SurfaceAlt = "#F0F4F8";   // alternating table rows / info blocks
        public const string Border = "#DDE3EC";   // card / table borders
        public const string BorderSoft = "#ECF0F5";   // subtle dividers

        // Brand — teal
        public const string Teal = "#0D9488";   // primary accent
        public const string TealDark = "#0F5B57";   // header/dark surfaces
        public const string TealLight = "#CCFBF1";   // badge fill
        public const string TealXLight = "#E6FFFA";   // light tints

        // Header
        public const string HeaderBg = "#0A1628";   // deep charcoal-navy
        public const string HeaderSub = "#112240";   // subheader row
        public const string HeaderText = "#E2E8F0";   // header body text
        public const string HeaderDim = "#64748B";   // header de-emphasised

        // Semantic
        public const string Green = "#059669";
        public const string GreenLight = "#D1FAE5";
        public const string Amber = "#D97706";
        public const string AmberLight = "#FEF3C7";
        public const string Red = "#DC2626";
        public const string RedLight = "#FEE2E2";
        public const string Blue = "#2563EB";
        public const string Cyan = "#0891B2";
        public const string CyanLight = "#CFFAFE";
        public const string Violet = "#7C3AED";
        public const string VioletLight = "#EDE9FE";
    }

    private static class Scale
    {
        public const float Tiny = 6.5f;
        public const float Caption = 7.2f;
        public const float Small = 7.8f;
        public const float Body = 8.8f;
        public const float BodyLg = 9.5f;
        public const float Sub = 10.5f;
        public const float Heading = 12.5f;
        public const float Hero = 17f;
    }

    // ─── Supporting types ─────────────────────────────────────────────────────

    private sealed class ReportContext
    {
        private int _sectionIndex;
        public int NextSection() => ++_sectionIndex;
    }

    private sealed record ReportAssets(byte[]? OriginalXray, byte[]? OverlayXray);

    private readonly record struct NormReference(decimal Mean, decimal Sd, string Source);

    // ─── Reference data ───────────────────────────────────────────────────────

    private static readonly IReadOnlyDictionary<string, string> CategoryReferences =
        new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
        {
            ["Steiner"] = "Steiner CC. Cephalometrics for you and me. Am J Orthod. 1953.",
            ["Tweed"] = "Tweed CH. The Frankfort mandibular incisor angle. Am J Orthod. 1954.",
            ["Eastman"] = "Eastman Dental Center cephalometric analysis protocol.",
            ["McNamara"] = "McNamara JA. A method of cephalometric evaluation. Am J Orthod. 1984.",
            ["Jarabak"] = "Jarabak JR, Fizzell JA. Technique and Treatment with Lightwire Edgewise Appliances.",
            ["Ricketts"] = "Ricketts RM. A foundation for cephalometric communication. Am J Orthod. 1960.",
            ["Bjork"] = "Bjork A. Prediction of mandibular growth rotation. Am J Orthod. 1969.",
            ["Downs"] = "Downs WB. Variations in facial relationships: their significance in treatment and prognosis.",
            ["Full"] = "Composite analysis assembled from available cephalometric norms and AI-derived landmarks.",
        };

    private static readonly IReadOnlyDictionary<string, NormReference> Norms =
        new Dictionary<string, NormReference>(StringComparer.OrdinalIgnoreCase)
        {
            ["SNA"] = new(82.0m, 3.0m, "Riolo/Steiner"),
            ["SNB"] = new(80.0m, 3.0m, "Riolo/Steiner"),
            ["ANB"] = new(2.0m, 2.0m, "Steiner"),
            ["FMA"] = new(25.0m, 4.5m, "Tweed"),
            ["IMPA"] = new(90.0m, 5.0m, "Tweed"),
            ["FMIA"] = new(65.0m, 5.0m, "Tweed"),
            ["SN-GoGn"] = new(32.0m, 5.0m, "Steiner"),
            ["SN-MP"] = new(32.0m, 5.0m, "Steiner"),
            ["UI-NA_DEG"] = new(22.0m, 5.0m, "Steiner"),
            ["LI-NB_DEG"] = new(25.0m, 5.0m, "Steiner"),
            ["APDI"] = new(81.4m, 4.1m, "Kim"),
            ["ODI"] = new(74.5m, 6.1m, "Kim"),
            ["H-Angle"] = new(10.0m, 3.5m, "Holdaway"),
            ["UPPER_AIRWAY"] = new(13.0m, 4.0m, "Airway reference"),
            ["A-NPerp"] = new(0.0m, 2.0m, "McNamara"),
            ["Pog-NPerp"] = new(-4.0m, 3.5m, "McNamara"),
            ["SaddleAngle"] = new(123.0m, 5.0m, "Bjork/Jarabak"),
            ["ArticularAngle"] = new(143.0m, 6.0m, "Bjork/Jarabak"),
            ["BJORK_SUM"] = new(396.0m, 4.0m, "Bjork"),
            ["UpperGonial"] = new(54.0m, 2.5m, "Jarabak"),
            ["LowerGonial"] = new(73.0m, 3.0m, "Jarabak"),
            ["JRatio"] = new(63.5m, 3.0m, "Jarabak"),
            ["GonialAngle"] = new(130.0m, 7.0m, "Jarabak"),
        };

    // ─── Entry point ──────────────────────────────────────────────────────────

    public async Task<byte[]> GeneratePdfReportAsync(
        AnalysisSession session,
        GenerateReportRequest request,
        CancellationToken ct)
    {
        ct.ThrowIfCancellationRequested();

        var generatedAt = DateTime.UtcNow;
        var isDraft = session.Status is not (SessionStatus.Finalized or SessionStatus.Completed);
        var assets = await LoadReportAssetsAsync(session, request, ct);

        var document = Document.Create(container =>
        {
            container.Page(page =>
            {
                page.Size(PageSizes.A4);
                page.Margin(0);
                page.PageColor(T.Canvas);
                page.DefaultTextStyle(x => x
                    .FontFamily("Georgia")
                    .FontSize(Scale.Body)
                    .FontColor(T.Ink));

                page.Header().Element(c => ComposeHeader(c, session, request, generatedAt, isDraft));
                page.Content().Element(c => ComposeContent(c, new ReportContext(), session, request, assets, generatedAt, isDraft));
                page.Footer().Element(c => ComposeFooter(c, session, isDraft));
            });
        });

        using var stream = new MemoryStream();
        document.GeneratePdf(stream);
        return stream.ToArray();
    }

    // ─── Asset loading ────────────────────────────────────────────────────────

    private async Task<ReportAssets> LoadReportAssetsAsync(
        AnalysisSession session,
        GenerateReportRequest request,
        CancellationToken ct)
    {
        if (!request.IncludesXray || session.XRayImage is null ||
            string.IsNullOrWhiteSpace(session.XRayImage.StorageUrl))
        {
            return new ReportAssets(null, null);
        }

        byte[]? original = null;
        byte[]? overlay = null;

        try
        {
            await using var source = await _storage.DownloadFileAsync(session.XRayImage.StorageUrl, ct);
            using var originalBuffer = new MemoryStream();
            await source.CopyToAsync(originalBuffer, ct);
            original = originalBuffer.ToArray();

            if (request.IncludesLandmarkOverlay)
            {
                Stream? overlayStream = null;

                if (!string.IsNullOrWhiteSpace(session.ResultImageUrl))
                {
                    try { overlayStream = await _storage.DownloadFileAsync(session.ResultImageUrl, ct); }
                    catch (Exception ex)
                    {
                        _logger.LogWarning(ex,
                            "Overlay snapshot download failed for session {SessionId}; generating live overlay.",
                            session.Id);
                    }
                }

                if (overlayStream is null)
                {
                    using var baseImage = new MemoryStream(original);
                    overlayStream = await _imageOverlayService.GenerateOverlaidImageAsync(baseImage, session, ct);
                }

                await using (overlayStream)
                {
                    using var overlayBuffer = new MemoryStream();
                    await overlayStream.CopyToAsync(overlayBuffer, ct);
                    overlay = overlayBuffer.ToArray();
                }
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex,
                "Unable to prepare X-ray assets for report. SessionId={SessionId}", session.Id);
        }

        return new ReportAssets(original, overlay);
    }

    // ─── Header ───────────────────────────────────────────────────────────────

    private static void ComposeHeader(
        IContainer container,
        AnalysisSession session,
        GenerateReportRequest request,
        DateTime generatedAt,
        bool isDraft)
    {
        var patient = session.XRayImage?.Study?.Patient;
        var patientName = patient?.FullName ?? "Unknown patient";
        var mrn = EmptyToDash(patient?.MedicalRecordNo);
        var confidence = FormatPercent(session.Diagnosis?.ConfidenceScore, "Pending");

        container.Column(col =>
        {
            // ── Top bar ────────────────────────────────────────────────────
            col.Item()
                .Background(T.HeaderBg)
                .PaddingHorizontal(26)
                .PaddingVertical(14)
                .Row(row =>
                {
                    // Logo / brand
                    row.RelativeItem(1.2f).Column(left =>
                    {
                        left.Item().Row(r =>
                        {
                            r.AutoItem()
                                .Width(3)
                                .Background(T.Teal);

                            r.AutoItem().PaddingLeft(9).Column(brand =>
                            {
                                brand.Item()
                                    .Text("CephAI")
                                    .FontFamily("Arial")
                                    .FontSize(19)
                                    .Bold()
                                    .FontColor(T.White)
                                    .LetterSpacing(0.02f);

                                brand.Item()
                                    .Text("Advanced Cephalometric Intelligence")
                                    .FontSize(Scale.Caption)
                                    .FontColor(T.TealLight)
                                    .LetterSpacing(0.04f);
                            });
                        });
                    });

                    // Report title block
                    row.RelativeItem(1.6f).AlignCenter().Column(center =>
                    {
                        center.Item().AlignCenter()
                            .Text("CLINICAL CEPHALOMETRIC REPORT")
                            .FontFamily("Arial")
                            .FontSize(Scale.Sub)
                            .Bold()
                            .FontColor(T.White)
                            .LetterSpacing(0.1f);

                        center.Item().PaddingTop(5).AlignCenter()
                            .Text($"{session.AnalysisType} Analysis  ·  {request.Language.ToUpperInvariant()}")
                            .FontSize(Scale.Caption)
                            .FontColor(T.TealLight)
                            .LetterSpacing(0.06f);
                    });

                    // Meta / badges
                    row.RelativeItem(1.2f).AlignRight().Column(right =>
                    {
                        right.Item().AlignRight()
                            .Text($"Generated {generatedAt:dd MMM yyyy}  ·  {generatedAt:HH:mm} UTC")
                            .FontSize(Scale.Caption)
                            .FontColor(T.HeaderDim);

                        right.Item().PaddingTop(6).AlignRight().Row(badges =>
                        {
                            badges.RelativeItem();
                            badges.AutoItem()
                                .Element(c => ComposePill(c,
                                    isDraft ? "DRAFT" : "FINAL",
                                    isDraft ? T.Amber : T.Green,
                                    isDraft ? T.AmberLight : T.GreenLight,
                                    light: false));
                            badges.AutoItem().PaddingLeft(5)
                                .Element(c => ComposePill(c,
                                    $"AI  {confidence}",
                                    T.Teal, T.TealLight, light: false));
                        });
                    });
                });

            // ── Patient meta strip ─────────────────────────────────────────
            col.Item()
                .Background(T.HeaderSub)
                .PaddingHorizontal(26)
                .PaddingVertical(7)
                .Row(row =>
                {
                    HeaderMeta(row, "Patient", patientName);
                    HeaderMeta(row, "MRN", mrn);
                    HeaderMeta(row, "Session", session.Id.ToString("N")[..10].ToUpperInvariant());
                    HeaderMeta(row, "AI Model", EmptyToDash(session.ModelVersion));
                });
        });
    }

    // ─── Content scaffold ─────────────────────────────────────────────────────

    private static void ComposeContent(
        IContainer container,
        ReportContext context,
        AnalysisSession session,
        GenerateReportRequest request,
        ReportAssets assets,
        DateTime generatedAt,
        bool isDraft)
    {
        container.PaddingHorizontal(24).PaddingTop(16).PaddingBottom(14).Column(col =>
        {
            col.Spacing(14);

            col.Item().Element(c => ComposeExecutiveSummary(c, session, generatedAt, isDraft));

            Section(col, context, "Patient & Study Profile", "Intake context",
                c => ComposePatientStudyProfile(c, session));

            if (request.IncludesXray)
            {
                Section(col, context, "Image Review", "Radiograph and landmark overlay",
                    c => ComposeImageReview(c, session, assets, request.IncludesLandmarkOverlay));
            }

            if (session.Diagnosis is not null)
            {
                Section(col, context, "Clinical Diagnosis", "AI classification",
                    c => ComposeDiagnosis(c, session.Diagnosis));

                Section(col, context, "Growth & Risk Signals", "Decision support",
                    c => ComposeGrowthAndRisk(c, session));
            }

            if (session.Diagnosis?.BoltonResult is not null)
            {
                Section(col, context, "Bolton Tooth-Size Analysis", "Inter-arch proportionality",
                    c => ComposeBolton(c, session.Diagnosis.BoltonResult));
            }

            if (request.IncludesMeasurements && session.Measurements.Count > 0)
            {
                Section(col, context, "Measurement Analysis", "Norms, deviations and severity",
                    c => ComposeMeasurements(c, session.Measurements, session.AnalysisType));
            }

            if (request.IncludesTreatmentPlan && session.Diagnosis?.TreatmentPlans.Count > 0)
            {
                Section(col, context, "Treatment Planning", "Ranked recommendations",
                    c => ComposeTreatmentPlans(c, session.Diagnosis.TreatmentPlans));
            }

            Section(col, context, "Clinical Governance", "Review, limitations and sign-off",
                c => ComposeGovernance(c, session, request));

            var usedCategories = session.Measurements
                .Where(m => m.Category.HasValue)
                .Select(m => m.Category!.Value.ToString())
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .Where(cat => CategoryReferences.ContainsKey(cat))
                .ToList();

            if (usedCategories.Count > 0)
            {
                Section(col, context, "Normative References", "Literature sources",
                    c => ComposeNormativeReferences(c, usedCategories));
            }
        });
    }

    // ─── Executive summary ────────────────────────────────────────────────────

    private static void ComposeExecutiveSummary(
        IContainer container,
        AnalysisSession session,
        DateTime generatedAt,
        bool isDraft)
    {
        var diagnosis = session.Diagnosis;
        var patient = session.XRayImage?.Study?.Patient;
        var image = session.XRayImage;
        var confidence = diagnosis?.ConfidenceScore;
        var abnormalCount = session.Measurements.Count(m => m.Status != MeasurementStatus.Normal);
        var lowConfidenceCount = session.Landmarks.Count(l => l.ConfidenceScore is < 0.75m);

        container
            .Background(T.Surface)
            .Border(0.8f).BorderColor(T.Border)
            .Padding(16)
            .Column(col =>
            {
                col.Spacing(14);

                // ── Summary prose row ──────────────────────────────────────
                col.Item().Row(row =>
                {
                    row.RelativeItem(1.9f).Column(left =>
                    {
                        left.Item()
                            .Text("Executive Summary")
                            .FontFamily("Arial")
                            .FontSize(Scale.Hero)
                            .Bold()
                            .FontColor(T.Ink);

                        left.Item().PaddingTop(6)
                            .Text(ComposeSummarySentence(session))
                            .FontSize(Scale.BodyLg)
                            .LineHeight(1.45f)
                            .FontColor(T.InkSoft);

                        left.Item().PaddingTop(10).Row(flags =>
                        {
                            flags.AutoItem().Element(c => ComposePill(c,
                                diagnosis?.SkeletalClass.ToString() ?? "Diagnosis Pending",
                                ToneForSkeletal(diagnosis?.SkeletalClass),
                                ToneLightForSkeletal(diagnosis?.SkeletalClass)));

                            flags.AutoItem().PaddingLeft(6).Element(c => ComposePill(c,
                                diagnosis?.VerticalPattern.ToString() ?? "Vertical Pending",
                                ToneForVertical(diagnosis?.VerticalPattern),
                                ToneLightForVertical(diagnosis?.VerticalPattern)));

                            flags.AutoItem().PaddingLeft(6).Element(c => ComposePill(c,
                                isDraft ? "Awaiting Review" : "Clinician Finalised",
                                isDraft ? T.Amber : T.Green,
                                isDraft ? T.AmberLight : T.GreenLight));
                        });
                    });

                    row.RelativeItem(1.05f).PaddingLeft(14).Column(right =>
                    {
                        right.Spacing(5);
                        MiniStat(right, "Patient", patient?.FullName ?? "Unknown", EmptyToDash(patient?.MedicalRecordNo));
                        MiniStat(right, "Generated", generatedAt.ToString("dd MMM yyyy"), $"{generatedAt:HH:mm} UTC");
                        MiniStat(right, "Image", image?.IsCalibrated == true ? "Calibrated" : "Uncalibrated", FormatDimensions(image));
                    });
                });

                // ── KPI strip ──────────────────────────────────────────────
                col.Item()
                    .Background(T.SurfaceAlt)
                    .Border(0.5f).BorderColor(T.BorderSoft)
                    .Padding(2)
                    .Row(row =>
                    {
                        var abnormalTone = abnormalCount == 0 ? T.Green : abnormalCount <= 3 ? T.Amber : T.Red;
                        var landmarkTone = lowConfidenceCount == 0 ? T.Teal : lowConfidenceCount <= 2 ? T.Amber : T.Red;

                        KpiCard(row.RelativeItem(), "AI Confidence",
                            FormatPercent(confidence, "—"), ConfidenceTone(confidence),
                            "Diagnostic confidence score");

                        KpiDivider(row);
                        KpiCard(row.RelativeItem(), "Risk Signals",
                            abnormalCount.ToString(), abnormalTone,
                            $"{abnormalCount} of {session.Measurements.Count} outside normal");

                        KpiDivider(row);
                        KpiCard(row.RelativeItem(), "Landmarks",
                            session.Landmarks.Count.ToString(), landmarkTone,
                            $"{lowConfidenceCount} low confidence");

                        KpiDivider(row);
                        KpiCard(row.RelativeItem(), "Runtime",
                            FormatDuration(session.TotalDurationMs ?? session.InferenceDurationMs),
                            T.Violet, EmptyToDash(session.ModelVersion));
                    });
            });
    }

    // ─── Section shell ────────────────────────────────────────────────────────

    private static void Section(
        ColumnDescriptor column,
        ReportContext context,
        string title,
        string eyebrow,
        Action<IContainer> content)
    {
        var number = context.NextSection();

        column.Item()
            .Background(T.Surface)
            .Border(0.8f).BorderColor(T.Border)
            .Column(sec =>
            {
                // Section header
                sec.Item()
                    .BorderBottom(0.7f).BorderColor(T.BorderSoft)
                    .PaddingHorizontal(14).PaddingVertical(11)
                    .Row(row =>
                    {
                        // Number chip
                        row.ConstantItem(26).Height(26)
                            .Background(T.Teal)
                            .AlignCenter().AlignMiddle()
                            .Text(number.ToString("00"))
                            .FontFamily("Arial")
                            .FontSize(Scale.Small)
                            .Bold()
                            .FontColor(T.White);

                        row.RelativeItem().PaddingLeft(10).Column(head =>
                        {
                            head.Item()
                                .Text(eyebrow.ToUpperInvariant())
                                .FontSize(Scale.Tiny)
                                .Bold()
                                .FontColor(T.Teal)
                                .LetterSpacing(0.10f);

                            head.Item().PaddingTop(2)
                                .Text(title)
                                .FontFamily("Arial")
                                .FontSize(Scale.Heading)
                                .Bold()
                                .FontColor(T.Ink);
                        });
                    });

                // Body
                sec.Item().Padding(14).Element(content);
            });
    }

    // ─── Patient / study profile ──────────────────────────────────────────────

    private static void ComposePatientStudyProfile(IContainer container, AnalysisSession session)
    {
        var patient = session.XRayImage?.Study?.Patient;
        var study = session.XRayImage?.Study;
        var image = session.XRayImage;

        container.Column(col =>
        {
            col.Spacing(10);

            col.Item().Row(row =>
            {
                row.RelativeItem().Element(c => InfoCard(c, "Patient", new[]
                {
                    ("Name",           patient?.FullName ?? "Unknown"),
                    ("Medical Record", EmptyToDash(patient?.MedicalRecordNo)),
                    ("Age / Gender",   patient is null ? "-" : $"{patient.Age} yrs  /  {patient.Gender}"),
                    ("Contact",        EmptyToDash(patient?.ContactNumber ?? patient?.Phone ?? patient?.Email)),
                }));

                row.RelativeItem().PaddingLeft(9).Element(c => InfoCard(c, "Study", new[]
                {
                    ("Study Date",  study?.StudyDate == default ? "-" : study.StudyDate.ToString("dd MMM yyyy")),
                    ("Study Type",  study?.StudyType.ToString() ?? "-"),
                    ("Case Title",  EmptyToDash(study?.Title)),
                    ("Status",      study?.Status.ToString() ?? "-"),
                }));

                row.RelativeItem().PaddingLeft(9).Element(c => InfoCard(c, "Image", new[]
                {
                    ("File",        EmptyToDash(image?.FileName)),
                    ("Format",      image?.FileFormat.ToString() ?? "-"),
                    ("Dimensions",  FormatDimensions(image)),
                    ("Calibration", image?.IsCalibrated == true ? $"{image.PixelSpacingMm:0.###} mm/px" : "Not calibrated"),
                }));
            });

            if (!string.IsNullOrWhiteSpace(study?.ClinicalNotes) || !string.IsNullOrWhiteSpace(patient?.Notes))
            {
                col.Item()
                    .Background(T.SurfaceAlt)
                    .BorderLeft(3).BorderColor(T.Teal)
                    .PaddingLeft(12).PaddingRight(10).PaddingVertical(9)
                    .Column(notes =>
                    {
                        notes.Item()
                            .Text("CLINICAL NOTES")
                            .FontSize(Scale.Tiny)
                            .Bold()
                            .FontColor(T.Teal)
                            .LetterSpacing(0.08f);

                        notes.Item().PaddingTop(4)
                            .Text(EmptyToDash(study?.ClinicalNotes ?? patient?.Notes))
                            .FontSize(Scale.Body)
                            .LineHeight(1.45f)
                            .FontColor(T.InkSoft);
                    });
            }
        });
    }

    // ─── Image review ─────────────────────────────────────────────────────────

    private static void ComposeImageReview(
        IContainer container,
        AnalysisSession session,
        ReportAssets assets,
        bool includeOverlay)
    {
        if (assets.OriginalXray is null)
        {
            EmptyState(container,
                "The radiograph could not be embedded. The stored file may be unavailable or in an unsupported format.");
            return;
        }

        container.Column(col =>
        {
            col.Spacing(9);

            if (includeOverlay && assets.OverlayXray is not null)
            {
                col.Item().Row(row =>
                {
                    row.RelativeItem().Element(c => ImageCard(c, "Original Radiograph", assets.OriginalXray));
                    row.RelativeItem().PaddingLeft(10).Element(c => ImageCard(c, "AI Tracing Overlay", assets.OverlayXray));
                });
            }
            else
            {
                col.Item().Element(c => ImageCard(c, "Radiograph", assets.OriginalXray, 315));
            }

            col.Item()
                .Background(T.SurfaceAlt)
                .Padding(8)
                .Text($"Image QA — {session.Landmarks.Count} landmarks detected  ·  " +
                      $"{session.Measurements.Count} measurements computed  ·  " +
                      $"Calibration {(session.XRayImage?.IsCalibrated == true ? "available" : "not available")}. " +
                      "Manual review required before clinical use.")
                .FontSize(Scale.Small)
                .FontColor(T.Muted)
                .LineHeight(1.35f);
        });
    }

    // ─── Diagnosis ────────────────────────────────────────────────────────────

    private static void ComposeDiagnosis(IContainer container, Diagnosis diagnosis)
    {
        container.Column(col =>
        {
            col.Spacing(10);

            // Diagnostic cards row
            col.Item().Row(row =>
            {
                DiagCard(row.RelativeItem(), "Skeletal",
                    $"{diagnosis.SkeletalClass}  ({diagnosis.SkeletalType})",
                    ToneForSkeletal(diagnosis.SkeletalClass),
                    "Corrected ANB: " + (diagnosis.CorrectedAnb?.ToString("0.0") ?? diagnosis.AnbUsed.ToString("0.0")));

                DiagCard(row.RelativeItem(), "Vertical",
                    diagnosis.VerticalPattern.ToString(),
                    ToneForVertical(diagnosis.VerticalPattern),
                    "Growth: " + EmptyToDash(diagnosis.GrowthTendency));

                DiagCard(row.RelativeItem(), "Profile",
                    diagnosis.SoftTissueProfile.ToString(),
                    T.Cyan, "Soft tissue balance");

                DiagCard(row.RelativeItem(), "Confidence",
                    FormatPercent(diagnosis.ConfidenceScore, "Pending"),
                    ConfidenceTone(diagnosis.ConfidenceScore),
                    diagnosis.AnbRotationCorrected ? "Rotation corrected" : "Raw ANB");
            });

            // Impression block
            col.Item()
                .Background(T.SurfaceAlt)
                .BorderLeft(3).BorderColor(T.Teal)
                .PaddingLeft(12).PaddingRight(10).PaddingVertical(10)
                .Column(imp =>
                {
                    imp.Item()
                        .Text("AI CLINICAL IMPRESSION")
                        .FontSize(Scale.Tiny)
                        .Bold()
                        .FontColor(T.Teal)
                        .LetterSpacing(0.08f);

                    imp.Item().PaddingTop(5)
                        .Text(EmptyToDash(diagnosis.SummaryText ?? BuildFallbackDiagnosisSummary(diagnosis)))
                        .FontSize(Scale.BodyLg)
                        .LineHeight(1.5f)
                        .FontColor(T.InkSoft);

                    var notes = diagnosis.ClinicalNotes?.Where(x => !string.IsNullOrWhiteSpace(x)).ToList() ?? [];
                    if (notes.Count > 0)
                    {
                        imp.Item().PaddingTop(7).Column(nCol =>
                        {
                            foreach (var note in notes)
                            {
                                nCol.Item().PaddingTop(3).Row(r =>
                                {
                                    r.ConstantItem(12).Text("›")
                                        .FontSize(Scale.Body)
                                        .Bold()
                                        .FontColor(T.Teal);

                                    r.RelativeItem()
                                        .Text(note)
                                        .FontSize(Scale.Small)
                                        .Italic()
                                        .FontColor(T.InkSoft);
                                });
                            }
                        });
                    }
                });

            // Detail cards
            col.Item().Row(row =>
            {
                row.RelativeItem().Element(c => InfoCard(c, "Jaw & Incisor Position", new[]
                {
                    ("Maxilla",        diagnosis.MaxillaryPosition.ToString()),
                    ("Mandible",       diagnosis.MandibularPosition.ToString()),
                    ("Upper incisor",  diagnosis.UpperIncisorInclination.ToString()),
                    ("Lower incisor",  diagnosis.LowerIncisorInclination.ToString()),
                }));

                row.RelativeItem().PaddingLeft(9).Element(c => InfoCard(c, "Occlusion & Soft Tissue", new[]
                {
                    ("Overjet",   diagnosis.OverjetMm.HasValue ? $"{diagnosis.OverjetMm:0.0} mm — {diagnosis.OverjetClassification}"  : "-"),
                    ("Overbite",  diagnosis.OverbitesMm.HasValue ? $"{diagnosis.OverbitesMm:0.0} mm — {diagnosis.OverbiteClassification}" : "-"),
                    ("Kim APDI",  EmptyToDash(diagnosis.ApdiClassification)),
                    ("Kim ODI",   EmptyToDash(diagnosis.OdiClassification)),
                }));
            });

            // Warnings
            var warnings = diagnosis.Warnings?.Where(x => !string.IsNullOrWhiteSpace(x)).ToList() ?? [];
            if (warnings.Count > 0)
            {
                col.Item()
                    .Background(T.AmberLight)
                    .BorderLeft(3).BorderColor(T.Amber)
                    .PaddingLeft(12).PaddingRight(10).PaddingVertical(9)
                    .Column(w =>
                    {
                        w.Item()
                            .Text("ITEMS REQUIRING REVIEW")
                            .FontSize(Scale.Tiny)
                            .Bold()
                            .FontColor(T.Amber)
                            .LetterSpacing(0.08f);

                        foreach (var warning in warnings.Take(6))
                        {
                            w.Item().PaddingTop(4).Row(r =>
                            {
                                r.ConstantItem(12)
                                    .Text("!")
                                    .FontSize(Scale.Small)
                                    .Bold()
                                    .FontColor(T.Amber);

                                r.RelativeItem()
                                    .Text(warning)
                                    .FontSize(Scale.Body)
                                    .FontColor(T.InkSoft);
                            });
                        }
                    });
            }
        });
    }

    // ─── Growth & risk ────────────────────────────────────────────────────────

    private static void ComposeGrowthAndRisk(IContainer container, AnalysisSession session)
    {
        var diagnosis = session.Diagnosis;
        var signals = session.Measurements
            .Where(IsRiskSignal)
            .OrderByDescending(m => Math.Abs(GetZScore(m)))
            .Take(6)
            .ToList();

        container.Row(row =>
        {
            // Growth tendency column
            row.RelativeItem().Column(left =>
            {
                left.Spacing(7);

                left.Item()
                    .Text("Growth Tendency")
                    .FontFamily("Arial")
                    .FontSize(Scale.Sub)
                    .Bold()
                    .FontColor(T.Ink);

                left.Item()
                    .Background(T.SurfaceAlt)
                    .BorderLeft(3).BorderColor(T.Teal)
                    .PaddingLeft(10).PaddingRight(9).PaddingVertical(9)
                    .Text(EmptyToDash(diagnosis?.GrowthTendency ?? diagnosis?.OdiNote ??
                          "No growth pattern note was returned by the AI service."))
                    .FontSize(Scale.Body)
                    .LineHeight(1.45f)
                    .FontColor(T.InkSoft);

                left.Item().Element(c => InfoCard(c, "Session Timing", new[]
                {
                    ("Queued",    session.QueuedAt.ToString("dd MMM yyyy  HH:mm")),
                    ("Started",   session.StartedAt?.ToString("dd MMM yyyy  HH:mm") ?? "-"),
                    ("Completed", session.CompletedAt?.ToString("dd MMM yyyy  HH:mm") ?? "-"),
                    ("Inference", FormatDuration(session.InferenceDurationMs)),
                }));
            });

            // Priority signals column
            row.RelativeItem().PaddingLeft(12).Column(right =>
            {
                right.Spacing(7);

                right.Item()
                    .Text("Priority Signals")
                    .FontFamily("Arial")
                    .FontSize(Scale.Sub)
                    .Bold()
                    .FontColor(T.Ink);

                if (signals.Count == 0)
                {
                    right.Item().Element(c => EmptyState(c,
                        "No high-priority measurement deviations detected in the available dataset."));
                }
                else
                {
                    foreach (var signal in signals)
                    {
                        var tone = ToneForMeasurement(signal);

                        right.Item()
                            .Background(T.Surface)
                            .Border(0.5f).BorderColor(T.BorderSoft)
                            .BorderLeft(3).BorderColor(tone)
                            .PaddingLeft(10).PaddingRight(9).PaddingVertical(7)
                            .Row(item =>
                            {
                                item.RelativeItem().Column(txt =>
                                {
                                    txt.Item()
                                        .Text(signal.MeasurementName)
                                        .FontSize(Scale.Body)
                                        .Bold()
                                        .FontColor(T.Ink);

                                    txt.Item()
                                        .Text($"{signal.Status}  ·  {ComputeSeverity(signal)}")
                                        .FontSize(Scale.Caption)
                                        .FontColor(T.Muted);
                                });

                                item.ConstantItem(60).AlignRight().AlignMiddle()
                                    .Text(FormatMeasurementValue(signal))
                                    .FontSize(Scale.Body)
                                    .Bold()
                                    .FontColor(tone);
                            });
                    }
                }
            });
        });
    }

    // ─── Bolton ───────────────────────────────────────────────────────────────

    private static void ComposeBolton(IContainer container, BoltonResult bolton)
    {
        container.Column(col =>
        {
            col.Spacing(9);

            col.Item().Row(row =>
            {
                KpiCard(row.RelativeItem(), "Anterior Ratio",
                    bolton.AnteriorRatio.HasValue ? $"{bolton.AnteriorRatio:0.0}%" : "—",
                    BoltonTone(bolton.AnteriorFinding), EmptyToDash(bolton.AnteriorFinding));

                KpiDivider(row);

                KpiCard(row.RelativeItem(), "Overall Ratio",
                    bolton.OverallRatio.HasValue ? $"{bolton.OverallRatio:0.0}%" : "—",
                    BoltonTone(bolton.OverallFinding), EmptyToDash(bolton.OverallFinding));
            });

            col.Item()
                .Background(T.SurfaceAlt)
                .Padding(8)
                .Text("Reference — Anterior Bolton ratio 77.2 ± 1.65 %;  Overall Bolton ratio 91.3 ± 1.91 %. " +
                      "Discrepancies should be interpreted alongside arch form, tooth anatomy, restorations, and planned mechanics.")
                .FontSize(Scale.Small)
                .LineHeight(1.35f)
                .FontColor(T.Muted);
        });
    }

    // ─── Measurements ─────────────────────────────────────────────────────────

    private static void ComposeMeasurements(
        IContainer container,
        IEnumerable<Measurement> measurements,
        AnalysisType priority)
    {
        var groups = measurements
            .GroupBy(m => m.Category)
            .OrderBy(g => g.Key == priority ? 0 : 1)
            .ThenBy(g => g.Key?.ToString() ?? "General")
            .ToList();

        container.Column(col =>
        {
            col.Spacing(14);

            foreach (var group in groups)
            {
                var categoryName = group.Key?.ToString() ?? "General";
                var isPrimary = group.Key == priority;
                var abnormal = group.Count(m => m.Status != MeasurementStatus.Normal);

                col.Item().Column(gc =>
                {
                    gc.Spacing(6);

                    // Category header row
                    gc.Item().Row(hdr =>
                    {
                        hdr.AutoItem()
                            .Width(3)
                            .Background(isPrimary ? T.Teal : T.Faint);

                        hdr.RelativeItem().PaddingLeft(8)
                            .Text(categoryName.ToUpperInvariant() + " ANALYSIS")
                            .FontFamily("Arial")
                            .FontSize(Scale.Small)
                            .Bold()
                            .FontColor(isPrimary ? T.Teal : T.InkSoft)
                            .LetterSpacing(0.05f);

                        hdr.AutoItem().Element(c => ComposePill(c,
                            isPrimary ? "Selected Protocol" : $"{abnormal} Deviations",
                            isPrimary ? T.Teal : abnormal > 0 ? T.Amber : T.Green,
                            isPrimary ? T.TealLight : abnormal > 0 ? T.AmberLight : T.GreenLight));
                    });

                    // Table
                    gc.Item().Table(table =>
                    {
                        table.ColumnsDefinition(cols =>
                        {
                            cols.RelativeColumn(2.6f);  // Measurement
                            cols.RelativeColumn(1.0f);  // Value
                            cols.RelativeColumn(1.8f);  // Norm
                            cols.RelativeColumn(2.2f);  // Deviation bar
                            cols.RelativeColumn(1.1f);  // Status
                            cols.RelativeColumn(1.0f);  // Severity
                        });

                        // Header
                        TableRow(table, ["Measurement", "Value", "Norm (±SD)", "Deviation", "Status", "Severity"], header: true);

                        var rowIdx = 0;
                        foreach (var m in group.OrderBy(m => m.MeasurementName))
                        {
                            var bg = rowIdx++ % 2 == 0 ? T.White : T.SurfaceAlt;

                            Cell(table, m.MeasurementName, bg, bold: true);
                            Cell(table, FormatMeasurementValue(m), bg, color: T.Ink, alignRight: true);
                            Cell(table, FormatNorm(m), bg, color: T.Muted, alignCenter: true);

                            table.Cell()
                                .Background(bg)
                                .PaddingHorizontal(6)
                                .PaddingVertical(5)
                                .Element(c => DeviationBar(c, m));

                            Cell(table, m.Status.ToString(), bg, color: ToneForMeasurement(m), alignCenter: true);
                            Cell(table, ComputeSeverity(m), bg, color: SeverityTone(m), alignCenter: true);
                        }
                    });

                    if (CategoryReferences.TryGetValue(categoryName, out var reference))
                    {
                        gc.Item()
                            .Text("Reference — " + reference)
                            .FontSize(Scale.Tiny)
                            .Italic()
                            .FontColor(T.Faint);
                    }
                });
            }
        });
    }

    // ─── Treatment plans ─────────────────────────────────────────────────────

    private static void ComposeTreatmentPlans(IContainer container, IEnumerable<TreatmentPlan> plans)
    {
        var ordered = plans
            .OrderByDescending(p => p.IsPrimary)
            .ThenBy(p => p.PlanIndex)
            .ToList();

        container.Column(col =>
        {
            col.Spacing(10);

            foreach (var plan in ordered)
            {
                var accentColor = plan.IsPrimary ? T.Teal : T.Faint;

                col.Item()
                    .Background(T.Surface)
                    .Border(0.7f).BorderColor(plan.IsPrimary ? T.Teal : T.Border)
                    .BorderLeft(3).BorderColor(accentColor)
                    .Padding(12)
                    .Column(card =>
                    {
                        card.Spacing(7);

                        // Plan title row
                        card.Item().Row(row =>
                        {
                            row.RelativeItem().Column(title =>
                            {
                                title.Item()
                                    .Text(plan.TreatmentName)
                                    .FontFamily("Arial")
                                    .FontSize(Scale.Sub)
                                    .Bold()
                                    .FontColor(T.Ink);

                                title.Item().PaddingTop(2)
                                    .Text($"{plan.TreatmentType}  ·  {plan.Source}")
                                    .FontSize(Scale.Caption)
                                    .FontColor(T.Muted);
                            });

                            row.AutoItem().Element(c => ComposePill(c,
                                plan.IsPrimary ? "Primary" : "Alternative",
                                accentColor,
                                plan.IsPrimary ? T.TealLight : T.BorderSoft));

                            row.AutoItem().PaddingLeft(5).Element(c => ComposePill(c,
                                FormatPercent(plan.ConfidenceScore, "Confidence n/a"),
                                ConfidenceTone(plan.ConfidenceScore),
                                T.SurfaceAlt));
                        });

                        // Description
                        card.Item()
                            .Text(EmptyToDash(plan.Description))
                            .FontSize(Scale.Body)
                            .LineHeight(1.45f)
                            .FontColor(T.InkSoft);

                        // Rationale / risks
                        if (!string.IsNullOrWhiteSpace(plan.Rationale) || !string.IsNullOrWhiteSpace(plan.Risks))
                        {
                            card.Item().Row(details =>
                            {
                                details.RelativeItem().Element(c => SmallNarrative(c, "Rationale", plan.Rationale));
                                details.RelativeItem().PaddingLeft(8).Element(c => SmallNarrative(c, "Risks / Notes", plan.Risks));
                            });
                        }

                        // Footer meta
                        card.Item().Row(meta =>
                        {
                            meta.RelativeItem().Column(mc =>
                            {
                                mc.Item()
                                    .Text(plan.EstimatedDurationMonths.HasValue
                                        ? $"Estimated duration: {plan.EstimatedDurationMonths} months"
                                        : "Estimated duration: not specified")
                                    .FontSize(Scale.Caption)
                                    .FontColor(T.Muted);

                                if (!string.IsNullOrWhiteSpace(plan.RetentionRecommendation))
                                {
                                    mc.Item().PaddingTop(2)
                                        .Text("Retention: " + plan.RetentionRecommendation)
                                        .FontSize(Scale.Caption)
                                        .FontColor(T.InkSoft);
                                }
                            });

                            meta.RelativeItem().AlignRight().Column(ev =>
                            {
                                ev.Item().AlignRight()
                                    .Text("Evidence: " + EmptyToDash(plan.EvidenceReference))
                                    .FontSize(Scale.Caption)
                                    .Italic()
                                    .FontColor(T.Faint);

                                if (!string.IsNullOrWhiteSpace(plan.EvidenceLevel))
                                {
                                    ev.Item().AlignRight().PaddingTop(2)
                                        .Text("Level: " + plan.EvidenceLevel)
                                        .FontSize(Scale.Caption)
                                        .Bold()
                                        .FontColor(T.Teal);
                                }
                            });
                        });
                    });
            }
        });
    }

    // ─── Governance ───────────────────────────────────────────────────────────

    private static void ComposeGovernance(
        IContainer container,
        AnalysisSession session,
        GenerateReportRequest request)
    {
        container.Column(col =>
        {
            col.Spacing(10);

            col.Item().Row(row =>
            {
                row.RelativeItem().Element(c => InfoCard(c, "Included Sections", new[]
                {
                    ("X-ray image",    request.IncludesXray            ? "Included" : "Excluded"),
                    ("Overlay",        request.IncludesLandmarkOverlay ? "Included" : "Excluded"),
                    ("Measurements",   request.IncludesMeasurements    ? "Included" : "Excluded"),
                    ("Treatment plan", request.IncludesTreatmentPlan   ? "Included" : "Excluded"),
                }));

                row.RelativeItem().PaddingLeft(9).Element(c => InfoCard(c, "Clinical Safety", new[]
                {
                    ("Status",        session.Status.ToString()),
                    ("Diagnosis",     session.Diagnosis is null ? "Pending" : "Available"),
                    ("Landmarks",     session.Landmarks.Count.ToString()),
                    ("Manual edits",  session.Landmarks.Count(l => l.IsManuallyAdjusted).ToString()),
                }));
            });

            // Disclaimer
            col.Item()
                .Background(T.AmberLight)
                .BorderLeft(3).BorderColor(T.Amber)
                .PaddingLeft(12).PaddingRight(10).PaddingVertical(9)
                .Text("This report is AI-assisted decision support only. It must be reviewed by a licensed clinician " +
                      "together with the original radiograph, full medical and dental history, clinical examination, " +
                      "and local standard of care before any treatment decisions are made.")
                .FontSize(Scale.Body)
                .LineHeight(1.45f)
                .FontColor(T.InkSoft);

            // Sign-off block
            col.Item().Row(row =>
            {
                row.RelativeItem();
                row.ConstantItem(240)
                    .Background(T.Surface)
                    .Border(0.7f).BorderColor(T.Border)
                    .Padding(14)
                    .Column(sig =>
                    {
                        sig.Item()
                            .Text("AUTHORISED CLINICIAN")
                            .FontSize(Scale.Tiny)
                            .Bold()
                            .FontColor(T.Teal)
                            .LetterSpacing(0.08f);

                        sig.Item().PaddingTop(28).LineHorizontal(0.7f).LineColor(T.Border);

                        sig.Item().PaddingTop(5).Row(line =>
                        {
                            line.RelativeItem()
                                .Text("Signature / stamp")
                                .FontSize(Scale.Caption)
                                .FontColor(T.Faint);

                            line.AutoItem()
                                .Text($"Date: {DateTime.UtcNow:dd MMM yyyy}")
                                .FontSize(Scale.Caption)
                                .FontColor(T.Faint);
                        });
                    });
            });
        });
    }

    // ─── Normative references ─────────────────────────────────────────────────

    private static void ComposeNormativeReferences(IContainer container, IReadOnlyList<string> usedCategories)
    {
        container.Column(col =>
        {
            col.Spacing(6);

            col.Item()
                .Text("All norms referenced in this report are derived from the peer-reviewed literature listed below.")
                .FontSize(Scale.Small)
                .FontColor(T.Muted)
                .LineHeight(1.4f);

            col.Item().PaddingTop(4).Column(refs =>
            {
                refs.Spacing(5);

                foreach (var cat in usedCategories.OrderBy(c => c, StringComparer.OrdinalIgnoreCase))
                {
                    if (!CategoryReferences.TryGetValue(cat, out var citation)) continue;

                    refs.Item().Row(row =>
                    {
                        row.ConstantItem(3).Background(T.Teal);

                        row.RelativeItem().PaddingLeft(9).Column(entry =>
                        {
                            entry.Item()
                                .Text(cat)
                                .FontSize(Scale.Small)
                                .Bold()
                                .FontColor(T.Ink);

                            entry.Item().PaddingTop(1)
                                .Text(citation)
                                .FontSize(Scale.Small)
                                .Italic()
                                .FontColor(T.InkSoft)
                                .LineHeight(1.35f);
                        });
                    });
                }
            });

            col.Item().PaddingTop(7)
                .Background(T.SurfaceAlt)
                .Border(0.5f).BorderColor(T.BorderSoft)
                .Padding(9)
                .Text("This report was generated by the CephAI automated cephalometric analysis platform. " +
                      "All measurements and classifications are produced by AI-assisted analysis and must be " +
                      "reviewed and validated by a licensed clinician prior to use in diagnosis or treatment planning.")
                .FontSize(Scale.Small)
                .FontColor(T.Muted)
                .LineHeight(1.4f);
        });
    }

    // ─── Footer ───────────────────────────────────────────────────────────────

    private static void ComposeFooter(IContainer container, AnalysisSession session, bool isDraft)
    {
        container
            .Background(T.HeaderBg)
            .PaddingHorizontal(24)
            .PaddingVertical(7)
            .Row(row =>
            {
                row.RelativeItem().Column(left =>
                {
                    left.Item()
                        .Text("CephAI Advanced Imaging  —  Professional Cephalometric Analysis Report")
                        .FontSize(Scale.Caption)
                        .FontColor(T.HeaderDim);

                    if (isDraft)
                    {
                        left.Item()
                            .Text("DRAFT — Not valid until reviewed and finalised by the treating clinician.")
                            .FontSize(Scale.Caption)
                            .Bold()
                            .FontColor(T.Amber);
                    }
                });

                row.ConstantItem(160).AlignRight().Column(right =>
                {
                    right.Item().AlignRight()
                        .Text($"Session {session.Id.ToString("N")[..8].ToUpperInvariant()}")
                        .FontSize(Scale.Caption)
                        .FontColor(T.HeaderDim);

                    right.Item().PaddingTop(3).AlignRight().Text(txt =>
                    {
                        txt.DefaultTextStyle(x => x.FontSize(Scale.Caption).FontColor(T.HeaderText));
                        txt.Span("Page ");
                        txt.CurrentPageNumber().Bold().FontColor(T.White);
                        txt.Span(" of ");
                        txt.TotalPages();
                    });
                });
            });
    }

    // ─── Atomic UI components ─────────────────────────────────────────────────

    /// <summary>Pill-shaped status badge with distinct foreground/background colours.</summary>
    private static void ComposePill(
        IContainer container,
        string text,
        string fgColor,
        string bgColor,
        bool light = true)
    {
        container
            .Background(bgColor)
            .PaddingHorizontal(8)
            .PaddingVertical(3)
            .Text(text)
            .FontFamily("Arial")
            .FontSize(Scale.Tiny)
            .Bold()
            .FontColor(light ? fgColor : T.White);
    }

    /// <summary>KPI metric card for the executive summary strip.</summary>
    private static void KpiCard(
        IContainer container,
        string label,
        string value,
        string valueColor,
        string helper)
    {
        container
            .PaddingHorizontal(12)
            .PaddingVertical(10)
            .Column(col =>
            {
                col.Item()
                    .Text(label.ToUpperInvariant())
                    .FontSize(Scale.Tiny)
                    .Bold()
                    .FontColor(T.Muted)
                    .LetterSpacing(0.07f);

                col.Item().PaddingTop(4)
                    .Text(value)
                    .FontFamily("Arial")
                    .FontSize(13f)
                    .Bold()
                    .FontColor(valueColor);

                col.Item().PaddingTop(2)
                    .Text(helper)
                    .FontSize(Scale.Tiny)
                    .FontColor(T.Faint);
            });
    }

    private static void KpiDivider(RowDescriptor row)
    {
        row.ConstantItem(1)
            .Padding(8)
            .Background(T.Border);
    }

    /// <summary>Compact stat for the executive summary right column.</summary>
    private static void MiniStat(ColumnDescriptor column, string label, string value, string helper)
    {
        column.Item()
            .Background(T.SurfaceAlt)
            .PaddingHorizontal(9)
            .PaddingVertical(6)
            .Column(card =>
            {
                card.Item()
                    .Text(label.ToUpperInvariant())
                    .FontSize(Scale.Tiny)
                    .Bold()
                    .FontColor(T.Muted)
                    .LetterSpacing(0.06f);

                card.Item()
                    .Text(value)
                    .FontSize(Scale.Body)
                    .Bold()
                    .FontColor(T.Ink);

                card.Item()
                    .Text(helper)
                    .FontSize(Scale.Tiny)
                    .FontColor(T.Faint);
            });
    }

    /// <summary>Labelled data card with key-value rows.</summary>
    private static void InfoCard(
        IContainer container,
        string title,
        IEnumerable<(string Label, string Value)> rows)
    {
        container
            .Background(T.SurfaceAlt)
            .Border(0.5f).BorderColor(T.BorderSoft)
            .Padding(10)
            .Column(col =>
            {
                col.Item()
                    .Text(title.ToUpperInvariant())
                    .FontSize(Scale.Tiny)
                    .Bold()
                    .FontColor(T.Teal)
                    .LetterSpacing(0.08f);

                foreach (var (label, value) in rows)
                {
                    col.Item().PaddingTop(6).Row(row =>
                    {
                        row.ConstantItem(70)
                            .Text(label)
                            .FontSize(Scale.Caption)
                            .FontColor(T.Muted);

                        row.RelativeItem()
                            .Text(EmptyToDash(value))
                            .FontSize(Scale.Small)
                            .Bold()
                            .FontColor(T.Ink);
                    });
                }
            });
    }

    /// <summary>Framed radiograph with dark letterbox background.</summary>
    private static void ImageCard(IContainer container, string title, byte[] bytes, int height = 240)
    {
        container
            .Background(T.Surface)
            .Border(0.7f).BorderColor(T.Border)
            .Padding(9)
            .Column(col =>
            {
                col.Item()
                    .Text(title)
                    .FontFamily("Arial")
                    .FontSize(Scale.Small)
                    .Bold()
                    .FontColor(T.Ink);

                col.Item().PaddingTop(7)
                    .Height(height)
                    .Background("#0B1220")
                    .Padding(5)
                    .Image(bytes)
                    .FitArea();
            });
    }

    /// <summary>Compact two-field narrative panel used inside treatment plan cards.</summary>
    private static void SmallNarrative(IContainer container, string title, string? text)
    {
        container
            .Background(T.SurfaceAlt)
            .Border(0.4f).BorderColor(T.BorderSoft)
            .Padding(8)
            .Column(col =>
            {
                col.Item()
                    .Text(title.ToUpperInvariant())
                    .FontSize(Scale.Tiny)
                    .Bold()
                    .FontColor(T.Muted)
                    .LetterSpacing(0.06f);

                col.Item().PaddingTop(4)
                    .Text(EmptyToDash(text))
                    .FontSize(Scale.Small)
                    .LineHeight(1.35f)
                    .FontColor(T.InkSoft);
            });
    }

    /// <summary>Empty-state placeholder panel.</summary>
    private static void EmptyState(IContainer container, string message)
    {
        container
            .Background(T.SurfaceAlt)
            .Border(0.5f).BorderColor(T.BorderSoft)
            .Padding(11)
            .Text(message)
            .FontSize(Scale.Body)
            .LineHeight(1.4f)
            .FontColor(T.Muted);
    }

    /// <summary>Diagnostic category card with top accent bar.</summary>
    private static void DiagCard(
        IContainer container,
        string label,
        string value,
        string accentColor,
        string helper)
    {
        container
            .PaddingLeft(5)
            .Background(T.SurfaceAlt)
            .BorderTop(3).BorderColor(accentColor)
            .Padding(10)
            .Column(col =>
            {
                col.Item()
                    .Text(label.ToUpperInvariant())
                    .FontSize(Scale.Tiny)
                    .Bold()
                    .FontColor(T.Muted)
                    .LetterSpacing(0.07f);

                col.Item().PaddingTop(4)
                    .Text(value)
                    .FontFamily("Arial")
                    .FontSize(Scale.Sub)
                    .Bold()
                    .FontColor(T.Ink);

                col.Item().PaddingTop(3)
                    .Text(helper)
                    .FontSize(Scale.Caption)
                    .FontColor(T.Faint);
            });
    }

    // ─── Table helpers ────────────────────────────────────────────────────────

    private static void TableRow(TableDescriptor table, IReadOnlyList<string> headers, bool header = false)
    {
        foreach (var h in headers)
        {
            var cell = table.Cell()
                .Background(header ? T.Ink : T.SurfaceAlt)
                .PaddingHorizontal(6)
                .PaddingVertical(header ? 6 : 4);

            cell.Text(h)
                .FontSize(header ? Scale.Caption : Scale.Small)
                .Bold()
                .FontColor(header ? T.White : T.InkSoft);
        }
    }

    private static void Cell(
        TableDescriptor table,
        string text,
        string background,
        bool bold = false,
        string? color = null,
        bool alignRight = false,
        bool alignCenter = false)
    {
        var cell = table.Cell()
            .Background(background)
            .PaddingHorizontal(6)
            .PaddingVertical(4);

        if (alignRight) cell = cell.AlignRight();
        else if (alignCenter) cell = cell.AlignCenter();

        var descriptor = cell.Text(EmptyToDash(text))
            .FontSize(Scale.Small)
            .FontColor(color ?? T.InkSoft);

        if (bold) descriptor.Bold();
    }

    // ─── Deviation bar ────────────────────────────────────────────────────────

    private static void DeviationBar(IContainer container, Measurement measurement)
    {
        var z = GetZScore(measurement);
        var magnitude = Math.Clamp((float)Math.Abs(z) / 3f, 0f, 1f);
        var color = ToneForMeasurement(measurement);
        const float eps = 0.001f;

        container.Column(col =>
        {
            col.Item().Height(7).Background(T.BorderSoft).Layers(layers =>
            {
                // Centre reference line
                layers.Layer().AlignCenter().Width(0.8f).Background(T.Faint);

                layers.PrimaryLayer().Row(row =>
                {
                    if (z < 0)
                    {
                        row.RelativeItem(Math.Max(eps, 50f * (1f - magnitude)));
                        row.RelativeItem(Math.Max(eps, 50f * magnitude)).Background(color);
                        row.RelativeItem(50f);
                    }
                    else
                    {
                        row.RelativeItem(50f);
                        row.RelativeItem(Math.Max(eps, 50f * magnitude)).Background(color);
                        row.RelativeItem(Math.Max(eps, 50f * (1f - magnitude)));
                    }
                });
            });

            col.Item().PaddingTop(2)
                .Text($"{z:+0.0;-0.0;0.0} SD")
                .FontSize(Scale.Tiny)
                .FontColor(T.Faint);
        });
    }

    // ─── Header row helper ────────────────────────────────────────────────────

    private static void HeaderMeta(RowDescriptor row, string label, string value)
    {
        row.RelativeItem().Row(item =>
        {
            item.AutoItem()
                .Text(label + " ")
                .FontSize(Scale.Caption)
                .FontColor(T.HeaderDim);

            item.RelativeItem()
                .Text(EmptyToDash(value))
                .FontSize(Scale.Small)
                .SemiBold()
                .FontColor(T.HeaderText);
        });
    }

    // ─── String / logic helpers ───────────────────────────────────────────────

    private static string ComposeSummarySentence(AnalysisSession session)
    {
        if (session.Diagnosis is null)
            return "The analysis session has been prepared but a complete diagnosis is not yet available. " +
                   "Review image quality, landmarks, and AI service status before generating a final clinical interpretation.";

        var d = session.Diagnosis;
        var confidence = FormatPercent(d.ConfidenceScore, "pending confidence");
        return $"AI-assisted analysis suggests {d.SkeletalClass} skeletal relationship with a " +
               $"{d.VerticalPattern} vertical pattern and {d.SoftTissueProfile} soft-tissue profile. " +
               $"Diagnostic confidence: {confidence}.";
    }

    private static string BuildFallbackDiagnosisSummary(Diagnosis d) =>
        $"Skeletal class {d.SkeletalClass};  vertical {d.VerticalPattern};  " +
        $"maxilla {d.MaxillaryPosition};  mandible {d.MandibularPosition};  " +
        $"upper incisors {d.UpperIncisorInclination};  lower incisors {d.LowerIncisorInclination}.";

    private static bool IsRiskSignal(Measurement m) =>
        m.Status != MeasurementStatus.Normal || Math.Abs(GetZScore(m)) >= 1.5m;

    private static decimal GetZScore(Measurement m)
    {
        var norm = ResolveNorm(m);
        return norm.Sd <= 0 ? 0m : (m.Value - norm.Mean) / norm.Sd;
    }

    private static NormReference ResolveNorm(Measurement m)
    {
        if (Norms.TryGetValue(m.MeasurementCode, out var ref_)) return ref_;
        if (m.NormSD > 0) return new(m.NormMean, m.NormSD, "Stored norm");

        if (m.NormalMin != 0 || m.NormalMax != 0)
        {
            var mean = (m.NormalMin + m.NormalMax) / 2m;
            var sd = Math.Max(Math.Abs(m.NormalMax - m.NormalMin) / 4m, 1m);
            return new(mean, sd, "Stored range");
        }

        return new(m.Value, 1m, "Unavailable");
    }

    private static string FormatNorm(Measurement m)
    {
        var norm = ResolveNorm(m);
        return norm.Source == "Stored range"
            ? $"{m.NormalMin:0.0}–{m.NormalMax:0.0}"
            : $"{norm.Mean:0.0} ±{norm.Sd:0.0}";
    }

    private static string FormatMeasurementValue(Measurement m) => m.Unit switch
    {
        MeasurementUnit.Degrees => $"{m.Value:0.0}°",
        MeasurementUnit.Percent => $"{m.Value:0.0}%",
        _ => $"{m.Value:0.0} mm",
    };

    private static string ComputeSeverity(Measurement m)
    {
        if (m.Severity != DeviationSeverity.Normal) return m.Severity.ToString();
        var z = Math.Abs(GetZScore(m));
        return z <= 1m ? "Normal" : z <= 2m ? "Mild" : z <= 3m ? "Moderate" : "Severe";
    }

    private static string FormatDuration(int? ms) =>
        ms is null or <= 0 ? "-" :
        ms.Value < 1000 ? $"{ms.Value} ms" :
                             $"{ms.Value / 1000m:0.0} s";

    private static string FormatDimensions(XRayImage? img) =>
        img?.WidthPx is null || img.HeightPx is null ? "-" : $"{img.WidthPx} × {img.HeightPx} px";

    private static string FormatPercent(decimal? value, string fallback)
    {
        if (!value.HasValue) return fallback;
        var n = value.Value > 1m ? value.Value / 100m : value.Value;
        return $"{n:P0}";
    }

    private static string EmptyToDash(string? value) =>
        string.IsNullOrWhiteSpace(value) ? "—" : value.Trim();

    // ─── Colour semantics ─────────────────────────────────────────────────────

    private static string ToneForMeasurement(Measurement m) => m.Status switch
    {
        MeasurementStatus.Normal => T.Green,
        MeasurementStatus.Increased => T.Amber,
        MeasurementStatus.Decreased => T.Red,
        _ => T.Muted,
    };

    private static string SeverityTone(Measurement m) => ComputeSeverity(m) switch
    {
        "Normal" => T.Green,
        "Mild" => T.Amber,
        "Moderate" => T.Amber,
        "Severe" => T.Red,
        _ => ToneForMeasurement(m),
    };

    private static string ConfidenceTone(decimal? confidence)
    {
        if (!confidence.HasValue) return T.Muted;
        var n = confidence.Value > 1m ? confidence.Value / 100m : confidence.Value;
        return n >= 0.85m ? T.Green :
               n >= 0.65m ? T.Cyan :
               n >= 0.45m ? T.Amber : T.Red;
    }

    private static string ToneForSkeletal(SkeletalClass? s) => s switch
    {
        SkeletalClass.ClassI => T.Green,
        SkeletalClass.ClassII => T.Amber,
        SkeletalClass.ClassIII => T.Red,
        _ => T.Muted,
    };

    private static string ToneLightForSkeletal(SkeletalClass? s) => s switch
    {
        SkeletalClass.ClassI => T.GreenLight,
        SkeletalClass.ClassII => T.AmberLight,
        SkeletalClass.ClassIII => T.RedLight,
        _ => T.SurfaceAlt,
    };

    private static string ToneForVertical(VerticalPattern? v) => v switch
    {
        VerticalPattern.Normal => T.Green,
        VerticalPattern.LowAngle => T.Cyan,
        VerticalPattern.HighAngle => T.Amber,
        _ => T.Muted,
    };

    private static string ToneLightForVertical(VerticalPattern? v) => v switch
    {
        VerticalPattern.Normal => T.GreenLight,
        VerticalPattern.LowAngle => T.CyanLight,
        VerticalPattern.HighAngle => T.AmberLight,
        _ => T.SurfaceAlt,
    };

    private static string BoltonTone(string? finding) =>
        string.IsNullOrWhiteSpace(finding) ? T.Muted :
        finding.Contains("normal", StringComparison.OrdinalIgnoreCase) ? T.Green : T.Amber;
}