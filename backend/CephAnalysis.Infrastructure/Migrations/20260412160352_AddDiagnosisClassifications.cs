using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CephAnalysis.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddDiagnosisClassifications : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "OverbiteClassification",
                table: "Diagnoses",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "OverjetClassification",
                table: "Diagnoses",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "SoftTissueProfile",
                table: "Diagnoses",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<string>(
                name: "WarningsJson",
                table: "Diagnoses",
                type: "text",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "OverbiteClassification",
                table: "Diagnoses");

            migrationBuilder.DropColumn(
                name: "OverjetClassification",
                table: "Diagnoses");

            migrationBuilder.DropColumn(
                name: "SoftTissueProfile",
                table: "Diagnoses");

            migrationBuilder.DropColumn(
                name: "WarningsJson",
                table: "Diagnoses");
        }
    }
}
