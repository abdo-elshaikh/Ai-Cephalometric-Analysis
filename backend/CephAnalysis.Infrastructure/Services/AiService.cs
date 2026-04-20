using CephAnalysis.Application.Interfaces;
using CephAnalysis.Application.Features.Images.DTOs;
using CephAnalysis.Shared.Common;
using System.Net.Http.Headers;
using System.Text.Json;
using System.Text;
using System.Text.Json.Serialization;
using Microsoft.Extensions.Configuration;

namespace CephAnalysis.Infrastructure.Services;

public class AiService : IAiService
{
    private readonly HttpClient _http;
    private readonly string _serviceKey;
    private static readonly JsonSerializerOptions _jsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower,
        PropertyNameCaseInsensitive = true
    };

    public AiService(HttpClient http, IConfiguration configuration)
    {
        _http = http;
        _serviceKey = configuration["AiService:ServiceKey"] ?? "dev-service-key"; 
    }

    public async Task<Result<IEnumerable<LandmarkDto>>> DetectLandmarksAsync(Guid imageId, Stream imageStream, decimal pixelSpacingMm, CancellationToken ct)
    {
        try
        {
            using var ms = new MemoryStream();
            await imageStream.CopyToAsync(ms, ct);
            var base64Image = Convert.ToBase64String(ms.ToArray());

            var requestModel = new LandmarkDetectionRequest(imageId.ToString(), base64Image, (double)pixelSpacingMm);

            var request = new HttpRequestMessage(HttpMethod.Post, "/ai/detect-landmarks")
            {
                Content = new StringContent(JsonSerializer.Serialize(requestModel), Encoding.UTF8, "application/json")
            };
            request.Headers.Add("x-service-key", _serviceKey);

            var response = await _http.SendAsync(request, ct);

            if (!response.IsSuccessStatusCode)
            {
                var errorContent = await response.Content.ReadAsStringAsync(ct);
                return Result<IEnumerable<LandmarkDto>>.Failure($"AI Service Error: {response.StatusCode} - {errorContent}", (int)response.StatusCode);
            }

            var content = await response.Content.ReadAsStringAsync(ct);
            var result = JsonSerializer.Deserialize<LandmarkDetectionResponse>(content, _jsonOptions);

            if (result?.Landmarks == null)
                return Result<IEnumerable<LandmarkDto>>.Failure("Invalid response format from AI service.", 500);

            var dtos = result.Landmarks.Select(kv => new LandmarkDto(
                kv.Key, 
                new Point2D(kv.Value.X, kv.Value.Y), 
                kv.Value.Confidence
            ));

            return Result<IEnumerable<LandmarkDto>>.Success(dtos);
        }
        catch (Exception ex)
        {
            return Result<IEnumerable<LandmarkDto>>.Failure($"Failed to communicate with AI Service: {ex.Message}", 500);
        }
    }

    public async Task<Result<IEnumerable<MeasurementDto>>> CalculateMeasurementsAsync(
        Guid sessionId, Dictionary<string, Point2D> landmarks, decimal pixelSpacingMm, CancellationToken ct)
    {
        try
        {
            var requestModel = new MeasurementCalculationRequest(
                sessionId.ToString(),
                landmarks.ToDictionary(kv => kv.Key, kv => new LandmarkPointRequest(kv.Value.X, kv.Value.Y)),
                (double)pixelSpacingMm
            );

            var request = new HttpRequestMessage(HttpMethod.Post, "/ai/calculate-measurements")
            {
                Content = new StringContent(JsonSerializer.Serialize(requestModel), Encoding.UTF8, "application/json")
            };
            request.Headers.Add("x-service-key", _serviceKey);

            var response = await _http.SendAsync(request, ct);

            if (!response.IsSuccessStatusCode)
            {
                var errorContent = await response.Content.ReadAsStringAsync(ct);
                return Result<IEnumerable<MeasurementDto>>.Failure($"AI Measurement Error: {response.StatusCode} - {errorContent}", (int)response.StatusCode);
            }

            var content = await response.Content.ReadAsStringAsync(ct);
            var result = JsonSerializer.Deserialize<MeasurementResponse>(content, _jsonOptions);

            if (result?.Measurements == null)
                return Result<IEnumerable<MeasurementDto>>.Failure("Invalid response format.", 500);

            var dtos = result.Measurements.Select(m => new MeasurementDto(
                m.Code, m.Name, m.Category, m.MeasurementType, (double)m.Value, m.Unit, (double)m.NormalMin, (double)m.NormalMax, m.Status, (double?)m.Deviation, m.LandmarkRefs
            ));

            return Result<IEnumerable<MeasurementDto>>.Success(dtos);
        }
        catch (Exception ex)
        {
            return Result<IEnumerable<MeasurementDto>>.Failure($"Measurement service error: {ex.Message}", 500);
        }
    }

    public async Task<Result<DiagnosisDto>> ClassifyDiagnosisAsync(
        Guid sessionId, Dictionary<string, double> measurements, CancellationToken ct)
    {
        try
        {
            var requestModel = new DiagnosisClassificationRequest(sessionId.ToString(), measurements);
            var request = new HttpRequestMessage(HttpMethod.Post, "/ai/classify-diagnosis")
            {
                Content = new StringContent(JsonSerializer.Serialize(requestModel), Encoding.UTF8, "application/json")
            };
            request.Headers.Add("x-service-key", _serviceKey);

            var response = await _http.SendAsync(request, ct);
            if (!response.IsSuccessStatusCode) return Result<DiagnosisDto>.Failure($"AI Diagnosis Error: {response.StatusCode}", (int)response.StatusCode);

            var content = await response.Content.ReadAsStringAsync(ct);
            var result = JsonSerializer.Deserialize<DiagnosisResponseModel>(content, _jsonOptions);

            if (result == null) return Result<DiagnosisDto>.Failure("Invalid diagnosis response.", 500);

            return Result<DiagnosisDto>.Success(new DiagnosisDto(
                result.SkeletalClass, result.VerticalPattern, result.MaxillaryPosition, result.MandibularPosition,
                result.UpperIncisorInclination, result.LowerIncisorInclination, result.SoftTissueProfile,
                result.OverjetMm, result.OverjetClassification, result.OverbitesMm, result.OverbiteClassification,
                result.ConfidenceScore, result.Summary, result.Warnings));
        }
        catch (Exception ex) { return Result<DiagnosisDto>.Failure($"Diagnosis error: {ex.Message}", 500); }
    }

    public async Task<Result<IEnumerable<TreatmentDto>>> SuggestTreatmentAsync(
        Guid sessionId, string skeletalClass, string verticalPattern,
        Dictionary<string, double> measurements, double patientAge, CancellationToken ct)
    {
        try
        {
            var requestModel = new TreatmentSuggestionRequest(sessionId.ToString(), skeletalClass, verticalPattern, measurements, patientAge);
            var request = new HttpRequestMessage(HttpMethod.Post, "/ai/suggest-treatment")
            {
                Content = new StringContent(JsonSerializer.Serialize(requestModel), Encoding.UTF8, "application/json")
            };
            request.Headers.Add("x-service-key", _serviceKey);

            var response = await _http.SendAsync(request, ct);
            if (!response.IsSuccessStatusCode) return Result<IEnumerable<TreatmentDto>>.Failure($"AI Treatment Error: {response.StatusCode}", (int)response.StatusCode);

            var content = await response.Content.ReadAsStringAsync(ct);
            var result = JsonSerializer.Deserialize<TreatmentResponseModel>(content, _jsonOptions);

            return Result<IEnumerable<TreatmentDto>>.Success(result?.Treatments ?? new List<TreatmentDto>());
        }
        catch (Exception ex) { return Result<IEnumerable<TreatmentDto>>.Failure($"Treatment error: {ex.Message}", 500); }
    }

    public async Task<Result<AiOverlayResponse>> GenerateOverlaysAsync(
        Guid sessionId,
        Stream imageStream,
        Dictionary<string, Point2D> landmarks,
        IEnumerable<AiOverlayMeasurement> measurements,
        string? patientLabel,
        string? dateLabel,
        decimal? pixelSpacingMm,
        IEnumerable<string>? outputs,
        CancellationToken ct)
    {
        try
        {
            using var ms = new MemoryStream();
            await imageStream.CopyToAsync(ms, ct);
            var base64Image = Convert.ToBase64String(ms.ToArray());

            var payload = new AiOverlayRequestPayload(
                session_id: sessionId.ToString(),
                image_base64: base64Image,
                landmarks: landmarks.ToDictionary(
                    kv => kv.Key,
                    kv => new LandmarkPointRequest(kv.Value.X, kv.Value.Y)),
                measurements: measurements.Select(m => new AiOverlayMeasurementPayload(
                    m.Code, m.Name, m.Value, m.Unit,
                    m.NormalValue, m.StdDeviation, m.Difference,
                    m.GroupName, m.Status)).ToList(),
                patient_label: patientLabel,
                date_label: dateLabel,
                pixel_spacing_mm: pixelSpacingMm.HasValue ? (double?)pixelSpacingMm.Value : null,
                outputs: outputs != null && outputs.Any() 
                    ? outputs.ToList() 
                    : new List<string> { "xray_tracing", "xray_measurements", "wiggle_chart", "tracing_only", "measurement_table" }
            );

            var request = new HttpRequestMessage(HttpMethod.Post, "/ai/generate-overlays")
            {
                Content = new StringContent(
                    JsonSerializer.Serialize(payload, _jsonOptions),
                    Encoding.UTF8, "application/json")
            };
            request.Headers.Add("x-service-key", _serviceKey);

            var response = await _http.SendAsync(request, ct);
            if (!response.IsSuccessStatusCode)
            {
                var err = await response.Content.ReadAsStringAsync(ct);
                return Result<AiOverlayResponse>.Failure(
                    $"AI Overlay Error: {response.StatusCode} - {err}", (int)response.StatusCode);
            }

            var content = await response.Content.ReadAsStringAsync(ct);
            var result  = JsonSerializer.Deserialize<AiOverlayResponsePayload>(content, _jsonOptions);
            if (result?.Images == null)
                return Result<AiOverlayResponse>.Failure("Invalid overlay response format.", 500);

            var domainResult = new AiOverlayResponse(
                result.SessionId ?? sessionId.ToString(),
                result.Images.Select(i => new AiOverlayImageItem(
                    i.Key, i.Label, i.ImageBase64, i.Width, i.Height)).ToList(),
                result.RenderMs);

            return Result<AiOverlayResponse>.Success(domainResult);
        }
        catch (Exception ex)
        {
            return Result<AiOverlayResponse>.Failure($"Overlay service error: {ex.Message}", 500);
        }
    }

    public async Task<Result<object>> GetAnalysisNormsAsync(CancellationToken ct)
    {
        try
        {
            var request = new HttpRequestMessage(HttpMethod.Get, "/ai/analysis-norms");
            request.Headers.Add("x-service-key", _serviceKey);

            var response = await _http.SendAsync(request, ct);
            if (!response.IsSuccessStatusCode)
            {
                var err = await response.Content.ReadAsStringAsync(ct);
                return Result<object>.Failure($"AI Norms Error: {response.StatusCode} - {err}", (int)response.StatusCode);
            }

            var content = await response.Content.ReadAsStringAsync(ct);
            var result = JsonSerializer.Deserialize<object>(content, _jsonOptions);
            return Result<object>.Success(result!);
        }
        catch (Exception ex)
        {
            return Result<object>.Failure($"Norms service error: {ex.Message}", 500);
        }
    }

    // ── Concrete DTOs to avoid Anonymous Type issues ────────────────────────

    private record LandmarkDetectionRequest(string session_id, string image_base64, double pixel_spacing_mm);
    private record MeasurementCalculationRequest(string session_id, Dictionary<string, LandmarkPointRequest> landmarks, double pixel_spacing_mm);
    private record LandmarkPointRequest(double x, double y);
    private record DiagnosisClassificationRequest(string session_id, Dictionary<string, double> measurements);
    private record TreatmentSuggestionRequest(string session_id, string skeletal_class, string vertical_pattern, Dictionary<string, double> measurements, double patient_age);

    private class LandmarkDetectionResponse
    {
        [JsonPropertyName("landmarks")]
        public Dictionary<string, LandmarkResponsePoint> Landmarks { get; set; } = new();
    }

    private class LandmarkResponsePoint { public double X { get; set; } public double Y { get; set; } public double Confidence { get; set; } }

    private class MeasurementResponse { [JsonPropertyName("measurements")] public List<MeasurementDto> Measurements { get; set; } = new(); }

    private class DiagnosisResponseModel
    {
        [JsonPropertyName("skeletal_class")] public string SkeletalClass { get; set; } = "";
        [JsonPropertyName("vertical_pattern")] public string VerticalPattern { get; set; } = "";
        [JsonPropertyName("maxillary_position")] public string MaxillaryPosition { get; set; } = "";
        [JsonPropertyName("mandibular_position")] public string MandibularPosition { get; set; } = "";
        [JsonPropertyName("upper_incisor_inclination")] public string UpperIncisorInclination { get; set; } = "";
        [JsonPropertyName("lower_incisor_inclination")] public string LowerIncisorInclination { get; set; } = "";
        [JsonPropertyName("soft_tissue_profile")] public string SoftTissueProfile { get; set; } = "";
        [JsonPropertyName("overjet_mm")] public double? OverjetMm { get; set; }
        [JsonPropertyName("overjet_classification")] public string? OverjetClassification { get; set; }
        [JsonPropertyName("overbite_mm")] public double? OverbitesMm { get; set; }
        [JsonPropertyName("overbite_classification")] public string? OverbiteClassification { get; set; }
        [JsonPropertyName("confidence_score")] public double ConfidenceScore { get; set; }
        [JsonPropertyName("summary")] public string Summary { get; set; } = "";
        [JsonPropertyName("warnings")] public List<string> Warnings { get; set; } = new();
    }

    private class TreatmentResponseModel { [JsonPropertyName("treatments")] public List<TreatmentDto> Treatments { get; set; } = new(); }

    // ── Overlay payload records ────────────────────────────────────────────────

    private record AiOverlayRequestPayload(
        string session_id,
        string image_base64,
        Dictionary<string, LandmarkPointRequest> landmarks,
        List<AiOverlayMeasurementPayload> measurements,
        string? patient_label,
        string? date_label,
        double? pixel_spacing_mm,
        List<string> outputs
    );

    private record AiOverlayMeasurementPayload(
        string code, string name, double value, string unit,
        double normal_value, double std_deviation, double difference,
        string group_name, string status
    );

    private class AiOverlayResponsePayload
    {
        [JsonPropertyName("session_id")]  public string? SessionId { get; set; }
        [JsonPropertyName("images")]      public List<AiOverlayImagePayload> Images { get; set; } = new();
        [JsonPropertyName("render_ms")]   public int RenderMs { get; set; }
    }

    private class AiOverlayImagePayload
    {
        [JsonPropertyName("key")]          public string Key { get; set; } = "";
        [JsonPropertyName("label")]        public string Label { get; set; } = "";
        [JsonPropertyName("image_base64")] public string ImageBase64 { get; set; } = "";
        [JsonPropertyName("width")]        public int Width { get; set; }
        [JsonPropertyName("height")]       public int Height { get; set; }
    }
}
