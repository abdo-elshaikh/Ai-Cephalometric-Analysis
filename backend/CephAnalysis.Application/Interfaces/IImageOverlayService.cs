using CephAnalysis.Domain.Entities;

namespace CephAnalysis.Application.Interfaces;

public interface IImageOverlayService
{
    /// <summary>
    /// Generates an image with landmarks and clinical tracings overlaid on the base X-ray.
    /// </summary>
    /// <param name="baseImageStream">The original X-ray image stream.</param>
    /// <param name="session">The analysis session containing landmarks and measurements.</param>
    /// <param name="ct">Cancellation token.</param>
    /// <returns>A stream of the processed image (PNG/JPG).</returns>
    Task<Stream> GenerateOverlaidImageAsync(Stream baseImageStream, AnalysisSession session, CancellationToken ct);
}
