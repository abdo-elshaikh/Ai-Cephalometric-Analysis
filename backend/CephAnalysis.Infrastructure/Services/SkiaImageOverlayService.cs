using CephAnalysis.Application.Interfaces;
using CephAnalysis.Domain.Entities;
using CephAnalysis.Domain.Enums;
using SkiaSharp;
using System.Numerics;

namespace CephAnalysis.Infrastructure.Services;

/// <summary>
/// Stateless, clinical-grade cephalometric tracing renderer.
/// It accepts the stored X-ray plus the analysis session and returns an owned PNG stream.
/// </summary>
public sealed class SkiaImageOverlayService : IImageOverlayService
{
    private const int ViewerCanvasWidth = 1000;
    private const int ViewerCanvasHeight = 720;

    private static readonly SKColor ColSkeletal = SKColor.Parse("#8B5CF6");
    private static readonly SKColor ColProfile = SKColor.Parse("#EF4444");
    private static readonly SKColor ColAnatomical = SKColor.Parse("#E5E7EB");
    private static readonly SKColor ColDental = SKColor.Parse("#CBD5E1");
    private static readonly SKColor ColAdvanced = SKColor.Parse("#06B6D4");
    private static readonly SKColor ColNormal = SKColor.Parse("#10B981");
    private static readonly SKColor ColIncreased = SKColor.Parse("#F59E0B");
    private static readonly SKColor ColDecreased = SKColor.Parse("#EF4444");
    private static readonly SKColor ColGrowth = SKColor.Parse("#22C55E");
    private static readonly SKColor ColSna = SKColor.Parse("#10B981");
    private static readonly SKColor ColSnb = SKColor.Parse("#F97316");
    private static readonly SKColor ColAnb = SKColor.Parse("#3B82F6");
    private static readonly SKColor ColFma = SKColor.Parse("#F59E0B");
    private static readonly SKColor ColImpa = SKColor.Parse("#14B8A6");

    private readonly record struct FontScale(float F9, float F11, float F13, float F15, float F18)
    {
        public static FontScale FromHeight(int imageHeight)
        {
            var scale = Math.Clamp(imageHeight / 900f, 0.72f, 2.35f);
            return new FontScale(9f * scale, 11f * scale, 13f * scale, 15f * scale, 18f * scale);
        }
    }

    private readonly record struct CoordinateSpace(float SourceWidth, float SourceHeight, bool Normalized);

    private sealed class OverlayContext
    {
        private OverlayContext(
            AnalysisSession session,
            int imageWidth,
            int imageHeight,
            FontScale fonts,
            Dictionary<string, Landmark> landmarks,
            Dictionary<string, SKPoint> points,
            Dictionary<string, Measurement> measurementsByCode,
            float? pixelSpacingMm)
        {
            Session = session;
            ImageWidth = imageWidth;
            ImageHeight = imageHeight;
            Fonts = fonts;
            Landmarks = landmarks;
            Points = points;
            MeasurementsByCode = measurementsByCode;
            PixelSpacingMm = pixelSpacingMm;
        }

        public AnalysisSession Session { get; }
        public int ImageWidth { get; }
        public int ImageHeight { get; }
        public FontScale Fonts { get; }
        public IReadOnlyDictionary<string, Landmark> Landmarks { get; }
        public IReadOnlyDictionary<string, SKPoint> Points { get; }
        public IReadOnlyDictionary<string, Measurement> MeasurementsByCode { get; }
        public float? PixelSpacingMm { get; }

        public bool TryPoint(string code, out SKPoint point) => Points.TryGetValue(code, out point);

        public static OverlayContext Create(AnalysisSession session, int imageWidth, int imageHeight)
        {
            var landmarks = session.Landmarks
                .Where(l => !string.IsNullOrWhiteSpace(l.LandmarkCode))
                .GroupBy(l => l.LandmarkCode.Trim(), StringComparer.OrdinalIgnoreCase)
                .ToDictionary(
                    g => g.Key,
                    g => g
                        .OrderByDescending(l => l.IsManuallyAdjusted)
                        .ThenByDescending(l => l.ConfidenceScore ?? 0m)
                        .First(),
                    StringComparer.OrdinalIgnoreCase);

            var coordinateSpace = ResolveCoordinateSpace(landmarks.Values, session.XRayImage, imageWidth, imageHeight);
            var points = landmarks
                .Select(kv => new { kv.Key, Point = ResolvePoint(kv.Value, coordinateSpace, imageWidth, imageHeight) })
                .Where(x => x.Point.HasValue)
                .ToDictionary(x => x.Key, x => x.Point!.Value, StringComparer.OrdinalIgnoreCase);

            var measurements = session.Measurements
                .Where(m => !string.IsNullOrWhiteSpace(m.MeasurementCode))
                .GroupBy(m => m.MeasurementCode.Trim(), StringComparer.OrdinalIgnoreCase)
                .ToDictionary(g => g.Key, g => g.First(), StringComparer.OrdinalIgnoreCase);

            var spacing = session.XRayImage?.PixelSpacingMm is > 0m
                ? (float)session.XRayImage.PixelSpacingMm.Value
                : (float?)null;

            return new OverlayContext(
                session,
                imageWidth,
                imageHeight,
                FontScale.FromHeight(imageHeight),
                landmarks,
                points,
                measurements,
                spacing);
        }
    }

    public async Task<Stream> GenerateOverlaidImageAsync(
        Stream baseImageStream,
        AnalysisSession session,
        CancellationToken ct)
    {
        ct.ThrowIfCancellationRequested();

        using var sourceBuffer = new MemoryStream();
        await baseImageStream.CopyToAsync(sourceBuffer, ct);
        var sourceBytes = sourceBuffer.ToArray();

        return await Task.Run<Stream>(() => RenderOverlay(sourceBytes, session, ct), ct);
    }

    private static Stream RenderOverlay(byte[] sourceBytes, AnalysisSession session, CancellationToken ct)
    {
        ct.ThrowIfCancellationRequested();

        using var bitmap = SKBitmap.Decode(sourceBytes);
        if (bitmap is null)
        {
            return new MemoryStream(sourceBytes, writable: false);
        }

        var ctx = OverlayContext.Create(session, bitmap.Width, bitmap.Height);
        using var canvas = new SKCanvas(bitmap);

        DrawReadabilityLayer(canvas, ctx);
        DrawExtendedSkeletalPlanes(canvas, ctx);
        DrawAnatomicalOutlines(canvas, ctx);
        DrawPharyngealAirway(canvas, ctx);
        DrawAnatomicalProfileSpline(canvas, ctx);
        DrawSoftTissueLines(canvas, ctx);
        DrawDentalAxes(canvas, ctx);
        DrawClinicalAppraisals(canvas, ctx);
        DrawAngleArcSectors(canvas, ctx);
        DrawBjorkGrowthVector(canvas, ctx);
        DrawLandmarkPoints(canvas, ctx);
        DrawMeasurementCallouts(canvas, ctx);
        DrawOnImageLegend(canvas, ctx);
        DrawCalibrationRuler(canvas, ctx);
        DrawPatientHeader(canvas, ctx);

        using var image = SKImage.FromBitmap(bitmap);
        using var encoded = image.Encode(SKEncodedImageFormat.Png, 100);
        return new MemoryStream(encoded?.ToArray() ?? sourceBytes, writable: false);
    }

    private static void DrawReadabilityLayer(SKCanvas canvas, OverlayContext ctx)
    {
        using var topShade = new SKPaint
        {
            IsAntialias = true,
            Shader = SKShader.CreateLinearGradient(
                new SKPoint(0, 0),
                new SKPoint(0, ctx.ImageHeight * 0.42f),
                [new SKColor(2, 6, 23, 95), new SKColor(2, 6, 23, 0)],
                null,
                SKShaderTileMode.Clamp),
        };
        canvas.DrawRect(0, 0, ctx.ImageWidth, ctx.ImageHeight * 0.42f, topShade);

        using var bottomShade = new SKPaint
        {
            IsAntialias = true,
            Shader = SKShader.CreateLinearGradient(
                new SKPoint(0, ctx.ImageHeight * 0.68f),
                new SKPoint(0, ctx.ImageHeight),
                [new SKColor(2, 6, 23, 0), new SKColor(2, 6, 23, 110)],
                null,
                SKShaderTileMode.Clamp),
        };
        canvas.DrawRect(0, ctx.ImageHeight * 0.68f, ctx.ImageWidth, ctx.ImageHeight * 0.32f, bottomShade);
    }

    private static void DrawPatientHeader(SKCanvas canvas, OverlayContext ctx)
    {
        var fs = ctx.Fonts;
        var patient = ctx.Session.XRayImage?.Study?.Patient;
        var image = ctx.Session.XRayImage;
        var name = patient?.FullName ?? "Unknown Patient";
        var gender = patient?.Gender.ToString() ?? "U";
        var age = patient is null ? "--Y" : $"{patient.Age}Y";
        var confidence = ctx.Session.Diagnosis?.ConfidenceScore;
        var confidenceText = confidence.HasValue ? $"{NormalizePercent(confidence.Value):P0}" : "pending";

        var pad = Math.Max(12f, ctx.ImageWidth * 0.012f);
        var panelWidth = Math.Min(ctx.ImageWidth * 0.62f, 620f * (fs.F13 / 13f));
        var panelHeight = fs.F18 + fs.F11 + pad * 2.5f;

        using var bg = new SKPaint { IsAntialias = true, Color = new SKColor(2, 6, 23, 215) };
        canvas.DrawRoundRect(new SKRect(0, 0, panelWidth, panelHeight), 0, 0, bg);

        using var accent = new SKPaint { IsAntialias = true, Color = ColAdvanced.WithAlpha(220), StrokeWidth = 3f };
        canvas.DrawLine(0, panelHeight - 1.5f, panelWidth, panelHeight - 1.5f, accent);

        using var titleFont = new SKFont(SKTypeface.Default, fs.F18) { Embolden = true };
        using var textFont = new SKFont(SKTypeface.Default, fs.F11);
        using var titlePaint = new SKPaint { IsAntialias = true, Color = SKColors.White };
        using var softPaint = new SKPaint { IsAntialias = true, Color = new SKColor(190, 230, 245, 225) };

        canvas.DrawText("CephAI tracing overlay", pad, pad + fs.F18, titleFont, titlePaint);
        canvas.DrawText($"{name} ({age}, {gender})  |  {ctx.Session.AnalysisType}  |  AI {confidenceText}", pad, pad + fs.F18 + fs.F11 + 5f, textFont, softPaint);

        var calibration = image?.IsCalibrated == true && ctx.PixelSpacingMm.HasValue
            ? $"Calibrated {ctx.PixelSpacingMm:0.####} mm/px"
            : "Calibration unavailable";
        DrawPillLabel(canvas, panelWidth + pad, pad + fs.F15, calibration, image?.IsCalibrated == true ? ColNormal : ColIncreased, fs.F11);
    }

    private static void DrawExtendedSkeletalPlanes(SKCanvas canvas, OverlayContext ctx)
    {
        ReadOnlySpan<(string C1, string C2, SKColor Col, float Ext, float DashOn, float DashOff, string Label)> planes =
        [
            ("Po",  "Or",  ColSkeletal, 0.24f, 20f, 6f, "FH"),
            ("S",   "N",   ColSkeletal, 0.24f, 0f,  0f, "SN"),
            ("Go",  "Me",  ColSkeletal, 0.20f, 14f, 7f, "MP"),
            ("ANS", "PNS", ColDental,   0.18f, 8f,  4f, "PP"),
            ("N",   "A",   ColAdvanced, 0.16f, 8f,  5f, "NA"),
            ("N",   "B",   ColAdvanced, 0.16f, 8f,  5f, "NB"),
        ];

        foreach (var (c1, c2, color, extension, dashOn, dashOff, label) in planes)
        {
            if (!ctx.TryPoint(c1, out var p1) || !ctx.TryPoint(c2, out var p2))
            {
                continue;
            }

            var extended = ExtendSegment(p1, p2, extension, ctx.ImageWidth, ctx.ImageHeight);

            using var glow = Stroke(color.WithAlpha(60), 4.0f, dashOn, dashOff);
            canvas.DrawLine(extended.Start, extended.End, glow);

            using var paint = Stroke(color.WithAlpha(215), 1.8f, dashOn, dashOff);
            canvas.DrawLine(extended.Start, extended.End, paint);

            DrawShadowedLabel(
                canvas,
                (extended.Start.X + extended.End.X) / 2f + 6f,
                (extended.Start.Y + extended.End.Y) / 2f - 6f,
                label,
                color.WithAlpha(230),
                ctx.Fonts.F9);
        }
    }

    private static void DrawAnatomicalOutlines(SKCanvas canvas, OverlayContext ctx)
    {
        using var paint = Stroke(ColAnatomical.WithAlpha(205), 2.0f);
        paint.StrokeJoin = SKStrokeJoin.Round;

        DrawSpline(canvas, ctx, paint, 0.32f, "Ar", "Go", "Me", "Gn", "Pog", "B");
        DrawSpline(canvas, ctx, paint, 0.32f, "Ba", "S", "N");
        DrawPolyline(canvas, ctx, paint, "PNS", "ANS", "A");

        if (ctx.TryPoint("Co", out var co) && ctx.TryPoint("Go", out var go))
        {
            using var ramus = new SKPath();
            ramus.MoveTo(co);
            ramus.QuadTo(new SKPoint((co.X + go.X) / 2f - 4f, (co.Y + go.Y) / 2f), go);
            canvas.DrawPath(ramus, paint);
        }

        if (ctx.TryPoint("B", out var b) &&
            ctx.TryPoint("Pog", out var pog) &&
            ctx.TryPoint("Gn", out var gn) &&
            ctx.TryPoint("Me", out var me))
        {
            using var symphysis = new SKPath();
            symphysis.MoveTo(b);
            symphysis.QuadTo(pog, gn);
            symphysis.LineTo(me);
            symphysis.Close();

            using var fill = new SKPaint { IsAntialias = true, Color = ColAnatomical.WithAlpha(24), Style = SKPaintStyle.Fill };
            canvas.DrawPath(symphysis, fill);
            canvas.DrawPath(symphysis, paint);
        }
    }

    private static void DrawAnatomicalProfileSpline(SKCanvas canvas, OverlayContext ctx)
    {
        var profile = CollectPoints(ctx, "GLA", "SoftN", "Prn", "Sn", "Ls", "StomU", "StomL", "Li", "Sm", "SoftPog", "SoftGn");
        if (profile.Count < 3)
        {
            return;
        }

        using var path = BuildCatmullRom(profile, 0.38f);
        using var glow = Stroke(ColProfile.WithAlpha(55), 5.2f);
        using var paint = Stroke(ColProfile.WithAlpha(230), 2.6f);
        canvas.DrawPath(path, glow);
        canvas.DrawPath(path, paint);
    }

    private static void DrawPharyngealAirway(SKCanvas canvas, OverlayContext ctx)
    {
        if (!ctx.TryPoint("PNS", out var pns) || !ctx.TryPoint("36", out var wall))
        {
            return;
        }

        using var paint = Stroke(ColAdvanced.WithAlpha(175), 2.1f);
        canvas.DrawLine(pns, wall, paint);

        if (ctx.PixelSpacingMm.HasValue)
        {
            var distancePx = Distance(pns, wall);
            var distanceMm = distancePx * ctx.PixelSpacingMm.Value;
            DrawPillLabel(
                canvas,
                (pns.X + wall.X) / 2f + 10f,
                (pns.Y + wall.Y) / 2f,
                $"Airway {distanceMm:0.0} mm",
                ColAdvanced,
                ctx.Fonts.F11);
        }
    }

    private static void DrawSoftTissueLines(SKCanvas canvas, OverlayContext ctx)
    {
        if (ctx.TryPoint("Prn", out var prn) && ctx.TryPoint("SoftPog", out var softPog))
        {
            using var line = Stroke(ColProfile.WithAlpha(175), 1.5f, 9f, 5f);
            canvas.DrawLine(prn, softPog, line);
            DrawShadowedLabel(canvas, prn.X + 9f, prn.Y - 9f, "E-line", ColProfile.WithAlpha(230), ctx.Fonts.F9);
        }

        if (ctx.TryPoint("N", out var n) && ctx.TryPoint("B", out var b))
        {
            using var line = Stroke(ColAdvanced.WithAlpha(160), 1.5f, 9f, 5f);
            var extended = ExtendSegment(n, b, 0.24f, ctx.ImageWidth, ctx.ImageHeight);
            canvas.DrawLine(extended.Start, extended.End, line);
            DrawShadowedLabel(canvas, b.X + 10f, b.Y, "NB", ColAdvanced.WithAlpha(220), ctx.Fonts.F9);
        }
    }

    private static void DrawDentalAxes(SKCanvas canvas, OverlayContext ctx)
    {
        using var axisPaint = Stroke(ColDental.WithAlpha(210), 1.7f);

        if (ctx.TryPoint("UI", out var ui) && ctx.TryPoint("U1_c", out var uic))
        {
            DrawToothSilhouette(canvas, ui, uic, true, axisPaint);
        }

        if (ctx.TryPoint("LI", out var li) && ctx.TryPoint("L1_c", out var lic))
        {
            DrawToothSilhouette(canvas, li, lic, false, axisPaint);
        }

        if (ctx.TryPoint("U6", out var u6))
        {
            DrawMolarBlock(canvas, u6, true, axisPaint);
        }

        if (ctx.TryPoint("L6", out var l6))
        {
            DrawMolarBlock(canvas, l6, false, axisPaint);
        }
    }

    private static void DrawClinicalAppraisals(SKCanvas canvas, OverlayContext ctx)
    {
        DrawWitsGeometry(canvas, ctx);

        if (ctx.TryPoint("N", out var n) &&
            ctx.TryPoint("A", out var a) &&
            ctx.TryPoint("Pog", out var pog))
        {
            using var line = Stroke(ColAdvanced.WithAlpha(125), 1.2f, 8f, 4f);
            canvas.DrawLine(n, a, line);
            canvas.DrawLine(a, pog, line);
        }

        if (ctx.TryPoint("S", out var s) && ctx.TryPoint("Gn", out var gn))
        {
            using var line = Stroke(ColGrowth.WithAlpha(130), 1.3f, 8f, 4f);
            canvas.DrawLine(s, gn, line);
            DrawShadowedLabel(canvas, gn.X + 5f, gn.Y + 15f, "Y-axis", ColGrowth.WithAlpha(210), ctx.Fonts.F9);
        }
    }

    private static void DrawWitsGeometry(SKCanvas canvas, OverlayContext ctx)
    {
        if (!ctx.TryPoint("U6", out var u6) ||
            !ctx.TryPoint("L6", out var l6) ||
            !ctx.TryPoint("UI", out var ui) ||
            !ctx.TryPoint("LI", out var li) ||
            !ctx.TryPoint("A", out var a) ||
            !ctx.TryPoint("B", out var b))
        {
            return;
        }

        var molarMid = new Vector2((u6.X + l6.X) / 2f, (u6.Y + l6.Y) / 2f);
        var incisalMid = new Vector2((ui.X + li.X) / 2f, (ui.Y + li.Y) / 2f);
        if (!TryUnit(incisalMid - molarMid, out var occlusalUnit))
        {
            return;
        }

        using var plane = Stroke(new SKColor(200, 220, 255, 145), 1.2f, 8f, 4f);
        canvas.DrawLine(
            molarMid.X - occlusalUnit.X * 115f,
            molarMid.Y - occlusalUnit.Y * 115f,
            incisalMid.X + occlusalUnit.X * 115f,
            incisalMid.Y + occlusalUnit.Y * 115f,
            plane);

        DrawShadowedLabel(
            canvas,
            molarMid.X - occlusalUnit.X * 130f,
            molarMid.Y - occlusalUnit.Y * 130f,
            "Occ plane",
            plane.Color,
            ctx.Fonts.F9);

        Vector2 Project(SKPoint source)
        {
            var p = new Vector2(source.X, source.Y);
            var projected = molarMid + Vector2.Dot(p - molarMid, occlusalUnit) * occlusalUnit;
            using var drop = Stroke(SKColors.White.WithAlpha(125), 1.0f, 6f, 4f);
            canvas.DrawLine(p.X, p.Y, projected.X, projected.Y, drop);
            return projected;
        }

        var aProjected = Project(a);
        var bProjected = Project(b);

        using var segment = Stroke(ColAnb.WithAlpha(220), 2.2f);
        canvas.DrawLine(aProjected.X, aProjected.Y, bProjected.X, bProjected.Y, segment);
    }

    private static void DrawAngleArcSectors(SKCanvas canvas, OverlayContext ctx)
    {
        DrawSector(canvas, ctx, "S", "N", "A", ColSna, "SNA");
        DrawSector(canvas, ctx, "S", "N", "B", ColSnb, "SNB");
        DrawSector(canvas, ctx, "Or", "Po", "Me", ColFma, "FMA");
    }

    private static void DrawSector(SKCanvas canvas, OverlayContext ctx, string c1, string vertex, string c2, SKColor color, string measurementCode)
    {
        if (!ctx.TryPoint(c1, out var p1) ||
            !ctx.TryPoint(vertex, out var center) ||
            !ctx.TryPoint(c2, out var p2))
        {
            return;
        }

        if (!TryUnit(new Vector2(p1.X - center.X, p1.Y - center.Y), out var v1) ||
            !TryUnit(new Vector2(p2.X - center.X, p2.Y - center.Y), out var v2))
        {
            return;
        }

        var startAngle = MathF.Atan2(v1.Y, v1.X) * 180f / MathF.PI;
        var endAngle = MathF.Atan2(v2.Y, v2.X) * 180f / MathF.PI;
        var sweep = NormalizeSweep(endAngle - startAngle);
        var radius = Math.Clamp(Math.Min(ctx.ImageWidth, ctx.ImageHeight) * 0.038f, 24f, 48f);
        var rect = new SKRect(center.X - radius, center.Y - radius, center.X + radius, center.Y + radius);

        using var arcPath = new SKPath();
        arcPath.MoveTo(center);
        arcPath.ArcTo(rect, startAngle, sweep, false);
        arcPath.Close();

        using var fill = new SKPaint { IsAntialias = true, Color = color.WithAlpha(38), Style = SKPaintStyle.Fill };
        using var stroke = Stroke(color.WithAlpha(200), 1.6f);
        canvas.DrawPath(arcPath, fill);
        canvas.DrawArc(rect, startAngle, sweep, false, stroke);

        if (ctx.MeasurementsByCode.TryGetValue(measurementCode, out var measurement))
        {
            var midRad = (startAngle + sweep / 2f) * MathF.PI / 180f;
            DrawShadowedLabel(
                canvas,
                center.X + radius * 1.55f * MathF.Cos(midRad),
                center.Y + radius * 1.55f * MathF.Sin(midRad),
                $"{measurement.Value:0.0} deg",
                ColorForStatus(measurement.Status, color),
                ctx.Fonts.F11);
        }
    }

    private static void DrawBjorkGrowthVector(SKCanvas canvas, OverlayContext ctx)
    {
        if (!ctx.TryPoint("S", out var s) || !ctx.TryPoint("Go", out var go))
        {
            return;
        }

        if (!TryUnit(new Vector2(go.X - s.X, go.Y - s.Y), out var unit))
        {
            return;
        }

        var jRatio = ctx.MeasurementsByCode.TryGetValue("JRatio", out var ratio)
            ? (float)ratio.Value
            : 63.5f;

        var deviation = jRatio - 63.5f;
        var length = Math.Clamp(54f + MathF.Abs(deviation) * 2.3f, 42f, 92f);
        var origin = new SKPoint((s.X + go.X) / 2f, (s.Y + go.Y) / 2f);
        var end = new SKPoint(origin.X + unit.X * length, origin.Y + unit.Y * length);
        var color = deviation > 4f ? ColGrowth : deviation < -4f ? ColDecreased : ColNormal;

        using var line = Stroke(color.WithAlpha(230), 2.3f);
        canvas.DrawLine(origin, end, line);
        DrawArrowHead(canvas, end, MathF.Atan2(unit.Y, unit.X), color);

        var label = deviation > 4f ? "CCW growth" : deviation < -4f ? "CW growth" : "Neutral growth";
        DrawShadowedLabel(canvas, end.X + 7f, end.Y - 5f, label, color, ctx.Fonts.F9);
    }

    private static void DrawLandmarkPoints(SKCanvas canvas, OverlayContext ctx)
    {
        using var haloPaint = new SKPaint { IsAntialias = true, Style = SKPaintStyle.Fill };
        using var ringPaint = new SKPaint { IsAntialias = true, Style = SKPaintStyle.Stroke, StrokeWidth = Math.Max(1.2f, ctx.Fonts.F9 * 0.13f) };
        using var dotPaint = new SKPaint { IsAntialias = true, Style = SKPaintStyle.Fill };

        foreach (var (code, point) in ctx.Points.OrderBy(p => p.Key, StringComparer.OrdinalIgnoreCase))
        {
            var landmark = ctx.Landmarks[code];
            var confidence = GetLandmarkConfidence(ctx, landmark, code);
            var errorMm = GetLandmarkErrorMm(ctx, landmark, code);
            var color = confidence >= 0.85f ? ColNormal : confidence >= 0.68f ? ColIncreased : ColDecreased;
            var errorPx = ctx.PixelSpacingMm is > 0f
                ? Math.Clamp(errorMm / ctx.PixelSpacingMm.Value, 5f, 42f)
                : Math.Clamp(9f + (1f - confidence) * 18f, 7f, 28f);

            haloPaint.Color = color.WithAlpha(confidence >= 0.80f ? (byte)32 : (byte)68);
            canvas.DrawCircle(point, errorPx * 1.25f, haloPaint);

            ringPaint.Color = color.WithAlpha(210);
            canvas.DrawCircle(point, Math.Clamp(ctx.Fonts.F9 * 0.43f, 3.5f, 9.0f), ringPaint);

            dotPaint.Color = SKColors.White.WithAlpha(235);
            canvas.DrawCircle(point, Math.Clamp(ctx.Fonts.F9 * 0.18f, 1.5f, 4.0f), dotPaint);

            DrawShadowedLabel(canvas, point.X + ctx.Fonts.F9 * 0.56f, point.Y - ctx.Fonts.F9 * 0.44f, code, color, ctx.Fonts.F9);
        }
    }

    private static void DrawMeasurementCallouts(SKCanvas canvas, OverlayContext ctx)
    {
        var rowHeight = ctx.Fonts.F13 + 7f;

        DrawCalloutColumn(canvas, ctx, ctx.ImageWidth * 0.50f, ctx.ImageHeight * 0.11f, rowHeight,
        [
            ("SNA",  "N",  ColSna,  "SNA"),
            ("SNB",  "N",  ColSnb,  "SNB"),
            ("ANB",  "N",  ColAnb,  "ANB"),
            ("IMPA", "Go", ColImpa, "IMPA"),
        ]);

        DrawCalloutColumn(canvas, ctx, ctx.ImageWidth * 0.055f, ctx.ImageHeight * 0.40f, rowHeight,
        [
            ("FMA",    "Go", ColFma,    "FMA"),
            ("JRatio", "Go", ColGrowth, "JRatio"),
        ]);

        DrawCalloutColumn(canvas, ctx, ctx.ImageWidth * 0.78f, ctx.ImageHeight * 0.55f, rowHeight,
        [
            ("Wits",    "A",  ColAdvanced, "Wits"),
            ("H-Angle", "Ls", ColProfile,  "H-angle"),
            ("APDI",    "B",  ColAdvanced, "APDI"),
            ("ODI",     "B",  ColAdvanced, "ODI"),
        ]);

        DrawCompactDentalMeasurements(canvas, ctx);
    }

    private static void DrawCalloutColumn(
        SKCanvas canvas,
        OverlayContext ctx,
        float x,
        float y,
        float rowHeight,
        (string Code, string Anchor, SKColor BaseColor, string ShortLabel)[] items)
    {
        var cy = y;

        foreach (var (code, anchor, baseColor, shortLabel) in items)
        {
            if (!ctx.MeasurementsByCode.TryGetValue(code, out var measurement))
            {
                cy += rowHeight;
                continue;
            }

            var color = ColorForStatus(measurement.Status, baseColor);
            if (ctx.TryPoint(anchor, out var anchorPoint))
            {
                DrawLeaderLine(canvas, x, cy, anchorPoint.X, anchorPoint.Y, color.WithAlpha(100));
            }

            DrawPillLabel(
                canvas,
                x,
                cy,
                $"{shortLabel}: {measurement.Value:0.0}{UnitSuffix(measurement.Unit)}{StatusSuffix(measurement.Status)}",
                color,
                ctx.Fonts.F11);

            cy += rowHeight + 2f;
        }
    }

    private static void DrawCompactDentalMeasurements(SKCanvas canvas, OverlayContext ctx)
    {
        ReadOnlySpan<(string Code, string Anchor, float OffX, float OffY)> compact =
        [
            ("U1-NA-mm",  "A",   12f, -18f),
            ("L1-NB-mm",  "B",   12f,  -6f),
            ("Pog-NB",    "Pog", 12f,   4f),
            ("Wits-mm",   "ANS", 12f,  18f),
        ];

        foreach (var (code, anchor, offsetX, offsetY) in compact)
        {
            if (!ctx.MeasurementsByCode.TryGetValue(code, out var measurement) ||
                !ctx.TryPoint(anchor, out var point))
            {
                continue;
            }

            DrawShadowedLabel(
                canvas,
                point.X + offsetX,
                point.Y + offsetY,
                $"{measurement.Value:0.0}",
                ColorForStatus(measurement.Status, ColAdvanced),
                ctx.Fonts.F11);
        }
    }

    private static void DrawOnImageLegend(SKCanvas canvas, OverlayContext ctx)
    {
        var fs = ctx.Fonts;
        var panelWidth = Math.Clamp(ctx.ImageWidth * 0.42f, 260f, 470f);
        var panelHeight = Math.Clamp(ctx.ImageHeight * 0.23f, 120f, 210f);
        var margin = Math.Max(12f, ctx.ImageWidth * 0.012f);
        var x = margin;
        var y = ctx.ImageHeight - panelHeight - margin;

        using var bg = new SKPaint { IsAntialias = true, Color = new SKColor(2, 6, 23, 210) };
        canvas.DrawRoundRect(new SKRect(x, y, x + panelWidth, y + panelHeight), 9f, 9f, bg);

        using var titleFont = new SKFont(SKTypeface.Default, fs.F13) { Embolden = true };
        using var labelFont = new SKFont(SKTypeface.Default, fs.F9);
        using var titlePaint = new SKPaint { IsAntialias = true, Color = SKColors.White };
        using var labelPaint = new SKPaint { IsAntialias = true, Color = new SKColor(226, 232, 240, 230) };
        using var rulePaint = Stroke(SKColors.White.WithAlpha(42), 0.8f);

        canvas.DrawText("Tracing legend", x + 10f, y + fs.F13 + 7f, titleFont, titlePaint);
        canvas.DrawLine(x + 10f, y + fs.F13 + 14f, x + panelWidth - 10f, y + fs.F13 + 14f, rulePaint);

        ReadOnlySpan<(SKColor Color, float Dash, string Label)> lines =
        [
            (ColAnatomical, 0f, "Anatomical tracing"),
            (ColSkeletal,   0f, "Skeletal planes"),
            (ColProfile,    0f, "Soft tissue"),
            (ColDental,    10f, "Dental axes"),
            (ColAdvanced,   8f, "Analysis lines"),
            (ColGrowth,     0f, "Growth vector"),
        ];

        ReadOnlySpan<(SKColor Color, string Label)> states =
        [
            (ColNormal, "Normal"),
            (ColIncreased, "Increased"),
            (ColDecreased, "Decreased"),
        ];

        var splitX = x + panelWidth * 0.54f;
        var rowTop = y + fs.F13 + 22f;
        var rowHeight = (panelHeight - fs.F13 - 30f) / lines.Length;

        using var linePaint = new SKPaint { IsAntialias = true, StrokeWidth = 1.9f, Style = SKPaintStyle.Stroke, StrokeCap = SKStrokeCap.Round };
        using var dotPaint = new SKPaint { IsAntialias = true, Style = SKPaintStyle.Fill };

        for (var i = 0; i < lines.Length; i++)
        {
            var (color, dash, label) = lines[i];
            var cy = rowTop + i * rowHeight + rowHeight / 2f;
            linePaint.Color = color.WithAlpha(220);
            linePaint.PathEffect = dash > 0 ? SKPathEffect.CreateDash([dash, dash / 2f], 0) : null;
            canvas.DrawLine(x + 10f, cy, x + 42f, cy, linePaint);
            canvas.DrawText(label, x + 50f, cy + fs.F9 * 0.38f, labelFont, labelPaint);
        }

        for (var i = 0; i < states.Length; i++)
        {
            var (color, label) = states[i];
            var cy = rowTop + i * rowHeight + rowHeight / 2f;
            dotPaint.Color = color.WithAlpha(225);
            canvas.DrawCircle(splitX + 10f, cy, 5f, dotPaint);
            canvas.DrawText(label, splitX + 23f, cy + fs.F9 * 0.38f, labelFont, labelPaint);
        }
    }

    private static void DrawCalibrationRuler(SKCanvas canvas, OverlayContext ctx)
    {
        if (ctx.PixelSpacingMm is not > 0f)
        {
            return;
        }

        var rulerMm = 40f;
        var pxPerMm = 1f / ctx.PixelSpacingMm.Value;
        var rulerPx = Math.Min(rulerMm * pxPerMm, ctx.ImageWidth * 0.30f);
        rulerMm = rulerPx * ctx.PixelSpacingMm.Value;

        var x = ctx.ImageWidth - rulerPx - Math.Max(56f, ctx.Fonts.F18 * 3f);
        var y = Math.Max(36f, ctx.Fonts.F18 + 12f);

        using var bg = new SKPaint { IsAntialias = true, Color = new SKColor(2, 6, 23, 190) };
        canvas.DrawRoundRect(new SKRect(x - 8f, y - 19f, x + rulerPx + 66f, y + 30f), 6f, 6f, bg);

        using var linePaint = Stroke(SKColors.White.WithAlpha(242), 2.0f);
        using var tickPaint = Stroke(SKColors.White.WithAlpha(235), 1.0f);
        using var labelFont = new SKFont(SKTypeface.Default, ctx.Fonts.F9) { Embolden = true };
        using var labelPaint = new SKPaint { IsAntialias = true, Color = SKColors.White };

        canvas.DrawLine(x, y, x + rulerPx, y, linePaint);

        var totalMm = Math.Max(1, (int)rulerMm);
        for (var i = 0; i <= totalMm; i++)
        {
            var tickX = x + i * pxPerMm;
            if (tickX > x + rulerPx + 0.5f)
            {
                break;
            }

            var tickHeight = i % 10 == 0 ? 12f : i % 5 == 0 ? 8f : 4f;
            canvas.DrawLine(tickX, y, tickX, y + tickHeight, tickPaint);
        }

        for (var i = 0; i <= totalMm; i += 10)
        {
            var labelX = x + i * pxPerMm;
            if (labelX > x + rulerPx + 0.5f)
            {
                break;
            }

            canvas.DrawText(i.ToString(), labelX - 4f, y + 22f, labelFont, labelPaint);
        }

        canvas.DrawText("mm", x + rulerPx + 7f, y + 5f, labelFont, labelPaint);
    }

    private static CoordinateSpace ResolveCoordinateSpace(IEnumerable<Landmark> landmarks, XRayImage? image, int imageWidth, int imageHeight)
    {
        var rawPoints = landmarks
            .Select(GetRawPoint)
            .Where(p => p.HasValue)
            .Select(p => p!.Value)
            .ToList();

        if (rawPoints.Count == 0)
        {
            return new CoordinateSpace(imageWidth, imageHeight, false);
        }

        var maxX = rawPoints.Max(p => p.X);
        var maxY = rawPoints.Max(p => p.Y);

        if (maxX <= 1.05f && maxY <= 1.05f)
        {
            return new CoordinateSpace(1f, 1f, true);
        }

        if (image?.WidthPx is > 0 && image.HeightPx is > 0 &&
            maxX <= image.WidthPx.Value * 1.08f &&
            maxY <= image.HeightPx.Value * 1.08f)
        {
            return new CoordinateSpace(image.WidthPx.Value, image.HeightPx.Value, false);
        }

        if (maxX <= ViewerCanvasWidth * 1.08f && maxY <= ViewerCanvasHeight * 1.08f)
        {
            return new CoordinateSpace(ViewerCanvasWidth, ViewerCanvasHeight, false);
        }

        return new CoordinateSpace(imageWidth, imageHeight, false);
    }

    private static SKPoint? ResolvePoint(Landmark landmark, CoordinateSpace space, int imageWidth, int imageHeight)
    {
        var raw = GetRawPoint(landmark);
        if (!raw.HasValue)
        {
            return null;
        }

        var x = raw.Value.X;
        var y = raw.Value.Y;

        if (space.Normalized)
        {
            return ClampPoint(new SKPoint(x * imageWidth, y * imageHeight), imageWidth, imageHeight);
        }

        if (space.SourceWidth <= 0f || space.SourceHeight <= 0f)
        {
            return ClampPoint(new SKPoint(x, y), imageWidth, imageHeight);
        }

        return ClampPoint(new SKPoint(x / space.SourceWidth * imageWidth, y / space.SourceHeight * imageHeight), imageWidth, imageHeight);
    }

    private static SKPoint? GetRawPoint(Landmark landmark)
    {
        if (landmark.XPx != 0m || landmark.YPx != 0m)
        {
            return new SKPoint((float)landmark.XPx, (float)landmark.YPx);
        }

        if (landmark.XMm.HasValue && landmark.YMm.HasValue)
        {
            return new SKPoint((float)landmark.XMm.Value, (float)landmark.YMm.Value);
        }

        return null;
    }

    private static SKPoint ClampPoint(SKPoint point, int imageWidth, int imageHeight)
    {
        return new SKPoint(
            Math.Clamp(point.X, 0f, Math.Max(0f, imageWidth - 1f)),
            Math.Clamp(point.Y, 0f, Math.Max(0f, imageHeight - 1f)));
    }

    private static List<SKPoint> CollectPoints(OverlayContext ctx, params string[] codes)
    {
        var points = new List<SKPoint>(codes.Length);
        foreach (var code in codes)
        {
            if (ctx.TryPoint(code, out var point))
            {
                points.Add(point);
            }
        }

        return points;
    }

    private static void DrawPolyline(SKCanvas canvas, OverlayContext ctx, SKPaint paint, params string[] codes)
    {
        var points = CollectPoints(ctx, codes);
        if (points.Count < 2)
        {
            return;
        }

        using var path = new SKPath();
        path.MoveTo(points[0]);
        for (var i = 1; i < points.Count; i++)
        {
            path.LineTo(points[i]);
        }

        canvas.DrawPath(path, paint);
    }

    private static void DrawSpline(SKCanvas canvas, OverlayContext ctx, SKPaint paint, float tension, params string[] codes)
    {
        var points = CollectPoints(ctx, codes);
        if (points.Count < 3)
        {
            if (points.Count >= 2)
            {
                using var path = new SKPath();
                path.MoveTo(points[0]);
                for (var i = 1; i < points.Count; i++)
                {
                    path.LineTo(points[i]);
                }

                canvas.DrawPath(path, paint);
            }

            return;
        }

        using var spline = BuildCatmullRom(points, tension);
        canvas.DrawPath(spline, paint);
    }

    private static SKPath BuildCatmullRom(IReadOnlyList<SKPoint> points, float tension = 0.5f)
    {
        var path = new SKPath();
        if (points.Count == 0)
        {
            return path;
        }

        path.MoveTo(points[0]);
        for (var i = 0; i < points.Count - 1; i++)
        {
            var p0 = points[Math.Max(i - 1, 0)];
            var p1 = points[i];
            var p2 = points[i + 1];
            var p3 = points[Math.Min(i + 2, points.Count - 1)];

            var cp1 = new SKPoint(
                p1.X + (p2.X - p0.X) * tension / 3f,
                p1.Y + (p2.Y - p0.Y) * tension / 3f);
            var cp2 = new SKPoint(
                p2.X - (p3.X - p1.X) * tension / 3f,
                p2.Y - (p3.Y - p1.Y) * tension / 3f);

            path.CubicTo(cp1, cp2, p2);
        }

        return path;
    }

    private static (SKPoint Start, SKPoint End) ExtendSegment(SKPoint start, SKPoint end, float fraction, int imageWidth, int imageHeight)
    {
        var dx = end.X - start.X;
        var dy = end.Y - start.Y;
        var p1 = new SKPoint(start.X - dx * fraction, start.Y - dy * fraction);
        var p2 = new SKPoint(end.X + dx * fraction, end.Y + dy * fraction);
        return (ClampPoint(p1, imageWidth, imageHeight), ClampPoint(p2, imageWidth, imageHeight));
    }

    private static void DrawToothSilhouette(SKCanvas canvas, SKPoint tip, SKPoint root, bool isUpper, SKPaint paint)
    {
        var dx = root.X - tip.X;
        var dy = root.Y - tip.Y;
        var length = MathF.Sqrt(dx * dx + dy * dy);
        if (length < 10f)
        {
            return;
        }

        var ux = dx / length;
        var uy = dy / length;
        var px = -uy;
        var py = ux;
        var crownWidth = length * 0.38f;
        var crownLength = length * 0.42f;
        var rootWidth = length * 0.18f;

        using var path = new SKPath();
        path.MoveTo(tip);
        path.CubicTo(
            tip.X + px * crownWidth,
            tip.Y + py * crownWidth,
            tip.X + ux * crownLength + px * crownWidth,
            tip.Y + uy * crownLength + py * crownWidth,
            tip.X + ux * crownLength,
            tip.Y + uy * crownLength);
        path.CubicTo(
            tip.X + ux * crownLength - px * crownWidth,
            tip.Y + uy * crownLength - py * crownWidth,
            tip.X - px * crownWidth,
            tip.Y - py * crownWidth,
            tip.X,
            tip.Y);
        path.Close();

        var midRoot = crownLength + (length - crownLength) / 2f;
        path.MoveTo(tip.X + ux * crownLength, tip.Y + uy * crownLength);
        path.CubicTo(tip.X + ux * midRoot + px * rootWidth, tip.Y + uy * midRoot + py * rootWidth, root.X, root.Y, root.X, root.Y);
        path.CubicTo(root.X, root.Y, tip.X + ux * midRoot - px * rootWidth, tip.Y + uy * midRoot - py * rootWidth, tip.X + ux * crownLength, tip.Y + uy * crownLength);

        using var fill = new SKPaint { IsAntialias = true, Color = paint.Color.WithAlpha(isUpper ? (byte)35 : (byte)30), Style = SKPaintStyle.Fill };
        canvas.DrawPath(path, fill);
        canvas.DrawPath(path, paint);
    }

    private static void DrawMolarBlock(SKCanvas canvas, SKPoint point, bool isUpper, SKPaint paint)
    {
        var width = 26f;
        var height = 20f;
        var direction = isUpper ? -1f : 1f;

        using var path = new SKPath();
        path.MoveTo(point.X - width / 2f, point.Y);
        path.CubicTo(point.X - width / 4f, point.Y + 4f * direction, point.X + width / 4f, point.Y + 4f * direction, point.X + width / 2f, point.Y);
        path.LineTo(point.X + width / 2f, point.Y + height * direction);
        path.LineTo(point.X - width / 2f, point.Y + height * direction);
        path.Close();
        canvas.DrawPath(path, paint);
    }

    private static void DrawArrowHead(SKCanvas canvas, SKPoint end, float angle, SKColor color)
    {
        const float headLength = 11f;
        const float headAngle = 0.42f;

        using var headPath = new SKPath();
        headPath.MoveTo(end);
        headPath.LineTo(end.X - headLength * MathF.Cos(angle - headAngle), end.Y - headLength * MathF.Sin(angle - headAngle));
        headPath.LineTo(end.X - headLength * MathF.Cos(angle + headAngle), end.Y - headLength * MathF.Sin(angle + headAngle));
        headPath.Close();

        using var fill = new SKPaint { IsAntialias = true, Color = color, Style = SKPaintStyle.Fill };
        canvas.DrawPath(headPath, fill);
    }

    private static SKPaint Stroke(SKColor color, float width, float dashOn = 0f, float dashOff = 0f)
    {
        return new SKPaint
        {
            IsAntialias = true,
            Color = color,
            StrokeWidth = width,
            Style = SKPaintStyle.Stroke,
            StrokeCap = SKStrokeCap.Round,
            StrokeJoin = SKStrokeJoin.Round,
            PathEffect = dashOn > 0f ? SKPathEffect.CreateDash([dashOn, dashOff > 0f ? dashOff : dashOn / 2f], 0) : null,
        };
    }

    private static void DrawPillLabel(SKCanvas canvas, float x, float y, string text, SKColor color, float fontSize)
    {
        using var font = new SKFont(SKTypeface.Default, fontSize) { Embolden = true };
        var textWidth = font.MeasureText(text);
        var padX = Math.Max(5f, fontSize * 0.42f);
        var padY = Math.Max(3f, fontSize * 0.28f);

        using var bg = new SKPaint { IsAntialias = true, Color = new SKColor(2, 6, 23, 205) };
        canvas.DrawRoundRect(new SKRect(x - padX, y - fontSize - padY, x + textWidth + padX, y + padY), 5f, 5f, bg);

        using var stripe = new SKPaint { IsAntialias = true, Color = color.WithAlpha(225), Style = SKPaintStyle.Fill };
        canvas.DrawRoundRect(new SKRect(x - padX, y - fontSize - padY, x - padX + 3f, y + padY), 3f, 3f, stripe);

        using var textPaint = new SKPaint { IsAntialias = true, Color = SKColors.White };
        canvas.DrawText(text, x, y, font, textPaint);
    }

    private static void DrawShadowedLabel(SKCanvas canvas, float x, float y, string text, SKColor color, float fontSize)
    {
        using var font = new SKFont(SKTypeface.Default, fontSize) { Embolden = true };
        using var shadow = new SKPaint { IsAntialias = true, Color = new SKColor(0, 0, 0, 185) };
        using var foreground = new SKPaint { IsAntialias = true, Color = color };
        canvas.DrawText(text, x + 1.2f, y + 1.2f, font, shadow);
        canvas.DrawText(text, x, y, font, foreground);
    }

    private static void DrawLeaderLine(SKCanvas canvas, float labelX, float labelY, float pointX, float pointY, SKColor color)
    {
        using var paint = Stroke(color, 0.9f, 5f, 4f);
        canvas.DrawLine(labelX, labelY, pointX, pointY, paint);
    }

    private static SKColor ColorForStatus(MeasurementStatus status, SKColor baseColor) => status switch
    {
        MeasurementStatus.Increased => ColIncreased,
        MeasurementStatus.Decreased => ColDecreased,
        _ => baseColor,
    };

    private static string UnitSuffix(MeasurementUnit unit) => unit switch
    {
        MeasurementUnit.Degrees => " deg",
        MeasurementUnit.Percent => "%",
        _ => " mm",
    };

    private static string StatusSuffix(MeasurementStatus status) => status switch
    {
        MeasurementStatus.Increased => " high",
        MeasurementStatus.Decreased => " low",
        _ => "",
    };

    private static float GetLandmarkConfidence(OverlayContext ctx, Landmark landmark, string code)
    {
        if (landmark.ConfidenceScore.HasValue)
        {
            return Math.Clamp((float)NormalizePercent(landmark.ConfidenceScore.Value), 0f, 1f);
        }

        if (ctx.Session.LandmarkMeta?.TryGetValue(code, out var meta) == true)
        {
            return Math.Clamp((float)NormalizePercent(meta.Confidence), 0f, 1f);
        }

        return 0.75f;
    }

    private static float GetLandmarkErrorMm(OverlayContext ctx, Landmark landmark, string code)
    {
        if (landmark.ExpectedErrorMm > 0m)
        {
            return (float)landmark.ExpectedErrorMm;
        }

        if (ctx.Session.LandmarkMeta?.TryGetValue(code, out var meta) == true && meta.ExpectedErrorMm > 0m)
        {
            return (float)meta.ExpectedErrorMm;
        }

        return 2.0f;
    }

    private static decimal NormalizePercent(decimal value) => value > 1m ? value / 100m : value;

    private static float NormalizeSweep(float sweep)
    {
        while (sweep > 180f)
        {
            sweep -= 360f;
        }

        while (sweep < -180f)
        {
            sweep += 360f;
        }

        return sweep;
    }

    private static bool TryUnit(Vector2 value, out Vector2 unit)
    {
        if (value.LengthSquared() < 0.0001f)
        {
            unit = default;
            return false;
        }

        unit = Vector2.Normalize(value);
        return float.IsFinite(unit.X) && float.IsFinite(unit.Y);
    }

    private static float Distance(SKPoint a, SKPoint b)
    {
        var dx = a.X - b.X;
        var dy = a.Y - b.Y;
        return MathF.Sqrt(dx * dx + dy * dy);
    }
}
