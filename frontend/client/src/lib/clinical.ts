export type Tone = "neutral" | "success" | "warning" | "danger" | "info";

type CaseStudyLike = {
  createdAt?: Date | string | null;
  imageUrl?: string | null;
  latestImageId?: string | null;
  latestSessionId?: string | null;
  status?: string | null;
  updatedAt?: Date | string | null;
} | null | undefined;

type CaseReportLike = {
  status?: string | null;
  reportUrl?: string | null;
} | null | undefined;

export type CaseWorkflowStepState = "done" | "current" | "pending" | "blocked";

export type CaseWorkflowStep = {
  key: "intake" | "imaging" | "ai" | "review" | "report";
  label: string;
  description: string;
  state: CaseWorkflowStepState;
  tone: Tone;
};

export type CasePriority = {
  actionable: boolean;
  label: "Urgent" | "High" | "Standard" | "Low";
  reasons: string[];
  score: number;
  staleDays: number;
  tone: Tone;
};

export function parseNumber(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function formatNumber(
  value: string | number | null | undefined,
  options?: Intl.NumberFormatOptions
) {
  const parsed = parseNumber(value);
  if (parsed === null) {
    return "--";
  }

  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
    ...options,
  }).format(parsed);
}

export function formatPercent(
  value: string | number | null | undefined,
  digits = 0
) {
  const parsed = parseNumber(value);
  if (parsed === null) {
    return "--";
  }

  const normalized = parsed > 1 ? parsed / 100 : parsed;
  return new Intl.NumberFormat("en-US", {
    style: "percent",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(normalized);
}

export function formatDate(value: Date | string | null | undefined) {
  if (!value) {
    return "--";
  }

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "--";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

export function formatDateTime(value: Date | string | null | undefined) {
  if (!value) {
    return "--";
  }

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "--";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

export function calculateAge(value: Date | string | null | undefined) {
  if (!value) {
    return null;
  }

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  const today = new Date();
  let age = today.getFullYear() - date.getFullYear();
  const monthDelta = today.getMonth() - date.getMonth();
  const beforeBirthday =
    monthDelta < 0 || (monthDelta === 0 && today.getDate() < date.getDate());

  if (beforeBirthday) {
    age -= 1;
  }

  return age >= 0 ? age : null;
}

export function fullName(person: {
  firstName?: string | null;
  lastName?: string | null;
}) {
  return [person.firstName, person.lastName].filter(Boolean).join(" ").trim() || "Unnamed patient";
}

export function initials(person: {
  firstName?: string | null;
  lastName?: string | null;
}) {
  return [person.firstName?.[0], person.lastName?.[0]].filter(Boolean).join("").toUpperCase() || "PT";
}

export function getStudyStatusTone(status?: string | null): Tone {
  switch (status) {
    case "completed":
      return "success";
    case "processing":
      return "info";
    case "failed":
      return "danger";
    case "pending":
      return "warning";
    default:
      return "neutral";
  }
}

export function getReportStatusTone(status?: string | null): Tone {
  switch (status) {
    case "generated":
      return "success";
    case "failed":
      return "danger";
    case "pending":
      return "warning";
    default:
      return "neutral";
  }
}

export function getDeviationTone(status?: string | null): Tone {
  switch (status) {
    case "normal":
      return "success";
    case "increased":
    case "decreased":
      return "warning";
    default:
      return "neutral";
  }
}

export function getComplexityTone(value?: string | null): Tone {
  switch (value) {
    case "low":
      return "success";
    case "moderate":
      return "warning";
    case "high":
      return "danger";
    default:
      return "neutral";
  }
}

export function getConfidenceTone(value: string | number | null | undefined): Tone {
  const parsed = parseNumber(value);
  if (parsed === null) {
    return "neutral";
  }
  if (parsed >= 0.85) {
    return "success";
  }
  if (parsed >= 0.65) {
    return "info";
  }
  if (parsed >= 0.4) {
    return "warning";
  }
  return "danger";
}

export function getQualityTone(status?: string | null): Tone {
  switch ((status ?? "").toLowerCase()) {
    case "clinically_usable":
    case "usable":
      return "success";
    case "provisional":
      return "warning";
    case "manual_review_required":
    case "review_required":
      return "danger";
    default:
      return "neutral";
  }
}

export function getProvenanceTone(provenance?: string | null): Tone {
  switch ((provenance ?? "").toLowerCase()) {
    case "detected":
      return "success";
    case "manual":
      return "info";
    case "derived":
      return "warning";
    case "fallback":
    case "missing":
      return "danger";
    default:
      return "neutral";
  }
}

export function formatClinicalLabel(value?: string | null) {
  if (!value) {
    return "unknown";
  }

  return value.replaceAll("_", " ");
}

export function getCaseStage(study: CaseStudyLike, report?: CaseReportLike) {
  if (!study) {
    return {
      label: "No case selected",
      tone: "neutral" as Tone,
      progress: 0,
    };
  }

  const reportReady = report?.status === "generated" || Boolean(report?.reportUrl);

  if (reportReady) {
    return {
      label: "Report ready",
      tone: "success" as Tone,
      progress: 100,
    };
  }

  if (study.status === "failed") {
    return {
      label: "Attention required",
      tone: "danger" as Tone,
      progress: 52,
    };
  }

  if (!study.imageUrl && !study.latestImageId) {
    return {
      label: "Awaiting image",
      tone: "warning" as Tone,
      progress: 18,
    };
  }

  if (study.status === "processing") {
    return {
      label: "AI in progress",
      tone: "info" as Tone,
      progress: 58,
    };
  }

  if (!study.latestSessionId) {
    return {
      label: "Ready for AI",
      tone: "warning" as Tone,
      progress: 42,
    };
  }

  if (study.status === "completed") {
    return {
      label: "Clinical review",
      tone: "info" as Tone,
      progress: 82,
    };
  }

  return {
    label: "Case intake",
    tone: "neutral" as Tone,
    progress: 28,
  };
}

export function getCaseWorkflowSteps(
  study: CaseStudyLike,
  report?: CaseReportLike
): CaseWorkflowStep[] {
  const hasCase = Boolean(study);
  const imageReady = Boolean(study?.imageUrl || study?.latestImageId);
  const sessionReady = Boolean(study?.latestSessionId);
  const reportReady = report?.status === "generated" || Boolean(report?.reportUrl);
  const failed = study?.status === "failed";
  const processing = study?.status === "processing";

  return [
    {
      key: "intake",
      label: "Intake",
      description: hasCase ? "Case metadata ready" : "Select or create a case",
      state: hasCase ? "done" : "current",
      tone: hasCase ? "success" : "warning",
    },
    {
      key: "imaging",
      label: "Imaging",
      description: imageReady ? "Image attached" : "Upload radiograph",
      state: imageReady ? "done" : hasCase ? "current" : "pending",
      tone: imageReady ? "success" : hasCase ? "warning" : "neutral",
    },
    {
      key: "ai",
      label: "AI analysis",
      description: failed
        ? "Pipeline failed"
        : sessionReady
          ? "Session available"
          : processing
            ? "Processing"
            : "Run detection",
      state: failed
        ? "blocked"
        : sessionReady
          ? "done"
          : imageReady
            ? "current"
            : "pending",
      tone: failed ? "danger" : sessionReady ? "success" : imageReady ? "info" : "neutral",
    },
    {
      key: "review",
      label: "Review",
      description: reportReady ? "Clinical review complete" : "Confirm outputs",
      state: reportReady ? "done" : sessionReady ? "current" : "pending",
      tone: reportReady ? "success" : sessionReady ? "info" : "neutral",
    },
    {
      key: "report",
      label: "Report",
      description: reportReady ? "Report ready" : "Generate report",
      state: reportReady ? "done" : sessionReady ? "current" : "pending",
      tone: reportReady ? "success" : sessionReady ? "warning" : "neutral",
    },
  ];
}

function daysSince(value: Date | string | null | undefined) {
  if (!value) {
    return 0;
  }

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 0;
  }

  const diff = Date.now() - date.getTime();
  return Math.max(0, Math.floor(diff / 86_400_000));
}

export function getCasePriority(
  study: CaseStudyLike,
  report?: CaseReportLike
): CasePriority {
  if (!study) {
    return {
      actionable: false,
      label: "Low",
      reasons: ["No case selected"],
      score: 0,
      staleDays: 0,
      tone: "neutral",
    };
  }

  const stage = getCaseStage(study, report);
  const staleDays = daysSince(study.updatedAt ?? study.createdAt);
  const reportReady = report?.status === "generated" || Boolean(report?.reportUrl);
  const reasons: string[] = [];
  let score = 20;

  if (study.status === "failed") {
    score = 100;
    reasons.push("Pipeline failed");
  } else if (!study.imageUrl && !study.latestImageId) {
    score = 74;
    reasons.push("Image needed");
  } else if (study.status === "processing") {
    score = staleDays >= 1 ? 82 : 48;
    reasons.push(staleDays >= 1 ? "Processing may be stale" : "AI processing");
  } else if (!study.latestSessionId) {
    score = 78;
    reasons.push("Ready for AI");
  } else if (!reportReady) {
    score = 64;
    reasons.push(stage.label === "Clinical review" ? "Clinical review" : "Report pending");
  } else {
    score = 16;
    reasons.push("Report ready");
  }

  if (staleDays >= 7 && !reportReady) {
    score += 14;
    reasons.push(`${staleDays} days since update`);
  } else if (staleDays >= 3 && !reportReady) {
    score += 8;
    reasons.push(`${staleDays} days since update`);
  }

  score = Math.min(100, score);

  if (score >= 90) {
    return {
      actionable: true,
      label: "Urgent",
      reasons,
      score,
      staleDays,
      tone: "danger",
    };
  }

  if (score >= 70) {
    return {
      actionable: true,
      label: "High",
      reasons,
      score,
      staleDays,
      tone: "warning",
    };
  }

  if (score >= 45) {
    return {
      actionable: true,
      label: "Standard",
      reasons,
      score,
      staleDays,
      tone: "info",
    };
  }

  return {
    actionable: false,
    label: "Low",
    reasons,
    score,
    staleDays,
    tone: reportReady ? "success" : "neutral",
  };
}
