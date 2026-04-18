using CephAnalysis.Application.Features.Reports.Commands;
using CephAnalysis.Domain.Entities;

namespace CephAnalysis.Application.Interfaces;

public interface IReportGenerator
{
    Task<byte[]> GeneratePdfReportAsync(AnalysisSession session, GenerateReportRequest request, CancellationToken ct);
}
