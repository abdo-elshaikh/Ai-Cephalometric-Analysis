namespace CephAnalysis.Application.Interfaces;

public interface ITokenService
{
    string GenerateAccessToken(Guid userId, string email, string role);
    string GenerateRefreshToken();
    Guid? ValidateAccessToken(string token);
}
