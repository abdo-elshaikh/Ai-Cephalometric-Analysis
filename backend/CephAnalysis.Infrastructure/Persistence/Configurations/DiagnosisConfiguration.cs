using CephAnalysis.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace CephAnalysis.Infrastructure.Persistence.Configurations;

public class DiagnosisConfiguration : IEntityTypeConfiguration<Diagnosis>
{
    public void Configure(EntityTypeBuilder<Diagnosis> builder)
    {
        builder.HasKey(d => d.Id);
        builder.HasIndex(d => d.SessionId).IsUnique(); // 1:1 with session
        builder.Property(d => d.SkeletalClass).HasConversion<string>();
        builder.Property(d => d.VerticalPattern).HasConversion<string>();
        builder.Property(d => d.MaxillaryPosition).HasConversion<string>();
        builder.Property(d => d.MandibularPosition).HasConversion<string>();
        builder.Property(d => d.UpperIncisorInclination).HasConversion<string>();
        builder.Property(d => d.LowerIncisorInclination).HasConversion<string>();
        builder.Property(d => d.CrowdingSeverity).HasConversion<string>();
        builder.Property(d => d.OverjetMm).HasPrecision(6, 2);
        builder.Property(d => d.OverjetClassification).HasConversion<string>();
        builder.Property(d => d.OverbitesMm).HasPrecision(6, 2);
        builder.Property(d => d.OverbiteClassification).HasConversion<string>();
        builder.Property(d => d.SoftTissueProfile).HasConversion<string>();
        builder.Property(d => d.AnbUsed).HasPrecision(6, 2);
        builder.Property(d => d.SkeletalDifferential)
            .HasConversion(
                v => System.Text.Json.JsonSerializer.Serialize(v, (System.Text.Json.JsonSerializerOptions?)null),
                v => string.IsNullOrEmpty(v)
                    ? new Dictionary<string, double>()
                    : System.Text.Json.JsonSerializer.Deserialize<Dictionary<string, double>>(v, (System.Text.Json.JsonSerializerOptions?)null) ?? new Dictionary<string, double>())
            .Metadata.SetValueComparer(new Microsoft.EntityFrameworkCore.ChangeTracking.ValueComparer<Dictionary<string, double>>(
                (c1, c2) => (c1 == null && c2 == null) || (c1 != null && c2 != null && c1.Count == c2.Count && !c1.Except(c2).Any()),
                c => c.Aggregate(0, (a, v) => HashCode.Combine(a, v.Key.GetHashCode(), v.Value.GetHashCode())),
                c => c.ToDictionary(entry => entry.Key, entry => entry.Value)))
            ;
        builder.Property(d => d.SkeletalDifferential).HasColumnType("text");
        builder.Property(d => d.ConfidenceScore).HasPrecision(5, 4);
        builder.Property(d => d.CreatedAt).HasDefaultValueSql("NOW()");

        builder.OwnsOne(d => d.BoltonResult, b =>
        {
            b.Property(p => p.AnteriorRatio).HasPrecision(6, 2);
            b.Property(p => p.OverallRatio).HasPrecision(6, 2);
        });
        builder.Navigation(d => d.BoltonResult).IsRequired();

        builder.HasOne(d => d.Session)
            .WithOne(s => s.Diagnosis)
            .HasForeignKey<Diagnosis>(d => d.SessionId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}
