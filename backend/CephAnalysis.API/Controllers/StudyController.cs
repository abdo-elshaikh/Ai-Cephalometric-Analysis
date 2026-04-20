using CephAnalysis.Application.Features.Studies.Commands;
using CephAnalysis.Application.Features.Studies.DTOs;
using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace CephAnalysis.API.Controllers;

[ApiController]
[Route("api/studies")]
[Authorize]
public class StudyController : ControllerBase
{
    private readonly IMediator _mediator;
    public StudyController(IMediator mediator) => _mediator = mediator;
    
    private string CurrentUserId => HttpContext.Items["UserId"]?.ToString() ?? string.Empty;

    /// <summary>Create a new study for a patient</summary>
    [HttpPost]
    public async Task<IActionResult> CreateStudy([FromBody] CreateStudyRequest request, CancellationToken ct)
    {
        var result = await _mediator.Send(new CreateStudyCommand(request, CurrentUserId), ct);
        return result.IsSuccess 
            ? StatusCode(201, result.Data)
            : StatusCode(result.StatusCode, new { error = result.Error });
    }

    /// <summary>Get all studies for a specific patient</summary>
    [HttpGet("patient/{patientId:guid}")]
    public async Task<IActionResult> GetPatientStudies(Guid patientId, CancellationToken ct)
    {
        var result = await _mediator.Send(new GetPatientStudiesQuery(patientId, CurrentUserId), ct);
        return result.IsSuccess 
            ? Ok(result.Data)
            : StatusCode(result.StatusCode, new { error = result.Error });
    }

    /// <summary>Get a single study by id (doctor must own the study)</summary>
    [HttpGet("{id:guid}")]
    public async Task<IActionResult> GetStudy(Guid id, CancellationToken ct)
    {
        var result = await _mediator.Send(new GetStudyQuery(id, CurrentUserId), ct);
        return result.IsSuccess
            ? Ok(result.Data)
            : StatusCode(result.StatusCode, new { error = result.Error });
    }

    /// <summary>Update study metadata (and optionally workflow status)</summary>
    [HttpPut("{id:guid}")]
    public async Task<IActionResult> UpdateStudy(Guid id, [FromBody] UpdateStudyRequest request, CancellationToken ct)
    {
        var result = await _mediator.Send(new UpdateStudyCommand(id, request, CurrentUserId), ct);
        return result.IsSuccess
            ? Ok(result.Data)
            : StatusCode(result.StatusCode, new { error = result.Error });
    }

    /// <summary>Delete an existing study</summary>
    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> DeleteStudy(Guid id, CancellationToken ct)
    {
        var result = await _mediator.Send(new DeleteStudyCommand(id, CurrentUserId), ct);
        return result.IsSuccess 
            ? NoContent() 
            : StatusCode(result.StatusCode, new { error = result.Error });
    }
}
