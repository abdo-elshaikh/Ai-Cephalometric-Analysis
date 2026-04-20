using CephAnalysis.Domain.Enums;

namespace CephAnalysis.Domain.Entities;

public class Diagnosis
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid SessionId { get; set; }
    public SkeletalClass SkeletalClass { get; set; }
    public VerticalPattern VerticalPattern { get; set; }
    public JawPosition MaxillaryPosition { get; set; }
    public JawPosition MandibularPosition { get; set; }
    public IncisorInclination UpperIncisorInclination { get; set; }
    public IncisorInclination LowerIncisorInclination { get; set; }
    public decimal? OverjetMm { get; set; }
    public OverjetStatus? OverjetClassification { get; set; }
    public decimal? OverbitesMm { get; set; }
    public OverbiteStatus? OverbiteClassification { get; set; }
    public SoftTissueProfile SoftTissueProfile { get; set; }
    public IEnumerable<string> Warnings { get; set; } = [];
    public CrowdingSeverity? CrowdingSeverity { get; set; }
    public decimal? ConfidenceScore { get; set; }
    public bool SkeletalBorderline { get; set; }
    public Dictionary<string, double>? SkeletalDifferential { get; set; }
    public decimal AnbUsed { get; set; }
    public bool AnbRotationCorrected { get; set; }
    public string? OdiNote { get; set; }
    public string? GrowthTendency { get; set; }
    public BoltonResult? BoltonResult { get; set; }
    public string? SummaryText { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    // Navigation
    public AnalysisSession Session { get; set; } = null!;
    public ICollection<TreatmentPlan> TreatmentPlans { get; set; } = [];
}
