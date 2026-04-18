using CephAnalysis.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace CephAnalysis.Infrastructure.Persistence.Configurations;

public class XRayImageConfiguration : IEntityTypeConfiguration<XRayImage>
{
    public void Configure(EntityTypeBuilder<XRayImage> builder)
    {
        builder.HasKey(x => x.Id);
        builder.Property(x => x.FileName).HasMaxLength(300).IsRequired();
        builder.Property(x => x.FileFormat).HasConversion<string>();
        builder.Property(x => x.StorageUrl).IsRequired();
        builder.Property(x => x.PixelSpacingMm).HasPrecision(8, 4);
        builder.Property(x => x.CalibrationRatio).HasPrecision(10, 6);
        builder.Property(x => x.CalibrationKnownMm).HasPrecision(8, 2);
        builder.Property(x => x.CalibrationPoint1).HasColumnType("jsonb");
        builder.Property(x => x.CalibrationPoint2).HasColumnType("jsonb");
        builder.Property(x => x.IsCalibrated).HasDefaultValue(false);
        builder.Property(x => x.UploadedAt).HasDefaultValueSql("NOW()");
        builder.HasIndex(x => x.StudyId);

        builder.HasOne(x => x.Study)
            .WithMany(s => s.XRayImages)
            .HasForeignKey(x => x.StudyId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}
