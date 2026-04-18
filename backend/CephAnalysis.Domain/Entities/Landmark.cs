namespace CephAnalysis.Domain.Entities;

public class Landmark
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid SessionId { get; set; }
    public string LandmarkCode { get; set; } = string.Empty; // e.g. S, N, A, B, Pog
    public string LandmarkName { get; set; } = string.Empty; // e.g. Sella, Nasion
    public decimal XPx { get; set; }
    public decimal YPx { get; set; }
    public decimal? XMm { get; set; }
    public decimal? YMm { get; set; }
    public decimal? ConfidenceScore { get; set; }         // 0.0 – 1.0
    public decimal? Confidence => ConfidenceScore;        // Alias for code compatibility
    public decimal ExpectedErrorMm { get; set; }          // Spatial uncertainty in mm
    public bool IsAiDetected { get; set; } = true;
    public bool IsManuallyAdjusted { get; set; } = false;
    public string? AdjustmentReason { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    // Navigation
    public AnalysisSession Session { get; set; } = null!;
}
