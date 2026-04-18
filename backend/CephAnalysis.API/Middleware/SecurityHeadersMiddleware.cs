using Microsoft.AspNetCore.Http;
using System.Threading.Tasks;

namespace CephAnalysis.API.Middleware;

/// <summary>
/// Adds HIPAA-aligned HTTP security headers to every response.
/// Covers: HSTS, X-Frame-Options, Content-Security-Policy,
///         X-Content-Type-Options, Referrer-Policy, Permissions-Policy.
/// </summary>
public class SecurityHeadersMiddleware
{
    private readonly RequestDelegate _next;

    public SecurityHeadersMiddleware(RequestDelegate next) => _next = next;

    public async Task InvokeAsync(HttpContext context)
    {
        var headers = context.Response.Headers;

        // Prevent clickjacking
        headers["X-Frame-Options"] = "DENY";

        // Prevent MIME sniffing (data exfiltration vector)
        headers["X-Content-Type-Options"] = "nosniff";

        // Limit referrer information leaked to third parties
        headers["Referrer-Policy"] = "strict-origin-when-cross-origin";

        // Restrict powerful browser APIs (camera, microphone, geolocation)
        headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=(), payment=()";

        // Content Security Policy — locked-down: only allow own origin + known CDNs
        headers["Content-Security-Policy"] =
            "default-src 'self'; " +
            "script-src 'self'; " +
            "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
            "font-src 'self' https://fonts.gstatic.com; " +
            "img-src 'self' data: blob:; " +
            "connect-src 'self'; " +
            "frame-ancestors 'none'; " +
            "base-uri 'self'; " +
            "form-action 'self';";

        // HTTP Strict Transport Security — 1 year, include subdomains
        // Only send in production to avoid local dev issues
        if (!context.Request.Host.Host.Contains("localhost"))
        {
            headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains; preload";
        }

        // Remove server disclosure header
        context.Response.Headers.Remove("Server");
        context.Response.Headers.Remove("X-Powered-By");

        await _next(context);
    }
}
