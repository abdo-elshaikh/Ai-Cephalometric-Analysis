using CephAnalysis.Application.Features.Images.DTOs;
using CephAnalysis.Application.Interfaces;
using CephAnalysis.Domain.Enums;
using CephAnalysis.Shared.Common;
using Microsoft.EntityFrameworkCore;
using System.Text.Json;


namespace CephAnalysis.Infrastructure.Services;

/// <summary>
/// Orchestrates the full overlay generation workflow:
///   1. Load session + landmarks + measurements from DB
///   2. Download the original X-ray image from storage
///   3. Call IAiService.GenerateOverlaysAsync → Python AI overlay engine
///   4. For each returned base64 image, upload to storage and collect URL
///   5. Persist URLs as JSON on AnalysisSession.OverlayImagesJson
///   6. Return MultiOverlayResult
/// </summary>
public class AiOverlayService : IMultiOverlayService
{
    private readonly IApplicationDbContext _db;
    private readonly IAiService            _aiService;
    private readonly IStorageService       _storage;

    private static readonly JsonSerializerOptions _jsonOpts = new()
    {
        PropertyNamingPolicy        = JsonNamingPolicy.CamelCase,
        PropertyNameCaseInsensitive = true,
    };

    public AiOverlayService(
        IApplicationDbContext db,
        IAiService            aiService,
        IStorageService       storage)
    {
        _db        = db;
        _aiService = aiService;
        _storage   = storage;
    }

    public async Task<Result<MultiOverlayResult>> GenerateAndStoreAsync(
        Guid sessionId,
        string doctorId,
        IEnumerable<string>? outputs,
        CancellationToken ct)
    {
        // ── 1. Load session ────────────────────────────────────────────────
        var session = await _db.AnalysisSessions
            .Include(s => s.XRayImage)
                .ThenInclude(i => i.Study)
                    .ThenInclude(st => st.Patient)
            .Include(s => s.Landmarks)
            .Include(s => s.Measurements)
            .FirstOrDefaultAsync(s => s.Id == sessionId, ct);

        if (session is null)
            return Result<MultiOverlayResult>.NotFound("Session not found.");

        if (session.XRayImage.Study.Patient.DoctorId.ToString() != doctorId)
            return Result<MultiOverlayResult>.Unauthorized();

        if (!session.Landmarks.Any())
            return Result<MultiOverlayResult>.Failure("No landmarks — run detection first.", 400);

        if (!session.Measurements.Any())
            return Result<MultiOverlayResult>.Failure("No measurements — run measurements first.", 400);

        // ── 2. Build landmark + measurement dictionaries ───────────────────
        var landmarkDict = session.Landmarks.ToDictionary(
            l => l.LandmarkCode,
            l => new Point2D((double)l.XPx, (double)l.YPx));

        var aiMeasurements = session.Measurements.Select(m => new AiOverlayMeasurement(
            Code:         m.MeasurementCode,
            Name:         m.MeasurementName,
            Value:        (double)m.Value,
            Unit:         m.Unit == MeasurementUnit.Millimeters ? "mm" : "°",
            NormalValue:  (double)((m.NormalMin + m.NormalMax) / 2m),
            StdDeviation: (double)((m.NormalMax - m.NormalMin) / 4m),  // approximate 1σ from norm range
            Difference:   m.Deviation.HasValue ? (double)m.Deviation.Value : (double)(m.Value - (m.NormalMin + m.NormalMax) / 2m),
            GroupName:    m.Category?.ToString() ?? "General",
            Status:       m.Status.ToString()
        )).ToList();

        // ── 3. Build patient label ─────────────────────────────────────────
        var patient = session.XRayImage.Study.Patient;
        string patientLabel = "";
        if (patient is not null)
        {
            int age = DateTime.Today.Year - patient.DateOfBirth.Year;
            patientLabel = $"{patient.FullName} ({age}Y, {patient.Gender})";
        }
        string dateLabel = session.CompletedAt?.ToString("d/M/yyyy")
                        ?? session.QueuedAt.ToString("d/M/yyyy");

        // ── 4. Download X-ray image ────────────────────────────────────────
        Stream imageStream;
        try
        {
            imageStream = await _storage.DownloadFileAsync(session.XRayImage.StorageUrl, ct);
        }
        catch (Exception ex)
        {
            return Result<MultiOverlayResult>.Failure($"Storage download error: {ex.Message}", 500);
        }

        // ── 5. Call Python AI overlay engine ──────────────────────────────
        AiOverlayResponse aiResult;
        using (imageStream)
        {
            var overlayResult = await _aiService.GenerateOverlaysAsync(
                sessionId:      session.Id,
                imageStream:    imageStream,
                landmarks:      landmarkDict,
                measurements:   aiMeasurements,
                patientLabel:   patientLabel,
                dateLabel:      dateLabel,
                pixelSpacingMm: session.XRayImage.PixelSpacingMm,
                outputs:        outputs,
                ct:             ct);

            if (!overlayResult.IsSuccess)
                return Result<MultiOverlayResult>.Failure(
                    overlayResult.Error ?? "Overlay generation failed.", overlayResult.StatusCode);

            aiResult = overlayResult.Data!;
        }

        // ── 6. Upload each image to storage ────────────────────────────────
        var entries = new List<OverlayImageEntry>();

        foreach (var img in aiResult.Images)
        {
            try
            {
                byte[] bytes = Convert.FromBase64String(img.ImageBase64);
                await using var ms = new MemoryStream(bytes);

                string path = $"{img.Key}.jpg";
                string url  = await _storage.UploadFileAsync(
                    ms, path, "image/jpeg",
                    new StorageOptions(StorageCategory.Overlay),
                    ct);

                entries.Add(new OverlayImageEntry(img.Key, img.Label, url, img.Width, img.Height));
            }
            catch (Exception ex)
            {
                // Non-fatal: log + skip this image
                entries.Add(new OverlayImageEntry(img.Key, img.Label, $"error:{ex.Message}", 0, 0));
            }
        }

        // ── 7. Persist JSON back to session ───────────────────────────────
        session.OverlayImagesJson = JsonSerializer.Serialize(entries, _jsonOpts);
        await _db.SaveChangesAsync(ct);

        return Result<MultiOverlayResult>.Success(
            new MultiOverlayResult(sessionId, entries, aiResult.RenderMs));
    }
}
