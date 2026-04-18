using CephAnalysis.Application.Features.Images.Commands;
using CephAnalysis.Application.Features.Images.DTOs;
using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;

namespace CephAnalysis.API.Controllers;

[ApiController]
[Route("api/images")]
[Authorize]
public class ImageController : ControllerBase
{
    private readonly IMediator _mediator;

    public ImageController(IMediator mediator) => _mediator = mediator;

    private string CurrentUserId => HttpContext.Items["UserId"]?.ToString() ?? string.Empty;

    /// <summary>Upload a new X-Ray image for a study</summary>
    [HttpPost("study/{studyId:guid}")]
    [Consumes("multipart/form-data")]
    [RequestSizeLimit(104857600)] // 100MB limit (Adjust as needed for DICOM)
    public async Task<IActionResult> UploadImage(Guid studyId, IFormFile file, CancellationToken ct)
    {
        if (file == null || file.Length == 0)
            return BadRequest(new { error = "No file uploaded." });

        using var stream = file.OpenReadStream();
        var request = new UploadImageRequest(studyId, stream, file.FileName, file.ContentType);

        var result = await _mediator.Send(new UploadImageCommand(request, CurrentUserId), ct);

        return result.IsSuccess 
            ? StatusCode(201, result.Data)
            : StatusCode(result.StatusCode, new { error = result.Error });
    }

    /// <summary>Get all images for a specific study</summary>
    [HttpGet("study/{studyId:guid}")]
    public async Task<IActionResult> GetStudyImages(Guid studyId, CancellationToken ct)
    {
        var result = await _mediator.Send(new GetStudyImagesQuery(studyId, CurrentUserId), ct);
        return result.IsSuccess 
            ? Ok(result.Data)
            : StatusCode(result.StatusCode, new { error = result.Error });
    }

    /// <summary>Get single image by ID directly</summary>
    [HttpGet("direct/{imageId:guid}")]
    public async Task<IActionResult> GetImageDirect(Guid imageId, CancellationToken ct)
    {
        var result = await _mediator.Send(new GetImageQuery(imageId, CurrentUserId), ct);
        return result.IsSuccess 
            ? Ok(result.Data)
            : StatusCode(result.StatusCode, new { error = result.Error });
    }

    /// <summary>Set pixel spacing calibration for an image based on a known physical distance</summary>
    [HttpPost("{imageId:guid}/calibrate")]
    public async Task<IActionResult> CalibrateImage(Guid imageId, [FromBody] CalibrateImageRequest request, CancellationToken ct)
    {
        var result = await _mediator.Send(new CalibrateImageCommand(imageId, request, CurrentUserId), ct);
        return result.IsSuccess 
            ? Ok(result.Data)
            : StatusCode(result.StatusCode, new { error = result.Error });
    }
}
