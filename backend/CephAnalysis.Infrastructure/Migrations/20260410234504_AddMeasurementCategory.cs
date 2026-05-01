using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CephAnalysis.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddMeasurementCategory : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "Category",
                table: "Measurements",
                type: "integer",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "Category",
                table: "Measurements");
        }
    }
}
