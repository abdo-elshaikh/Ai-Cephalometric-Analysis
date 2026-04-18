using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;
using Microsoft.Extensions.Configuration;
using System.IO;

namespace CephAnalysis.Infrastructure.Persistence;

public class ApplicationDbContextFactory : IDesignTimeDbContextFactory<ApplicationDbContext>
{
    public ApplicationDbContext CreateDbContext(string[] args)
    {
        // When running "dotnet ef migrations add InitialCreate --project src/CephAnalysis.Infrastructure/ --startup-project src/CephAnalysis.API/"
        // The base path might be the API folder or Infrastructure folder.
        // We'll point it directly to the API's appsettings.Development.json or appsettings.json.
        var basePath = Path.Combine(Directory.GetCurrentDirectory(), "..", "CephAnalysis.API");
        if (!Directory.Exists(basePath))
            basePath = Directory.GetCurrentDirectory(); // Fallback if already in API dir

        var configuration = new ConfigurationBuilder()
            .SetBasePath(basePath)
            .AddJsonFile("appsettings.json", optional: true)
            .AddJsonFile("appsettings.Development.json", optional: true)
            .AddEnvironmentVariables()
            .Build();

        var optionsBuilder = new DbContextOptionsBuilder<ApplicationDbContext>();
        var connectionString = configuration.GetConnectionString("DefaultConnection") 
                            ?? "Host=localhost;Port=5432;Database=cephanalysis_db;Username=ceph_user;Password=ceph_password";

        optionsBuilder.UseNpgsql(connectionString, b => 
            b.MigrationsAssembly(typeof(ApplicationDbContext).Assembly.FullName));

        return new ApplicationDbContext(optionsBuilder.Options);
    }
}
