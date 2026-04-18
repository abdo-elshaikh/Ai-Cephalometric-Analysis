using CephAnalysis.Application.Interfaces;
using CephAnalysis.Domain.Entities;
using Microsoft.EntityFrameworkCore;

namespace CephAnalysis.Infrastructure.Persistence;

public class ApplicationDbContext(
    DbContextOptions<ApplicationDbContext> options,
    IEncryptionService? encryption = null) : DbContext(options), IApplicationDbContext
{
    private readonly IEncryptionService? _encryption = encryption;

    public DbSet<User> Users => Set<User>();
    public DbSet<Patient> Patients => Set<Patient>();
    public DbSet<Study> Studies => Set<Study>();
    public DbSet<XRayImage> XRayImages => Set<XRayImage>();
    public DbSet<AnalysisSession> AnalysisSessions => Set<AnalysisSession>();
    public DbSet<Landmark> Landmarks => Set<Landmark>();
    public DbSet<Measurement> Measurements => Set<Measurement>();
    public DbSet<Diagnosis> Diagnoses => Set<Diagnosis>();
    public DbSet<TreatmentPlan> TreatmentPlans => Set<TreatmentPlan>();
    public DbSet<Report> Reports => Set<Report>();
    public DbSet<AuditLog> AuditLogs => Set<AuditLog>();

    protected override void OnModelCreating(ModelBuilder builder)
    {
        base.OnModelCreating(builder);

        if (_encryption != null)
        {
            var stringConverter = new Microsoft.EntityFrameworkCore.Storage.ValueConversion.ValueConverter<string, string>(
                v => _encryption.Encrypt(v),
                v => _encryption.Decrypt(v));

            var nullableConverter = new Microsoft.EntityFrameworkCore.Storage.ValueConversion.ValueConverter<string?, string?>(
                v => v == null ? null : _encryption.Encrypt(v),
                v => v == null ? null : _encryption.Decrypt(v));

            builder.Entity<Patient>(p =>
            {
                p.Property(x => x.FirstName).HasConversion(stringConverter);
                p.Property(x => x.LastName).HasConversion(stringConverter);
                p.Property(x => x.Email).HasConversion(nullableConverter);
                p.Property(x => x.MedicalRecordNo).HasConversion(nullableConverter);
            });

            builder.Entity<User>(u =>
            {
                u.Property(x => x.Email).HasConversion(stringConverter);
            });
        }

        builder.ApplyConfigurationsFromAssembly(typeof(ApplicationDbContext).Assembly);
    }
}
