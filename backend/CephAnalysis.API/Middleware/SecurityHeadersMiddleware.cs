using Microsoft.AspNetCore.Http;
using System.Threading.Tasks;

namespace CephAnalysis.API.Middleware;

/// <summary>
/// Adds HIPAA-aligned HTTP security and performance headers to every response.
///
/// Security headers: HSTS, X-Frame-Options, Content-Security-Policy,
///   X-Content-Type-Options, Referrer-Policy, Permissions-Policy.
///
/// HIPAA compliance: Cache-Control: no-store on all /api/* routes to prevent
///   PHI from being cached in browser history, CDN nodes, or proxy caches.
///
/// Observability: X-Request-ID (UUID) injected on every response for
///   distributed tracing, log correlation, and client-side error reporting.
/// </summary>
public class SecurityHeadersMiddleware
{
    private readonly RequestDelegate _next;

    public SecurityHeadersMiddleware(RequestDelegate next) => _next = next;

    public async Task InvokeAsync(HttpContext context)
    {
        // ── Observability: unique request ID for log correlation ──────────────
        var requestId = Guid.NewGuid().ToString("N")[..16];
        context.Items["RequestId"] = requestId;
        context.Response.Headers["X-Request-ID"] = requestId;

        var headers = context.Response.Headers;

        // ── Clickjacking prevention ───────────────────────────────────────────
        headers["X-Frame-Options"] = "DENY";

        // ── MIME sniffing prevention (data-exfil vector) ──────────────────────
        headers["X-Content-Type-Options"] = "nosniff";

        // ── Referrer control ──────────────────────────────────────────────────
        headers["Referrer-Policy"] = "strict-origin-when-cross-origin";

        // ── Restrict powerful browser APIs ────────────────────────────────────
        headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=(), payment=()";

        // ── Content Security Policy ───────────────────────────────────────────
        headers["Content-Security-Policy"] =
            "default-src 'self'; "                                              +
            "script-src 'self'; "                                               +
            "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "  +
            "font-src 'self' https://fonts.gstatic.com; "                      +
            "img-src 'self' data: blob:; "                                     +
            "connect-src 'self'; "                                              +
            "frame-ancestors 'none'; "                                         +
            "base-uri 'self'; "                                                 +
            "form-action 'self';";

        // ── HSTS (production only — avoids breaking local dev) ────────────────
        if (!context.Request.Host.Host.Contains("localhost"))
            headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains; preload";

        // ── HIPAA: prevent PHI caching on API routes ──────────────────────────
        // Medical data must not persist in browser cache, CDN, or proxy caches.
        if (context.Request.Path.StartsWithSegments("/api"))
        {
            headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0";
            headers["Pragma"]        = "no-cache";
        }

        // ── Remove server disclosure headers ──────────────────────────────────
        context.Response.Headers.Remove("Server");
        context.Response.Headers.Remove("X-Powered-By");
        context.Response.Headers.Remove("X-AspNet-Version");

        await _next(context);
    }
}
