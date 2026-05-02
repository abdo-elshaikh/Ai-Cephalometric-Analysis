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
/// The layout follows a modern diagnostic report pattern: compact header,
/// executive summary, patient/study context, image review, AI findings,
/// measurement deviations, treatment recommendations, references, and sign-off.
/// </summary>
public sealed class QuestPdfReportGenerator(
    IStorageService storage,
    IImageOverlayService imageOverlayService,
    ILogger<QuestPdfReportGenerator> logger) : IReportGenerator
{
    private readonly IStorageService _storage = storage;
    private readonly IImageOverlayService _imageOverlayService = imageOverlayService;
    private readonly ILogger<QuestPdfReportGenerator> _logger = logger;

    private static class Palette
    {
        public const string Ink = "#101828";
        public const string InkSoft = "#344054";
        public const string Muted = "#667085";
        public const string Faint = "#98A2B3";
        public const string Paper = "#FFFFFF";
        public const string Page = "#F3F6F8";
        public const string Panel = "#F8FAFC";
        public const string Border = "#D9E2EA";
        public const string BorderSoft = "#E7EEF5";
        public const string Brand = "#0F766E";
        public const string BrandDark = "#0B3B3A";
        public const string BrandSoft = "#CCFBF1";
        public const string Navy = "#0B1220";
        public const string Navy2 = "#111C2E";
        public const string Blue = "#2563EB";
        public const string Cyan = "#0891B2";
        public const string Green = "#059669";
        public const string Amber = "#D97706";
        public const string Red = "#DC2626";
        public const string Violet = "#7C3AED";
        public const string White = "#FFFFFF";
    }

    private sealed class ReportContext
    {
        private int _sectionIndex;
        public int NextSection() => ++_sectionIndex;
    }

    private sealed record ReportAssets(byte[]? OriginalXray, byte[]? OverlayXray);

    private readonly record struct NormReference(decimal Mean, decimal Sd, string Source);

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
                page.PageColor(Palette.Page);
                page.DefaultTextStyle(x => x
                    .FontFamily("Arial")
                    .FontSize(8.8f)
                    .FontColor(Palette.Ink));

                page.Header().Element(c => ComposeHeader(c, session, request, generatedAt, isDraft));
                page.Content().Element(c => ComposeContent(c, new ReportContext(), session, request, assets, generatedAt, isDraft));
                page.Footer().Element(c => ComposeFooter(c, session, isDraft));
            });
        });

        using var stream = new MemoryStream();
        document.GeneratePdf(stream);
        return stream.ToArray();
    }

    private async Task<ReportAssets> LoadReportAssetsAsync(
        AnalysisSession session,
        GenerateReportRequest request,
        CancellationToken ct)
    {
        if (!request.IncludesXray || session.XRayImage is null || string.IsNullOrWhiteSpace(session.XRayImage.StorageUrl))
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
                    try
                    {
                        overlayStream = await _storage.DownloadFileAsync(session.ResultImageUrl, ct);
                    }
                    catch (Exception ex)
                    {
                        _logger.LogWarning(ex, "Report overlay snapshot download failed for session {SessionId}. A live overlay will be generated.", session.Id);
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
            _logger.LogError(ex, "Unable to prepare X-ray assets for report generation. SessionId={SessionId}", session.Id);
        }

        return new ReportAssets(original, overlay);
    }

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

        container.Column(column =>
        {
            column.Item()
                .Background(Palette.Navy)
                .PaddingHorizontal(24)
                .PaddingVertical(13)
                .Row(row =>
                {
                    row.RelativeItem(1.1f).Column(left =>
                    {
                        left.Item().Text("CephAI")
                            .FontSize(20)
                            .Bold()
                            .FontColor(Palette.White)
                            .LetterSpacing(0.04f);

                        left.Item().PaddingTop(2).Text("Advanced cephalometric intelligence")
                            .FontSize(7.4f)
                            .FontColor("#A7F3D0")
                            .LetterSpacing(0.08f);
                    });

                    row.RelativeItem(1.5f).AlignCenter().Column(center =>
                    {
                        center.Item().AlignCenter().Text("CLINICAL CEPHALOMETRIC REPORT")
                            .FontSize(11.5f)
                            .SemiBold()
                            .FontColor(Palette.White)
                            .LetterSpacing(0.07f);

                        center.Item().PaddingTop(4).AlignCenter().Text($"{session.AnalysisType} analysis - {request.Language.ToUpperInvariant()}")
                            .FontSize(7.4f)
                            .FontColor("#CFFAFE");
                    });

                    row.RelativeItem(1.1f).AlignRight().Column(right =>
                    {
                        right.Item().AlignRight().Text($"Generated {generatedAt:dd MMM yyyy HH:mm} UTC")
                            .FontSize(7.2f)
                            .FontColor("#CBD5E1");

                        right.Item().PaddingTop(5).AlignRight().Row(badges =>
                        {
                            badges.RelativeItem();
                            badges.AutoItem().Element(c => ComposeBadge(c, isDraft ? "DRAFT" : "FINAL", isDraft ? Palette.Amber : Palette.Green));
                            badges.AutoItem().PaddingLeft(4).Element(c => ComposeBadge(c, $"AI {confidence}", Palette.Cyan));
                        });
                    });
                });

            column.Item()
                .Background(Palette.Navy2)
                .PaddingHorizontal(24)
                .PaddingVertical(7)
                .Row(row =>
                {
                    HeaderMeta(row, "Patient", patientName);
                    HeaderMeta(row, "MRN", mrn);
                    HeaderMeta(row, "Session", session.Id.ToString("N")[..10].ToUpperInvariant());
                    HeaderMeta(row, "Model", EmptyToDash(session.ModelVersion));
                });
        });
    }

    private static void ComposeContent(
        IContainer container,
        ReportContext context,
        AnalysisSession session,
        GenerateReportRequest request,
        ReportAssets assets,
        DateTime generatedAt,
        bool isDraft)
    {
        container.PaddingHorizontal(22).PaddingTop(15).PaddingBottom(13).Column(column =>
        {
            column.Spacing(13);

            column.Item().Element(c => ComposeExecutiveSummary(c, session, generatedAt, isDraft));

            ComposeSection(column, context, "Patient and Study Profile", "Intake context",
                c => ComposePatientStudyProfile(c, session));

            if (request.IncludesXray)
            {
                ComposeSection(column, context, "Image Review", "Radiograph and landmark overlay",
                    c => ComposeImageReview(c, session, assets, request.IncludesLandmarkOverlay));
            }

            if (request.IncludesLandmarkOverlay && session.Landmarks.Count > 0)
            {
                ComposeSection(column, context, "Landmark Quality Control", "AI detection confidence",
                    c => ComposeLandmarkQuality(c, session));
            }

            if (session.Diagnosis is not null)
            {
                ComposeSection(column, context, "Diagnosis", "Clinical classification",
                    c => ComposeDiagnosis(c, session.Diagnosis));

                ComposeSection(column, context, "Growth and Risk Signals", "Decision support",
                    c => ComposeGrowthAndRisk(c, session));
            }

            if (session.Diagnosis?.BoltonResult is not null)
            {
                ComposeSection(column, context, "Bolton Tooth-Size Analysis", "Inter-arch proportionality",
                    c => ComposeBolton(c, session.Diagnosis.BoltonResult));
            }

            if (request.IncludesMeasurements && session.Measurements.Count > 0)
            {
                ComposeSection(column, context, "Measurement Analysis", "Norms, deviations, and severity",
                    c => ComposeMeasurements(c, session.Measurements, session.AnalysisType));
            }

            if (request.IncludesTreatmentPlan && session.Diagnosis?.TreatmentPlans.Count > 0)
            {
                ComposeSection(column, context, "Treatment Planning", "Ranked recommendations",
                    c => ComposeTreatmentPlans(c, session.Diagnosis.TreatmentPlans));
            }

            ComposeSection(column, context, "Clinical Governance", "Review, limitations, and sign-off",
                c => ComposeGovernance(c, session, request));

            var usedCategories = session.Measurements
                .Where(m => m.Category.HasValue)
                .Select(m => m.Category!.Value.ToString())
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .Where(cat => CategoryReferences.ContainsKey(cat))
                .ToList();

            if (usedCategories.Count > 0)
            {
                ComposeSection(column, context, "Normative References", "Literature sources for reported norms",
                    c => ComposeNormativeReferences(c, usedCategories));
            }
        });
    }

    private static void ComposeNormativeReferences(IContainer container, IReadOnlyList<string> usedCategories)
    {
        container.Column(col =>
        {
            col.Spacing(5);

            col.Item().Text("All measurement norms referenced in this report are derived from the following peer-reviewed literature and protocol sources.")
                .FontSize(8.2f)
                .FontColor(Palette.Muted)
                .LineHeight(1.35f);

            col.Item().PaddingTop(4).Column(refs =>
            {
                refs.Spacing(4);

                foreach (var cat in usedCategories.OrderBy(c => c, StringComparer.OrdinalIgnoreCase))
                {
                    if (!CategoryReferences.TryGetValue(cat, out var citation)) continue;

                    refs.Item().Row(row =>
                    {
                        row.ConstantItem(5)
                            .Height(5)
                            .AlignMiddle()
                            .Background(Palette.Brand);

                        row.RelativeItem()
                            .PaddingLeft(8)
                            .Column(entry =>
                            {
                                entry.Item().Text(cat)
                                    .FontSize(7.8f)
                                    .Bold()
                                    .FontColor(Palette.Navy);

                                entry.Item().PaddingTop(1).Text(citation)
                                    .FontSize(7.5f)
                                    .Italic()
                                    .FontColor(Palette.InkSoft)
                                    .LineHeight(1.3f);
                            });
                    });
                }
            });

            col.Item().PaddingTop(6)
                .Background(Palette.Panel)
                .Border(0.5f)
                .BorderColor(Palette.BorderSoft)
                .Padding(8)
                .Text("This report was generated using the CephAI automated cephalometric analysis platform. " +
                      "All measurements and classifications are produced by AI-assisted analysis and must be reviewed " +
                      "and validated by a licensed clinician prior to use in diagnosis or treatment planning.")
                .FontSize(7.5f)
                .FontColor(Palette.Muted)
                .LineHeight(1.35f);
        });
    }

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
        var lowConfidenceCount = session.Landmarks.Count(l => l.ConfidenceScore.HasValue && l.ConfidenceScore.Value < 0.75m);

        container
            .Background(Palette.Paper)
            .Border(0.75f)
            .BorderColor(Palette.Border)
            .Padding(14)
            .Column(column =>
            {
                column.Spacing(12);

                column.Item().Row(row =>
                {
                    row.RelativeItem(1.8f).Column(left =>
                    {
                        left.Item().Text("Executive Summary")
                            .FontSize(16)
                            .Bold()
                            .FontColor(Palette.Navy)
                            .LetterSpacing(-0.02f);

                        left.Item().PaddingTop(5).Text(ComposeSummarySentence(session))
                            .FontSize(9.2f)
                            .LineHeight(1.35f)
                            .FontColor(Palette.InkSoft);

                        left.Item().PaddingTop(8).Row(flags =>
                        {
                            flags.AutoItem().Element(c => ComposeBadge(c, diagnosis?.SkeletalClass.ToString() ?? "Diagnosis pending", ToneForSkeletal(diagnosis?.SkeletalClass)));
                            flags.AutoItem().PaddingLeft(5).Element(c => ComposeBadge(c, diagnosis?.VerticalPattern.ToString() ?? "Vertical pending", ToneForVertical(diagnosis?.VerticalPattern)));
                            flags.AutoItem().PaddingLeft(5).Element(c => ComposeBadge(c, isDraft ? "Needs clinician review" : "Clinician finalized", isDraft ? Palette.Amber : Palette.Green));
                        });
                    });

                    row.RelativeItem(1.1f).PaddingLeft(12).Column(right =>
                    {
                        right.Spacing(6);
                        ComposeMiniStat(right, "Patient", patient?.FullName ?? "Unknown", EmptyToDash(patient?.MedicalRecordNo));
                        ComposeMiniStat(right, "Generated", generatedAt.ToString("dd MMM yyyy"), $"{generatedAt:HH:mm} UTC");
                        ComposeMiniStat(right, "Image", image?.IsCalibrated == true ? "Calibrated" : "Uncalibrated", FormatDimensions(image));
                    });
                });

                column.Item().Row(row =>
                {
                    var abnormalTone = abnormalCount == 0 ? Palette.Green : abnormalCount <= 3 ? Palette.Amber : Palette.Red;
                    var landmarkTone = lowConfidenceCount == 0 ? Palette.Brand : lowConfidenceCount <= 2 ? Palette.Amber : Palette.Red;
                    MetricCard(row.RelativeItem(), "AI Confidence", FormatPercent(confidence, "Pending"), ConfidenceTone(confidence), "Diagnosis confidence");
                    MetricCard(row.RelativeItem(), "Risk Signals", abnormalCount.ToString(), abnormalTone, $"{abnormalCount}/{session.Measurements.Count} outside normal");
                    MetricCard(row.RelativeItem(), "Landmarks", session.Landmarks.Count.ToString(), landmarkTone, $"{lowConfidenceCount} low confidence");
                    MetricCard(row.RelativeItem(), "Runtime", FormatDuration(session.TotalDurationMs ?? session.InferenceDurationMs), Palette.Violet, EmptyToDash(session.ModelVersion));
                });
            });
    }

    private static void ComposeSection(
        ColumnDescriptor column,
        ReportContext context,
        string title,
        string eyebrow,
        Action<IContainer> content)
    {
        var number = context.NextSection();

        column.Item()
            .Background(Palette.Paper)
            .Border(0.75f)
            .BorderColor(Palette.Border)
            .Padding(13)
            .Column(section =>
            {
                section.Spacing(10);
                section.Item().Row(row =>
                {
                    row.ConstantItem(27)
                        .Height(24)
                        .Background(Palette.Navy)
                        .AlignCenter()
                        .AlignMiddle()
                        .Text(number.ToString("00"))
                        .FontSize(8)
                        .Bold()
                        .FontColor(Palette.White);

                    row.RelativeItem().PaddingLeft(8).Column(head =>
                    {
                        head.Item().Text(eyebrow.ToUpperInvariant())
                            .FontSize(6.8f)
                            .SemiBold()
                            .FontColor(Palette.Brand)
                            .LetterSpacing(0.08f);

                        head.Item().PaddingTop(2).Text(title)
                            .FontSize(12)
                            .Bold()
                            .FontColor(Palette.Navy);
                    });
                });

                section.Item().LineHorizontal(0.7f).LineColor(Palette.BorderSoft);
                section.Item().Element(content);
            });
    }

    private static void ComposePatientStudyProfile(IContainer container, AnalysisSession session)
    {
        var patient = session.XRayImage?.Study?.Patient;
        var study = session.XRayImage?.Study;
        var image = session.XRayImage;

        container.Column(column =>
        {
            column.Spacing(10);

            column.Item().Row(row =>
            {
                row.RelativeItem().Element(c => ComposeInfoCard(c, "Patient", new[]
                {
                    ("Name", patient?.FullName ?? "Unknown"),
                    ("Medical record", EmptyToDash(patient?.MedicalRecordNo)),
                    ("Age / Gender", patient is null ? "-" : $"{patient.Age} years / {patient.Gender}"),
                    ("Contact", EmptyToDash(patient?.ContactNumber ?? patient?.Phone ?? patient?.Email)),
                }));

                row.RelativeItem().PaddingLeft(9).Element(c => ComposeInfoCard(c, "Study", new[]
                {
                    ("Study date", study?.StudyDate == default ? "-" : study?.StudyDate.ToString("dd MMM yyyy") ?? "-"),
                    ("Study type", study?.StudyType.ToString() ?? "-"),
                    ("Case title", EmptyToDash(study?.Title)),
                    ("Status", study?.Status.ToString() ?? "-"),
                }));

                row.RelativeItem().PaddingLeft(9).Element(c => ComposeInfoCard(c, "Image", new[]
                {
                    ("File", EmptyToDash(image?.FileName)),
                    ("Format", image?.FileFormat.ToString() ?? "-"),
                    ("Dimensions", FormatDimensions(image)),
                    ("Calibration", image?.IsCalibrated == true ? $"{image.PixelSpacingMm:0.###} mm/px" : "Not calibrated"),
                }));
            });

            if (!string.IsNullOrWhiteSpace(study?.ClinicalNotes) || !string.IsNullOrWhiteSpace(patient?.Notes))
            {
                column.Item()
                    .Background(Palette.Panel)
                    .Border(0.5f)
                    .BorderColor(Palette.BorderSoft)
                    .Padding(9)
                    .Column(notes =>
                    {
                        notes.Item().Text("Clinical notes")
                            .FontSize(7.5f)
                            .Bold()
                            .FontColor(Palette.Muted);

                        notes.Item().PaddingTop(3).Text(EmptyToDash(study?.ClinicalNotes ?? patient?.Notes))
                            .FontSize(8.4f)
                            .LineHeight(1.35f)
                            .FontColor(Palette.InkSoft);
                    });
            }
        });
    }

    private static void ComposeImageReview(
        IContainer container,
        AnalysisSession session,
        ReportAssets assets,
        bool includeOverlay)
    {
        if (assets.OriginalXray is null)
        {
            ComposeEmptyState(container, "The radiograph could not be embedded in this report. The stored file may be unavailable or in an unsupported image format.");
            return;
        }

        container.Column(column =>
        {
            column.Spacing(8);

            if (includeOverlay && assets.OverlayXray is not null)
            {
                column.Item().Row(row =>
                {
                    row.RelativeItem().Element(c => ComposeImageCard(c, "Original radiograph", assets.OriginalXray));
                    row.RelativeItem().PaddingLeft(10).Element(c => ComposeImageCard(c, "AI tracing overlay", assets.OverlayXray));
                });
            }
            else
            {
                column.Item().Element(c => ComposeImageCard(c, "Radiograph", assets.OriginalXray, 310));
            }

            column.Item()
                .Background(Palette.Panel)
                .Padding(8)
                .Text($"Image QA: {session.Landmarks.Count} landmarks, {session.Measurements.Count} measurements, calibration {(session.XRayImage?.IsCalibrated == true ? "available" : "not available")}. Manual review remains required before clinical use.")
                .FontSize(7.8f)
                .FontColor(Palette.Muted);
        });
    }

    private static void ComposeLandmarkQuality(IContainer container, AnalysisSession session)
    {
        var landmarks = session.Landmarks
            .OrderBy(l => l.ConfidenceScore ?? 1m)
            .ThenBy(l => l.LandmarkCode)
            .ToList();

        container.Column(column =>
        {
            column.Spacing(8);

            decimal? averageConfidence = landmarks.Count == 0
                ? null
                : landmarks
                    .Where(l => l.ConfidenceScore.HasValue)
                    .Select(l => l.ConfidenceScore!.Value)
                    .DefaultIfEmpty(0m)
                    .Average();

            column.Item().Row(row =>
            {
                MetricCard(row.RelativeItem(), "Average Confidence", averageConfidence.HasValue ? $"{averageConfidence:P0}" : "Pending", ConfidenceTone(averageConfidence), "Mean landmark score");
                MetricCard(row.RelativeItem(), "Manual Edits", landmarks.Count(l => l.IsManuallyAdjusted).ToString(), Palette.Amber, "Clinician adjusted");
                MetricCard(row.RelativeItem(), "AI Detected", landmarks.Count(l => l.IsAiDetected).ToString(), Palette.Brand, "Source landmarks");
            });

            column.Item().Table(table =>
            {
                table.ColumnsDefinition(columns =>
                {
                    columns.RelativeColumn(0.8f);
                    columns.RelativeColumn(2.1f);
                    columns.RelativeColumn(1.2f);
                    columns.RelativeColumn(1.3f);
                    columns.RelativeColumn(1.1f);
                    columns.RelativeColumn(1.1f);
                });

                TableHeader(table, ["Code", "Landmark", "Confidence", "Error", "Source", "Review"]);

                var rowIndex = 0;
                foreach (var landmark in landmarks)
                {
                    var background = rowIndex++ % 2 == 0 ? Palette.White : Palette.Panel;
                    TableCell(table, landmark.LandmarkCode, background, true);
                    TableCell(table, EmptyToDash(landmark.LandmarkName), background);
                    TableCell(table, FormatPercent(landmark.ConfidenceScore, "-"), background, false, ConfidenceTone(landmark.ConfidenceScore), alignRight: true);
                    TableCell(table, $"{landmark.ExpectedErrorMm:0.0} mm", background, false, Palette.Muted, alignRight: true);
                    TableCell(table, landmark.IsAiDetected ? "AI" : "Manual", background);
                    TableCell(table, landmark.IsManuallyAdjusted ? "Adjusted" : "Accepted", background, false, landmark.IsManuallyAdjusted ? Palette.Amber : Palette.Green);
                }
            });
        });
    }

    private static void ComposeDiagnosis(IContainer container, Diagnosis diagnosis)
    {
        container.Column(column =>
        {
            column.Spacing(10);

            column.Item().Row(row =>
            {
                DiagnosticCard(row.RelativeItem(), "Skeletal", $"{diagnosis.SkeletalClass} ({diagnosis.SkeletalType})", ToneForSkeletal(diagnosis.SkeletalClass), "Corrected ANB: " + (diagnosis.CorrectedAnb?.ToString("0.0") ?? diagnosis.AnbUsed.ToString("0.0")));
                DiagnosticCard(row.RelativeItem(), "Vertical", diagnosis.VerticalPattern.ToString(), ToneForVertical(diagnosis.VerticalPattern), "Growth: " + EmptyToDash(diagnosis.GrowthTendency));
                DiagnosticCard(row.RelativeItem(), "Profile", diagnosis.SoftTissueProfile.ToString(), Palette.Cyan, "Soft tissue balance");
                DiagnosticCard(row.RelativeItem(), "Confidence", FormatPercent(diagnosis.ConfidenceScore, "Pending"), ConfidenceTone(diagnosis.ConfidenceScore), diagnosis.AnbRotationCorrected ? "Rotation corrected" : "Raw ANB");
            });

            column.Item().Background(Palette.Panel).Padding(10).Column(summary =>
            {
                summary.Item().Text("AI clinical impression")
                    .FontSize(7.5f)
                    .Bold()
                    .FontColor(Palette.Muted)
                    .LetterSpacing(0.05f);

                summary.Item().PaddingTop(4).Text(EmptyToDash(diagnosis.SummaryText ?? BuildFallbackDiagnosisSummary(diagnosis)))
                    .FontSize(9)
                    .LineHeight(1.4f)
                    .FontColor(Palette.InkSoft);

                var notes = diagnosis.ClinicalNotes?.Where(x => !string.IsNullOrWhiteSpace(x)).ToList() ?? [];
                if (notes.Count > 0)
                {
                    summary.Item().PaddingTop(6).Column(nColumn =>
                    {
                        foreach (var note in notes)
                        {
                            nColumn.Item().Row(r =>
                            {
                                r.ConstantItem(10).Text("•").FontSize(8).FontColor(Palette.Brand);
                                r.RelativeItem().Text(note).FontSize(7.8f).Italic().FontColor(Palette.Brand);
                            });
                        }
                    });
                }
            });

            column.Item().Row(row =>
            {
                row.RelativeItem().Element(c => ComposeInfoCard(c, "Jaw and incisor position", new[]
                {
                    ("Maxilla", diagnosis.MaxillaryPosition.ToString()),
                    ("Mandible", diagnosis.MandibularPosition.ToString()),
                    ("Upper incisor", diagnosis.UpperIncisorInclination.ToString()),
                    ("Lower incisor", diagnosis.LowerIncisorInclination.ToString()),
                }));

                row.RelativeItem().PaddingLeft(9).Element(c => ComposeInfoCard(c, "Occlusion and soft tissue", new[]
                {
                    ("Overjet", diagnosis.OverjetMm.HasValue ? $"{diagnosis.OverjetMm:0.0} mm - {diagnosis.OverjetClassification}" : "-"),
                    ("Overbite", diagnosis.OverbitesMm.HasValue ? $"{diagnosis.OverbitesMm:0.0} mm - {diagnosis.OverbiteClassification}" : "-"),
                    ("Kim's APDI", EmptyToDash(diagnosis.ApdiClassification)),
                    ("Kim's ODI", EmptyToDash(diagnosis.OdiClassification)),
                }));
            });

            var warnings = diagnosis.Warnings?.Where(x => !string.IsNullOrWhiteSpace(x)).ToList() ?? [];
            if (warnings.Count > 0)
            {
                column.Item().Background("#FFF7ED").Border(0.5f).BorderColor("#FDBA74").Padding(9).Column(w =>
                {
                    w.Item().Text("Warnings requiring review")
                        .FontSize(7.5f)
                        .Bold()
                        .FontColor(Palette.Amber);

                    foreach (var warning in warnings.Take(6))
                    {
                        w.Item().PaddingTop(3).Text("- " + warning)
                            .FontSize(8.2f)
                            .FontColor(Palette.InkSoft);
                    }
                });
            }
        });
    }

    private static void ComposeGrowthAndRisk(IContainer container, AnalysisSession session)
    {
        var diagnosis = session.Diagnosis;
        var signals = session.Measurements
            .Where(m => IsRiskSignal(m))
            .OrderByDescending(m => Math.Abs(GetZScore(m)))
            .Take(6)
            .ToList();

        container.Row(row =>
        {
            row.RelativeItem().Column(left =>
            {
                left.Spacing(7);
                left.Item().Text("Growth tendency")
                    .FontSize(10)
                    .Bold()
                    .FontColor(Palette.Navy);

                left.Item().Background(Palette.Panel).Padding(10).Text(EmptyToDash(diagnosis?.GrowthTendency ?? diagnosis?.OdiNote ?? "No growth pattern note was returned by the AI service."))
                    .FontSize(8.8f)
                    .LineHeight(1.35f)
                    .FontColor(Palette.InkSoft);

                left.Item().Element(c => ComposeInfoCard(c, "Timing", new[]
                {
                    ("Queued", session.QueuedAt.ToString("dd MMM yyyy HH:mm")),
                    ("Started", session.StartedAt?.ToString("dd MMM yyyy HH:mm") ?? "-"),
                    ("Completed", session.CompletedAt?.ToString("dd MMM yyyy HH:mm") ?? "-"),
                    ("Inference", FormatDuration(session.InferenceDurationMs)),
                }));
            });

            row.RelativeItem().PaddingLeft(10).Column(right =>
            {
                right.Spacing(7);
                right.Item().Text("Priority signals")
                    .FontSize(10)
                    .Bold()
                    .FontColor(Palette.Navy);

                if (signals.Count == 0)
                {
                    right.Item().Element(c => ComposeEmptyState(c, "No high-priority measurement deviations were detected in the available dataset."));
                }
                else
                {
                    foreach (var signal in signals)
                    {
                        right.Item()
                            .Background(Palette.Panel)
                            .BorderLeft(3)
                            .BorderColor(ToneForMeasurement(signal))
                            .PaddingHorizontal(8)
                            .PaddingVertical(6)
                            .Row(item =>
                            {
                                item.RelativeItem().Column(text =>
                                {
                                    text.Item().Text(signal.MeasurementName)
                                        .FontSize(8.3f)
                                        .Bold()
                                        .FontColor(Palette.Ink);

                                    text.Item().Text($"{signal.Status} - {ComputeSeverity(signal)}")
                                        .FontSize(7.2f)
                                        .FontColor(Palette.Muted);
                                });

                                item.ConstantItem(55).AlignRight().Text(FormatMeasurementValue(signal))
                                    .FontSize(8.5f)
                                    .Bold()
                                    .FontColor(ToneForMeasurement(signal));
                            });
                    }
                }
            });
        });
    }

    private static void ComposeBolton(IContainer container, BoltonResult bolton)
    {
        container.Column(column =>
        {
            column.Spacing(8);

            column.Item().Row(row =>
            {
                MetricCard(row.RelativeItem(), "Anterior Ratio", bolton.AnteriorRatio.HasValue ? $"{bolton.AnteriorRatio:0.0}%" : "-", BoltonTone(bolton.AnteriorFinding), EmptyToDash(bolton.AnteriorFinding));
                MetricCard(row.RelativeItem(), "Overall Ratio", bolton.OverallRatio.HasValue ? $"{bolton.OverallRatio:0.0}%" : "-", BoltonTone(bolton.OverallFinding), EmptyToDash(bolton.OverallFinding));
            });

            column.Item().Text("Reference: anterior Bolton ratio 77.2 +/- 1.65%; overall Bolton ratio 91.3 +/- 1.91%. Discrepancies should be interpreted with arch form, tooth anatomy, restorations, and planned mechanics.")
                .FontSize(7.8f)
                .LineHeight(1.35f)
                .FontColor(Palette.Muted);
        });
    }

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

        container.Column(column =>
        {
            column.Spacing(12);

            foreach (var group in groups)
            {
                var categoryName = group.Key?.ToString() ?? "General";
                var isPrimary = group.Key == priority;
                var abnormal = group.Count(m => m.Status != MeasurementStatus.Normal);

                column.Item().Column(groupColumn =>
                {
                    groupColumn.Spacing(6);

                    groupColumn.Item().Row(header =>
                    {
                        header.RelativeItem().Text(categoryName.ToUpperInvariant() + " ANALYSIS")
                            .FontSize(8.6f)
                            .Bold()
                            .FontColor(isPrimary ? Palette.Brand : Palette.Navy)
                            .LetterSpacing(0.05f);

                        header.AutoItem().Element(c => ComposeBadge(c, isPrimary ? "Selected protocol" : $"{abnormal} deviations", isPrimary ? Palette.Brand : abnormal > 0 ? Palette.Amber : Palette.Green));
                    });

                    groupColumn.Item().Table(table =>
                    {
                        table.ColumnsDefinition(columns =>
                        {
                            columns.RelativeColumn(2.5f);
                            columns.RelativeColumn(1.0f);
                            columns.RelativeColumn(1.7f);
                            columns.RelativeColumn(2.1f);
                            columns.RelativeColumn(1.1f);
                            columns.RelativeColumn(1.1f);
                        });

                        TableHeader(table, ["Measurement", "Value", "Norm", "Deviation", "Status", "Severity"]);

                        var rowIndex = 0;
                        foreach (var measurement in group.OrderBy(m => m.MeasurementName))
                        {
                            var background = rowIndex++ % 2 == 0 ? Palette.White : Palette.Panel;
                            TableCell(table, measurement.MeasurementName, background, true);
                            TableCell(table, FormatMeasurementValue(measurement), background, false, Palette.Ink, alignRight: true);
                            TableCell(table, FormatNorm(measurement), background, false, Palette.Muted, alignCenter: true);

                            table.Cell()
                                .Background(background)
                                .PaddingHorizontal(5)
                                .PaddingVertical(4)
                                .Element(c => ComposeDeviationBar(c, measurement));

                            TableCell(table, measurement.Status.ToString(), background, false, ToneForMeasurement(measurement), alignCenter: true);
                            TableCell(table, ComputeSeverity(measurement), background, false, SeverityTone(measurement), alignCenter: true);
                        }
                    });

                    if (CategoryReferences.TryGetValue(categoryName, out var reference))
                    {
                        groupColumn.Item().Text("Reference: " + reference)
                            .FontSize(6.8f)
                            .Italic()
                            .FontColor(Palette.Faint);
                    }
                });
            }
        });
    }

    private static void ComposeTreatmentPlans(IContainer container, IEnumerable<TreatmentPlan> plans)
    {
        var orderedPlans = plans
            .OrderByDescending(p => p.IsPrimary)
            .ThenBy(p => p.PlanIndex)
            .ToList();

        container.Column(column =>
        {
            column.Spacing(9);

            foreach (var plan in orderedPlans)
            {
                var tone = plan.IsPrimary ? Palette.Brand : Palette.Navy2;

                column.Item()
                    .Background(Palette.Panel)
                    .Border(0.6f)
                    .BorderColor(plan.IsPrimary ? Palette.Brand : Palette.BorderSoft)
                    .BorderLeft(4)
                    .BorderColor(tone)
                    .Padding(10)
                    .Column(card =>
                    {
                        card.Spacing(6);

                        card.Item().Row(row =>
                        {
                            row.RelativeItem().Column(title =>
                            {
                                title.Item().Text(plan.TreatmentName)
                                    .FontSize(10.2f)
                                    .Bold()
                                    .FontColor(Palette.Navy);

                                title.Item().PaddingTop(2).Text($"{plan.TreatmentType} - {plan.Source}")
                                    .FontSize(7.4f)
                                    .FontColor(Palette.Muted);
                            });

                            row.AutoItem().Element(c => ComposeBadge(c, plan.IsPrimary ? "Primary" : "Alternative", tone));
                            row.AutoItem().PaddingLeft(5).Element(c => ComposeBadge(c, FormatPercent(plan.ConfidenceScore, "Confidence n/a"), ConfidenceTone(plan.ConfidenceScore)));
                        });

                        card.Item().Text(EmptyToDash(plan.Description))
                            .FontSize(8.6f)
                            .LineHeight(1.35f)
                            .FontColor(Palette.InkSoft);

                        if (!string.IsNullOrWhiteSpace(plan.Rationale) || !string.IsNullOrWhiteSpace(plan.Risks))
                        {
                            card.Item().Row(details =>
                            {
                                details.RelativeItem().Element(c => ComposeSmallNarrative(c, "Rationale", plan.Rationale));
                                details.RelativeItem().PaddingLeft(8).Element(c => ComposeSmallNarrative(c, "Risks / notes", plan.Risks));
                            });
                        }

                        card.Item().Row(meta =>
                        {
                            meta.RelativeItem().Column(metaColumn =>
                            {
                                metaColumn.Item().Text(plan.EstimatedDurationMonths.HasValue ? $"Estimated duration: {plan.EstimatedDurationMonths} months" : "Estimated duration: not specified")
                                    .FontSize(7.4f)
                                    .FontColor(Palette.Muted);

                                if (!string.IsNullOrWhiteSpace(plan.RetentionRecommendation))
                                {
                                    metaColumn.Item().PaddingTop(2).Text("Retention: " + plan.RetentionRecommendation)
                                        .FontSize(7.1f)
                                        .FontColor(Palette.InkSoft);
                                }
                            });

                            meta.RelativeItem().AlignRight().Column(evColumn =>
                            {
                                evColumn.Item().AlignRight().Text("Evidence: " + EmptyToDash(plan.EvidenceReference))
                                    .FontSize(7.1f)
                                    .Italic()
                                    .FontColor(Palette.Faint);

                                if (!string.IsNullOrWhiteSpace(plan.EvidenceLevel))
                                {
                                    evColumn.Item().AlignRight().PaddingTop(2).Text("Evidence Level: " + plan.EvidenceLevel)
                                        .FontSize(7.1f)
                                        .Bold()
                                        .FontColor(Palette.Brand);
                                }
                            });
                        });
                    });
            }
        });
    }

    private static void ComposeGovernance(
        IContainer container,
        AnalysisSession session,
        GenerateReportRequest request)
    {
        container.Column(column =>
        {
            column.Spacing(10);

            column.Item().Row(row =>
            {
                row.RelativeItem().Element(c => ComposeInfoCard(c, "Included sections", new[]
                {
                    ("X-ray", request.IncludesXray ? "Included" : "Excluded"),
                    ("Overlay", request.IncludesLandmarkOverlay ? "Included" : "Excluded"),
                    ("Measurements", request.IncludesMeasurements ? "Included" : "Excluded"),
                    ("Treatment plan", request.IncludesTreatmentPlan ? "Included" : "Excluded"),
                }));

                row.RelativeItem().PaddingLeft(9).Element(c => ComposeInfoCard(c, "Clinical safety", new[]
                {
                    ("Status", session.Status.ToString()),
                    ("Diagnosis", session.Diagnosis is null ? "Pending" : "Available"),
                    ("Landmarks", session.Landmarks.Count.ToString()),
                    ("Manual edits", session.Landmarks.Count(l => l.IsManuallyAdjusted).ToString()),
                }));
            });

            column.Item()
                .Background("#FFFBEB")
                .Border(0.5f)
                .BorderColor("#FCD34D")
                .Padding(9)
                .Text("This report is AI-assisted decision support. It must be reviewed by a licensed clinician with the original radiograph, medical/dental history, clinical examination, and local standard of care before treatment decisions.")
                .FontSize(8.1f)
                .LineHeight(1.35f)
                .FontColor(Palette.InkSoft);

            column.Item().Row(row =>
            {
                row.RelativeItem();
                row.ConstantItem(230)
                    .Background(Palette.Paper)
                    .Border(0.6f)
                    .BorderColor(Palette.Border)
                    .Padding(12)
                    .Column(signature =>
                    {
                        signature.Item().Text("Authorized clinician")
                            .FontSize(7.2f)
                            .Bold()
                            .FontColor(Palette.Muted)
                            .LetterSpacing(0.05f);

                        signature.Item().PaddingTop(30).LineHorizontal(0.7f).LineColor(Palette.Border);
                        signature.Item().PaddingTop(4).Row(line =>
                        {
                            line.RelativeItem().Text("Signature / stamp").FontSize(7.2f).FontColor(Palette.Faint);
                            line.AutoItem().Text($"Date: {DateTime.UtcNow:dd MMM yyyy}").FontSize(7.2f).FontColor(Palette.Faint);
                        });
                    });
            });
        });
    }

    private static void ComposeFooter(IContainer container, AnalysisSession session, bool isDraft)
    {
        container.Background(Palette.Navy).PaddingHorizontal(22).PaddingVertical(7).Row(row =>
        {
            row.RelativeItem().Column(left =>
            {
                left.Item().Text("CephAI Advanced Imaging - Professional cephalometric analysis report")
                    .FontSize(7.4f)
                    .FontColor("#CBD5E1");

                if (isDraft)
                {
                    left.Item().Text("Draft report - not valid until reviewed and finalized by the treating clinician.")
                        .FontSize(7.2f)
                        .Bold()
                        .FontColor("#FCD34D");
                }
            });

            row.ConstantItem(155).AlignRight().Column(right =>
            {
                right.Item().AlignRight().Text($"Session {session.Id.ToString("N")[..8].ToUpperInvariant()}")
                    .FontSize(7.2f)
                    .FontColor("#94A3B8");

                right.Item().PaddingTop(2).AlignRight().Text(text =>
                {
                    text.DefaultTextStyle(x => x.FontSize(7.2f).FontColor("#CBD5E1"));
                    text.Span("Page ");
                    text.CurrentPageNumber().Bold().FontColor(Palette.White);
                    text.Span(" of ");
                    text.TotalPages();
                });
            });
        });
    }

    private static void ComposeInfoCard(IContainer container, string title, IEnumerable<(string Label, string Value)> rows)
    {
        container
            .Background(Palette.Panel)
            .Border(0.5f)
            .BorderColor(Palette.BorderSoft)
            .Padding(9)
            .Column(column =>
            {
                column.Item().Text(title.ToUpperInvariant())
                    .FontSize(7.1f)
                    .Bold()
                    .FontColor(Palette.Brand)
                    .LetterSpacing(0.06f);

                foreach (var (label, value) in rows)
                {
                    column.Item().PaddingTop(5).Row(row =>
                    {
                        row.ConstantItem(65).Text(label)
                            .FontSize(7.2f)
                            .FontColor(Palette.Muted);

                        row.RelativeItem().Text(EmptyToDash(value))
                            .FontSize(7.9f)
                            .SemiBold()
                            .FontColor(Palette.Ink);
                    });
                }
            });
    }

    private static void ComposeImageCard(IContainer container, string title, byte[] bytes, int height = 235)
    {
        container
            .Background(Palette.White)
            .Border(0.6f)
            .BorderColor(Palette.Border)
            .Padding(8)
            .Column(column =>
            {
                column.Item().Text(title)
                    .FontSize(8.2f)
                    .Bold()
                    .FontColor(Palette.Navy);

                column.Item().PaddingTop(6)
                    .Height(height)
                    .Background("#0F172A")
                    .Padding(5)
                    .Image(bytes)
                    .FitArea();
            });
    }

    private static void ComposeSmallNarrative(IContainer container, string title, string? text)
    {
        container.Background(Palette.White).Border(0.4f).BorderColor(Palette.BorderSoft).Padding(7).Column(column =>
        {
            column.Item().Text(title)
                .FontSize(7.2f)
                .Bold()
                .FontColor(Palette.Muted);

            column.Item().PaddingTop(3).Text(EmptyToDash(text))
                .FontSize(7.7f)
                .LineHeight(1.3f)
                .FontColor(Palette.InkSoft);
        });
    }

    private static void ComposeEmptyState(IContainer container, string message)
    {
        container
            .Background(Palette.Panel)
            .Border(0.5f)
            .BorderColor(Palette.BorderSoft)
            .Padding(10)
            .Text(message)
            .FontSize(8.2f)
            .LineHeight(1.35f)
            .FontColor(Palette.Muted);
    }

    private static void ComposeBadge(IContainer container, string text, string color)
    {
        container
            .Background(color)
            .PaddingHorizontal(7)
            .PaddingVertical(3)
            .Text(text)
            .FontSize(6.8f)
            .Bold()
            .FontColor(Palette.White);
    }

    private static void MetricCard(IContainer container, string label, string value, string color, string helper)
    {
        container
            .PaddingLeft(5)
            .Background(Palette.Panel)
            .Border(0.5f)
            .BorderColor(Palette.BorderSoft)
            .Padding(9)
            .Column(column =>
            {
                column.Item().Text(label)
                    .FontSize(7.2f)
                    .Bold()
                    .FontColor(Palette.Muted);

                column.Item().PaddingTop(3).Text(value)
                    .FontSize(12.2f)
                    .Bold()
                    .FontColor(color);

                column.Item().PaddingTop(2).Text(helper)
                    .FontSize(6.8f)
                    .FontColor(Palette.Faint);
            });
    }

    private static void DiagnosticCard(IContainer container, string label, string value, string color, string helper)
    {
        container
            .PaddingLeft(5)
            .Background(Palette.Panel)
            .BorderTop(3)
            .BorderColor(color)
            .Padding(9)
            .Column(column =>
            {
                column.Item().Text(label)
                    .FontSize(7.1f)
                    .Bold()
                    .FontColor(Palette.Muted);

                column.Item().PaddingTop(3).Text(value)
                    .FontSize(10.4f)
                    .Bold()
                    .FontColor(Palette.Navy);

                column.Item().PaddingTop(2).Text(helper)
                    .FontSize(6.9f)
                    .FontColor(Palette.Faint);
            });
    }

    private static void ComposeMiniStat(ColumnDescriptor column, string label, string value, string helper)
    {
        column.Item()
            .Background(Palette.Panel)
            .PaddingHorizontal(8)
            .PaddingVertical(6)
            .Column(card =>
            {
                card.Item().Text(label)
                    .FontSize(6.8f)
                    .Bold()
                    .FontColor(Palette.Muted);

                card.Item().Text(value)
                    .FontSize(8.6f)
                    .Bold()
                    .FontColor(Palette.Ink);

                card.Item().Text(helper)
                    .FontSize(6.7f)
                    .FontColor(Palette.Faint);
            });
    }

    private static void HeaderMeta(RowDescriptor row, string label, string value)
    {
        row.RelativeItem().Row(item =>
        {
            item.AutoItem().Text(label + ": ")
                .FontSize(7)
                .FontColor("#94A3B8");

            item.RelativeItem().Text(EmptyToDash(value))
                .FontSize(7.4f)
                .SemiBold()
                .FontColor(Palette.White);
        });
    }

    private static void TableHeader(TableDescriptor table, IReadOnlyList<string> headers)
    {
        foreach (var header in headers)
        {
            table.Cell()
                .Background(Palette.Navy)
                .PaddingHorizontal(5)
                .PaddingVertical(5)
                .Text(header)
                .FontSize(7.2f)
                .Bold()
                .FontColor(Palette.White);
        }
    }

    private static void TableCell(
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
            .PaddingHorizontal(5)
            .PaddingVertical(4);

        if (alignRight)
        {
            cell = cell.AlignRight();
        }
        else if (alignCenter)
        {
            cell = cell.AlignCenter();
        }

        var descriptor = cell.Text(EmptyToDash(text)).FontSize(7.5f).FontColor(color ?? Palette.InkSoft);
        if (bold)
        {
            descriptor.Bold();
        }
    }

    private static void ComposeDeviationBar(IContainer container, Measurement measurement)
    {
        var zScore = GetZScore(measurement);
        var magnitude = Math.Clamp((float)Math.Abs(zScore) / 3f, 0f, 1f);
        var color = ToneForMeasurement(measurement);
        const float eps = 0.001f;

        container.Column(column =>
        {
            column.Item().Height(8).Background(Palette.BorderSoft).Layers(layers =>
            {
                layers.Layer().AlignCenter().Width(1).Background(Palette.Faint);
                layers.PrimaryLayer().Row(row =>
                {
                    if (zScore < 0)
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

            column.Item().PaddingTop(2).Text($"{zScore:+0.0;-0.0;0.0} SD")
                .FontSize(6.5f)
                .FontColor(Palette.Faint);
        });
    }

    private static string ComposeSummarySentence(AnalysisSession session)
    {
        if (session.Diagnosis is null)
        {
            return "The analysis session has been prepared, but a complete diagnosis is not yet available. Review image quality, landmarks, and AI service status before generating a final clinical interpretation.";
        }

        var diagnosis = session.Diagnosis;
        var confidence = FormatPercent(diagnosis.ConfidenceScore, "pending confidence");
        return $"AI-assisted analysis suggests {diagnosis.SkeletalClass} skeletal relationship with a {diagnosis.VerticalPattern} vertical pattern and {diagnosis.SoftTissueProfile} soft-tissue profile. Diagnostic confidence is {confidence}.";
    }

    private static string BuildFallbackDiagnosisSummary(Diagnosis diagnosis)
    {
        return $"Skeletal class {diagnosis.SkeletalClass}; vertical pattern {diagnosis.VerticalPattern}; maxilla {diagnosis.MaxillaryPosition}; mandible {diagnosis.MandibularPosition}; upper incisors {diagnosis.UpperIncisorInclination}; lower incisors {diagnosis.LowerIncisorInclination}.";
    }

    private static bool IsRiskSignal(Measurement measurement)
    {
        if (measurement.Status != MeasurementStatus.Normal)
        {
            return true;
        }

        return Math.Abs(GetZScore(measurement)) >= 1.5m;
    }

    private static decimal GetZScore(Measurement measurement)
    {
        var norm = ResolveNorm(measurement);
        if (norm.Sd <= 0)
        {
            return 0m;
        }

        return (measurement.Value - norm.Mean) / norm.Sd;
    }

    private static NormReference ResolveNorm(Measurement measurement)
    {
        if (Norms.TryGetValue(measurement.MeasurementCode, out var reference))
        {
            return reference;
        }

        if (measurement.NormSD > 0)
        {
            return new NormReference(measurement.NormMean, measurement.NormSD, "Stored norm");
        }

        if (measurement.NormalMin != 0 || measurement.NormalMax != 0)
        {
            var mean = (measurement.NormalMin + measurement.NormalMax) / 2m;
            var sd = Math.Max(Math.Abs(measurement.NormalMax - measurement.NormalMin) / 4m, 1m);
            return new NormReference(mean, sd, "Stored range");
        }

        return new NormReference(measurement.Value, 1m, "Unavailable");
    }

    private static string FormatNorm(Measurement measurement)
    {
        var norm = ResolveNorm(measurement);
        return norm.Source == "Stored range"
            ? $"{measurement.NormalMin:0.0}-{measurement.NormalMax:0.0}"
            : $"{norm.Mean:0.0} +/- {norm.Sd:0.0}";
    }

    private static string FormatMeasurementValue(Measurement measurement)
    {
        return measurement.Unit switch
        {
            MeasurementUnit.Degrees => $"{measurement.Value:0.0} deg",
            MeasurementUnit.Percent => $"{measurement.Value:0.0}%",
            _ => $"{measurement.Value:0.0} mm",
        };
    }

    private static string ComputeSeverity(Measurement measurement)
    {
        if (measurement.Severity != DeviationSeverity.Normal)
        {
            return measurement.Severity.ToString();
        }

        var z = Math.Abs(GetZScore(measurement));
        return z <= 1m ? "Normal"
            : z <= 2m ? "Mild"
            : z <= 3m ? "Moderate"
            : "Severe";
    }

    private static string FormatDuration(int? milliseconds)
    {
        if (!milliseconds.HasValue || milliseconds.Value <= 0)
        {
            return "-";
        }

        return milliseconds.Value < 1000
            ? $"{milliseconds.Value} ms"
            : $"{milliseconds.Value / 1000m:0.0} s";
    }

    private static string FormatDimensions(XRayImage? image)
    {
        if (image?.WidthPx is null || image.HeightPx is null)
        {
            return "-";
        }

        return $"{image.WidthPx} x {image.HeightPx}px";
    }

    private static string FormatPercent(decimal? value, string fallback)
    {
        if (!value.HasValue)
        {
            return fallback;
        }

        var normalized = value.Value > 1m ? value.Value / 100m : value.Value;
        return $"{normalized:P0}";
    }

    private static string EmptyToDash(string? value)
    {
        return string.IsNullOrWhiteSpace(value) ? "-" : value.Trim();
    }

    private static string ToneForMeasurement(Measurement measurement) => measurement.Status switch
    {
        MeasurementStatus.Normal => Palette.Green,
        MeasurementStatus.Increased => Palette.Amber,
        MeasurementStatus.Decreased => Palette.Red,
        _ => Palette.Muted,
    };

    private static string SeverityTone(Measurement measurement)
    {
        return ComputeSeverity(measurement) switch
        {
            "Normal" => Palette.Green,
            "Mild" => Palette.Amber,
            "Moderate" => Palette.Amber,
            "Severe" => Palette.Red,
            _ => ToneForMeasurement(measurement),
        };
    }

    private static string ConfidenceTone(decimal? confidence)
    {
        if (!confidence.HasValue)
        {
            return Palette.Muted;
        }

        var normalized = confidence.Value > 1m ? confidence.Value / 100m : confidence.Value;
        return normalized >= 0.85m ? Palette.Green
            : normalized >= 0.65m ? Palette.Cyan
            : normalized >= 0.45m ? Palette.Amber
            : Palette.Red;
    }

    private static string ToneForSkeletal(SkeletalClass? skeletalClass) => skeletalClass switch
    {
        SkeletalClass.ClassI => Palette.Green,
        SkeletalClass.ClassII => Palette.Amber,
        SkeletalClass.ClassIII => Palette.Red,
        _ => Palette.Muted,
    };

    private static string ToneForVertical(VerticalPattern? verticalPattern) => verticalPattern switch
    {
        VerticalPattern.Normal => Palette.Green,
        VerticalPattern.LowAngle => Palette.Cyan,
        VerticalPattern.HighAngle => Palette.Amber,
        _ => Palette.Muted,
    };

    private static string BoltonTone(string? finding)
    {
        if (string.IsNullOrWhiteSpace(finding))
        {
            return Palette.Muted;
        }

        return finding.Contains("normal", StringComparison.OrdinalIgnoreCase)
            ? Palette.Green
            : Palette.Amber;
    }
}
