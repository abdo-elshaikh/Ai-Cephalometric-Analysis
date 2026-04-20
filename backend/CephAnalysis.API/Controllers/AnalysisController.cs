using CephAnalysis.Application.Features.Analysis.Commands;
using CephAnalysis.Domain.Enums;
using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace CephAnalysis.API.Controllers;

[ApiController]
[Route("api/analysis")]
[Authorize]
public class AnalysisController : ControllerBase
{
    private readonly IMediator _mediator;

    public AnalysisController(IMediator mediator) => _mediator = mediator;

    private string CurrentUserId => HttpContext.Items["UserId"]?.ToString() ?? string.Empty;

    /// <summary>Trigger AI Landmark Detection for an image</summary>
    [HttpPost("detect/{imageId:guid}")]
    public async Task<IActionResult> DetectLandmarks(Guid imageId, [FromQuery] AnalysisType type = AnalysisType.Steiner, CancellationToken ct = default)
    {
        var result = await _mediator.Send(new DetectLandmarksCommand(imageId, CurrentUserId, type), ct);
        return result.IsSuccess 
            ? Ok(result.Data)
            : StatusCode(result.StatusCode, new { error = result.Error });
    }

    /// <summary>Get latest analysis session for a given image</summary>
    [HttpGet("latest-session/{imageId:guid}")]
    public async Task<IActionResult> GetLatestSessionForImage(Guid imageId, CancellationToken ct)
    {
        var result = await _mediator.Send(new GetLatestSessionForImageQuery(imageId, CurrentUserId), ct);
        return result.IsSuccess
            ? Ok(result.Data)
            : StatusCode(result.StatusCode, new { error = result.Error });
    }

    /// <summary>Get analysis session with all landmarks</summary>
    [HttpGet("sessions/{sessionId:guid}")]
    public async Task<IActionResult> GetSession(Guid sessionId, CancellationToken ct)
    {
        var result = await _mediator.Send(new GetSessionQuery(sessionId, CurrentUserId), ct);
        return result.IsSuccess 
            ? Ok(result.Data)
            : StatusCode(result.StatusCode, new { error = result.Error });
    }

    /// <summary>Batch update landmark positions for a session</summary>
    [HttpPut("sessions/{sessionId:guid}/landmarks")]
    public async Task<IActionResult> UpdateSessionLandmarks(Guid sessionId, [FromBody] List<LandmarkUpdateDto> landmarks, CancellationToken ct)
    {
        var result = await _mediator.Send(new UpdateSessionLandmarksCommand(sessionId, CurrentUserId, landmarks), ct);
        return result.IsSuccess ? Ok(result.Data) : StatusCode(result.StatusCode, new { error = result.Error });
    }

    /// <summary>Get all landmarks for a session</summary>
    [HttpGet("sessions/{sessionId:guid}/landmarks")]
    public async Task<IActionResult> GetSessionLandmarks(Guid sessionId, CancellationToken ct)
    {
        var result = await _mediator.Send(new GetSessionLandmarksQuery(sessionId, CurrentUserId), ct);
        return result.IsSuccess 
            ? Ok(result.Data)
            : StatusCode(result.StatusCode, new { error = result.Error });
    }

    /// <summary>Manually adjust a landmark position</summary>
    [HttpPut("sessions/{sessionId:guid}/landmarks/{landmarkCode}")]
    public async Task<IActionResult> AdjustLandmark(
        Guid sessionId, string landmarkCode, 
        [FromBody] AdjustLandmarkRequest request, CancellationToken ct)
    {
        var result = await _mediator.Send(
            new AdjustLandmarkCommand(sessionId, landmarkCode, request, CurrentUserId), ct);
        return result.IsSuccess 
            ? Ok(result.Data)
            : StatusCode(result.StatusCode, new { error = result.Error });
    }

    /// <summary>Run measurement calculations for a session's landmarks</summary>
    [HttpPost("sessions/{sessionId:guid}/measurements")]
    public async Task<IActionResult> CalculateMeasurements(Guid sessionId, CancellationToken ct)
    {
        var result = await _mediator.Send(new CalculateMeasurementsCommand(sessionId, CurrentUserId), ct);
        return result.IsSuccess 
            ? Ok(result.Data)
            : StatusCode(result.StatusCode, new { error = result.Error });
    }

    /// <summary>Get measurements for a session</summary>
    [HttpGet("sessions/{sessionId:guid}/measurements")]
    public async Task<IActionResult> GetMeasurements(Guid sessionId, CancellationToken ct)
    {
        var result = await _mediator.Send(new GetMeasurementsQuery(sessionId, CurrentUserId), ct);
        return result.IsSuccess 
            ? Ok(result.Data)
            : StatusCode(result.StatusCode, new { error = result.Error });
    }

    /// <summary>Run diagnosis classification for a session</summary>
    [HttpPost("sessions/{sessionId:guid}/diagnosis")]
    public async Task<IActionResult> ClassifyDiagnosis(Guid sessionId, CancellationToken ct)
    {
        var result = await _mediator.Send(new ClassifyDiagnosisCommand(sessionId, CurrentUserId), ct);
        return result.IsSuccess 
            ? Ok(result.Data)
            : StatusCode(result.StatusCode, new { error = result.Error });
    }

    /// <summary>Get diagnosis for a session</summary>
    [HttpGet("sessions/{sessionId:guid}/diagnosis")]
    public async Task<IActionResult> GetDiagnosis(Guid sessionId, CancellationToken ct)
    {
        var result = await _mediator.Send(new GetDiagnosisQuery(sessionId, CurrentUserId), ct);
        return result.IsSuccess 
            ? Ok(result.Data)
            : StatusCode(result.StatusCode, new { error = result.Error });
    }

    /// <summary>Generate treatment plan suggestions for a session</summary>
    [HttpPost("sessions/{sessionId:guid}/treatment")]
    public async Task<IActionResult> SuggestTreatment(Guid sessionId, CancellationToken ct)
    {
        var result = await _mediator.Send(new SuggestTreatmentCommand(sessionId, CurrentUserId), ct);
        return result.IsSuccess 
            ? Ok(result.Data)
            : StatusCode(result.StatusCode, new { error = result.Error });
    }

    /// <summary>Get treatment plans for a session</summary>
    [HttpGet("sessions/{sessionId:guid}/treatment")]
    public async Task<IActionResult> GetTreatment(Guid sessionId, CancellationToken ct)
    {
        var result = await _mediator.Send(new GetTreatmentQuery(sessionId, CurrentUserId), ct);
        return result.IsSuccess 
            ? Ok(result.Data)
            : StatusCode(result.StatusCode, new { error = result.Error });
    }

    /// <summary>Run the full pipeline: landmarks → measurements → diagnosis → treatment</summary>
    [HttpPost("full-pipeline/{imageId:guid}")]
    public async Task<IActionResult> RunFullPipeline(Guid imageId, [FromQuery] AnalysisType type = AnalysisType.Steiner, CancellationToken ct = default)
    {
        var result = await _mediator.Send(new RunFullPipelineCommand(imageId, CurrentUserId, type), ct);
        return result.IsSuccess 
            ? Ok(result.Data)
            : StatusCode(result.StatusCode, new { error = result.Error });
    }

    /// <summary>List all analysis sessions with advanced filtering</summary>
    [HttpGet("history")]
    public async Task<IActionResult> GetHistory(
        [FromQuery] string? searchTerm,
        [FromQuery] AnalysisType? type,
        [FromQuery] SessionStatus? status,
        [FromQuery] SkeletalClass? skeletalClass,
        [FromQuery] DateTime? startDate,
        [FromQuery] DateTime? endDate,
        CancellationToken ct)
    {
        var result = await _mediator.Send(new GetAnalysisHistoryQuery(
            searchTerm, type, status, skeletalClass, startDate, endDate, CurrentUserId), ct);
        
        return result.IsSuccess ? Ok(result.Data) : StatusCode(result.StatusCode, new { error = result.Error });
    }

    /// <summary>Delete an individual analysis session</summary>
    [HttpDelete("sessions/{sessionId:guid}")]
    public async Task<IActionResult> DeleteSession(Guid sessionId, CancellationToken ct)
    {
        var result = await _mediator.Send(new DeleteAnalysisSessionCommand(sessionId, CurrentUserId), ct);
        return result.IsSuccess 
            ? NoContent() 
            : StatusCode(result.StatusCode, new { error = result.Error });
    }

    /// <summary>Finalize session: Save landmarks and generate all clinical drafts</summary>
    [HttpPost("sessions/{sessionId:guid}/finalize")]
    public async Task<IActionResult> FinalizeSession(Guid sessionId, [FromBody] List<LandmarkUpdateDto> landmarks, CancellationToken ct)
    {
        var result = await _mediator.Send(new FinalizeAnalysisCommand(sessionId, CurrentUserId, landmarks), ct);
        return result.IsSuccess 
            ? Ok(result.Data)
            : StatusCode(result.StatusCode, new { error = result.Error });
    }

    /// <summary>
    /// Generate (or re-generate) the 5 AI clinical overlay images for a session.
    /// Runs synchronously — use after finalization or after landmark adjustments.
    /// </summary>
    [HttpPost("sessions/{sessionId:guid}/overlays")]
    public async Task<IActionResult> GenerateOverlays(
        Guid sessionId,
        [FromQuery] List<string>? outputs,
        CancellationToken ct)
    {
        var result = await _mediator.Send(
            new GenerateOverlaysCommand(sessionId, CurrentUserId, outputs), ct);
        return result.IsSuccess
            ? Ok(result.Data)
            : StatusCode(result.StatusCode, new { error = result.Error });
    }

    /// <summary>Get dynamic clinical norms from the AI service</summary>
    [HttpGet("norms")]
    public async Task<IActionResult> GetAnalysisNorms(CancellationToken ct)
    {
        var result = await _mediator.Send(new GetAnalysisNormsQuery(), ct);
        return result.IsSuccess ? Ok(result.Data) : StatusCode(result.StatusCode, new { error = result.Error });
    }

    /// <summary>Get the stored overlay image URLs for a session.</summary>
    /// Returns an empty array if overlays have not been generated yet.
    /// </summary>
    [HttpGet("sessions/{sessionId:guid}/overlays")]
    public async Task<IActionResult> GetOverlayImages(Guid sessionId, CancellationToken ct)
    {
        var result = await _mediator.Send(new GetOverlayImagesQuery(sessionId, CurrentUserId), ct);
        return result.IsSuccess
            ? Ok(result.Data)
            : StatusCode(result.StatusCode, new { error = result.Error });
    }
}
