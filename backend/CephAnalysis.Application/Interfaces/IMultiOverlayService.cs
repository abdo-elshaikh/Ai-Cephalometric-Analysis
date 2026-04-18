using CephAnalysis.Shared.Common;

namespace CephAnalysis.Application.Interfaces;

/// <summary>
/// Orchestrates generating all AI overlay images for a session and persisting
/// their storage URLs back to the database.
/// </summary>
public interface IMultiOverlayService
{
    Task<Result<MultiOverlayResult>> GenerateAndStoreAsync(
        Guid sessionId,
        string doctorId,
        IEnumerable<string>? outputs,
        CancellationToken ct);
}

/// <summary>A single persisted overlay image entry.</summary>
public record OverlayImageEntry(
    string Key,
    string Label,
    string StorageUrl,
    int Width,
    int Height
);

/// <summary>Result returned after overlay generation + storage upload completes.</summary>
public record MultiOverlayResult(
    Guid SessionId,
    List<OverlayImageEntry> Images,
    int RenderMs
);
