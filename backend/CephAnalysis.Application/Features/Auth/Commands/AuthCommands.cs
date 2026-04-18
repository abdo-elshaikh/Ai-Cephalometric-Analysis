using CephAnalysis.Application.Features.Auth.DTOs;
using CephAnalysis.Application.Interfaces;
using CephAnalysis.Domain.Entities;
using CephAnalysis.Domain.Enums;
using CephAnalysis.Shared.Common;
using MediatR;
using Microsoft.EntityFrameworkCore;
using BC = BCrypt.Net.BCrypt;

namespace CephAnalysis.Application.Features.Auth.Commands;

// ── Register ────────────────────────────────────────────────────────────────

public record RegisterCommand(RegisterRequest Request) : IRequest<Result<AuthResponse>>;

public class RegisterHandler : IRequestHandler<RegisterCommand, Result<AuthResponse>>
{
    private readonly IApplicationDbContext _db;
    private readonly ITokenService _tokens;

    public RegisterHandler(IApplicationDbContext db, ITokenService tokens)
    {
        _db = db;
        _tokens = tokens;
    }

    public async Task<Result<AuthResponse>> Handle(RegisterCommand cmd, CancellationToken ct)
    {
        var req = cmd.Request;

        if (await _db.Users.AnyAsync(u => u.Email == req.Email, ct))
            return Result<AuthResponse>.Failure("Email is already registered.", 409);

        var refreshToken = _tokens.GenerateRefreshToken();
        var refreshDays  = 7;
        var user = new User
        {
            Email        = req.Email.ToLowerInvariant(),
            PasswordHash = BC.HashPassword(req.Password),
            FullName     = req.FullName,
            Specialty    = req.Specialty,
            Role         = UserRole.Doctor,
            RefreshToken = refreshToken,
            RefreshTokenExpiry = DateTime.UtcNow.AddDays(refreshDays),
        };

        _db.Users.Add(user);
        await _db.SaveChangesAsync(ct);

        var accessToken = _tokens.GenerateAccessToken(user.Id, user.Email, user.Role.ToString());
        var expiresAt   = DateTime.UtcNow.AddMinutes(15);

        return Result<AuthResponse>.Success(new AuthResponse(
            AccessToken:  accessToken,
            RefreshToken: refreshToken,
            ExpiresAt:    expiresAt,
            User:         MapUser(user)
        ), 201);
    }

    private static UserDto MapUser(User u) => new(u.Id, u.Email, u.FullName, u.Role.ToString(), u.Specialty, u.ProfileImageUrl);
}

// ── Login ────────────────────────────────────────────────────────────────────

public record LoginCommand(LoginRequest Request) : IRequest<Result<AuthResponse>>;

public class LoginHandler : IRequestHandler<LoginCommand, Result<AuthResponse>>
{
    private readonly IApplicationDbContext _db;
    private readonly ITokenService _tokens;

    public LoginHandler(IApplicationDbContext db, ITokenService tokens) { _db = db; _tokens = tokens; }

    public async Task<Result<AuthResponse>> Handle(LoginCommand cmd, CancellationToken ct)
    {
        var user = await _db.Users
            .FirstOrDefaultAsync(u => u.Email == cmd.Request.Email.ToLowerInvariant(), ct);

        if (user is null || !BC.Verify(cmd.Request.Password, user.PasswordHash))
            return Result<AuthResponse>.Failure("Invalid email or password.", 401);

        if (!user.IsActive)
            return Result<AuthResponse>.Failure("Account is disabled. Contact your administrator.", 403);

        var refreshToken = _tokens.GenerateRefreshToken();
        user.RefreshToken       = refreshToken;
        user.RefreshTokenExpiry = DateTime.UtcNow.AddDays(7);
        user.LastLoginAt        = DateTime.UtcNow;
        user.UpdatedAt          = DateTime.UtcNow;
        await _db.SaveChangesAsync(ct);

        var accessToken = _tokens.GenerateAccessToken(user.Id, user.Email, user.Role.ToString());

        return Result<AuthResponse>.Success(new AuthResponse(
            AccessToken:  accessToken,
            RefreshToken: refreshToken,
            ExpiresAt:    DateTime.UtcNow.AddMinutes(15),
            User:         new(user.Id, user.Email, user.FullName, user.Role.ToString(), user.Specialty, user.ProfileImageUrl)
        ));
    }
}

// ── Refresh Token ────────────────────────────────────────────────────────────

public record RefreshTokenCommand(string RefreshToken) : IRequest<Result<AuthResponse>>;

public class RefreshTokenHandler : IRequestHandler<RefreshTokenCommand, Result<AuthResponse>>
{
    private readonly IApplicationDbContext _db;
    private readonly ITokenService _tokens;

    public RefreshTokenHandler(IApplicationDbContext db, ITokenService tokens) { _db = db; _tokens = tokens; }

    public async Task<Result<AuthResponse>> Handle(RefreshTokenCommand cmd, CancellationToken ct)
    {
        var user = await _db.Users
            .FirstOrDefaultAsync(u => u.RefreshToken == cmd.RefreshToken, ct);

        if (user is null || user.RefreshTokenExpiry < DateTime.UtcNow)
            return Result<AuthResponse>.Unauthorized("Invalid or expired refresh token.");

        var newRefresh = _tokens.GenerateRefreshToken();
        user.RefreshToken       = newRefresh;
        user.RefreshTokenExpiry = DateTime.UtcNow.AddDays(7);
        user.UpdatedAt          = DateTime.UtcNow;
        await _db.SaveChangesAsync(ct);

        var accessToken = _tokens.GenerateAccessToken(user.Id, user.Email, user.Role.ToString());

        return Result<AuthResponse>.Success(new AuthResponse(
            AccessToken:  accessToken,
            RefreshToken: newRefresh,
            ExpiresAt:    DateTime.UtcNow.AddMinutes(15),
            User:         new(user.Id, user.Email, user.FullName, user.Role.ToString(), user.Specialty, user.ProfileImageUrl)
        ));
    }
}

// ── Logout ───────────────────────────────────────────────────────────────────

public record LogoutCommand(Guid UserId) : IRequest<Result>;

public class LogoutHandler : IRequestHandler<LogoutCommand, Result>
{
    private readonly IApplicationDbContext _db;

    public LogoutHandler(IApplicationDbContext db) { _db = db; }

    public async Task<Result> Handle(LogoutCommand cmd, CancellationToken ct)
    {
        var user = await _db.Users.FindAsync([cmd.UserId], ct);
        if (user is null) return Result.NotFound();

        user.RefreshToken       = null;
        user.RefreshTokenExpiry = null;
        user.UpdatedAt          = DateTime.UtcNow;
        await _db.SaveChangesAsync(ct);

        return Result.Success(204);
    }
}
