using CephAnalysis.Application.Features.Patients.DTOs;
using CephAnalysis.Application.Interfaces;
using CephAnalysis.Domain.Entities;
using CephAnalysis.Domain.Enums;
using CephAnalysis.Shared.Common;
using CephAnalysis.Shared.Pagination;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace CephAnalysis.Application.Features.Patients.Commands;

// ── Create Patient ──────────────────────────────────────────────────────────

public record CreatePatientCommand(CreatePatientRequest Request, string DoctorId) : IRequest<Result<PatientDto>>;

public class CreatePatientHandler : IRequestHandler<CreatePatientCommand, Result<PatientDto>>
{
    private readonly IApplicationDbContext _db;

    public CreatePatientHandler(IApplicationDbContext db) => _db = db;

    public async Task<Result<PatientDto>> Handle(CreatePatientCommand cmd, CancellationToken ct)
    {
        var req = cmd.Request;

        if (!Enum.TryParse<GenderType>(req.Gender, out var gender))
            return Result<PatientDto>.Failure("Invalid gender specified.", 400);

        // ── Resolve MedicalRecordNo ─────────────────────────────────────────
        var mrn = string.IsNullOrWhiteSpace(req.MedicalRecordNo)
            ? await GenerateUniqueMrnAsync(ct)
            : req.MedicalRecordNo.Trim();

        // ── Duplicate MRN check (pre-save guard) ────────────────────────────
        var exists = await _db.Patients.AnyAsync(p => p.MedicalRecordNo == mrn, ct);
        if (exists)
            return Result<PatientDto>.Failure(
                $"Medical Record No '{mrn}' is already in use. Please choose a different one.", 409);

        var patient = new Patient
        {
            FirstName        = req.FirstName,
            LastName         = req.LastName,
            DateOfBirth      = req.DateOfBirth,
            Gender           = gender,
            Phone            = req.Phone,
            Email            = req.Email,
            MedicalRecordNo  = mrn,
            Notes            = req.Notes,
            DoctorId         = Guid.Parse(cmd.DoctorId)
        };

        _db.Patients.Add(patient);

        try
        {
            await _db.SaveChangesAsync(ct);
        }
        catch (Microsoft.EntityFrameworkCore.DbUpdateException ex)
            when (ex.InnerException?.Message.Contains("23505") == true
               || ex.InnerException?.Message.Contains("duplicate key") == true
               || ex.InnerException?.Message.Contains("IX_Patients_MedicalRecordNo") == true)
        {
            return Result<PatientDto>.Failure(
                "A patient with this Medical Record No already exists. Please use a unique MRN.", 409);
        }

        return Result<PatientDto>.Success(Map(patient), 201);
    }

    /// <summary>
    /// Generates a unique MRN in the format MRN-YYYYMMDD-XXXXXX (6 random uppercase alphanumerics).
    /// Retries up to 5 times to guarantee uniqueness.
    /// </summary>
    private async Task<string> GenerateUniqueMrnAsync(CancellationToken ct)
    {
        const string chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // unambiguous charset
        var date = DateTime.UtcNow.ToString("yyyyMMdd");

        for (int attempt = 0; attempt < 5; attempt++)
        {
            var suffix = new string(Enumerable.Range(0, 6)
                .Select(_ => chars[Random.Shared.Next(chars.Length)])
                .ToArray());
            var candidate = $"PTN-{date}-{suffix}";

            if (!await _db.Patients.AnyAsync(p => p.MedicalRecordNo == candidate, ct))
                return candidate;
        }

        // Extremely unlikely fallback: use a GUID suffix
        return $"PTN-{date}-{Guid.NewGuid().ToString("N")[..8].ToUpperInvariant()}";
    }

    internal static PatientDto Map(Patient p) => new(
        p.Id, p.MedicalRecordNo ?? string.Empty, p.FirstName, p.LastName, p.DateOfBirth, p.Gender.ToString(),
        p.Phone, p.Email, p.Notes, p.CreatedAt, p.UpdatedAt);
}

// ── Update Patient ──────────────────────────────────────────────────────────

public record UpdatePatientCommand(Guid PatientId, UpdatePatientRequest Request, string DoctorId) : IRequest<Result<PatientDto>>;

public class UpdatePatientHandler : IRequestHandler<UpdatePatientCommand, Result<PatientDto>>
{
    private readonly IApplicationDbContext _db;

    public UpdatePatientHandler(IApplicationDbContext db) => _db = db;

    public async Task<Result<PatientDto>> Handle(UpdatePatientCommand cmd, CancellationToken ct)
    {
        var patient = await _db.Patients.FirstOrDefaultAsync(p => p.Id == cmd.PatientId, ct);

        if (patient is null) return Result<PatientDto>.NotFound("Patient not found.");

        if (patient.DoctorId.ToString() != cmd.DoctorId)
            return Result<PatientDto>.Unauthorized("You do not have access to this patient.");

        var req = cmd.Request;
        if (!Enum.TryParse<GenderType>(req.Gender, out var gender))
            return Result<PatientDto>.Failure("Invalid gender specified.", 400);

        // ── MRN: keep existing if cleared, otherwise check for duplicates ──
        var newMrn = string.IsNullOrWhiteSpace(req.MedicalRecordNo)
            ? patient.MedicalRecordNo   // keep the existing one
            : req.MedicalRecordNo.Trim();

        if (newMrn != patient.MedicalRecordNo)
        {
            var taken = await _db.Patients.AnyAsync(
                p => p.MedicalRecordNo == newMrn && p.Id != cmd.PatientId, ct);
            if (taken)
                return Result<PatientDto>.Failure(
                    $"Medical Record No '{newMrn}' is already in use.", 409);
        }

        patient.FirstName       = req.FirstName;
        patient.LastName        = req.LastName;
        patient.DateOfBirth     = req.DateOfBirth;
        patient.Gender          = gender;
        patient.Phone           = req.Phone;
        patient.Email           = req.Email;
        patient.MedicalRecordNo = newMrn;
        patient.Notes           = req.Notes;
        patient.UpdatedAt       = DateTime.UtcNow;

        await _db.SaveChangesAsync(ct);

        return Result<PatientDto>.Success(CreatePatientHandler.Map(patient));
    }

}

// ── Get Patient By Id ───────────────────────────────────────────────────────

public record GetPatientQuery(Guid PatientId, string DoctorId) : IRequest<Result<PatientDto>>;

public class GetPatientHandler : IRequestHandler<GetPatientQuery, Result<PatientDto>>
{
    private readonly IApplicationDbContext _db;

    public GetPatientHandler(IApplicationDbContext db) => _db = db;

    public async Task<Result<PatientDto>> Handle(GetPatientQuery query, CancellationToken ct)
    {
        var patient = await _db.Patients
            .AsNoTracking()
            .Where(p => p.Id == query.PatientId)
            .Select(p => new PatientDto(
                p.Id, p.MedicalRecordNo ?? string.Empty, p.FirstName, p.LastName, p.DateOfBirth, p.Gender.ToString(),
                p.Phone, p.Email, p.Notes, p.CreatedAt, p.UpdatedAt,
                p.Studies
                    .SelectMany(s => s.XRayImages)
                    .SelectMany(i => i.AnalysisSessions)
                    .Where(a => a.Diagnosis != null)
                    .OrderByDescending(a => a.CompletedAt)
                    .Select(a => a.Diagnosis!.SkeletalClass.ToString())
                    .FirstOrDefault(),
                p.Studies.Count()
            ))
            .FirstOrDefaultAsync(ct);

        if (patient is null) return Result<PatientDto>.NotFound();

        if (Guid.Parse(query.DoctorId) != _db.Patients.AsNoTracking().Where(p => p.Id == query.PatientId).Select(p => p.DoctorId).FirstOrDefault())
            return Result<PatientDto>.Unauthorized("You do not have access to this patient.");

        return Result<PatientDto>.Success(patient);
    }
}

// ── List Patients ───────────────────────────────────────────────────────────

public record GetPatientsQuery(string DoctorId, int Page = 1, int PageSize = 20, string? Search = null)
    : IRequest<Result<PagedResult<PatientDto>>>;

public class GetPatientsHandler : IRequestHandler<GetPatientsQuery, Result<PagedResult<PatientDto>>>
{
    private readonly IApplicationDbContext _db;

    public GetPatientsHandler(IApplicationDbContext db) => _db = db;

    public async Task<Result<PagedResult<PatientDto>>> Handle(GetPatientsQuery query, CancellationToken ct)
    {
        var doctorIdString = query.DoctorId;
        var doctorId = Guid.Parse(doctorIdString);
        var q = _db.Patients.AsNoTracking().Where(p => p.DoctorId == doctorId);

        if (!string.IsNullOrWhiteSpace(query.Search))
        {
            var search = query.Search.ToLower();
            q = q.Where(p => p.FirstName.ToLower().Contains(search) ||
                             p.LastName.ToLower().Contains(search) ||
                             (p.MedicalRecordNo != null && p.MedicalRecordNo.ToLower().Contains(search)));
        }

        var total = await q.CountAsync(ct);

        var patients = await q
            .OrderByDescending(p => p.CreatedAt)
            .Skip((query.Page - 1) * query.PageSize)
            .Take(query.PageSize)
            .Select(p => new PatientDto(
                p.Id, p.MedicalRecordNo ?? string.Empty, p.FirstName, p.LastName, p.DateOfBirth, p.Gender.ToString(),
                p.Phone, p.Email, p.Notes, p.CreatedAt, p.UpdatedAt,
                p.Studies
                    .SelectMany(s => s.XRayImages)
                    .SelectMany(i => i.AnalysisSessions)
                    .Where(a => a.Diagnosis != null)
                    .OrderByDescending(a => a.CompletedAt)
                    .Select(a => a.Diagnosis!.SkeletalClass.ToString())
                    .FirstOrDefault(),
                p.Studies.Count()
            ))
            .ToListAsync(ct);

        var paged = new PagedResult<PatientDto>(patients, total, query.Page, query.PageSize);
        return Result<PagedResult<PatientDto>>.Success(paged);
    }
}

// ── Delete Patient (Soft Delete) ────────────────────────────────────────────

public record DeletePatientCommand(Guid PatientId, string DoctorId, string UserRole) : IRequest<Result>;

public class DeletePatientHandler : IRequestHandler<DeletePatientCommand, Result>
{
    private readonly IApplicationDbContext _db;
    private readonly IStorageManager       _storageManager;

    public DeletePatientHandler(IApplicationDbContext db, IStorageManager storageManager)
    {
        _db             = db;
        _storageManager = storageManager;
    }

    public async Task<Result> Handle(DeletePatientCommand cmd, CancellationToken ct)
    {
        var patient = await _db.Patients
            .FirstOrDefaultAsync(p => p.Id == cmd.PatientId, ct);

        if (patient is null) return Result.NotFound("Patient not found.");

        if (cmd.UserRole != "Admin" && patient.DoctorId.ToString() != cmd.DoctorId)
            return Result.Failure("You do not have permission to delete this patient.", 403);

        // ── 1. Cascade-delete all associated storage files in parallel ──────
        await _storageManager.DeletePatientAssetsAsync(cmd.PatientId, ct);

        // ── 2. Hard delete from database (EF cascade handles children) ──────
        _db.Patients.Remove(patient);
        await _db.SaveChangesAsync(ct);

        return Result.Success(204);
    }
}
