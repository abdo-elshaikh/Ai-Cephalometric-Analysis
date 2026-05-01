using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CephAnalysis.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddOverlayImagesJson : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "XNorm",
                table: "Landmarks");

            migrationBuilder.DropColumn(
                name: "YNorm",
                table: "Landmarks");

            migrationBuilder.AddColumn<decimal>(
                name: "XPx",
                table: "Landmarks",
                type: "numeric(10,4)",
                precision: 10,
                scale: 4,
                nullable: false,
                defaultValue: 0m);

            migrationBuilder.AddColumn<decimal>(
                name: "YPx",
                table: "Landmarks",
                type: "numeric(10,4)",
                precision: 10,
                scale: 4,
                nullable: false,
                defaultValue: 0m);

            migrationBuilder.AddColumn<string>(
                name: "OverlayImagesJson",
                table: "AnalysisSessions",
                type: "text",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "XPx",
                table: "Landmarks");

            migrationBuilder.DropColumn(
                name: "YPx",
                table: "Landmarks");

            migrationBuilder.DropColumn(
                name: "OverlayImagesJson",
                table: "AnalysisSessions");

            migrationBuilder.AddColumn<decimal>(
                name: "XNorm",
                table: "Landmarks",
                type: "numeric(10,8)",
                precision: 10,
                scale: 8,
                nullable: false,
                defaultValue: 0m);

            migrationBuilder.AddColumn<decimal>(
                name: "YNorm",
                table: "Landmarks",
                type: "numeric(10,8)",
                precision: 10,
                scale: 8,
                nullable: false,
                defaultValue: 0m);
        }
    }
}
