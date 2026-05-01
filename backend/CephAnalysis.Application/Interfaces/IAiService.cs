using CephAnalysis.Application.Features.Images.DTOs;
using CephAnalysis.Domain.Entities;
using CephAnalysis.Shared.Common;
using System.Text.Json.Serialization;

namespace CephAnalysis.Application.Interfaces;

public interface IAiService
{
    Task<Result<IEnumerable<LandmarkDto>>> DetectLandmarksAsync(Guid imageId, Stream imageStream, decimal pixelSpacingMm, CancellationToken ct);
    Task<Result<IEnumerable<MeasurementDto>>> CalculateMeasurementsAsync(
        Guid sessionId,
        Dictionary<string, Point2D> landmarks,
        decimal pixelSpacingMm,
        CancellationToken ct,
        Dictionary<string, string>? landmarkProvenance = null,
        bool isCbctDerived = false);
    Task<Result<DiagnosisDto>> ClassifyDiagnosisAsync(Guid sessionId, Dictionary<string, double> measurements, CancellationToken ct);
    Task<Result<IEnumerable<TreatmentDto>>> SuggestTreatmentAsync(Guid sessionId, string skeletalClass, string verticalPattern, Dictionary<string, double> measurements, double patientAge, CancellationToken ct, string? imageBase64 = null);

    /// <summary>
    /// Calls the Python AI service to generate all 5 clinical overlay images
    /// (xray_tracing, xray_measurements, wiggle_chart, tracing_only, measurement_table).
    /// </summary>
    Task<Result<AiOverlayResponse>> GenerateOverlaysAsync(
        Guid sessionId,
        Stream imageStream,
        Dictionary<string, Point2D> landmarks,
        IEnumerable<AiOverlayMeasurement> measurements,
        string? patientLabel,
        string? dateLabel,
        decimal? pixelSpacingMm,
        IEnumerable<string>? outputs,
        CancellationToken ct);
    
    Task<Result<XaiResponseDto>> ExplainDecisionAsync(
        Guid sessionId,
        string skeletalClass,
        Dictionary<string, double> skeletalProbabilities,
        string verticalPattern,
        Dictionary<string, double> measurements,
        string treatmentName,
        Dictionary<string, double> predictedOutcomes,
        IEnumerable<string>? uncertaintyLandmarks,
        CancellationToken ct);
    
    Task<Result<object>> GetAnalysisNormsAsync(CancellationToken ct);
}

public record LandmarkDto(
    string Name,
    Point2D Point,
    double Confidence,
    string? Provenance = null,
    List<string>? DerivedFrom = null,
    double? ExpectedErrorMm = null
);

public record MeasurementDto(
    string Code,
    string Name,
    string Category,
    string MeasurementType,
    double Value,
    string Unit,
    double NormalMin,
    double NormalMax,
    string Status,
    double? Deviation,
    List<string> LandmarkRefs,
    [property: JsonPropertyName("quality_status")] string? QualityStatus = null,
    [property: JsonPropertyName("review_reasons")] List<string>? ReviewReasons = null,
    [property: JsonPropertyName("landmark_provenance")] Dictionary<string, string>? LandmarkProvenance = null
);

public record DiagnosisDto(
    string SkeletalClass,
    string VerticalPattern,
    string SkeletalType,
    double CorrectedAnb,
    string? ApdiClassification,
    string? OdiClassification,
    string MaxillaryPosition,
    string MandibularPosition,
    string UpperIncisorInclination,
    string LowerIncisorInclination,
    string SoftTissueProfile,
    double? OverjetMm,
    string? OverjetClassification,
    double? OverbitesMm,
    string? OverbiteClassification,
    double ConfidenceScore,
    string Summary,
    List<string> Warnings,
    List<string> ClinicalNotes,
    double? AnbUsed = null,
    bool? AnbRotationCorrected = null,
    string? OdiNote = null,
    string? GrowthTendency = null,
    Dictionary<string, double>? SkeletalDifferential = null
);

public record TreatmentDto(
    int PlanIndex,
    string TreatmentType,
    string TreatmentName,
    string Description,
    string? Rationale,
    string? Risks,
    int? EstimatedDurationMonths,
    double ConfidenceScore,
    string Source,
    bool IsPrimary,
    string? EvidenceReference = null,
    string? EvidenceLevel = null,
    string? RetentionRecommendation = null,
    Dictionary<string, double>? PredictedOutcomes = null
);

public record XAIDecisionStep(
    int Step,
    string Factor,
    string Evidence,
    string Impact
);

public record XaiResponseDto(
    List<XAIDecisionStep> DecisionChain,
    List<string> KeyDrivers,
    List<string> UncertaintyFactors,
    string ClinicalConfidence,
    string AlternativeInterpretation
);

// ─── Overlay DTOs ────────────────────────────────────────────────────────────

/// <summary>One measurement row to send to the Python overlay engine.</summary>
public record AiOverlayMeasurement(
    string Code,
    string Name,
    double Value,
    string Unit,
    double NormalValue,
    double StdDeviation,
    double Difference,
    string GroupName,
    string Status
);

/// <summary>One rendered overlay image returned from the Python AI service.</summary>
public record AiOverlayImageItem(
    string Key,
    string Label,
    string ImageBase64,
    int Width,
    int Height
);

/// <summary>Full response payload from POST /ai/generate-overlays.</summary>
public record AiOverlayResponse(
    string SessionId,
    List<AiOverlayImageItem> Images,
    int RenderMs
);
