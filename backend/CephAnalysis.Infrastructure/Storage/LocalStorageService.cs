using CephAnalysis.Application.Interfaces;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using System.Collections.Concurrent;

namespace CephAnalysis.Infrastructure.Storage;

/// <summary>
/// Local filesystem storage adapter for development.
/// Files are organised as:
///   {base}/{patientId:N}/{yyyy-MM}/{category}/{guid}_{fileName}     — when PatientId is provided
///   {base}/{yyyy-MM}/{category}/{guid}_{fileName}                   — anonymous fallback
///
/// In production, swap this implementation for an S3 or Azure Blob adapter
/// that implements the same <see cref="IStorageService"/> contract.
/// </summary>
public sealed class LocalStorageService : IStorageService
{
    private readonly string _basePath;
    private readonly ILogger<LocalStorageService> _logger;

    private const int BufferSize = 81_920;
    private const int MaxParallelDeletes = 8;

    public LocalStorageService(IConfiguration configuration, ILogger<LocalStorageService> logger)
    {
        _logger = logger;
        _basePath = configuration["Storage:LocalBasePath"] ?? "uploads";
        Directory.CreateDirectory(_basePath);
    }

    /// <inheritdoc />
    public async Task<string> UploadFileAsync(
        Stream fileStream,
        string fileName,
        string contentType,
        StorageOptions? options = null,
        CancellationToken ct = default)
    {
        var opts = options ?? new StorageOptions();
        var date = opts.StudyDate ?? DateOnly.FromDateTime(DateTime.UtcNow);
        var category = opts.Category.ToString().ToLowerInvariant();

        var subDir = opts.PatientId.HasValue
            ? Path.Combine(_basePath, opts.PatientId.Value.ToString("N"), date.ToString("yyyy-MM"), category)
            : Path.Combine(_basePath, date.ToString("yyyy-MM"), category);

        Directory.CreateDirectory(subDir);

        var safeFileName = Path.GetFileName(fileName);
        var uniqueName = $"{Guid.NewGuid():N}_{safeFileName}";
        var fullPath = Path.Combine(subDir, uniqueName);

        await using var fs = new FileStream(
            fullPath, FileMode.Create, FileAccess.Write,
            FileShare.None, BufferSize, useAsync: true);

        await fileStream.CopyToAsync(fs, ct);

        _logger.LogDebug(
            "Stored {Category} file for patient {PatientId}: {Path}",
            category, opts.PatientId?.ToString() ?? "anon", fullPath);

        return fullPath.Replace('\\', '/');
    }

    /// <inheritdoc />
    public Task<string> GetSignedUrlAsync(string storageUrl, TimeSpan expiry, CancellationToken ct = default)
    {
        var url = storageUrl.StartsWith('/') ? storageUrl : $"/{storageUrl}";
        return Task.FromResult(url);
    }

    /// <inheritdoc />
    public Task DeleteFileAsync(string storageUrl, CancellationToken ct = default)
    {
        try
        {
            if (File.Exists(storageUrl))
                File.Delete(storageUrl);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to delete file {Url}", storageUrl);
        }

        return Task.CompletedTask;
    }

    /// <inheritdoc />
    public async Task<StorageDeletionSummary> DeleteFilesAsync(
        IEnumerable<string> storageUrls,
        CancellationToken ct = default)
    {
        var urls = storageUrls
            .Where(u => !string.IsNullOrWhiteSpace(u))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();

        if (urls.Count == 0)
            return new StorageDeletionSummary(0, 0, 0, []);

        var failed = new ConcurrentBag<string>();
        var succeeded = 0;

        await Parallel.ForEachAsync(
            urls,
            new ParallelOptions { MaxDegreeOfParallelism = MaxParallelDeletes, CancellationToken = ct },
            (url, _) =>
            {
                try
                {
                    if (File.Exists(url))
                        File.Delete(url);

                    Interlocked.Increment(ref succeeded);
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "Bulk-delete failed for {Url}", url);
                    failed.Add(url);
                }

                return ValueTask.CompletedTask;
            });

        var failedList = failed.ToArray();

        _logger.LogInformation(
            "Bulk delete complete: {Succeeded}/{Total} succeeded, {Failed} failed",
            succeeded, urls.Count, failedList.Length);

        return new StorageDeletionSummary(urls.Count, succeeded, failedList.Length, failedList);
    }

    /// <inheritdoc />
    public async Task<Stream> DownloadFileAsync(string storageUrl, CancellationToken ct = default)
    {
        var buffer = new MemoryStream();
        await using var fs = new FileStream(
            storageUrl, FileMode.Open, FileAccess.Read,
            FileShare.Read, BufferSize, useAsync: true);

        await fs.CopyToAsync(buffer, ct);
        buffer.Position = 0;
        return buffer;
    }
}
