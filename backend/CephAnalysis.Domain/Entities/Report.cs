using CephAnalysis.Domain.Enums;

namespace CephAnalysis.Domain.Entities;

public class Report
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid SessionId { get; set; }
    public Guid GeneratedBy { get; set; }
    public ReportFormat ReportFormat { get; set; } = ReportFormat.PDF;
    public string Language { get; set; } = "en";
    public string StorageUrl { get; set; } = string.Empty;
    public long? FileSizeBytes { get; set; }
    public bool IncludesXray { get; set; } = true;
    public bool IncludesLandmarkOverlay { get; set; } = true;
    public bool IncludesMeasurements { get; set; } = true;
    public bool IncludesTreatmentPlan { get; set; } = true;
    public DateTime GeneratedAt { get; set; } = DateTime.UtcNow;
    public DateTime? ExpiresAt { get; set; }

    // Navigation
    public AnalysisSession Session { get; set; } = null!;
    public User GeneratedByUser { get; set; } = null!;
}
