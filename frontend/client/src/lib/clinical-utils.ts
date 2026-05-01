import { 
  type CaseRecord, 
  type CaseStatus 
} from "@/lib/mappers";
import { type CaseWorkflowStep as WorkflowStep } from "@/lib/clinical";

export function statusTone(status: CaseStatus): "success" | "accent" | "info" | "warning" | "neutral" {
  if (status === "Report ready" || status === "Reviewed" || status === "AI completed") return "success";
  if (status === "Calibrated" || status === "Reviewing") return "accent";
  if (status === "Image uploaded") return "info";
  if (status === "Draft") return "warning";
  return "neutral";
}

export function workflowStepsForCase(currentCase?: CaseRecord): WorkflowStep[] {
  return [
    {
      key: "case",
      label: "Case intake",
      detail: currentCase ? "Case exists and is ready for image intake." : "Create a case before starting analysis.",
      done: Boolean(currentCase),
      href: "/analysis",
      cta: "Create case",
    },
    {
      key: "upload",
      label: "Image upload",
      detail: currentCase?.imageName ? currentCase.imageName : "Attach lateral, PA, or DICOM image.",
      done: Boolean(currentCase?.imageName),
      href: "/analysis",
      cta: "Upload image",
    },
    {
      key: "calibrate",
      label: "2-point calibration",
      detail: currentCase?.calibrated ? `${currentCase.calibrationDistanceMm ?? "Known"} mm saved.` : "Mark two ruler points before AI analysis.",
      done: Boolean(currentCase?.calibrated),
      href: "/viewer",
      cta: "Calibrate",
    },
    {
      key: "ai",
      label: "AI detection",
      detail: currentCase?.aiStatus === "completed" ? "Landmarks, diagnosis, and plan are available." : "Run full pipeline for landmarks, diagnosis, and treatment.",
      done: currentCase?.aiStatus === "completed",
      href: "/analysis",
      cta: "Send AI",
    },
    {
      key: "review",
      label: "Clinician review",
      detail: ["Reviewing", "Reviewed", "Report ready"].includes(currentCase?.status ?? "") ? "Landmarks are in the review path." : "Inspect overlays and adjust landmark positions.",
      done: ["Reviewing", "Reviewed", "Report ready"].includes(currentCase?.status ?? ""),
      href: "/viewer",
      cta: "Review",
    },
    {
      key: "report",
      label: "Report export",
      detail: currentCase?.reportStatus === "generated" ? "Export is ready." : "Generate PDF or Word after review.",
      done: currentCase?.reportStatus === "generated",
      href: "/results",
      cta: "Generate report",
    },
  ];
}

export function nextWorkflowStep(currentCase?: CaseRecord) {
  const steps = workflowStepsForCase(currentCase);
  return steps.find(step => !step.done) ?? steps.at(-1)!;
}

export function completionForCase(currentCase?: CaseRecord) {
  if (!currentCase) return 0;
  let score = 12;
  if (currentCase.imageName) score += 20;
  if (currentCase.calibrated) score += 20;
  if (currentCase.aiStatus === "completed") score += 24;
  if (["Reviewing", "Reviewed", "Report ready"].includes(currentCase.status)) score += 12;
  if (currentCase.reportStatus === "generated") score += 12;
  return Math.min(100, score);
}

/**
 * Map confidence values to UI tones.
 */
export function confidenceTone(conf: number): "success" | "accent" | "warning" | "danger" {
  if (conf >= 0.85) return "success";
  if (conf >= 0.70) return "accent";
  if (conf >= 0.50) return "warning";
  return "danger";
}

/**
 * Get current time in human readable format
 */
export function nowReadable() {
  return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/**
 * Generate a semi-unique clinical ID
 */
export function uid(prefix = "id") {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}
