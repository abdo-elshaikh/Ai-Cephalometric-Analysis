using CephAnalysis.Application.Features.Dashboard.Queries;
using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.OutputCaching;

namespace CephAnalysis.API.Controllers;

[ApiController]
[Route("api/dashboard")]
[Authorize]
public class DashboardController : ControllerBase
{
    private readonly IMediator _mediator;

    public DashboardController(IMediator mediator) => _mediator = mediator;

    private string CurrentUserId => HttpContext.Items["UserId"]?.ToString() ?? string.Empty;

    /// <summary>
    /// Get real-time statistics for the clinical dashboard.
    /// Cached for 30 seconds per authenticated user to reduce DB load
    /// while keeping data fresh enough for a clinical context.
    /// </summary>
    [HttpGet("stats")]
    [OutputCache(PolicyName = "stats-30s")]
    public async Task<IActionResult> GetStats(CancellationToken ct)
    {
        var result = await _mediator.Send(new GetDashboardStatsQuery(CurrentUserId), ct);
        return result.IsSuccess
            ? Ok(result.Data)
            : StatusCode(result.StatusCode, new { error = result.Error });
    }
}
