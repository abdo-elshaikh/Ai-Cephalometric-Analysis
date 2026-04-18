using CephAnalysis.Application.Features.Auth.Commands;
using CephAnalysis.Application.Features.Auth.DTOs;
using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Security.Claims;

namespace CephAnalysis.API.Controllers;

[ApiController]
[Route("api/auth")]
public class AuthController : ControllerBase
{
    private readonly IMediator _mediator;

    public AuthController(IMediator mediator) => _mediator = mediator;

    /// <summary>Register a new doctor account</summary>
    [HttpPost("register")]
    [AllowAnonymous]
    public async Task<IActionResult> Register([FromBody] RegisterRequest request, CancellationToken ct)
    {
        var result = await _mediator.Send(new RegisterCommand(request), ct);
        return result.IsSuccess
            ? StatusCode(201, result.Data)
            : StatusCode(result.StatusCode, new { error = result.Error });
    }

    /// <summary>Authenticate and receive JWT tokens</summary>
    [HttpPost("login")]
    [AllowAnonymous]
    public async Task<IActionResult> Login([FromBody] LoginRequest request, CancellationToken ct)
    {
        var result = await _mediator.Send(new LoginCommand(request), ct);
        return result.IsSuccess
            ? Ok(result.Data)
            : StatusCode(result.StatusCode, new { error = result.Error });
    }

    /// <summary>Refresh access token using refresh token</summary>
    [HttpPost("refresh")]
    [AllowAnonymous]
    public async Task<IActionResult> Refresh([FromBody] RefreshTokenRequest request, CancellationToken ct)
    {
        var result = await _mediator.Send(new RefreshTokenCommand(request.RefreshToken), ct);
        return result.IsSuccess
            ? Ok(result.Data)
            : StatusCode(result.StatusCode, new { error = result.Error });
    }

    /// <summary>Invalidate refresh token (logout)</summary>
    [HttpPost("logout")]
    [Authorize]
    public async Task<IActionResult> Logout(CancellationToken ct)
    {
        var userIdStr = User.FindFirst(ClaimTypes.NameIdentifier)?.Value
                     ?? User.FindFirst("sub")?.Value;

        if (!Guid.TryParse(userIdStr, out var userId))
            return Unauthorized(new { error = "Invalid token claims" });

        var result = await _mediator.Send(new LogoutCommand(userId), ct);
        return result.IsSuccess
            ? NoContent()
            : StatusCode(result.StatusCode, new { error = result.Error });
    }

    /// <summary>Get current user profile</summary>
    [HttpGet("me")]
    [Authorize]
    public IActionResult Me()
    {
        var userId = User.FindFirst("sub")?.Value;
        var email  = User.FindFirst(ClaimTypes.Email)?.Value;
        var role   = User.FindFirst(ClaimTypes.Role)?.Value;
        return Ok(new { userId, email, role });
    }
}
