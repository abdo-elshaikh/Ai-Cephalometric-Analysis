using CephAnalysis.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace CephAnalysis.Infrastructure.Persistence.Configurations;

public class ReportConfiguration : IEntityTypeConfiguration<Report>
{
    public void Configure(EntityTypeBuilder<Report> builder)
    {
        builder.HasKey(r => r.Id);
        builder.Property(r => r.ReportFormat).HasConversion<string>();
        builder.Property(r => r.Language).HasMaxLength(10).HasDefaultValue("en");
        builder.Property(r => r.StorageUrl).IsRequired();
        builder.Property(r => r.GeneratedAt).HasDefaultValueSql("NOW()");

        builder.HasOne(r => r.Session)
            .WithMany(s => s.Reports)
            .HasForeignKey(r => r.SessionId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.HasOne(r => r.GeneratedByUser)
            .WithMany()
            .HasForeignKey(r => r.GeneratedBy)
            .OnDelete(DeleteBehavior.Restrict);
    }
}
