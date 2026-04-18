using CephAnalysis.Application.Features.Reports.Commands;
using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace CephAnalysis.API.Controllers;

[ApiController]
[Route("api/reports")]
[Authorize]
public class ReportController : ControllerBase
{
    private readonly IMediator _mediator;

    public ReportController(IMediator mediator) => _mediator = mediator;

    private string CurrentUserId => HttpContext.Items["UserId"]?.ToString() ?? string.Empty;

    /// <summary>Generate a new report for an analysis session</summary>
    [HttpPost("sessions/{sessionId:guid}")]
    public async Task<IActionResult> GenerateReport(Guid sessionId, [FromBody] GenerateReportRequest request, CancellationToken ct)
    {
        var result = await _mediator.Send(new GenerateReportCommand(sessionId, request, CurrentUserId), ct);
        return result.IsSuccess
            ? CreatedAtAction(nameof(GetReport), new { reportId = result.Data!.Id }, result.Data)
            : StatusCode(result.StatusCode, new { error = result.Error });
    }

    /// <summary>Get a specific report by ID</summary>
    [HttpGet("{reportId:guid}")]
    public async Task<IActionResult> GetReport(Guid reportId, CancellationToken ct)
    {
        var result = await _mediator.Send(new GetReportQuery(reportId, CurrentUserId), ct);
        return result.IsSuccess ? Ok(result.Data) : StatusCode(result.StatusCode, new { error = result.Error });
    }

    /// <summary>List all reports for an analysis session</summary>
    [HttpGet("sessions/{sessionId:guid}")]
    public async Task<IActionResult> GetSessionReports(Guid sessionId, CancellationToken ct)
    {
        var result = await _mediator.Send(new GetSessionReportsQuery(sessionId, CurrentUserId), ct);
        return result.IsSuccess ? Ok(result.Data) : StatusCode(result.StatusCode, new { error = result.Error });
    }

    /// <summary>List all reports for the current doctor</summary>
    [HttpGet]
    public async Task<IActionResult> GetReports(CancellationToken ct)
    {
        var result = await _mediator.Send(new GetAllReportsQuery(CurrentUserId), ct);
        return result.IsSuccess ? Ok(result.Data) : StatusCode(result.StatusCode, new { error = result.Error });
    }
}
