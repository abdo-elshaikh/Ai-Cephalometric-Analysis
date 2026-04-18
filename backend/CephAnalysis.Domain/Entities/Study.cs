using CephAnalysis.Domain.Enums;

namespace CephAnalysis.Domain.Entities;

public class Study
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid PatientId { get; set; }
    public Guid DoctorId { get; set; }
    public DateOnly StudyDate { get; set; }
    public StudyType StudyType { get; set; }
    public string? Title { get; set; }
    public string? ClinicalNotes { get; set; }
    public StudyStatus Status { get; set; } = StudyStatus.Pending;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    // Navigation
    public Patient Patient { get; set; } = null!;
    public User Doctor { get; set; } = null!;
    public ICollection<XRayImage> XRayImages { get; set; } = [];
}
