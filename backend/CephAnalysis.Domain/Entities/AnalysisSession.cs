using CephAnalysis.Domain.Enums;

namespace CephAnalysis.Domain.Entities;

public class AnalysisSession
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid XRayImageId { get; set; }
    public Guid TriggeredBy { get; set; }
    public string ModelVersion { get; set; } = string.Empty;
    public AnalysisType AnalysisType { get; set; }
    public SessionStatus Status { get; set; } = SessionStatus.Draft;
    public string? ErrorMessage { get; set; }
    public string? ResultImageUrl { get; set; }
    /// <summary>JSON-serialized List&lt;OverlayImageEntry&gt; — the 5 AI overlay image URLs.</summary>
    public string? OverlayImagesJson { get; set; }

    public Dictionary<string, LandmarkMeta> LandmarkMeta { get; set; } = [];
    public int? InferenceDurationMs { get; set; }
    public int? TotalDurationMs { get; set; }
    public DateTime QueuedAt { get; set; } = DateTime.UtcNow;
    public DateTime? StartedAt { get; set; }
    public DateTime? CompletedAt { get; set; }

    // Navigation
    public XRayImage XRayImage { get; set; } = null!;
    public User TriggeredByUser { get; set; } = null!;
    public ICollection<Landmark> Landmarks { get; set; } = [];
    public ICollection<Measurement> Measurements { get; set; } = [];
    public Diagnosis? Diagnosis { get; set; }
    public ICollection<Report> Reports { get; set; } = [];
}
