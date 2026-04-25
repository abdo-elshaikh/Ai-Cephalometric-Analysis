using CephAnalysis.Application.Interfaces;
using Microsoft.Extensions.Configuration;

namespace CephAnalysis.Infrastructure.Storage;

/// <summary>
/// Local filesystem storage adapter for development.
/// In production, swap this out for S3StorageService or AzureBlobStorageService.
/// </summary>
public class LocalStorageService : IStorageService
{
    private readonly string _basePath;

    public LocalStorageService(IConfiguration configuration)
    {
        _basePath = configuration["Storage:LocalBasePath"] ?? "uploads";
        Directory.CreateDirectory(_basePath);
    }

    public async Task<string> UploadFileAsync(Stream fileStream, string fileName, string contentType, CancellationToken ct = default)
    {
        var subDir    = Path.Combine(_basePath, DateTime.UtcNow.ToString("yyyy/MM"));
        Directory.CreateDirectory(subDir);
        var uniqueName = $"{Guid.NewGuid():N}_{Path.GetFileName(fileName)}";
        var fullPath   = Path.Combine(subDir, uniqueName);

        await using var fs = new FileStream(fullPath, FileMode.Create, FileAccess.Write);
        await fileStream.CopyToAsync(fs, ct);

        return fullPath.Replace('\\', '/'); // Normalize path separators
    }

    public Task<string> GetSignedUrlAsync(string storageUrl, TimeSpan expiry, CancellationToken ct = default)
    {
        // storageUrl is already like "uploads/2026/04/guid_name.jpg"
        // Ensure it starts with a leading slash for the frontend
        var url = storageUrl.StartsWith("/") ? storageUrl : $"/{storageUrl}";
        return Task.FromResult(url);
    }

    public Task DeleteFileAsync(string storageUrl, CancellationToken ct = default)
    {
        if (File.Exists(storageUrl))
            File.Delete(storageUrl);
        return Task.CompletedTask;
    }

    public async Task<Stream> DownloadFileAsync(string storageUrl, CancellationToken ct = default)
    {
        var stream = new MemoryStream();
        await using var fs = new FileStream(storageUrl, FileMode.Open, FileAccess.Read);
        await fs.CopyToAsync(stream, ct);
        stream.Position = 0;
        return stream;
    }
}
