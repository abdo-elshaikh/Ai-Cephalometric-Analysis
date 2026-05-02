using CephAnalysis.API.Middleware;
using CephAnalysis.Application.Features.Auth.Commands;
using CephAnalysis.Infrastructure;
using CephAnalysis.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.ResponseCompression;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using Microsoft.OpenApi.Models;
using Serilog;
using System.Diagnostics;
using System.IO.Compression;
using System.Text;
using System.Threading.RateLimiting;
using FluentValidation;
using Microsoft.Extensions.FileProviders;

var builder = WebApplication.CreateBuilder(args);

QuestPDF.Settings.License = QuestPDF.Infrastructure.LicenseType.Community;

// ─── Serilog ────────────────────────────────────────────────────────────────
Log.Logger = new LoggerConfiguration()
    .ReadFrom.Configuration(builder.Configuration)
    .Enrich.FromLogContext()
    .Enrich.WithProperty("Service", "CephAnalysis.API")
    .WriteTo.Console(outputTemplate:
        "[{Timestamp:HH:mm:ss} {Level:u3}] {Message:lj} {Properties:j}{NewLine}{Exception}")
    .WriteTo.File("logs/ceph-.log", rollingInterval: RollingInterval.Day,
        retainedFileCountLimit: 14)
    .CreateLogger();
builder.Host.UseSerilog();

// ─── Response Compression (Brotli + Gzip) ────────────────────────────────────
// Reduces JSON payload size by 60-80 % on API responses — highest-impact perf win.
builder.Services.AddResponseCompression(opts =>
{
    opts.EnableForHttps = true;
    opts.Providers.Add<BrotliCompressionProvider>();
    opts.Providers.Add<GzipCompressionProvider>();
    opts.MimeTypes = ResponseCompressionDefaults.MimeTypes.Concat([
        "application/json",
        "application/problem+json",
        "application/json+problem",
    ]);
});
builder.Services.Configure<BrotliCompressionProviderOptions>(opts =>
    opts.Level = CompressionLevel.Fastest);          // ~80 % of max savings, ~3× faster
builder.Services.Configure<GzipCompressionProviderOptions>(opts =>
    opts.Level = CompressionLevel.Optimal);          // Fallback for clients w/o Brotli

// ─── Output Caching ──────────────────────────────────────────────────────────
// Dashboard stats are read-heavy and safe to serve stale for 30 s per user.
builder.Services.AddOutputCache(opts =>
{
    opts.AddPolicy("stats-30s", p => p
        .Expire(TimeSpan.FromSeconds(30))
        .SetVaryByRouteValue("userId")
        .Tag("dashboard-stats"));

    opts.AddPolicy("norms-10m", p => p
        .Expire(TimeSpan.FromMinutes(10))
        .Tag("ai-norms"));
});

// ─── Infrastructure (DB, Redis, Storage, Token) ──────────────────────────────
builder.Services.AddInfrastructure(builder.Configuration);

// ─── MediatR ─────────────────────────────────────────────────────────────────
builder.Services.AddMediatR(cfg =>
    cfg.RegisterServicesFromAssembly(typeof(RegisterCommand).Assembly));

// ─── FluentValidation ────────────────────────────────────────────────────────
builder.Services.AddValidatorsFromAssembly(typeof(RegisterCommand).Assembly);

// ─── JWT Authentication ───────────────────────────────────────────────────────
var jwtKey      = builder.Configuration["Jwt:SecretKey"]
    ?? throw new InvalidOperationException("Jwt:SecretKey is required");
var jwtIssuer   = builder.Configuration["Jwt:Issuer"]   ?? "CephAnalysis";
var jwtAudience = builder.Configuration["Jwt:Audience"] ?? "CephAnalysis.Client";

builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(opt =>
    {
        opt.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuerSigningKey = true,
            IssuerSigningKey        = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtKey)),
            ValidateIssuer          = true,
            ValidIssuer             = jwtIssuer,
            ValidateAudience        = true,
            ValidAudience           = jwtAudience,
            ValidateLifetime        = true,
            ClockSkew               = TimeSpan.FromSeconds(30),
        };
        opt.Events = new JwtBearerEvents
        {
            OnAuthenticationFailed = ctx =>
            {
                Log.Warning("JWT auth failed: {Message}", ctx.Exception.Message);
                return Task.CompletedTask;
            },
        };
    });

builder.Services.AddAuthorization(opt =>
{
    opt.AddPolicy("AdminOnly",  p => p.RequireRole("Admin"));
    opt.AddPolicy("DoctorOnly", p => p.RequireRole("Admin", "Doctor"));
    opt.AddPolicy("Viewer",     p => p.RequireRole("Admin", "Doctor", "Viewer"));
});

// ─── Rate Limiting ────────────────────────────────────────────────────────────
var rateLimit = int.Parse(builder.Configuration["RateLimiting:RequestsPerMinute"] ?? "120");
builder.Services.AddRateLimiter(opt =>
{
    opt.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    opt.OnRejected = async (ctx, _) =>
    {
        ctx.HttpContext.Response.Headers["Retry-After"] = "60";
        await ctx.HttpContext.Response.WriteAsJsonAsync(new
        {
            error   = "Rate limit exceeded. Please wait before retrying.",
            retryIn = "60s",
        });
    };
    opt.AddPolicy("PerUser", context =>
    {
        var userId = context.User?.FindFirst("sub")?.Value
                     ?? context.Connection.RemoteIpAddress?.ToString()
                     ?? "anonymous";
        return RateLimitPartition.GetFixedWindowLimiter(userId, _ => new FixedWindowRateLimiterOptions
        {
            PermitLimit          = rateLimit,
            Window               = TimeSpan.FromMinutes(1),
            QueueProcessingOrder = QueueProcessingOrder.OldestFirst,
            QueueLimit           = 8,
        });
    });
    // Looser limiter for read-only endpoints
    opt.AddPolicy("ReadOnly", context =>
    {
        var userId = context.User?.FindFirst("sub")?.Value
                     ?? context.Connection.RemoteIpAddress?.ToString()
                     ?? "anonymous";
        return RateLimitPartition.GetFixedWindowLimiter($"ro:{userId}", _ => new FixedWindowRateLimiterOptions
        {
            PermitLimit          = rateLimit * 3,
            Window               = TimeSpan.FromMinutes(1),
            QueueProcessingOrder = QueueProcessingOrder.OldestFirst,
            QueueLimit           = 20,
        });
    });
});

// ─── CORS ─────────────────────────────────────────────────────────────────────
var allowedOrigins = builder.Configuration.GetSection("Cors:AllowedOrigins").Get<string[]>()
    ?? ["http://localhost:5173", "http://localhost:5000", "http://localhost:3000"];

builder.Services.AddCors(opt => opt.AddDefaultPolicy(policy =>
    policy.WithOrigins(allowedOrigins)
          .AllowAnyHeader()
          .AllowAnyMethod()
          .AllowCredentials()
          .WithExposedHeaders("X-Request-ID", "X-RateLimit-Remaining")));

// ─── Swagger ──────────────────────────────────────────────────────────────────
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen(c =>
{
    c.SwaggerDoc("v1", new()
    {
        Title       = "CephAnalysis API",
        Version     = "v2",
        Description = "AI-Based Cephalometric Analysis & Treatment Planning System — CephAI v2.2",
    });
    c.AddSecurityDefinition("Bearer", new OpenApiSecurityScheme
    {
        Name        = "Authorization",
        Type        = SecuritySchemeType.Http,
        Scheme      = "bearer",
        BearerFormat= "JWT",
        In          = ParameterLocation.Header,
        Description = "Enter: Bearer {token}",
    });
    c.AddSecurityRequirement(new OpenApiSecurityRequirement
    {
        {
            new OpenApiSecurityScheme
            {
                Reference = new OpenApiReference { Type = ReferenceType.SecurityScheme, Id = "Bearer" }
            },
            []
        }
    });
});

builder.Services.AddControllers(opts =>
{
    // Return 406 for unsupported Accept headers instead of falling back silently
    opts.RespectBrowserAcceptHeader = true;
    opts.ReturnHttpNotAcceptable    = true;
});

var app = builder.Build();

// ─── Dev: Auto-migrate & Seed ─────────────────────────────────────────────────
if (app.Environment.IsDevelopment())
{
    try
    {
        using var scope = app.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        db.Database.Migrate();
        Log.Information("Database migration applied successfully");
        await DataSeeder.SeedAsync(db);
        Log.Information("Database seeding completed");
    }
    catch (Exception ex)
    {
        Log.Warning("Database migration/seed skipped: {Message}", ex.Message);
    }
}

// ─── Middleware pipeline (order matters) ──────────────────────────────────────
app.UseResponseCompression();                             // Must be first — wraps response stream
app.UseMiddleware<GlobalExceptionMiddleware>();
app.UseSwagger();
app.UseSwaggerUI(c =>
{
    c.SwaggerEndpoint("/swagger/v1/swagger.json", "CephAnalysis API v2");
    c.RoutePrefix = "swagger";
    c.DisplayRequestDuration();
    c.EnableDeepLinking();
});

app.UseSerilogRequestLogging(opts =>
{
    opts.EnrichDiagnosticContext = (diag, ctx) =>
    {
        diag.Set("RequestHost",   ctx.Request.Host.Value);
        diag.Set("RequestScheme", ctx.Request.Scheme);
        if (ctx.Items.TryGetValue("RequestId", out var rid))
            diag.Set("RequestId", rid);
    };
});

app.UseMiddleware<SecurityHeadersMiddleware>();
app.UseCors();

// Static file serving for uploads (dev only)
var uploadsRoot = Path.Combine(app.Environment.ContentRootPath, "uploads");
Directory.CreateDirectory(uploadsRoot);
app.UseStaticFiles(new StaticFileOptions
{
    FileProvider  = new PhysicalFileProvider(uploadsRoot),
    RequestPath   = "/uploads",
    OnPrepareResponse = ctx =>
    {
        // Cache uploaded images for 1 hour (immutable binary data)
        ctx.Context.Response.Headers["Cache-Control"] = "public, max-age=3600, immutable";
    },
});

app.UseOutputCache();
app.UseRateLimiter();
app.UseAuthentication();
app.UseMiddleware<CurrentUserMiddleware>();
app.UseAuthorization();
app.UseMiddleware<AuditLoggingMiddleware>();
app.MapControllers();

// ── Health probe ──────────────────────────────────────────────────────────────
var startupTime = Stopwatch.GetTimestamp();
app.MapGet("/health", () =>
{
    var uptime = Stopwatch.GetElapsedTime(startupTime);
    return Results.Ok(new
    {
        status  = "healthy",
        service = "CephAnalysis API",
        version = "2.2.0",
        uptime  = $"{uptime.TotalMinutes:F1}m",
        utc     = DateTime.UtcNow,
    });
}).AllowAnonymous().CacheOutput("norms-10m");

app.Run();

public partial class Program { }
