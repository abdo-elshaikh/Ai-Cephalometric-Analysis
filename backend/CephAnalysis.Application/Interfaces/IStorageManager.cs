namespace CephAnalysis.Application.Interfaces;

/// <summary>Result of a cascading asset-deletion operation.</summary>
public sealed record AssetDeletionResult(
    int FilesRequested,
    int FilesDeleted,
    int FilesFailed,
    IReadOnlyList<string> FailedUrls)
{
    public static AssetDeletionResult Empty { get; } = new(0, 0, 0, []);

    public bool HasFailures => FilesFailed > 0;

    public override string ToString() =>
        $"{FilesDeleted}/{FilesRequested} deleted" + (HasFailures ? $", {FilesFailed} failed" : string.Empty);
}

/// <summary>
/// High-level orchestrator for cascading storage clean-up.
/// Queries the database to discover all associated files, then
/// delegates bulk deletion to <see cref="IStorageService"/>.
/// </summary>
public interface IStorageManager
{
    /// <summary>Delete every X-ray, thumbnail, overlay, and report for all studies belonging to a patient.</summary>
    Task<AssetDeletionResult> DeletePatientAssetsAsync(Guid patientId, CancellationToken ct = default);

    /// <summary>Delete all assets associated with a single study (case).</summary>
    Task<AssetDeletionResult> DeleteStudyAssetsAsync(Guid studyId, CancellationToken ct = default);

    /// <summary>Delete the result image and all overlay/report files for a single analysis session.</summary>
    Task<AssetDeletionResult> DeleteSessionAssetsAsync(Guid sessionId, CancellationToken ct = default);
}
