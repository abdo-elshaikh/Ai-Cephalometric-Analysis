using CephAnalysis.Domain.Enums;

namespace CephAnalysis.Application.Features.Images.DTOs;

public record XRayImageDto(
    Guid Id,
    Guid StudyId,
    string FileName,
    string FileFormat,
    string StorageUrl,
    string? ThumbnailUrl,
    long FileSizeBytes,
    int? WidthPx,
    int? HeightPx,
    decimal? PixelSpacingMm,
    decimal? CalibrationRatio,
    bool IsCalibrated,
    DateTime UploadedAt
);

public record UploadImageRequest(
    Guid StudyId,
    Stream FileStream,
    string FileName,
    string ContentType
);

public record CalibrateImageRequest(
    Point2D Point1,
    Point2D Point2,
    decimal KnownDistanceMm
);

public record Point2D(double X, double Y);
