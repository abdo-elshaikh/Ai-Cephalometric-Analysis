using CephAnalysis.Application.Interfaces;
using Microsoft.Extensions.Caching.Memory;
using StackExchange.Redis;

namespace CephAnalysis.Infrastructure.Services;

/// <summary>
/// Uses Redis when available, otherwise falls back to in-memory cache.
/// This keeps local dev usable when Redis isn't running.
/// </summary>
public sealed class ResilientCacheService : ICacheService
{
    private readonly IMemoryCache _memory;
    private readonly IConnectionMultiplexer? _redis;
    private readonly RedisCacheService? _redisCache;

    public ResilientCacheService(IMemoryCache memory, IConnectionMultiplexer? redis = null)
    {
        _memory = memory;
        _redis = redis;
        if (redis is not null)
            _redisCache = new RedisCacheService(redis);
    }

    public async Task<T?> GetAsync<T>(string key, CancellationToken ct = default)
    {
        if (_redisCache is not null && _redis is not null && _redis.IsConnected)
        {
            try { return await _redisCache.GetAsync<T>(key, ct); }
            catch { /* fall back */ }
        }

        return _memory.TryGetValue(key, out T? value) ? value : default;
    }

    public async Task SetAsync<T>(string key, T value, TimeSpan? expiry = null, CancellationToken ct = default)
    {
        if (_redisCache is not null && _redis is not null && _redis.IsConnected)
        {
            try
            {
                await _redisCache.SetAsync(key, value, expiry, ct);
                return;
            }
            catch { /* fall back */ }
        }

        _memory.Set(key, value, expiry ?? TimeSpan.FromMinutes(30));
    }

    public async Task RemoveAsync(string key, CancellationToken ct = default)
    {
        if (_redisCache is not null && _redis is not null && _redis.IsConnected)
        {
            try
            {
                await _redisCache.RemoveAsync(key, ct);
                return;
            }
            catch { /* fall back */ }
        }

        _memory.Remove(key);
    }

    public async Task<bool> ExistsAsync(string key, CancellationToken ct = default)
    {
        if (_redisCache is not null && _redis is not null && _redis.IsConnected)
        {
            try { return await _redisCache.ExistsAsync(key, ct); }
            catch { /* fall back */ }
        }

        return _memory.TryGetValue(key, out _);
    }
}

