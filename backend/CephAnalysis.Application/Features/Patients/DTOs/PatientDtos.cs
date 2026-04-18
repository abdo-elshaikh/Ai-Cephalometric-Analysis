namespace CephAnalysis.Application.Features.Patients.DTOs;

public record PatientDto(
    Guid Id,
    string MedicalRecordNo,
    string FirstName,
    string LastName,
    DateOnly DateOfBirth,
    string Gender,
    string? Phone,
    string? Email,
    string? Notes,
    DateTime CreatedAt,
    DateTime? UpdatedAt,
    string? LastSkeletalClass = null,
    int TotalStudiesCount = 0
);

public record CreatePatientRequest(
    string FirstName,
    string LastName,
    DateOnly DateOfBirth,
    string Gender,
    string? Phone = null,
    string? Email = null,
    string? MedicalRecordNo = null,
    string? Notes = null
);

public record UpdatePatientRequest(
    string FirstName,
    string LastName,
    DateOnly DateOfBirth,
    string Gender,
    string? Phone = null,
    string? Email = null,
    string? MedicalRecordNo = null,
    string? Notes = null
);
