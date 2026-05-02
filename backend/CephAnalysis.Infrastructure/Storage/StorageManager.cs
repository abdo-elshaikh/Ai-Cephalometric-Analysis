using CephAnalysis.Application.Interfaces;
using CephAnalysis.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using System.Text.Json;

namespace CephAnalysis.Infrastructure.Storage;

/// <summary>
/// Queries the database to collect every storage URL associated with a patient,
/// study, or session, then delegates parallel bulk deletion to
/// <see cref="IStorageService"/>.
/// </summary>
public sealed class StorageManager : IStorageManager
{
    private readonly IApplicationDbContext _db;
    private readonly IStorageService _storage;
    private readonly ILogger<StorageManager> _logger;

    public StorageManager(
        IApplicationDbContext db,
        IStorageService storage,
        ILogger<StorageManager> logger)
    {
        _db = db;
        _storage = storage;
        _logger = logger;
    }

    // ── Public API ──────────────────────────────────────────────────────────

    public async Task<AssetDeletionResult> DeletePatientAssetsAsync(
        Guid patientId,
        CancellationToken ct = default)
    {
        var images = await _db.XRayImages
            .Include(i => i.AnalysisSessions)
                .ThenInclude(a => a.Reports)
            .Where(i => i.Study.PatientId == patientId)
            .AsNoTracking()
            .ToListAsync(ct);

        var urls = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var img in images)
            CollectImageUrls(img, urls);

        _logger.LogInformation(
            "Preparing to delete {Count} assets for patient {PatientId}",
            urls.Count, patientId);

        return await BulkDeleteAsync(urls, ct);
    }

    public async Task<AssetDeletionResult> DeleteStudyAssetsAsync(
        Guid studyId,
        CancellationToken ct = default)
    {
        var images = await _db.XRayImages
            .Include(i => i.AnalysisSessions)
                .ThenInclude(a => a.Reports)
            .Where(i => i.StudyId == studyId)
            .AsNoTracking()
            .ToListAsync(ct);

        if (images.Count == 0)
        {
            _logger.LogDebug("DeleteStudyAssetsAsync: no images found for study {StudyId}", studyId);
            return AssetDeletionResult.Empty;
        }

        var urls = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var img in images)
            CollectImageUrls(img, urls);

        _logger.LogInformation(
            "Preparing to delete {Count} assets for study {StudyId}",
            urls.Count, studyId);

        return await BulkDeleteAsync(urls, ct);
    }

    public async Task<AssetDeletionResult> DeleteSessionAssetsAsync(
        Guid sessionId,
        CancellationToken ct = default)
    {
        var session = await _db.AnalysisSessions
            .Include(a => a.Reports)
            .Where(a => a.Id == sessionId)
            .AsNoTracking()
            .FirstOrDefaultAsync(ct);

        if (session is null)
        {
            _logger.LogWarning("DeleteSessionAssetsAsync: session {SessionId} not found", sessionId);
            return AssetDeletionResult.Empty;
        }

        var urls = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        CollectSessionUrls(session, urls);

        _logger.LogInformation(
            "Preparing to delete {Count} assets for session {SessionId}",
            urls.Count, sessionId);

        return await BulkDeleteAsync(urls, ct);
    }

    // ── Helpers ─────────────────────────────────────────────────────────────

    private static void CollectImageUrls(XRayImage img, HashSet<string> urls)
    {
        AddIfValid(img.StorageUrl, urls);
        AddIfValid(img.ThumbnailUrl, urls);

        foreach (var session in img.AnalysisSessions)
            CollectSessionUrls(session, urls);
    }

    private static void CollectSessionUrls(AnalysisSession session, HashSet<string> urls)
    {
        AddIfValid(session.ResultImageUrl, urls);

        if (!string.IsNullOrWhiteSpace(session.OverlayImagesJson))
        {
            try
            {
                var overlays = JsonSerializer.Deserialize<List<OverlayEntry>>(
                    session.OverlayImagesJson,
                    new JsonSerializerOptions { PropertyNameCaseInsensitive = true });

                if (overlays is not null)
                {
                    foreach (var o in overlays)
                    {
                        if (!string.IsNullOrWhiteSpace(o.StorageUrl) &&
                            !o.StorageUrl.StartsWith("error:", StringComparison.OrdinalIgnoreCase))
                        {
                            urls.Add(o.StorageUrl);
                        }
                    }
                }
            }
            catch
            {
                // Malformed JSON — skip silently
            }
        }

        foreach (var report in session.Reports)
            AddIfValid(report.StorageUrl, urls);
    }

    private static void AddIfValid(string? url, HashSet<string> urls)
    {
        if (!string.IsNullOrWhiteSpace(url))
            urls.Add(url);
    }

    private async Task<AssetDeletionResult> BulkDeleteAsync(
        HashSet<string> urls,
        CancellationToken ct)
    {
        if (urls.Count == 0)
            return AssetDeletionResult.Empty;

        var summary = await _storage.DeleteFilesAsync(urls, ct);

        if (summary.Failed > 0)
        {
            _logger.LogWarning(
                "Bulk delete: {Failed}/{Total} files could not be deleted. Failed URLs: {Urls}",
                summary.Failed, summary.Requested,
                string.Join("; ", summary.FailedUrls));
        }

        return new AssetDeletionResult(
            summary.Requested,
            summary.Succeeded,
            summary.Failed,
            summary.FailedUrls);
    }

    // ── Private DTO matching OverlayImageEntry JSON shape ───────────────────

    private sealed record OverlayEntry(
        string? Key,
        string? Label,
        string? StorageUrl,
        int Width,
        int Height);
}
