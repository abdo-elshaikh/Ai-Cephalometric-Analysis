using CephAnalysis.Application.Features.Studies.DTOs;
using CephAnalysis.Domain.Entities;
using Microsoft.EntityFrameworkCore;

namespace CephAnalysis.Application.Features.Studies;

internal static class StudyQueryHelper
{
    /// <summary>Maps studies to <see cref="StudyDto"/> including latest analysis aggregates.</summary>
    public static IQueryable<StudyDto> ProjectToDto(IQueryable<Study> studies) =>
        studies.Select(s => new StudyDto(
            s.Id,
            s.PatientId,
            s.StudyType.ToString(),
            s.Status.ToString(),
            s.Title,
            s.ClinicalNotes,
            s.StudyDate,
            s.CreatedAt,
            s.XRayImages
                .SelectMany(i => i.AnalysisSessions)
                .OrderByDescending(asess => asess.CompletedAt)
                .Select(asess => asess.Status.ToString())
                .FirstOrDefault(),
            s.XRayImages
                .SelectMany(i => i.AnalysisSessions)
                .Where(asess => asess.Diagnosis != null)
                .OrderByDescending(asess => asess.CompletedAt)
                .Select(asess => asess.Diagnosis!.SkeletalClass.ToString())
                .FirstOrDefault()
        ));
}
