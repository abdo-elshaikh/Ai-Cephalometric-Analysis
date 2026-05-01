using CephAnalysis.Application.Features.Images.DTOs;
using CephAnalysis.Application.Features.Analysis.Commands;
using CephAnalysis.Application.Interfaces;
using CephAnalysis.Domain.Entities;
using CephAnalysis.Domain.Enums;
using CephAnalysis.Shared.Common;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace CephAnalysis.Application.Features.Reports.Commands;

// ── DTOs ────────────────────────────────────────────────────────────────────

public record ReportDto(
    Guid Id, Guid SessionId, string ReportFormat, string Language,
    string StorageUrl, long? FileSizeBytes,
    bool IncludesXray, bool IncludesLandmarkOverlay,
    bool IncludesMeasurements, bool IncludesTreatmentPlan,
    DateTime GeneratedAt, DateTime? ExpiresAt,
    string? PatientName = null, string? MedicalRecordNo = null);

public record GenerateReportRequest(
    bool IncludesXray = true,
    bool IncludesLandmarkOverlay = true,
    bool IncludesMeasurements = true,
    bool IncludesTreatmentPlan = true,
    string Language = "en");

// ── Generate Report ─────────────────────────────────────────────────────────

public record GenerateReportCommand(Guid SessionId, GenerateReportRequest Request, string DoctorId)
    : IRequest<Result<ReportDto>>;

public class GenerateReportHandler : IRequestHandler<GenerateReportCommand, Result<ReportDto>>
{
    private readonly IApplicationDbContext _db;
    private readonly IReportGenerator _reportGenerator;
    private readonly IStorageService _storage;
    private readonly IAiService _ai;

    public GenerateReportHandler(IApplicationDbContext db, IReportGenerator reportGenerator, IStorageService storage, IAiService ai)
    {
        _db = db;
        _reportGenerator = reportGenerator;
        _storage = storage;
        _ai = ai;
    }

    public async Task<Result<ReportDto>> Handle(GenerateReportCommand cmd, CancellationToken ct)
    {
        var session = await _db.AnalysisSessions
            .Include(x => x.XRayImage).ThenInclude(x => x.Study).ThenInclude(x => x.Patient)
            .Include(x => x.Landmarks)
            .Include(x => x.Measurements)
            .Include(x => x.Diagnosis).ThenInclude(d => d!.TreatmentPlans)
            .AsNoTracking()
            .FirstOrDefaultAsync(x => x.Id == cmd.SessionId, ct);

        if (session is null) return Result<ReportDto>.NotFound("Session not found.");
        if (session.XRayImage.Study.Patient.DoctorId.ToString() != cmd.DoctorId)
            return Result<ReportDto>.Unauthorized();

        // Data Integrity: Auto-calculate if measurements or diagnosis are missing
        if (!session.Measurements.Any() && session.Landmarks.Any())
        {
            var landmarkDict = session.Landmarks
                .GroupBy(l => l.LandmarkCode)
                .ToDictionary(g => g.Key, g => new Point2D((double)g.First().XPx, (double)g.First().YPx));
            var landmarkProvenance = session.Landmarks
                .GroupBy(l => l.LandmarkCode)
                .ToDictionary(g => g.Key, g => LandmarkProvenance.FromStored(g.First()));
            var measResult = await _ai.CalculateMeasurementsAsync(
                session.Id,
                landmarkDict,
                session.XRayImage.PixelSpacingMm ?? 1.0m,
                ct,
                landmarkProvenance);
            if (measResult.IsSuccess)
            {
                session.Measurements = measResult.Data!.Select(m => new Measurement
                {
                    MeasurementCode = m.Code,
                    MeasurementName = m.Name,
                    Category = Enum.TryParse<AnalysisType>(m.Category, true, out var cat) ? cat : null,
                    Value = (decimal)m.Value,
                    Status = Enum.TryParse<MeasurementStatus>(m.Status, true, out var ms) ? ms : MeasurementStatus.Normal,
                    Unit = m.Unit == "Millimeters" ? MeasurementUnit.Millimeters : MeasurementUnit.Degrees,
                    NormalMin = (decimal)m.NormalMin,
                    NormalMax = (decimal)m.NormalMax,
                    Deviation = m.Deviation.HasValue ? (decimal)m.Deviation.Value : null
                }).ToList();
            }
        }

        if (session.Diagnosis == null && session.Measurements.Any())
        {
            var diagResult = await _ai.ClassifyDiagnosisAsync(
                session.Id, 
                session.Measurements
                    .GroupBy(m => m.MeasurementCode)
                    .ToDictionary(g => g.Key, g => (double)g.First().Value), 
                ct);
            if (diagResult.IsSuccess)
            {
                var d = diagResult.Data!;
                session.Diagnosis = new Diagnosis
                {
                    SkeletalClass = Enum.TryParse<SkeletalClass>(d.SkeletalClass, true, out var sc) ? sc : SkeletalClass.ClassI,
                    VerticalPattern = Enum.TryParse<VerticalPattern>(d.VerticalPattern, true, out var vp) ? vp : VerticalPattern.Normal,
                    ConfidenceScore = (decimal)d.ConfidenceScore,
                    SkeletalDifferential = d.SkeletalDifferential,
                    AnbUsed = (decimal)(d.AnbUsed ?? 0),
                    AnbRotationCorrected = d.AnbRotationCorrected ?? false,
                    OdiNote = d.OdiNote,
                    GrowthTendency = d.GrowthTendency,
                    SummaryText = d.Summary
                };
            }
        }

        var req = cmd.Request;

        // Generate the PDF byte array using QuestPDF
        var pdfBytes = await _reportGenerator.GeneratePdfReportAsync(session, req, ct);

        // Define a unique file name and store it
        var fileName = $"reports/{cmd.SessionId}/report_{Guid.NewGuid():N}.pdf";
        using var memoryStream = new MemoryStream(pdfBytes);
        var storageUrl = await _storage.UploadFileAsync(memoryStream, fileName, "application/pdf", ct);

        var report = new Report
        {
            SessionId = cmd.SessionId,
            GeneratedBy = Guid.Parse(cmd.DoctorId),
            ReportFormat = ReportFormat.PDF,
            Language = req.Language,
            StorageUrl = storageUrl,
            FileSizeBytes = pdfBytes.Length,
            IncludesXray = req.IncludesXray,
            IncludesLandmarkOverlay = req.IncludesLandmarkOverlay,
            IncludesMeasurements = req.IncludesMeasurements,
            IncludesTreatmentPlan = req.IncludesTreatmentPlan,
            ExpiresAt = DateTime.UtcNow.AddDays(30),
        };

        _db.Reports.Add(report);
        await _db.SaveChangesAsync(ct);

        return Result<ReportDto>.Success(MapReport(report, session.XRayImage.Study.Patient), 201);
    }

    internal static ReportDto MapReport(Report r, Patient? p = null) => new(
        r.Id, r.SessionId, r.ReportFormat.ToString(), r.Language,
        r.StorageUrl, r.FileSizeBytes,
        r.IncludesXray, r.IncludesLandmarkOverlay,
        r.IncludesMeasurements, r.IncludesTreatmentPlan,
        r.GeneratedAt, r.ExpiresAt,
        p != null ? $"{p.FirstName} {p.LastName}" : null,
        p?.MedicalRecordNo);
}

// ── Get Report ──────────────────────────────────────────────────────────────

public record GetReportQuery(Guid ReportId, string DoctorId) : IRequest<Result<ReportDto>>;

public class GetReportHandler : IRequestHandler<GetReportQuery, Result<ReportDto>>
{
    private readonly IApplicationDbContext _db;
    public GetReportHandler(IApplicationDbContext db) => _db = db;

    public async Task<Result<ReportDto>> Handle(GetReportQuery q, CancellationToken ct)
    {
        var report = await _db.Reports
            .Include(r => r.Session).ThenInclude(s => s.XRayImage).ThenInclude(i => i.Study).ThenInclude(s => s.Patient)
            .AsNoTracking()
            .FirstOrDefaultAsync(r => r.Id == q.ReportId, ct);

        if (report is null) return Result<ReportDto>.NotFound();
        if (report.Session.XRayImage.Study.Patient.DoctorId.ToString() != q.DoctorId)
            return Result<ReportDto>.Unauthorized();

        return Result<ReportDto>.Success(GenerateReportHandler.MapReport(report, report.Session.XRayImage.Study.Patient));
    }
}

// ── List Reports for Session ────────────────────────────────────────────────

public record GetSessionReportsQuery(Guid SessionId, string DoctorId) : IRequest<Result<IEnumerable<ReportDto>>>;

public class GetSessionReportsHandler : IRequestHandler<GetSessionReportsQuery, Result<IEnumerable<ReportDto>>>
{
    private readonly IApplicationDbContext _db;
    public GetSessionReportsHandler(IApplicationDbContext db) => _db = db;

    public async Task<Result<IEnumerable<ReportDto>>> Handle(GetSessionReportsQuery q, CancellationToken ct)
    {
        var session = await _db.AnalysisSessions
            .Include(x => x.XRayImage).ThenInclude(i => i.Study).ThenInclude(s => s.Patient)
            .Include(x => x.Reports)
            .AsNoTracking()
            .FirstOrDefaultAsync(x => x.Id == q.SessionId, ct);

        if (session is null) return Result<IEnumerable<ReportDto>>.NotFound();
        if (session.XRayImage.Study.Patient.DoctorId.ToString() != q.DoctorId)
            return Result<IEnumerable<ReportDto>>.Unauthorized();

        var dtos = session.Reports
            .OrderByDescending(r => r.GeneratedAt)
            .Select(r => GenerateReportHandler.MapReport(r, session.XRayImage.Study.Patient));

        return Result<IEnumerable<ReportDto>>.Success(dtos);
    }
}

// ── List All Reports for Doctor ─────────────────────────────────────────────

public record GetAllReportsQuery(string DoctorId) : IRequest<Result<IEnumerable<ReportDto>>>;

public class GetAllReportsHandler : IRequestHandler<GetAllReportsQuery, Result<IEnumerable<ReportDto>>>
{
    private readonly IApplicationDbContext _db;
    public GetAllReportsHandler(IApplicationDbContext db) => _db = db;

    public async Task<Result<IEnumerable<ReportDto>>> Handle(GetAllReportsQuery q, CancellationToken ct)
    {
        var doctorId = Guid.Parse(q.DoctorId);

        var reports = await _db.Reports
            .Include(r => r.Session)
                .ThenInclude(s => s.XRayImage)
                    .ThenInclude(i => i.Study)
                        .ThenInclude(st => st.Patient)
            .Where(r => r.Session.XRayImage.Study.DoctorId == doctorId)
            .OrderByDescending(r => r.GeneratedAt)
            .AsNoTracking()
            .ToListAsync(ct);

        return Result<IEnumerable<ReportDto>>.Success(reports.Select(r => GenerateReportHandler.MapReport(r, r.Session.XRayImage.Study.Patient)));
    }
}
