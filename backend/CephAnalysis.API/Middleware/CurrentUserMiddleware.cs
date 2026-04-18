using System.Security.Claims;
using Microsoft.AspNetCore.Http;

namespace CephAnalysis.API.Middleware;

/// <summary>
/// Extracts the authenticated user's ID and email from JWT claims
/// and makes them available via HttpContext.Items.
/// </summary>
public class CurrentUserMiddleware
{
    private readonly RequestDelegate _next;

    public CurrentUserMiddleware(RequestDelegate next) => _next = next;

    public async Task InvokeAsync(HttpContext context)
    {
        if (context.User.Identity?.IsAuthenticated == true)
        {
            var userId = context.User.FindFirst("sub")?.Value
                      ?? context.User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
            var email  = context.User.FindFirst(ClaimTypes.Email)?.Value;
            var role   = context.User.FindFirst(ClaimTypes.Role)?.Value;

            context.Items["UserId"] = userId;
            context.Items["Email"]  = email;
            context.Items["Role"]   = role;
        }

        await _next(context);
    }
}
