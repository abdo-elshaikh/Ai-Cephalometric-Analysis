using CephAnalysis.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace CephAnalysis.Infrastructure.Persistence.Configurations;

public class AnalysisSessionConfiguration : IEntityTypeConfiguration<AnalysisSession>
{
    public void Configure(EntityTypeBuilder<AnalysisSession> builder)
    {
        builder.HasKey(a => a.Id);
        builder.Property(a => a.ModelVersion).HasMaxLength(50).IsRequired();
        builder.Property(a => a.AnalysisType).HasConversion<string>();
        builder.Property(a => a.Status).HasConversion<string>();
        builder.Property(a => a.QueuedAt).HasDefaultValueSql("NOW()");
        builder.Property(a => a.TriggeredBy).IsRequired();
        builder.Property(a => a.LandmarkMeta)
            .HasConversion(
                v => System.Text.Json.JsonSerializer.Serialize(v, (System.Text.Json.JsonSerializerOptions?)null),
                v => string.IsNullOrEmpty(v) 
                    ? new Dictionary<string, LandmarkMeta>() 
                    : System.Text.Json.JsonSerializer.Deserialize<Dictionary<string, LandmarkMeta>>(v, (System.Text.Json.JsonSerializerOptions?)null) ?? new Dictionary<string, LandmarkMeta>())
            .Metadata.SetValueComparer(new Microsoft.EntityFrameworkCore.ChangeTracking.ValueComparer<Dictionary<string, LandmarkMeta>>(
                (c1, c2) => (c1 == null && c2 == null) || (c1 != null && c2 != null && c1.Count == c2.Count && !c1.Except(c2).Any()),
                c => c.Aggregate(0, (a, v) => HashCode.Combine(a, v.Key.GetHashCode(), v.Value.GetHashCode())),
                c => c.ToDictionary(entry => entry.Key, entry => entry.Value)))
            ;
        builder.Property(a => a.LandmarkMeta).HasColumnType("text");

        builder.HasOne(a => a.XRayImage)
            .WithMany(x => x.AnalysisSessions)
            .HasForeignKey(a => a.XRayImageId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.HasOne(a => a.TriggeredByUser)
            .WithMany()
            .HasForeignKey(a => a.TriggeredBy)
            .OnDelete(DeleteBehavior.Restrict);
    }
}
