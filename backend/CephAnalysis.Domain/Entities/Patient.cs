using CephAnalysis.Domain.Enums;

namespace CephAnalysis.Domain.Entities;

public class Patient
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid DoctorId { get; set; }
    public string FirstName { get; set; } = string.Empty;
    public string LastName { get; set; } = string.Empty;
    public DateOnly DateOfBirth { get; set; }
    public GenderType Gender { get; set; }
    public string? Phone { get; set; }
    public string? Email { get; set; }
    public string? MedicalRecordNo { get; set; }
    public string? Notes { get; set; }
    public bool IsDeleted { get; set; } = false;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public string? ContactNumber { get; set; }
    public DateTime UploadedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    // Navigation
    public User Doctor { get; set; } = null!;
    public ICollection<Study> Studies { get; set; } = [];

    public string FullName => $"{FirstName} {LastName}";
    public int Age => DateTime.Today.Year - DateOfBirth.Year -
                      (DateTime.Today.DayOfYear < DateOfBirth.DayOfYear ? 1 : 0);
}
