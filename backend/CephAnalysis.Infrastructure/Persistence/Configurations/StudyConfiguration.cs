using CephAnalysis.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace CephAnalysis.Infrastructure.Persistence.Configurations;

public class StudyConfiguration : IEntityTypeConfiguration<Study>
{
    public void Configure(EntityTypeBuilder<Study> builder)
    {
        builder.HasKey(s => s.Id);
        builder.Property(s => s.StudyType).HasConversion<string>();
        builder.Property(s => s.Status).HasConversion<string>();
        builder.Property(s => s.Title).HasMaxLength(200);
        builder.Property(s => s.CreatedAt).HasDefaultValueSql("NOW()");
        builder.HasIndex(s => s.PatientId); // performance index

        builder.HasOne(s => s.Patient)
            .WithMany(p => p.Studies)
            .HasForeignKey(s => s.PatientId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.HasOne(s => s.Doctor)
            .WithMany(u => u.Studies)
            .HasForeignKey(s => s.DoctorId)
            .OnDelete(DeleteBehavior.Restrict);
    }
}
