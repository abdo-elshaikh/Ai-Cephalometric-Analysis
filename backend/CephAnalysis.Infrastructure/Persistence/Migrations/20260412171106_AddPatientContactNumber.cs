using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CephAnalysis.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddPatientContactNumber : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "ContactNumber",
                table: "Patients",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "UploadedAt",
                table: "Patients",
                type: "timestamp with time zone",
                nullable: false,
                defaultValue: new DateTime(1, 1, 1, 0, 0, 0, 0, DateTimeKind.Unspecified));

            migrationBuilder.AddColumn<decimal>(
                name: "NormMean",
                table: "Measurements",
                type: "numeric",
                nullable: false,
                defaultValue: 0m);

            migrationBuilder.AddColumn<decimal>(
                name: "NormSD",
                table: "Measurements",
                type: "numeric",
                nullable: false,
                defaultValue: 0m);

            migrationBuilder.AddColumn<int>(
                name: "Severity",
                table: "Measurements",
                type: "integer",
                nullable: false,
                defaultValue: 0);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "ContactNumber",
                table: "Patients");

            migrationBuilder.DropColumn(
                name: "UploadedAt",
                table: "Patients");

            migrationBuilder.DropColumn(
                name: "NormMean",
                table: "Measurements");

            migrationBuilder.DropColumn(
                name: "NormSD",
                table: "Measurements");

            migrationBuilder.DropColumn(
                name: "Severity",
                table: "Measurements");
        }
    }
}
