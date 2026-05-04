import React, { useState, useMemo } from "react";
import {
  FileText, FileCheck2, Eye, Download, Sparkles, Activity, AlertTriangle,
  ClipboardCheck, BarChart3, Brain, TrendingUp, Target, Search, Filter,
  Stethoscope, Bone, Wind, Smile, ChevronDown, ChevronRight, CheckCircle2,
  Info, Layers3, Calendar, X, ImageIcon, Maximize2, ShieldAlert, Vote,
  Gauge, Zap, FileDown, Hospital, AlertOctagon, PenLine, ArrowRight,
} from "lucide-react";
import {
  Card, Pill, PrimaryBtn, SecondaryBtn, PageHeader,
  Divider, TabBar, DeviationBar, SearchInput, SectionHeader,
} from "@/components/_core/ClinicalComponents";
import {
  type CaseRecord, type Report, type ClinicalArtifacts, type ReportFormat,
  type Measurement, type TreatmentOption, type OverlayArtifact, type SkeletalConsensus,
} from "@/lib/mappers";
import { cn } from "@/lib/utils";

// ─── Population Norm Offsets (mirrors ai_service/utils/norms_util.py) ─────────

type PopulationKey = "caucasian" | "asian" | "african" | "mixed";

const POPULATION_LABELS: Record<PopulationKey, string> = {
  caucasian: "Caucasian",
  asian: "Asian",
  african: "African",
  mixed: "Mixed",
};

const COMPARE_POPS: PopulationKey[] = ["caucasian", "asian", "african", "mixed"];

const POPULATION_OFFSETS: Record<PopulationKey, Record<string, [number, number]>> = {
  caucasian: {},
  asian: {
    SNA: [+1.5, +1.5], SNB: [+1.5, +1.5], ANB: [0.0, 0.0], "SN-GOGN": [+1.0, +1.0],
    FMA: [+1.0, +1.0], MIDFACELEN: [-2.0, -2.0], MANDLENGTH: [-3.0, -3.0],
    "UI-NA_DEG": [+2.0, +2.0], U1_NA_ANG: [+2.0, +2.0], "LI-NB_DEG": [+1.5, +1.5],
    L1_NB_ANG: [+1.5, +1.5],
  },
  african: {
    SNA: [+2.5, +2.5], SNB: [+1.5, +1.5], ANB: [+1.0, +1.0], FMA: [+2.0, +2.0],
    "SN-GOGN": [+1.5, +1.5], "UI-NA_DEG": [+3.0, +3.0], U1_NA_ANG: [+3.0, +3.0],
    "LI-NB_DEG": [+2.5, +2.5], L1_NB_ANG: [+2.5, +2.5], IMPA: [+3.0, +3.0],
    MANDLENGTH: [+2.0, +2.0],
  },
  mixed: {},
};

function parseNormalRange(normal: string): [number, number] | null {
  const m = normal.replace("–", "-").match(/^(-?[\d.]+)-(-?[\d.]+)$/);
  if (!m) return null;
  return [parseFloat(m[1]), parseFloat(m[2])];
}

function deriveStatus(value: number, min: number, max: number): "Normal" | "Increased" | "Decreased" {
  if (value < min) return "Decreased";
  if (value > max) return "Increased";
  return "Normal";
}

function adjustedRange(code: string, normal: string, pop: PopulationKey): [number, number] | null {
  const base = parseNormalRange(normal);
  if (!base) return null;
  const offsets = POPULATION_OFFSETS[pop];
  const [dMin, dMax] = offsets[code.toUpperCase()] ?? offsets[code] ?? [0, 0];
  return [base[0] + dMin, base[1] + dMax];
}

// ─── CSV Export Helper ────────────────────────────────────────────────────────

function exportMeasurementsCSV(measurements: Measurement[], caseTitle?: string) {
  const header = ["Code", "Name", "Value", "Unit", "Normal Range", "Status", "Severity", "Quality"];
  const rows = measurements.map(m => [
    m.code, `"${m.name}"`, m.calibrationRequired ? "Calibration required" : (m.value ?? ""),
    m.unit === "deg" ? "°" : m.unit, m.normal, m.status, m.severity, m.qualityStatus ?? "",
  ]);
  const csv = [header, ...rows].map(row => row.join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${(caseTitle ?? "cephalometric-analysis").replace(/\s+/g, "-").toLowerCase()}-measurements.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// ─── Types ────────────────────────────────────────────────────────────────────

type ResultsTab = "overview" | "measurements" | "treatment" | "overlays" | "growth" | "reports";

interface ResultsPageProps {
  activeCase?: CaseRecord;
  reports: Report[];
  artifacts: ClinicalArtifacts;
  overlays?: OverlayArtifact[];
  onRequestReport: (f: ReportFormat) => void | Promise<void>;
}

// ─── Measurement Groups ───────────────────────────────────────────────────────

const MEASUREMENT_GROUPS: { label: string; icon: React.ComponentType<{ className?: string }>; codes: string[] }[] = [
  { label: "Steiner / Skeletal", icon: Bone, codes: ["SNA", "SNB", "ANB", "SNPog", "NAPog", "SN_OcP", "SN_GoGn", "FMA", "FacialAngle", "ConvexityAngle"] },
  { label: "McNamara", icon: Target, codes: ["NaPerp_A", "NaPerp_Pog", "CoA", "CoGn", "MxLen", "MdLen", "LFH", "UFH"] },
  { label: "Vertical / Jarabak", icon: Activity, codes: ["Jarabak", "PFH", "AFH", "ODI", "APDI", "CF", "MP_SN", "GoGn_SN"] },
  { label: "Dental", icon: Smile, codes: ["U1_NA_ang", "U1_NA_mm", "L1_NB_ang", "L1_NB_mm", "U1_L1", "L1_APog", "U1_FH", "L1_MP"] },
  { label: "Soft Tissue", icon: Layers3, codes: ["NasolabialAngle", "ULip_EP", "LLip_EP", "MentolabialSulcus", "FacialConvexity_st", "UpperLipProtrusion", "LowerLipProtrusion"] },
  { label: "Airway / CVM", icon: Wind, codes: ["MPH", "PNW", "PPW", "AirwayRatio", "CVM_C2", "CVM_C3", "CVM_C4"] },
];

// ─── Status Helpers ───────────────────────────────────────────────────────────

function severityTone(s: string): "success" | "warning" | "danger" | "neutral" {
  if (s === "Normal") return "success";
  if (s === "Mild") return "warning";
  if (s === "Moderate" || s === "Severe") return "danger";
  return "neutral";
}

function statusToneClass(status: string) {
  if (status === "Normal") return "text-emerald-500";
  if (status === "Increased") return "text-amber-500";
  return "text-sky-500";
}

function statusDot(status: string) {
  if (status === "Normal") return "bg-emerald-500";
  if (status === "Increased") return "bg-amber-500";
  return "bg-sky-500";
}

// ─── Sub-components (restyled) ────────────────────────────────────────────────

function LandmarkQualitySummary({ measurements }: { measurements: Measurement[] }) {
  const flagged = measurements.filter(m => m.reviewReasons?.length);
  if (!flagged.length) {
    return (
      <div className="flex items-center gap-4 p-6 rounded-[24px] border border-emerald-500/20 bg-emerald-500/5 backdrop-blur-md">
        <div className="h-12 w-12 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-500 shadow-sm">
          <CheckCircle2 className="h-6 w-6" />
        </div>
        <div>
          <p className="text-sm font-black tracking-tight">Telemetry Optimal</p>
          <p className="text-[10px] font-black uppercase tracking-widest text-emerald-600/60 mt-1">{measurements.length} High-Confidence Points</p>
        </div>
      </div>
    );
  }
  return (
    <div className="p-6 rounded-[24px] border border-amber-500/20 bg-amber-500/5 backdrop-blur-md space-y-4">
      <div className="flex items-center gap-4">
        <div className="h-12 w-12 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-500 shadow-sm">
          <AlertTriangle className="h-6 w-6" />
        </div>
        <div>
          <p className="text-sm font-black tracking-tight">Metric Validation Flags</p>
          <p className="text-[10px] font-black uppercase tracking-widest text-amber-600/60 mt-1">{flagged.length} Points Under Review</p>
        </div>
      </div>
      <div className="space-y-2">
        {flagged.slice(0, 3).map(m => (
          <div key={m.code} className="flex items-center gap-3 text-[11px] font-bold text-amber-700/80 bg-background/40 px-3 py-2 rounded-xl border border-amber-500/10">
            <span className="text-amber-500 font-mono">{m.code}</span>
            <span className="opacity-30">|</span>
            <span className="truncate">{m.reviewReasons?.[0] || "Review recommended"}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function RiskFactorSummary({ diagnosis }: { diagnosis: any }) {
  const riskFactors = [];
  if (diagnosis.airwayRiskScore != null) {
    const airwayLevel = diagnosis.airwayRiskScore >= 7 ? "High" : diagnosis.airwayRiskScore >= 4 ? "Moderate" : "Low";
    riskFactors.push({ label: "Airway Risk", value: airwayLevel, score: diagnosis.airwayRiskScore, icon: Wind });
  }
  if (diagnosis.warnings?.length > 0) {
    riskFactors.push({ label: "Skeletal Flags", value: `${diagnosis.warnings.length} Active`, icon: ShieldAlert });
  }
  if (!riskFactors.length) return null;
  return (
    <div className="space-y-3">
      {riskFactors.map((rf, i) => {
        const Icon = rf.icon;
        const isHigh = rf.label === "Airway Risk" && rf.score >= 7;
        return (
          <div key={i} className="flex items-center justify-between p-5 rounded-[24px] border border-border/40 bg-muted/10 group hover:bg-muted/20 transition-all backdrop-blur-md">
            <div className="flex items-center gap-4">
              <div className="h-9 w-9 rounded-xl bg-muted/30 border border-border/40 flex items-center justify-center text-muted-foreground group-hover:text-primary transition-colors">
                <Icon className="h-4 w-4" />
              </div>
              <span className="text-xs font-black uppercase tracking-widest text-foreground/60">{rf.label}</span>
            </div>
            <Pill tone={isHigh ? "danger" : "warning"} size="sm">{rf.value}</Pill>
          </div>
        );
      })}
    </div>
  );
}

function NormativeComparisonPanel({ measurements, selectedPopulation, onPopulationChange }: { measurements: Measurement[]; selectedPopulation: string; onPopulationChange: (pop: string) => void }) {
  const abnormal = measurements.filter(m => m.severity !== "Normal");
  const stats = {
    mild: abnormal.filter(m => m.severity === "Mild").length,
    moderate: abnormal.filter(m => m.severity === "Moderate").length,
    severe: abnormal.filter(m => m.severity === "Severe").length,
  };

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "Mild Deviation", count: stats.mild, tone: "text-amber-500", bg: "bg-amber-500/10" },
          { label: "Moderate Class", count: stats.moderate, tone: "text-orange-500", bg: "bg-orange-500/10" },
          { label: "Severe Anomaly", count: stats.severe, tone: "text-destructive", bg: "bg-destructive/10" },
        ].map(stat => (
          <div key={stat.label} className={cn("p-6 rounded-[24px] border border-border/40 shadow-sm relative overflow-hidden group backdrop-blur-md transition-all", stat.bg)}>
            <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:scale-125 transition-transform">
              <TrendingUp className="h-10 w-10" />
            </div>
            <p className="text-[10px] font-black uppercase tracking-[0.15em] text-muted-foreground/60 mb-2">{stat.label}</p>
            <p className={cn("text-3xl font-black tracking-tight tabular-nums", stat.tone)}>
              {stat.count}
            </p>
          </div>
        ))}
      </div>
      <div className="p-5 rounded-[24px] border border-border/20 bg-muted/10 backdrop-blur-md flex items-start gap-4">
        <Info className="h-5 w-5 text-primary shrink-0 mt-0.5 opacity-40" />
        <p className="text-sm text-muted-foreground font-medium leading-relaxed italic">
          Detected <span className="text-foreground font-black">{abnormal.length} clinical outliers</span> relative to {selectedPopulation} normative benchmarks. Review outliers for surgical or orthodontic significance.
        </p>
      </div>
    </div>
  );
}

function ConsensusMiniBar({ consensus }: { consensus: SkeletalConsensus }) {
  const classColor: Record<string, string> = {
    ClassI: "bg-emerald-500",
    ClassII: "bg-amber-500",
    ClassIII: "bg-rose-500",
  };
  const classLabel: Record<string, string> = {
    ClassI: "I", ClassII: "II", ClassIII: "III",
  };
  const typeTone: Record<string, string> = {
    Definitive: "text-emerald-500",
    Borderline: "text-amber-500",
    Conflicting: "text-rose-500",
  };

  return (
    <div className="p-6 rounded-[24px] border border-border/40 bg-muted/10 backdrop-blur-md space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3 text-muted-foreground">
          <div className="h-8 w-8 rounded-lg bg-primary/5 flex items-center justify-center text-primary border border-primary/10">
            <Vote className="h-4 w-4" />
          </div>
          <span className="text-[10px] font-black uppercase tracking-widest">Multi-Metric Synthesis</span>
        </div>
        <div className="flex items-center gap-3">
          <span className={cn("text-[10px] font-black uppercase tracking-widest", typeTone[consensus.consensus_type] ?? "text-muted-foreground")}>
            {consensus.consensus_type} Synthesis
          </span>
          <span className="text-xs font-black tabular-nums bg-background/60 px-2 py-0.5 rounded-lg border border-border/40">
            {consensus.agreement_pct}% Concordance
          </span>
        </div>
      </div>

      <div className="flex gap-2 flex-wrap">
        {consensus.votes.map(v => (
          <div
            key={v.metric}
            className={cn(
              "flex items-center gap-3 px-3 py-1.5 rounded-xl border text-[10px] font-black uppercase tracking-tight transition-all",
              v.vote === consensus.consensus_class
                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-500 shadow-sm shadow-emerald-500/5"
                : "border-amber-500/30 bg-amber-500/10 text-amber-500"
            )}
          >
            <span className="opacity-60">{v.metric}</span>
            <span className="opacity-20">|</span>
            <span>Class {classLabel[v.vote] ?? v.vote}</span>
          </div>
        ))}
      </div>

      <div className="space-y-3">
        {Object.entries(consensus.probabilities)
          .sort(([, a], [, b]) => b - a)
          .map(([cls, prob]) => (
            <div key={cls} className="flex items-center gap-4">
              <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60 w-20 shrink-0">Class {classLabel[cls] ?? cls}</span>
              <div className="flex-1 h-2.5 rounded-full bg-muted/40 border border-border/10 overflow-hidden relative">
                <div
                  className={cn("h-full rounded-full transition-all duration-1000 shadow-sm", classColor[cls] ?? "bg-muted-foreground")}
                  style={{ width: `${Math.round(prob * 100)}%` }}
                />
              </div>
              <span className="text-xs font-black tabular-nums text-muted-foreground w-10 text-right">{Math.round(prob * 100)}%</span>
            </div>
          ))}
      </div>
    </div>
  );
}

function AirwayRiskGauge({ score }: { score: number }) {
  const clampedScore = Math.max(0, Math.min(10, score));
  const riskLabel = clampedScore <= 3 ? "Low" : clampedScore <= 5 ? "Mild" : clampedScore <= 7 ? "Moderate" : "High";
  const riskTone = clampedScore <= 3 ? "text-emerald-500" : clampedScore <= 5 ? "text-amber-500" : "text-rose-500";
  const barColor = clampedScore <= 3 ? "bg-emerald-500" : clampedScore <= 5 ? "bg-amber-500" : "bg-rose-500";

  return (
    <div className="p-6 rounded-[24px] border border-border/40 bg-muted/10 backdrop-blur-md">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3 text-muted-foreground">
          <div className="h-8 w-8 rounded-lg bg-primary/5 flex items-center justify-center text-primary border border-primary/10">
            <Gauge className="h-4 w-4" />
          </div>
          <span className="text-[10px] font-black uppercase tracking-widest">Airway Restriction Score</span>
        </div>
        <div className="flex items-center gap-3">
          <span className={cn("text-xl font-black tabular-nums tracking-tighter", riskTone)}>{clampedScore.toFixed(0)}<span className="text-[10px] opacity-40 ml-1">/ 10</span></span>
          <Pill
            tone={clampedScore <= 3 ? "success" : clampedScore <= 5 ? "warning" : "danger"}
            size="sm"
          >{riskLabel} Risk</Pill>
        </div>
      </div>
      <div className="h-3 w-full rounded-full bg-muted/60 border border-border/10 overflow-hidden relative">
        <div
          className={cn("h-full rounded-full transition-all duration-1000 shadow-md", barColor)}
          style={{ width: `${(clampedScore / 10) * 100}%` }}
        />
        <div className="absolute inset-0 loading-sheen opacity-20 pointer-events-none" />
      </div>
      <div className="flex justify-between mt-2 px-1">
        {[0, 2, 4, 6, 8, 10].map(tick => (
          <span key={tick} className="text-[9px] font-black text-muted-foreground/30">{tick}</span>
        ))}
      </div>
    </div>
  );
}

function CVMStageCard({ cvm }: { cvm: any }) {
  if (!cvm) return null;
  const stageColors: Record<string, string> = {
    "CS 1": "bg-emerald-500 text-emerald-50 border-emerald-600/20",
    "CS 2": "bg-emerald-500 text-emerald-50 border-emerald-600/20",
    "CS 3": "bg-amber-500 text-amber-50 border-amber-600/20",
    "CS 4": "bg-amber-500 text-amber-50 border-amber-600/20",
    "CS 5": "bg-orange-500 text-white border-orange-600/20",
    "CS 6": "bg-rose-500 text-rose-50 border-rose-600/20",
  };
  const stageColor = stageColors[cvm.stage] || "bg-muted text-muted-foreground";

  return (
    <div className="p-6 rounded-[24px] border border-border/40 bg-muted/10 backdrop-blur-md mb-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3 text-muted-foreground">
          <div className="h-8 w-8 rounded-lg bg-primary/5 flex items-center justify-center text-primary border border-primary/10">
            <Activity className="h-4 w-4" />
          </div>
          <span className="text-[10px] font-black uppercase tracking-widest">CVM Skeletal Maturity</span>
        </div>
        <span className={cn("text-xs font-black px-3 py-1.5 rounded-xl border shadow-sm", stageColor)}>{cvm.stage}</span>
      </div>
      <p className="text-sm text-muted-foreground leading-relaxed font-medium mb-4">{cvm.description}</p>
      <div className="flex items-center gap-3 pt-4 border-t border-border/10">
        <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/40">Growth Potential:</span>
        <Pill tone={cvm.growth_status === "Complete" ? "neutral" : "warning"} size="xs" className="font-black">{cvm.growth_status.toUpperCase()}</Pill>
      </div>
    </div>
  );
}

function DentalSkeletalDifferentialPanel({ diff }: { diff: any }) {
  if (!diff) return null;
  const skelPct = Math.round(diff.skeletal_evidence_pct ?? 0);
  const dentalPct = Math.round(diff.dental_evidence_pct ?? 0);

  return (
    <div className="p-6 rounded-[24px] border border-border/40 bg-muted/10 backdrop-blur-md mb-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="h-8 w-8 rounded-lg bg-primary/5 flex items-center justify-center text-primary border border-primary/10">
          <Smile className="h-4 w-4" />
        </div>
        <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Etiological Differential</span>
      </div>
      <div className="grid grid-cols-2 gap-6 mb-6">
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60">Skeletal Base</span>
            <span className="text-xs font-black tabular-nums">{skelPct}%</span>
          </div>
          <div className="h-2 w-full rounded-full bg-muted/60 border border-border/10 overflow-hidden">
            <div className="h-full bg-primary rounded-full shadow-sm" style={{ width: `${skelPct}%` }} />
          </div>
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60">Dentoalveolar</span>
            <span className="text-xs font-black tabular-nums">{dentalPct}%</span>
          </div>
          <div className="h-2 w-full rounded-full bg-muted/60 border border-border/10 overflow-hidden">
            <div className="h-full bg-emerald-500 rounded-full shadow-sm" style={{ width: `${dentalPct}%` }} />
          </div>
        </div>
      </div>
      <div className="p-4 rounded-2xl bg-card/40 border border-border/40">
        <p className="text-xs text-muted-foreground leading-relaxed font-medium italic">{diff.interpretation}</p>
      </div>
    </div>
  );
}

function DiagnosisCard({ diagnosis }: { diagnosis: ClinicalArtifacts["diagnosis"] }) {
  const confPct = Math.round((diagnosis.confidence || 0.85) * 100);

  return (
    <Card className="p-8 glass-premium shadow-lg-professional border-primary/20 hover-glow transition-all duration-700 relative overflow-hidden group/diag">
      <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-sky-500/10 opacity-30 group-hover/diag:opacity-50 transition-opacity duration-1000" />

      <div className="relative space-y-8">
        {diagnosis.aiDisclaimer && (
          <div className="flex items-start gap-4 p-4 rounded-[24px] border border-destructive/20 bg-destructive/5 backdrop-blur-md">
            <ShieldAlert className="h-5 w-5 text-destructive shrink-0 mt-0.5 animate-pulse" />
            <p className="text-[11px] font-medium leading-relaxed text-muted-foreground">
              <span className="font-black text-destructive uppercase tracking-widest mr-2 text-[10px]">Clinical Notice:</span>
              {diagnosis.aiDisclaimer}
            </p>
          </div>
        )}

        <div className="flex items-start justify-between gap-6">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-primary" />
              <p className="text-[10px] font-black uppercase tracking-[0.3em] text-primary/80">Diagnostic Synthesis</p>
            </div>
            <h2 className="text-4xl font-black tracking-tight leading-tight">
              {diagnosis.skeletalClass} Pattern
            </h2>
          </div>
          <div className="h-16 w-16 rounded-[24px] bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shadow-xl shadow-primary/10 transition-transform duration-700 group-hover/diag:rotate-12 group-hover/diag:scale-110">
            <Brain className="h-8 w-8" />
          </div>
        </div>

        <p className="text-lg text-muted-foreground leading-relaxed font-medium">
          {diagnosis.summary}
        </p>

        <div className="grid gap-4 sm:grid-cols-2">
          {[
            { label: "Vertical Morphology", value: diagnosis.verticalPattern, icon: BarChart3 },
            { label: "Soft Tissue Profile", value: diagnosis.softTissueProfile, icon: Smile },
          ].map(item => (
            <div key={item.label} className="p-5 rounded-[24px] border border-border/40 bg-muted/10 group/item hover:bg-muted/20 transition-all border-l-primary border-l-4">
              <div className="flex items-center gap-2 mb-2 opacity-40">
                <item.icon className="h-3 w-3" />
                <span className="text-[10px] font-black uppercase tracking-[0.15em]">{item.label}</span>
              </div>
              <p className="text-base font-black tracking-tight">{item.value}</p>
            </div>
          ))}
        </div>

        <div className="p-6 rounded-[24px] border border-border/40 bg-muted/20 flex items-center justify-between group-hover/diag:border-primary/20 transition-all">
          <div className="space-y-1">
            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/40">Inference Confidence</p>
            <p className={cn("text-2xl font-black tabular-nums tracking-tighter", confPct >= 80 ? "text-emerald-500" : "text-amber-500")}>{confPct}%</p>
          </div>
          <div className="flex-1 max-w-[200px] ml-10">
            <div className="h-3 w-full rounded-full bg-muted/60 border border-border/20 overflow-hidden relative">
              <div
                className={cn("absolute inset-y-0 left-0 rounded-full transition-all duration-1000", confPct >= 80 ? "bg-emerald-500" : "bg-amber-500")}
                style={{ width: `${confPct}%` }}
              />
              <div className="absolute inset-0 loading-sheen opacity-30" />
            </div>
          </div>
        </div>

        {diagnosis.skeletalConsensus && <ConsensusMiniBar consensus={diagnosis.skeletalConsensus} />}
        {diagnosis.cvmStaging && <CVMStageCard cvm={diagnosis.cvmStaging} />}
        {diagnosis.airwayRiskScore != null && <AirwayRiskGauge score={diagnosis.airwayRiskScore} />}
        {diagnosis.dentalSkeletalDifferential && <DentalSkeletalDifferentialPanel diff={diagnosis.dentalSkeletalDifferential} />}

        {(diagnosis.warnings.length > 0 || diagnosis.clinicalNotes.length > 0) && (
          <div className="grid gap-6 md:grid-cols-2">
            {diagnosis.warnings.length > 0 && (
              <div className="p-6 rounded-[32px] border border-rose-500/20 bg-rose-500/5 backdrop-blur-md">
                <div className="flex items-center gap-3 mb-4 text-rose-500">
                  <AlertOctagon className="h-5 w-5" />
                  <span className="text-[10px] font-black uppercase tracking-widest">Clinical Warnings</span>
                </div>
                <ul className="space-y-3">
                  {diagnosis.warnings.map(w => (
                    <li key={w} className="text-xs text-muted-foreground font-medium leading-relaxed flex items-start gap-3">
                      <span className="h-1 w-1 rounded-full bg-rose-500 mt-1.5 shrink-0" />
                      {w}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {diagnosis.clinicalNotes.length > 0 && (
              <div className="p-6 rounded-[32px] border border-primary/20 bg-primary/5 backdrop-blur-md">
                <div className="flex items-center gap-3 mb-4 text-primary">
                  <ClipboardCheck className="h-5 w-5" />
                  <span className="text-[10px] font-black uppercase tracking-widest">Clinician Insights</span>
                </div>
                <ul className="space-y-3">
                  {diagnosis.clinicalNotes.map(n => (
                    <li key={n} className="text-xs text-muted-foreground font-medium leading-relaxed flex items-start gap-3">
                      <span className="h-1 w-1 rounded-full bg-primary mt-1.5 shrink-0" />
                      {n}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}

function SectionTitle({ icon: Icon, label }: { icon: React.ElementType; label: string }) {
  return (
    <div className="flex items-center gap-4">
      <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/5 border border-primary/10 text-primary shadow-sm shadow-primary/5">
        <Icon className="h-5 w-5" />
      </div>
      <h3 className="text-lg font-black tracking-tight text-foreground/90">{label}</h3>
    </div>
  ); SectionTitle;
}

function MeasurementRow({ m, population, isDetailed }: { m: Measurement; population: PopulationKey; isDetailed?: boolean }) {
  const range = adjustedRange(m.code, m.normal, population);
  const status = m.value != null && range ? deriveStatus(m.value, range[0], range[1]) : "Normal";
  const unitLabel = m.unit === "deg" ? "°" : m.unit === "mm" ? " mm" : "%";

  return (
    <div className={cn(
      "flex items-center justify-between gap-6 p-6 transition-all group/row hover:bg-muted/10",
      isDetailed ? "px-8 py-7" : "p-4 px-0 border-b border-border/10 last:border-0"
    )}>
      <div className="flex items-center gap-4 min-w-0 flex-1">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-card border border-border/40 text-[10px] font-black group-hover/row:border-primary/40 group-hover/row:text-primary transition-all shadow-sm">
          {m.code}
        </div>
        <div className="min-w-0">
          <p className="text-sm font-black tracking-tight truncate group-hover/row:text-foreground transition-colors">{m.name}</p>
          <div className="flex items-center gap-2 mt-1">
            <span className={cn("flex h-1.5 w-1.5 rounded-full shadow-sm", statusDot(status))} />
            <span className={cn("text-[10px] font-black uppercase tracking-widest", statusToneClass(status))}>{status}</span>
            {isDetailed && range && (
              <span className="text-[10px] text-muted-foreground/40 font-medium">Norm: {range[0].toFixed(1)} – {range[1].toFixed(1)}{unitLabel}</span>
            )}
            {isDetailed && m.qualityStatus && (
              <div className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-500/10 border border-amber-500/20 ml-2">
                <AlertTriangle className="h-2.5 w-2.5 text-amber-500" />
                <span className="text-[8px] font-black uppercase tracking-widest text-amber-600">{m.qualityStatus}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-8 shrink-0">
        <div className="text-right">
          <p className="text-lg font-black tracking-tighter tabular-nums text-foreground group-hover/row:text-primary transition-colors">
            {m.calibrationRequired ? "---" : m.value?.toFixed(1)}{unitLabel}
          </p>
          {m.calibrationRequired && (
            <p className="text-[9px] font-black text-warning uppercase tracking-widest">Calibration Req.</p>
          )}
        </div>
        {isDetailed && (
          <div className="w-32 hidden md:block">
            <DeviationBar
              value={m.value || 0}
              normal={range ? `${range[0]} – ${range[1]}` : m.normal}
              severity={m.severity as any}
            />
          </div>
        )}
      </div>
    </div>
  );
}

function TreatmentCard({ treatment, rank }: { treatment: TreatmentOption; rank: number }) {
  const [expanded, setExpanded] = useState(rank === 0);

  return (
    <div className="group rounded-[32px] border border-border/40 bg-muted/10 overflow-hidden hover:border-primary/30 transition-all duration-500 shadow-sm hover:shadow-md backdrop-blur-md">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between p-6 text-left hover:bg-card/40 transition-colors"
      >
        <div className="flex items-center gap-6 flex-1 min-w-0">
          <div className="h-12 w-12 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary font-black text-xl shadow-sm">
            {rank + 1}
          </div>
          <div className="min-w-0 flex-1">
            <h4 className="text-xl font-black tracking-tight group-hover:text-primary transition-colors truncate">{treatment.title}</h4>
            <div className="flex items-center gap-3 mt-1.5">
              <Pill tone={treatment.complexity === "High" ? "danger" : treatment.complexity === "Moderate" ? "warning" : "success"} size="xs" className="font-black">{treatment.complexity.toUpperCase()}</Pill>
              <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/40">{treatment.duration}</span>
            </div>
          </div>
          <div className="flex items-center gap-6 shrink-0 mr-4">
            <div className="text-right hidden sm:block">
              <span className={cn("text-2xl font-black tabular-nums tracking-tighter", treatment.score >= 85 ? "text-emerald-500" : "text-amber-500")}>{treatment.score}%</span>
              <p className="text-[9px] font-black text-muted-foreground/40 uppercase tracking-widest">CLINICAL MATCH</p>
            </div>
            <div className={cn("h-8 w-8 rounded-full bg-muted/30 flex items-center justify-center transition-transform duration-500", expanded ? "rotate-180 bg-primary/10 text-primary" : "text-muted-foreground/40 group-hover:text-primary/60")}>
              <ChevronDown className="h-5 w-5" />
            </div>
          </div>
        </div>
      </button>

      {expanded && (
        <div className="px-8 pb-8 pt-2 space-y-8 animate-in fade-in slide-in-from-top-2 duration-500">
          <Divider className="opacity-10" />

          <div className="space-y-3">
            <p className="text-[10px] font-black uppercase tracking-widest text-primary">Strategic Rationale</p>
            <p className="text-sm text-muted-foreground leading-relaxed font-medium">{treatment.rationale}</p>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {[
              { label: "Complexity Level", value: treatment.complexity, icon: Target },
              { label: "Phase Duration", value: treatment.duration, icon: Calendar },
              { label: "Synthesis Score", value: `${treatment.score}%`, icon: Brain },
            ].map(stat => (
              <div key={stat.label} className="p-5 rounded-2xl bg-card/40 border border-border/40 shadow-inner-sm">
                <div className="flex items-center gap-2 mb-2 opacity-40">
                  <stat.icon className="h-3 w-3" />
                  <span className="text-[10px] font-black uppercase tracking-widest">{stat.label}</span>
                </div>
                <p className="text-base font-black tracking-tight">{stat.value}</p>
              </div>
            ))}
          </div>

          {treatment.conflictNote && (
            <div className="flex items-start gap-4 p-5 rounded-2xl border border-amber-500/20 bg-amber-500/5">
              <AlertOctagon className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
              <p className="text-xs text-muted-foreground font-medium leading-relaxed">
                <span className="font-black text-amber-500 uppercase tracking-widest mr-2">Rule Conflict:</span>
                {treatment.conflictNote}
              </p>
            </div>
          )}

          {treatment.interdisciplinaryReferral && (
            <div className="flex items-start gap-4 p-5 rounded-2xl border border-rose-500/20 bg-rose-500/5">
              <Hospital className="h-5 w-5 text-rose-500 shrink-0 mt-0.5" />
              <p className="text-xs text-muted-foreground font-medium leading-relaxed">
                <span className="font-black text-rose-500 uppercase tracking-widest mr-2">Multi-Specialty Co-Management:</span>
                This treatment trajectory involves surgical intervention and requires coordinated flow between Oral & Maxillofacial Surgery and Orthodontic specialties.
              </p>
            </div>
          )}

          <div className="space-y-4">
            <p className="text-[10px] font-black uppercase tracking-widest text-primary">Clinical Evidence Level</p>
            <div className="flex items-center gap-4 p-4 rounded-2xl bg-primary/5 border border-primary/10">
              <Info className="h-5 w-5 text-primary/40 shrink-0" />
              <p className="text-xs text-muted-foreground font-medium leading-relaxed">{treatment.evidenceLevel || "Population-based normative consensus."}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function GrowthPanel({ activeCase, cvmStaging }: { activeCase?: CaseRecord; cvmStaging?: any }) {
  const age = activeCase?.patientAge;
  const stages = [
    { cs: "CS 1", label: "Pre-Peak", color: "bg-emerald-500", detail: "C2, C3, C4 lower borders are flat. C3, C4 are wedge-shaped." },
    { cs: "CS 2", label: "Pre-Peak", color: "bg-emerald-500", detail: "Concavity at C2 lower border. C3, C4 still wedge-shaped." },
    { cs: "CS 3", label: "Peak (Accelerating)", color: "bg-amber-500", detail: "Concavity at C2, C3 borders. C3, C4 are rectangular horizontal." },
    { cs: "CS 4", label: "Peak (Decelerating)", color: "bg-amber-500", detail: "Concavities at C2, C3, C4. C3, C4 are rectangular horizontal." },
    { cs: "CS 5", label: "Post-Peak", color: "bg-orange-500", detail: "Concavities at C2, C3, C4. C3 or C4 are square." },
    { cs: "CS 6", label: "Complete", color: "bg-rose-500", detail: "All concavities present. C3 or C4 are rectangular vertical." },
  ];

  return (
    <div className="space-y-10 animate-in fade-in duration-700">
      <div className="grid gap-10 lg:grid-cols-[1fr_1fr]">
        <Card className="p-8 glass-premium shadow-lg-professional border-border/40">
          <SectionTitle icon={Activity} label="CVM Growth Staging" />
          <div className="mt-8 space-y-4">
            {stages.map((s) => {
              const isActive = cvmStaging?.stage === s.cs;
              return (
                <div key={s.cs} className={cn(
                  "group flex items-start gap-6 p-6 rounded-[24px] border transition-all",
                  isActive ? "bg-primary/5 border-primary/20 shadow-lg shadow-primary/5 scale-[1.02]" : "border-border/40 bg-muted/10 hover:bg-card/40"
                )}>
                  <div className={cn("mt-1.5 h-3 w-3 rounded-full shrink-0 shadow-sm", s.color, isActive && "animate-pulse")} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3">
                      <span className="text-base font-black tracking-tight">{s.cs}</span>
                      <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/40">{s.label}</span>
                      {isActive && <Pill tone="accent" size="xs" className="font-black ml-2">Current Stage</Pill>}
                    </div>
                    <p className="text-xs text-muted-foreground mt-2 font-medium leading-relaxed group-hover:text-foreground transition-colors">{s.detail}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        <div className="space-y-10">
          <Card className="p-8 glass-premium shadow-lg-professional border-border/40">
            <SectionTitle icon={TrendingUp} label="Skeletal Projection Timeline" />
            <div className="mt-10 space-y-8">
              <div className="relative pt-12 pb-6 px-4">
                <div className="absolute top-0 left-0 w-full h-2 rounded-full bg-muted/40" />
                <div className="absolute top-0 left-0 w-[33%] h-2 rounded-full bg-primary shadow-sm shadow-primary/20" />
                <div className="grid grid-cols-3 gap-4">
                  {[
                    { label: "Baseline", val: "T0", sub: age ? `${age}y` : "Now" },
                    { label: "Projection", val: "T1", sub: age ? `${age + 2}y` : "+2y" },
                    { label: "Maturity", val: "T2", sub: "Final" },
                  ].map((p, i) => (
                    <div key={i} className="text-center relative">
                      <div className={cn("absolute -top-[52px] left-1/2 -translate-x-1/2 h-4 w-4 rounded-full border-2 bg-background z-10 transition-all", i === 0 ? "border-primary scale-125" : "border-border")}>
                        {i === 0 && <div className="absolute inset-1 rounded-full bg-primary animate-pulse" />}
                      </div>
                      <p className="text-xs font-black tracking-tight">{p.label}</p>
                      <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/40 mt-1">{p.sub}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid gap-4">
                {[
                  { label: "Current Morphology", desc: "Baseline skeletal relationship at the time of initial clinical capture.", icon: Target },
                  { label: "+2 Year Untreated", desc: "Estimated skeletal change based on population-normative growth vector analysis.", icon: Zap },
                  { label: "Growth Finality", desc: "Projected terminal position at skeletal maturity (CVM Stage 6 consensus).", icon: CheckCircle2 },
                ].map((item, i) => (
                  <div key={i} className="flex items-start gap-4 p-5 rounded-2xl bg-muted/20 border border-border/40">
                    <item.icon className="h-5 w-5 text-primary/40 shrink-0" />
                    <div>
                      <p className="text-xs font-black uppercase tracking-tight">{item.label}</p>
                      <p className="text-[11px] text-muted-foreground font-medium mt-1 leading-relaxed">{item.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </Card>

          <Card className="p-8 border-emerald-500/20 bg-emerald-500/5 backdrop-blur-md">
            <div className="flex items-center gap-3 mb-6 text-emerald-500">
              <Sparkles className="h-5 w-5" />
              <span className="text-[10px] font-black uppercase tracking-widest">Growth Timing Synthesis</span>
            </div>
            <ul className="space-y-4">
              {[
                "Early stages (CS 1-3) represent the clinical window of maximum orthopedic response.",
                "Post-peak stages (CS 4-5) indicate a shift toward dentoalveolar coordination requirements.",
                "CVM Stage 6 indicates growth completion; consider surgical modalities for severe skeletal base discrepancies.",
              ].map((text, i) => (
                <li key={i} className="flex items-start gap-3 text-xs text-muted-foreground font-medium leading-relaxed">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 mt-1.5 shrink-0" />
                  {text}
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}

function ClinicianSignOffModal({
  format, onConfirm, onCancel,
}: {
  format: ReportFormat; onConfirm: () => void; onCancel: () => void;
}) {
  const [checked, setChecked] = useState(false);
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-xl animate-in fade-in duration-300 p-6">
      <Card className="w-full max-w-xl p-0 glass-premium border-primary/20 shadow-2xl animate-in zoom-in-95 duration-500 overflow-hidden">
        <div className="p-8 border-b border-border/20 bg-muted/20 flex items-start justify-between">
          <div className="flex items-center gap-5">
            <div className="h-14 w-14 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-500 shadow-xl shadow-amber-500/10">
              <PenLine className="h-7 w-7" />
            </div>
            <div>
              <h3 className="text-2xl font-black tracking-tight">Clinician Sign-off</h3>
              <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60 mt-1">Exporting {format} diagnostic bundle</p>
            </div>
          </div>
          <button onClick={onCancel} className="h-10 w-10 flex items-center justify-center rounded-xl bg-muted/20 text-muted-foreground hover:text-foreground transition-all">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-10 space-y-8">
          <div className="p-6 rounded-[32px] border border-rose-500/20 bg-rose-500/5">
            <div className="flex items-center gap-3 mb-4 text-rose-500">
              <ShieldAlert className="h-5 w-5 animate-pulse" />
              <span className="text-[10px] font-black uppercase tracking-widest">Mandatory Clinical Review</span>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed font-medium">
              This synthesis contains AI-generated cephalometric metrics. All findings must be independently validated
              by a board-qualified clinician prior to legal documentation or surgical planning.
            </p>
          </div>

          <button
            onClick={() => setChecked(!checked)}
            className="flex items-start gap-5 p-6 rounded-[32px] border border-border/40 bg-muted/10 hover:bg-muted/20 transition-all text-left group"
          >
            <div className={cn(
              "mt-1 h-6 w-6 shrink-0 rounded-lg border-2 transition-all flex items-center justify-center",
              checked ? "bg-primary border-primary shadow-lg shadow-primary/20" : "border-border/60 group-hover:border-primary/40"
            )}>
              {checked && <CheckCircle2 className="h-4 w-4 text-primary-foreground" />}
            </div>
            <div className="space-y-1">
              <p className="text-base font-black tracking-tight leading-snug group-hover:text-primary transition-colors">
                I accept clinical responsibility for this analysis.
              </p>
              <p className="text-xs text-muted-foreground font-medium opacity-60">
                Validated as a board-qualified diagnostic specialist.
              </p>
            </div>
          </button>
        </div>

        <div className="p-8 pt-0 flex gap-4">
          <SecondaryBtn onClick={onCancel} className="flex-1 h-12 uppercase font-black tracking-widest text-[10px]">Abandon</SecondaryBtn>
          <PrimaryBtn
            onClick={onConfirm}
            disabled={!checked}
            className={cn("flex-1 h-12 uppercase font-black tracking-widest text-[10px] shadow-xl shadow-primary/20", !checked && "opacity-50 grayscale cursor-not-allowed")}
          >
            Authenticate & Export
          </PrimaryBtn>
        </div>
      </Card>
    </div>
  );
}

// ─── Main Page Component ──────────────────────────────────────────────────────

export default function ResultsPage({
  activeCase, reports, artifacts, overlays = [], onRequestReport,
}: ResultsPageProps) {
  const { diagnosis, measurements, treatments } = artifacts;
  const [tab, setTab] = useState<ResultsTab>("overview");
  const [query, setQuery] = useState("");
  const [population, setPopulation] = useState<PopulationKey>("caucasian");
  const [signOffFormat, setSignOffFormat] = useState<ReportFormat | null>(null);

  const caseReports = reports.filter(r => r.caseId === activeCase?.id);

  const filteredMeasurements = useMemo(() => {
    return measurements.filter(m =>
      m.name.toLowerCase().includes(query.toLowerCase()) ||
      m.code.toLowerCase().includes(query.toLowerCase())
    );
  }, [measurements, query]);

  if (!activeCase) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <div className="h-24 w-24 rounded-[32px] bg-muted/20 border-2 border-dashed border-border/20 flex items-center justify-center mb-8 shadow-inner-lg">
          <FileText className="h-10 w-10 text-muted-foreground/20" />
        </div>
        <h3 className="text-2xl font-black tracking-tight mb-3">Diagnostic Context Missing</h3>
        <p className="text-sm text-muted-foreground max-w-sm font-medium leading-relaxed mb-10">
          Select a clinical study from the dashboard to initialize the results telemetry and AI synthesis.
        </p>
        <SecondaryBtn onClick={() => window.history.back()} icon={ChevronRight} className="rotate-180">
          Return to Dashboard
        </SecondaryBtn>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground selection:bg-primary/30 pb-20">
      {signOffFormat && (
        <ClinicianSignOffModal
          format={signOffFormat}
          onConfirm={() => {
            onRequestReport(signOffFormat);
            setSignOffFormat(null);
          }}
          onCancel={() => setSignOffFormat(null)}
        />
      )}

      {/* ── Ambient background ── */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-60 -left-40 w-[800px] h-[800px] rounded-full bg-primary/5 blur-[120px] animate-pulse duration-[12s]" />
        <div className="absolute bottom-0 -right-40 w-[600px] h-[600px] rounded-full bg-emerald-500/5 blur-[100px] animate-pulse duration-[10s]" />
      </div>

      <div className="relative z-10 space-y-10 p-6 md:p-8 lg:p-10 max-w-[1600px] mx-auto animate-in fade-in slide-in-from-bottom-4 duration-700">

        {/* ── Page header ── */}
        <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="h-1.5 w-8 rounded-full bg-gradient-to-r from-primary to-emerald-400" />
              <span className="text-xs font-black uppercase tracking-[0.25em] text-primary/80">
                Diagnostic Synthesis
              </span>
            </div>
            <h1 className="text-4xl font-black tracking-tight text-gradient-primary md:text-5xl">
              Analysis Results
            </h1>
            <div className="flex flex-wrap items-center gap-4 text-muted-foreground font-medium">
              <div className="flex items-center gap-2 bg-card/40 px-4 py-1.5 rounded-full border border-border/40 shadow-sm">
                <span className="text-xs font-black uppercase opacity-40">Patient</span>
                <span className="text-sm text-foreground">{activeCase.patientName}</span>
              </div>
              <div className="flex items-center gap-2 bg-card/40 px-4 py-1.5 rounded-full border border-border/40 shadow-sm">
                <span className="text-xs font-black uppercase opacity-40">Case</span>
                <span className="text-sm text-foreground">{activeCase.title}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0 bg-card/30 backdrop-blur-md p-2 rounded-2xl border border-border/40 shadow-sm-professional">
            <SecondaryBtn
              onClick={() => exportMeasurementsCSV(measurements, activeCase.title)}
              icon={FileDown}
              className="h-11 px-6 font-black uppercase tracking-widest text-[10px] hover-lift"
            >
              Export CSV
            </SecondaryBtn>
            <PrimaryBtn
              onClick={() => setSignOffFormat("PDF")}
              icon={FileText}
              className="h-11 px-8 font-black uppercase tracking-widest text-[10px] hover-lift shadow-lg shadow-primary/20"
            >
              Generate Report
            </PrimaryBtn>
          </div>
        </div>

        {/* ── Tabs Navigation ── */}
        <div className="sticky top-4 z-50 bg-background/40 backdrop-blur-xl p-1.5 rounded-[24px] border border-border/40 shadow-lg-professional w-fit mx-auto">
          <TabBar
            active={tab}
            onChange={setTab as any}
            tabs={[
              { id: "overview", label: "Clinical Overview", icon: Brain },
              { id: "measurements", label: "Metrics & Norms", icon: BarChart3, badge: measurements.length },
              { id: "treatment", label: "Treatment Logic", icon: Stethoscope, badge: treatments.length },
              { id: "overlays", label: "Imaging Tracing", icon: Layers3, badge: overlays.length },
              { id: "growth", label: "Growth Matrix", icon: TrendingUp },
              { id: "reports", label: "Export Bundle", icon: FileCheck2, badge: caseReports.length },
            ]}
          />
        </div>

        {/* OVERVIEW TAB */}
        {tab === "overview" && (
          <div className="grid gap-10 xl:grid-cols-[0.8fr_1.2fr] animate-in fade-in duration-700">
            <div className="space-y-10">
              <DiagnosisCard diagnosis={diagnosis} />
              <Card className="p-8 glass-premium shadow-md-professional border-border/40">
                <SectionTitle icon={AlertTriangle} label="Clinical Validation" />
                <div className="mt-8 space-y-6">
                  <LandmarkQualitySummary measurements={measurements} />
                  <RiskFactorSummary diagnosis={diagnosis} />
                </div>
              </Card>
            </div>
            <div className="space-y-10">
              <Card className="p-8 glass-premium shadow-md-professional border-border/40">
                <div className="flex items-center justify-between mb-8">
                  <SectionTitle icon={BarChart3} label="Normative Deviations" />
                  <div className="flex items-center gap-2 bg-muted/20 px-3 py-1 rounded-full border border-border/20">
                    <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60">Reference:</span>
                    <span className="text-[10px] font-black uppercase text-primary">{POPULATION_LABELS[population]}</span>
                  </div>
                </div>
                <NormativeComparisonPanel
                  measurements={measurements}
                  selectedPopulation={POPULATION_LABELS[population]}
                  onPopulationChange={(p) => setPopulation(p.toLowerCase() as PopulationKey)}
                />
                <Divider className="my-8 opacity-10" />
                <div className="space-y-2">
                  <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/40 mb-4">Critical Diagnostic Parameters</p>
                  {MEASUREMENT_GROUPS[0].codes.slice(0, 6).map(code => {
                    const m = measurements.find(x => x.code === code);
                    if (!m) return null;
                    return <MeasurementRow key={m.code} m={m} population={population} />;
                  })}
                </div>
                <div className="mt-10 pt-8 border-t border-border/10">
                  <button
                    onClick={() => setTab("measurements")}
                    className="w-full h-12 flex items-center justify-center gap-3 rounded-2xl bg-primary/5 text-[10px] font-black uppercase tracking-widest text-primary hover:bg-primary/10 transition-all group"
                  >
                    View All {measurements.length} Measurements
                    <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
                  </button>
                </div>
              </Card>
            </div>
          </div>
        )}

        {/* MEASUREMENTS TAB */}
        {tab === "measurements" && (
          <div className="space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-700">
            <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
              <div className="max-w-md flex-1">
                <SearchInput
                  value={query}
                  onChange={setQuery}
                  placeholder="Query parameters by code or modality..."
                  className="w-full"
                />
              </div>
              <div className="flex items-center gap-3 bg-card/30 backdrop-blur-md p-1.5 rounded-2xl border border-border/40 shadow-sm">
                {COMPARE_POPS.map(pop => (
                  <button
                    key={pop}
                    onClick={() => setPopulation(pop)}
                    className={cn(
                      "h-9 px-4 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all",
                      population === pop ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20" : "text-muted-foreground/60 hover:text-foreground"
                    )}
                  >
                    {POPULATION_LABELS[pop]}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-8">
              {MEASUREMENT_GROUPS.map(group => {
                const items = filteredMeasurements.filter(m => group.codes.includes(m.code));
                if (!items.length) return null;
                const GroupIcon = group.icon;
                return (
                  <Card key={group.label} className="p-0 glass-premium overflow-hidden border-border/40 shadow-lg-professional hover-glow transition-all duration-700">
                    <div className="px-8 py-6 border-b border-border/20 bg-muted/10 flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className="h-10 w-10 rounded-2xl bg-primary/10 flex items-center justify-center text-primary border border-primary/20 shadow-sm">
                          <GroupIcon className="h-5 w-5" />
                        </div>
                        <div>
                          <h3 className="text-xl font-black tracking-tight">{group.label}</h3>
                          <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/40">{items.length} Evaluated Metrics</p>
                        </div>
                      </div>
                      <Pill tone="neutral" size="sm" className="bg-background/60 font-black tracking-widest text-[9px] uppercase">Telemetry Block</Pill>
                    </div>
                    <div className="divide-y divide-border/10">
                      {items.map(m => <MeasurementRow key={m.code} m={m} population={population} isDetailed />)}
                    </div>
                  </Card>
                );
              })}
            </div>
          </div>
        )}

        {/* TREATMENT TAB */}
        {tab === "treatment" && (
          <div className="space-y-10 animate-in fade-in duration-700">
            <div className="flex items-center justify-between border-b border-border/20 pb-6">
              <div className="space-y-1">
                <h2 className="text-2xl font-black tracking-tight text-gradient-primary">Treatment Modalities</h2>
                <p className="text-sm text-muted-foreground font-medium">Evidence-based interventions ranked by AI suitability synthesis.</p>
              </div>
              <div className="flex items-center gap-3">
                <Pill tone="accent" size="sm" className="font-black uppercase tracking-widest">Logic Engine v4.2</Pill>
              </div>
            </div>
            <div className="grid gap-6">
              {treatments.map((t, i) => (
                <TreatmentCard key={t.title} treatment={t} rank={i} />
              ))}
            </div>
            {treatments.length === 0 && (
              <div className="py-24 text-center border-2 border-dashed border-border/20 rounded-[32px] bg-muted/10">
                <Sparkles className="h-16 w-16 text-muted-foreground/20 mx-auto mb-6" />
                <p className="text-lg font-black tracking-tight mb-2">Synthesis Pending</p>
                <p className="text-sm text-muted-foreground font-medium">Run full clinical analysis to generate ranked treatment modalities.</p>
              </div>
            )}
          </div>
        )}

        {/* OVERLAYS TAB */}
        {tab === "overlays" && (
          <div className="space-y-10 animate-in fade-in duration-700">
            <div className="flex items-center justify-between border-b border-border/20 pb-6">
              <div className="space-y-1">
                <h2 className="text-2xl font-black tracking-tight text-gradient-primary">Diagnostic Overlays</h2>
                <p className="text-sm text-muted-foreground font-medium">High-fidelity anatomical tracings and skeletal synthesis overlays.</p>
              </div>
              <Pill tone="info" size="sm" className="font-black uppercase tracking-widest">{overlays.length} Artifacts</Pill>
            </div>
            <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
              {overlays.map((overlay, i) => (
                <Card key={i} className="group p-0 overflow-hidden glass-premium border-border/40 hover-glow transition-all duration-500 hover-lift shadow-lg-professional">
                  <div className="aspect-[4/3] bg-black relative overflow-hidden">
                    <img src={overlay.url} alt={overlay.label} className="object-contain w-full h-full transition-transform duration-700 group-hover:scale-110" />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-6">
                      <button
                        onClick={() => window.open(overlay.url, "_blank")}
                        className="w-full h-12 flex items-center justify-center gap-3 bg-white text-black rounded-2xl font-black uppercase tracking-widest text-[10px] shadow-xl"
                      >
                        <Maximize2 className="h-4 w-4" />
                        Enlarge Tracing
                      </button>
                    </div>
                    <div className="absolute top-4 right-4 bg-background/80 backdrop-blur-md px-4 py-2 rounded-xl border border-border/40 shadow-md">
                      <span className="text-[10px] font-black uppercase tracking-widest text-foreground">{overlay.label}</span>
                    </div>
                  </div>
                  <div className="p-6 space-y-2">
                    <h4 className="font-black text-lg group-hover:text-primary transition-colors">{overlay.label} Analysis</h4>
                    <p className="text-xs text-muted-foreground font-medium leading-relaxed opacity-70">
                      Digital synthesis showing anatomical landmarks and skeletal base relationships.
                    </p>
                  </div>
                </Card>
              ))}
            </div>
            {overlays.length === 0 && (
              <div className="py-24 text-center border-2 border-dashed border-border/20 rounded-[32px] bg-muted/10">
                <ImageIcon className="h-16 w-16 text-muted-foreground/20 mx-auto mb-6" />
                <p className="text-lg font-black tracking-tight mb-2">No Visual Artifacts Generated</p>
                <p className="text-sm text-muted-foreground font-medium">Finalize landmarks to trigger overlay generation.</p>
              </div>
            )}
          </div>
        )}

        {/* GROWTH TAB */}
        {tab === "growth" && (
          <GrowthPanel activeCase={activeCase} cvmStaging={diagnosis.cvmStaging} />
        )}

        {/* REPORTS TAB */}
        {tab === "reports" && (
          <div className="space-y-10 animate-in fade-in duration-700">
            <Card className="p-12 glass-premium border-primary/20 shadow-lg-professional overflow-hidden relative">
              <div className="absolute top-0 right-0 p-12 opacity-5 pointer-events-none">
                <FileCheck2 className="h-48 w-48" />
              </div>
              <div className="relative z-10 space-y-10">
                <div className="space-y-3">
                  <div className="flex items-center gap-3 text-primary">
                    <FileDown className="h-6 w-6" />
                    <span className="text-[10px] font-black uppercase tracking-[0.3em]">Export Orchestration</span>
                  </div>
                  <h2 className="text-3xl font-black tracking-tight">Generate Clinical Packet</h2>
                  <p className="text-muted-foreground font-medium max-w-xl text-lg leading-relaxed">
                    Compile measurements, diagnosis, and treatment modalities into a board-ready diagnostic report.
                  </p>
                </div>
                <div className="grid gap-6 md:grid-cols-2 lg:max-w-4xl">
                  {[
                    { format: "PDF" as ReportFormat, label: "Diagnostic PDF", icon: FileText, color: "text-rose-500", bg: "bg-rose-500/10", border: "border-rose-500/20", desc: "Immutable diagnostic packet for formal clinical documentation." },
                    { format: "Word" as ReportFormat, label: "Editable Study", icon: FileCheck2, color: "text-primary", bg: "bg-primary/10", border: "border-primary/20", desc: "Customizable document for advanced clinical tailoring." },
                  ].map(btn => (
                    <button
                      key={btn.format}
                      onClick={() => setSignOffFormat(btn.format)}
                      className="group flex flex-col gap-8 p-10 rounded-[40px] border border-border/40 bg-muted/10 hover:bg-card/40 hover:border-primary/30 transition-all duration-700 hover-lift text-left shadow-sm"
                    >
                      <div className={cn("h-16 w-16 rounded-[24px] flex items-center justify-center border group-hover:scale-110 transition-transform shadow-xl shadow-black/5", btn.bg, btn.border, btn.color)}>
                        <btn.icon className="h-8 w-8" />
                      </div>
                      <div className="space-y-3">
                        <p className="text-2xl font-black tracking-tight">{btn.label}</p>
                        <p className="text-sm text-muted-foreground font-medium leading-relaxed opacity-70">
                          {btn.desc}
                        </p>
                      </div>
                      <div className={cn("mt-4 flex items-center gap-3 text-xs font-black uppercase tracking-widest", btn.color)}>
                        Initialize Bundle <ArrowRight className="h-4 w-4 group-hover:translate-x-2 transition-transform" />
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </Card>

            {caseReports.length > 0 && (
              <Card className="p-0 glass-premium border-border/40 shadow-lg-professional overflow-hidden transition-all duration-700">
                <div className="px-10 py-8 border-b border-border/20 bg-muted/10 flex items-center justify-between">
                  <div className="flex items-center gap-5">
                    <div className="h-12 w-12 rounded-[20px] bg-emerald-500/10 flex items-center justify-center text-emerald-500 border border-emerald-500/20 shadow-sm">
                      <FileCheck2 className="h-6 w-6" />
                    </div>
                    <div>
                      <h3 className="text-xl font-black tracking-tight">Generation History</h3>
                      <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/40">{caseReports.length} Authenticated Bundles</p>
                    </div>
                  </div>
                </div>
                <div className="divide-y divide-border/10">
                  {caseReports.map(r => (
                    <div key={r.id} className="group flex flex-col gap-6 p-10 sm:flex-row sm:items-center sm:justify-between hover:bg-muted/10 transition-all">
                      <div className="flex items-center gap-8">
                        <div className={cn(
                          "h-14 w-14 rounded-[20px] flex items-center justify-center border shadow-sm group-hover:scale-110 transition-transform",
                          r.format === "PDF" ? "bg-rose-500/10 text-rose-500 border-rose-500/20" : "bg-primary/10 text-primary border-primary/20"
                        )}>
                          <FileText className="h-6 w-6" />
                        </div>
                        <div className="space-y-1.5">
                          <p className="text-lg font-black tracking-tight group-hover:text-primary transition-colors">{r.patientName} Study Packet</p>
                          <div className="flex items-center gap-4 text-muted-foreground/40">
                            <span className="text-[11px] font-black uppercase tracking-[0.2em]">{r.format}</span>
                            <span className="h-1 w-1 rounded-full bg-border" />
                            <span className="text-[11px] font-black tracking-widest">{r.size}</span>
                            <span className="h-1 w-1 rounded-full bg-border" />
                            <span className="text-[11px] font-black tracking-widest uppercase">{r.generatedAt}</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <Pill tone={r.status === "generated" ? "success" : "warning"} size="sm" className="font-black uppercase tracking-widest px-4">{r.status}</Pill>
                        {r.url && (
                          <div className="flex gap-3">
                            <SecondaryBtn
                              onClick={() => window.open(r.url, "_blank")}
                              icon={Eye}
                              className="h-11 px-5 text-[10px] font-black uppercase tracking-widest hover-lift"
                            >
                              View
                            </SecondaryBtn>
                            <PrimaryBtn
                              onClick={() => {
                                const a = document.createElement("a");
                                a.href = r.url!;
                                a.download = `${r.patientName.replace(/\s+/g, "-").toLowerCase()}-${r.format.toLowerCase()}`;
                                a.click();
                              }}
                              icon={Download}
                              className="h-11 px-8 text-[10px] font-black uppercase tracking-widest hover-lift shadow-lg shadow-primary/20"
                            >
                              Download
                            </PrimaryBtn>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
