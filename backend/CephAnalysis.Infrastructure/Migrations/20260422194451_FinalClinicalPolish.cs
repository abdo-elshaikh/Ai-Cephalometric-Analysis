using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CephAnalysis.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class FinalClinicalPolish : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_Patients_MedicalRecordNo",
                table: "Patients");

            migrationBuilder.DropColumn(
                name: "IsDeleted",
                table: "Patients");

            migrationBuilder.CreateIndex(
                name: "IX_Patients_MedicalRecordNo",
                table: "Patients",
                column: "MedicalRecordNo",
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_Patients_MedicalRecordNo",
                table: "Patients");

            migrationBuilder.AddColumn<bool>(
                name: "IsDeleted",
                table: "Patients",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.CreateIndex(
                name: "IX_Patients_MedicalRecordNo",
                table: "Patients",
                column: "MedicalRecordNo",
                unique: true,
                filter: "\"MedicalRecordNo\" IS NOT NULL");
        }
    }
}
