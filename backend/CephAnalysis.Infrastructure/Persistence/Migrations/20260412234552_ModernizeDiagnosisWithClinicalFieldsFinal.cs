using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CephAnalysis.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class ModernizeDiagnosisWithClinicalFieldsFinal : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "EvidenceReference",
                table: "TreatmentPlans",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "ExpectedError",
                table: "Measurements",
                type: "numeric",
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "ExpectedErrorMm",
                table: "Landmarks",
                type: "numeric",
                nullable: false,
                defaultValue: 0m);

            migrationBuilder.AlterColumn<string>(
                name: "SoftTissueProfile",
                table: "Diagnoses",
                type: "text",
                nullable: false,
                oldClrType: typeof(int),
                oldType: "integer");

            migrationBuilder.AlterColumn<string>(
                name: "OverjetClassification",
                table: "Diagnoses",
                type: "text",
                nullable: true,
                oldClrType: typeof(int),
                oldType: "integer",
                oldNullable: true);

            migrationBuilder.AlterColumn<string>(
                name: "OverbiteClassification",
                table: "Diagnoses",
                type: "text",
                nullable: true,
                oldClrType: typeof(int),
                oldType: "integer",
                oldNullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "AnbRotationCorrected",
                table: "Diagnoses",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<decimal>(
                name: "AnbUsed",
                table: "Diagnoses",
                type: "numeric(6,2)",
                precision: 6,
                scale: 2,
                nullable: false,
                defaultValue: 0m);

            migrationBuilder.AddColumn<string>(
                name: "BoltonResult_AnteriorFinding",
                table: "Diagnoses",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "BoltonResult_AnteriorRatio",
                table: "Diagnoses",
                type: "numeric(6,2)",
                precision: 6,
                scale: 2,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "BoltonResult_OverallFinding",
                table: "Diagnoses",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "BoltonResult_OverallRatio",
                table: "Diagnoses",
                type: "numeric(6,2)",
                precision: 6,
                scale: 2,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "GrowthTendency",
                table: "Diagnoses",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "OdiNote",
                table: "Diagnoses",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "SkeletalBorderline",
                table: "Diagnoses",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<string>(
                name: "SkeletalDifferential",
                table: "Diagnoses",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "LandmarkMeta",
                table: "AnalysisSessions",
                type: "text",
                nullable: false,
                defaultValue: "");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "EvidenceReference",
                table: "TreatmentPlans");

            migrationBuilder.DropColumn(
                name: "ExpectedError",
                table: "Measurements");

            migrationBuilder.DropColumn(
                name: "ExpectedErrorMm",
                table: "Landmarks");

            migrationBuilder.DropColumn(
                name: "AnbRotationCorrected",
                table: "Diagnoses");

            migrationBuilder.DropColumn(
                name: "AnbUsed",
                table: "Diagnoses");

            migrationBuilder.DropColumn(
                name: "BoltonResult_AnteriorFinding",
                table: "Diagnoses");

            migrationBuilder.DropColumn(
                name: "BoltonResult_AnteriorRatio",
                table: "Diagnoses");

            migrationBuilder.DropColumn(
                name: "BoltonResult_OverallFinding",
                table: "Diagnoses");

            migrationBuilder.DropColumn(
                name: "BoltonResult_OverallRatio",
                table: "Diagnoses");

            migrationBuilder.DropColumn(
                name: "GrowthTendency",
                table: "Diagnoses");

            migrationBuilder.DropColumn(
                name: "OdiNote",
                table: "Diagnoses");

            migrationBuilder.DropColumn(
                name: "SkeletalBorderline",
                table: "Diagnoses");

            migrationBuilder.DropColumn(
                name: "SkeletalDifferential",
                table: "Diagnoses");

            migrationBuilder.DropColumn(
                name: "LandmarkMeta",
                table: "AnalysisSessions");

            migrationBuilder.AlterColumn<int>(
                name: "SoftTissueProfile",
                table: "Diagnoses",
                type: "integer",
                nullable: false,
                oldClrType: typeof(string),
                oldType: "text");

            migrationBuilder.AlterColumn<int>(
                name: "OverjetClassification",
                table: "Diagnoses",
                type: "integer",
                nullable: true,
                oldClrType: typeof(string),
                oldType: "text",
                oldNullable: true);

            migrationBuilder.AlterColumn<int>(
                name: "OverbiteClassification",
                table: "Diagnoses",
                type: "integer",
                nullable: true,
                oldClrType: typeof(string),
                oldType: "text",
                oldNullable: true);
        }
    }
}
