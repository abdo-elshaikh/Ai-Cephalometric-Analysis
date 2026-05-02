namespace CephAnalysis.Application.Interfaces;

/// <summary>Categorises a stored file for organised directory layout.</summary>
public enum StorageCategory
{
    Xray,
    Thumbnail,
    Overlay,
    Report,
    Other,
}

/// <summary>Options that control where and how a file is placed in storage.</summary>
public sealed record StorageOptions(
    StorageCategory Category = StorageCategory.Other,
    Guid? PatientId = null,
    DateOnly? StudyDate = null);

/// <summary>Summary of a bulk-delete operation.</summary>
public sealed record StorageDeletionSummary(
    int Requested,
    int Succeeded,
    int Failed,
    IReadOnlyList<string> FailedUrls);

public interface IStorageService
{
    /// <summary>
    /// Upload a file, optionally placing it in a categorised, date/patient-scoped path.
    /// </summary>
    Task<string> UploadFileAsync(
        Stream fileStream,
        string fileName,
        string contentType,
        StorageOptions? options = null,
        CancellationToken ct = default);

    Task<string> GetSignedUrlAsync(string storageUrl, TimeSpan expiry, CancellationToken ct = default);

    /// <summary>Delete a single file; errors are swallowed.</summary>
    Task DeleteFileAsync(string storageUrl, CancellationToken ct = default);

    /// <summary>
    /// Delete multiple files in parallel.
    /// Individual errors are captured and returned in the summary rather than thrown.
    /// </summary>
    Task<StorageDeletionSummary> DeleteFilesAsync(
        IEnumerable<string> storageUrls,
        CancellationToken ct = default);

    Task<Stream> DownloadFileAsync(string storageUrl, CancellationToken ct = default);
}
