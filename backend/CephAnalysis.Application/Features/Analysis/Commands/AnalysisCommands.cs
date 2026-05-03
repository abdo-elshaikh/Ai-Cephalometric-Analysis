using CephAnalysis.Application.Features.Images.DTOs;
using CephAnalysis.Application.Interfaces;
using CephAnalysis.Domain.Entities;
using CephAnalysis.Domain.Enums;
using CephAnalysis.Shared.Common;
using MediatR;
using Microsoft.EntityFrameworkCore;
using System.Text.Json;

namespace CephAnalysis.Application.Features.Analysis.Commands;

// ═══════════════════════════════════════════════════════════════════════════════
// DTOs
// ═══════════════════════════════════════════════════════════════════════════════

public record SessionDto(
    Guid Id, Guid XRayImageId, string Status, string? ModelVersion,
    int? InferenceDurationMs, DateTime? StartedAt, DateTime? CompletedAt,
    int LandmarkCount, int MeasurementCount, bool HasDiagnosis, string? ResultImageUrl = null);

public record SessionLandmarkDto(
    Guid Id, string LandmarkCode, string LandmarkName,
    decimal XPx, decimal YPx, decimal? ConfidenceScore,
    bool IsAiDetected, bool IsManuallyAdjusted, string? AdjustmentReason,
    string? Provenance = null, decimal? ExpectedErrorMm = null, IEnumerable<string>? DerivedFrom = null);

public record SessionMeasurementDto(
    Guid Id, string Code, string Name, string? Category, string MeasurementType,
    decimal Value, string Unit, decimal NormalMin, decimal NormalMax,
    string Status, decimal? Deviation,
    string? QualityStatus = null,
    IEnumerable<string>? ReviewReasons = null,
    IEnumerable<string>? LandmarkRefs = null,
    Dictionary<string, string>? LandmarkProvenance = null);

public record SessionDiagnosisDto(
    Guid Id, string SkeletalClass, string VerticalPattern,
    string MaxillaryPosition, string MandibularPosition,
    string UpperIncisorInclination, string LowerIncisorInclination,
    string SoftTissueProfile,
    decimal? OverjetMm, string? OverjetClassification,
    decimal? OverbitesMm, string? OverbiteClassification,
    decimal? ConfidenceScore, string? SummaryText,
    IEnumerable<string> Warnings,
    IEnumerable<string> ClinicalNotes,
    string? SkeletalType = null,
    decimal? CorrectedAnb = null,
    string? ApdiClassification = null,
    string? OdiClassification = null,
    Dictionary<string, double>? SkeletalDifferential = null);

public record SessionTreatmentDto(
    Guid Id, Guid SessionId, int PlanIndex, string TreatmentType, string TreatmentName,
    string Description, string? Rationale, string? Risks,
    short? EstimatedDurationMonths, decimal? ConfidenceScore,
    string Source, bool IsPrimary, string? EvidenceReference,
    string? EvidenceLevel = null, string? RetentionRecommendation = null,
    Dictionary<string, double>? PredictedOutcomes = null);

public record ExplainDecisionRequest(
    string SkeletalClass,
    Dictionary<string, double> SkeletalProbabilities,
    string VerticalPattern,
    Dictionary<string, double> Measurements,
    string TreatmentName,
    Dictionary<string, double> PredictedOutcomes,
    IEnumerable<string>? UncertaintyLandmarks
);

public record LandmarkUpdateDto(string LandmarkCode, decimal X, decimal Y);

public record AdjustLandmarkRequest(double X, double Y, string? Reason);

public record FullPipelineDto(
    SessionDto Session,
    IEnumerable<SessionLandmarkDto> Landmarks,
    IEnumerable<SessionMeasurementDto> Measurements,
    SessionDiagnosisDto? Diagnosis,
    IEnumerable<SessionTreatmentDto> Treatments);

internal static class LandmarkProvenance
{
    private const string Prefix = "AI provenance:";

    public static string Normalize(string? provenance)
    {
        var value = provenance?.Trim().ToLowerInvariant();
        return value is "detected" or "derived" or "fallback" or "manual"
            ? value
            : "detected";
    }

    public static bool IsDirectAiDetected(string? provenance) => Normalize(provenance) == "detected";

    public static decimal ExpectedErrorMm(double confidence, string? provenance, double? provided)
    {
        if (provided.HasValue && provided.Value > 0)
            return (decimal)provided.Value;

        return Normalize(provenance) switch
        {
            "fallback" => 5.0m,
            "derived" => 3.0m,
            "manual" => 1.0m,
            _ => Math.Clamp((decimal)((1.0 - confidence) * 4.0), 0.5m, 4.0m)
        };
    }

    public static string? BuildAdjustmentReason(string? provenance, IEnumerable<string>? derivedFrom)
    {
        var normalized = Normalize(provenance);
        if (normalized == "detected")
            return null;

        var sourceText = derivedFrom is not null && derivedFrom.Any()
            ? $"; derived_from: {string.Join(", ", derivedFrom)}"
            : "";

        return $"{Prefix} {normalized}{sourceText}";
    }

    public static IEnumerable<string> DerivedFrom(Landmark landmark)
    {
        const string SourceMarker = "derived_from:";
        var reason = landmark.AdjustmentReason;
        if (string.IsNullOrWhiteSpace(reason))
            return [];

        var markerIndex = reason.IndexOf(SourceMarker, StringComparison.OrdinalIgnoreCase);
        if (markerIndex < 0)
            return [];

        return reason[(markerIndex + SourceMarker.Length)..]
            .Split(',', StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries)
            .Where(x => !string.IsNullOrWhiteSpace(x))
            .ToList();
    }

    public static string FromStored(Landmark landmark)
    {
        if (landmark.IsManuallyAdjusted)
            return "manual";

        if (landmark.AdjustmentReason?.StartsWith(Prefix, StringComparison.OrdinalIgnoreCase) == true)
        {
            var raw = landmark.AdjustmentReason[Prefix.Length..].Split(';')[0].Trim();
            return Normalize(raw);
        }

        return landmark.IsAiDetected ? "detected" : "fallback";
    }
}

internal static class MeasurementQuality
{
    public static List<string> ReadLandmarkRefs(JsonDocument? refs)
    {
        if (refs is null || refs.RootElement.ValueKind != JsonValueKind.Array)
            return [];

        return refs.RootElement
            .EnumerateArray()
            .Where(x => x.ValueKind == JsonValueKind.String)
            .Select(x => x.GetString())
            .Where(x => !string.IsNullOrWhiteSpace(x))
            .Select(x => x!)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();
    }

    public static (string Status, List<string> Reasons, Dictionary<string, string> Provenance) Build(
        IEnumerable<string>? landmarkRefs,
        IReadOnlyDictionary<string, Landmark> landmarks,
        string? aiStatus = null,
        IEnumerable<string>? aiReasons = null,
        Dictionary<string, string>? aiProvenance = null)
    {
        var refs = landmarkRefs?
            .Where(x => !string.IsNullOrWhiteSpace(x))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList() ?? [];

        var provenance = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        var reasons = aiReasons?.Where(x => !string.IsNullOrWhiteSpace(x)).ToList() ?? [];
        var hasFallback = false;
        var hasDerived = false;
        var missingRefs = new List<string>();
        var highUncertaintyRefs = new List<string>();

        foreach (var reference in refs)
        {
            if (aiProvenance?.TryGetValue(reference, out var providedProvenance) == true)
            {
                var normalizedProvided = LandmarkProvenance.Normalize(providedProvenance);
                provenance[reference] = normalizedProvided;
                if (normalizedProvided == "fallback")
                    hasFallback = true;
                if (normalizedProvided == "derived")
                    hasDerived = true;

                if (landmarks.TryGetValue(reference, out var providedLandmark) &&
                    providedLandmark.ExpectedErrorMm > 4.0m)
                    highUncertaintyRefs.Add(reference);

                continue;
            }

            if (!landmarks.TryGetValue(reference, out var landmark))
            {
                provenance[reference] = "missing";
                missingRefs.Add(reference);
                continue;
            }

            var storedProvenance = LandmarkProvenance.FromStored(landmark);
            provenance[reference] = storedProvenance;

            if (storedProvenance == "fallback")
                hasFallback = true;
            if (storedProvenance == "derived")
                hasDerived = true;
            if (landmark.ExpectedErrorMm > 4.0m)
                highUncertaintyRefs.Add(reference);
        }

        if (refs.Count == 0)
            reasons.Add("No landmark references were returned for this measurement.");
        if (missingRefs.Count > 0)
            reasons.Add($"Missing source landmark(s): {string.Join(", ", missingRefs)}.");
        if (hasFallback)
            reasons.Add("At least one source landmark was produced by a fallback estimate.");
        if (hasDerived)
            reasons.Add("At least one source landmark is AI-derived from another anatomical point.");
        if (highUncertaintyRefs.Count > 0)
            reasons.Add($"High expected landmark error at: {string.Join(", ", highUncertaintyRefs)}.");

        var computedStatus =
            refs.Count == 0 || missingRefs.Count > 0 || hasFallback || highUncertaintyRefs.Count > 0
                ? "manual_review_required"
                : hasDerived
                    ? "provisional"
                    : "clinically_usable";

        return (
            string.IsNullOrWhiteSpace(aiStatus) ? computedStatus : aiStatus,
            reasons.Distinct(StringComparer.OrdinalIgnoreCase).ToList(),
            provenance);
    }
}

public record AnalysisHistoryItemDto(
    Guid Id,
    string PatientName,
    string PatientMrn,
    string AnalysisType,
    string Status,
    DateTime QueuedAt,
    string? SkeletalClass,
    string? VerticalPattern,
    DateTime? CompletedAt);

public record GetAnalysisHistoryQuery(
    string? SearchTerm,
    AnalysisType? Type,
    SessionStatus? Status,
    SkeletalClass? SkeletalClass,
    DateTime? StartDate,
    DateTime? EndDate,
    string DoctorId,
    int PageSize = 100) : IRequest<Result<IEnumerable<AnalysisHistoryItemDto>>>;

public record ExplainDecisionCommand(Guid SessionId, ExplainDecisionRequest Request, string DoctorId) : IRequest<Result<XaiResponseDto>>;

public record UpdateSessionLandmarksCommand(Guid SessionId, string DoctorId, List<LandmarkUpdateDto> Landmarks) : IRequest<Result<bool>>;

public class UpdateSessionLandmarksHandler : IRequestHandler<UpdateSessionLandmarksCommand, Result<bool>>
{
    private readonly IApplicationDbContext _db;
    public UpdateSessionLandmarksHandler(IApplicationDbContext db) => _db = db;

    public async Task<Result<bool>> Handle(UpdateSessionLandmarksCommand cmd, CancellationToken ct)
    {
        var session = await _db.AnalysisSessions
            .Include(x => x.XRayImage).ThenInclude(x => x.Study).ThenInclude(x => x.Patient)
            .Include(x => x.Landmarks)
            .FirstOrDefaultAsync(x => x.Id == cmd.SessionId, ct);

        if (session is null) return Result<bool>.NotFound("Session not found.");
        if (session.XRayImage.Study.Patient.DoctorId.ToString() != cmd.DoctorId)
            return Result<bool>.Unauthorized();

        if (cmd.Landmarks != null && cmd.Landmarks.Any())
        {
            foreach (var update in cmd.Landmarks)
            {
                var lm = session.Landmarks.FirstOrDefault(l => l.LandmarkCode == update.LandmarkCode);
                if (lm != null)
                {
                    lm.XPx = update.X;
                    lm.YPx = update.Y;
                    lm.IsManuallyAdjusted = true;
                }
            }
            await _db.SaveChangesAsync(ct);
        }

        return Result<bool>.Success(true);
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Detect Landmarks (existing, kept)
// ═══════════════════════════════════════════════════════════════════════════════

public record DetectLandmarksCommand(Guid ImageId, string DoctorId, AnalysisType AnalysisType = AnalysisType.Steiner) : IRequest<Result<IEnumerable<LandmarkDto>>>;

public class DetectLandmarksHandler : IRequestHandler<DetectLandmarksCommand, Result<IEnumerable<LandmarkDto>>>
{
    private readonly IApplicationDbContext _db;
    private readonly IAiService _aiService;
    private readonly IStorageService _storageService;

    public DetectLandmarksHandler(IApplicationDbContext db, IAiService aiService, IStorageService storageService)
    {
        _db = db;
        _aiService = aiService;
        _storageService = storageService;
    }

    public async Task<Result<IEnumerable<LandmarkDto>>> Handle(DetectLandmarksCommand cmd, CancellationToken ct)
    {
        XRayImage? image = null;
        for (var attempt = 1; attempt <= 4; attempt++)
        {
            image = await _db.XRayImages
                .Include(i => i.Study).ThenInclude(s => s.Patient)
                .FirstOrDefaultAsync(i => i.Id == cmd.ImageId, ct);

            if (image is not null)
                break;

            if (attempt < 4)
                await Task.Delay(TimeSpan.FromMilliseconds(250 * attempt), ct);
        }

        if (image is null)
            return Result<IEnumerable<LandmarkDto>>.NotFound("Image not found. The upload may still be committing; please retry shortly.");
        if (image.Study.Patient.DoctorId.ToString() != cmd.DoctorId)
            return Result<IEnumerable<LandmarkDto>>.Unauthorized("Not authorized.");

        // Use calibrated spacing or fallback to a default value (e.g. 0.1 mm/px) if not calibrated
        var pixelSpacing = (image.IsCalibrated && image.PixelSpacingMm > 0) ? image.PixelSpacingMm.Value : 0.1m;

        Stream stream;
        try { stream = await _storageService.DownloadFileAsync(image.StorageUrl, ct); }
        catch (Exception ex) { return Result<IEnumerable<LandmarkDto>>.Failure("Storage error: " + ex.Message); }

        var aiResult = await _aiService.DetectLandmarksAsync(cmd.ImageId, stream, pixelSpacing, ct);
        stream.Dispose();

        if (!aiResult.IsSuccess)
            return Result<IEnumerable<LandmarkDto>>.Failure(aiResult.Error ?? "AI error", aiResult.StatusCode);

        var session = new AnalysisSession
        {
            XRayImageId = cmd.ImageId,
            TriggeredBy = Guid.Parse(cmd.DoctorId),
            AnalysisType = cmd.AnalysisType,
            Status = SessionStatus.Finalized,
            StartedAt = DateTime.UtcNow,
            CompletedAt = DateTime.UtcNow,
            Landmarks = aiResult.Data!.Select(l => new Landmark
            {
                LandmarkCode = l.Name,
                LandmarkName = l.Name,
                XPx = (decimal)l.Point.X,
                YPx = (decimal)l.Point.Y,
                ConfidenceScore = (decimal)l.Confidence,
                ExpectedErrorMm = LandmarkProvenance.ExpectedErrorMm(l.Confidence, l.Provenance, l.ExpectedErrorMm),
                IsAiDetected = LandmarkProvenance.IsDirectAiDetected(l.Provenance),
                AdjustmentReason = LandmarkProvenance.BuildAdjustmentReason(l.Provenance, l.DerivedFrom)
            }).ToList()
        };
        _db.AnalysisSessions.Add(session);
        await _db.SaveChangesAsync(ct);

        return Result<IEnumerable<LandmarkDto>>.Success(aiResult.Data!);
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Get Session
// ═══════════════════════════════════════════════════════════════════════════════

public record GetSessionQuery(Guid SessionId, string DoctorId) : IRequest<Result<SessionDto>>;

public class GetSessionHandler : IRequestHandler<GetSessionQuery, Result<SessionDto>>
{
    private readonly IApplicationDbContext _db;
    public GetSessionHandler(IApplicationDbContext db) => _db = db;

    public async Task<Result<SessionDto>> Handle(GetSessionQuery q, CancellationToken ct)
    {
        var s = await _db.AnalysisSessions
            .Include(x => x.XRayImage).ThenInclude(x => x.Study).ThenInclude(x => x.Patient)
            .Include(x => x.Landmarks)
            .Include(x => x.Measurements)
            .Include(x => x.Diagnosis)
            .AsNoTracking()
            .FirstOrDefaultAsync(x => x.Id == q.SessionId, ct);

        if (s is null) return Result<SessionDto>.NotFound();
        if (s.XRayImage.Study.Patient.DoctorId.ToString() != q.DoctorId)
            return Result<SessionDto>.Unauthorized();

        return Result<SessionDto>.Success(new SessionDto(
            s.Id, s.XRayImageId, s.Status.ToString(), s.ModelVersion,
            s.InferenceDurationMs, s.StartedAt, s.CompletedAt,
            s.Landmarks.Count, s.Measurements.Count, s.Diagnosis != null, s.ResultImageUrl));
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Get Session Landmarks
// ═══════════════════════════════════════════════════════════════════════════════

public record GetSessionLandmarksQuery(Guid SessionId, string DoctorId) : IRequest<Result<IEnumerable<SessionLandmarkDto>>>;

public class GetSessionLandmarksHandler : IRequestHandler<GetSessionLandmarksQuery, Result<IEnumerable<SessionLandmarkDto>>>
{
    private readonly IApplicationDbContext _db;
    public GetSessionLandmarksHandler(IApplicationDbContext db) => _db = db;

    public async Task<Result<IEnumerable<SessionLandmarkDto>>> Handle(GetSessionLandmarksQuery q, CancellationToken ct)
    {
        var session = await _db.AnalysisSessions
            .Include(x => x.XRayImage).ThenInclude(x => x.Study).ThenInclude(x => x.Patient)
            .Include(x => x.Landmarks)
            .AsNoTracking()
            .FirstOrDefaultAsync(x => x.Id == q.SessionId, ct);

        if (session is null) return Result<IEnumerable<SessionLandmarkDto>>.NotFound();
        if (session.XRayImage.Study.Patient.DoctorId.ToString() != q.DoctorId)
            return Result<IEnumerable<SessionLandmarkDto>>.Unauthorized();

        var dtos = session.Landmarks.Select(l => new SessionLandmarkDto(
            l.Id, l.LandmarkCode, l.LandmarkName,
            l.XPx, l.YPx, l.ConfidenceScore,
            l.IsAiDetected, l.IsManuallyAdjusted, l.AdjustmentReason,
            LandmarkProvenance.FromStored(l), l.ExpectedErrorMm, LandmarkProvenance.DerivedFrom(l)));

        return Result<IEnumerable<SessionLandmarkDto>>.Success(dtos);
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Adjust Landmark
// ═══════════════════════════════════════════════════════════════════════════════

public record AdjustLandmarkCommand(Guid SessionId, string LandmarkCode, AdjustLandmarkRequest Request, string DoctorId)
    : IRequest<Result<SessionLandmarkDto>>;

public class AdjustLandmarkHandler : IRequestHandler<AdjustLandmarkCommand, Result<SessionLandmarkDto>>
{
    private readonly IApplicationDbContext _db;
    public AdjustLandmarkHandler(IApplicationDbContext db) => _db = db;

    public async Task<Result<SessionLandmarkDto>> Handle(AdjustLandmarkCommand cmd, CancellationToken ct)
    {
        var session = await _db.AnalysisSessions
            .Include(x => x.XRayImage).ThenInclude(x => x.Study).ThenInclude(x => x.Patient)
            .Include(x => x.Landmarks)
            .FirstOrDefaultAsync(x => x.Id == cmd.SessionId, ct);

        if (session is null) return Result<SessionLandmarkDto>.NotFound();
        if (session.XRayImage.Study.Patient.DoctorId.ToString() != cmd.DoctorId)
            return Result<SessionLandmarkDto>.Unauthorized();

        var landmark = session.Landmarks.FirstOrDefault(l => l.LandmarkCode == cmd.LandmarkCode);
        if (landmark is null) return Result<SessionLandmarkDto>.NotFound("Landmark not found.");

        landmark.XPx = (decimal)cmd.Request.X;
        landmark.YPx = (decimal)cmd.Request.Y;
        landmark.IsManuallyAdjusted = true;
        landmark.AdjustmentReason = cmd.Request.Reason;

        await _db.SaveChangesAsync(ct);

        return Result<SessionLandmarkDto>.Success(new SessionLandmarkDto(
            landmark.Id, landmark.LandmarkCode, landmark.LandmarkName,
            landmark.XPx, landmark.YPx, landmark.ConfidenceScore,
            landmark.IsAiDetected, landmark.IsManuallyAdjusted, landmark.AdjustmentReason,
            LandmarkProvenance.FromStored(landmark), landmark.ExpectedErrorMm, LandmarkProvenance.DerivedFrom(landmark)));
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Calculate Measurements
// ═══════════════════════════════════════════════════════════════════════════════

public record CalculateMeasurementsCommand(Guid SessionId, string DoctorId, bool IsCbctDerived = false, string? Population = null) : IRequest<Result<IEnumerable<SessionMeasurementDto>>>;

public class CalculateMeasurementsHandler : IRequestHandler<CalculateMeasurementsCommand, Result<IEnumerable<SessionMeasurementDto>>>
{
    private readonly IApplicationDbContext _db;
    private readonly IAiService _aiService;

    public CalculateMeasurementsHandler(IApplicationDbContext db, IAiService aiService) { _db = db; _aiService = aiService; }

    public async Task<Result<IEnumerable<SessionMeasurementDto>>> Handle(CalculateMeasurementsCommand cmd, CancellationToken ct)
    {
        var session = await _db.AnalysisSessions
            .Include(x => x.XRayImage).ThenInclude(x => x.Study).ThenInclude(x => x.Patient)
            .Include(x => x.Landmarks)
            .FirstOrDefaultAsync(x => x.Id == cmd.SessionId, ct);

        if (session is null) return Result<IEnumerable<SessionMeasurementDto>>.NotFound();
        if (session.XRayImage.Study.Patient.DoctorId.ToString() != cmd.DoctorId)
            return Result<IEnumerable<SessionMeasurementDto>>.Unauthorized();
        if (!session.Landmarks.Any())
            return Result<IEnumerable<SessionMeasurementDto>>.Failure("No landmarks detected. Run detection first.");

        var landmarkDict = session.Landmarks
            .GroupBy(l => l.LandmarkCode)
            .ToDictionary(g => g.Key, g => new Point2D((double)g.First().XPx, (double)g.First().YPx));
        var landmarkLookup = session.Landmarks
            .GroupBy(l => l.LandmarkCode, StringComparer.OrdinalIgnoreCase)
            .ToDictionary(g => g.Key, g => g.First(), StringComparer.OrdinalIgnoreCase);
        var landmarkProvenance = session.Landmarks
            .GroupBy(l => l.LandmarkCode)
            .ToDictionary(g => g.Key, g => LandmarkProvenance.FromStored(g.First()));

        var pixelSpacing = session.XRayImage.PixelSpacingMm ?? 1.0m;

        var aiResult = await _aiService.CalculateMeasurementsAsync(
            cmd.SessionId,
            landmarkDict,
            pixelSpacing,
            ct,
            landmarkProvenance,
            cmd.IsCbctDerived,
            cmd.Population);
        if (!aiResult.IsSuccess)
            return Result<IEnumerable<SessionMeasurementDto>>.Failure(aiResult.Error ?? "Measurement error", aiResult.StatusCode);

        // Clear old measurements
        var existing = await _db.Measurements.Where(m => m.SessionId == cmd.SessionId).ToListAsync(ct);
        foreach (var e in existing) _db.Measurements.Remove(e);

        // Save new measurements
        var aiMeasurements = aiResult.Data!.ToList();
        var aiMeasurementLookup = aiMeasurements
            .GroupBy(m => m.Code, StringComparer.OrdinalIgnoreCase)
            .ToDictionary(g => g.Key, g => g.First(), StringComparer.OrdinalIgnoreCase);

        var entities = aiMeasurements.Select(m => new Measurement
        {
            SessionId = cmd.SessionId,
            Category = Enum.TryParse<AnalysisType>(m.Category, true, out var cat) ? cat : null,
            MeasurementCode = m.Code,
            MeasurementName = m.Name,
            MeasurementType = Enum.TryParse<MeasurementType>(m.MeasurementType, true, out var mt) ? mt : MeasurementType.Angle,
            Value = (decimal)m.Value,
            Unit = m.Unit == "Millimeters" ? MeasurementUnit.Millimeters : MeasurementUnit.Degrees,
            NormalMin = (decimal)m.NormalMin,
            NormalMax = (decimal)m.NormalMax,
            Status = Enum.TryParse<MeasurementStatus>(m.Status, true, out var ms) ? ms : MeasurementStatus.Normal,
            Deviation = m.Deviation.HasValue ? (decimal)m.Deviation.Value : null,
            LandmarkRefs = JsonSerializer.SerializeToDocument(m.LandmarkRefs),
        }).ToList();

        _db.Measurements.AddRange(entities);
        await _db.SaveChangesAsync(ct);

        var dtos = entities.Select(m =>
        {
            var refs = MeasurementQuality.ReadLandmarkRefs(m.LandmarkRefs);
            aiMeasurementLookup.TryGetValue(m.MeasurementCode, out var aiMeasurement);
            var quality = MeasurementQuality.Build(
                refs,
                landmarkLookup,
                aiMeasurement?.QualityStatus,
                aiMeasurement?.ReviewReasons,
                aiMeasurement?.LandmarkProvenance);

            return new SessionMeasurementDto(
                m.Id, m.MeasurementCode, m.MeasurementName, m.Category?.ToString(), m.MeasurementType.ToString(),
                m.Value, m.Unit.ToString(), m.NormalMin, m.NormalMax,
                m.Status.ToString(), m.Deviation,
                quality.Status, quality.Reasons, refs, quality.Provenance);
        });

        return Result<IEnumerable<SessionMeasurementDto>>.Success(dtos);
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Get Measurements
// ═══════════════════════════════════════════════════════════════════════════════

public record GetMeasurementsQuery(Guid SessionId, string DoctorId) : IRequest<Result<IEnumerable<SessionMeasurementDto>>>;

public class GetMeasurementsHandler : IRequestHandler<GetMeasurementsQuery, Result<IEnumerable<SessionMeasurementDto>>>
{
    private readonly IApplicationDbContext _db;
    public GetMeasurementsHandler(IApplicationDbContext db) => _db = db;

    public async Task<Result<IEnumerable<SessionMeasurementDto>>> Handle(GetMeasurementsQuery q, CancellationToken ct)
    {
        var session = await _db.AnalysisSessions
            .Include(x => x.XRayImage).ThenInclude(x => x.Study).ThenInclude(x => x.Patient)
            .Include(x => x.Measurements)
            .Include(x => x.Landmarks)
            .AsNoTracking()
            .FirstOrDefaultAsync(x => x.Id == q.SessionId, ct);

        if (session is null) return Result<IEnumerable<SessionMeasurementDto>>.NotFound();
        if (session.XRayImage.Study.Patient.DoctorId.ToString() != q.DoctorId)
            return Result<IEnumerable<SessionMeasurementDto>>.Unauthorized();

        var landmarkLookup = session.Landmarks
            .GroupBy(l => l.LandmarkCode, StringComparer.OrdinalIgnoreCase)
            .ToDictionary(g => g.Key, g => g.First(), StringComparer.OrdinalIgnoreCase);

        var dtos = session.Measurements.Select(m =>
        {
            var refs = MeasurementQuality.ReadLandmarkRefs(m.LandmarkRefs);
            var quality = MeasurementQuality.Build(refs, landmarkLookup);

            return new SessionMeasurementDto(
                m.Id, m.MeasurementCode, m.MeasurementName, m.Category?.ToString(), m.MeasurementType.ToString(),
                m.Value, m.Unit.ToString(), m.NormalMin, m.NormalMax,
                m.Status.ToString(), m.Deviation,
                quality.Status, quality.Reasons, refs, quality.Provenance);
        });

        return Result<IEnumerable<SessionMeasurementDto>>.Success(dtos);
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Classify Diagnosis
// ═══════════════════════════════════════════════════════════════════════════════

public record ClassifyDiagnosisCommand(Guid SessionId, string DoctorId) : IRequest<Result<SessionDiagnosisDto>>;

public class ClassifyDiagnosisHandler : IRequestHandler<ClassifyDiagnosisCommand, Result<SessionDiagnosisDto>>
{
    private readonly IApplicationDbContext _db;
    private readonly IAiService _aiService;

    public ClassifyDiagnosisHandler(IApplicationDbContext db, IAiService aiService) { _db = db; _aiService = aiService; }

    public async Task<Result<SessionDiagnosisDto>> Handle(ClassifyDiagnosisCommand cmd, CancellationToken ct)
    {
        var session = await _db.AnalysisSessions
            .Include(x => x.XRayImage).ThenInclude(x => x.Study).ThenInclude(x => x.Patient)
            .Include(x => x.Measurements)
            .Include(x => x.Diagnosis)
            .FirstOrDefaultAsync(x => x.Id == cmd.SessionId, ct);

        if (session is null) return Result<SessionDiagnosisDto>.NotFound();
        if (session.XRayImage.Study.Patient.DoctorId.ToString() != cmd.DoctorId)
            return Result<SessionDiagnosisDto>.Unauthorized();
        if (!session.Measurements.Any())
            return Result<SessionDiagnosisDto>.Failure("No measurements found. Run measurements first.");

        var diagResult = await _aiService.ClassifyDiagnosisAsync(
            cmd.SessionId,
            session.Measurements
                .GroupBy(m => m.MeasurementCode)
                .ToDictionary(g => g.Key, g => (double)g.First().Value),
            ct);
        if (!diagResult.IsSuccess)
            return Result<SessionDiagnosisDto>.Failure(diagResult.Error ?? "Diagnosis error", diagResult.StatusCode);

        var d = diagResult.Data!;

        // Remove old diagnosis if exists
        if (session.Diagnosis != null)
            _db.Diagnoses.Remove(session.Diagnosis);

        var diagnosis = new Diagnosis
        {
            SessionId = cmd.SessionId,
            SkeletalClass = Enum.TryParse<SkeletalClass>(d.SkeletalClass, true, out var sc) ? sc : SkeletalClass.ClassI,
            VerticalPattern = Enum.TryParse<VerticalPattern>(d.VerticalPattern, true, out var vp) ? vp : VerticalPattern.Normal,
            MaxillaryPosition = Enum.TryParse<JawPosition>(d.MaxillaryPosition, true, out var mx) ? mx : JawPosition.Normal,
            MandibularPosition = Enum.TryParse<JawPosition>(d.MandibularPosition, true, out var mn) ? mn : JawPosition.Normal,
            UpperIncisorInclination = Enum.TryParse<IncisorInclination>(d.UpperIncisorInclination, true, out var ui) ? ui : IncisorInclination.Normal,
            LowerIncisorInclination = Enum.TryParse<IncisorInclination>(d.LowerIncisorInclination, true, out var li) ? li : IncisorInclination.Normal,
            SoftTissueProfile = Enum.TryParse<SoftTissueProfile>(d.SoftTissueProfile, true, out var st) ? st : SoftTissueProfile.Unknown,
            OverjetMm = d.OverjetMm.HasValue ? (decimal)d.OverjetMm : null,
            OverjetClassification = Enum.TryParse<OverjetStatus>(d.OverjetClassification, true, out var ojc) ? ojc : null,
            OverbitesMm = d.OverbitesMm.HasValue ? (decimal)d.OverbitesMm : null,
            OverbiteClassification = Enum.TryParse<OverbiteStatus>(d.OverbiteClassification, true, out var obc) ? obc : null,
            ConfidenceScore = (decimal)d.ConfidenceScore,
            SkeletalDifferential = d.SkeletalDifferential,
            AnbUsed = (decimal)(d.AnbUsed ?? 0),
            AnbRotationCorrected = d.AnbRotationCorrected ?? false,
            OdiNote = d.OdiNote,
            GrowthTendency = d.GrowthTendency,
            SummaryText = d.Summary,
            Warnings = d.Warnings ?? [],
            SkeletalType = d.SkeletalType,
            CorrectedAnb = (decimal)d.CorrectedAnb,
            ApdiClassification = d.ApdiClassification,
            OdiClassification = d.OdiClassification,
            ClinicalNotes = d.ClinicalNotes ?? []
        };
        _db.Diagnoses.Add(diagnosis);

        // Transition Study (Case) to Completed
        session.XRayImage.Study.Status = StudyStatus.Completed;
        session.XRayImage.Study.UpdatedAt = DateTime.UtcNow;

        await _db.SaveChangesAsync(ct);
        return Result<SessionDiagnosisDto>.Success(MapDiagnosis(diagnosis));
    }

    internal static SessionDiagnosisDto MapDiagnosis(Diagnosis d) => new(
        d.Id, d.SkeletalClass.ToString(), d.VerticalPattern.ToString(),
        d.MaxillaryPosition.ToString(), d.MandibularPosition.ToString(),
        d.UpperIncisorInclination.ToString(), d.LowerIncisorInclination.ToString(),
        d.SoftTissueProfile.ToString(),
        d.OverjetMm, d.OverjetClassification?.ToString(), 
        d.OverbitesMm, d.OverbiteClassification?.ToString(),
        d.ConfidenceScore, d.SummaryText,
        d.Warnings ?? [],
        d.ClinicalNotes ?? [],
        d.SkeletalType,
        d.CorrectedAnb,
        d.ApdiClassification,
        d.OdiClassification,
        d.SkeletalDifferential);
}

// ═══════════════════════════════════════════════════════════════════════════════
// Get Diagnosis
// ═══════════════════════════════════════════════════════════════════════════════

public record GetDiagnosisQuery(Guid SessionId, string DoctorId) : IRequest<Result<SessionDiagnosisDto>>;

public class GetDiagnosisHandler : IRequestHandler<GetDiagnosisQuery, Result<SessionDiagnosisDto>>
{
    private readonly IApplicationDbContext _db;
    public GetDiagnosisHandler(IApplicationDbContext db) => _db = db;

    public async Task<Result<SessionDiagnosisDto>> Handle(GetDiagnosisQuery q, CancellationToken ct)
    {
        var session = await _db.AnalysisSessions
            .Include(x => x.XRayImage).ThenInclude(x => x.Study).ThenInclude(x => x.Patient)
            .Include(x => x.Diagnosis)
            .AsNoTracking()
            .FirstOrDefaultAsync(x => x.Id == q.SessionId, ct);

        if (session is null) return Result<SessionDiagnosisDto>.NotFound();
        if (session.XRayImage.Study.Patient.DoctorId.ToString() != q.DoctorId)
            return Result<SessionDiagnosisDto>.Unauthorized();
        if (session.Diagnosis is null)
            return Result<SessionDiagnosisDto>.NotFound("No diagnosis found.");

        return Result<SessionDiagnosisDto>.Success(ClassifyDiagnosisHandler.MapDiagnosis(session.Diagnosis));
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Suggest Treatment
// ═══════════════════════════════════════════════════════════════════════════════

public record SuggestTreatmentCommand(Guid SessionId, string DoctorId) : IRequest<Result<IEnumerable<SessionTreatmentDto>>>;

public class SuggestTreatmentHandler : IRequestHandler<SuggestTreatmentCommand, Result<IEnumerable<SessionTreatmentDto>>>
{
    private readonly IApplicationDbContext _db;
    private readonly IAiService _aiService;
    private readonly IStorageService _storageService;

    public SuggestTreatmentHandler(IApplicationDbContext db, IAiService aiService, IStorageService storageService) 
    { 
        _db = db; 
        _aiService = aiService; 
        _storageService = storageService;
    }

    public async Task<Result<IEnumerable<SessionTreatmentDto>>> Handle(SuggestTreatmentCommand cmd, CancellationToken ct)
    {
        var session = await _db.AnalysisSessions
            .Include(x => x.XRayImage).ThenInclude(x => x.Study).ThenInclude(x => x.Patient)
            .Include(x => x.Measurements)
            .Include(x => x.Diagnosis).ThenInclude(d => d!.TreatmentPlans)
            .FirstOrDefaultAsync(x => x.Id == cmd.SessionId, ct);

        if (session is null) return Result<IEnumerable<SessionTreatmentDto>>.NotFound();
        if (session.XRayImage.Study.Patient.DoctorId.ToString() != cmd.DoctorId)
            return Result<IEnumerable<SessionTreatmentDto>>.Unauthorized();
        if (session.Diagnosis is null)
            return Result<IEnumerable<SessionTreatmentDto>>.Failure("No diagnosis found. Run diagnosis first.");

        var patient = session.XRayImage.Study.Patient;
        var patientAge = (DateTime.Today.Year - patient.DateOfBirth.Year);

        string? base64Image = null;
        try
        {
            using var stream = await _storageService.DownloadFileAsync(session.XRayImage.StorageUrl, ct);
            using var ms = new MemoryStream();
            await stream.CopyToAsync(ms, ct);
            base64Image = Convert.ToBase64String(ms.ToArray());
        }
        catch (Exception)
        {
            // Ignore error and fall back to rule-based or text-only LLM if image download fails
        }

        var treatResult = await _aiService.SuggestTreatmentAsync(
            cmd.SessionId,
            session.Diagnosis.SkeletalClass.ToString(),
            session.Diagnosis.VerticalPattern.ToString(),
            session.Measurements
                .GroupBy(m => m.MeasurementCode)
                .ToDictionary(g => g.Key, g => (double)g.First().Value),
            patientAge,
            ct,
            base64Image);

        if (!treatResult.IsSuccess)
            return Result<IEnumerable<SessionTreatmentDto>>.Failure(treatResult.Error ?? "Treatment error", treatResult.StatusCode);

        // Clear old treatment plans
        if (session.Diagnosis.TreatmentPlans.Any())
        {
            foreach (var tp in session.Diagnosis.TreatmentPlans.ToList())
                _db.TreatmentPlans.Remove(tp);
        }

        var plans = treatResult.Data!.Select(t => new TreatmentPlan
        {
            DiagnosisId = session.Diagnosis.Id,
            PlanIndex = (short)t.PlanIndex,
            TreatmentType = Enum.TryParse<TreatmentType>(t.TreatmentType, true, out var tt) ? tt : TreatmentType.Braces,
            TreatmentName = t.TreatmentName,
            Description = t.Description,
            Rationale = t.Rationale,
            Risks = t.Risks,
            EstimatedDurationMonths = t.EstimatedDurationMonths.HasValue ? (short)t.EstimatedDurationMonths : null,
            ConfidenceScore = (decimal)t.ConfidenceScore,
            Source = Enum.TryParse<TreatmentSource>(t.Source, true, out var ts) ? ts : TreatmentSource.Hybrid,
            IsPrimary = t.IsPrimary,
            EvidenceReference = t.EvidenceReference,
            EvidenceLevel = t.EvidenceLevel,
            RetentionRecommendation = t.RetentionRecommendation
        }).ToList();

        _db.TreatmentPlans.AddRange(plans);
        await _db.SaveChangesAsync(ct);

        var dtos = plans.Select(t => MapTreatment(t, cmd.SessionId));
        return Result<IEnumerable<SessionTreatmentDto>>.Success(dtos);
    }

    internal static SessionTreatmentDto MapTreatment(TreatmentPlan t, Guid sessionId = default) => new(
        t.Id, sessionId, t.PlanIndex, t.TreatmentType.ToString(), t.TreatmentName,
        t.Description, t.Rationale, t.Risks, (short?)t.EstimatedDurationMonths,
        t.ConfidenceScore, t.Source.ToString(), t.IsPrimary, t.EvidenceReference,
        t.EvidenceLevel, t.RetentionRecommendation);
}

// ═══════════════════════════════════════════════════════════════════════════════
// Get Treatment
// ═══════════════════════════════════════════════════════════════════════════════

public record GetTreatmentQuery(Guid SessionId, string DoctorId) : IRequest<Result<IEnumerable<SessionTreatmentDto>>>;

public class GetTreatmentHandler : IRequestHandler<GetTreatmentQuery, Result<IEnumerable<SessionTreatmentDto>>>
{
    private readonly IApplicationDbContext _db;
    public GetTreatmentHandler(IApplicationDbContext db) => _db = db;

    public async Task<Result<IEnumerable<SessionTreatmentDto>>> Handle(GetTreatmentQuery q, CancellationToken ct)
    {
        var session = await _db.AnalysisSessions
            .Include(x => x.XRayImage).ThenInclude(x => x.Study).ThenInclude(x => x.Patient)
            .Include(x => x.Diagnosis).ThenInclude(d => d!.TreatmentPlans)
            .AsNoTracking()
            .FirstOrDefaultAsync(x => x.Id == q.SessionId, ct);

        if (session is null) return Result<IEnumerable<SessionTreatmentDto>>.NotFound();
        if (session.XRayImage.Study.Patient.DoctorId.ToString() != q.DoctorId)
            return Result<IEnumerable<SessionTreatmentDto>>.Unauthorized();
        if (session.Diagnosis is null || !session.Diagnosis.TreatmentPlans.Any())
            return Result<IEnumerable<SessionTreatmentDto>>.NotFound("No treatment plans found.");

        var dtos = session.Diagnosis.TreatmentPlans
            .OrderBy(t => t.PlanIndex)
            .Select(t => SuggestTreatmentHandler.MapTreatment(t, q.SessionId));

        return Result<IEnumerable<SessionTreatmentDto>>.Success(dtos);
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Full Pipeline (Detect → Measure → Diagnose → Treat)
// ═══════════════════════════════════════════════════════════════════════════════

public record RunFullPipelineCommand(Guid ImageId, string DoctorId, AnalysisType AnalysisType = AnalysisType.Steiner, bool IsCbctDerived = false, string? Population = null) : IRequest<Result<FullPipelineDto>>;

public class RunFullPipelineHandler : IRequestHandler<RunFullPipelineCommand, Result<FullPipelineDto>>
{
    private readonly IMediator _mediator;

    public RunFullPipelineHandler(IMediator mediator) => _mediator = mediator;

    public async Task<Result<FullPipelineDto>> Handle(RunFullPipelineCommand cmd, CancellationToken ct)
    {
        // Step 1: Detect landmarks
        var detectResult = await _mediator.Send(new DetectLandmarksCommand(cmd.ImageId, cmd.DoctorId, cmd.AnalysisType), ct);
        if (!detectResult.IsSuccess)
            return Result<FullPipelineDto>.Failure(detectResult.Error ?? "Landmark detection failed.", detectResult.StatusCode);

        // Find the session we just created (latest for this image)
        var sessionQuery = await _mediator.Send(new GetLatestSessionForImageQuery(cmd.ImageId, cmd.DoctorId), ct);
        if (!sessionQuery.IsSuccess)
            return Result<FullPipelineDto>.Failure("Could not find analysis session.");

        var sessionId = sessionQuery.Data!.Id;

        // Step 2: Calculate measurements
        var measResult = await _mediator.Send(new CalculateMeasurementsCommand(sessionId, cmd.DoctorId, cmd.IsCbctDerived, cmd.Population), ct);

        // Step 3: Classify diagnosis
        Result<SessionDiagnosisDto>? diagResult = null;
        if (measResult.IsSuccess)
            diagResult = await _mediator.Send(new ClassifyDiagnosisCommand(sessionId, cmd.DoctorId), ct);

        // Step 4: Suggest treatment
        Result<IEnumerable<SessionTreatmentDto>>? treatResult = null;
        if (diagResult?.IsSuccess == true)
            treatResult = await _mediator.Send(new SuggestTreatmentCommand(sessionId, cmd.DoctorId), ct);

        var pipeline = new FullPipelineDto(
            Session: sessionQuery.Data!,
            Landmarks: detectResult.Data!.Select(l => new SessionLandmarkDto(
                Guid.Empty, l.Name, l.Name, (decimal)l.Point.X, (decimal)l.Point.Y,
                (decimal)l.Confidence,
                LandmarkProvenance.IsDirectAiDetected(l.Provenance),
                false,
                LandmarkProvenance.BuildAdjustmentReason(l.Provenance, l.DerivedFrom),
                LandmarkProvenance.Normalize(l.Provenance),
                LandmarkProvenance.ExpectedErrorMm(l.Confidence, l.Provenance, l.ExpectedErrorMm),
                l.DerivedFrom)),
            Measurements: measResult.IsSuccess ? measResult.Data! : [],
            Diagnosis: diagResult?.IsSuccess == true ? diagResult.Data : null,
            Treatments: treatResult?.IsSuccess == true ? treatResult.Data! : []);

        return Result<FullPipelineDto>.Success(pipeline);
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Finalize Analysis (Save Landmarks -> Measure -> Diagnose -> Treat -> Snapshot)
// ═══════════════════════════════════════════════════════════════════════════════

public record FinalizeAnalysisCommand(Guid SessionId, string DoctorId, List<LandmarkUpdateDto> Landmarks, bool IsCbctDerived = false, string? Population = null) : IRequest<Result<FullPipelineDto>>;

public class FinalizeAnalysisHandler : IRequestHandler<FinalizeAnalysisCommand, Result<FullPipelineDto>>
{
    private readonly IApplicationDbContext _db;
    private readonly IMediator _mediator;
    private readonly IStorageService _storage;
    private readonly IImageOverlayService _imageOverlay;
    private readonly IMultiOverlayService _multiOverlay;

    public FinalizeAnalysisHandler(
        IApplicationDbContext db,
        IMediator mediator,
        IStorageService storage,
        IImageOverlayService imageOverlay,
        IMultiOverlayService multiOverlay)
    {
        _db           = db;
        _mediator     = mediator;
        _storage      = storage;
        _imageOverlay = imageOverlay;
        _multiOverlay = multiOverlay;
    }

    public async Task<Result<FullPipelineDto>> Handle(FinalizeAnalysisCommand cmd, CancellationToken ct)
    {
        var session = await _db.AnalysisSessions
            .Include(x => x.XRayImage).ThenInclude(x => x.Study).ThenInclude(x => x.Patient)
            .Include(x => x.Landmarks)
            .FirstOrDefaultAsync(x => x.Id == cmd.SessionId, ct);

        if (session is null) return Result<FullPipelineDto>.NotFound("Session not found.");
        if (session.XRayImage.Study.Patient.DoctorId.ToString() != cmd.DoctorId)
            return Result<FullPipelineDto>.Unauthorized();

        // 1. Update manual landmarks from front-end state
        if (cmd.Landmarks != null && cmd.Landmarks.Any())
        {
            foreach (var update in cmd.Landmarks)
            {
                var lm = session.Landmarks.FirstOrDefault(l => l.LandmarkCode == update.LandmarkCode);
                if (lm != null)
                {
                    lm.XPx = update.X;
                    lm.YPx = update.Y;
                    lm.IsManuallyAdjusted = true;
                }
            }
            await _db.SaveChangesAsync(ct);
        }

        // 2. Sequential calculation pipeline
        var measRes = await _mediator.Send(new CalculateMeasurementsCommand(cmd.SessionId, cmd.DoctorId, cmd.IsCbctDerived, cmd.Population), ct);
        if (!measRes.IsSuccess) return Result<FullPipelineDto>.Failure(measRes.Error ?? "Measurement step failed.");

        var diagRes = await _mediator.Send(new ClassifyDiagnosisCommand(cmd.SessionId, cmd.DoctorId), ct);
        if (!diagRes.IsSuccess) return Result<FullPipelineDto>.Failure(diagRes.Error ?? "Diagnosis step failed.");

        var treatRes = await _mediator.Send(new SuggestTreatmentCommand(cmd.SessionId, cmd.DoctorId), ct);
        if (!treatRes.IsSuccess) return Result<FullPipelineDto>.Failure(treatRes.Error ?? "Treatment step failed.");

        // 3. Status update & Snapshot generation
        try
        {
            // Reload with full graph for overlay service
            var fullSession = await _db.AnalysisSessions
                .Include(x => x.XRayImage)
                .Include(x => x.Landmarks)
                .Include(x => x.Measurements)
                .Include(x => x.Diagnosis)
                .FirstOrDefaultAsync(x => x.Id == cmd.SessionId, ct);

            if (fullSession != null)
            {
                using var baseStream = await _storage.DownloadFileAsync(fullSession.XRayImage.StorageUrl, ct);
                using var overlaidStream = await _imageOverlay.GenerateOverlaidImageAsync(baseStream, fullSession, ct);
                
                string snapshotPath = $"{fullSession.Id}_markup.png";
                var snapshotUrl = await _storage.UploadFileAsync(
                    overlaidStream, snapshotPath, "image/png",
                    new StorageOptions(StorageCategory.Overlay),
                    ct);
                
                fullSession.ResultImageUrl = snapshotUrl;
                fullSession.Status = SessionStatus.Finalized;
                fullSession.CompletedAt = DateTime.UtcNow;
                
                await _db.SaveChangesAsync(ct);
                
                // Refresh local session object for DTO construction
                session = fullSession;
            }
        }
        catch (Exception)
        {
            // Fallback: mark finalized even if Skia snapshot fails
            session.Status = SessionStatus.Finalized;
            session.CompletedAt = DateTime.UtcNow;
            await _db.SaveChangesAsync(ct);
        }

        // 4. AI overlay images (non-blocking — failure does not abort finalization)
        _ = Task.Run(async () =>
        {
            try
            {
                await _multiOverlay.GenerateAndStoreAsync(
                    cmd.SessionId, cmd.DoctorId, outputs: null, ct: CancellationToken.None);
            }
            catch
            {
                // Best-effort; errors are swallowed here
            }
        }, CancellationToken.None);

        // 4. Return combined results
        var sessionDto = new SessionDto(
            session.Id, session.XRayImageId, session.Status.ToString(), session.ModelVersion,
            session.InferenceDurationMs, session.StartedAt, session.CompletedAt,
            session.Landmarks.Count, session.Measurements.Count, session.Diagnosis != null, session.ResultImageUrl);

        var landmarksDto = session.Landmarks.Select(l => new SessionLandmarkDto(
            l.Id, l.LandmarkCode, l.LandmarkName, l.XPx, l.YPx, l.ConfidenceScore,
            l.IsAiDetected, l.IsManuallyAdjusted, l.AdjustmentReason,
            LandmarkProvenance.FromStored(l), l.ExpectedErrorMm, LandmarkProvenance.DerivedFrom(l)));

        return Result<FullPipelineDto>.Success(new FullPipelineDto(
            sessionDto,
            landmarksDto,
            measRes.Data!,
            diagRes.Data,
            treatRes.Data!));
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Helper: Get Latest Session for Image
// ═══════════════════════════════════════════════════════════════════════════════

public record GetLatestSessionForImageQuery(Guid ImageId, string DoctorId) : IRequest<Result<SessionDto>>;

public class GetLatestSessionForImageHandler : IRequestHandler<GetLatestSessionForImageQuery, Result<SessionDto>>
{
    private readonly IApplicationDbContext _db;
    public GetLatestSessionForImageHandler(IApplicationDbContext db) => _db = db;

    public async Task<Result<SessionDto>> Handle(GetLatestSessionForImageQuery q, CancellationToken ct)
    {
        var s = await _db.AnalysisSessions
            .Include(x => x.Landmarks)
            .Include(x => x.Measurements)
            .Include(x => x.Diagnosis)
            .Where(x => x.XRayImageId == q.ImageId)
            .OrderByDescending(x => x.QueuedAt)
            .AsNoTracking()
            .FirstOrDefaultAsync(ct);

        if (s is null) return Result<SessionDto>.Success(null!);

        return Result<SessionDto>.Success(new SessionDto(
            s.Id, s.XRayImageId, s.Status.ToString(), s.ModelVersion,
            s.InferenceDurationMs, s.StartedAt, s.CompletedAt,
            s.Landmarks.Count, s.Measurements.Count, s.Diagnosis != null, s.ResultImageUrl));
    }
}

// ── Analysis History ────────────────────────────────────────────────────────

public class GetAnalysisHistoryHandler : IRequestHandler<GetAnalysisHistoryQuery, Result<IEnumerable<AnalysisHistoryItemDto>>>
{
    private readonly IApplicationDbContext _db;
    public GetAnalysisHistoryHandler(IApplicationDbContext db) => _db = db;

    public async Task<Result<IEnumerable<AnalysisHistoryItemDto>>> Handle(GetAnalysisHistoryQuery q, CancellationToken ct)
    {
        var doctorId = Guid.Parse(q.DoctorId);
        var query = _db.AnalysisSessions
            .Include(x => x.XRayImage).ThenInclude(i => i.Study).ThenInclude(s => s.Patient)
            .Include(x => x.Diagnosis)
            .Where(x => x.XRayImage.Study.DoctorId == doctorId)
            .AsNoTracking();

        // Filters
        if (!string.IsNullOrWhiteSpace(q.SearchTerm))
        {
            var term = q.SearchTerm.ToLower();
            query = query.Where(x => 
                x.XRayImage.Study.Patient.FirstName.ToLower().Contains(term) || 
                x.XRayImage.Study.Patient.LastName.ToLower().Contains(term) ||
                (x.XRayImage.Study.Patient.MedicalRecordNo != null && x.XRayImage.Study.Patient.MedicalRecordNo.ToLower().Contains(term)));
        }

        if (q.Type.HasValue) query = query.Where(x => x.AnalysisType == q.Type.Value);
        if (q.Status.HasValue) query = query.Where(x => x.Status == q.Status.Value);
        if (q.SkeletalClass.HasValue) query = query.Where(x => x.Diagnosis != null && x.Diagnosis.SkeletalClass == q.SkeletalClass.Value);
        if (q.StartDate.HasValue) query = query.Where(x => x.QueuedAt >= q.StartDate.Value);
        if (q.EndDate.HasValue) query = query.Where(x => x.QueuedAt <= q.EndDate.Value);

        var sessions = await query
            .OrderByDescending(x => x.QueuedAt)
            .Take(q.PageSize)
            .ToListAsync(ct);

        var dtos = sessions.Select(s => new AnalysisHistoryItemDto(
            s.Id,
            $"{s.XRayImage.Study.Patient.FirstName} {s.XRayImage.Study.Patient.LastName}",
            s.XRayImage.Study.Patient.MedicalRecordNo ?? "N/A",
            s.AnalysisType.ToString(),
            s.Status.ToString(),
            s.QueuedAt,
            s.Diagnosis?.SkeletalClass.ToString(),
            s.Diagnosis?.VerticalPattern.ToString(),
            s.CompletedAt
        ));

        return Result<IEnumerable<AnalysisHistoryItemDto>>.Success(dtos);
    }
}
// ── Delete Analysis Session ──────────────────────────────────────────────────

public record DeleteAnalysisSessionCommand(Guid SessionId, string UserId) : IRequest<Result<Unit>>;

public class DeleteAnalysisSessionHandler : IRequestHandler<DeleteAnalysisSessionCommand, Result<Unit>>
{
    private readonly IApplicationDbContext _db;
    private readonly IStorageService       _storage;

    public DeleteAnalysisSessionHandler(IApplicationDbContext db, IStorageService storage)
    {
        _db      = db;
        _storage = storage;
    }

    public async Task<Result<Unit>> Handle(DeleteAnalysisSessionCommand cmd, CancellationToken ct)
    {
        var session = await _db.AnalysisSessions
            .Include(s => s.XRayImage)
                .ThenInclude(i => i.Study)
            .Include(s => s.Reports)
            .FirstOrDefaultAsync(s => s.Id == cmd.SessionId, ct);

        if (session is null) return Result<Unit>.NotFound("Analysis session not found.");
        
        // Ensure the session belongs to the requesting doctor
        if (session.XRayImage.Study.DoctorId.ToString() != cmd.UserId)
            return Result<Unit>.Unauthorized("You do not have access to this analysis session.");

        // ── 1. Collect all storage URLs to delete ───────────────────────────
        var urlsToDelete = new HashSet<string>();
        
        if (!string.IsNullOrWhiteSpace(session.ResultImageUrl))
            urlsToDelete.Add(session.ResultImageUrl);

        if (!string.IsNullOrWhiteSpace(session.OverlayImagesJson))
        {
            try
            {
                var overlays = System.Text.Json.JsonSerializer.Deserialize<List<OverlayImageEntry>>(session.OverlayImagesJson);
                if (overlays != null)
                {
                        foreach (var o in overlays)
                        {
                            if (!string.IsNullOrWhiteSpace(o.StorageUrl) && !o.StorageUrl.StartsWith("error:"))
                                urlsToDelete.Add(o.StorageUrl);
                        }
                }
            }
            catch { /* ignore malformed json */ }
        }

        foreach (var report in session.Reports)
        {
            if (!string.IsNullOrWhiteSpace(report.StorageUrl))
                urlsToDelete.Add(report.StorageUrl);
        }

        // ── 2. Delete from storage ──────────────────────────────────────────
        foreach (var url in urlsToDelete)
        {
            try { await _storage.DeleteFileAsync(url, ct); }
            catch { /* non-fatal */ }
        }

        // ── 3. Hard delete from database ────────────────────────────────────
        _db.AnalysisSessions.Remove(session);
        await _db.SaveChangesAsync(ct);

        return Result<Unit>.Success(Unit.Value, 204);
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Generate AI Overlay Images
// ═══════════════════════════════════════════════════════════════════════════════

/// <summary>
/// Triggers (re-)generation of all 5 AI clinical overlay images for a session.
/// Idempotent: can be called multiple times to refresh images after landmark adjustments.
/// </summary>
public record GenerateOverlaysCommand(
    Guid SessionId,
    string DoctorId,
    List<string>? Outputs = null
) : IRequest<Result<MultiOverlayResult>>;

public class GenerateOverlaysHandler : IRequestHandler<GenerateOverlaysCommand, Result<MultiOverlayResult>>
{
    private readonly IMultiOverlayService _multiOverlay;
    public GenerateOverlaysHandler(IMultiOverlayService multiOverlay) => _multiOverlay = multiOverlay;

    public Task<Result<MultiOverlayResult>> Handle(GenerateOverlaysCommand cmd, CancellationToken ct)
        => _multiOverlay.GenerateAndStoreAsync(cmd.SessionId, cmd.DoctorId, cmd.Outputs, ct);
}

// ═══════════════════════════════════════════════════════════════════════════════
// Get Stored Overlay Images
// ═══════════════════════════════════════════════════════════════════════════════

/// <summary>
/// Returns the stored overlay image entries (URLs + metadata) for a session.
/// Returns an empty list if overlays have not been generated yet.
/// </summary>
public record GetOverlayImagesQuery(Guid SessionId, string DoctorId)
    : IRequest<Result<IEnumerable<OverlayImageEntry>>>;

public class GetOverlayImagesHandler : IRequestHandler<GetOverlayImagesQuery, Result<IEnumerable<OverlayImageEntry>>>
{
    private readonly IApplicationDbContext _db;
    private static readonly System.Text.Json.JsonSerializerOptions _jsonOpts = new()
    {
        PropertyNamingPolicy        = System.Text.Json.JsonNamingPolicy.CamelCase,
        PropertyNameCaseInsensitive = true,
    };

    public GetOverlayImagesHandler(IApplicationDbContext db) => _db = db;

    public async Task<Result<IEnumerable<OverlayImageEntry>>> Handle(GetOverlayImagesQuery q, CancellationToken ct)
    {
        var session = await _db.AnalysisSessions
            .Include(s => s.XRayImage).ThenInclude(i => i.Study).ThenInclude(st => st.Patient)
            .AsNoTracking()
            .FirstOrDefaultAsync(s => s.Id == q.SessionId, ct);

        if (session is null) return Result<IEnumerable<OverlayImageEntry>>.NotFound();
        if (session.XRayImage.Study.Patient.DoctorId.ToString() != q.DoctorId)
            return Result<IEnumerable<OverlayImageEntry>>.Unauthorized();

        if (string.IsNullOrEmpty(session.OverlayImagesJson))
        {
            // Fallback: expose the finalized markup snapshot as an overlay-like entry.
            if (!string.IsNullOrWhiteSpace(session.ResultImageUrl))
            {
                var fallback = new OverlayImageEntry(
                    Key: "markup_snapshot",
                    Label: "Markup Snapshot",
                    StorageUrl: session.ResultImageUrl,
                    Width: session.XRayImage.WidthPx ?? 0,
                    Height: session.XRayImage.HeightPx ?? 0);

                return Result<IEnumerable<OverlayImageEntry>>.Success([fallback]);
            }

            return Result<IEnumerable<OverlayImageEntry>>.Success(Enumerable.Empty<OverlayImageEntry>());
        }

        var entries = System.Text.Json.JsonSerializer.Deserialize<List<OverlayImageEntry>>(
            session.OverlayImagesJson, _jsonOpts) ?? [];

        return Result<IEnumerable<OverlayImageEntry>>.Success(entries);
    }
}

public record GetAnalysisNormsQuery() : IRequest<Result<object>>;

public class GetAnalysisNormsHandler : IRequestHandler<GetAnalysisNormsQuery, Result<object>>
{
    private readonly IAiService _aiService;
    public GetAnalysisNormsHandler(IAiService aiService) => _aiService = aiService;

    public async Task<Result<object>> Handle(GetAnalysisNormsQuery request, CancellationToken ct)
    {
        return await _aiService.GetAnalysisNormsAsync(ct);
    }
}

public class ExplainDecisionHandler : IRequestHandler<ExplainDecisionCommand, Result<XaiResponseDto>>
{
    private readonly IApplicationDbContext _db;
    private readonly IAiService _aiService;

    public ExplainDecisionHandler(IApplicationDbContext db, IAiService aiService)
    {
        _db = db;
        _aiService = aiService;
    }

    public async Task<Result<XaiResponseDto>> Handle(ExplainDecisionCommand cmd, CancellationToken ct)
    {
        var session = await _db.AnalysisSessions
            .Include(x => x.XRayImage).ThenInclude(x => x.Study).ThenInclude(x => x.Patient)
            .FirstOrDefaultAsync(x => x.Id == cmd.SessionId, ct);

        if (session is null) return Result<XaiResponseDto>.NotFound("Session not found.");
        if (session.XRayImage.Study.Patient.DoctorId.ToString() != cmd.DoctorId)
            return Result<XaiResponseDto>.Unauthorized();

        return await _aiService.ExplainDecisionAsync(
            cmd.SessionId,
            cmd.Request.SkeletalClass,
            cmd.Request.SkeletalProbabilities,
            cmd.Request.VerticalPattern,
            cmd.Request.Measurements,
            cmd.Request.TreatmentName,
            cmd.Request.PredictedOutcomes,
            cmd.Request.UncertaintyLandmarks,
            ct);
    }
}
