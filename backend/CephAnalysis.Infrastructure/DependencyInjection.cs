using CephAnalysis.Application.Interfaces;
using CephAnalysis.Infrastructure.Identity;
using System.Net.Http;
using CephAnalysis.Infrastructure.Persistence;
using CephAnalysis.Infrastructure.Services;
using CephAnalysis.Infrastructure.Storage;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using StackExchange.Redis;

namespace CephAnalysis.Infrastructure;

public static class DependencyInjection
{
    public static IServiceCollection AddInfrastructure(
        this IServiceCollection services,
        IConfiguration configuration)
    {
        // ── Database ───────────────────────────────────────────────────────
        services.AddDbContext<ApplicationDbContext>(opt =>
            opt.UseNpgsql(
                configuration.GetConnectionString("DefaultConnection"),
                npg => npg.MigrationsAssembly(typeof(DependencyInjection).Assembly.FullName)
                          .UseQuerySplittingBehavior(QuerySplittingBehavior.SingleQuery)));

        services.AddScoped<IApplicationDbContext>(provider => provider.GetRequiredService<ApplicationDbContext>());

        // ── Token & Security Services ──────────────────────────────────────
        services.AddScoped<ITokenService, TokenService>();
        services.AddSingleton<IEncryptionService, AesEncryptionService>();

        // ── Redis ──────────────────────────────────────────────────────────
        var redisConn = configuration["Redis:ConnectionString"] ?? "localhost:6379";
        services.AddMemoryCache();
        services.AddSingleton<IConnectionMultiplexer>(_ =>
        {
            // Don't crash app startup when Redis is down (dev convenience).
            // Redis usage will fall back to IMemoryCache when disconnected.
            var options = ConfigurationOptions.Parse(redisConn);
            options.AbortOnConnectFail = false;
            return ConnectionMultiplexer.Connect(options);
        });
        services.AddScoped<ICacheService, ResilientCacheService>();

        // ── Local Storage (dev default) ───────────────────────────────────
        services.AddScoped<IStorageService, LocalStorageService>();

        // ── AI Service ────────────────────────────────────────────────────
        services.AddHttpClient<IAiService, Services.AiService>(client =>
        {
            var baseUrl = configuration["AiService:BaseUrl"] ?? "http://localhost:8000";
            client.BaseAddress = new Uri(baseUrl);
            // 60s: overlay render generates 5 JPEG images, typically 3-8s on CPU
            client.Timeout = TimeSpan.FromSeconds(60);
        });

        // ── Report Generator ──────────────────────────────────────────────
        services.AddScoped<IReportGenerator, QuestPdfReportGenerator>();
        services.AddTransient<IImageOverlayService, SkiaImageOverlayService>();
        services.AddScoped<IMultiOverlayService, AiOverlayService>();

        return services;
    }
}
