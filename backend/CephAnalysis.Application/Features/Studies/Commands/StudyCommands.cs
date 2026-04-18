using CephAnalysis.Application.Features.Studies.DTOs;
using CephAnalysis.Application.Interfaces;
using CephAnalysis.Domain.Entities;
using CephAnalysis.Domain.Enums;
using CephAnalysis.Shared.Common;
using CephAnalysis.Shared.Pagination;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace CephAnalysis.Application.Features.Studies.Commands;

// ── Create Study ────────────────────────────────────────────────────────────

public record CreateStudyCommand(CreateStudyRequest Request, string DoctorId) : IRequest<Result<StudyDto>>;

public class CreateStudyHandler(IApplicationDbContext db) : IRequestHandler<CreateStudyCommand, Result<StudyDto>>
{
    private readonly IApplicationDbContext _db = db;

    public async Task<Result<StudyDto>> Handle(CreateStudyCommand cmd, CancellationToken ct)
    {
        var req = cmd.Request;

        // Ensure patient exists and belongs to doctor
        var patient = await _db.Patients.FirstOrDefaultAsync(p => p.Id == req.PatientId, ct);
        if (patient is null) return Result<StudyDto>.NotFound("Patient not found.");
        if (patient.DoctorId.ToString() != cmd.DoctorId)
            return Result<StudyDto>.Unauthorized("You do not have access to this patient.");

        if (!Enum.TryParse<StudyType>(req.StudyType, out var type))
            return Result<StudyDto>.Failure("Invalid study type.", 400);

        var study = new Study
        {
            PatientId = req.PatientId,
            DoctorId = Guid.Parse(cmd.DoctorId),
            StudyType = type,
            Title = req.Title,
            Status = StudyStatus.Pending,
            ClinicalNotes = req.ClinicalNotes,
            StudyDate = req.StudyDate ?? DateOnly.FromDateTime(DateTime.UtcNow)
        };

        _db.Studies.Add(study);
        await _db.SaveChangesAsync(ct);

        return Result<StudyDto>.Success(Map(study), 201);
    }

    internal static StudyDto Map(Study s) => new(
        s.Id, s.PatientId, s.StudyType.ToString(), s.Status.ToString(), s.Title, s.ClinicalNotes, s.StudyDate, s.CreatedAt);
}

// ── Get Studies For Patient ──────────────────────────────────────────────────

public record GetPatientStudiesQuery(Guid PatientId, string DoctorId) : IRequest<Result<List<StudyDto>>>;

public class GetPatientStudiesHandler(IApplicationDbContext db) : IRequestHandler<GetPatientStudiesQuery, Result<List<StudyDto>>>
{
    private readonly IApplicationDbContext _db = db;

    public async Task<Result<List<StudyDto>>> Handle(GetPatientStudiesQuery query, CancellationToken ct)
    {
        var patient = await _db.Patients.AsNoTracking().FirstOrDefaultAsync(p => p.Id == query.PatientId, ct);
        if (patient is null) return Result<List<StudyDto>>.NotFound("Patient not found.");
        if (patient.DoctorId.ToString() != query.DoctorId)
            return Result<List<StudyDto>>.Unauthorized("You do not have access to this patient.");

        var studies = await _db.Studies
            .AsNoTracking()
            .Where(s => s.PatientId == query.PatientId)
            .OrderByDescending(s => s.CreatedAt)
            .Select(s => new StudyDto(
                s.Id,
                s.PatientId,
                s.StudyType.ToString(),
                s.Status.ToString(),
                s.Title,
                s.ClinicalNotes,
                s.StudyDate,
                s.CreatedAt,
                s.XRayImages
                    .SelectMany(i => i.AnalysisSessions)
                    .OrderByDescending(asess => asess.CompletedAt)
                    .Select(asess => asess.Status.ToString())
                    .FirstOrDefault(),
                s.XRayImages
                    .SelectMany(i => i.AnalysisSessions)
                    .Where(asess => asess.Diagnosis != null)
                    .OrderByDescending(asess => asess.CompletedAt)
                    .Select(asess => asess.Diagnosis!.SkeletalClass.ToString())
                    .FirstOrDefault()
            ))
            .ToListAsync(ct);

        return Result<List<StudyDto>>.Success(studies);
    }
}

// ── Delete Study ─────────────────────────────────────────────────────────────

public record DeleteStudyCommand(Guid StudyId, string DoctorId) : IRequest<Result<Unit>>;

public class DeleteStudyHandler(IApplicationDbContext db) : IRequestHandler<DeleteStudyCommand, Result<Unit>>
{
    private readonly IApplicationDbContext _db = db;

    public async Task<Result<Unit>> Handle(DeleteStudyCommand cmd, CancellationToken ct)
    {
        var study = await _db.Studies
            .Include(s => s.XRayImages)
            .FirstOrDefaultAsync(s => s.Id == cmd.StudyId, ct);

        if (study is null) return Result<Unit>.NotFound("Study not found.");
        if (study.DoctorId.ToString() != cmd.DoctorId)
            return Result<Unit>.Unauthorized("You do not have access to this study.");

        // Handlers for medical data cleanup
        // Note: EF Core cascade delete should handle XRayImages and their child AnalysisSessions/Landmarks/etc 
        // if configured in OnModelCreating.
        _db.Studies.Remove(study);
        await _db.SaveChangesAsync(ct);

        return Result<Unit>.Success(Unit.Value, 204);
    }
}
