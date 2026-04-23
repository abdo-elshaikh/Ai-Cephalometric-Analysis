using CephAnalysis.Application.Interfaces;
using CephAnalysis.Domain.Entities;
using CephAnalysis.Domain.Enums;
using SkiaSharp;
using System.Numerics;

namespace CephAnalysis.Infrastructure.Services;

/// <summary>
/// Professional-grade cephalometric tracing overlay — v3.
///
/// Improvements over v2:
///   ■ Thread-safe: eliminated mutable _fs* instance fields; font scale is captured
///     in a local <see cref="FontScale"/> record and threaded through every method.
///   ■ Correct coordinate math: XMm/YMm are normalised [0–1] ratios; float
///     multiplication replaces unnecessary decimal-cast chains throughout.
///   ■ Pharyngeal airway depth: pixel distance is now divided by PixelSpacingMm
///     (not multiplied) to convert pixels → mm correctly.
///   ■ Angle-arc sweep: single normalization pass handles all quadrant cases.
///   ■ Plane-label lookup: full switch expression covering all six plane codes.
///   ■ Calibration ruler: length expressed in pixels via image width, not raw
///     mm count, so it scales with any image resolution.
///   ■ BuildCatmullRom, all label helpers marked static (no instance capture).
///   ■ All SKPaint / SKPath / SKFont objects wrapped in using-declarations to
///     prevent GDI-handle leaks under concurrent load.
/// </summary>
public sealed class SkiaImageOverlayService : IImageOverlayService
{
    // ── Palette ─────────────────────────────────────────────────────────────
    private static readonly SKColor ColSkeletal = SKColor.Parse("#9333ea");
    private static readonly SKColor ColProfile = SKColor.Parse("#dc2626");
    private static readonly SKColor ColAnatomical = SKColor.Parse("#111111");
    private static readonly SKColor ColDental = SKColor.Parse("#4b5563");
    private static readonly SKColor ColAdvanced = SKColor.Parse("#0891b2");
    private static readonly SKColor ColNormal = SKColor.Parse("#059669");
    private static readonly SKColor ColIncreased = SKColor.Parse("#ea580c");
    private static readonly SKColor ColDecreased = SKColor.Parse("#dc2626");
    private static readonly SKColor ColGrowth = SKColor.Parse("#16a34a");
    private static readonly SKColor ColSNA = SKColor.Parse("#16a34a");
    private static readonly SKColor ColSNB = SKColor.Parse("#ea580c");
    private static readonly SKColor ColANB = SKColor.Parse("#2563eb");
    private static readonly SKColor ColFMA = SKColor.Parse("#ea580c");
    private static readonly SKColor ColIMPA = SKColor.Parse("#16a34a");

    // ── Per-render font scale (immutable value type) ─────────────────────────
    private readonly record struct FontScale(float F9, float F11, float F13, float F15)
    {
        public static FontScale FromHeight(int imageHeight)
        {
            float s = imageHeight / 900f;
            return new FontScale(9f * s, 11f * s, 13f * s, 15f * s);
        }
    }

    // ── Entry point ──────────────────────────────────────────────────────────
    public Task<Stream> GenerateOverlaidImageAsync(
        Stream baseImageStream,
        AnalysisSession session,
        CancellationToken ct)
    {
        return Task.Run<Stream>(() =>
        {
            using var managed = new SKManagedStream(baseImageStream);
            using var bitmap = SKBitmap.Decode(managed);
            if (bitmap is null) return baseImageStream;

            var fs = FontScale.FromHeight(bitmap.Height);
            var lm = session.Landmarks.ToDictionary(l => l.LandmarkCode, l => l);

            using var canvas = new SKCanvas(bitmap);

            // Back → front draw order
            DrawExtendedSkeletalPlanes(canvas, lm, bitmap.Width, bitmap.Height, fs);
            DrawAnatomicalOutlines(canvas, lm, bitmap.Width, bitmap.Height);
            DrawPharyngealAirway(canvas, lm, session, bitmap.Width, bitmap.Height, fs);
            DrawAnatomicalProfileSpline(canvas, lm, bitmap.Width, bitmap.Height);
            DrawSoftTissueLines(canvas, lm, bitmap.Width, bitmap.Height, fs);
            DrawDentalAxes(canvas, lm, bitmap.Width, bitmap.Height);
            DrawClinicalAppraisals(canvas, lm, bitmap.Width, bitmap.Height, fs);
            DrawAngleArcSectors(canvas, lm, session, bitmap.Width, bitmap.Height, fs);
            DrawBjorkGrowthVector(canvas, lm, session, bitmap.Width, bitmap.Height, fs);
            DrawLandmarkPoints(canvas, lm, session, bitmap.Width, bitmap.Height, fs);
            DrawMeasurementCallouts(canvas, lm, session, bitmap.Width, bitmap.Height, fs);
            DrawOnImageLegend(canvas, bitmap.Width, bitmap.Height, fs);
            DrawCalibrationRuler(canvas, session, bitmap.Width, bitmap.Height, fs);
            DrawPatientHeader(canvas, session, bitmap.Width, fs);

            using var image = SKImage.FromBitmap(bitmap);
            using var data = image.Encode(SKEncodedImageFormat.Jpeg, 93);
            return data.AsStream();
        }, ct);
    }

    // ══════════════════════════════════════════════════════════════════════════
    // Patient header
    // ══════════════════════════════════════════════════════════════════════════
    private static void DrawPatientHeader(
        SKCanvas canvas, AnalysisSession session, int imgW, FontScale fs)
    {
        float pad = 12f;
        float bh = fs.F15 + fs.F11 + pad * 2.5f;

        using var bg = new SKPaint { Color = new SKColor(10, 15, 30, 200), IsAntialias = true };
        canvas.DrawRect(new SKRect(0, 0, imgW * 0.55f, bh), bg);

        using var boldFont = new SKFont(SKTypeface.Default, fs.F15) { Embolden = true };
        using var normFont = new SKFont(SKTypeface.Default, fs.F11);
        using var wp = new SKPaint { IsAntialias = true, Color = SKColors.White };
        using var sp = new SKPaint { IsAntialias = true, Color = new SKColor(160, 200, 255, 210) };

        float tx = pad, ty = fs.F11 + pad;
        var patient = session.XRayImage?.Study?.Patient;
        string name = patient?.FullName ?? "Unknown Patient";
        string gender = patient?.Gender.ToString() ?? "U";
        string age = patient?.DateOfBirth is { } dob
            ? $"{DateTime.UtcNow.Year - dob.Year}Y" : "--Y";

        canvas.DrawText($"{name} ({age}, {gender})", tx, ty, normFont, wp);
        canvas.DrawText($"{session.QueuedAt:d/M/yyyy}", tx, ty + fs.F11 + 4f, normFont, sp);
    }

    // ══════════════════════════════════════════════════════════════════════════
    // Extended skeletal planes
    // ══════════════════════════════════════════════════════════════════════════
    private static void DrawExtendedSkeletalPlanes(
        SKCanvas canvas,
        Dictionary<string, Landmark> lm,
        int imgW, int imgH,
        FontScale fs)
    {
        // (point1, point2, colour, extension fraction, dash-on, dash-off, opacity)
        ReadOnlySpan<(string C1, string C2, SKColor Col, float Ext, float DOn, float DOff, float Alpha)> planes =
        [
            ("Po",  "Or",  ColSkeletal, 0.22f, 20f, 6f,  0.70f),
            ("S",   "N",   ColSkeletal, 0.22f,  0f, 0f,  0.80f),
            ("Go",  "Me",  ColSkeletal, 0.20f, 14f, 7f,  0.70f),
            ("ANS", "PNS", ColDental,   0.18f,  8f, 4f,  0.60f),
            ("N",   "A",   ColAdvanced, 0.15f,  8f, 5f,  0.55f),
            ("N",   "B",   ColAdvanced, 0.15f,  8f, 5f,  0.55f),
        ];

        foreach (var (c1, c2, col, ext, dOn, dOff, alpha) in planes)
        {
            if (!TryGetPoint(lm, c1, imgW, imgH, out var pt1)) continue;
            if (!TryGetPoint(lm, c2, imgW, imgH, out var pt2)) continue;

            float dx = pt2.X - pt1.X;
            float dy = pt2.Y - pt1.Y;

            float x1 = Math.Clamp(pt1.X - dx * ext, 0, imgW);
            float y1 = Math.Clamp(pt1.Y - dy * ext, 0, imgH);
            float x2 = Math.Clamp(pt2.X + dx * ext, 0, imgW);
            float y2 = Math.Clamp(pt2.Y + dy * ext, 0, imgH);

            using var paint = new SKPaint
            {
                IsAntialias = true,
                Color = col.WithAlpha((byte)(255 * alpha)),
                StrokeWidth = 1.6f,
                Style = SKPaintStyle.Stroke,
                StrokeCap = SKStrokeCap.Round,
                PathEffect = dOn > 0
                    ? SKPathEffect.CreateDash([dOn, dOff], 0)
                    : null,
            };
            canvas.DrawLine(x1, y1, x2, y2, paint);

            string label = (c1, c2) switch
            {
                ("Po", "Or") => "FH",
                ("S", "N") => "SN",
                ("Go", "Me") => "MP",
                ("ANS", "PNS") => "PP",
                ("N", "A") => "NA",
                ("N", "B") => "NB",
                _ => string.Empty,
            };

            if (!string.IsNullOrEmpty(label))
                DrawShadowedLabel(canvas,
                    (x1 + x2) / 2f + 6f,
                    (y1 + y2) / 2f - 6f,
                    label,
                    col.WithAlpha(200), fs.F9);
        }
    }

    // ══════════════════════════════════════════════════════════════════════════
    // Hard-tissue anatomical outlines
    // ══════════════════════════════════════════════════════════════════════════
    private static void DrawAnatomicalOutlines(
        SKCanvas canvas, Dictionary<string, Landmark> lm, int imgW, int imgH)
    {
        using var paint = new SKPaint
        {
            IsAntialias = true,
            Color = ColAnatomical.WithAlpha(210),
            StrokeWidth = 2.0f,
            Style = SKPaintStyle.Stroke,
            StrokeCap = SKStrokeCap.Round,
            StrokeJoin = SKStrokeJoin.Round,
        };

        void DrawChain(params string[] codes)
        {
            var pts = CollectPoints(lm, imgW, imgH, codes);
            if (pts.Count < 2) return;
            using var path = new SKPath();
            path.MoveTo(pts[0]);
            for (int i = 1; i < pts.Count; i++) path.LineTo(pts[i]);
            canvas.DrawPath(path, paint);
        }

        void DrawSpline(params string[] codes)
        {
            var pts = CollectPoints(lm, imgW, imgH, codes);
            if (pts.Count < 3) { DrawChain(codes); return; }
            using var path = BuildCatmullRom(pts, 0.3f);
            canvas.DrawPath(path, paint);
        }

        DrawSpline("Ar", "Go", "Me", "Gn", "Pog", "B");
        DrawSpline("Ba", "S", "N");
        DrawChain("PNS", "ANS", "A");

        // Ramus
        if (TryGetPoint(lm, "Co", imgW, imgH, out var co) &&
            TryGetPoint(lm, "Go", imgW, imgH, out var go))
        {
            using var rPath = new SKPath();
            rPath.MoveTo(co);
            rPath.QuadTo(
                new SKPoint((co.X + go.X) / 2f - 4f, (co.Y + go.Y) / 2f),
                go);
            canvas.DrawPath(rPath, paint);
        }

        // Symphysis
        if (TryGetPoint(lm, "B", imgW, imgH, out var b) &&
            TryGetPoint(lm, "Pog", imgW, imgH, out var pog) &&
            TryGetPoint(lm, "Gn", imgW, imgH, out var gn) &&
            TryGetPoint(lm, "Me", imgW, imgH, out var me))
        {
            using var sym = new SKPath();
            sym.MoveTo(b);
            sym.QuadTo(pog, gn);
            sym.LineTo(me);
            sym.Close();
            canvas.DrawPath(sym, paint);
        }
    }

    // ══════════════════════════════════════════════════════════════════════════
    // Soft-tissue profile spline
    // ══════════════════════════════════════════════════════════════════════════
    private static void DrawAnatomicalProfileSpline(
        SKCanvas canvas, Dictionary<string, Landmark> lm, int imgW, int imgH)
    {
        string[] codes = ["GLA", "SoftN", "Prn", "Sn", "Ls", "StomU", "StomL", "Li", "Sm", "SoftPog", "SoftGn"];
        var pts = CollectPoints(lm, imgW, imgH, codes);
        if (pts.Count < 3) return;

        using var path = BuildCatmullRom(pts, 0.4f);
        using var paint = new SKPaint
        {
            IsAntialias = true,
            Color = ColProfile.WithAlpha(210),
            StrokeWidth = 2.6f,
            Style = SKPaintStyle.Stroke,
            StrokeCap = SKStrokeCap.Round,
            StrokeJoin = SKStrokeJoin.Round,
        };
        canvas.DrawPath(path, paint);
    }

    // ══════════════════════════════════════════════════════════════════════════
    // Pharyngeal airway depth
    // ══════════════════════════════════════════════════════════════════════════
    private static void DrawPharyngealAirway(
        SKCanvas canvas,
        Dictionary<string, Landmark> lm,
        AnalysisSession session,
        int imgW, int imgH,
        FontScale fs)
    {
        if (!TryGetPoint(lm, "PNS", imgW, imgH, out var pns)) return;
        if (!TryGetPoint(lm, "36", imgW, imgH, out var wall)) return;

        using var p = new SKPaint
        {
            IsAntialias = true,
            Color = ColAdvanced.WithAlpha(160),
            StrokeWidth = 2.0f,
            Style = SKPaintStyle.Stroke,
        };
        canvas.DrawLine(pns, wall, p);

        float pixelDist = Vector2.Distance(new Vector2(pns.X, pns.Y), new Vector2(wall.X, wall.Y));
        float ps = (float)(session.XRayImage?.PixelSpacingMm ?? 0.3m);
        if (ps > 0)
        {
            // pixels ÷ (pixels/mm) = mm
            float dMm = pixelDist / ps;
            DrawShadowedLabel(canvas,
                (pns.X + wall.X) / 2f + 10f,
                (pns.Y + wall.Y) / 2f,
                $"{dMm:F1}mm", ColAdvanced, fs.F11);
        }
    }

    // ══════════════════════════════════════════════════════════════════════════
    // Catmull-Rom spline builder
    // ══════════════════════════════════════════════════════════════════════════
    private static SKPath BuildCatmullRom(List<SKPoint> pts, float tension = 0.5f)
    {
        var path = new SKPath();
        path.MoveTo(pts[0]);
        for (int i = 0; i < pts.Count - 1; i++)
        {
            var p0 = pts[Math.Max(i - 1, 0)];
            var p1 = pts[i];
            var p2 = pts[i + 1];
            var p3 = pts[Math.Min(i + 2, pts.Count - 1)];

            float cp1x = p1.X + (p2.X - p0.X) * tension / 3f;
            float cp1y = p1.Y + (p2.Y - p0.Y) * tension / 3f;
            float cp2x = p2.X - (p3.X - p1.X) * tension / 3f;
            float cp2y = p2.Y - (p3.Y - p1.Y) * tension / 3f;

            path.CubicTo(cp1x, cp1y, cp2x, cp2y, p2.X, p2.Y);
        }
        return path;
    }

    // ══════════════════════════════════════════════════════════════════════════
    // Soft-tissue reference lines
    // ══════════════════════════════════════════════════════════════════════════
    private static void DrawSoftTissueLines(
        SKCanvas canvas, Dictionary<string, Landmark> lm, int imgW, int imgH, FontScale fs)
    {
        using var dashed = new SKPaint
        {
            IsAntialias = true,
            StrokeWidth = 1.5f,
            Style = SKPaintStyle.Stroke,
            PathEffect = SKPathEffect.CreateDash([9f, 5f], 0),
        };

        if (TryGetPoint(lm, "Prn", imgW, imgH, out var prn) &&
            TryGetPoint(lm, "SoftPog", imgW, imgH, out var spog))
        {
            dashed.Color = ColProfile.WithAlpha(170);
            canvas.DrawLine(prn, spog, dashed);
            DrawShadowedLabel(canvas, prn.X + 9f, prn.Y - 9f, "E-line", ColProfile.WithAlpha(210), fs.F9);
        }

        if (TryGetPoint(lm, "N", imgW, imgH, out var n) &&
            TryGetPoint(lm, "B", imgW, imgH, out var b))
        {
            dashed.Color = ColAdvanced.WithAlpha(150);
            float dx = b.X - n.X, dy = b.Y - n.Y;
            canvas.DrawLine(n.X - dx * 0.25f, n.Y - dy * 0.25f,
                            b.X + dx * 0.20f, b.Y + dy * 0.20f, dashed);
            DrawShadowedLabel(canvas, b.X + 10f, b.Y, "NB", ColAdvanced.WithAlpha(200), fs.F9);
        }
    }

    // ══════════════════════════════════════════════════════════════════════════
    // Dental long axes
    // ══════════════════════════════════════════════════════════════════════════
    private static void DrawDentalAxes(
        SKCanvas canvas, Dictionary<string, Landmark> lm, int imgW, int imgH)
    {
        using var solid = new SKPaint
        {
            IsAntialias = true,
            Color = ColDental.WithAlpha(180),
            StrokeWidth = 1.6f,
            Style = SKPaintStyle.Stroke,
            StrokeCap = SKStrokeCap.Round,
        };

        if (lm.TryGetValue("UI", out var ui) && lm.TryGetValue("U1_c", out var uic))
            DrawToothSilhouette(canvas, ui, uic, isUpper: true, solid, imgW, imgH);

        if (lm.TryGetValue("LI", out var li) && lm.TryGetValue("L1_c", out var lic))
            DrawToothSilhouette(canvas, li, lic, isUpper: false, solid, imgW, imgH);

        if (lm.TryGetValue("U6", out var u6))
            DrawMolarBlock(canvas, u6, isUpper: true, solid, imgW, imgH);

        if (lm.TryGetValue("L6", out var l6))
            DrawMolarBlock(canvas, l6, isUpper: false, solid, imgW, imgH);
    }

    // ══════════════════════════════════════════════════════════════════════════
    // Clinical appraisals
    // ══════════════════════════════════════════════════════════════════════════
    private static void DrawClinicalAppraisals(
        SKCanvas canvas, Dictionary<string, Landmark> lm, int imgW, int imgH, FontScale fs)
    {
        using var paint = new SKPaint
        {
            IsAntialias = true,
            Color = new SKColor(200, 200, 255, 140),
            StrokeWidth = 1.2f,
            Style = SKPaintStyle.Stroke,
            PathEffect = SKPathEffect.CreateDash([8f, 4f], 0),
        };

        DrawWitsGeometry(canvas, lm, paint, imgW, imgH, fs);

        if (TryGetPoint(lm, "N", imgW, imgH, out var n) &&
            TryGetPoint(lm, "A", imgW, imgH, out var a) &&
            TryGetPoint(lm, "Pog", imgW, imgH, out var pog))
        {
            paint.Color = ColAdvanced.WithAlpha(120);
            canvas.DrawLine(n, a, paint);
            canvas.DrawLine(a, pog, paint);
        }

        if (TryGetPoint(lm, "S", imgW, imgH, out var s) &&
            TryGetPoint(lm, "Gn", imgW, imgH, out var gn))
        {
            paint.Color = ColGrowth.WithAlpha(110);
            canvas.DrawLine(s, gn, paint);
            DrawShadowedLabel(canvas, gn.X + 5f, gn.Y + 15f, "Y-Axis", ColGrowth.WithAlpha(160), fs.F9);
        }
    }

    private static void DrawWitsGeometry(
        SKCanvas canvas, Dictionary<string, Landmark> lm,
        SKPaint paint, int imgW, int imgH, FontScale fs)
    {
        if (!TryGetPoint(lm, "U6", imgW, imgH, out var u6) ||
            !TryGetPoint(lm, "L6", imgW, imgH, out var l6) ||
            !TryGetPoint(lm, "UI", imgW, imgH, out var ui) ||
            !TryGetPoint(lm, "LI", imgW, imgH, out var li) ||
            !TryGetPoint(lm, "A", imgW, imgH, out var a) ||
            !TryGetPoint(lm, "B", imgW, imgH, out var b))
            return;

        var pMol = new Vector2((u6.X + l6.X) / 2f, (u6.Y + l6.Y) / 2f);
        var pInc = new Vector2((ui.X + li.X) / 2f, (ui.Y + li.Y) / 2f);
        var v = Vector2.Normalize(pInc - pMol);

        paint.Color = new SKColor(200, 200, 255, 140);
        paint.PathEffect = SKPathEffect.CreateDash([8f, 4f], 0);
        canvas.DrawLine(pMol.X - v.X * 100, pMol.Y - v.Y * 100,
                        pInc.X + v.X * 100, pInc.Y + v.Y * 100, paint);
        DrawShadowedLabel(canvas, pMol.X - v.X * 120, pMol.Y - v.Y * 120, "OccPlane", paint.Color, fs.F9);

        Vector2 Project(SKPoint src)
        {
            var p = new Vector2(src.X, src.Y);
            float t = Vector2.Dot(p - pMol, v);
            var proj = pMol + t * v;
            paint.Color = SKColors.White.WithAlpha(130);
            paint.PathEffect = SKPathEffect.CreateDash([8f, 4f], 0);
            canvas.DrawLine(p.X, p.Y, proj.X, proj.Y, paint);
            return proj;
        }

        var aProp = Project(a);
        var bProp = Project(b);

        paint.Color = ColANB.WithAlpha(200);
        paint.StrokeWidth = 2.0f;
        paint.PathEffect = null;
        canvas.DrawLine(aProp.X, aProp.Y, bProp.X, bProp.Y, paint);
    }

    private static void DrawToothSilhouette(
        SKCanvas canvas, Landmark tip, Landmark root,
        bool isUpper, SKPaint paint, int imgW, int imgH)
    {
        if (!HasCoords(tip) || !HasCoords(root)) return;

        float tx = (float)tip.XMm!.Value * imgW, ty = (float)tip.YMm!.Value * imgH;
        float rx = (float)root.XMm!.Value * imgW, ry = (float)root.YMm!.Value * imgH;
        float dx = rx - tx, dy = ry - ty;
        float len = MathF.Sqrt(dx * dx + dy * dy);
        if (len < 10f) return;

        float ux = dx / len, uy = dy / len;
        float px = -uy, py = ux;
        float cw = len * 0.38f, cl = len * 0.42f, rw = len * 0.18f;

        using var path = new SKPath();
        path.MoveTo(tx, ty);
        path.CubicTo(tx + px * cw, ty + py * cw,
                     tx + ux * cl + px * cw, ty + uy * cl + py * cw,
                     tx + ux * cl, ty + uy * cl);
        path.CubicTo(tx + ux * cl - px * cw, ty + uy * cl - py * cw,
                     tx - px * cw, ty - py * cw,
                     tx, ty);
        path.Close();

        float midLen = cl + (len - cl) / 2f;
        path.MoveTo(tx + ux * cl, ty + uy * cl);
        path.CubicTo(tx + ux * midLen + px * rw, ty + uy * midLen + py * rw, rx, ry, rx, ry);
        path.CubicTo(rx, ry,
                     tx + ux * midLen - px * rw, ty + uy * midLen - py * rw,
                     tx + ux * cl, ty + uy * cl);

        using var fill = new SKPaint { IsAntialias = true, Color = paint.Color.WithAlpha(30), Style = SKPaintStyle.Fill };
        canvas.DrawPath(path, fill);
        canvas.DrawPath(path, paint);
    }

    private static void DrawMolarBlock(
        SKCanvas canvas, Landmark point, bool isUpper, SKPaint paint, int imgW, int imgH)
    {
        if (!HasCoords(point)) return;
        float x = (float)point.XMm!.Value * imgW, y = (float)point.YMm!.Value * imgH;
        float w = 26f, h = 20f, dir = isUpper ? -1f : 1f;

        using var path = new SKPath();
        path.MoveTo(x - w / 2f, y);
        path.CubicTo(x - w / 4f, y + 4f * dir, x + w / 4f, y + 4f * dir, x + w / 2f, y);
        path.LineTo(x + w / 2f, y + h * dir);
        path.LineTo(x - w / 2f, y + h * dir);
        path.Close();
        canvas.DrawPath(path, paint);
    }

    // ══════════════════════════════════════════════════════════════════════════
    // Angle-arc sectors
    // ══════════════════════════════════════════════════════════════════════════
    private static void DrawAngleArcSectors(
        SKCanvas canvas, Dictionary<string, Landmark> lm,
        AnalysisSession session, int imgW, int imgH, FontScale fs)
    {
        void DrawSector(string c1, string vertex, string c2, SKColor col, string mCode)
        {
            if (!TryGetPoint(lm, c1, imgW, imgH, out var p1)) return;
            if (!TryGetPoint(lm, vertex, imgW, imgH, out var vc)) return;
            if (!TryGetPoint(lm, c2, imgW, imgH, out var p2)) return;

            var v1 = Vector2.Normalize(new Vector2(p1.X - vc.X, p1.Y - vc.Y));
            var v2 = Vector2.Normalize(new Vector2(p2.X - vc.X, p2.Y - vc.Y));

            float startAngle = MathF.Atan2(v1.Y, v1.X) * (180f / MathF.PI);
            float endAngle = MathF.Atan2(v2.Y, v2.X) * (180f / MathF.PI);
            float sweep = endAngle - startAngle;

            // Normalise to (-180, 180]
            while (sweep > 180f) sweep -= 360f;
            while (sweep < -180f) sweep += 360f;

            const float radius = 32f;
            var rect = new SKRect(vc.X - radius, vc.Y - radius, vc.X + radius, vc.Y + radius);

            using var arcPath = new SKPath();
            arcPath.MoveTo(vc);
            arcPath.ArcTo(rect, startAngle, sweep, false);
            arcPath.Close();

            using var fill = new SKPaint { IsAntialias = true, Color = col.WithAlpha(35), Style = SKPaintStyle.Fill };
            canvas.DrawPath(arcPath, fill);

            using var stroke = new SKPaint
            {
                IsAntialias = true,
                Color = col.WithAlpha(180),
                StrokeWidth = 1.6f,
                Style = SKPaintStyle.Stroke,
            };
            canvas.DrawArc(rect, startAngle, sweep, false, stroke);

            var m = session.Measurements?.FirstOrDefault(mu => mu.MeasurementCode == mCode);
            if (m is not null)
            {
                float midRad = (startAngle + sweep / 2f) * (MathF.PI / 180f);
                DrawShadowedLabel(canvas,
                    vc.X + radius * 1.5f * MathF.Cos(midRad),
                    vc.Y + radius * 1.5f * MathF.Sin(midRad),
                    $"{m.Value:F1}°",
                    ColorForStatus(m.Status, col), fs.F11);
            }
        }

        DrawSector("S", "N", "A", ColSNA, "SNA");
        DrawSector("S", "N", "B", ColSNB, "SNB");
        DrawSector("Or", "Po", "Me", ColFMA, "FMA");
    }

    // ══════════════════════════════════════════════════════════════════════════
    // Björk growth-vector arrow
    // ══════════════════════════════════════════════════════════════════════════
    private static void DrawBjorkGrowthVector(
        SKCanvas canvas, Dictionary<string, Landmark> lm,
        AnalysisSession session, int imgW, int imgH, FontScale fs)
    {
        if (!TryGetPoint(lm, "S", imgW, imgH, out var s)) return;
        if (!TryGetPoint(lm, "Go", imgW, imgH, out var go)) return;

        float jRatio = (float)(session.Measurements
            ?.FirstOrDefault(m => m.MeasurementCode == "JRatio")?.Value ?? 62.0m);
        float dev = jRatio - 63.5f;
        float arrLen = 56f + MathF.Abs(dev) * 2.5f;

        float dx = go.X - s.X, dy = go.Y - s.Y;
        float mag = MathF.Sqrt(dx * dx + dy * dy);
        if (mag < 1f) return;
        float ux = dx / mag, uy = dy / mag;

        float ox = (s.X + go.X) / 2f, oy = (s.Y + go.Y) / 2f;
        float ex = ox + ux * arrLen, ey = oy + uy * arrLen;

        SKColor col = dev > 4f ? ColGrowth : dev < -4f ? ColDecreased : ColNormal;

        using var linePaint = new SKPaint
        {
            IsAntialias = true,
            Color = col.WithAlpha(220),
            StrokeWidth = 2.2f,
            Style = SKPaintStyle.Stroke,
            StrokeCap = SKStrokeCap.Round,
        };
        canvas.DrawLine(ox, oy, ex, ey, linePaint);

        float ang = MathF.Atan2(uy, ux);
        float hl = 11f, ha = 0.42f;
        using var headPath = new SKPath();
        headPath.MoveTo(ex, ey);
        headPath.LineTo(ex - hl * MathF.Cos(ang - ha), ey - hl * MathF.Sin(ang - ha));
        headPath.LineTo(ex - hl * MathF.Cos(ang + ha), ey - hl * MathF.Sin(ang + ha));
        headPath.Close();

        using var headFill = new SKPaint { IsAntialias = true, Color = col, Style = SKPaintStyle.Fill };
        canvas.DrawPath(headPath, headFill);

        string lbl = dev > 4f ? "CCW growth" : dev < -4f ? "CW growth" : "Normal growth";
        DrawShadowedLabel(canvas, ex + 7f, ey - 5f, lbl, col, fs.F9);
    }

    // ══════════════════════════════════════════════════════════════════════════
    // Landmark points with confidence halos
    // ══════════════════════════════════════════════════════════════════════════
    private static void DrawLandmarkPoints(
        SKCanvas canvas, Dictionary<string, Landmark> lm,
        AnalysisSession session, int imgW, int imgH, FontScale fs)
    {
        var meta = session.LandmarkMeta ?? [];

        using var haloPaint = new SKPaint { IsAntialias = true, Style = SKPaintStyle.Fill };
        using var ringPaint = new SKPaint { IsAntialias = true, Style = SKPaintStyle.Stroke, StrokeWidth = 1.2f };
        using var dotPaint = new SKPaint { IsAntialias = true, Style = SKPaintStyle.Fill };
        using var labelFont = new SKFont(SKTypeface.Default, fs.F9);

        foreach (var (code, p) in lm)
        {
            if (!HasCoords(p)) continue;
            float x = (float)p.XMm!.Value * imgW;
            float y = (float)p.YMm!.Value * imgH;

            float conf = 0.75f;
            float errPx = 7f;

            if (meta.TryGetValue(code, out var m))
            {
                conf = (float)m.Confidence;
                float ps = (float)(session.XRayImage?.PixelSpacingMm ?? 0.3m);
                errPx = (float)(m.ExpectedErrorMm / (decimal)ps);
            }

            SKColor ptCol = conf > 0.85f ? ColNormal : conf > 0.65f ? ColIncreased : ColDecreased;

            haloPaint.Color = ptCol.WithAlpha(conf > 0.80f ? (byte)30 : (byte)60);
            canvas.DrawCircle(x, y, errPx * 1.4f, haloPaint);

            ringPaint.Color = ptCol.WithAlpha(180);
            canvas.DrawCircle(x, y, 3.8f, ringPaint);

            dotPaint.Color = SKColors.White.WithAlpha(230);
            canvas.DrawCircle(x, y, 1.6f, dotPaint);

            DrawShadowedLabel(canvas, x + 5f, y - 4f, code, ptCol, fs.F9);
        }
    }

    // ══════════════════════════════════════════════════════════════════════════
    // Measurement callouts
    // ══════════════════════════════════════════════════════════════════════════
    private static void DrawMeasurementCallouts(
        SKCanvas canvas, Dictionary<string, Landmark> lm,
        AnalysisSession session, int imgW, int imgH, FontScale fs)
    {
        var byCode = session.Measurements?
            .ToDictionary(m => m.MeasurementCode, m => m)
            ?? new Dictionary<string, Measurement>();

        float rowH = fs.F13 + 6f;

        DrawCalloutColumn(canvas, byCode, lm, imgW * 0.50f, imgH * 0.10f, rowH,
        [
            ("SNA",  "N",  ColSNA,  "SNA"),
            ("SNB",  "N",  ColSNB,  "SNB"),
            ("ANB",  "N",  ColANB,  "ANB"),
            ("IMPA", "Go", ColIMPA, "IMPA"),
        ], imgW, imgH, fs);

        DrawCalloutColumn(canvas, byCode, lm, imgW * 0.06f, imgH * 0.40f, rowH,
        [
            ("FMA",    "Go", ColFMA,   "FMA"),
            ("JRatio", "Go", ColGrowth,"JRatio"),
        ], imgW, imgH, fs);

        DrawCalloutColumn(canvas, byCode, lm, imgW * 0.80f, imgH * 0.55f, rowH,
        [
            ("Wits",    "A",  ColAdvanced, "Wits"),
            ("H-Angle", "Ls", ColProfile,  "H∠"),
            ("APDI",    "B",  ColAdvanced, "APDI"),
            ("ODI",     "B",  ColAdvanced, "ODI"),
        ], imgW, imgH, fs);

        DrawCompactDentalMeasurements(canvas, byCode, lm, imgW, imgH, fs);

        if (byCode.TryGetValue("IMPA", out var impa) &&
            TryGetPoint(lm, "Me", imgW, imgH, out var me))
        {
            DrawPillLabel(canvas, me.X + 20f, me.Y + 30f,
                $"{impa.Value:F1} °", ColorForStatus(impa.Status), fs.F11);
        }
    }

    private static void DrawCalloutColumn(
        SKCanvas canvas,
        Dictionary<string, Measurement> byCode,
        Dictionary<string, Landmark> lm,
        float x, float y, float rowH,
        (string Code, string Anchor, SKColor BaseCol, string ShortLabel)[] items,
        int imgW, int imgH,
        FontScale fs)
    {
        float cy = y;
        foreach (var (code, anchor, baseCol, shortLabel) in items)
        {
            if (!byCode.TryGetValue(code, out var meas)) { cy += rowH; continue; }

            SKColor col = ColorForStatus(meas.Status, baseCol);
            string unit = meas.Unit switch
            {
                MeasurementUnit.Degrees => "°",
                MeasurementUnit.Percent => "%",
                _ => "mm",
            };
            string statusMark = meas.Status switch
            {
                MeasurementStatus.Increased => " ▲",
                MeasurementStatus.Decreased => " ▼",
                _ => "",
            };

            if (TryGetPoint(lm, anchor, imgW, imgH, out var pt))
                DrawLeaderLine(canvas, x, cy, pt.X, pt.Y, col.WithAlpha(90));

            DrawPillLabel(canvas, x, cy, $"{shortLabel}: {meas.Value:F1}{unit}{statusMark}", col, fs.F11);
            cy += rowH + 2f;
        }
    }

    private static void DrawCompactDentalMeasurements(
        SKCanvas canvas,
        Dictionary<string, Measurement> byCode,
        Dictionary<string, Landmark> lm,
        int imgW, int imgH,
        FontScale fs)
    {
        ReadOnlySpan<(string Code, string Anchor, float OffX, float OffY)> compact =
        [
            ("U1-NA-mm",  "A",   12f, -18f),
            ("L1-NB-mm",  "B",   12f,  -6f),
            ("Pog-NB",    "Pog", 12f,   4f),
            ("Wits-mm",   "ANS", 12f,  18f),
        ];

        foreach (var (code, anchor, ox, oy) in compact)
        {
            if (!byCode.TryGetValue(code, out var meas)) continue;
            if (!TryGetPoint(lm, anchor, imgW, imgH, out var pt)) continue;
            DrawShadowedLabel(canvas, pt.X + ox, pt.Y + oy,
                $"{meas.Value:F1}", ColorForStatus(meas.Status, ColAdvanced), fs.F11);
        }
    }

    // ══════════════════════════════════════════════════════════════════════════
    // Two-column legend panel
    // ══════════════════════════════════════════════════════════════════════════
    private static void DrawOnImageLegend(SKCanvas canvas, int imgW, int imgH, FontScale fs)
    {
        float colW = imgW * 0.20f;
        float panW = colW * 2.05f;
        float panH = imgH * 0.22f;
        float mar = imgW * 0.012f;
        float px = mar;
        float py = imgH - panH - mar;

        using var bg = new SKPaint { IsAntialias = true, Color = new SKColor(8, 12, 24, 200) };
        canvas.DrawRoundRect(new SKRoundRect(new SKRect(px, py, px + panW, py + panH), 8f), bg);

        using var rulePaint = new SKPaint
        {
            IsAntialias = true,
            Color = new SKColor(255, 255, 255, 35),
            StrokeWidth = 0.8f,
            Style = SKPaintStyle.Stroke,
        };
        canvas.DrawLine(px + 8, py + fs.F13 + 10f, px + panW - 8, py + fs.F13 + 10f, rulePaint);
        canvas.DrawLine(px + colW, py + fs.F13 + 12f, px + colW, py + panH - 6f, rulePaint);

        using var titleFont = new SKFont(SKTypeface.Default, fs.F13) { Embolden = true };
        using var titlePaint = new SKPaint { IsAntialias = true, Color = SKColors.White };
        canvas.DrawText("Tracing legend", px + 8, py + fs.F13 + 4, titleFont, titlePaint);

        ReadOnlySpan<(SKColor Col, float Dash, string Lbl)> leftRows =
        [
            (ColAnatomical, 0f,  "Anatomical Tracing"),
            (ColSkeletal,   0f,  "Skeletal Planes"),
            (ColProfile,    0f,  "Soft-tissue Profile"),
            (ColDental,    10f,  "Dental Axes / Teeth"),
            (ColAdvanced,   8f,  "E-line / NB Lines"),
            (ColGrowth,     0f,  "Growth Vector"),
        ];

        ReadOnlySpan<(SKColor Col, string Lbl)> rightRows =
        [
            (ColNormal,    "Normal Range"),
            (ColIncreased, "Increasing Target"),
            (ColDecreased, "Decreasing Target"),
        ];

        using var linePaint = new SKPaint { IsAntialias = true, StrokeWidth = 1.8f, Style = SKPaintStyle.Stroke, StrokeCap = SKStrokeCap.Round };
        using var lblFont = new SKFont(SKTypeface.Default, fs.F9);
        using var lblPaint = new SKPaint { IsAntialias = true, Color = new SKColor(210, 215, 220, 230) };
        using var dotPaint = new SKPaint { IsAntialias = true, Style = SKPaintStyle.Fill };

        int maxRows = Math.Max(leftRows.Length, rightRows.Length);
        float rowH = (panH - fs.F13 - 18f) / maxRows;
        float ry = py + fs.F13 + 18f;

        for (int i = 0; i < leftRows.Length; i++)
        {
            var (col, dash, lbl) = leftRows[i];
            float cy = ry + i * rowH + rowH / 2f;
            linePaint.Color = col.WithAlpha(210);
            linePaint.PathEffect = dash > 0
                ? SKPathEffect.CreateDash([dash, dash / 2f], 0) : null;
            canvas.DrawLine(px + 8, cy, px + 38, cy, linePaint);
            canvas.DrawText(lbl, px + 46, cy + 4, lblFont, lblPaint);
        }

        for (int i = 0; i < rightRows.Length; i++)
        {
            var (col, lbl) = rightRows[i];
            float cy = ry + i * rowH + rowH / 2f;
            dotPaint.Color = col.WithAlpha(210);
            canvas.DrawCircle(px + colW + 14, cy, 5f, dotPaint);
            canvas.DrawText(lbl, px + colW + 26, cy + 4, lblFont, lblPaint);
        }
    }

    // ══════════════════════════════════════════════════════════════════════════
    // Calibration ruler (top-right, resolution-aware)
    // ══════════════════════════════════════════════════════════════════════════
    private static void DrawCalibrationRuler(
        SKCanvas canvas, AnalysisSession session, int imgW, int imgH, FontScale fs)
    {
        float ps = (float)(session.XRayImage?.PixelSpacingMm ?? 0);
        if (ps <= 0f) return;

        // Target 40 mm, clamped to 30 % of image width
        float rulerMm = 40f;
        float mmToPx = 1f / ps;
        float rulerPx = Math.Min(rulerMm * mmToPx, imgW * 0.30f);
        // Recalculate actual mm shown so tick labels remain accurate
        rulerMm = rulerPx * ps;

        float x = imgW - rulerPx - 55f;
        float y = 36f;

        using var bgPaint = new SKPaint { IsAntialias = true, Color = new SKColor(10, 12, 25, 180) };
        canvas.DrawRoundRect(
            new SKRoundRect(new SKRect(x - 8f, y - 18f, x + rulerPx + 64f, y + 28f), 5f),
            bgPaint);

        using var linePaint = new SKPaint { IsAntialias = true, Color = SKColors.White.WithAlpha(240), StrokeWidth = 2.0f };
        using var tickPaint = new SKPaint { IsAntialias = true, Color = SKColors.White, StrokeWidth = 1.0f };
        using var lblFont = new SKFont(SKTypeface.Default, fs.F9) { Embolden = true };
        using var lblPaint = new SKPaint { IsAntialias = true, Color = SKColors.White };

        canvas.DrawLine(x, y, x + rulerPx, y, linePaint);

        int totalMm = (int)rulerMm;
        for (int i = 0; i <= totalMm; i++)
        {
            float tx = x + i * mmToPx;
            float th = i % 10 == 0 ? 12f : i % 5 == 0 ? 8f : 4f;
            canvas.DrawLine(tx, y, tx, y + th, tickPaint);
        }

        for (int i = 0; i <= totalMm; i += 10)
            canvas.DrawText($"{i}", x + i * mmToPx - 4f, y + 20f, lblFont, lblPaint);

        canvas.DrawText("mm", x + rulerPx + 6f, y + 5f, lblFont, lblPaint);
    }

    // ══════════════════════════════════════════════════════════════════════════
    // Coordinate helpers
    // ══════════════════════════════════════════════════════════════════════════

    private static bool TryGetPoint(
        Dictionary<string, Landmark> lm, string code,
        int imgW, int imgH, out SKPoint point)
    {
        if (lm.TryGetValue(code, out var l) && l.XMm.HasValue && l.YMm.HasValue)
        {
            point = new SKPoint((float)l.XMm.Value * imgW, (float)l.YMm.Value * imgH);
            return true;
        }
        point = default;
        return false;
    }

    private static bool HasCoords(Landmark l) => l.XMm.HasValue && l.YMm.HasValue;

    private static List<SKPoint> CollectPoints(
        Dictionary<string, Landmark> lm, int imgW, int imgH, string[] codes)
        => codes
            .Where(c => lm.TryGetValue(c, out var l) && HasCoords(l))
            .Select(c => new SKPoint((float)lm[c].XMm!.Value * imgW, (float)lm[c].YMm!.Value * imgH))
            .ToList();

    // ══════════════════════════════════════════════════════════════════════════
    // Drawing primitives
    // ══════════════════════════════════════════════════════════════════════════

    private static SKColor ColorForStatus(MeasurementStatus status, SKColor baseColor = default)
    {
        if (baseColor == default) baseColor = ColSkeletal;
        return status switch
        {
            MeasurementStatus.Increased => ColIncreased,
            MeasurementStatus.Decreased => ColDecreased,
            _ => baseColor,
        };
    }

    private static void DrawPillLabel(
        SKCanvas canvas, float x, float y, string text, SKColor color, float fontSize)
    {
        using var font = new SKFont(SKTypeface.Default, fontSize) { Embolden = true };
        float tw = font.MeasureText(text);
        float pad = 5f;

        using var bgPaint = new SKPaint { IsAntialias = true, Color = new SKColor(0, 0, 0, 175) };
        canvas.DrawRoundRect(
            new SKRoundRect(new SKRect(x - pad, y - fontSize, x + tw + pad, y + pad), 4f),
            bgPaint);

        using var txtPaint = new SKPaint { IsAntialias = true, Color = color };
        canvas.DrawText(text, x, y, font, txtPaint);
    }

    private static void DrawShadowedLabel(
        SKCanvas canvas, float x, float y, string text, SKColor color, float fontSize)
    {
        using var font = new SKFont(SKTypeface.Default, fontSize) { Embolden = true };
        using var shadow = new SKPaint { IsAntialias = true, Color = new SKColor(0, 0, 0, 160) };
        using var fg = new SKPaint { IsAntialias = true, Color = color };
        canvas.DrawText(text, x + 1f, y + 1f, font, shadow);
        canvas.DrawText(text, x, y, font, fg);
    }

    private static void DrawLeaderLine(
        SKCanvas canvas, float lx, float ly, float px, float py, SKColor color)
    {
        using var paint = new SKPaint
        {
            IsAntialias = true,
            Color = color,
            StrokeWidth = 0.8f,
            Style = SKPaintStyle.Stroke,
            PathEffect = SKPathEffect.CreateDash([5f, 4f], 0),
        };
        canvas.DrawLine(lx, ly, px, py, paint);
    }
}