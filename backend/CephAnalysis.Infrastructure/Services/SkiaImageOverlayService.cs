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
    private int _imgW;
    private int _imgH;

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

    // ── Scale-adjusted font sizes (set per render) ───────────────────────────
    private float _fs9 = 9f;
    private float _fs11 = 11f;
    private float _fs13 = 13f;
    private float _fs15 = 15f;

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
            _fs9 = 9f * scale;
            _fs11 = 11f * scale;
            _fs13 = 13f * scale;
            _fs15 = 15f * scale;

            using var canvas = new SKCanvas(bitmap);
            var lm = session.Landmarks.ToDictionary(l => l.LandmarkCode, l => l);

            // Back → front draw order
            DrawExtendedSkeletalPlanes(canvas, lm, bitmap.Width, bitmap.Height);
            DrawAnatomicalOutlines(canvas, lm);
            DrawAnatomicalProfileSpline(canvas, lm);
            DrawSoftTissueLines(canvas, lm);
            DrawDentalAxes(canvas, lm);
            DrawClinicalAppraisals(canvas, lm);
            DrawAngleArcSectors(canvas, lm, session);
            DrawBjorkGrowthVector(canvas, lm, session);
            DrawLandmarkPoints(canvas, lm, session);
            DrawMeasurementCallouts(canvas, lm, session, bitmap.Width, bitmap.Height);
            DrawOnImageLegend(canvas, bitmap.Width, bitmap.Height);
            DrawCalibrationRuler(canvas, session, bitmap.Width, bitmap.Height);
            DrawPatientHeader(canvas, session, bitmap.Width);

            var image = SKImage.FromBitmap(bitmap);
            var data = image.Encode(SKEncodedImageFormat.Jpeg, 93);
            return data.AsStream();
        }, ct);
    }

    // ══════════════════════════════════════════════════════════════════════════
    // Patient header (top-left banner)
    // ══════════════════════════════════════════════════════════════════════════
    private void DrawPatientHeader(SKCanvas canvas, AnalysisSession session, int imgW)
    {
        float pad = 12f;
        float bh = _fs15 + _fs11 + pad * 2.5f;

        // Semi-opaque dark band
        using var bg = new SKPaint
        {
            Color = new SKColor(10, 15, 30, 200),
            IsAntialias = true,
        };
        canvas.DrawRect(new SKRect(0, 0, imgW * 0.55f, bh), bg);

        using var boldFont = new SKFont(SKTypeface.Default, _fs15) { Embolden = true };
        using var normFont = new SKFont(SKTypeface.Default, _fs11);
        using var wp = new SKPaint { IsAntialias = true, Color = SKColors.White };
        using var sp = new SKPaint { IsAntialias = true, Color = new SKColor(160, 200, 255, 210) };

        float tx = pad, ty = _fs11 + pad;
        var patient = session.XRayImage?.Study?.Patient;
        string name = patient?.FullName ?? "Unknown Patient";
        string age = "--Y";
        if (patient?.DateOfBirth != null)
        {
            int yrs = DateTime.UtcNow.Year - patient.DateOfBirth.Year;
            age = $"{yrs}Y";
        }
        string gender = patient?.Gender.ToString() ?? "U";

        // Image 2 style: Minimalism
        canvas.DrawText($"{name} ({age}, {gender})", tx, ty, normFont, wp);
        canvas.DrawText($"{session.QueuedAt:d/M/yyyy}", tx, ty + _fs11 + 4, normFont, sp);
    }

    // ══════════════════════════════════════════════════════════════════════════
    // Extended skeletal planes — per-plane dash patterns
    // ══════════════════════════════════════════════════════════════════════════
    private void DrawExtendedSkeletalPlanes(
        SKCanvas canvas,
        Dictionary<string, Landmark> lm,
        int imgW, int imgH)
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
            if (!lm.TryGetValue(c1, out var p1) || !lm.TryGetValue(c2, out var p2)) continue;

            float dx = (float)((p2.XMm * (decimal)_imgW) - (p1.XMm * (decimal)_imgW));
            float dy = (float)((p2.YMm * (decimal)_imgH) - (p1.YMm * (decimal)_imgH));
            float x1 = Math.Clamp((float)((p1.XMm * (decimal)_imgW)) - dx * ext, 0, imgW);
            float y1 = Math.Clamp((float)((p1.YMm * (decimal)_imgH)) - dy * ext, 0, _imgH);
            float x2 = Math.Clamp((float)((p2.XMm * (decimal)_imgW)) + dx * ext, 0, imgW);
            float y2 = Math.Clamp((float)((p2.YMm * (decimal)_imgH)) + dy * ext, 0, _imgH);

            using var paint = new SKPaint
            {
                IsAntialias = true,
                Color = color.WithAlpha((byte)(255 * opacity)),
                StrokeWidth = 1.6f,
                Style = SKPaintStyle.Stroke,
                StrokeCap = SKStrokeCap.Round,
                PathEffect = dashOn > 0
                    ? SKPathEffect.CreateDash(new[] { dashOn, dashOff }, 0)
                    : null,
            };
            canvas.DrawLine(x1, y1, x2, y2, paint);

            // Plane label at mid-point, offset perpendicular
            DrawShadowedLabel(canvas,
                (x1 + x2) / 2f + 6f,
                (y1 + y2) / 2f - 6f,
                c1 == "Po" ? "FH" : c1 == "S" ? "SN" :
                c1 == "Go" ? "MP" : c1 == "ANS" ? "PP" : "",
                color.WithAlpha(200), _fs9);
        }
    }

    // ══════════════════════════════════════════════════════════════════════════
    // Hard-tissue anatomical outlines
    // ══════════════════════════════════════════════════════════════════════════
    private void DrawAnatomicalOutlines(SKCanvas canvas, Dictionary<string, Landmark> lm)
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
            using var path = new SKPath();
            bool started = false;
            foreach (var code in codes)
            {
                if (!lm.TryGetValue(code, out var p)) continue;
                if (!started) { path.MoveTo((float)((p.XMm * (decimal)_imgW)), (float)((p.YMm * (decimal)_imgH))); started = true; }
                else path.LineTo((float)((p.XMm * (decimal)_imgW)), (float)((p.YMm * (decimal)_imgH)));
            }
            if (started) canvas.DrawPath(path, paint);
        }

        DrawChain("Ar", "Go", "Me", "Gn", "Pog", "B");  // Mandible
        DrawChain("PNS", "ANS", "A");                    // Maxilla
        DrawChain("S", "Ar", "Ba");                      // Post. Cranial Base
        if (lm.TryGetValue("Co", out var co) && lm.TryGetValue("Go", out var g))
        {
            using var rPath = new SKPath();
            rPath.MoveTo((float)((co.XMm * (decimal)_imgW)), (float)((co.YMm * (decimal)_imgH)));
            // Gentle curve for the ramus
            float midX = ((float)((co.XMm * (decimal)_imgW)) + (float)((g.XMm * (decimal)_imgW))) / 2f - 4f;
            float midY = ((float)((co.YMm * (decimal)_imgH)) + (float)((g.YMm * (decimal)_imgH))) / 2f;
            rPath.QuadTo(midX, midY, (float)((g.XMm * (decimal)_imgW)), (float)((g.YMm * (decimal)_imgH)));
            canvas.DrawPath(rPath, paint);
        }

        // Symphysis loop
        if (lm.TryGetValue("B", out var lb) && lm.TryGetValue("Pog", out var lp) &&
            lm.TryGetValue("Gn", out var lgn) && lm.TryGetValue("Me", out var lme))
        {
            using var sym = new SKPath();
            sym.MoveTo((float)((lb.XMm * (decimal)_imgW)), (float)((lb.YMm * (decimal)_imgH)));
            sym.QuadTo((float)((lp.XMm * (decimal)_imgW)), (float)((lp.YMm * (decimal)_imgH)), (float)((lgn.XMm * (decimal)_imgW)), (float)((lgn.YMm * (decimal)_imgH)));
            sym.LineTo((float)((lme.XMm * (decimal)_imgW)), (float)((lme.YMm * (decimal)_imgH)));
            sym.Close();
            canvas.DrawPath(sym, paint);
        }
    }

    // ══════════════════════════════════════════════════════════════════════════
    // Soft-tissue profile — smooth cubic spline
    // ══════════════════════════════════════════════════════════════════════════
    private void DrawAnatomicalProfileSpline(SKCanvas canvas, Dictionary<string, Landmark> lm)
    {
        string[] pts = { "GLA", "SoftN", "Prn", "Sn", "Ls", "StomU", "StomL", "Li", "Sm", "SoftPog", "SoftGn" };

        var points = pts
            .Where(lm.ContainsKey)
            .Select(c => new SKPoint((float)(lm[c].XMm * (decimal)_imgW), (float)(lm[c].YMm * (decimal)_imgH)))
            .ToList();

        if (points.Count < 3) return;

        using var path = BuildCatmullRom(points, tension: 0.4f);
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
    private void DrawSoftTissueLines(SKCanvas canvas, Dictionary<string, Landmark> lm)
    {
        using var dashed = new SKPaint
        {
            IsAntialias = true,
            StrokeWidth = 1.5f,
            Style = SKPaintStyle.Stroke,
            PathEffect = SKPathEffect.CreateDash(new float[] { 9, 5 }, 0),
        };

        if (lm.TryGetValue("Prn", out var prn) && lm.TryGetValue("SoftPog", out var spog))
        {
            dashed.Color = ColProfile.WithAlpha(170);
            canvas.DrawLine((float)((prn.XMm * (decimal)_imgW)), (float)((prn.YMm * (decimal)_imgH)),
                            (float)((spog.XMm * (decimal)_imgW)), (float)((spog.YMm * (decimal)_imgH)), dashed);
            DrawShadowedLabel(canvas, (float)((prn.XMm * (decimal)_imgW)) + 9, (float)((prn.YMm * (decimal)_imgH)) - 9,
                "E-line", ColProfile.WithAlpha(210), _fs9);
        }

        if (lm.TryGetValue("N", out var n) && lm.TryGetValue("B", out var b))
        {
            dashed.Color = ColAdvanced.WithAlpha(150);
            float dx = (float)(((b.XMm * (decimal)_imgW)) - (n.XMm * (decimal)_imgW));
            float dy = (float)(((b.YMm * (decimal)_imgH)) - (n.YMm * (decimal)_imgH));
            canvas.DrawLine((float)((n.XMm * (decimal)_imgW)) - dx * 0.25f, (float)((n.YMm * (decimal)_imgH)) - dy * 0.25f,
                            (float)((b.XMm * (decimal)_imgW)) + dx * 0.20f, (float)((b.YMm * (decimal)_imgH)) + dy * 0.20f, dashed);
            DrawShadowedLabel(canvas, (float)((b.XMm * (decimal)_imgW)) + 10, (float)((b.YMm * (decimal)_imgH)),
                "NB", ColAdvanced.WithAlpha(200), _fs9);
        }
    }

    // ══════════════════════════════════════════════════════════════════════════
    // Dental long axes
    // ══════════════════════════════════════════════════════════════════════════
    private void DrawDentalAxes(SKCanvas canvas, Dictionary<string, Landmark> lm)
    {
        using var solid = new SKPaint
        {
            IsAntialias = true,
            Color = ColDental.WithAlpha(180),
            StrokeWidth = 1.6f,
            Style = SKPaintStyle.Stroke,
            StrokeCap = SKStrokeCap.Round,
        };

        // UI Outline
        if (lm.TryGetValue("UI", out var ui) && lm.TryGetValue("U1_c", out var uic))
            DrawToothSilhouette(canvas, ui, uic, isUpper: true, solid);

        // LI Outline
        if (lm.TryGetValue("LI", out var li) && lm.TryGetValue("L1_c", out var lic))
            DrawToothSilhouette(canvas, li, lic, isUpper: false, solid);

        // Molars
        if (lm.TryGetValue("U6", out var u6)) DrawMolarBlock(canvas, u6, isUpper: true, solid);
        if (lm.TryGetValue("L6", out var l6)) DrawMolarBlock(canvas, l6, isUpper: false, solid);
    }

    // ══════════════════════════════════════════════════════════════════════════
    // Geometric Clinical Appraisals
    // ══════════════════════════════════════════════════════════════════════════
    private void DrawClinicalAppraisals(SKCanvas canvas, Dictionary<string, Landmark> lm)
    {
        using var paint = new SKPaint
        {
            IsAntialias = true,
            Color = new SKColor(200, 200, 255, 140),
            StrokeWidth = 1.2f,
            Style = SKPaintStyle.Stroke,
            PathEffect = SKPathEffect.CreateDash(new float[] { 8, 4 }, 0)
        };

        // 1. Wits Appraisal
        DrawWitsGeometry(canvas, lm, paint);

        // 2. Angle of Convexity (N-A-Pog)
        if (lm.TryGetValue("N", out var n) && lm.TryGetValue("A", out var a) && lm.TryGetValue("Pog", out var pog))
        {
            paint.Color = ColAdvanced.WithAlpha(120);
            canvas.DrawLine((float)((n.XMm * (decimal)_imgW)), (float)((n.YMm * (decimal)_imgH)), (float)((a.XMm * (decimal)_imgW)), (float)((a.YMm * (decimal)_imgH)), paint);
            canvas.DrawLine((float)((a.XMm * (decimal)_imgW)), (float)((a.YMm * (decimal)_imgH)), (float)((pog.XMm * (decimal)_imgW)), (float)((pog.YMm * (decimal)_imgH)), paint);
        }

        // 3. Y-Axis (Growth Direction: S-Gn)
        if (lm.TryGetValue("S", out var s) && lm.TryGetValue("Gn", out var gn))
        {
            paint.Color = ColGrowth.WithAlpha(110);
            canvas.DrawLine((float)((s.XMm * (decimal)_imgW)), (float)((s.YMm * (decimal)_imgH)), (float)((gn.XMm * (decimal)_imgW)), (float)((gn.YMm * (decimal)_imgH)), paint);
            DrawShadowedLabel(canvas, (float)((gn.XMm * (decimal)_imgW)) + 5, (float)((gn.YMm * (decimal)_imgH)) + 15, "Y-Axis", ColGrowth.WithAlpha(160), _fs9);
        }
    }

    private void DrawWitsGeometry(SKCanvas canvas, Dictionary<string, Landmark> lm, SKPaint paint)
    {
        // Require molars and incisors to define the functional occlusal plane
        if (!lm.TryGetValue("U6", out var u6) || !lm.TryGetValue("L6", out var l6) ||
            !lm.TryGetValue("UI", out var ui) || !lm.TryGetValue("LI", out var li) ||
            !lm.TryGetValue("A", out var a) || !lm.TryGetValue("B", out var b)) return;

        // Dental midpoints for Occlusal Plane
        var pMol = new Vector2(((float)((u6.XMm * (decimal)_imgW)) + (float)((l6.XMm * (decimal)_imgW))) / 2f, ((float)((u6.YMm * (decimal)_imgH)) + (float)((l6.YMm * (decimal)_imgH))) / 2f);
        var pInc = new Vector2(((float)((ui.XMm * (decimal)_imgW)) + (float)((li.XMm * (decimal)_imgW))) / 2f, ((float)((ui.YMm * (decimal)_imgH)) + (float)((li.YMm * (decimal)_imgH))) / 2f);

        // Occlusal Plane line: P = pMol + t * v
        var v = Vector2.Normalize(pInc - pMol);

        // Extended OP for visual context
        canvas.DrawLine(pMol.X - v.X * 100, pMol.Y - v.Y * 100, pInc.X + v.X * 100, pInc.Y + v.Y * 100, paint);
        DrawShadowedLabel(canvas, pMol.X - v.X * 120, pMol.Y - v.Y * 120, "OccPlane", paint.Color, _fs9);

        // Projections
        void Project(Landmark source, out Vector2 result)
        {
            var p = new Vector2((float)((source.XMm * (decimal)_imgW)), (float)((source.YMm * (decimal)_imgH)));
            float t = Vector2.Dot(p - pMol, v);
            result = pMol + t * v;

            paint.Color = SKColors.White.WithAlpha(130);
            canvas.DrawLine(p.X, p.Y, result.X, result.Y, paint);
        }

        Project(a, out var aProp);
        Project(b, out var bProp);

        // AO-BO segment
        paint.Color = ColANB.WithAlpha(200);
        paint.StrokeWidth = 2.0f;
        paint.PathEffect = null;
        canvas.DrawLine(aProp.X, aProp.Y, bProp.X, bProp.Y, paint);
    }

    private void DrawToothSilhouette(SKCanvas canvas, Landmark tip, Landmark root, bool isUpper, SKPaint paint)
    {
        float tx = (float)((tip.XMm * (decimal)_imgW)); float ty = (float)((tip.YMm * (decimal)_imgH));
        float rx = (float)((root.XMm * (decimal)_imgW)); float ry = (float)((root.YMm * (decimal)_imgH));
        float dx = rx - tx; float dy = ry - ty;
        float len = MathF.Sqrt(dx * dx + dy * dy);
        if (len < 10f) return;
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

        canvas.DrawPath(path, paint);
    }

    private void DrawMolarBlock(SKCanvas canvas, Landmark point, bool isUpper, SKPaint paint)
    {
        float x = (float)((point.XMm * (decimal)_imgW)), y = (float)((point.YMm * (decimal)_imgH));
        float w = 26f, h = 20f;
        float dir = isUpper ? -1 : 1;

        using var path = new SKPath();
        path.MoveTo(x - w / 2, y);
        // Anatomical cusps
        path.CubicTo(x - w / 4, y + 4 * dir, x + w / 4, y + 4 * dir, x + w / 2, y);
        path.LineTo(x + w / 2, y + h * dir);
        path.LineTo(x - w / 2, y + h * dir);
        path.Close();
        canvas.DrawPath(path, paint);
    }

    // ══════════════════════════════════════════════════════════════════════════
    // Angle-arc sectors (filled + stroked) at SNA, SNB, FMA
    // ══════════════════════════════════════════════════════════════════════════
    private void DrawAngleArcSectors(SKCanvas canvas, Dictionary<string, Landmark> lm, AnalysisSession session)
    {
        void DrawSector(string c1, string vertex, string c2, SKColor col, string mCode)
        {
            if (!lm.TryGetValue(c1, out var p1) ||
                !lm.TryGetValue(vertex, out var vc) ||
                !lm.TryGetValue(c2, out var p2)) return;

            var v1 = Vector2.Normalize(new Vector2(
                (float)(((p1.XMm * (decimal)_imgW)) - (vc.XMm * (decimal)_imgW)), (float)(((p1.YMm * (decimal)_imgH)) - (vc.YMm * (decimal)_imgH))));
            var v2 = Vector2.Normalize(new Vector2(
                (float)(((p2.XMm * (decimal)_imgW)) - (vc.XMm * (decimal)_imgW)), (float)(((p2.YMm * (decimal)_imgH)) - (vc.YMm * (decimal)_imgH))));

            float startAngle = MathF.Atan2(v1.Y, v1.X) * 180f / MathF.PI;
            float sweep = MathF.Atan2(v2.Y, v2.X) * 180f / MathF.PI - startAngle;
            if (sweep > 180) sweep -= 360;
            if (sweep < -180) sweep += 360;

            float radius = 32f;
            var rect = new SKRect(
                (float)((vc.XMm * (decimal)_imgW)) - radius, (float)((vc.YMm * (decimal)_imgH)) - radius,
                (float)((vc.XMm * (decimal)_imgW)) + radius, (float)((vc.YMm * (decimal)_imgH)) + radius);

            // Filled sector
            using var fill = new SKPaint
            {
                IsAntialias = true,
                Color = col.WithAlpha(35),
                Style = SKPaintStyle.Fill
            };
            using var arcPath = new SKPath();
            arcPath.MoveTo((float)((vc.XMm * (decimal)_imgW)), (float)((vc.YMm * (decimal)_imgH)));
            arcPath.ArcTo(rect, startAngle, sweep, false);
            arcPath.Close();
            canvas.DrawPath(arcPath, fill);

            // Stroked arc
            using var stroke = new SKPaint
            {
                IsAntialias = true,
                Color = col.WithAlpha(180),
                StrokeWidth = 1.6f,
                Style = SKPaintStyle.Stroke,
            };
            canvas.DrawArc(rect, startAngle, sweep, false, stroke);

            // Vertex Label (Value as in Image 2)
            var m = session.Measurements?.FirstOrDefault(mu => mu.MeasurementCode == mCode);
            if (m != null)
            {
                float midAng = startAngle + sweep / 2f;
                float lx = (float)((vc.XMm * (decimal)_imgW)) + radius * 1.5f * MathF.Cos(midAng * MathF.PI / 180f);
                float ly = (float)((vc.YMm * (decimal)_imgH)) + radius * 1.5f * MathF.Sin(midAng * MathF.PI / 180f);
                DrawShadowedLabel(canvas, lx, ly, $"{m.Value:F2}°", ColorForStatus(m.Status, col), _fs11);
            }
        }

        DrawSector("S", "N", "A", ColSNA, "SNA");
        DrawSector("S", "N", "B", ColSNB, "SNB");
        DrawSector("Or", "Po", "Me", ColFMA, "FMA");
    }

    // ══════════════════════════════════════════════════════════════════════════
    // Björk growth-vector arrow
    // ══════════════════════════════════════════════════════════════════════════
    private void DrawBjorkGrowthVector(
        SKCanvas canvas,
        Dictionary<string, Landmark> lm,
        AnalysisSession session)
    {
        if (!lm.TryGetValue("S", out var s) || !lm.TryGetValue("Go", out var go)) return;

        var jMeas = session.Measurements?.FirstOrDefault(m => m.MeasurementCode == "JRatio");
        float jRatio = (float)(jMeas?.Value ?? 62.0m);
        float dev = jRatio - 63.5f;
        float arrLen = 56f + MathF.Abs(dev) * 2.5f;

        float dx = (float)(((go.XMm * (decimal)_imgW)) - (s.XMm * (decimal)_imgW));
        float dy = (float)(((go.YMm * (decimal)_imgH)) - (s.YMm * (decimal)_imgH));
        float mag = MathF.Sqrt(dx * dx + dy * dy);
        if (mag < 1f) return;
        float ux = dx / mag; float uy = dy / mag;

        float ox = ((float)((s.XMm * (decimal)_imgW)) + (float)((go.XMm * (decimal)_imgW))) / 2f;
        float oy = ((float)((s.YMm * (decimal)_imgH)) + (float)((go.YMm * (decimal)_imgH))) / 2f;
        float ex = ox + ux * arrLen;
        float ey = oy + uy * arrLen;

        SKColor col = dev > 4f ? ColGrowth : dev < -4f ? ColDecreased : ColNormal;

        using var linePaint = new SKPaint
        {
            IsAntialias = true,
            Color = col.WithAlpha(220),
            StrokeWidth = 2.2f,
            Style = SKPaintStyle.Stroke,
            StrokeCap = SKStrokeCap.Round
        };
        canvas.DrawLine(ox, oy, ex, ey, linePaint);

        // Arrowhead
        float hl = 11f, ha = 0.42f;
        float ang = MathF.Atan2(uy, ux);
        using var headPath = new SKPath();
        headPath.MoveTo(ex, ey);
        headPath.LineTo(ex - hl * MathF.Cos(ang - ha), ey - hl * MathF.Sin(ang - ha));
        headPath.LineTo(ex - hl * MathF.Cos(ang + ha), ey - hl * MathF.Sin(ang + ha));
        headPath.Close();
        using var headFill = new SKPaint { IsAntialias = true, Color = col, Style = SKPaintStyle.Fill };
        canvas.DrawPath(headPath, headFill);

        string lbl = dev > 4f ? "CCW growth" : dev < -4f ? "CW growth" : "Normal growth";
        DrawShadowedLabel(canvas, ex + 7f, ey - 5f, lbl, col, _fs9);
    }

    // ══════════════════════════════════════════════════════════════════════════
    // Landmark points with confidence halos
    // ══════════════════════════════════════════════════════════════════════════
    private void DrawLandmarkPoints(
        SKCanvas canvas,
        Dictionary<string, Landmark> lm,
        AnalysisSession session)
    {
        var meta = session.LandmarkMeta ?? new Dictionary<string, LandmarkMeta>();

        using var haloPaint = new SKPaint { IsAntialias = true, Style = SKPaintStyle.Fill };
        using var ringPaint = new SKPaint { IsAntialias = true, Style = SKPaintStyle.Stroke, StrokeWidth = 1.2f };
        using var dotPaint = new SKPaint { IsAntialias = true, Style = SKPaintStyle.Fill };
        using var labelPaint = new SKPaint { IsAntialias = true, Style = SKPaintStyle.Fill };
        using var labelFont = new SKFont(SKTypeface.Default, _fs9);

        foreach (var (code, p) in lm)
        {
            float x = (float)((p.XMm * (decimal)_imgW));
            float y = (float)((p.YMm * (decimal)_imgH));
            float conf = 0.75f;
            float errPx = 7f;

            if (meta.TryGetValue(code, out var m))
            {
                conf = (float)m.Confidence;
                float ps = (float)(session.XRayImage?.PixelSpacingMm ?? 0.3m);
                errPx = (float)(m.ExpectedErrorMm / (decimal)ps);
            }

            SKColor ptCol = conf > 0.85f ? ColNormal
                          : conf > 0.65f ? ColIncreased
                          : ColDecreased;

            // Minimalist ring halo (Single pass, subtle)
            haloPaint.Color = ptCol.WithAlpha(conf > 0.80f ? (byte)30 : (byte)60);
            canvas.DrawCircle(x, y, errPx * 1.4f, haloPaint);

            // Confidence ring
            ringPaint.Color = ptCol.WithAlpha(180);
            canvas.DrawCircle(x, y, 3.8f, ringPaint);

            // White core dot (Smaller for clean look)
            dotPaint.Color = SKColors.White.WithAlpha(230);
            canvas.DrawCircle(x, y, 1.6f, dotPaint);

            // Label with shadow
            DrawShadowedLabel(canvas, x + 5f, y - 4f, code, ptCol, _fs9);
        }
    }

    // ══════════════════════════════════════════════════════════════════════════
    // Measurement callouts — pill labels with leader lines, grouped by zone
    // ══════════════════════════════════════════════════════════════════════════
    private void DrawMeasurementCallouts(
        SKCanvas canvas,
        Dictionary<string, Landmark> lm,
        AnalysisSession session,
        int imgW, int imgH)
    {
        var byCode = session.Measurements?
            .ToDictionary(m => m.MeasurementCode, m => m)
            ?? new Dictionary<string, Measurement>();

        // ── Zone A: cranial / angular (top, near N point) ────────────────────
        // Placed as a stacked column to the right of centre
        float zoneAX = imgW * 0.50f;
        float zoneAY = imgH * 0.10f;
        float rowH = _fs13 + 6f;

        DrawCalloutColumn(canvas, byCode, lm, zoneAX, zoneAY, rowH, new[]
        {
            ("SNA",  "N",  ColSNA,  "SNA"),
            ("SNB",  "N",  ColSNB,  "SNB"),
            ("ANB",  "N",  ColANB,  "ANB"),
            ("IMPA", "Go", ColIMPA, "IMPA"),
        });

        // ── Zone B: vertical / skeletal (left margin, near Go) ───────────────
        float zoneBX = imgW * 0.06f;
        float zoneBY = imgH * 0.40f;

        DrawCalloutColumn(canvas, byCode, lm, zoneBX, zoneBY, rowH, new[]
        {
            ("FMA",    "Go", ColFMA,  "FMA"),
            ("JRatio", "Go", ColGrowth,"JRatio"),
        });

        // ── Zone C: soft-tissue (right margin) ───────────────────────────────
        float zoneCX = imgW * 0.80f;
        float zoneCY = imgH * 0.55f;

        DrawCalloutColumn(canvas, byCode, lm, zoneCX, zoneCY, rowH, new[]
        {
            ("Wits",     "A",   ColAdvanced, "Wits"),
            ("H-Angle",  "Ls",  ColProfile,  "H∠"),
            ("APDI",     "B",   ColAdvanced, "APDI"),
            ("ODI",      "B",   ColAdvanced, "ODI"),
        });

        // ── Zone D: dental measurements near face (as in reference image) ────
        DrawCompactDentalMeasurements(canvas, byCode, lm, imgW);

        // ── IMPA bottom ───────────────────────────────────────────────────────
        if (byCode.TryGetValue("IMPA", out var impa) && lm.TryGetValue("Me", out var me))
        {
            string txt = $"{impa.Value:F2} °";
            DrawPillLabel(canvas, (float)((me.XMm * (decimal)_imgW)) + 20f, (float)((me.YMm * (decimal)_imgH)) + 30f, txt,
                ColorForStatus(impa.Status), _fs11);
        }
    }

    private void DrawCalloutColumn(
        SKCanvas canvas,
        Dictionary<string, Measurement> byCode,
        Dictionary<string, Landmark> lm,
        float x, float y, float rowH,
        (string code, string anchor, SKColor baseCol, string shortLabel)[] items)
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
            string label = $"{shortLabel}: {meas.Value:F2}{unit}{statusMark}";

            // Leader line to anchor landmark
            if (lm.TryGetValue(anchor, out var pt))
            {
                DrawLeaderLine(canvas,
                    x, cy,
                    (float)((pt.XMm * (decimal)_imgW)), (float)((pt.YMm * (decimal)_imgH)),
                    col.WithAlpha(90));
            }

            DrawPillLabel(canvas, x, cy, label, col, _fs11);
            cy += rowH + 2f;
        }
    }

    /// <summary>
    /// Draws compact numbered measurements near the facial region (4.26, 1.22, 8.51, 4.02)
    /// exactly as seen in the reference image — small pill labels right of the profile.
    /// </summary>
    private void DrawCompactDentalMeasurements(
        SKCanvas canvas,
        Dictionary<string, Measurement> byCode,
        Dictionary<string, Landmark> lm,
        int imgW)
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
            if (!lm.TryGetValue(anchor, out var pt)) continue;
            float lx = (float)((pt.XMm * (decimal)_imgW)) + ox;
            float ly = (float)((pt.YMm * (decimal)_imgH)) + oy;
            SKColor col = ColorForStatus(meas.Status, ColAdvanced);
            DrawShadowedLabel(canvas, lx, ly, $"{meas.Value:F2}", col, _fs11);
        }
    }

    // ══════════════════════════════════════════════════════════════════════════
    // Professional two-column legend panel
    // ══════════════════════════════════════════════════════════════════════════
    private void DrawOnImageLegend(SKCanvas canvas, int imgW, int imgH)
    {
        float colW = imgW * 0.20f;
        float panW = colW * 2.05f;
        float panH = imgH * 0.22f;
        float mar = imgW * 0.012f;
        float px = mar;
        float py = imgH - panH - mar;

        // Background
        using var bg = new SKPaint
        {
            IsAntialias = true,
            Color = new SKColor(8, 12, 24, 200),
        };
        canvas.DrawRoundRect(new SKRoundRect(new SKRect(px, py, px + panW, py + panH), 8f), bg);

        // Separator rule
        using var rulePaint = new SKPaint
        {
            IsAntialias = true,
            Color = new SKColor(255, 255, 255, 35),
            StrokeWidth = 0.8f,
            Style = SKPaintStyle.Stroke,
        };
        canvas.DrawLine(px + 8, py + _fs13 + 10f, px + panW - 8, py + _fs13 + 10f, rulePaint);
        canvas.DrawLine(px + colW, py + _fs13 + 12f, px + colW, py + panH - 6f, rulePaint);

        // Title
        using var titleFont = new SKFont(SKTypeface.Default, _fs13) { Embolden = true };
        using var titlePaint = new SKPaint { IsAntialias = true, Color = SKColors.White };
        canvas.DrawText("Tracing legend", px + 8, py + _fs13 + 4, titleFont, titlePaint);

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
            StrokeWidth = 1.8f,
            Style = SKPaintStyle.Stroke,
            StrokeCap = SKStrokeCap.Round,
        };
        using var lblFont = new SKFont(SKTypeface.Default, _fs9);
        using var lblPaint = new SKPaint { IsAntialias = true, Color = new SKColor(210, 215, 220, 230) };
        using var dotPaint = new SKPaint { IsAntialias = true, Style = SKPaintStyle.Fill };

        float rowH = (panH - _fs13 - 18f) / Math.Max(leftRows.Length, rightRows.Length);
        float ry = py + _fs13 + 18f;

        for (int i = 0; i < leftRows.Length; i++)
        {
            var (col, dash, lbl) = leftRows[i];
            float cy = ry + i * rowH + rowH / 2f;
            linePaint.Color = col.WithAlpha(210);
            linePaint.PathEffect = dash > 0
                ? SKPathEffect.CreateDash(new float[] { dash, dash / 2 }, 0) : null;
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
    // Calibration ruler — repositioned to top-right
    // ══════════════════════════════════════════════════════════════════════════
    private void DrawCalibrationRuler(SKCanvas canvas, AnalysisSession session, int imgW, int imgH)
    {
        double? ps = (double?)session.XRayImage?.PixelSpacingMm;
        if (ps == null || ps <= 0) return;

        float mmToPx = (float)(1.0 / ps.Value);
        float rulerMm = 40f;
        float rulerPx = rulerMm * mmToPx;

        // Top-right corner, clear of tracing
        float x = imgW - rulerPx - 50f;
        float y = 36f;

        // Background pill
        using var bgPaint = new SKPaint
        {
            IsAntialias = true,
            Color = new SKColor(10, 12, 25, 180),
        };
        canvas.DrawRoundRect(
            new SKRoundRect(new SKRect(x - 8, y - 18, x + rulerPx + 60, y + 28), 5f),
            bgPaint);

        using var linePaint = new SKPaint { IsAntialias = true, Color = SKColors.White.WithAlpha(240), StrokeWidth = 2.0f };
        using var tickPaint = new SKPaint { IsAntialias = true, Color = SKColors.White.WithAlpha(255), StrokeWidth = 1.0f };
        using var lblFont = new SKFont(SKTypeface.Default, _fs9) { Embolden = true };
        using var lblPaint = new SKPaint { IsAntialias = true, Color = SKColors.White };

        canvas.DrawLine(x, y, x + rulerPx, y, linePaint);

        for (int i = 0; i <= (int)rulerMm; i++)
        {
            float tx = x + i * mmToPx;
            float th = i % 10 == 0 ? 12f : i % 5 == 0 ? 8f : 4f;
            canvas.DrawLine(tx, y, tx, y + th, tickPaint);
        }

        for (int i = 0; i <= (int)rulerMm; i += 10)
            canvas.DrawText($"{i}", x + i * mmToPx - 4, y + 20, lblFont, lblPaint);

        canvas.DrawText("mm", x + rulerPx + 6, y + 5, lblFont, lblPaint);
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
    private void DrawPillLabel(SKCanvas canvas, float x, float y, string text, SKColor color, float fontSize)
    {
        using var font = new SKFont(SKTypeface.Default, fontSize) { Embolden = true };
        float tw = font.MeasureText(text);
        float pad = 5f;

        using var bgPaint = new SKPaint
        {
            IsAntialias = true,
            Color = new SKColor(0, 0, 0, 175),
        };
        canvas.DrawRoundRect(
            new SKRoundRect(new SKRect(x - pad, y - fontSize, x + tw + pad, y + pad), 4f),
            bgPaint);

        using var txtPaint = new SKPaint { IsAntialias = true, Color = color };
        canvas.DrawText(text, x, y, font, txtPaint);
    }

    /// <summary>Plain text with a dark drop-shadow for legibility on X-ray backgrounds.</summary>
    private void DrawShadowedLabel(SKCanvas canvas, float x, float y, string text, SKColor color, float fontSize)
    {
        using var font = new SKFont(SKTypeface.Default, fontSize) { Embolden = true };
        using var shadow = new SKPaint { IsAntialias = true, Color = new SKColor(0, 0, 0, 160) };
        using var fg = new SKPaint { IsAntialias = true, Color = color };
        canvas.DrawText(text, x + 1, y + 1, font, shadow);
        canvas.DrawText(text, x, y, font, fg);
    }

    /// <summary>Dashed leader line between a label anchor and a landmark point.</summary>
    private void DrawLeaderLine(SKCanvas canvas, float lx, float ly, float px, float py, SKColor color)
    {
        using var paint = new SKPaint
        {
            IsAntialias = true,
            Color = color,
            StrokeWidth = 0.8f,
            Style = SKPaintStyle.Stroke,
            PathEffect = SKPathEffect.CreateDash(new float[] { 5, 4 }, 0),
        };
        canvas.DrawLine(lx, ly, px, py, paint);
    }
}
