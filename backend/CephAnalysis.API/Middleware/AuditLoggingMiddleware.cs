using System.Security.Claims;
using CephAnalysis.Application.Interfaces;
using CephAnalysis.Domain.Entities;

namespace CephAnalysis.API.Middleware;

/// <summary>
/// HIPAA-compliant audit middleware: logs all patient-related read/write operations.
/// </summary>
public class AuditLoggingMiddleware
{
    private readonly RequestDelegate _next;
    private readonly ILogger<AuditLoggingMiddleware> _logger;

    // Endpoints that trigger an audit log entry
    private static readonly string[] AuditPrefixes =
    [
        "/api/patients",
        "/api/studies",
        "/api/images",
        "/api/sessions",
        "/api/reports",
    ];

    public AuditLoggingMiddleware(RequestDelegate next, ILogger<AuditLoggingMiddleware> logger)
    {
        _next   = next;
        _logger = logger;
    }

    public async Task InvokeAsync(HttpContext context, IApplicationDbContext db)
    {
        await _next(context);

        var path   = context.Request.Path.Value ?? string.Empty;
        var method = context.Request.Method;

        if (AuditPrefixes.Any(prefix => path.StartsWith(prefix, StringComparison.OrdinalIgnoreCase)))
        {
            var userId = context.User?.FindFirst("sub")?.Value
                      ?? context.User?.FindFirst(ClaimTypes.NameIdentifier)?.Value
                      ?? "anonymous";
            var email  = context.User?.FindFirst(ClaimTypes.Email)?.Value ?? "-";
            var status = context.Response.StatusCode;
            var ip     = context.Connection.RemoteIpAddress?.ToString() ?? "-";

            // Only log successful modifications or any clinical read (PII access)
            bool isModification = method is "POST" or "PUT" or "DELETE" or "PATCH";
            bool isSuccess = status >= 200 && status < 300;

            if (isSuccess || isModification)
            {
                var audit = new AuditLog
                {
                    UserId = userId,
                    UserEmail = email,
                    Action = $"{method} {path}",
                    ResourceType = GetResourceType(path),
                    ResourceId = GetResourceId(path),
                    StatusCode = status,
                    IpAddress = ip,
                    Timestamp = DateTime.UtcNow
                };

                try
                {
                    db.AuditLogs.Add(audit);
                    await db.SaveChangesAsync();
                    
                    _logger.LogInformation(
                        "[AUDIT] {Action} | User: {Email} | Status: {Status} | IP: {IP}",
                        audit.Action, email, status, ip);
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "Failed to persist audit log to database.");
                }
            }
        }
    }

    private string GetResourceType(string path)
    {
        var segments = path.Split('/', StringSplitOptions.RemoveEmptyEntries);
        if (segments.Length >= 2) return segments[1]; // e.g. api/patients -> patients
        return "Unknown";
    }

    private string GetResourceId(string path)
    {
        var segments = path.Split('/', StringSplitOptions.RemoveEmptyEntries);
        foreach (var seq in segments)
        {
            if (Guid.TryParse(seq, out _)) return seq;
        }
        return "N/A";
    }
}
