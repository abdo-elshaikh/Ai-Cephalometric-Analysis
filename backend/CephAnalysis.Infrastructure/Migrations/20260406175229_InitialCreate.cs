using System;
using System.Text.Json;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CephAnalysis.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class InitialCreate : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "Users",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Email = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: false),
                    PasswordHash = table.Column<string>(type: "character varying(512)", maxLength: 512, nullable: false),
                    FullName = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    Role = table.Column<string>(type: "text", nullable: false, defaultValue: "Doctor"),
                    Specialty = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    ProfileImageUrl = table.Column<string>(type: "text", nullable: true),
                    IsActive = table.Column<bool>(type: "boolean", nullable: false, defaultValue: true),
                    LastLoginAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false, defaultValueSql: "NOW()"),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    RefreshToken = table.Column<string>(type: "text", nullable: true),
                    RefreshTokenExpiry = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Users", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "Patients",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    DoctorId = table.Column<Guid>(type: "uuid", nullable: false),
                    FirstName = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    LastName = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    DateOfBirth = table.Column<DateOnly>(type: "date", nullable: false),
                    Gender = table.Column<string>(type: "text", nullable: false),
                    Phone = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: true),
                    Email = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: true),
                    MedicalRecordNo = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    Notes = table.Column<string>(type: "text", nullable: true),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false, defaultValueSql: "NOW()"),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Patients", x => x.Id);
                    table.ForeignKey(
                        name: "FK_Patients_Users_DoctorId",
                        column: x => x.DoctorId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "Studies",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    PatientId = table.Column<Guid>(type: "uuid", nullable: false),
                    DoctorId = table.Column<Guid>(type: "uuid", nullable: false),
                    StudyDate = table.Column<DateOnly>(type: "date", nullable: false),
                    StudyType = table.Column<string>(type: "text", nullable: false),
                    Title = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    ClinicalNotes = table.Column<string>(type: "text", nullable: true),
                    Status = table.Column<string>(type: "text", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false, defaultValueSql: "NOW()"),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Studies", x => x.Id);
                    table.ForeignKey(
                        name: "FK_Studies_Patients_PatientId",
                        column: x => x.PatientId,
                        principalTable: "Patients",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_Studies_Users_DoctorId",
                        column: x => x.DoctorId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "XRayImages",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    StudyId = table.Column<Guid>(type: "uuid", nullable: false),
                    FileName = table.Column<string>(type: "character varying(300)", maxLength: 300, nullable: false),
                    FileFormat = table.Column<string>(type: "text", nullable: false),
                    StorageUrl = table.Column<string>(type: "text", nullable: false),
                    ThumbnailUrl = table.Column<string>(type: "text", nullable: true),
                    FileSizeBytes = table.Column<long>(type: "bigint", nullable: false),
                    WidthPx = table.Column<int>(type: "integer", nullable: true),
                    HeightPx = table.Column<int>(type: "integer", nullable: true),
                    PixelSpacingMm = table.Column<decimal>(type: "numeric(8,4)", precision: 8, scale: 4, nullable: true),
                    CalibrationRatio = table.Column<decimal>(type: "numeric(10,6)", precision: 10, scale: 6, nullable: true),
                    CalibrationPoint1 = table.Column<JsonDocument>(type: "jsonb", nullable: true),
                    CalibrationPoint2 = table.Column<JsonDocument>(type: "jsonb", nullable: true),
                    CalibrationKnownMm = table.Column<decimal>(type: "numeric(8,2)", precision: 8, scale: 2, nullable: true),
                    IsCalibrated = table.Column<bool>(type: "boolean", nullable: false, defaultValue: false),
                    UploadedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false, defaultValueSql: "NOW()")
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_XRayImages", x => x.Id);
                    table.ForeignKey(
                        name: "FK_XRayImages_Studies_StudyId",
                        column: x => x.StudyId,
                        principalTable: "Studies",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "AnalysisSessions",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    XRayImageId = table.Column<Guid>(type: "uuid", nullable: false),
                    TriggeredBy = table.Column<Guid>(type: "uuid", nullable: false),
                    ModelVersion = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    AnalysisType = table.Column<string>(type: "text", nullable: false),
                    Status = table.Column<string>(type: "text", nullable: false),
                    ErrorMessage = table.Column<string>(type: "text", nullable: true),
                    InferenceDurationMs = table.Column<int>(type: "integer", nullable: true),
                    TotalDurationMs = table.Column<int>(type: "integer", nullable: true),
                    QueuedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false, defaultValueSql: "NOW()"),
                    StartedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    CompletedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_AnalysisSessions", x => x.Id);
                    table.ForeignKey(
                        name: "FK_AnalysisSessions_Users_TriggeredBy",
                        column: x => x.TriggeredBy,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_AnalysisSessions_XRayImages_XRayImageId",
                        column: x => x.XRayImageId,
                        principalTable: "XRayImages",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "Diagnoses",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    SessionId = table.Column<Guid>(type: "uuid", nullable: false),
                    SkeletalClass = table.Column<string>(type: "text", nullable: false),
                    VerticalPattern = table.Column<string>(type: "text", nullable: false),
                    MaxillaryPosition = table.Column<string>(type: "text", nullable: false),
                    MandibularPosition = table.Column<string>(type: "text", nullable: false),
                    UpperIncisorInclination = table.Column<string>(type: "text", nullable: false),
                    LowerIncisorInclination = table.Column<string>(type: "text", nullable: false),
                    OverjetMm = table.Column<decimal>(type: "numeric(6,2)", precision: 6, scale: 2, nullable: true),
                    OverbitesMm = table.Column<decimal>(type: "numeric(6,2)", precision: 6, scale: 2, nullable: true),
                    CrowdingSeverity = table.Column<string>(type: "text", nullable: true),
                    ConfidenceScore = table.Column<decimal>(type: "numeric(5,4)", precision: 5, scale: 4, nullable: true),
                    SummaryText = table.Column<string>(type: "text", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false, defaultValueSql: "NOW()")
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Diagnoses", x => x.Id);
                    table.ForeignKey(
                        name: "FK_Diagnoses_AnalysisSessions_SessionId",
                        column: x => x.SessionId,
                        principalTable: "AnalysisSessions",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "Landmarks",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    SessionId = table.Column<Guid>(type: "uuid", nullable: false),
                    LandmarkCode = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    LandmarkName = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    XPx = table.Column<decimal>(type: "numeric(10,4)", precision: 10, scale: 4, nullable: false),
                    YPx = table.Column<decimal>(type: "numeric(10,4)", precision: 10, scale: 4, nullable: false),
                    XMm = table.Column<decimal>(type: "numeric(10,4)", precision: 10, scale: 4, nullable: true),
                    YMm = table.Column<decimal>(type: "numeric(10,4)", precision: 10, scale: 4, nullable: true),
                    ConfidenceScore = table.Column<decimal>(type: "numeric(5,4)", precision: 5, scale: 4, nullable: true),
                    IsAiDetected = table.Column<bool>(type: "boolean", nullable: false),
                    IsManuallyAdjusted = table.Column<bool>(type: "boolean", nullable: false),
                    AdjustmentReason = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false, defaultValueSql: "NOW()")
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Landmarks", x => x.Id);
                    table.ForeignKey(
                        name: "FK_Landmarks_AnalysisSessions_SessionId",
                        column: x => x.SessionId,
                        principalTable: "AnalysisSessions",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "Measurements",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    SessionId = table.Column<Guid>(type: "uuid", nullable: false),
                    MeasurementCode = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: false),
                    MeasurementName = table.Column<string>(type: "character varying(150)", maxLength: 150, nullable: false),
                    MeasurementType = table.Column<string>(type: "text", nullable: false),
                    Value = table.Column<decimal>(type: "numeric(10,4)", precision: 10, scale: 4, nullable: false),
                    Unit = table.Column<string>(type: "text", nullable: false),
                    NormalMin = table.Column<decimal>(type: "numeric(10,4)", precision: 10, scale: 4, nullable: false),
                    NormalMax = table.Column<decimal>(type: "numeric(10,4)", precision: 10, scale: 4, nullable: false),
                    Status = table.Column<string>(type: "text", nullable: false),
                    Deviation = table.Column<decimal>(type: "numeric(10,4)", precision: 10, scale: 4, nullable: true),
                    LandmarkRefs = table.Column<JsonDocument>(type: "jsonb", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false, defaultValueSql: "NOW()")
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Measurements", x => x.Id);
                    table.ForeignKey(
                        name: "FK_Measurements_AnalysisSessions_SessionId",
                        column: x => x.SessionId,
                        principalTable: "AnalysisSessions",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "Reports",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    SessionId = table.Column<Guid>(type: "uuid", nullable: false),
                    GeneratedBy = table.Column<Guid>(type: "uuid", nullable: false),
                    ReportFormat = table.Column<string>(type: "text", nullable: false),
                    Language = table.Column<string>(type: "character varying(10)", maxLength: 10, nullable: false, defaultValue: "en"),
                    StorageUrl = table.Column<string>(type: "text", nullable: false),
                    FileSizeBytes = table.Column<long>(type: "bigint", nullable: true),
                    IncludesXray = table.Column<bool>(type: "boolean", nullable: false),
                    IncludesLandmarkOverlay = table.Column<bool>(type: "boolean", nullable: false),
                    IncludesMeasurements = table.Column<bool>(type: "boolean", nullable: false),
                    IncludesTreatmentPlan = table.Column<bool>(type: "boolean", nullable: false),
                    GeneratedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false, defaultValueSql: "NOW()"),
                    ExpiresAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Reports", x => x.Id);
                    table.ForeignKey(
                        name: "FK_Reports_AnalysisSessions_SessionId",
                        column: x => x.SessionId,
                        principalTable: "AnalysisSessions",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_Reports_Users_GeneratedBy",
                        column: x => x.GeneratedBy,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "TreatmentPlans",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    DiagnosisId = table.Column<Guid>(type: "uuid", nullable: false),
                    PlanIndex = table.Column<short>(type: "smallint", nullable: false),
                    TreatmentType = table.Column<string>(type: "text", nullable: false),
                    TreatmentName = table.Column<string>(type: "character varying(300)", maxLength: 300, nullable: false),
                    Description = table.Column<string>(type: "text", nullable: false),
                    Rationale = table.Column<string>(type: "text", nullable: true),
                    Risks = table.Column<string>(type: "text", nullable: true),
                    EstimatedDurationMonths = table.Column<short>(type: "smallint", nullable: true),
                    ConfidenceScore = table.Column<decimal>(type: "numeric(5,4)", precision: 5, scale: 4, nullable: true),
                    Source = table.Column<string>(type: "text", nullable: false),
                    IsPrimary = table.Column<bool>(type: "boolean", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false, defaultValueSql: "NOW()")
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_TreatmentPlans", x => x.Id);
                    table.ForeignKey(
                        name: "FK_TreatmentPlans_Diagnoses_DiagnosisId",
                        column: x => x.DiagnosisId,
                        principalTable: "Diagnoses",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_AnalysisSessions_TriggeredBy",
                table: "AnalysisSessions",
                column: "TriggeredBy");

            migrationBuilder.CreateIndex(
                name: "IX_AnalysisSessions_XRayImageId",
                table: "AnalysisSessions",
                column: "XRayImageId");

            migrationBuilder.CreateIndex(
                name: "IX_Diagnoses_SessionId",
                table: "Diagnoses",
                column: "SessionId",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Landmarks_SessionId_LandmarkCode",
                table: "Landmarks",
                columns: new[] { "SessionId", "LandmarkCode" });

            migrationBuilder.CreateIndex(
                name: "IX_Measurements_SessionId_MeasurementCode",
                table: "Measurements",
                columns: new[] { "SessionId", "MeasurementCode" });

            migrationBuilder.CreateIndex(
                name: "IX_Patients_DoctorId",
                table: "Patients",
                column: "DoctorId");

            migrationBuilder.CreateIndex(
                name: "IX_Patients_MedicalRecordNo",
                table: "Patients",
                column: "MedicalRecordNo",
                unique: true,
                filter: "\"MedicalRecordNo\" IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_Reports_GeneratedBy",
                table: "Reports",
                column: "GeneratedBy");

            migrationBuilder.CreateIndex(
                name: "IX_Reports_SessionId",
                table: "Reports",
                column: "SessionId");

            migrationBuilder.CreateIndex(
                name: "IX_Studies_DoctorId",
                table: "Studies",
                column: "DoctorId");

            migrationBuilder.CreateIndex(
                name: "IX_Studies_PatientId",
                table: "Studies",
                column: "PatientId");

            migrationBuilder.CreateIndex(
                name: "IX_TreatmentPlans_DiagnosisId_PlanIndex",
                table: "TreatmentPlans",
                columns: new[] { "DiagnosisId", "PlanIndex" });

            migrationBuilder.CreateIndex(
                name: "IX_Users_Email",
                table: "Users",
                column: "Email",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_XRayImages_StudyId",
                table: "XRayImages",
                column: "StudyId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "Landmarks");

            migrationBuilder.DropTable(
                name: "Measurements");

            migrationBuilder.DropTable(
                name: "Reports");

            migrationBuilder.DropTable(
                name: "TreatmentPlans");

            migrationBuilder.DropTable(
                name: "Diagnoses");

            migrationBuilder.DropTable(
                name: "AnalysisSessions");

            migrationBuilder.DropTable(
                name: "XRayImages");

            migrationBuilder.DropTable(
                name: "Studies");

            migrationBuilder.DropTable(
                name: "Patients");

            migrationBuilder.DropTable(
                name: "Users");
        }
    }
}
