using CephAnalysis.Domain.Enums;
using System.Text.Json;

namespace CephAnalysis.Domain.Entities;

public class XRayImage
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid StudyId { get; set; }
    public string FileName { get; set; } = string.Empty;
    public FileFormat FileFormat { get; set; }
    public string StorageUrl { get; set; } = string.Empty;
    public string? ThumbnailUrl { get; set; }
    public long FileSizeBytes { get; set; }
    public int? WidthPx { get; set; }
    public int? HeightPx { get; set; }
    public decimal? PixelSpacingMm { get; set; }
    public decimal? CalibrationRatio { get; set; }
    public JsonDocument? CalibrationPoint1 { get; set; }
    public JsonDocument? CalibrationPoint2 { get; set; }
    public decimal? CalibrationKnownMm { get; set; }
    public bool IsCalibrated { get; set; } = false;
    public DateTime UploadedAt { get; set; } = DateTime.UtcNow;

    // Navigation
    public Study Study { get; set; } = null!;
    public ICollection<AnalysisSession> AnalysisSessions { get; set; } = [];
}
