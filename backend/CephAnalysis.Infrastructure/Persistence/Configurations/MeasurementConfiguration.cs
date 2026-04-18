using CephAnalysis.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace CephAnalysis.Infrastructure.Persistence.Configurations;

public class MeasurementConfiguration : IEntityTypeConfiguration<Measurement>
{
    public void Configure(EntityTypeBuilder<Measurement> builder)
    {
        builder.HasKey(m => m.Id);
        builder.Property(m => m.MeasurementCode).HasMaxLength(30).IsRequired();
        builder.Property(m => m.MeasurementName).HasMaxLength(150).IsRequired();
        builder.Property(m => m.MeasurementType).HasConversion<string>();
        builder.Property(m => m.Unit).HasConversion<string>();
        builder.Property(m => m.Status).HasConversion<string>();
        builder.Property(m => m.Value).HasPrecision(10, 4);
        builder.Property(m => m.NormalMin).HasPrecision(10, 4);
        builder.Property(m => m.NormalMax).HasPrecision(10, 4);
        builder.Property(m => m.Deviation).HasPrecision(10, 4);
        builder.Property(m => m.LandmarkRefs).HasColumnType("jsonb");
        builder.Property(m => m.CreatedAt).HasDefaultValueSql("NOW()");
        builder.HasIndex(m => new { m.SessionId, m.MeasurementCode });

        builder.HasOne(m => m.Session)
            .WithMany(s => s.Measurements)
            .HasForeignKey(m => m.SessionId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}
