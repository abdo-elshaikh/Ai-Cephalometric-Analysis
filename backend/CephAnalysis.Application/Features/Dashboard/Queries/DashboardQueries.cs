using CephAnalysis.Application.Interfaces;
using CephAnalysis.Domain.Enums;
using CephAnalysis.Shared.Common;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace CephAnalysis.Application.Features.Dashboard.Queries;

public record DashboardStatsDto(
    int TotalPatients,
    int ActiveStudies,
    int TotalAnalyses,
    int ReportsGenerated,
    IEnumerable<RecentActivityDto> RecentActivity);

public record RecentActivityDto(
    string Type,
    string Title,
    string Detail,
    DateTime Time);

public record GetDashboardStatsQuery(string DoctorId) : IRequest<Result<DashboardStatsDto>>;

public class GetDashboardStatsHandler : IRequestHandler<GetDashboardStatsQuery, Result<DashboardStatsDto>>
{
    private readonly IApplicationDbContext _db;

    public GetDashboardStatsHandler(IApplicationDbContext db) => _db = db;

    public async Task<Result<DashboardStatsDto>> Handle(GetDashboardStatsQuery q, CancellationToken ct)
    {
        var doctorId = Guid.Parse(q.DoctorId);

        // Simple counts without unnecessary includes
        var totalPatients = await _db.Patients
            .CountAsync(p => p.DoctorId == doctorId, ct);
        
        var activeStudies = await _db.Studies
            .CountAsync(s => s.DoctorId == doctorId && s.Status != StudyStatus.Completed, ct);
        
        var totalAnalyses = await _db.AnalysisSessions
            .CountAsync(s => s.XRayImage.Study.DoctorId == doctorId, ct);
            
        var reportsGenerated = await _db.Reports
            .CountAsync(r => r.Session.XRayImage.Study.DoctorId == doctorId, ct);

        // Fetch recent activity with asNoTracking and specific navigation
        var recentAnalyses = await _db.AnalysisSessions
            .AsNoTracking()
            .Include(s => s.XRayImage)
            .ThenInclude(i => i.Study)
            .ThenInclude(st => st.Patient)
            .Where(s => s.XRayImage.Study.DoctorId == doctorId)
            .OrderByDescending(s => s.QueuedAt)
            .Take(5)
            .ToListAsync(ct);

        var activity = recentAnalyses.Select(s => new RecentActivityDto(
            "Analysis",
            $"{s.AnalysisType} Analysis",
            $"Completed for {s.XRayImage?.Study?.Patient?.FirstName ?? "Unknown"} {s.XRayImage?.Study?.Patient?.LastName ?? "Patient"}",
            s.QueuedAt));

        var dto = new DashboardStatsDto(
            totalPatients,
            activeStudies,
            totalAnalyses,
            reportsGenerated,
            activity);

        return Result<DashboardStatsDto>.Success(dto);
    }
}
