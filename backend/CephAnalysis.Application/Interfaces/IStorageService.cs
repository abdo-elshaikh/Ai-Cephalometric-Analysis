namespace CephAnalysis.Application.Interfaces;

public interface IStorageService
{
    Task<string> UploadFileAsync(Stream fileStream, string fileName, string contentType, CancellationToken ct = default);
    Task<string> GetSignedUrlAsync(string storageUrl, TimeSpan expiry, CancellationToken ct = default);
    Task DeleteFileAsync(string storageUrl, CancellationToken ct = default);
    Task<Stream> DownloadFileAsync(string storageUrl, CancellationToken ct = default);
}
