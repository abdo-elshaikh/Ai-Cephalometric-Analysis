using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CephAnalysis.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddDiagnosisExtendedFields : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "EvidenceLevel",
                table: "TreatmentPlans",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "RetentionRecommendation",
                table: "TreatmentPlans",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ApdiClassification",
                table: "Diagnoses",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string[]>(
                name: "ClinicalNotes",
                table: "Diagnoses",
                type: "text[]",
                nullable: false,
                defaultValue: new string[0]);

            migrationBuilder.AddColumn<decimal>(
                name: "CorrectedAnb",
                table: "Diagnoses",
                type: "numeric",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "OdiClassification",
                table: "Diagnoses",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "SkeletalType",
                table: "Diagnoses",
                type: "text",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "EvidenceLevel",
                table: "TreatmentPlans");

            migrationBuilder.DropColumn(
                name: "RetentionRecommendation",
                table: "TreatmentPlans");

            migrationBuilder.DropColumn(
                name: "ApdiClassification",
                table: "Diagnoses");

            migrationBuilder.DropColumn(
                name: "ClinicalNotes",
                table: "Diagnoses");

            migrationBuilder.DropColumn(
                name: "CorrectedAnb",
                table: "Diagnoses");

            migrationBuilder.DropColumn(
                name: "OdiClassification",
                table: "Diagnoses");

            migrationBuilder.DropColumn(
                name: "SkeletalType",
                table: "Diagnoses");
        }
    }
}
