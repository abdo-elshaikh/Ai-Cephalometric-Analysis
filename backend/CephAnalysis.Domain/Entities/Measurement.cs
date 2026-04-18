using CephAnalysis.Domain.Enums;
using System.Text.Json;

namespace CephAnalysis.Domain.Entities;

public class Measurement
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid SessionId { get; set; }
    public AnalysisType? Category { get; set; }
    public string MeasurementCode { get; set; } = string.Empty; // e.g. SNA, SNB, ANB
    public string MeasurementName { get; set; } = string.Empty;
    public MeasurementType MeasurementType { get; set; }
    public decimal Value { get; set; }
    public MeasurementUnit Unit { get; set; }
    public decimal NormalMin { get; set; }
    public decimal NormalMax { get; set; }
    public MeasurementStatus Status { get; set; }
    public decimal? ExpectedError { get; set; }
    public decimal? Deviation { get; set; }
    public decimal NormMean { get; set; }
    public decimal NormSD { get; set; }
    public DeviationSeverity Severity { get; set; }
    public JsonDocument? LandmarkRefs { get; set; } // e.g. ["S","N","A"]
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    // Navigation
    public AnalysisSession Session { get; set; } = null!;
}
