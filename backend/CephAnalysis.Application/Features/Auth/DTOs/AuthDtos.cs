namespace CephAnalysis.Application.Features.Auth.DTOs;

public record RegisterRequest(
    string Email,
    string Password,
    string FullName,
    string? Specialty = null
);

public record LoginRequest(
    string Email,
    string Password
);

public record RefreshTokenRequest(
    string RefreshToken
);

public record AuthResponse(
    string AccessToken,
    string RefreshToken,
    DateTime ExpiresAt,
    UserDto User
);

public record UserDto(
    Guid Id,
    string Email,
    string FullName,
    string Role,
    string? Specialty,
    string? ProfileImageUrl
);
