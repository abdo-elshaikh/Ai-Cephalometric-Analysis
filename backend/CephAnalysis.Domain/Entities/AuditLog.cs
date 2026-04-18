using System;

namespace CephAnalysis.Domain.Entities;

/// <summary>
/// HIPAA requirement: Structured audit log for tracking access to patient clinical records.
/// </summary>
public class AuditLog
{
    public Guid Id { get; set; } = Guid.NewGuid();
    
    // Who
    public string UserId { get; set; } = string.Empty;
    public string UserEmail { get; set; } = string.Empty;
    
    // What
    public string Action { get; set; } = string.Empty; // e.g. "VIEW_PATIENT", "FINALIZE_ANALYSIS", "DOWNLOAD_REPORT"
    public string ResourceType { get; set; } = string.Empty; // e.g. "Patient", "AnalysisSession", "Report"
    public string ResourceId { get; set; } = string.Empty;
    
    // Details
    public string? MetadataJson { get; set; } // Extra context like IP, Browser, or change delta
    public int StatusCode { get; set; } // HTTP outcome
    public string IpAddress { get; set; } = "-";
    
    public DateTime Timestamp { get; set; } = DateTime.UtcNow;
}
