using CephAnalysis.API.Middleware;
using CephAnalysis.Application.Features.Auth.Commands;
using CephAnalysis.Infrastructure;
using CephAnalysis.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using Microsoft.OpenApi.Models;
using Serilog;
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
    .WriteTo.Console()
    .WriteTo.File("logs/ceph-.log", rollingInterval: RollingInterval.Day)
    .CreateLogger();
builder.Host.UseSerilog();

// ─── Infrastructure (DB, Redis, Storage, Token) ──────────────────────────────
builder.Services.AddInfrastructure(builder.Configuration);

// ─── MediatR (scans Application assembly) ───────────────────────────────────
builder.Services.AddMediatR(cfg =>
    cfg.RegisterServicesFromAssembly(typeof(RegisterCommand).Assembly));

// ─── FluentValidation ────────────────────────────────────────────────────────
builder.Services.AddValidatorsFromAssembly(typeof(RegisterCommand).Assembly);

// ─── JWT Authentication ───────────────────────────────────────────────────────
var jwtKey     = builder.Configuration["Jwt:SecretKey"]
    ?? throw new InvalidOperationException("Jwt:SecretKey is required");
var jwtIssuer  = builder.Configuration["Jwt:Issuer"] ?? "CephAnalysis";
var jwtAudience= builder.Configuration["Jwt:Audience"] ?? "CephAnalysis.Client";

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
    });

builder.Services.AddAuthorization(opt =>
{
    opt.AddPolicy("AdminOnly",  p => p.RequireRole("Admin"));
    opt.AddPolicy("DoctorOnly", p => p.RequireRole("Admin", "Doctor"));
    opt.AddPolicy("Viewer",     p => p.RequireRole("Admin", "Doctor", "Viewer"));
});

// ─── Rate Limiting ───────────────────────────────────────────────────────────
var rateLimit = int.Parse(builder.Configuration["RateLimiting:RequestsPerMinute"] ?? "100");
builder.Services.AddRateLimiter(opt =>
{
    opt.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    opt.AddPolicy("PerUser", context =>
    {
        var userId = context.User?.FindFirst("sub")?.Value
                     ?? context.Connection.RemoteIpAddress?.ToString()
                     ?? "anonymous";
        return RateLimitPartition.GetFixedWindowLimiter(userId, _ => new FixedWindowRateLimiterOptions
        {
            PermitLimit = rateLimit,
            Window = TimeSpan.FromMinutes(1),
            QueueProcessingOrder = QueueProcessingOrder.OldestFirst,
            QueueLimit = 5
        });
    });
});

// ─── CORS ────────────────────────────────────────────────────────────────────
builder.Services.AddCors(opt => opt.AddDefaultPolicy(policy =>
    policy.WithOrigins("http://localhost:5173", "http://localhost:5000", "http://localhost:3000")
          .AllowAnyHeader()
          .AllowAnyMethod()
          .AllowCredentials()));

// ─── Swagger ─────────────────────────────────────────────────────────────────
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen(c =>
{
    c.SwaggerDoc("v1", new() { Title = "CephAnalysis API", Version = "v1",
        Description = "AI-Based Cephalometric Analysis & Treatment Planning System" });
    c.AddSecurityDefinition("Bearer", new OpenApiSecurityScheme
    {
        Name        = "Authorization",
        Type        = SecuritySchemeType.Http,
        Scheme      = "bearer",
        BearerFormat= "JWT",
        In          = ParameterLocation.Header,
        Description = "Enter JWT token"
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

builder.Services.AddControllers();

var app = builder.Build();

// ─── Dev: Auto-migrate ────────────────────────────────────────────────────────
if (app.Environment.IsDevelopment())
{
    try
    {
        using var scope = app.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        db.Database.Migrate();
        Log.Information("Database migration applied successfully");

        // Seed initial data
        await DataSeeder.SeedAsync(db);
        Log.Information("Database seeding completed");
    }
    catch (Exception ex)
    {
        Log.Warning("Database migration/seed skipped (DB may not be running): {Message}", ex.Message);
    }
}

// ─── Middleware pipeline ──────────────────────────────────────────────────────
app.UseMiddleware<GlobalExceptionMiddleware>();
app.UseSwagger();
app.UseSwaggerUI(c =>
{
    c.SwaggerEndpoint("/swagger/v1/swagger.json", "CephAnalysis API v1");
    c.RoutePrefix = "swagger";
});

app.UseSerilogRequestLogging();
app.UseMiddleware<SecurityHeadersMiddleware>(); // HIPAA: security headers on all responses
app.UseCors();

// Serve uploaded files (local dev storage)
var uploadsRoot = Path.Combine(app.Environment.ContentRootPath, "uploads");
Directory.CreateDirectory(uploadsRoot);
Log.Information("Serving static files from resolved path: {UploadsRoot}", uploadsRoot);
app.UseStaticFiles(new StaticFileOptions
{
    FileProvider = new PhysicalFileProvider(uploadsRoot),
    RequestPath = "/uploads"
});

app.UseRateLimiter();
app.UseAuthentication();
app.UseMiddleware<CurrentUserMiddleware>();
app.UseAuthorization();
app.UseMiddleware<AuditLoggingMiddleware>();
app.MapControllers();

// ── Health probe (lightweight, no auth required) ──────────────────────────────
app.MapGet("/health", () => Results.Ok(new
{
    status  = "healthy",
    service = "CephAnalysis API",
    version = "1.0.0",
    utc     = DateTime.UtcNow,
})).AllowAnonymous();

app.Run();

// ── expose for integration tests ──────────────────────────────────────────────
public partial class Program { }
