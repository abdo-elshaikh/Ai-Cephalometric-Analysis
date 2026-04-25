using CephAnalysis.Application.Features.Images.DTOs;
using CephAnalysis.Application.Interfaces;
using CephAnalysis.Domain.Entities;
using CephAnalysis.Domain.Enums;
using CephAnalysis.Shared.Common;
using MediatR;
using Microsoft.EntityFrameworkCore;
using System.Text.Json;
using System.Text;

namespace CephAnalysis.Application.Features.Images.Commands;

// ── Upload Image ────────────────────────────────────────────────────────────

public record UploadImageCommand(UploadImageRequest Request, string DoctorId) : IRequest<Result<XRayImageDto>>;

public class UploadImageHandler : IRequestHandler<UploadImageCommand, Result<XRayImageDto>>
{
    private readonly IApplicationDbContext _db;
    private readonly IStorageService _storage;

    public UploadImageHandler(IApplicationDbContext db, IStorageService storage)
    {
        _db = db;
        _storage = storage;
    }

    public async Task<Result<XRayImageDto>> Handle(UploadImageCommand cmd, CancellationToken ct)
    {
        var req = cmd.Request;

        // Verify study exists and belongs to doctor
        var study = await _db.Studies
            .Include(s => s.Patient)
            .FirstOrDefaultAsync(s => s.Id == req.StudyId, ct);

        if (study is null) return Result<XRayImageDto>.NotFound("Study not found.");
        if (study.Patient.DoctorId.ToString() != cmd.DoctorId)
            return Result<XRayImageDto>.Unauthorized("Not authorized to upload to this study.");

        // Security: Magic Byte Validation (Content-Type Verification)
        byte[] header = new byte[132]; // DICOM prefix starts at 128
        await req.FileStream.ReadExactlyAsync(header, 0, 132, ct);
        req.FileStream.Seek(0, SeekOrigin.Begin); // Reset for storage service

        bool isValid = false;

        // DICOM: 'DICM' at offset 128
        if (header.Length >= 132 && Encoding.ASCII.GetString(header, 128, 4) == "DICM")
        {
            isValid = true;
        }
        // JPEG: FF D8 FF
        else if (header[0] == 0xFF && header[1] == 0xD8 && header[2] == 0xFF)
        {
            isValid = true;
        }
        // PNG: 89 50 4E 47 0D 0A 1A 0A
        else if (header[0] == 0x89 && header[1] == 0x50 && header[2] == 0x4E && header[3] == 0x47)
        {
            isValid = true;
        }

        if (!isValid)
        {
            return Result<XRayImageDto>.Failure("File content does not match a supported medical image format (DICOM/JPEG/PNG).", 400);
        }

        // Upload to storage provider
        var storageUrl = await _storage.UploadFileAsync(req.FileStream, req.FileName, req.ContentType, ct);

        var fileFormat = Path.GetExtension(req.FileName).ToLowerInvariant() switch
        {
            ".png" => FileFormat.PNG,
            ".jpg" => FileFormat.JPG,
            ".jpeg" => FileFormat.JPG,
            ".dcm" => FileFormat.DICOM,
            _ => FileFormat.JPG // Default
        };

        var image = new XRayImage
        {
            StudyId       = req.StudyId,
            FileName      = req.FileName,
            FileFormat    = fileFormat,
            StorageUrl    = storageUrl,
            FileSizeBytes = req.FileStream.Length,
            UploadedAt    = DateTime.UtcNow,
            IsCalibrated  = false
        };

        _db.XRayImages.Add(image);
        await _db.SaveChangesAsync(ct);

        return Result<XRayImageDto>.Success(Map(image), 201);
    }

    internal static XRayImageDto Map(XRayImage i) => new(
        i.Id, i.StudyId, i.FileName, i.FileFormat.ToString(), i.StorageUrl, i.ThumbnailUrl,
        i.FileSizeBytes, i.WidthPx, i.HeightPx, i.PixelSpacingMm, i.CalibrationRatio, i.IsCalibrated, i.UploadedAt
    );
}

// ── Get Study Images ────────────────────────────────────────────────────────

public record GetStudyImagesQuery(Guid StudyId, string DoctorId) : IRequest<Result<List<XRayImageDto>>>;

public class GetStudyImagesHandler : IRequestHandler<GetStudyImagesQuery, Result<List<XRayImageDto>>>
{
    private readonly IApplicationDbContext _db;
    private readonly IStorageService _storage;

    public GetStudyImagesHandler(IApplicationDbContext db, IStorageService storage)
    {
        _db = db;
        _storage = storage;
    }

    public async Task<Result<List<XRayImageDto>>> Handle(GetStudyImagesQuery query, CancellationToken ct)
    {
        var study = await _db.Studies
            .Include(s => s.Patient)
            .AsNoTracking()
            .FirstOrDefaultAsync(s => s.Id == query.StudyId, ct);

        if (study is null) return Result<List<XRayImageDto>>.NotFound("Study not found.");
        if (study.Patient.DoctorId.ToString() != query.DoctorId)
            return Result<List<XRayImageDto>>.Unauthorized("Not authorized to view this study's images.");

        var images = await _db.XRayImages
            .AsNoTracking()
            .Where(i => i.StudyId == query.StudyId)
            .ToListAsync(ct);

        var dtos = new List<XRayImageDto>();
        foreach (var img in images)
        {
            var dto = UploadImageHandler.Map(img);
            // Ensure absolute URL
            var resolvedUrl = await _storage.GetSignedUrlAsync(dto.StorageUrl, TimeSpan.FromHours(1), ct);
            dtos.Add(dto with { StorageUrl = resolvedUrl });
        }

        return Result<List<XRayImageDto>>.Success(dtos);
    }
}

// ── Get Image by ID ────────────────────────────────────────────────────────

public record GetImageQuery(Guid ImageId, string DoctorId) : IRequest<Result<XRayImageDto>>;

public class GetImageHandler : IRequestHandler<GetImageQuery, Result<XRayImageDto>>
{
    private readonly IApplicationDbContext _db;
    private readonly IStorageService _storage;

    public GetImageHandler(IApplicationDbContext db, IStorageService storage)
    {
        _db = db;
        _storage = storage;
    }

    public async Task<Result<XRayImageDto>> Handle(GetImageQuery query, CancellationToken ct)
    {
        var image = await _db.XRayImages
            .Include(i => i.Study)
            .ThenInclude(s => s.Patient)
            .AsNoTracking()
            .FirstOrDefaultAsync(i => i.Id == query.ImageId, ct);

        if (image is null) return Result<XRayImageDto>.NotFound("Image not found.");
        if (image.Study.Patient.DoctorId.ToString() != query.DoctorId)
            return Result<XRayImageDto>.Unauthorized("Not authorized to view this image.");

        var dto = UploadImageHandler.Map(image);
        var resolvedUrl = await _storage.GetSignedUrlAsync(dto.StorageUrl, TimeSpan.FromHours(1), ct);
        return Result<XRayImageDto>.Success(dto with { StorageUrl = resolvedUrl });
    }
}

// ── Calibrate Image ─────────────────────────────────────────────────────────

public record CalibrateImageCommand(Guid ImageId, CalibrateImageRequest Request, string DoctorId) : IRequest<Result<XRayImageDto>>;

public class CalibrateImageHandler : IRequestHandler<CalibrateImageCommand, Result<XRayImageDto>>
{
    private readonly IApplicationDbContext _db;
    private readonly IStorageService _storage;

    public CalibrateImageHandler(IApplicationDbContext db, IStorageService storage)
    {
        _db = db;
        _storage = storage;
    }

    public async Task<Result<XRayImageDto>> Handle(CalibrateImageCommand cmd, CancellationToken ct)
    {
        var image = await _db.XRayImages
            .Include(i => i.Study)
            .ThenInclude(s => s.Patient)
            .FirstOrDefaultAsync(i => i.Id == cmd.ImageId, ct);

        if (image is null) return Result<XRayImageDto>.NotFound("Image not found.");
        if (image.Study.Patient.DoctorId.ToString() != cmd.DoctorId)
            return Result<XRayImageDto>.Unauthorized("Not authorized to calibrate this image.");

        var req = cmd.Request;

        // Euclidean distance in pixels
        var dx = req.Point2.X - req.Point1.X;
        var dy = req.Point2.Y - req.Point1.Y;
        var distancePx = Math.Sqrt(dx * dx + dy * dy);

        if (distancePx == 0) return Result<XRayImageDto>.Failure("Points must be distinct.", 400);

        image.CalibrationRatio   = (decimal)(req.KnownDistanceMm / (decimal)distancePx);
        image.PixelSpacingMm     = image.CalibrationRatio; 
        image.CalibrationKnownMm = req.KnownDistanceMm;
        image.CalibrationPoint1  = JsonSerializer.SerializeToDocument(req.Point1);
        image.CalibrationPoint2  = JsonSerializer.SerializeToDocument(req.Point2);
        image.IsCalibrated       = true;

        await _db.SaveChangesAsync(ct);

        var dto = UploadImageHandler.Map(image);
        var resolvedUrl = await _storage.GetSignedUrlAsync(dto.StorageUrl, TimeSpan.FromHours(1), ct);
        return Result<XRayImageDto>.Success(dto with { StorageUrl = resolvedUrl });
    }
}
