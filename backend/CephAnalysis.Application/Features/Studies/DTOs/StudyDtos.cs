namespace CephAnalysis.Application.Features.Studies.DTOs;

public record StudyDto(
    Guid Id,
    Guid PatientId,
    string StudyType,
    string Status,
    string? Title,
    string? ClinicalNotes,
    DateOnly StudyDate,
    DateTime CreatedAt,
    string? LastAnalysisStatus = null,
    string? LastSkeletalClass = null
);

public record CreateStudyRequest(
    Guid PatientId,
    string StudyType,
    string? Title = null,
    string? ClinicalNotes = null,
    DateOnly? StudyDate = null
);
