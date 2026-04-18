using CephAnalysis.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace CephAnalysis.Infrastructure.Persistence.Configurations;

public class LandmarkConfiguration : IEntityTypeConfiguration<Landmark>
{
    public void Configure(EntityTypeBuilder<Landmark> builder)
    {
        builder.HasKey(l => l.Id);
        builder.Property(l => l.LandmarkCode).HasMaxLength(20).IsRequired();
        builder.Property(l => l.LandmarkName).HasMaxLength(100).IsRequired();
        builder.Property(l => l.XPx).HasPrecision(10, 4);
        builder.Property(l => l.YPx).HasPrecision(10, 4);
        builder.Property(l => l.XMm).HasPrecision(10, 4);
        builder.Property(l => l.YMm).HasPrecision(10, 4);
        builder.Property(l => l.ConfidenceScore).HasPrecision(5, 4);
        builder.Property(l => l.AdjustmentReason).HasMaxLength(500);
        builder.Property(l => l.CreatedAt).HasDefaultValueSql("NOW()");
        // Composite index: fast lookup of specific landmark in session
        builder.HasIndex(l => new { l.SessionId, l.LandmarkCode });

        builder.HasOne(l => l.Session)
            .WithMany(s => s.Landmarks)
            .HasForeignKey(l => l.SessionId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}
