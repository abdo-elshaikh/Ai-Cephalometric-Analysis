using CephAnalysis.Application.Features.Patients.Commands;
using CephAnalysis.Application.Features.Patients.DTOs;
using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Security.Claims;

namespace CephAnalysis.API.Controllers;

[ApiController]
[Route("api/patients")]
[Authorize] // Requires valid JWT
public class PatientController : ControllerBase
{
    private readonly IMediator _mediator;

    public PatientController(IMediator mediator) => _mediator = mediator;

    private string CurrentUserId => HttpContext.Items["UserId"]?.ToString() ?? string.Empty;
    private string CurrentUserRole => User.FindFirst(ClaimTypes.Role)?.Value ?? "Viewer";

    /// <summary>Get paginated list of patients for current doctor</summary>
    [HttpGet]
    public async Task<IActionResult> GetPatients([FromQuery] int page = 1, [FromQuery] int pageSize = 20, [FromQuery] string? search = null, CancellationToken ct = default)
    {
        var result = await _mediator.Send(new GetPatientsQuery(CurrentUserId, page, pageSize, search), ct);
        return result.IsSuccess ? Ok(result.Data) : StatusCode(result.StatusCode, new { error = result.Error });
    }

    /// <summary>Get patient by ID</summary>
    [HttpGet("{id:guid}")]
    public async Task<IActionResult> GetPatient(Guid id, CancellationToken ct)
    {
        var result = await _mediator.Send(new GetPatientQuery(id, CurrentUserId), ct);
        return result.IsSuccess ? Ok(result.Data) : StatusCode(result.StatusCode, new { error = result.Error });
    }

    /// <summary>Register a new patient</summary>
    [HttpPost]
    public async Task<IActionResult> CreatePatient([FromBody] CreatePatientRequest request, CancellationToken ct)
    {
        var result = await _mediator.Send(new CreatePatientCommand(request, CurrentUserId), ct);
        return result.IsSuccess 
            ? CreatedAtAction(nameof(GetPatient), new { id = result.Data!.Id }, result.Data)
            : StatusCode(result.StatusCode, new { error = result.Error });
    }

    /// <summary>Update an existing patient</summary>
    [HttpPut("{id:guid}")]
    public async Task<IActionResult> UpdatePatient(Guid id, [FromBody] UpdatePatientRequest request, CancellationToken ct)
    {
        var result = await _mediator.Send(new UpdatePatientCommand(id, request, CurrentUserId), ct);
        return result.IsSuccess ? Ok(result.Data) : StatusCode(result.StatusCode, new { error = result.Error });
    }

    /// <summary>Hard-delete a patient and all associated data (admin or owner only)</summary>
    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> DeletePatient(Guid id, CancellationToken ct)
    {
        var result = await _mediator.Send(new DeletePatientCommand(id, CurrentUserId, CurrentUserRole), ct);
        return result.IsSuccess ? NoContent() : StatusCode(result.StatusCode, new { error = result.Error });
    }
}
