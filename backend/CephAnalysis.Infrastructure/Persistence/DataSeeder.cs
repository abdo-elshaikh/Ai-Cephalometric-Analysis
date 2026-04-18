using CephAnalysis.Domain.Entities;
using CephAnalysis.Domain.Enums;
using Microsoft.EntityFrameworkCore;
using BC = BCrypt.Net.BCrypt;

namespace CephAnalysis.Infrastructure.Persistence;

/// <summary>
/// Seeds initial data for development and demo environments.
/// All operations are idempotent — safe to run on every startup.
/// </summary>
public static class DataSeeder
{
    // Fixed GUIDs for deterministic seeding
    private static readonly Guid AdminId  = Guid.Parse("a0000000-0000-0000-0000-000000000001");
    private static readonly Guid DoctorId = Guid.Parse("d0000000-0000-0000-0000-000000000001");
    private static readonly Guid ViewerId = Guid.Parse("f0000000-0000-0000-0000-000000000001");

    public static async Task SeedAsync(ApplicationDbContext db)
    {
        await SeedUsersAsync(db);
        await SeedPatientsAndStudiesAsync(db);
        await db.SaveChangesAsync();
    }

    private static async Task SeedUsersAsync(ApplicationDbContext db)
    {
        if (await db.Users.AnyAsync())
            return;

        db.Users.AddRange(
            new User
            {
                Id           = AdminId,
                Email        = "admin@ceph.local",
                PasswordHash = BC.HashPassword("Admin@123"),
                FullName     = "System Administrator",
                Role         = UserRole.Admin,
                Specialty    = "System Administration",
                IsActive     = true,
            },
            new User
            {
                Id           = DoctorId,
                Email        = "doctor@ceph.local",
                PasswordHash = BC.HashPassword("Doctor@123"),
                FullName     = "Dr. Ahmed Hassan",
                Role         = UserRole.Doctor,
                Specialty    = "Orthodontics",
                IsActive     = true,
            },
            new User
            {
                Id           = ViewerId,
                Email        = "viewer@ceph.local",
                PasswordHash = BC.HashPassword("Viewer@123"),
                FullName     = "Sarah Johnson",
                Role         = UserRole.Viewer,
                IsActive     = true,
            }
        );
    }

    private static async Task SeedPatientsAndStudiesAsync(ApplicationDbContext db)
    {
        if (await db.Patients.AnyAsync())
            return;

        var patients = new[]
        {
            new Patient
            {
                DoctorId       = DoctorId,
                FirstName      = "Omar",
                LastName        = "Khalil",
                DateOfBirth    = new DateOnly(2008, 3, 15),
                Gender         = GenderType.Male,
                Phone          = "+20-100-555-0001",
                Email          = "omar.k@example.com",
                MedicalRecordNo= "MRN-2026-0001",
                Notes          = "Class II Division 1 malocclusion. Referred for cephalometric evaluation.",
            },
            new Patient
            {
                DoctorId       = DoctorId,
                FirstName      = "Fatima",
                LastName        = "Ali",
                DateOfBirth    = new DateOnly(2005, 7, 22),
                Gender         = GenderType.Female,
                Phone          = "+20-100-555-0002",
                Email          = "fatima.a@example.com",
                MedicalRecordNo= "MRN-2026-0002",
                Notes          = "Skeletal Class III with anterior crossbite. Pre-surgical evaluation.",
            },
            new Patient
            {
                DoctorId       = DoctorId,
                FirstName      = "Youssef",
                LastName        = "Nasser",
                DateOfBirth    = new DateOnly(2010, 11, 8),
                Gender         = GenderType.Male,
                Phone          = "+20-100-555-0003",
                MedicalRecordNo= "MRN-2026-0003",
                Notes          = "High angle case. Initial consultation for growth modification.",
            },
        };

        db.Patients.AddRange(patients);
        await db.SaveChangesAsync(); // Save to get patient IDs

        // Create one study per patient
        var studies = new[]
        {
            new Study
            {
                PatientId     = patients[0].Id,
                DoctorId      = DoctorId,
                StudyDate     = new DateOnly(2026, 4, 1),
                StudyType     = StudyType.Lateral,
                Title         = "Initial Lateral Ceph",
                ClinicalNotes = "Baseline cephalometric study for treatment planning.",
                Status        = StudyStatus.Pending,
            },
            new Study
            {
                PatientId     = patients[1].Id,
                DoctorId      = DoctorId,
                StudyDate     = new DateOnly(2026, 4, 3),
                StudyType     = StudyType.Lateral,
                Title         = "Pre-Surgical Assessment",
                ClinicalNotes = "Lateral ceph for orthognathic surgery planning.",
                Status        = StudyStatus.Pending,
            },
            new Study
            {
                PatientId     = patients[2].Id,
                DoctorId      = DoctorId,
                StudyDate     = new DateOnly(2026, 4, 5),
                StudyType     = StudyType.Lateral,
                Title         = "Growth Evaluation",
                ClinicalNotes = "Cephalometric analysis to evaluate growth pattern.",
                Status        = StudyStatus.Pending,
            },
        };

        db.Studies.AddRange(studies);
    }
}
