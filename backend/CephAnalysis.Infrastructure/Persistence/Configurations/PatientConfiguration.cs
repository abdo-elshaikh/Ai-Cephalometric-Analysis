using CephAnalysis.Domain.Entities;
using CephAnalysis.Domain.Enums;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace CephAnalysis.Infrastructure.Persistence.Configurations;

public class PatientConfiguration : IEntityTypeConfiguration<Patient>
{
    public void Configure(EntityTypeBuilder<Patient> builder)
    {
        builder.HasKey(p => p.Id);
        builder.Property(p => p.FirstName).HasMaxLength(500).IsRequired();
        builder.Property(p => p.LastName).HasMaxLength(500).IsRequired();
        builder.Property(p => p.Gender).HasConversion<string>();
        builder.Property(p => p.Phone).HasMaxLength(30);
        builder.Property(p => p.Email).HasMaxLength(500);
        builder.Property(p => p.MedicalRecordNo).HasMaxLength(500);
        builder.HasIndex(p => p.MedicalRecordNo).IsUnique();
        builder.HasIndex(p => p.DoctorId); // performance index
        builder.Property(p => p.CreatedAt).HasDefaultValueSql("NOW()");

        builder.HasOne(p => p.Doctor)
            .WithMany(u => u.Patients)
            .HasForeignKey(p => p.DoctorId)
            .OnDelete(DeleteBehavior.Restrict);
    }
}
