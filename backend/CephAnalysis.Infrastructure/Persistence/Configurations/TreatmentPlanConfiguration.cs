using CephAnalysis.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace CephAnalysis.Infrastructure.Persistence.Configurations;

public class TreatmentPlanConfiguration : IEntityTypeConfiguration<TreatmentPlan>
{
    public void Configure(EntityTypeBuilder<TreatmentPlan> builder)
    {
        builder.HasKey(t => t.Id);
        builder.Property(t => t.TreatmentType).HasConversion<string>();
        builder.Property(t => t.Source).HasConversion<string>();
        builder.Property(t => t.TreatmentName).HasMaxLength(300).IsRequired();
        builder.Property(t => t.ConfidenceScore).HasPrecision(5, 4);
        builder.Property(t => t.CreatedAt).HasDefaultValueSql("NOW()");
        builder.HasIndex(t => new { t.DiagnosisId, t.PlanIndex });

        builder.HasOne(t => t.Diagnosis)
            .WithMany(d => d.TreatmentPlans)
            .HasForeignKey(t => t.DiagnosisId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}
