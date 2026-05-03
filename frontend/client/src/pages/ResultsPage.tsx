import React, { useState, useMemo } from "react";
import {
  FileText,
  FileCheck2,
  Eye,
  Download,
  Sparkles,
  Activity,
  AlertTriangle,
  ClipboardCheck,
  BarChart3,
  Brain,
  TrendingUp,
  Target,
  Search,
  Filter,
  Stethoscope,
  Bone,
  Wind,
  Smile,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  Info,
  Layers3,
  Calendar,
  X,
  ImageIcon,
  Maximize2,
  ShieldAlert,
  Vote,
  Gauge,
} from "lucide-react";
import {
  Card,
  Pill,
  PrimaryBtn,
  SecondaryBtn,
  PageHeader,
  Divider,
  TabBar,
  DeviationBar,
  SearchInput,
  SectionHeader,
  toneClasses,
} from "@/components/_core/ClinicalComponents";
import {
  type CaseRecord,
  type Report,
  type ClinicalArtifacts,
  type ReportFormat,
  type Measurement,
  type TreatmentOption,
  type OverlayArtifact,
  type SkeletalConsensus,
} from "@/lib/mappers";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

type ResultsTab = "overview" | "measurements" | "treatment" | "overlays" | "growth" | "reports";

interface ResultsPageProps {
  activeCase?: CaseRecord;
  reports: Report[];
  artifacts: ClinicalArtifacts;
  overlays?: OverlayArtifact[];
  onRequestReport: (f: ReportFormat) => void | Promise<void>;
}

// ─── Landmark Quality Summary ─────────────────────────────────────────────────

function LandmarkQualitySummary({ measurements }: { measurements: Measurement[] }) {
  const flagged = measurements.filter(m => m.reviewReasons?.length);
  
  if (!flagged.length) {
    return (
      <Card className="border-success/20 bg-success/5">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-success/20 text-success">
            <CheckCircle2 className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-bold">All Landmarks Optimal</p>
            <p className="text-xs text-muted-foreground mt-0.5">{measurements.length} measurements with high confidence</p>
          </div>
        </div>
      </Card>
    );
  }
  
  return (
    <Card className="border-warning/20 bg-warning/5">
      <div className="flex items-start gap-3 mb-3">
        <AlertTriangle className="h-4 w-4 text-warning shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-bold">Landmark Quality Flags</p>
          <p className="text-xs text-muted-foreground mt-0.5">{flagged.length} measurement(s) need review</p>
        </div>
      </div>
      <div className="space-y-1">
        {flagged.slice(0, 3).map(m => (
          <div key={m.code} className="flex items-center gap-2 text-xs text-warning-foreground/80">
            <span className="font-semibold">{m.code}</span>
            <span className="text-[11px] text-warning-foreground/60">•</span>
            <span>{m.reviewReasons?.[0] || "Review recommended"}</span>
          </div>
        ))}
      </div>
      {flagged.length > 3 && (
        <p className="text-xs text-warning-foreground/60 mt-2">+{flagged.length - 3} more</p>
      )}
    </Card>
  );
}

// ─── Risk Factor Summary ───────────────────────────────────────────────────────

function RiskFactorSummary({ diagnosis }: { diagnosis: DiagnosisSummary }) {
  const riskFactors = [];
  
  if (diagnosis.airwayRiskScore !== undefined && diagnosis.airwayRiskScore !== null) {
    const airwayLevel = diagnosis.airwayRiskScore >= 7 ? "High" : diagnosis.airwayRiskScore >= 4 ? "Moderate" : "Low";
    riskFactors.push({ label: "Airway Risk", value: airwayLevel, score: diagnosis.airwayRiskScore, icon: Wind });
  }
  
  if (diagnosis.warnings.length > 0) {
    riskFactors.push({ label: "Clinical Flags", value: `${diagnosis.warnings.length} items`, icon: AlertTriangle });
  }
  
  if (!riskFactors.length) return null;
  
  return (
    <Card className="border-border/40">
      <div className="flex items-center gap-2 mb-4">
        <ShieldAlert className="h-4 w-4 text-muted-foreground" />
        <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Risk Assessment Summary</span>
      </div>
      <div className="grid gap-3">
        {riskFactors.map((rf, i) => {
          const RiskIcon = rf.icon;
          return (
            <div key={i} className="flex items-center justify-between p-3 rounded-lg border border-border/40 bg-muted/10">
              <div className="flex items-center gap-2">
                <RiskIcon className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-xs font-medium">{rf.label}</span>
              </div>
              <Pill 
                tone={rf.label === "Airway Risk" && rf.score !== undefined && rf.score >= 7 ? "danger" : "warning"} 
                size="xs"
              >
                {rf.value}
              </Pill>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

// ─── Measurement Groups ───────────────────────────────────────────────────────

const MEASUREMENT_GROUPS: { label: string; icon: React.ComponentType<{ className?: string }>; codes: string[] }[] = [
  {
    label: "Steiner / Skeletal",
    icon: Bone,
    codes: ["SNA", "SNB", "ANB", "SNPog", "NAPog", "SN_OcP", "SN_GoGn", "FMA", "FacialAngle", "ConvexityAngle"],
  },
  {
    label: "McNamara",
    icon: Target,
    codes: ["NaPerp_A", "NaPerp_Pog", "CoA", "CoGn", "MxLen", "MdLen", "LFH", "UFH"],
  },
  {
    label: "Vertical / Jarabak",
    icon: Activity,
    codes: ["Jarabak", "PFH", "AFH", "ODI", "APDI", "CF", "MP_SN", "GoGn_SN"],
  },
  {
    label: "Dental",
    icon: Smile,
    codes: ["U1_NA_ang", "U1_NA_mm", "L1_NB_ang", "L1_NB_mm", "U1_L1", "L1_APog", "U1_FH", "L1_MP"],
  },
  {
    label: "Soft Tissue",
    icon: Layers3,
    codes: ["NasolabialAngle", "ULip_EP", "LLip_EP", "MentolabialSulcus", "FacialConvexity_st", "UpperLipProtrusion", "LowerLipProtrusion"],
  },
  {
    label: "Airway / CVM",
    icon: Wind,
    codes: ["MPH", "PNW", "PPW", "AirwayRatio", "CVM_C2", "CVM_C3", "CVM_C4"],
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function severityTone(s: Measurement["severity"] | string): "success" | "warning" | "danger" | "neutral" {
  if (s === "Normal") return "success";
  if (s === "Mild") return "warning";
  if (s === "Moderate" || s === "Severe") return "danger";
  return "neutral";
}

function reportTone(status: string): "success" | "warning" | "neutral" {
  if (status === "Ready" || status === "generated") return "success";
  if (status === "Pending") return "warning";
  return "neutral";
}

function complexityTone(c: string): "success" | "warning" | "danger" {
  if (c === "High") return "danger";
  if (c === "Moderate") return "warning";
  return "success";
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function ConsensusMiniBar({ consensus }: { consensus: SkeletalConsensus }) {
  const classColor: Record<string, string> = {
    ClassI:   "bg-success",
    ClassII:  "bg-warning",
    ClassIII: "bg-destructive",
  };
  const classLabel: Record<string, string> = {
    ClassI: "I", ClassII: "II", ClassIII: "III",
  };
  const typeTone: Record<string, string> = {
    Definitive: "text-success",
    Borderline: "text-warning",
    Conflicting: "text-destructive",
  };

  return (
    <div className="p-3.5 rounded-xl border border-border/40 bg-muted/20 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <Vote className="h-3.5 w-3.5" />
          <span className="text-[10px] font-bold uppercase tracking-widest">Multi-Metric Consensus</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className={cn("text-[10px] font-bold uppercase", typeTone[consensus.consensus_type] ?? "text-muted-foreground")}>
            {consensus.consensus_type}
          </span>
          <span className="text-[10px] text-muted-foreground">({consensus.agreement_pct}%)</span>
        </div>
      </div>
      <div className="flex gap-2 flex-wrap">
        {consensus.votes.map(v => (
          <div
            key={v.metric}
            className={cn(
              "flex items-center gap-1 px-2 py-1 rounded-lg border text-[10px] font-bold",
              v.vote === consensus.consensus_class
                ? "border-success/30 bg-success/10 text-success"
                : "border-warning/30 bg-warning/10 text-warning"
            )}
          >
            <span>{v.metric}</span>
            <span className="text-muted-foreground">→</span>
            <span>Class {classLabel[v.vote] ?? v.vote}</span>
          </div>
        ))}
      </div>
      {/* Probability bars */}
      <div className="space-y-1.5">
        {Object.entries(consensus.probabilities)
          .sort(([, a], [, b]) => b - a)
          .map(([cls, prob]) => (
            <div key={cls} className="flex items-center gap-2">
              <span className="text-[10px] text-muted-foreground w-14 shrink-0">Class {classLabel[cls] ?? cls}</span>
              <div className="flex-1 h-1.5 rounded-full bg-muted/40 overflow-hidden">
                <div
                  className={cn("h-full rounded-full transition-all duration-700", classColor[cls] ?? "bg-muted-foreground")}
                  style={{ width: `${Math.round(prob * 100)}%` }}
                />
              </div>
              <span className="text-[10px] font-bold text-muted-foreground w-8 text-right">{Math.round(prob * 100)}%</span>
            </div>
          ))}
      </div>
    </div>
  );
}

function AirwayRiskGauge({ score }: { score: number }) {
  const clampedScore = Math.max(0, Math.min(10, score));
  const riskLabel = clampedScore <= 3 ? "Low" : clampedScore <= 5 ? "Mild" : clampedScore <= 7 ? "Moderate" : "High";
  const riskTone = clampedScore <= 3 ? "text-success" : clampedScore <= 5 ? "text-warning" : "text-destructive";
  const barColor = clampedScore <= 3 ? "bg-success" : clampedScore <= 5 ? "bg-warning" : "bg-destructive";

  return (
    <div className="p-3.5 rounded-xl border border-border/40 bg-muted/20">
      <div className="flex items-center justify-between mb-2.5">
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <Gauge className="h-3.5 w-3.5" />
          <span className="text-[10px] font-bold uppercase tracking-widest">Airway Risk Score</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className={cn("text-sm font-bold", riskTone)}>{clampedScore.toFixed(0)}/10</span>
          <Pill
            tone={clampedScore <= 3 ? "success" : clampedScore <= 5 ? "warning" : "danger"}
            size="xs"
          >{riskLabel}</Pill>
        </div>
      </div>
      <div className="h-2 w-full rounded-full bg-muted/60 overflow-hidden">
        <div
          className={cn("h-full rounded-full transition-all duration-700", barColor)}
          style={{ width: `${(clampedScore / 10) * 100}%` }}
        />
      </div>
      <div className="flex justify-between mt-1">
        {[0, 2, 4, 6, 8, 10].map(tick => (
          <span key={tick} className="text-[9px] text-muted-foreground/40">{tick}</span>
        ))}
      </div>
    </div>
  );
}

function CVMStageCard({ cvm }: { cvm: any }) {
  if (!cvm) return null;
  const stageColors: Record<string, string> = {
    "CS 1": "bg-success text-success-foreground",
    "CS 2": "bg-success text-success-foreground",
    "CS 3": "bg-warning text-warning-foreground",
    "CS 4": "bg-warning text-warning-foreground",
    "CS 5": "bg-orange-500 text-white",
    "CS 6": "bg-destructive text-destructive-foreground",
  };
  const stageColor = stageColors[cvm.stage] || "bg-muted text-muted-foreground";
  
  return (
    <div className="p-4 rounded-xl border border-border/40 bg-muted/10 mb-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Activity className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">CVM Growth Stage</span>
        </div>
        <span className={cn("text-xs font-bold px-2 py-1 rounded-lg", stageColor)}>{cvm.stage}</span>
      </div>
      <p className="text-xs text-muted-foreground leading-relaxed">{cvm.description}</p>
      <div className="mt-2 flex items-center gap-2">
        <span className="text-[10px] text-muted-foreground/60">Growth Status: </span>
        <Pill tone={cvm.growth_status === "Complete" ? "neutral" : "warning"} size="xs">{cvm.growth_status}</Pill>
      </div>
    </div>
  );
}

function DentalSkeletalDifferentialPanel({ diff }: { diff: any }) {
  if (!diff) return null;
  const skelPct = Math.round(diff.skeletal_evidence_pct ?? 0);
  const dentalPct = Math.round(diff.dental_evidence_pct ?? 0);
  
  return (
    <div className="p-4 rounded-xl border border-border/40 bg-muted/10 mb-4">
      <div className="flex items-center gap-2 mb-3">
        <Smile className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Dental-Skeletal Differential</span>
      </div>
      <div className="grid grid-cols-2 gap-3 mb-3">
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[9px] font-bold text-muted-foreground">Skeletal Evidence</span>
            <span className="text-xs font-bold">{skelPct}%</span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-muted/60 overflow-hidden">
            <div className="h-full bg-primary rounded-full" style={{ width: `${skelPct}%` }} />
          </div>
        </div>
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[9px] font-bold text-muted-foreground">Dental Evidence</span>
            <span className="text-xs font-bold">{dentalPct}%</span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-muted/60 overflow-hidden">
            <div className="h-full bg-accent rounded-full" style={{ width: `${dentalPct}%` }} />
          </div>
        </div>
      </div>
      <p className="text-xs text-muted-foreground leading-relaxed">{diff.interpretation}</p>
    </div>
  );
}

function DiagnosisCard({ diagnosis }: { diagnosis: ClinicalArtifacts["diagnosis"] }) {
  const confPct = Math.round((diagnosis.confidence || 0.85) * 100);
  const classItems = [
    { label: "Skeletal Class", value: `${diagnosis.skeletalClass}${diagnosis.skeletalType ? ` (${diagnosis.skeletalType})` : ""}`, tone: diagnosis.skeletalClass.startsWith("Class I") && !diagnosis.skeletalClass.includes("II") && !diagnosis.skeletalClass.includes("III") ? "success" : "warning" },
    { label: "Vertical Pattern", value: diagnosis.verticalPattern, tone: diagnosis.verticalPattern.toLowerCase().includes("normal") ? "success" : "warning" },
    { label: "Soft Tissue", value: diagnosis.softTissueProfile, tone: "info" },
    { label: "AI Confidence", value: `${confPct}%`, tone: confPct >= 80 ? "success" : confPct >= 60 ? "warning" : "danger" },
  ] as const;

  return (
    <Card className="relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-transparent" />
      <div className="relative">

        {/* AI Disclaimer banner — always visible, clinically required */}
        {diagnosis.aiDisclaimer && (
          <div className="flex items-start gap-2.5 p-3 rounded-xl border border-destructive/20 bg-destructive/5 mb-5">
            <ShieldAlert className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
            <p className="text-[10px] leading-relaxed text-muted-foreground">
              <span className="font-bold text-destructive">Clinical Use Only — AI Decision Support: </span>
              {diagnosis.aiDisclaimer}
            </p>
          </div>
        )}

        <div className="flex items-start justify-between gap-3 mb-5">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-primary mb-1.5">Clinical Diagnosis</p>
            <h2 className="text-2xl font-bold tracking-tight">{diagnosis.skeletalClass} Skeletal Pattern</h2>
          </div>
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10 text-primary">
            <Brain className="h-6 w-6" />
          </div>
        </div>

        <p className="text-sm text-muted-foreground leading-relaxed mb-6">{diagnosis.summary}</p>

        <div className="grid grid-cols-2 gap-3 mb-6">
          {classItems.map(item => (
            <div key={item.label} className="p-3.5 rounded-xl border border-border/40 bg-muted/20">
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2">{item.label}</p>
              <Pill tone={item.tone} size="xs" className="font-bold">{item.value}</Pill>
            </div>
          ))}
        </div>

        {/* AI Confidence bar */}
        <div className="p-4 rounded-xl border border-border/40 bg-muted/10 mb-4">
          <div className="flex items-center justify-between mb-2.5">
            <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Model Confidence</span>
            <span className={cn("text-sm font-bold", confPct >= 80 ? "text-success" : confPct >= 60 ? "text-warning" : "text-destructive")}>{confPct}%</span>
          </div>
          <div className="h-2 w-full rounded-full bg-muted/60 overflow-hidden">
            <div
              className={cn("h-full rounded-full transition-all duration-700", confPct >= 80 ? "bg-success" : confPct >= 60 ? "bg-warning" : "bg-destructive")}
              style={{ width: `${confPct}%` }}
            />
          </div>
        </div>

        {/* Multi-metric skeletal consensus */}
        {diagnosis.skeletalConsensus && (
          <div className="mb-4">
            <ConsensusMiniBar consensus={diagnosis.skeletalConsensus} />
          </div>
        )}

        {/* CVM Growth Staging */}
        {diagnosis.cvmStaging && (
          <CVMStageCard cvm={diagnosis.cvmStaging} />
        )}

        {/* Airway risk score */}
        {diagnosis.airwayRiskScore != null && (
          <div className="mb-4">
            <AirwayRiskGauge score={diagnosis.airwayRiskScore} />
          </div>
        )}

        {/* Dental-Skeletal Differential */}
        {diagnosis.dentalSkeletalDifferential && (
          <DentalSkeletalDifferentialPanel diff={diagnosis.dentalSkeletalDifferential} />
        )}

        {(diagnosis.warnings.length > 0 || diagnosis.clinicalNotes.length > 0) && (
          <div className="space-y-3">
            {diagnosis.warnings.length > 0 && (
              <div className="p-3.5 rounded-xl border border-warning/20 bg-warning/5">
                <div className="flex items-center gap-2 mb-2 text-warning">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  <span className="text-[10px] font-bold uppercase tracking-widest">Review Warnings</span>
                </div>
                <ul className="space-y-1">
                  {diagnosis.warnings.map(w => <li key={w} className="text-xs text-warning-foreground/80 leading-relaxed">• {w}</li>)}
                </ul>
              </div>
            )}
            {diagnosis.clinicalNotes.length > 0 && (
              <div className="p-3.5 rounded-xl border border-primary/20 bg-primary/5">
                <div className="flex items-center gap-2 mb-2 text-primary">
                  <ClipboardCheck className="h-3.5 w-3.5" />
                  <span className="text-[10px] font-bold uppercase tracking-widest">Clinical Annotations</span>
                </div>
                <ul className="space-y-1">
                  {diagnosis.clinicalNotes.map(n => <li key={n} className="text-xs text-primary-foreground/80 leading-relaxed">• {n}</li>)}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}

function NormativeComparisonPanel({ measurements }: { measurements: Measurement[] }) {
  const abnormal = measurements.filter(m => m.severity !== "Normal");
  if (!abnormal.length) return null;
  
  const stats = {
    mild: abnormal.filter(m => m.severity === "Mild").length,
    moderate: abnormal.filter(m => m.severity === "Moderate").length,
    severe: abnormal.filter(m => m.severity === "Severe").length,
  };
  
  return (
    <Card className="border-border/40 bg-muted/5">
      <div className="flex items-center gap-2 mb-4">
        <BarChart3 className="h-4 w-4 text-muted-foreground" />
        <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Deviation Summary</span>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {[
          { label: "Mild", count: stats.mild, tone: "warning" },
          { label: "Moderate", count: stats.moderate, tone: "warning" },
          { label: "Severe", count: stats.severe, tone: "danger" },
        ].map(stat => (
          <div key={stat.label} className="p-3 rounded-lg border border-border/40 bg-muted/10">
            <p className="text-[9px] font-bold text-muted-foreground uppercase">{stat.label}</p>
            <p className={cn("text-lg font-bold mt-1", 
              stat.tone === "danger" ? "text-destructive" : "text-warning"
            )}>
              {stat.count}
            </p>
          </div>
        ))}
      </div>
      <p className="text-xs text-muted-foreground mt-3 leading-relaxed">
        {abnormal.length} measurement(s) deviate from population norms. Review flagged parameters for clinical significance.
      </p>
    </Card>
  );
}

function KeyMeasurementsCard({ measurements }: { measurements: Measurement[] }) {
  const KEY_CODES = ["SNA", "SNB", "ANB", "FMA", "U1_NA_ang", "L1_NB_ang", "Jarabak", "NasolabialAngle"];
  const key = measurements.filter(m => KEY_CODES.includes(m.code)).slice(0, 8);
  if (!key.length) {
    const first8 = measurements.slice(0, 8);
    if (!first8.length) return null;
    return <KeyMeasurementsCard measurements={first8} />;
  }

  return (
    <Card>
      <SectionHeader label="Key Cephalometric Parameters">
        <Pill tone="neutral" size="xs">Top 8</Pill>
      </SectionHeader>
      <div className="space-y-3">
        {key.map(m => (
          <div key={m.code} className="group">
            <div className="flex items-center justify-between gap-3 mb-1.5">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-[10px] font-bold text-primary shrink-0 w-14 truncate">{m.code}</span>
                <span className="text-xs text-muted-foreground truncate hidden sm:block">{m.name}</span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="font-mono text-xs font-bold text-foreground">{m.value}{m.unit === "deg" ? "°" : m.unit === "mm" ? " mm" : "%"}</span>
                <span className="text-[10px] text-muted-foreground/60 hidden sm:block">{m.normal}</span>
                <Pill tone={severityTone(m.severity)} size="xs" className="font-bold hidden sm:flex">{m.status}</Pill>
              </div>
            </div>
            <DeviationBar value={m.value} normal={m.normal} severity={m.severity} />
          </div>
        ))}
      </div>
    </Card>
  );
}

function qualityRowClass(quality?: string): string {
  if (quality === "review_recommended" || quality === "unreliable")
    return "border-l-2 border-l-warning bg-warning/[0.03]";
  if (quality === "critical_review_required")
    return "border-l-2 border-l-destructive bg-destructive/[0.03]";
  return "";
}

function MeasurementRow({ m }: { m: Measurement }) {
  const unitLabel = m.unit === "deg" ? "°" : m.unit === "mm" ? " mm" : "%";
  const quality = m.qualityStatus;
  const reviewReasons = m.reviewReasons;

  return (
    <div className={cn(
      "group grid grid-cols-[72px_1fr_70px_90px_140px_90px] items-center gap-4 px-5 py-3.5 hover:bg-muted/10 transition-colors border-b border-border/20 last:border-0",
      qualityRowClass(quality),
    )}>
      <span className="text-xs font-bold text-primary truncate">{m.code}</span>
      <div className="min-w-0">
        <span className="text-xs font-medium text-foreground truncate block">{m.name}</span>
        {reviewReasons && reviewReasons.length > 0 && (
          <span className="text-[9px] text-warning truncate block leading-tight mt-0.5" title={reviewReasons.join("; ")}>
            ⚠ {reviewReasons[0]}
          </span>
        )}
      </div>
      <span className="font-mono text-xs font-bold text-foreground text-right">{m.value}{unitLabel}</span>
      <span className="text-[10px] text-muted-foreground">{m.normal}{unitLabel.trim()}</span>
      <DeviationBar value={m.value} normal={m.normal} severity={m.severity} />
      <div className="flex justify-end">
        <Pill tone={severityTone(m.severity)} size="xs" className="font-bold">{m.status}</Pill>
      </div>
    </div>
  );
}

function MeasurementGroupSection({ label, icon: Icon, measurements }: {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  measurements: Measurement[];
}) {
  const [open, setOpen] = useState(true);
  if (!measurements.length) return null;
  const abnormal = measurements.filter(m => m.severity !== "Normal").length;

  return (
    <div className="rounded-2xl border border-border/40 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between gap-3 px-5 py-4 bg-muted/20 hover:bg-muted/30 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-border/40 bg-card text-muted-foreground">
            <Icon className="h-3.5 w-3.5" />
          </div>
          <span className="text-sm font-bold">{label}</span>
          <Pill tone="neutral" size="xs">{measurements.length} params</Pill>
          {abnormal > 0 && <Pill tone="warning" size="xs">{abnormal} flagged</Pill>}
        </div>
        {open ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
      </button>
      {open && (
        <div className="animate-in fade-in slide-in-from-top-1 duration-200">
          <div className="grid grid-cols-[72px_1fr_70px_90px_140px_90px] gap-4 px-5 py-2 border-b border-border/40 bg-muted/10">
            {["Code", "Parameter", "Value", "Normal", "Deviation", "Status"].map(h => (
              <span key={h} className="text-[9px] font-bold uppercase tracking-[0.18em] text-muted-foreground/60">{h}</span>
            ))}
          </div>
          {measurements.map(m => <MeasurementRow key={m.code} m={m} />)}
        </div>
      )}
    </div>
  );
}

function TreatmentCard({ treatment, rank }: { treatment: TreatmentOption; rank: number }) {
  const [expanded, setExpanded] = useState(rank === 0);
  return (
    <div className={cn(
      "rounded-2xl border transition-all duration-300",
      rank === 0 ? "border-primary/30 bg-primary/5" : "border-border/40 bg-muted/10",
      "hover:border-primary/30"
    )}>
      <button
        type="button"
        className="w-full text-left"
        onClick={() => setExpanded(o => !o)}
      >
        <div className="flex items-center gap-4 p-5">
          <div className={cn(
            "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl font-bold text-sm",
            rank === 0 ? "bg-primary/20 text-primary" : "bg-muted/40 text-muted-foreground"
          )}>
            {rank + 1}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-bold text-sm">{treatment.title}</span>
              {rank === 0 && <Pill tone="accent" size="xs">Recommended</Pill>}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5 truncate">{treatment.rationale}</p>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <div className="text-right hidden sm:block">
              <span className={cn("text-lg font-bold", treatment.score >= 85 ? "text-success" : "text-warning")}>{treatment.score}%</span>
              <p className="text-[9px] text-muted-foreground uppercase tracking-widest">match</p>
            </div>
            {expanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
          </div>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-border/40 px-5 pb-5 pt-4 space-y-4 animate-in fade-in slide-in-from-top-1 duration-200">
          <p className="text-sm text-muted-foreground leading-relaxed">{treatment.rationale}</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div className="p-3 rounded-xl bg-muted/20 border border-border/40">
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1">Duration</p>
              <p className="text-sm font-bold">{treatment.duration}</p>
            </div>
            <div className="p-3 rounded-xl bg-muted/20 border border-border/40">
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1">Complexity</p>
              <Pill tone={complexityTone(treatment.complexity)} size="xs" className="font-bold">{treatment.complexity}</Pill>
            </div>
            <div className="p-3 rounded-xl bg-muted/20 border border-border/40">
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1">Match Score</p>
              <p className={cn("text-sm font-bold", treatment.score >= 85 ? "text-success" : "text-warning")}>{treatment.score}%</p>
            </div>
          </div>
          {treatment.evidenceLevel && (
            <div className="flex items-start gap-2 p-3 rounded-xl border border-info/20 bg-info/5">
              <Info className="h-4 w-4 text-info shrink-0 mt-0.5" />
              <p className="text-xs text-muted-foreground leading-relaxed"><span className="font-bold text-foreground">Evidence: </span>{treatment.evidenceLevel}</p>
            </div>
          )}
          {treatment.retentionRecommendation && (
            <div className="flex items-start gap-2 p-3 rounded-xl border border-success/20 bg-success/5">
              <CheckCircle2 className="h-4 w-4 text-success shrink-0 mt-0.5" />
              <p className="text-xs text-muted-foreground leading-relaxed"><span className="font-bold text-foreground">Retention: </span>{treatment.retentionRecommendation}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function GrowthPanel({ activeCase }: { activeCase?: CaseRecord }) {
  const age = activeCase ? (() => {
    const match = activeCase.title.match(/age\s*(\d+)/i);
    return match ? parseInt(match[1]) : null;
  })() : null;

  const stages = [
    { cs: "CS 1", label: "Pre-pubertal", color: "bg-success", detail: "Initiation of growth modifications most effective." },
    { cs: "CS 2", label: "Early acceleration", color: "bg-success", detail: "Functional appliances show maximum response." },
    { cs: "CS 3", label: "Acceleration", color: "bg-warning", detail: "Peak growth velocity — ideal for growth modification." },
    { cs: "CS 4", label: "Deceleration", color: "bg-warning", detail: "Growth slowing; surgical options to be considered." },
    { cs: "CS 5", label: "Near completion", color: "bg-orange-500", detail: "Minimal growth remaining." },
    { cs: "CS 6", label: "Complete", color: "bg-destructive", detail: "Skeletal growth complete. Orthognathic surgery may apply." },
  ];

  return (
    <div className="space-y-6">
      <Card>
        <SectionHeader label="CVM Growth Staging — Baccetti 2002 Protocol">
          <Pill tone="accent" size="xs">Cervical Vertebral Maturation</Pill>
        </SectionHeader>
        <div className="grid gap-3">
          {stages.map((s) => (
            <div key={s.cs} className="flex items-start gap-4 p-4 rounded-xl border border-border/40 bg-muted/10">
              <div className={cn("mt-0.5 h-3 w-3 rounded-full shrink-0", s.color)} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-bold">{s.cs}</span>
                  <span className="text-xs text-muted-foreground">—</span>
                  <span className="text-xs font-medium">{s.label}</span>
                </div>
                <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">{s.detail}</p>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <SectionHeader label="Growth Prediction (Proffit / Petrovic Model)">
          <Pill tone="neutral" size="xs">Estimated projections</Pill>
        </SectionHeader>
        <div className="grid gap-4 sm:grid-cols-3">
          {[
            { label: "Current", years: 0, desc: "Baseline skeletal pattern at time of analysis", color: "border-primary/30 bg-primary/5" },
            { label: "+2 Years", years: 2, desc: "Projected skeletal change with untreated growth", color: "border-warning/30 bg-warning/5" },
            { label: "End of Growth", years: null, desc: "Estimated final skeletal position at maturity", color: "border-success/30 bg-success/5" },
          ].map(p => (
            <div key={p.label} className={cn("p-4 rounded-2xl border", p.color)}>
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">{p.label}</p>
              <p className="text-xs text-muted-foreground leading-relaxed">{p.desc}</p>
              {age && p.years !== null && (
                <p className="mt-2 text-[10px] text-muted-foreground/60">
                  Patient age: {age + p.years}yr
                </p>
              )}
            </div>
          ))}
        </div>
        <div className="mt-4 p-3 rounded-xl border border-border/40 bg-muted/10">
          <p className="text-[10px] text-muted-foreground leading-relaxed">
            <span className="font-bold text-foreground">Disclaimer: </span>
            Growth projections are estimates based on population norms. Individual variation is significant. 
            CVM staging from lateral cephalogram is required for precise timing.
          </p>
        </div>
      </Card>
    </div>
  );
}

// ─── Overlay Grid ─────────────────────────────────────────────────────────────

function OverlayGrid({
  overlays,
}: {
  overlays: OverlayArtifact[];
}) {
  const [lightbox, setLightbox] = useState<OverlayArtifact | null>(null);

  if (!overlays.length) {
    return (
      <Card className="py-16 text-center border-dashed">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted/30 mx-auto mb-4">
          <ImageIcon className="h-7 w-7 text-muted-foreground/30" />
        </div>
        <p className="text-sm font-medium text-muted-foreground">No overlay images available</p>
        <p className="text-xs text-muted-foreground/60 mt-1">
          Run AI analysis and finalize landmarks to generate tracing overlays.
        </p>
      </Card>
    );
  }

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {overlays.map(overlay => (
          <div
            key={overlay.key}
            className="group relative overflow-hidden rounded-2xl border border-border/40 bg-muted/10 cursor-pointer hover:border-primary/30 hover:shadow-md transition-all"
            onClick={() => setLightbox(overlay)}
          >
            <div className="aspect-video relative overflow-hidden bg-black/40">
              <img
                src={overlay.url}
                alt={overlay.label}
                className="w-full h-full object-contain transition-transform duration-300 group-hover:scale-105"
                onError={e => {
                  (e.target as HTMLImageElement).style.display = "none";
                }}
              />
              <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/20 backdrop-blur-sm">
                  <Maximize2 className="h-5 w-5 text-white" />
                </div>
              </div>
            </div>
            <div className="p-3">
              <p className="text-xs font-bold text-foreground">{overlay.label}</p>
              {overlay.width > 0 && (
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  {overlay.width} × {overlay.height} px
                </p>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Lightbox */}
      {lightbox && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm animate-in fade-in duration-200"
          onClick={() => setLightbox(null)}
        >
          <button
            type="button"
            onClick={() => setLightbox(null)}
            className="absolute top-4 right-4 flex h-10 w-10 items-center justify-center rounded-xl bg-white/10 hover:bg-white/20 transition-colors text-white"
          >
            <X className="h-5 w-5" />
          </button>
          <div className="max-w-5xl max-h-[90vh] p-4" onClick={e => e.stopPropagation()}>
            <img
              src={lightbox.url}
              alt={lightbox.label}
              className="max-w-full max-h-[80vh] object-contain rounded-xl shadow-2xl"
            />
            <div className="mt-3 text-center">
              <p className="text-sm font-bold text-white">{lightbox.label}</p>
              {lightbox.width > 0 && (
                <p className="text-xs text-white/60 mt-0.5">{lightbox.width} × {lightbox.height} px</p>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function ResultsPage({
  activeCase,
  reports,
  artifacts,
  overlays = [],
  onRequestReport,
}: ResultsPageProps) {
  const { diagnosis, measurements, treatments } = artifacts;
  const [tab, setTab] = useState<ResultsTab>("overview");
  const [search, setSearch] = useState("");
  const [filterAbnormal, setFilterAbnormal] = useState(false);

  const caseReports = reports.filter(r => r.caseId === activeCase?.id);

  const filteredMeasurements = useMemo(() => {
    let ms = measurements;
    if (search) ms = ms.filter(m => m.name.toLowerCase().includes(search.toLowerCase()) || m.code.toLowerCase().includes(search.toLowerCase()));
    if (filterAbnormal) ms = ms.filter(m => m.severity !== "Normal");
    return ms;
  }, [measurements, search, filterAbnormal]);

  const abnormalCount = measurements.filter(m => m.severity !== "Normal").length;

  const tabs: { id: ResultsTab; label: string; icon: React.ComponentType<{ className?: string }>; badge?: string | number }[] = [
    { id: "overview", label: "Overview", icon: Brain },
    { id: "measurements", label: "Measurements", icon: BarChart3, badge: abnormalCount > 0 ? `${abnormalCount} flagged` : measurements.length },
    { id: "treatment", label: "Treatment", icon: Stethoscope, badge: treatments.length },
    { id: "overlays", label: "Overlays", icon: Layers3, badge: overlays.length || undefined },
    { id: "growth", label: "Growth", icon: TrendingUp },
    { id: "reports", label: "Reports", icon: FileText, badge: caseReports.length || undefined },
  ];

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <PageHeader
        eyebrow="Diagnostic Output"
        title="Analysis Results"
        description="AI-generated skeletal classification, cephalometric measurements with deviation analysis, overlay tracings, and evidence-based treatment planning."
        actions={
          <div className="flex gap-2">
            <PrimaryBtn onClick={() => onRequestReport("PDF")} icon={FileText}>Export PDF</PrimaryBtn>
            <SecondaryBtn onClick={() => onRequestReport("Word")} icon={FileCheck2}>Export Word</SecondaryBtn>
          </div>
        }
      />

      <TabBar
        tabs={tabs}
        active={tab}
        onChange={setTab}
        className="overflow-x-auto"
      />

      {/* ── Overview ── */}
      {tab === "overview" && (
        <div className="space-y-6 animate-in fade-in duration-300">
          <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
            <DiagnosisCard diagnosis={diagnosis} />
            <div className="space-y-6">
              <KeyMeasurementsCard measurements={measurements} />
              <NormativeComparisonPanel measurements={measurements} />
              <LandmarkQualitySummary measurements={measurements} />
              <RiskFactorSummary diagnosis={diagnosis} />
              {treatments[0] && (
              <Card className="border-primary/20 bg-primary/5">
                <SectionHeader label="Top Treatment Recommendation">
                  <Pill tone="accent" size="xs">AI-ranked #1</Pill>
                </SectionHeader>
                <div className="flex items-start gap-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/20 text-primary font-bold">1</div>
                  <div>
                    <p className="font-bold">{treatments[0].title}</p>
                    <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{treatments[0].rationale}</p>
                    <div className="flex gap-2 mt-3 flex-wrap">
                      <Pill tone="neutral" size="xs" className="uppercase">{treatments[0].duration}</Pill>
                      <Pill tone={complexityTone(treatments[0].complexity)} size="xs" className="uppercase">{treatments[0].complexity} complexity</Pill>
                      <Pill tone={treatments[0].score >= 85 ? "success" : "warning"} size="xs">{treatments[0].score}% match</Pill>
                    </div>
                  </div>
                </div>
              </Card>
            )}
              {overlays.length > 0 && (
                <Card className="border-border/40">
                  <SectionHeader label="Overlay Preview">
                    <Pill tone="neutral" size="xs">{overlays.length} images</Pill>
                  </SectionHeader>
                  <div className="grid grid-cols-2 gap-2">
                    {overlays.slice(0, 4).map(o => (
                      <div key={o.key} className="aspect-video rounded-xl overflow-hidden bg-black/30">
                        <img src={o.url} alt={o.label} className="w-full h-full object-contain" />
                      </div>
                    ))}
                  </div>
                  {overlays.length > 4 && (
                    <button
                      type="button"
                      onClick={() => setTab("overlays")}
                      className="mt-3 text-xs text-primary font-bold hover:underline"
                    >
                      View all {overlays.length} overlays →
                    </button>
                  )}
                </Card>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Measurements ── */}
      {tab === "measurements" && (
        <div className="space-y-5 animate-in fade-in duration-300">
          <div className="flex items-center gap-3 flex-wrap">
            <SearchInput
              value={search}
              onChange={setSearch}
              placeholder="Search measurements…"
              className="max-w-xs"
            />
            <button
              type="button"
              onClick={() => setFilterAbnormal(o => !o)}
              className={cn(
                "flex items-center gap-2 h-10 px-4 rounded-xl border text-xs font-bold transition-all",
                filterAbnormal
                  ? "border-warning/40 bg-warning/10 text-warning"
                  : "border-border/60 bg-muted/20 text-muted-foreground hover:bg-muted/30"
              )}
            >
              <Filter className="h-3.5 w-3.5" />
              {filterAbnormal ? "Showing flagged" : "Show flagged only"}
            </button>
            <Pill tone="neutral" size="sm">{filteredMeasurements.length} parameters</Pill>
            {abnormalCount > 0 && <Pill tone="warning" size="sm">{abnormalCount} outside normal range</Pill>}
          </div>

          {MEASUREMENT_GROUPS.map(group => {
            const groupMs = filteredMeasurements.filter(m => group.codes.includes(m.code));
            if (!groupMs.length && search) return null;
            const allMs = search || filterAbnormal
              ? groupMs
              : filteredMeasurements.filter(m => group.codes.includes(m.code));
            return (
              <MeasurementGroupSection
                key={group.label}
                label={group.label}
                icon={group.icon}
                measurements={allMs}
              />
            );
          })}

          {(() => {
            const knownCodes = MEASUREMENT_GROUPS.flatMap(g => g.codes);
            const ungrouped = filteredMeasurements.filter(m => !knownCodes.includes(m.code));
            if (!ungrouped.length) return null;
            return (
              <MeasurementGroupSection
                label="Other Parameters"
                icon={Activity}
                measurements={ungrouped}
              />
            );
          })()}
        </div>
      )}

      {/* ── Treatment ── */}
      {tab === "treatment" && (
        <div className="space-y-4 animate-in fade-in duration-300">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <h2 className="text-lg font-bold">AI-Ranked Treatment Strategies</h2>
              <p className="text-xs text-muted-foreground mt-0.5">{treatments.length} options ranked by clinical suitability score</p>
            </div>
            <Pill tone="accent" size="sm">Machine Learning Assisted</Pill>
          </div>
          {treatments.length === 0 ? (
            <Card className="py-12 text-center">
              <Sparkles className="h-12 w-12 text-muted-foreground/20 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">Run AI analysis to generate treatment recommendations.</p>
            </Card>
          ) : (
            <div className="space-y-3">
              {treatments.map((t, i) => <TreatmentCard key={t.title} treatment={t} rank={i} />)}
            </div>
          )}
        </div>
      )}

      {/* ── Overlays ── */}
      {tab === "overlays" && (
        <div className="space-y-5 animate-in fade-in duration-300">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <h2 className="text-lg font-bold">Cephalometric Tracing Overlays</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                AI-generated landmark tracings, skeletal outlines, and diagnostic overlays — click any image to enlarge
              </p>
            </div>
            {overlays.length > 0 && <Pill tone="neutral" size="sm">{overlays.length} overlay images</Pill>}
          </div>
          <OverlayGrid overlays={overlays} />
        </div>
      )}

      {/* ── Growth ── */}
      {tab === "growth" && (
        <div className="animate-in fade-in duration-300">
          <GrowthPanel activeCase={activeCase} />
        </div>
      )}

      {/* ── Reports ── */}
      {tab === "reports" && (
        <div className="space-y-5 animate-in fade-in duration-300">
          <Card>
            <SectionHeader label="Export Clinical Report" />
            <div className="grid gap-4 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => onRequestReport("PDF")}
                className="flex items-center gap-4 p-5 rounded-2xl border border-border/40 bg-muted/10 hover:border-primary/30 hover:bg-primary/5 transition-all group"
              >
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-border/40 bg-card text-destructive group-hover:border-destructive/30 group-hover:bg-destructive/10 transition-all">
                  <FileText className="h-6 w-6" />
                </div>
                <div className="text-left">
                  <p className="font-bold">PDF Report</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Full clinical report with measurements, diagnosis, and treatment plan</p>
                </div>
              </button>
              <button
                type="button"
                onClick={() => onRequestReport("Word")}
                className="flex items-center gap-4 p-5 rounded-2xl border border-border/40 bg-muted/10 hover:border-primary/30 hover:bg-primary/5 transition-all group"
              >
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-border/40 bg-card text-primary group-hover:border-primary/30 group-hover:bg-primary/10 transition-all">
                  <FileCheck2 className="h-6 w-6" />
                </div>
                <div className="text-left">
                  <p className="font-bold">Word Document</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Editable .docx format for custom clinical documentation</p>
                </div>
              </button>
            </div>
          </Card>

          {caseReports.length > 0 ? (
            <Card noPadding className="overflow-hidden">
              <div className="px-6 py-4 border-b border-border/40 bg-muted/10">
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">Generated Reports</p>
              </div>
              <div className="divide-y divide-border/20">
                {caseReports.map(r => (
                  <div key={r.id} className="flex items-center justify-between gap-4 px-6 py-4 hover:bg-muted/10 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-border/40 bg-card text-primary">
                        <FileText className="h-4 w-4" />
                      </div>
                      <div>
                        <p className="text-sm font-bold">{r.patientName} — {r.format}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <Calendar className="h-3 w-3 text-muted-foreground" />
                          <p className="text-[10px] text-muted-foreground">{r.generatedAt} · {r.size}</p>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Pill tone={reportTone(r.status)} size="xs">{r.status}</Pill>
                      {r.url && (
                        <>
                          <button
                            type="button"
                            onClick={() => window.open(r.url, "_blank", "noopener,noreferrer")}
                            className="flex items-center gap-1.5 h-8 px-3 rounded-lg border border-border/60 bg-muted/20 text-xs font-medium hover:bg-muted/40 transition-colors"
                          >
                            <Eye className="h-3 w-3" /> Preview
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              const a = document.createElement("a");
                              a.href = r.url!;
                              a.download = `${r.patientName.replace(/\s+/g, "-").toLowerCase()}-${r.format.toLowerCase()}`;
                              a.target = "_blank";
                              a.rel = "noopener noreferrer";
                              document.body.appendChild(a);
                              a.click();
                              a.remove();
                            }}
                            className="flex items-center gap-1.5 h-8 px-3 rounded-lg border border-primary/30 bg-primary/10 text-xs font-medium text-primary hover:bg-primary/20 transition-colors"
                          >
                            <Download className="h-3 w-3" /> Download
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          ) : (
            <Card className="py-10 text-center border-dashed">
              <FileText className="h-12 w-12 text-muted-foreground/20 mx-auto mb-3" />
              <p className="text-sm font-medium text-muted-foreground">No reports generated yet</p>
              <p className="text-xs text-muted-foreground/60 mt-1">Generate a PDF or Word report using the buttons above.</p>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
