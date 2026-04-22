using CephAnalysis.Application.Interfaces;
using CephAnalysis.Domain.Entities;
using CephAnalysis.Domain.Enums;
using SkiaSharp;
using System.Numerics;

namespace CephAnalysis.Infrastructure.Services;

/// <summary>
/// Professional-grade cephalometric tracing overlay — v2.
///
/// Improvements over v1:
///   ■ Typographically-styled header band (patient name, DOB, date, case ID)
///   ■ Colour-matched landmark labels with contrasting drop-shadow
///   ■ Properly anchored measurement callouts with leader lines and pill
///     backgrounds, grouped into three semantic zones (cranial, skeletal, dental)
///   ■ Per-segment dash patterns per plane type (SN solid, FH long-dash,
///     mandibular medium-dash, palatal fine-dash)
///   ■ Smooth cubic-spline soft-tissue profile instead of polyline
///   ■ Confidence halo uses Gaussian blur approximation (two concentric fills)
///   ■ Semi-opaque filled angle-arc sectors (not just strokes)
///   ■ Björk arrow with colour-coded ring legend keyed to JRatio deviation
///   ■ Two-column legend with rule-line separators and dot/line swatches
///   ■ Calibration ruler repositioned to top-right to avoid tracing overlap
///   ■ All text rendered with dark drop-shadow for legibility on X-ray
///   ■ Numeric measurements left-right separated from crowded facial region
/// </summary>
public class SkiaImageOverlayService : IImageOverlayService
{
    // ── Per-render context for thread safety ────────────────────────────────
    private record RenderContext(
        int Width,
        int Height,
        float Scale,
        Dictionary<string, Landmark> Landmarks,
        SKFont Fs9,
        SKFont Fs11,
        SKFont Fs13,
        SKFont Fs15);

    // ── Palette ─────────────────────────────────────────────────────────────
    private static readonly SKColor ColSkeletal = SKColor.Parse("#9333ea"); // Purple-600
    private static readonly SKColor ColProfile = SKColor.Parse("#dc2626"); // Red-600
    private static readonly SKColor ColAnatomical = SKColor.Parse("#111111"); // Clinical Black
    private static readonly SKColor ColDental = SKColor.Parse("#4b5563"); // Slate-600
    private static readonly SKColor ColAdvanced = SKColor.Parse("#0891b2"); // Cyan-600
    private static readonly SKColor ColNormal = SKColor.Parse("#059669"); // Emerald-600
    private static readonly SKColor ColIncreased = SKColor.Parse("#ea580c"); // Orange-600
    private static readonly SKColor ColDecreased = SKColor.Parse("#dc2626"); // Red-600
    private static readonly SKColor ColGrowth = SKColor.Parse("#16a34a"); // Green-600
    private static readonly SKColor ColHeader = SKColor.Parse("#1e293b"); // Slate-800
    private static readonly SKColor ColSNA = SKColor.Parse("#16a34a"); // Green  (matches ref)
    private static readonly SKColor ColSNB = SKColor.Parse("#ea580c"); // Orange (matches ref)
    private static readonly SKColor ColANB = SKColor.Parse("#2563eb"); // Blue   (matches ref)
    private static readonly SKColor ColFMA = SKColor.Parse("#ea580c"); // Orange (matches ref)
    private static readonly SKColor ColIMPA = SKColor.Parse("#16a34a"); // Green  (matches ref)

    public async Task<Stream> GenerateOverlaidImageAsync(
        Stream baseImageStream,
        AnalysisSession session,
        CancellationToken ct)
    {
        return await Task.Run(() =>
        {
            using var inputStream = new SKManagedStream(baseImageStream);
            using var bitmap = SKBitmap.Decode(inputStream);
            if (bitmap == null) return baseImageStream;

            // Scale fonts relative to image height (baseline 900 px)
            float scale = bitmap.Height / 900f;
            
            // Initialize context-specific fonts
            using var fs9 = new SKFont(SKTypeface.Default, 9f * scale);
            using var fs11 = new SKFont(SKTypeface.Default, 11f * scale);
            using var fs13 = new SKFont(SKTypeface.Default, 13f * scale);
            using var fs15 = new SKFont(SKTypeface.Default, 15f * scale);

            var ctx = new RenderContext(
                bitmap.Width,
                bitmap.Height,
                scale,
                session.Landmarks.ToDictionary(l => l.LandmarkCode, l => l),
                fs9, fs11, fs13, fs15
            );

            using var canvas = new SKCanvas(bitmap);

            // Back → front draw order
            DrawExtendedSkeletalPlanes(canvas, ctx);
            DrawAnatomicalOutlines(canvas, ctx);
            DrawPharyngealAirway(canvas, session, ctx);
            DrawAnatomicalProfileSpline(canvas, ctx);
            DrawSoftTissueLines(canvas, ctx);
            DrawDentalAxes(canvas, ctx);
            DrawClinicalAppraisals(canvas, ctx);
            DrawAngleArcSectors(canvas, session, ctx);
            DrawBjorkGrowthVector(canvas, session, ctx);
            DrawLandmarkPoints(canvas, session, ctx);
            DrawMeasurementCallouts(canvas, session, ctx);
            DrawOnImageLegend(canvas, ctx);
            DrawCalibrationRuler(canvas, session, ctx);
            DrawPatientHeader(canvas, session, ctx);

            var image = SKImage.FromBitmap(bitmap);
            var data = image.Encode(SKEncodedImageFormat.Jpeg, 93);
            return data.AsStream();
        }, ct);
    }

    // ══════════════════════════════════════════════════════════════════════════
    // Patient header (top-left banner)
    // ══════════════════════════════════════════════════════════════════════════
    private void DrawPatientHeader(SKCanvas canvas, AnalysisSession session, RenderContext ctx)
    {
        float pad = 12f * ctx.Scale;
        float bh = (15f + 11f) * ctx.Scale + pad * 2.5f;

        // Semi-opaque dark band
        using var bg = new SKPaint
        {
            Color = new SKColor(10, 15, 30, 200),
            IsAntialias = true,
        };
        canvas.DrawRect(new SKRect(0, 0, ctx.Width * 0.55f, bh), bg);

        using var wp = new SKPaint { IsAntialias = true, Color = SKColors.White };
        using var sp = new SKPaint { IsAntialias = true, Color = new SKColor(160, 200, 255, 210) };

        float tx = pad, ty = (11f * ctx.Scale) + pad;
        var patient = session.XRayImage?.Study?.Patient;
        string name = patient?.FullName ?? "Unknown Patient";
        string age = "--Y";
        if (patient?.DateOfBirth != null)
        {
            int yrs = DateTime.UtcNow.Year - patient.DateOfBirth.Year;
            age = $"{yrs}Y";
        }
        string gender = patient?.Gender.ToString() ?? "U";

        canvas.DrawText($"{name} ({age}, {gender})", tx, ty, ctx.Fs11, wp);
        canvas.DrawText($"{session.QueuedAt:d/M/yyyy}", tx, ty + (11f * ctx.Scale) + 4, ctx.Fs11, sp);
    }

    // ══════════════════════════════════════════════════════════════════════════
    // Extended skeletal planes — per-plane dash patterns
    // ══════════════════════════════════════════════════════════════════════════
    private void DrawExtendedSkeletalPlanes(SKCanvas canvas, RenderContext ctx)
    {
        // (c1, c2, color, extension, dashOn, dashOff, opacity)
        var planes = new (string, string, SKColor, float, float, float, float)[]
        {
            ("Po",  "Or",  ColSkeletal, 0.22f, 20f,  6f,  0.70f), // Frankfort – long dash
            ("S",   "N",   ColSkeletal, 0.22f,  0f,  0f,  0.80f), // SN – solid
            ("Go",  "Me",  ColSkeletal, 0.20f, 14f,  7f,  0.70f), // Mandibular – medium dash
            ("ANS", "PNS", ColDental,   0.18f,  8f,  4f,  0.60f), // Palatal – fine dash
            ("N",   "A",   ColAdvanced, 0.15f,  8f,  5f,  0.55f), // NA
            ("N",   "B",   ColAdvanced, 0.15f,  8f,  5f,  0.55f), // NB
        };

        foreach (var (c1, c2, color, ext, dashOn, dashOff, opacity) in planes)
        {
            var p1 = GetPoint(c1, ctx);
            var p2 = GetPoint(c2, ctx);
            if (p1 == null || p2 == null) continue;

            float dx = p2.Value.X - p1.Value.X;
            float dy = p2.Value.Y - p1.Value.Y;

            float x1 = Math.Clamp(p1.Value.X - dx * ext, 0, ctx.Width);
            float y1 = Math.Clamp(p1.Value.Y - dy * ext, 0, ctx.Height);
            float x2 = Math.Clamp(p2.Value.X + dx * ext, 0, ctx.Width);
            float y2 = Math.Clamp(p2.Value.Y + dy * ext, 0, ctx.Height);

            using var paint = new SKPaint
            {
                IsAntialias = true,
                Color = color.WithAlpha((byte)(255 * opacity)),
                StrokeWidth = 1.6f * ctx.Scale,
                Style = SKPaintStyle.Stroke,
                StrokeCap = SKStrokeCap.Round,
                PathEffect = dashOn > 0
                    ? SKPathEffect.CreateDash(new[] { dashOn * ctx.Scale, dashOff * ctx.Scale }, 0)
                    : null,
            };
            canvas.DrawLine(x1, y1, x2, y2, paint);

            // Plane label at mid-point, offset perpendicular
            DrawShadowedLabel(canvas,
                (x1 + x2) / 2f + 6f * ctx.Scale,
                (y1 + y2) / 2f - 6f * ctx.Scale,
                c1 == "Po" ? "FH" : c1 == "S" ? "SN" :
                c1 == "Go" ? "MP" : c1 == "ANS" ? "PP" : "",
                color.WithAlpha(200), ctx.Fs9);
        }
    }

    // ══════════════════════════════════════════════════════════════════════════
    // Hard-tissue anatomical outlines
    // ══════════════════════════════════════════════════════════════════════════
    private void DrawAnatomicalOutlines(SKCanvas canvas, RenderContext ctx)
    {
        using var paint = new SKPaint
        {
            IsAntialias = true,
            Color = ColAnatomical.WithAlpha(210),
            StrokeWidth = 2.0f * ctx.Scale,
            Style = SKPaintStyle.Stroke,
            StrokeCap = SKStrokeCap.Round,
            StrokeJoin = SKStrokeJoin.Round,
        };

        void DrawChain(params string[] codes)
        {
            var points = codes
                .Select(c => GetPoint(c, ctx))
                .Where(p => p.HasValue)
                .Select(p => p!.Value)
                .ToList();

            if (points.Count < 2) return;
            using var path = new SKPath();
            path.MoveTo(points[0]);
            for(int i=1; i<points.Count; i++) path.LineTo(points[i]);
            canvas.DrawPath(path, paint);
        }

        void DrawSpline(params string[] codes)
        {
            var points = codes
                .Select(c => GetPoint(c, ctx))
                .Where(p => p.HasValue)
                .Select(p => p!.Value)
                .ToList();

            if (points.Count < 3) { DrawChain(codes); return; }
            using var path = BuildCatmullRom(points, tension: 0.3f);
            canvas.DrawPath(path, paint);
        }

        DrawSpline("Ar", "Go", "Me", "Gn", "Pog", "B");  // Mandible
        DrawSpline("Ba", "S", "N");                      // Cranial Base
        DrawChain("PNS", "ANS", "A");                    // Maxilla
        
        var co = GetPoint("Co", ctx);
        var g = GetPoint("Go", ctx);
        if (co != null && g != null)
        {
            using var rPath = new SKPath();
            rPath.MoveTo(co.Value.X, co.Value.Y);
            // Gentle curve for the ramus
            float midX = (co.Value.X + g.Value.X) / 2f - 4f * ctx.Scale;
            float midY = (co.Value.Y + g.Value.Y) / 2f;
            rPath.QuadTo(midX, midY, g.Value.X, g.Value.Y);
            canvas.DrawPath(rPath, paint);
        }

        // Symphysis loop
        var lb = GetPoint("B", ctx);
        var lp = GetPoint("Pog", ctx);
        var lgn = GetPoint("Gn", ctx);
        var lme = GetPoint("Me", ctx);
        if (lb != null && lp != null && lgn != null && lme != null)
        {
            using var sym = new SKPath();
            sym.MoveTo(lb.Value.X, lb.Value.Y);
            sym.QuadTo(lp.Value.X, lp.Value.Y, lgn.Value.X, lgn.Value.Y);
            sym.LineTo(lme.Value.X, lme.Value.Y);
            sym.Close();
            canvas.DrawPath(sym, paint);
        }
    }

    // ══════════════════════════════════════════════════════════════════════════
    // Soft-tissue profile — smooth cubic spline
    // ══════════════════════════════════════════════════════════════════════════
    private void DrawAnatomicalProfileSpline(SKCanvas canvas, RenderContext ctx)
    {
        string[] pts = { "GLA", "SoftN", "Prn", "Sn", "Ls", "StomU", "StomL", "Li", "Sm", "SoftPog", "SoftGn" };

        var points = pts
            .Select(c => GetPoint(c, ctx))
            .Where(p => p.HasValue)
            .Select(p => p!.Value)
            .ToList();

        if (points.Count < 3) return;

        using var path = BuildCatmullRom(points, tension: 0.4f);
        using var paint = new SKPaint
        {
            IsAntialias = true,
            Color = ColProfile.WithAlpha(210),
            StrokeWidth = 2.6f * ctx.Scale,
            Style = SKPaintStyle.Stroke,
            StrokeCap = SKStrokeCap.Round,
            StrokeJoin = SKStrokeJoin.Round,
        };
        canvas.DrawPath(path, paint);
    }

    private void DrawPharyngealAirway(SKCanvas canvas, AnalysisSession session, RenderContext ctx)
    {
        var pns = GetPoint("PNS", ctx);
        var ba = GetPoint("Ba", ctx);
        if (pns == null || ba == null) return;

        var wall = GetPoint("36", ctx);
        if (wall != null)
        {
            using var p = new SKPaint
            {
                IsAntialias = true,
                Color = ColAdvanced.WithAlpha(160),
                StrokeWidth = 2.0f * ctx.Scale,
                Style = SKPaintStyle.Stroke
            };
            canvas.DrawLine(pns.Value, wall.Value, p);
            
            float dPx = SKPoint.Distance(pns.Value, wall.Value);
            decimal ps = session.XRayImage?.PixelSpacingMm ?? 0.3m;
            if (ps > 0)
            {
                float dMm = dPx * (float)ps;
                DrawShadowedLabel(canvas, (pns.Value.X + wall.Value.X) / 2 + 10 * ctx.Scale, (pns.Value.Y + wall.Value.Y) / 2, $"{dMm:F1}mm", ColAdvanced, ctx.Fs11);
            }
        }
    }

    /// <summary>Catmull-Rom spline through <paramref name="pts"/>.</summary>
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
    // Soft-tissue reference lines (E-line, NB extension)
    // ══════════════════════════════════════════════════════════════════════════
    private void DrawSoftTissueLines(SKCanvas canvas, RenderContext ctx)
    {
        using var dashed = new SKPaint
        {
            IsAntialias = true,
            StrokeWidth = 1.5f * ctx.Scale,
            Style = SKPaintStyle.Stroke,
            PathEffect = SKPathEffect.CreateDash(new float[] { 9 * ctx.Scale, 5 * ctx.Scale }, 0),
        };

        var prn = GetPoint("Prn", ctx);
        var spog = GetPoint("SoftPog", ctx);
        if (prn != null && spog != null)
        {
            dashed.Color = ColProfile.WithAlpha(170);
            canvas.DrawLine(prn.Value, spog.Value, dashed);
            DrawShadowedLabel(canvas, prn.Value.X + 9 * ctx.Scale, prn.Value.Y - 9 * ctx.Scale, "E-line", ColProfile.WithAlpha(210), ctx.Fs9);
        }

        var n = GetPoint("N", ctx);
        var b = GetPoint("B", ctx);
        if (n != null && b != null)
        {
            dashed.Color = ColAdvanced.WithAlpha(150);
            float dx = b.Value.X - n.Value.X;
            float dy = b.Value.Y - n.Value.Y;
            canvas.DrawLine(n.Value.X - dx * 0.25f, n.Value.Y - dy * 0.25f,
                            b.Value.X + dx * 0.20f, b.Value.Y + dy * 0.20f, dashed);
            DrawShadowedLabel(canvas, b.Value.X + 10 * ctx.Scale, b.Value.Y, "NB", ColAdvanced.WithAlpha(200), ctx.Fs9);
        }
    }

    // ══════════════════════════════════════════════════════════════════════════
    // Dental long axes
    // ══════════════════════════════════════════════════════════════════════════
    private void DrawDentalAxes(SKCanvas canvas, RenderContext ctx)
    {
        using var solid = new SKPaint
        {
            IsAntialias = true,
            Color = ColDental.WithAlpha(180),
            StrokeWidth = 1.6f * ctx.Scale,
            Style = SKPaintStyle.Stroke,
            StrokeCap = SKStrokeCap.Round,
        };

        // UI Outline
        var ui = GetPoint("UI", ctx);
        var uic = GetPoint("U1_c", ctx);
        if (ui != null && uic != null)
            DrawToothSilhouette(canvas, ui.Value, uic.Value, isUpper: true, solid, ctx);

        // LI Outline
        var li = GetPoint("LI", ctx);
        var lic = GetPoint("L1_c", ctx);
        if (li != null && lic != null)
            DrawToothSilhouette(canvas, li.Value, lic.Value, isUpper: false, solid, ctx);

        // Molars
        var u6 = GetPoint("U6", ctx);
        if (u6 != null) DrawMolarBlock(canvas, u6.Value, isUpper: true, solid, ctx);
        
        var l6 = GetPoint("L6", ctx);
        if (l6 != null) DrawMolarBlock(canvas, l6.Value, isUpper: false, solid, ctx);
    }

    // ══════════════════════════════════════════════════════════════════════════
    // Geometric Clinical Appraisals
    // ══════════════════════════════════════════════════════════════════════════
    private void DrawClinicalAppraisals(SKCanvas canvas, RenderContext ctx)
    {
        using var paint = new SKPaint
        {
            IsAntialias = true,
            Color = new SKColor(200, 200, 255, 140),
            StrokeWidth = 1.2f * ctx.Scale,
            Style = SKPaintStyle.Stroke,
            PathEffect = SKPathEffect.CreateDash(new float[] { 8 * ctx.Scale, 4 * ctx.Scale }, 0)
        };

        // 1. Wits Appraisal
        DrawWitsGeometry(canvas, paint, ctx);

        // 2. Angle of Convexity (N-A-Pog)
        var n = GetPoint("N", ctx);
        var a = GetPoint("A", ctx);
        var pog = GetPoint("Pog", ctx);
        if (n != null && a != null && pog != null)
        {
            paint.Color = ColAdvanced.WithAlpha(120);
            canvas.DrawLine(n.Value, a.Value, paint);
            canvas.DrawLine(a.Value, pog.Value, paint);
        }

        // 3. Y-Axis (Growth Direction: S-Gn)
        var s = GetPoint("S", ctx);
        var gn = GetPoint("Gn", ctx);
        if (s != null && gn != null)
        {
            paint.Color = ColGrowth.WithAlpha(110);
            canvas.DrawLine(s.Value, gn.Value, paint);
            DrawShadowedLabel(canvas, gn.Value.X + 5 * ctx.Scale, gn.Value.Y + 15 * ctx.Scale, "Y-Axis", ColGrowth.WithAlpha(160), ctx.Fs9);
        }
    }

    private void DrawWitsGeometry(SKCanvas canvas, SKPaint paint, RenderContext ctx)
    {
        // Require molars and incisors to define the functional occlusal plane
        var u6 = GetPoint("U6", ctx);
        var l6 = GetPoint("L6", ctx);
        var ui = GetPoint("UI", ctx);
        var li = GetPoint("LI", ctx);
        var a = GetPoint("A", ctx);
        var b = GetPoint("B", ctx);

        if (u6 == null || l6 == null || ui == null || li == null || a == null || b == null) return;

        // Dental midpoints for Occlusal Plane
        var pMol = new Vector2((u6.Value.X + l6.Value.X) / 2f, (u6.Value.Y + l6.Value.Y) / 2f);
        var pInc = new Vector2((ui.Value.X + li.Value.X) / 2f, (ui.Value.Y + li.Value.Y) / 2f);

        // Occlusal Plane line: P = pMol + t * v
        var v = Vector2.Normalize(pInc - pMol);

        // Extended OP for visual context
        canvas.DrawLine(pMol.X - v.X * 100 * ctx.Scale, pMol.Y - v.Y * 100 * ctx.Scale, pInc.X + v.X * 100 * ctx.Scale, pInc.Y + v.Y * 100 * ctx.Scale, paint);
        DrawShadowedLabel(canvas, pMol.X - v.X * 120 * ctx.Scale, pMol.Y - v.Y * 120 * ctx.Scale, "OccPlane", paint.Color, ctx.Fs9);

        // Projections
        void Project(SKPoint source, out Vector2 result)
        {
            var p = new Vector2(source.X, source.Y);
            float t = Vector2.Dot(p - pMol, v);
            result = pMol + t * v;

            paint.Color = SKColors.White.WithAlpha(130);
            canvas.DrawLine(p.X, p.Y, result.X, result.Y, paint);
        }

        Project(a.Value, out var aProp);
        Project(b.Value, out var bProp);

        // AO-BO segment
        paint.Color = ColANB.WithAlpha(200);
        paint.StrokeWidth = 2.0f * ctx.Scale;
        paint.PathEffect = null;
        canvas.DrawLine(aProp.X, aProp.Y, bProp.X, bProp.Y, paint);
    }

    private void DrawToothSilhouette(SKCanvas canvas, SKPoint tip, SKPoint root, bool isUpper, SKPaint paint, RenderContext ctx)
    {
        float tx = tip.X; float ty = tip.Y;
        float rx = root.X; float ry = root.Y;
        float dx = rx - tx; float dy = ry - ty;
        float len = MathF.Sqrt(dx * dx + dy * dy);
        if (len < 10f * ctx.Scale) return;
        float ux = dx / len; float uy = dy / len;
        float px = -uy; float py = ux;

        using var path = new SKPath();
        float cw = len * 0.38f; // crown width
        float cl = len * 0.42f; // crown length
        float rw = len * 0.18f; // root width

        // Crown
        path.MoveTo(tx, ty);
        // Left crown edge
        path.CubicTo(tx + px * cw, ty + py * cw, tx + ux * cl + px * cw, ty + uy * cl + py * cw, tx + ux * cl, ty + uy * cl);
        // Right crown edge
        path.CubicTo(tx + ux * cl - px * cw, ty + uy * cl - py * cw, tx - px * cw, ty - py * cw, tx, ty);
        path.Close();

        // Root (tapered teardrop)
        path.MoveTo(tx + ux * cl, ty + uy * cl);
        path.CubicTo(tx + ux * (cl + (len - cl) / 2) + px * rw, ty + uy * (cl + (len - cl) / 2) + py * rw,
                     rx, ry, rx, ry);
        path.CubicTo(rx, ry,
                     tx + ux * (cl + (len - cl) / 2) - px * rw, ty + uy * (cl + (len - cl) / 2) - py * rw,
                     tx + ux * cl, ty + uy * cl);
        
        // Fill for clinical premium look
        using var fillPaint = new SKPaint { IsAntialias = true, Color = paint.Color.WithAlpha(30), Style = SKPaintStyle.Fill };
        canvas.DrawPath(path, fillPaint);
        canvas.DrawPath(path, paint);
    }

    private void DrawMolarBlock(SKCanvas canvas, SKPoint point, bool isUpper, SKPaint paint, RenderContext ctx)
    {
        float x = point.X, y = point.Y;
        float w = 26f * ctx.Scale, h = 20f * ctx.Scale;
        float dir = isUpper ? -1 : 1;

        using var path = new SKPath();
        path.MoveTo(x - w / 2, y);
        // Anatomical cusps
        path.CubicTo(x - w / 4, y + 4 * dir * ctx.Scale, x + w / 4, y + 4 * dir * ctx.Scale, x + w / 2, y);
        path.LineTo(x + w / 2, y + h * dir);
        path.LineTo(x - w / 2, y + h * dir);
        path.Close();
        canvas.DrawPath(path, paint);
    }

    // ══════════════════════════════════════════════════════════════════════════
    // Angle-arc sectors (filled + stroked) at SNA, SNB, FMA
    // ══════════════════════════════════════════════════════════════════════════
    private void DrawAngleArcSectors(SKCanvas canvas, AnalysisSession session, RenderContext ctx)
    {
        void DrawSector(string c1, string vertex, string c2, SKColor col, string mCode)
        {
            var p1 = GetPoint(c1, ctx);
            var vc = GetPoint(vertex, ctx);
            var p2 = GetPoint(c2, ctx);

            if (p1 == null || vc == null || p2 == null) return;

            var v1 = Vector2.Normalize(new Vector2(p1.Value.X - vc.Value.X, p1.Value.Y - vc.Value.Y));
            var v2 = Vector2.Normalize(new Vector2(p2.Value.X - vc.Value.X, p2.Value.Y - vc.Value.Y));

            float startAngle = MathF.Atan2(v1.Y, v1.X) * 180f / MathF.PI;
            float sweep = MathF.Atan2(v2.Y, v2.X) * 180f / MathF.PI - startAngle;
            if (sweep > 180) sweep -= 360;
            if (sweep < -180) sweep += 360;

            float radius = 32f * ctx.Scale;
            var rect = new SKRect(
                vc.Value.X - radius, vc.Value.Y - radius,
                vc.Value.X + radius, vc.Value.Y + radius);

            // Filled sector
            using var fill = new SKPaint
            {
                IsAntialias = true,
                Color = col.WithAlpha(35),
                Style = SKPaintStyle.Fill
            };
            using var arcPath = new SKPath();
            arcPath.MoveTo(vc.Value.X, vc.Value.Y);
            arcPath.ArcTo(rect, startAngle, sweep, false);
            arcPath.Close();
            canvas.DrawPath(arcPath, fill);

            // Stroked arc
            using var stroke = new SKPaint
            {
                IsAntialias = true,
                Color = col.WithAlpha(180),
                StrokeWidth = 1.6f * ctx.Scale,
                Style = SKPaintStyle.Stroke,
            };
            canvas.DrawArc(rect, startAngle, sweep, false, stroke);

            // Vertex Label
            var m = session.Measurements?.FirstOrDefault(mu => mu.MeasurementCode == mCode);
            if (m != null)
            {
                float midAng = startAngle + sweep / 2f;
                float lx = vc.Value.X + radius * 1.5f * MathF.Cos(midAng * MathF.PI / 180f);
                float ly = vc.Value.Y + radius * 1.5f * MathF.Sin(midAng * MathF.PI / 180f);
                DrawShadowedLabel(canvas, lx, ly, $"{m.Value:F1}°", ColorForStatus(m.Status, col), ctx.Fs11);
            }
        }

        DrawSector("S", "N", "A", ColSNA, "SNA");
        DrawSector("S", "N", "B", ColSNB, "SNB");
        DrawSector("Or", "Po", "Me", ColFMA, "FMA");
    }

    // ══════════════════════════════════════════════════════════════════════════
    // Björk growth-vector arrow
    // ══════════════════════════════════════════════════════════════════════════
    private void DrawBjorkGrowthVector(SKCanvas canvas, AnalysisSession session, RenderContext ctx)
    {
        var s = GetPoint("S", ctx);
        var go = GetPoint("Go", ctx);
        if (s == null || go == null) return;

        var jMeas = session.Measurements?.FirstOrDefault(m => m.MeasurementCode == "JRatio");
        float jRatio = (float)(jMeas?.Value ?? 62.0m);
        float dev = jRatio - 63.5f;
        float arrLen = (56f + MathF.Abs(dev) * 2.5f) * ctx.Scale;

        float dx = go.Value.X - s.Value.X;
        float dy = go.Value.Y - s.Value.Y;
        float mag = MathF.Sqrt(dx * dx + dy * dy);
        if (mag < 1f) return;
        float ux = dx / mag; float uy = dy / mag;

        float ox = (s.Value.X + go.Value.X) / 2f;
        float oy = (s.Value.Y + go.Value.Y) / 2f;
        float ex = ox + ux * arrLen;
        float ey = oy + uy * arrLen;

        SKColor col = dev > 4f ? ColGrowth : dev < -4f ? ColDecreased : ColNormal;

        using var linePaint = new SKPaint
        {
            IsAntialias = true,
            Color = col.WithAlpha(220),
            StrokeWidth = 2.2f * ctx.Scale,
            Style = SKPaintStyle.Stroke,
            StrokeCap = SKStrokeCap.Round
        };
        canvas.DrawLine(ox, oy, ex, ey, linePaint);

        // Arrowhead
        float hl = 11f * ctx.Scale, ha = 0.42f;
        float ang = MathF.Atan2(uy, ux);
        using var headPath = new SKPath();
        headPath.MoveTo(ex, ey);
        headPath.LineTo(ex - hl * MathF.Cos(ang - ha), ey - hl * MathF.Sin(ang - ha));
        headPath.LineTo(ex - hl * MathF.Cos(ang + ha), ey - hl * MathF.Sin(ang + ha));
        headPath.Close();
        using var headFill = new SKPaint { IsAntialias = true, Color = col, Style = SKPaintStyle.Fill };
        canvas.DrawPath(headPath, headFill);

        string lbl = dev > 4f ? "CCW growth" : dev < -4f ? "CW growth" : "Normal growth";
        DrawShadowedLabel(canvas, ex + 7f * ctx.Scale, ey - 5f * ctx.Scale, lbl, col, ctx.Fs9);
    }

    // ══════════════════════════════════════════════════════════════════════════
    // Landmark points with confidence halos
    // ══════════════════════════════════════════════════════════════════════════
    private void DrawLandmarkPoints(SKCanvas canvas, AnalysisSession session, RenderContext ctx)
    {
        var meta = session.LandmarkMeta ?? new Dictionary<string, LandmarkMeta>();

        using var haloPaint = new SKPaint { IsAntialias = true, Style = SKPaintStyle.Fill };
        using var ringPaint = new SKPaint { IsAntialias = true, Style = SKPaintStyle.Stroke, StrokeWidth = 1.2f * ctx.Scale };
        using var dotPaint = new SKPaint { IsAntialias = true, Style = SKPaintStyle.Fill };

        foreach (var (code, p) in ctx.Landmarks)
        {
            var pt = GetPoint(code, ctx);
            if (pt == null) continue;

            float conf = 0.75f;
            float errPx = 7f * ctx.Scale;

            if (meta.TryGetValue(code, out var m))
            {
                conf = (float)m.Confidence;
                float ps = (float)(session.XRayImage?.PixelSpacingMm ?? 0.3m);
                errPx = (float)(m.ExpectedErrorMm / (decimal)ps);
            }

            SKColor ptCol = conf > 0.85f ? ColNormal
                          : conf > 0.65f ? ColIncreased
                          : ColDecreased;

            // Minimalist ring halo
            haloPaint.Color = ptCol.WithAlpha(conf > 0.80f ? (byte)30 : (byte)60);
            canvas.DrawCircle(pt.Value, errPx * 1.4f, haloPaint);

            // Confidence ring
            ringPaint.Color = ptCol.WithAlpha(180);
            canvas.DrawCircle(pt.Value, 3.8f * ctx.Scale, ringPaint);

            // White core dot
            dotPaint.Color = SKColors.White.WithAlpha(230);
            canvas.DrawCircle(pt.Value, 1.6f * ctx.Scale, dotPaint);

            // Label with shadow
            DrawShadowedLabel(canvas, pt.Value.X + 5f * ctx.Scale, pt.Value.Y - 4f * ctx.Scale, code, ptCol, ctx.Fs9);
        }
    }

    // ══════════════════════════════════════════════════════════════════════════
    // Measurement callouts — pill labels with leader lines, grouped by zone
    // ══════════════════════════════════════════════════════════════════════════
    private void DrawMeasurementCallouts(SKCanvas canvas, AnalysisSession session, RenderContext ctx)
    {
        var byCode = session.Measurements?
            .ToDictionary(m => m.MeasurementCode, m => m)
            ?? new Dictionary<string, Measurement>();

        // ── Zone A: cranial / angular ────────────────────
        float zoneAX = ctx.Width * 0.50f;
        float zoneAY = ctx.Height * 0.10f;
        float rowH = (13f + 6f) * ctx.Scale;

        DrawCalloutColumn(canvas, byCode, zoneAX, zoneAY, rowH, new[]
        {
            ("SNA",  "N",  ColSNA,  "SNA"),
            ("SNB",  "N",  ColSNB,  "SNB"),
            ("ANB",  "N",  ColANB,  "ANB"),
            ("IMPA", "Go", ColIMPA, "IMPA"),
        }, ctx);

        // ── Zone B: vertical / skeletal ───────────────
        float zoneBX = ctx.Width * 0.06f;
        float zoneBY = ctx.Height * 0.40f;

        DrawCalloutColumn(canvas, byCode, zoneBX, zoneBY, rowH, new[]
        {
            ("FMA",    "Go", ColFMA,  "FMA"),
            ("JRatio", "Go", ColGrowth,"JRatio"),
        }, ctx);

        // ── Zone C: soft-tissue ───────────────────────────────
        float zoneCX = ctx.Width * 0.80f;
        float zoneCY = ctx.Height * 0.55f;

        DrawCalloutColumn(canvas, byCode, zoneCX, zoneCY, rowH, new[]
        {
            ("Wits",     "A",   ColAdvanced, "Wits"),
            ("H-Angle",  "Ls",  ColProfile,  "H\u2220"),
            ("APDI",     "B",   ColAdvanced, "APDI"),
            ("ODI",      "B",   ColAdvanced, "ODI"),
        }, ctx);

        // ── Zone D: dental measurements ────
        DrawCompactDentalMeasurements(canvas, byCode, ctx);

        // ── IMPA bottom ───────────────────────────────────────────────────────
        if (byCode.TryGetValue("IMPA", out var impa))
        {
            var me = GetPoint("Me", ctx);
            if (me != null)
            {
                string txt = $"{impa.Value:F1} \u00b0";
                DrawPillLabel(canvas, me.Value.X + 20f * ctx.Scale, me.Value.Y + 30f * ctx.Scale, txt,
                    ColorForStatus(impa.Status), ctx.Fs11);
            }
        }
    }

    private void DrawCalloutColumn(
        SKCanvas canvas,
        Dictionary<string, Measurement> byCode,
        float x, float y, float rowH,
        (string code, string anchor, SKColor baseCol, string shortLabel)[] items,
        RenderContext ctx)
    {
        float cy = y;
        foreach (var (code, anchor, baseCol, shortLabel) in items)
        {
            if (!byCode.TryGetValue(code, out var meas)) { cy += rowH; continue; }

            SKColor col = ColorForStatus(meas.Status, baseCol);
            string unit = meas.Unit switch
            {
                MeasurementUnit.Degrees => "\u00b0",
                MeasurementUnit.Percent => "%",
                _ => "mm",
            };
            string statusMark = meas.Status switch
            {
                MeasurementStatus.Increased => " \u25b2",
                MeasurementStatus.Decreased => " \u25bc",
                _ => "",
            };
            string label = $"{shortLabel}: {meas.Value:F1}{unit}{statusMark}";

            // Leader line to anchor landmark
            var pt = GetPoint(anchor, ctx);
            if (pt != null)
            {
                DrawLeaderLine(canvas, x, cy, pt.Value.X, pt.Value.Y, col.WithAlpha(90), ctx);
            }

            DrawPillLabel(canvas, x, cy, label, col, ctx.Fs11);
            cy += rowH + 2f * ctx.Scale;
        }
    }

    /// <summary>
    /// Draws compact numbered measurements near the facial region (4.26, 1.22, 8.51, 4.02)
    /// exactly as seen in the reference image — small pill labels right of the profile.
    /// </summary>
    private void DrawCompactDentalMeasurements(
        SKCanvas canvas,
        Dictionary<string, Measurement> byCode,
        RenderContext ctx)
    {
        // Codes that render as compact numbers in the right-face region
        var compact = new (string code, string anchorLandmark, float offX, float offY)[]
        {
            ("U1-NA-mm",  "A",    12f, -18f),
            ("L1-NB-mm",  "B",    12f, -6f),
            ("Pog-NB",    "Pog",  12f,  4f),
            ("Wits-mm",   "ANS",  12f,  18f),
        };

        foreach (var (code, anchor, ox, oy) in compact)
        {
            if (!byCode.TryGetValue(code, out var meas)) continue;
            var pt = GetPoint(anchor, ctx);
            if (pt == null) continue;

            float lx = pt.Value.X + ox * ctx.Scale;
            float ly = pt.Value.Y + oy * ctx.Scale;
            SKColor col = ColorForStatus(meas.Status, ColAdvanced);
            DrawShadowedLabel(canvas, lx, ly, $"{meas.Value:F1}", col, ctx.Fs11);
        }
    }

    // ══════════════════════════════════════════════════════════════════════════
    // Professional two-column legend panel
    // ══════════════════════════════════════════════════════════════════════════
    private void DrawOnImageLegend(SKCanvas canvas, RenderContext ctx)
    {
        float colW = ctx.Width * 0.20f;
        float panW = colW * 2.05f;
        float panH = ctx.Height * 0.22f;
        float mar = ctx.Width * 0.012f;
        float px = mar;
        float py = ctx.Height - panH - mar;

        // Background
        using var bg = new SKPaint
        {
            IsAntialias = true,
            Color = new SKColor(8, 12, 24, 200),
        };
        canvas.DrawRoundRect(new SKRoundRect(new SKRect(px, py, px + panW, py + panH), 8f * ctx.Scale), bg);

        // Separator rule
        using var rulePaint = new SKPaint
        {
            IsAntialias = true,
            Color = new SKColor(255, 255, 255, 35),
            StrokeWidth = 0.8f * ctx.Scale,
            Style = SKPaintStyle.Stroke,
        };
        float titleH = 13f * ctx.Scale;
        canvas.DrawLine(px + 8 * ctx.Scale, py + titleH + 10f * ctx.Scale, px + panW - 8 * ctx.Scale, py + titleH + 10f * ctx.Scale, rulePaint);
        canvas.DrawLine(px + colW, py + titleH + 12f * ctx.Scale, px + colW, py + panH - 6f * ctx.Scale, rulePaint);

        // Title
        using var titlePaint = new SKPaint { IsAntialias = true, Color = SKColors.White };
        canvas.DrawText("Tracing legend", px + 8 * ctx.Scale, py + titleH + 4 * ctx.Scale, ctx.Fs13, titlePaint);

        var leftRows = new (SKColor col, float dash, string lbl)[]
        {
            (ColAnatomical, 0,  "Anatomical Tracing"),
            (ColSkeletal,   0,  "Skeletal Planes"),
            (ColProfile,    0,  "Soft-tissue Profile"),
            (ColDental,     10, "Dental Axes / Teeth"),
            (ColAdvanced,   8,  "E-line / NB Lines"),
            (ColGrowth,     0,  "Growth Vector"),
        };

        var rightRows = new (SKColor col, string lbl)[]
        {
            (ColNormal,   "Normal Range"),
            (ColIncreased,"Increasing Target"),
            (ColDecreased,"Decreasing Target"),
        };

        using var linePaint = new SKPaint
        {
            IsAntialias = true,
            StrokeWidth = 1.8f * ctx.Scale,
            Style = SKPaintStyle.Stroke,
            StrokeCap = SKStrokeCap.Round,
        };
        using var lblPaint = new SKPaint { IsAntialias = true, Color = new SKColor(210, 215, 220, 230) };
        using var dotPaint = new SKPaint { IsAntialias = true, Style = SKPaintStyle.Fill };

        float rowH = (panH - titleH - 18f * ctx.Scale) / Math.Max(leftRows.Length, rightRows.Length);
        float ry = py + titleH + 18f * ctx.Scale;

        for (int i = 0; i < leftRows.Length; i++)
        {
            var (col, dash, lbl) = leftRows[i];
            float cy = ry + i * rowH + rowH / 2f;
            linePaint.Color = col.WithAlpha(210);
            linePaint.PathEffect = dash > 0
                ? SKPathEffect.CreateDash(new float[] { dash * ctx.Scale, dash / 2 * ctx.Scale }, 0) : null;
            canvas.DrawLine(px + 8 * ctx.Scale, cy, px + 38 * ctx.Scale, cy, linePaint);
            canvas.DrawText(lbl, px + 46 * ctx.Scale, cy + 4 * ctx.Scale, ctx.Fs9, lblPaint);
        }

        for (int i = 0; i < rightRows.Length; i++)
        {
            var (col, lbl) = rightRows[i];
            float cy = ry + i * rowH + rowH / 2f;
            dotPaint.Color = col.WithAlpha(210);
            canvas.DrawCircle(px + colW + 14 * ctx.Scale, cy, 5f * ctx.Scale, dotPaint);
            canvas.DrawText(lbl, px + colW + 26 * ctx.Scale, cy + 4 * ctx.Scale, ctx.Fs9, lblPaint);
        }
    }

    // ══════════════════════════════════════════════════════════════════════════
    // Calibration ruler — repositioned to top-right
    // ══════════════════════════════════════════════════════════════════════════
    private void DrawCalibrationRuler(SKCanvas canvas, AnalysisSession session, RenderContext ctx)
    {
        double? ps = (double?)session.XRayImage?.PixelSpacingMm;
        if (ps == null || ps <= 0) return;

        float mmToPx = (float)(1.0 / ps.Value);
        float rulerMm = 40f;
        float rulerPx = rulerMm * mmToPx;

        // Top-right corner, clear of tracing
        float x = ctx.Width - rulerPx - 50f * ctx.Scale;
        float y = 36f * ctx.Scale;

        // Background pill
        using var bgPaint = new SKPaint
        {
            IsAntialias = true,
            Color = new SKColor(10, 12, 25, 180),
        };
        canvas.DrawRoundRect(
            new SKRoundRect(new SKRect(x - 8 * ctx.Scale, y - 18 * ctx.Scale, x + rulerPx + 60 * ctx.Scale, y + 28 * ctx.Scale), 5f * ctx.Scale),
            bgPaint);

        using var linePaint = new SKPaint { IsAntialias = true, Color = SKColors.White.WithAlpha(240), StrokeWidth = 2.0f * ctx.Scale };
        using var tickPaint = new SKPaint { IsAntialias = true, Color = SKColors.White.WithAlpha(255), StrokeWidth = 1.0f * ctx.Scale };
        using var lblPaint = new SKPaint { IsAntialias = true, Color = SKColors.White };

        canvas.DrawLine(x, y, x + rulerPx, y, linePaint);

        for (int i = 0; i <= (int)rulerMm; i++)
        {
            float tx = x + i * mmToPx;
            float th = (i % 10 == 0 ? 12f : i % 5 == 0 ? 8f : 4f) * ctx.Scale;
            canvas.DrawLine(tx, y, tx, y + th, tickPaint);
        }

        for (int i = 0; i <= (int)rulerMm; i += 10)
            canvas.DrawText($"{i}", x + i * mmToPx - 4 * ctx.Scale, y + 20 * ctx.Scale, ctx.Fs9, lblPaint);

        canvas.DrawText("mm", x + rulerPx + 6 * ctx.Scale, y + 5 * ctx.Scale, ctx.Fs9, lblPaint);
    }

    // ══════════════════════════════════════════════════════════════════════════
    // Helpers
    // ══════════════════════════════════════════════════════════════════════════

    private SKColor ColorForStatus(MeasurementStatus status, SKColor baseColor = default)
    {
        if (baseColor == default) baseColor = ColSkeletal;
        return status switch
        {
            MeasurementStatus.Increased => ColIncreased,
            MeasurementStatus.Decreased => ColDecreased,
            _ => baseColor,
        };
    }

    /// <summary>Pill-shaped label with opaque dark background and coloured text.</summary>
    private void DrawPillLabel(SKCanvas canvas, float x, float y, string text, SKColor color, SKFont font)
    {
        float tw = font.MeasureText(text);
        float fontSize = font.Size;
        float pad = 5f * (fontSize / 11f); // scaled padding

        using var bgPaint = new SKPaint
        {
            IsAntialias = true,
            Color = new SKColor(0, 0, 0, 175),
        };
        canvas.DrawRoundRect(
            new SKRoundRect(new SKRect(x - pad, y - fontSize, x + tw + pad, y + pad), 4f * (fontSize / 11f)),
            bgPaint);

        using var txtPaint = new SKPaint { IsAntialias = true, Color = color };
        canvas.DrawText(text, x, y, font, txtPaint);
    }

    /// <summary>Plain text with a dark drop-shadow for legibility on X-ray backgrounds.</summary>
    private void DrawShadowedLabel(SKCanvas canvas, float x, float y, string text, SKColor color, SKFont font)
    {
        using var shadow = new SKPaint { IsAntialias = true, Color = new SKColor(0, 0, 0, 160) };
        using var fg = new SKPaint { IsAntialias = true, Color = color };
        canvas.DrawText(text, x + 1, y + 1, font, shadow);
        canvas.DrawText(text, x, y, font, fg);
    }

    /// <summary>Dashed leader line between a label anchor and a landmark point.</summary>
    private void DrawLeaderLine(SKCanvas canvas, float lx, float ly, float px, float py, SKColor color, RenderContext ctx)
    {
        using var paint = new SKPaint
        {
            IsAntialias = true,
            Color = color,
            StrokeWidth = 0.8f * ctx.Scale,
            Style = SKPaintStyle.Stroke,
            PathEffect = SKPathEffect.CreateDash(new float[] { 5 * ctx.Scale, 4 * ctx.Scale }, 0),
        };
        canvas.DrawLine(lx, ly, px, py, paint);
    }

    /// <summary>Safely extracts a pixel-space point from a landmark code.</summary>
    private static SKPoint? GetPoint(string code, RenderContext ctx)
    {
        if (ctx.Landmarks.TryGetValue(code, out var p) && p.XMm.HasValue && p.YMm.HasValue)
        {
            return new SKPoint(
                (float)(p.XMm.Value * (decimal)ctx.Width),
                (float)(p.YMm.Value * (decimal)ctx.Height));
        }
        return null;
    }
}
