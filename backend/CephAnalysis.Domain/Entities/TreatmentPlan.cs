using CephAnalysis.Domain.Enums;

namespace CephAnalysis.Domain.Entities;

public class TreatmentPlan
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid DiagnosisId { get; set; }
    public short PlanIndex { get; set; } = 0; // 0=primary, 1,2=alternatives
    public TreatmentType TreatmentType { get; set; }
    public string TreatmentName { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public string? Rationale { get; set; }    // LLM-generated
    public string? Risks { get; set; }
    public short? EstimatedDurationMonths { get; set; }
    public decimal? ConfidenceScore { get; set; }
    public TreatmentSource Source { get; set; } = TreatmentSource.Hybrid;
    public bool IsPrimary { get; set; } = false;
    public string? EvidenceReference { get; set; } // Clinical citation
    public string? EvidenceLevel { get; set; }
    public string? RetentionRecommendation { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    // Navigation
    public Diagnosis Diagnosis { get; set; } = null!;
}
