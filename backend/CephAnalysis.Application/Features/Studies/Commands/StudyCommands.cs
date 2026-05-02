using CephAnalysis.Application.Features.Studies;
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

        var studies = await StudyQueryHelper.ProjectToDto(
                _db.Studies
                    .AsNoTracking()
                    .Where(s => s.PatientId == query.PatientId)
                    .OrderByDescending(s => s.CreatedAt))
            .ToListAsync(ct);

        return Result<List<StudyDto>>.Success(studies);
    }
}

// ── Get All Studies For Doctor ───────────────────────────────────────────────

public record GetAllStudiesQuery(string DoctorId) : IRequest<Result<List<StudyDto>>>;

public class GetAllStudiesHandler(IApplicationDbContext db) : IRequestHandler<GetAllStudiesQuery, Result<List<StudyDto>>>
{
    private readonly IApplicationDbContext _db = db;

    public async Task<Result<List<StudyDto>>> Handle(GetAllStudiesQuery query, CancellationToken ct)
    {
        var studies = await StudyQueryHelper.ProjectToDto(
                _db.Studies
                    .AsNoTracking()
                    .Where(s => s.DoctorId.ToString() == query.DoctorId)
                    .OrderByDescending(s => s.CreatedAt))
            .ToListAsync(ct);

        return Result<List<StudyDto>>.Success(studies);
    }
}

// ── Get Study By Id ──────────────────────────────────────────────────────────

public record GetStudyQuery(Guid StudyId, string DoctorId) : IRequest<Result<StudyDto>>;

public class GetStudyHandler(IApplicationDbContext db) : IRequestHandler<GetStudyQuery, Result<StudyDto>>
{
    private readonly IApplicationDbContext _db = db;

    public async Task<Result<StudyDto>> Handle(GetStudyQuery query, CancellationToken ct)
    {
        var dto = await StudyQueryHelper.ProjectToDto(
                _db.Studies
                    .AsNoTracking()
                    .Where(s => s.Id == query.StudyId && s.DoctorId.ToString() == query.DoctorId))
            .FirstOrDefaultAsync(ct);

        if (dto is not null)
            return Result<StudyDto>.Success(dto);

        var exists = await _db.Studies.AsNoTracking().AnyAsync(s => s.Id == query.StudyId, ct);
        return exists
            ? Result<StudyDto>.Unauthorized("You do not have access to this study.")
            : Result<StudyDto>.NotFound("Study not found.");
    }
}

// ── Update Study ─────────────────────────────────────────────────────────────

public record UpdateStudyCommand(Guid StudyId, UpdateStudyRequest Request, string DoctorId) : IRequest<Result<StudyDto>>;

public class UpdateStudyHandler(IApplicationDbContext db) : IRequestHandler<UpdateStudyCommand, Result<StudyDto>>
{
    private readonly IApplicationDbContext _db = db;

    public async Task<Result<StudyDto>> Handle(UpdateStudyCommand cmd, CancellationToken ct)
    {
        var study = await _db.Studies.FirstOrDefaultAsync(s => s.Id == cmd.StudyId, ct);
        if (study is null) return Result<StudyDto>.NotFound("Study not found.");
        if (study.DoctorId.ToString() != cmd.DoctorId)
            return Result<StudyDto>.Unauthorized("You do not have access to this study.");

        var req = cmd.Request;
        if (!Enum.TryParse<StudyType>(req.StudyType, out var type))
            return Result<StudyDto>.Failure("Invalid study type.", 400);

        study.StudyType = type;
        study.Title = req.Title;
        study.ClinicalNotes = req.ClinicalNotes;
        study.StudyDate = req.StudyDate;
        study.UpdatedAt = DateTime.UtcNow;

        if (!string.IsNullOrWhiteSpace(req.Status))
        {
            if (!Enum.TryParse<StudyStatus>(req.Status, out var st))
                return Result<StudyDto>.Failure("Invalid study status.", 400);
            study.Status = st;
        }

        await _db.SaveChangesAsync(ct);

        var dto = await StudyQueryHelper.ProjectToDto(
                _db.Studies.AsNoTracking().Where(s => s.Id == study.Id))
            .FirstAsync(ct);

        return Result<StudyDto>.Success(dto);
    }
}

// ── Delete Study ─────────────────────────────────────────────────────────────

public record DeleteStudyCommand(Guid StudyId, string DoctorId) : IRequest<Result<Unit>>;

public class DeleteStudyHandler : IRequestHandler<DeleteStudyCommand, Result<Unit>>
{
    private readonly IApplicationDbContext _db;
    private readonly IStorageManager       _storageManager;

    public DeleteStudyHandler(IApplicationDbContext db, IStorageManager storageManager)
    {
        _db             = db;
        _storageManager = storageManager;
    }

    public async Task<Result<Unit>> Handle(DeleteStudyCommand cmd, CancellationToken ct)
    {
        var study = await _db.Studies
            .FirstOrDefaultAsync(s => s.Id == cmd.StudyId, ct);

        if (study is null) return Result<Unit>.NotFound("Study not found.");
        if (study.DoctorId.ToString() != cmd.DoctorId)
            return Result<Unit>.Unauthorized("You do not have access to this study.");

        // ── 1. Cascade-delete all associated storage files in parallel ──────
        await _storageManager.DeleteStudyAssetsAsync(cmd.StudyId, ct);

        // ── 2. Hard delete from database (EF cascade handles children) ──────
        _db.Studies.Remove(study);
        await _db.SaveChangesAsync(ct);

        return Result<Unit>.Success(Unit.Value, 204);
    }
}
