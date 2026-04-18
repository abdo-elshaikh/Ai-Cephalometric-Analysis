using CephAnalysis.Domain.Entities;
using Microsoft.EntityFrameworkCore;

namespace CephAnalysis.Application.Interfaces;

/// <summary>
/// Abstraction over the EF Core DbContext — keeps Application layer independent of Infrastructure.
/// </summary>
public interface IApplicationDbContext
{
    DbSet<User> Users { get; }
    DbSet<Patient> Patients { get; }
    DbSet<Study> Studies { get; }
    DbSet<XRayImage> XRayImages { get; }
    DbSet<AnalysisSession> AnalysisSessions { get; }
    DbSet<Landmark> Landmarks { get; }
    DbSet<Measurement> Measurements { get; }
    DbSet<Diagnosis> Diagnoses { get; }
    DbSet<TreatmentPlan> TreatmentPlans { get; }
    DbSet<Report> Reports { get; }
    DbSet<AuditLog> AuditLogs { get; }

    Task<int> SaveChangesAsync(CancellationToken cancellationToken = default);
}
