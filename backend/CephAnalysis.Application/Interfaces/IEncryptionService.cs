namespace CephAnalysis.Application.Interfaces;

/// <summary>
/// HIPAA-compliant encryption service for protecting PII fields at rest.
/// </summary>
public interface IEncryptionService
{
    string Encrypt(string plainText);
    string Decrypt(string cipherText);
}
