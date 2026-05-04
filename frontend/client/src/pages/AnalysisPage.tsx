import React, { useState, useRef } from "react";
import { useLocation } from "wouter";
import {
  Plus, ScanLine, Upload, Ruler, BrainCircuit, CheckCircle2,
  CircleDot, Target, UserPlus, Users, Activity, Crosshair,
  FlaskConical, Stethoscope, ImageIcon, Loader2, ChevronRight,
  ZoomIn, ArrowRight, Zap, Shield, BarChart3, Microscope,
} from "lucide-react";
import {
  Card, Pill, PrimaryBtn, SecondaryBtn, PageHeader, Field,
  Select, Switch, Divider,
} from "@/components/_core/ClinicalComponents";
import { statusTone } from "@/lib/clinical-utils";
import { type CaseRecord, type Patient, type ApiMode } from "@/lib/mappers";
import { cn } from "@/lib/utils";

// ─── Analysis Protocol Definitions ────────────────────────────────────────────

const ANALYSIS_PROTOCOLS = [
  {
    id: "Steiner", name: "Steiner", abbr: "STE",
    fullName: "Steiner Analysis",
    params: "SNA · SNB · ANB · U1-NA · L1-NB",
    focus: "Skeletal & dental baseline",
    tier: "standard" as const,
  },
  {
    id: "Ricketts", name: "Ricketts", abbr: "RCK",
    fullName: "Ricketts Analysis",
    params: "Facial Depth · Axis · Convexity · Lower Lip",
    focus: "Growth prediction & aesthetics",
    tier: "standard" as const,
  },
  {
    id: "McNamara", name: "McNamara", abbr: "MCN",
    fullName: "McNamara Analysis",
    params: "NaPerp-A · NaPerp-Pog · CoA · CoGn",
    focus: "Jaw length & airway",
    tier: "standard" as const,
  },
  {
    id: "Tweed", name: "Tweed", abbr: "TWD",
    fullName: "Tweed Triangle",
    params: "FMIA · FMA · IMPA",
    focus: "Lower incisor position",
    tier: "advanced" as const,
  },
  {
    id: "Jarabak", name: "Jarabak", abbr: "JBK",
    fullName: "Björk-Jarabak",
    params: "PFH/AFH · S-Ar-Go · Gonion angle",
    focus: "Vertical growth pattern",
    tier: "advanced" as const,
  },
  {
    id: "Wits", name: "Wits", abbr: "WTS",
    fullName: "Wits Appraisal",
    params: "AO–BO perpendicular to occlusal plane",
    focus: "ANB correction on occlusal plane",
    tier: "advanced" as const,
  },
  {
    id: "Bolton", name: "Bolton", abbr: "BLT",
    fullName: "Bolton Analysis",
    params: "Overall ratio · Anterior ratio",
    focus: "Mesiodistal tooth-size discrepancy",
    tier: "supplemental" as const,
  },
  {
    id: "Broadbent", name: "Broadbent", abbr: "BBT",
    fullName: "Broadbent–Bolton",
    params: "R-point · Bolton plane · Facial growth",
    focus: "Serial growth prediction",
    tier: "supplemental" as const,
  },
];

const TIER_CONFIG = {
  standard: { label: "Standard", color: "text-emerald-400", bg: "bg-emerald-400/10 border-emerald-400/20" },
  advanced: { label: "Advanced", color: "text-sky-400", bg: "bg-sky-400/10 border-sky-400/20" },
  supplemental: { label: "Supplemental", color: "text-slate-400", bg: "bg-slate-400/10 border-slate-400/20" },
};

// ─── Pipeline stages ──────────────────────────────────────────────────────────

const PIPELINE_STAGES = [
  { key: "landmarks", label: "Landmark Detection", sub: "HRNet-W32 · 80 pts", icon: Crosshair, color: "sky" },
  { key: "measurements", label: "Clinical Measurements", sub: "75 morphometric params", icon: Activity, color: "violet" },
  { key: "diagnosis", label: "Skeletal Diagnosis", sub: "GMM probabilistic", icon: FlaskConical, color: "amber" },
  { key: "treatment", label: "Treatment Planning", sub: "20 evidence rules", icon: Stethoscope, color: "emerald" },
] as const;

function stageState(aiStatus: CaseRecord["aiStatus"], idx: number) {
  if (aiStatus === "completed") return "done";
  if (aiStatus === "processing") return idx === 0 ? "active" : "pending";
  return "pending";
}

// ─── Protocol Selector ────────────────────────────────────────────────────────

function ProtocolSelector({ selected, onChange }: {
  selected: string[];
  onChange: (v: string[]) => void;
}) {
  function toggle(id: string) {
    if (selected.includes(id)) {
      if (selected.length === 1) return;
      onChange(selected.filter(t => t !== id));
    } else {
      onChange([...selected, id]);
    }
  }

  const primary = selected[0];

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[11px] font-black uppercase tracking-[0.2em] text-muted-foreground/60">
            Analysis Protocols
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Primary: <span className="text-primary font-bold">{primary}</span>
          </p>
        </div>
        <span className="badge badge-primary">
          {selected.length} Active
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {ANALYSIS_PROTOCOLS.map(proto => {
          const isSelected = selected.includes(proto.id);
          const isPrimary = primary === proto.id;
          const tier = TIER_CONFIG[proto.tier];

          return (
            <button
              key={proto.id}
              type="button"
              onClick={() => toggle(proto.id)}
              className={cn(
                "group relative flex flex-col gap-3 rounded-2xl border p-4 text-left transition-all duration-300 hover-lift",
                isPrimary
                  ? "border-primary/50 bg-primary/10 shadow-lg shadow-primary/10 ring-1 ring-primary/20"
                  : isSelected
                    ? "border-border/60 bg-muted/40"
                    : "border-border/30 bg-background/40 opacity-60 hover:opacity-100"
              )}
            >
              {isPrimary && (
                <span className="absolute -top-2 -right-2 flex h-6 w-6 items-center justify-center rounded-full bg-primary text-[10px] font-black text-primary-foreground shadow-lg shadow-primary/30 ring-2 ring-background animate-in zoom-in duration-300">
                  1
                </span>
              )}

              <div className="flex items-center justify-between">
                <span className={cn(
                  "text-[10px] font-black tracking-widest px-2 py-0.5 rounded-lg",
                  isPrimary
                    ? "text-primary bg-primary/20"
                    : isSelected
                      ? "text-foreground bg-muted"
                      : "text-muted-foreground bg-muted/50"
                )}>
                  {proto.abbr}
                </span>
                {isSelected
                  ? <CheckCircle2 className={cn("h-4 w-4 shrink-0", isPrimary ? "text-primary" : "text-muted-foreground")} />
                  : <CircleDot className="h-4 w-4 shrink-0 text-muted-foreground/20" />
                }
              </div>

              <div className="space-y-1">
                <p className={cn(
                  "text-sm font-bold leading-tight transition-colors",
                  isPrimary ? "text-primary" : isSelected ? "text-foreground" : "text-muted-foreground"
                )}>
                  {proto.name}
                </p>
                <p className="text-[10px] text-muted-foreground/60 leading-relaxed line-clamp-2">
                  {proto.focus}
                </p>
              </div>

              <span className={cn(
                "inline-block text-[8px] font-black px-2 py-0.5 rounded-full border self-start uppercase tracking-tighter",
                tier.bg, tier.color
              )}>
                {tier.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

interface AnalysisPageProps {
  patients: Patient[];
  cases: CaseRecord[];
  apiMode: ApiMode;
  activeCaseId: string;
  activePatientId: string;
  setActiveCaseId: (id: string) => void;
  setActivePatientId: (id: string) => void;
  onCreatePatient: () => void;
  onCreateCase: () => void;
  onUpload: (caseId: string, file: File) => void | Promise<void>;
  onRunAi: (caseId: string, isCbctDerived: boolean, analysisType: string) => void | Promise<void>;
}

export default function AnalysisPage({
  patients, cases, apiMode,
  activeCaseId, activePatientId,
  setActiveCaseId, setActivePatientId,
  onCreatePatient, onCreateCase,
  onUpload, onRunAi,
}: AnalysisPageProps) {
  const [, navigate] = useLocation();
  const [isCbct, setIsCbct] = useState(false);
  const [selectedTypes, setSelectedTypes] = useState<string[]>(["Steiner"]);

  const activeCase = cases.find(c => c.id === activeCaseId);
  const activePatient = patients.find(p => p.id === activePatientId);

  const checks = [
    { label: "Patient Record", detail: activePatient ? `${activePatient.firstName} ${activePatient.lastName}` : "Select a patient", done: Boolean(activePatient), icon: Users },
    { label: "Study Shell", detail: activeCase ? activeCase.title : "Create a clinical case", done: Boolean(activeCase), icon: Microscope },
    { label: "X-Ray Image", detail: activeCase?.imageName || "Upload cephalometric image", done: Boolean(activeCase?.imageName), icon: ImageIcon },
    { label: "Calibration", detail: activeCase?.calibrated ? "2-point calibration saved" : "Required in viewer", done: Boolean(activeCase?.calibrated), icon: Ruler },
  ];

  const completedCount = checks.filter(c => c.done).length;
  const readinessPct = Math.round((completedCount / checks.length) * 100);
  const canRunAi = completedCount === checks.length;

  return (
    <div className="min-h-screen bg-background text-foreground selection:bg-primary/30">
      {/* ── Ambient background ── */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-60 -left-40 w-[800px] h-[800px] rounded-full bg-primary/5 blur-[120px] animate-pulse duration-[10s]" />
        <div className="absolute top-1/4 -right-40 w-[600px] h-[600px] rounded-full bg-teal-500/5 blur-[100px] animate-pulse duration-[8s]" />
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg width='40' height='40' viewBox='0 0 40 40' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='%2394a3b8' fill-opacity='1'%3E%3Cpath d='M0 0h1v1H0zm39 0h1v1h-1zm0 39h1v1h-1zM0 39h1v1H0z'/%3E%3C/g%3E%3C/svg%3E\")" }}
        />
      </div>

      <div className="relative z-10 space-y-8 p-6 md:p-8 lg:p-10 max-w-[1600px] mx-auto animate-in fade-in slide-in-from-bottom-4 duration-700">

        {/* ── Page header ── */}
        <div className="flex flex-col gap-8 md:flex-row md:items-end md:justify-between">
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="h-1.5 w-8 rounded-full bg-gradient-to-r from-primary to-teal-400" />
              <span className="text-xs font-bold uppercase tracking-[0.25em] text-primary/80">
                Diagnostic Intelligence
              </span>
            </div>
            <h1 className="text-4xl font-extrabold tracking-tight text-gradient-primary md:text-5xl">
              Intake & Protocol
            </h1>
            <p className="text-muted-foreground max-w-xl text-lg leading-relaxed font-medium">
              Initialize clinical cases with precision. Select advanced analysis protocols and orchestrate the AI-driven cephalometric pipeline.
            </p>
          </div>
          
          <div className="flex items-center gap-4 shrink-0 bg-card/30 backdrop-blur-md p-2 rounded-2xl border border-border/40 shadow-sm-professional">
            <SecondaryBtn 
              onClick={onCreateCase}
              icon={Plus}
              className="hover-lift"
            >
              Add Case
            </SecondaryBtn>
            <PrimaryBtn 
              onClick={() => navigate("/viewer")}
              icon={ScanLine}
              className="hover-lift shadow-lg shadow-primary/20"
            >
              Open Viewer
            </PrimaryBtn>
          </div>
        </div>

        {/* ── Pre-flight checklist ── */}
        <div className="glass-premium rounded-3xl p-6 md:p-8 shadow-lg-professional group hover-glow transition-all duration-700">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between mb-8">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Shield className="h-5 w-5 text-primary" />
                <h3 className="text-xl font-bold tracking-tight">Clinical Readiness</h3>
              </div>
              <p className="text-sm text-muted-foreground">Mandatory diagnostic prerequisites for AI orchestration.</p>
            </div>
            
            <div className="flex flex-wrap items-center gap-6">
              <div className="flex items-center gap-4 bg-background/40 px-4 py-2.5 rounded-2xl border border-border/40">
                <div className="relative h-2 w-48 rounded-full bg-muted overflow-hidden">
                  <div
                    className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-primary to-teal-400 transition-all duration-1000 ease-out"
                    style={{ width: `${readinessPct}%` }}
                  />
                  <div className="absolute inset-0 loading-sheen opacity-30" />
                </div>
                <div className="flex items-baseline gap-1">
                  <span className={cn("text-2xl font-black tabular-nums", canRunAi ? "text-primary" : "text-muted-foreground")}>
                    {readinessPct}
                  </span>
                  <span className="text-xs font-bold text-muted-foreground/60">%</span>
                </div>
              </div>
              
              <div className={cn(
                "flex items-center gap-3 px-5 py-2.5 rounded-2xl border font-bold text-sm transition-all duration-500",
                canRunAi 
                  ? "bg-success/10 border-success/30 text-success shadow-lg shadow-success/10 animate-success-burst"
                  : "bg-warning/10 border-warning/30 text-warning"
              )}>
                {canRunAi ? (
                  <><CheckCircle2 className="h-5 w-5" /> Pipeline Ready</>
                ) : (
                  <><Zap className="h-5 w-5 animate-pulse" /> {4 - completedCount} Actions Required</>
                )}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {checks.map((check, i) => {
              const Icon = check.icon;
              return (
                <div
                  key={check.label}
                  className={cn(
                    "group/check relative flex flex-col gap-4 p-5 rounded-2xl border transition-all duration-300 hover-lift",
                    check.done
                      ? "border-primary/20 bg-primary/5 ring-1 ring-primary/5"
                      : "border-border/40 bg-card/40 hover:bg-card/60 hover:border-border/80"
                  )}
                >
                  <div className="flex items-center justify-between">
                    <div className={cn(
                      "flex h-10 w-10 items-center justify-center rounded-xl text-xs font-bold border transition-all duration-500",
                      check.done
                        ? "bg-primary text-primary-foreground border-primary shadow-lg shadow-primary/30 rotate-[360deg]"
                        : "bg-muted border-border text-muted-foreground"
                    )}>
                      {check.done ? <CheckCircle2 className="h-5 w-5" /> : String(i + 1).padStart(2, "0")}
                    </div>
                    <Icon className={cn(
                      "h-5 w-5 transition-colors duration-300", 
                      check.done ? "text-primary" : "text-muted-foreground/30"
                    )} />
                  </div>

                  <div className="space-y-1">
                    <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground/60">
                      {check.label}
                    </p>
                    <p className={cn(
                      "text-sm font-bold truncate transition-colors",
                      check.done ? "text-foreground" : "text-muted-foreground"
                    )}>
                      {check.detail}
                    </p>
                  </div>

                  {check.done && (
                    <div className="absolute inset-x-0 bottom-0 h-1 rounded-b-2xl bg-gradient-to-r from-primary to-teal-400 opacity-50" />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Two-column layout ── */}
        <div className="grid gap-8 xl:grid-cols-[400px_1fr]">

          {/* ── Left column ── */}
          <div className="space-y-6">

            {/* Case configuration */}
            <Card className="p-6 border-border/40 bg-card/30 backdrop-blur-md shadow-md-professional hover-glow transition-all duration-500">
              <SectionTitle icon={Microscope} label="Case Context" />

              <div className="space-y-6 mt-6">
                <Field label="Target Patient" className="space-y-2">
                  <Select
                    value={activePatientId}
                    onChange={v => {
                      setActivePatientId(v);
                      const first = cases.find(c => c.patientId === v);
                      if (first) setActiveCaseId(first.id);
                    }}
                    options={patients.length 
                      ? patients.map(p => ({ value: p.id, label: `${p.firstName} ${p.lastName} — ${p.mrn}` }))
                      : [{ value: "", label: "No registered patients" }]
                    }
                    className="w-full"
                  />
                </Field>

                <Field label="Clinical Study" className="space-y-2">
                  <Select
                    value={activeCaseId}
                    onChange={v => {
                      setActiveCaseId(v);
                      const c = cases.find(x => x.id === v);
                      if (c) setActivePatientId(c.patientId);
                    }}
                    options={cases.length
                      ? cases.map(c => ({ value: c.id, label: `${c.title} (${c.status})` }))
                      : [{ value: "", label: "No studies available" }]
                    }
                    className="w-full"
                  />
                </Field>

                {activeCase && (
                  <div className="rounded-2xl border border-border/40 bg-muted/20 overflow-hidden divide-y divide-border/20">
                    {[
                      ["Study Type", <Pill key="type" tone="accent" size="xs">{activeCase.type}</Pill>],
                      ["Analysis Status", <Pill key="status" tone={statusTone(activeCase.status)} size="xs">{activeCase.status}</Pill>],
                      ...(activeCase.calibrationDistanceMm
                        ? [["Calibration", <span key="cal" className="text-xs font-bold text-primary">{activeCase.calibrationDistanceMm} mm</span>]]
                        : []),
                    ].map(([label, value], i) => (
                      <div key={i} className="flex items-center justify-between px-4 py-3 text-sm">
                        <span className="text-muted-foreground font-medium">{label}</span>
                        {value}
                      </div>
                    ))}
                  </div>
                )}

                {!patients.length && (
                  <div className="flex flex-col items-center gap-4 p-8 rounded-2xl border-2 border-dashed border-border/60 bg-muted/10 text-center transition-all hover:bg-muted/20 hover:border-border">
                    <div className="flex h-14 w-14 items-center justify-center rounded-full bg-background border border-border shadow-sm">
                      <Users className="h-7 w-7 text-muted-foreground/40" />
                    </div>
                    <div className="space-y-1">
                      <p className="text-sm font-bold">Incomplete Registry</p>
                      <p className="text-xs text-muted-foreground px-4">Register a patient to begin clinical diagnostic processing.</p>
                    </div>
                    <PrimaryBtn 
                      onClick={onCreatePatient}
                      icon={UserPlus}
                      className="w-full hover-lift"
                    >
                      Register Patient
                    </PrimaryBtn>
                  </div>
                )}
              </div>
            </Card>

            {/* Calibration panel */}
            <Card className="p-6 border-border/40 bg-card/30 backdrop-blur-md shadow-md-professional hover-glow transition-all duration-500">
              <SectionTitle icon={Ruler} label="Spatial Precision" />

              <div className="mt-6 flex items-start gap-5">
                <div className={cn(
                  "flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border transition-all duration-500",
                  activeCase?.calibrated
                    ? "border-success/30 bg-success/10 text-success shadow-lg shadow-success/5"
                    : "border-warning/30 bg-warning/10 text-warning shadow-lg shadow-warning/5"
                )}>
                  <Ruler className={cn("h-7 w-7", !activeCase?.calibrated && "animate-pulse")} />
                </div>
                <div className="flex-1 space-y-2">
                  <p className={cn("text-base font-bold", activeCase?.calibrated ? "text-success" : "text-warning")}>
                    {activeCase?.calibrated ? "Calibration Validated" : "Awaiting Calibration"}
                  </p>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {activeCase?.calibrated
                      ? `Precise 2-point reference: ${activeCase.calibrationDistanceMm ?? "—"} mm.`
                      : "Spatial calibration is critical for accurate linear and volumetric morphometry."}
                  </p>
                  <button
                    onClick={() => navigate("/viewer")}
                    className="group flex items-center gap-2 text-sm font-bold text-primary hover:text-primary/80 transition-all pt-2"
                  >
                    {activeCase?.calibrated ? "Modify in Viewer" : "Access Calibration Suite"}
                    <ChevronRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
                  </button>
                </div>
              </div>
            </Card>
          </div>

          {/* ── Right column ── */}
          <div className="space-y-6">

            {/* Imaging Service */}
            <Card className="p-6 border-border/40 bg-card/30 backdrop-blur-md shadow-md-professional hover-glow transition-all duration-500">
              <SectionTitle icon={ImageIcon} label="Radiographic Imaging" />
              <div className="mt-6">
                <UploadZone
                  activeCase={activeCase}
                  onUpload={file => activeCase && onUpload(activeCase.id, file)}
                />
              </div>
            </Card>

            {/* AI Pipeline */}
            <div className="relative rounded-3xl border border-primary/20 bg-card/30 backdrop-blur-xl shadow-lg-professional overflow-hidden group/pipeline hover-glow transition-all duration-500">
              {/* Subtle animated background gradient */}
              <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-teal-500/10 opacity-30 group-hover/pipeline:opacity-50 transition-opacity duration-1000" />
              
              <div className="relative p-6 md:p-8 space-y-8">
                {/* Pipeline header */}
                <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-5">
                    <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-xl shadow-primary/20 group-hover/pipeline:scale-105 transition-transform duration-500 overflow-hidden">
                      <BrainCircuit className="h-9 w-9 z-10" />
                      <div className="absolute inset-0 loading-sheen opacity-40" />
                    </div>
                    <div>
                      <h3 className="text-2xl font-black tracking-tight">AI Diagnostic Suite</h3>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="flex h-2 w-2 rounded-full bg-success animate-pulse" />
                        <p className="text-sm font-bold text-muted-foreground uppercase tracking-widest">
                          {activeCase?.aiStatus === "processing"
                            ? "Engine Active"
                            : activeCase?.aiStatus === "completed"
                              ? "Analysis Fully Dispatched"
                              : "Proprietary HRNet-W32 Engine"}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* CBCT toggle */}
                  <div className="flex items-center gap-4 bg-background/60 p-1.5 pr-4 rounded-2xl border border-border/40 shadow-inner-sm">
                    <div className={cn(
                      "flex h-9 w-12 items-center justify-center rounded-xl font-black text-xs transition-all",
                      isCbct ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground/50"
                    )}>
                      3D
                    </div>
                    <div className="space-y-0.5">
                      <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">CBCT Derived</p>
                      <Switch checked={isCbct} onChange={setIsCbct} />
                    </div>
                  </div>
                </div>

                {/* Protocol selector */}
                <div className="bg-background/40 p-1 rounded-3xl border border-border/40 backdrop-blur-sm">
                  <ProtocolSelector selected={selectedTypes} onChange={setSelectedTypes} />
                </div>

                {/* Pipeline stages */}
                <div className="space-y-4">
                  <p className="text-[11px] font-black uppercase tracking-[0.2em] text-muted-foreground/60 ml-1">
                    Orchestration Pipeline
                  </p>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    {PIPELINE_STAGES.map((stage, i) => {
                      const state = activeCase ? stageState(activeCase.aiStatus, i) : "pending";
                      const Icon = stage.icon;
                      const colors = {
                        sky: "from-sky-500/20 to-sky-400/20 text-sky-400 border-sky-400/30",
                        violet: "from-violet-500/20 to-violet-400/20 text-violet-400 border-violet-400/30",
                        amber: "from-amber-500/20 to-amber-400/20 text-amber-400 border-amber-400/30",
                        emerald: "from-emerald-500/20 to-emerald-400/20 text-emerald-400 border-emerald-400/30",
                      }[stage.color];

                      return (
                        <div
                          key={stage.key}
                          className={cn(
                            "relative group/stage flex flex-col items-center gap-4 rounded-2xl border p-5 text-center transition-all duration-500 overflow-hidden",
                            state === "done"
                              ? "border-success/30 bg-success/5"
                              : state === "active"
                                ? "border-primary/40 bg-primary/10 shadow-lg shadow-primary/10 scale-105 z-10"
                                : "border-border/40 bg-card/20 opacity-40 grayscale-[0.5]"
                          )}
                        >
                          <div className={cn(
                            "flex h-12 w-12 items-center justify-center rounded-2xl border transition-all duration-500 shadow-sm",
                            state === "done" && "bg-success/20 border-success/40 text-success",
                            state === "active" && "bg-gradient-to-br border-current shadow-lg shadow-current/20",
                            state === "active" && colors,
                            state === "pending" && "bg-muted border-border text-muted-foreground/30"
                          )}>
                            {state === "active"
                              ? <Loader2 className="h-6 w-6 animate-spin" />
                              : state === "done"
                                ? <CheckCircle2 className="h-6 w-6 animate-in zoom-in duration-500" />
                                : <Icon className="h-6 w-6" />
                            }
                          </div>
                          
                          <div className="space-y-1">
                            <p className={cn(
                              "text-xs font-black leading-tight tracking-tight",
                              state === "done" ? "text-success" :
                                state === "active" ? "text-primary" : "text-muted-foreground"
                            )}>
                              {stage.label}
                            </p>
                            <p className="text-[10px] font-bold text-muted-foreground/50">{stage.sub}</p>
                          </div>

                          {/* Progress connector logic */}
                          {i < PIPELINE_STAGES.length - 1 && (
                            <div className="hidden lg:block absolute -right-4 top-12 z-0 w-8">
                              <div className={cn(
                                "h-[1.5px] w-full",
                                state === "done" ? "bg-success/40" : "bg-border/20"
                              )} />
                            </div>
                          )}

                          {state === "active" && (
                            <div className="absolute inset-0 loading-sheen opacity-10 pointer-events-none" />
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Footer CTA */}
                <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between pt-4 border-t border-border/20">
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2">
                      <Zap className="h-4 w-4 text-primary" />
                      <p className="text-xs font-bold text-muted-foreground italic">
                        Real-time AI inference requires cloud orchestration.
                      </p>
                    </div>
                    {activeCase?.aiStatus === "completed" && (
                      <div className="flex items-center gap-2 text-xs font-black text-success animate-in slide-in-from-left duration-500">
                        <CheckCircle2 className="h-4 w-4" />
                        INFERENCE COMPLETE · ARTIFACTS GENERATED
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    {activeCase?.aiStatus === "completed" && (
                      <SecondaryBtn 
                        onClick={() => navigate("/results")}
                        icon={BarChart3}
                        className="hover-lift border-primary/20 bg-primary/5 text-primary hover:bg-primary/10"
                      >
                        Analysis Results
                      </SecondaryBtn>
                    )}
                    <PrimaryBtn
                      disabled={!canRunAi || apiMode !== "live" || activeCase?.aiStatus === "processing"}
                      onClick={() => activeCase && onRunAi(activeCase.id, isCbct, selectedTypes[0] || "Steiner")}
                      className={cn(
                        "px-8 py-3.5 text-base font-black shadow-xl transition-all duration-500",
                        canRunAi && apiMode === "live" && activeCase?.aiStatus !== "processing"
                          ? "hover-lift shadow-primary/30"
                          : "opacity-50 grayscale cursor-not-allowed"
                      )}
                      icon={activeCase?.aiStatus === "processing" ? Loader2 : BrainCircuit}
                    >
                      {activeCase?.aiStatus === "processing" ? "Processing…" : "Initialize AI Pipeline"}
                    </PrimaryBtn>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Upload Zone ──────────────────────────────────────────────────────────────

function UploadZone({ activeCase, onUpload }: {
  activeCase?: CaseRecord;
  onUpload: (f: File) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const hasImage = Boolean(activeCase?.imageName);
  const displayUrl = previewUrl || activeCase?.imageUrl || null;

  function handleFile(file: File) {
    setPreviewUrl(URL.createObjectURL(file));
    onUpload(file);
  }

  return (
    <div
      onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={e => {
        e.preventDefault();
        setIsDragging(false);
        if (e.dataTransfer.files?.[0]) handleFile(e.dataTransfer.files[0]);
      }}
      onClick={() => fileRef.current?.click()}
      className={cn(
        "relative cursor-pointer rounded-3xl border-2 border-dashed p-10 text-center transition-all duration-500 select-none overflow-hidden group/upload",
        isDragging
          ? "border-primary bg-primary/5 scale-[0.98] shadow-inner-lg"
          : hasImage
            ? "border-success/40 bg-success/5 hover:border-success/60"
            : "border-border/60 bg-muted/20 hover:border-primary/40 hover:bg-muted/40"
      )}
    >
      <input
        ref={fileRef}
        type="file"
        accept="image/*,.dcm,.dicom"
        className="hidden"
        onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])}
      />

      {hasImage ? (
        <div className="flex flex-col items-center gap-6 animate-in zoom-in-95 duration-500">
          {displayUrl ? (
            <div className="group/img relative">
              <img
                src={displayUrl}
                alt="X-ray preview"
                className="h-40 w-auto rounded-2xl border border-success/30 object-contain shadow-2xl shadow-black/40 transition-transform duration-500 group-hover/img:scale-105"
                onError={() => setPreviewUrl(null)}
              />
              <div className="absolute inset-0 flex items-center justify-center rounded-2xl bg-black/60 opacity-0 group-hover/img:opacity-100 transition-all duration-300 backdrop-blur-sm">
                <div className="bg-white/10 p-3 rounded-full border border-white/20">
                  <ZoomIn className="h-8 w-8 text-white" />
                </div>
              </div>
            </div>
          ) : (
            <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-success/10 border border-success/30 mx-auto shadow-lg shadow-success/10">
              <CheckCircle2 className="h-10 w-10 text-success" />
            </div>
          )}
          <div className="space-y-1">
            <p className="text-lg font-black tracking-tight">Radiograph Attached</p>
            <p className="text-sm text-muted-foreground truncate max-w-xs mx-auto font-medium opacity-60">{activeCase?.imageName}</p>
            <div className="pt-4 flex items-center justify-center gap-2 text-xs font-bold text-primary">
              <span className="h-1 w-1 rounded-full bg-primary" />
              Click to replace artifact
              <span className="h-1 w-1 rounded-full bg-primary" />
            </div>
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-6 py-4 animate-in fade-in duration-700">
          <div className={cn(
            "flex h-20 w-20 items-center justify-center rounded-3xl border transition-all duration-500 shadow-sm group-hover/upload:scale-110",
            isDragging
              ? "border-primary bg-primary text-primary-foreground shadow-lg shadow-primary/30"
              : "border-border/60 bg-background text-muted-foreground/30"
          )}>
            {activeCase ? <Upload className="h-9 w-9" /> : <ImageIcon className="h-9 w-9" />}
          </div>
          <div className="space-y-2">
            <p className="text-xl font-black tracking-tight">
              {activeCase
                ? `Ingest artifact for "${activeCase.title}"`
                : "Select study to begin ingestion"}
            </p>
            <p className="text-sm text-muted-foreground max-w-sm mx-auto font-medium">
              {activeCase
                ? <>Drag & drop high-resolution X-ray, or <span className="text-primary font-bold decoration-primary/30 decoration-2 underline-offset-4 underline">browse secure local storage</span></>
                : "A clinical study must be active before radiographic ingestion can be initiated."}
            </p>
          </div>
          <div className="flex gap-2.5 flex-wrap justify-center pt-4">
            {["DICOM", "JPEG", "PNG", "TIFF"].map(fmt => (
              <span key={fmt} className="text-[10px] font-black tracking-[0.15em] px-3 py-1 rounded-full border border-border/40 bg-background/60 text-muted-foreground/40 uppercase">
                {fmt}
              </span>
            ))}
          </div>
        </div>
      )}
      
      {/* Decorative corner accents */}
      <div className="absolute top-4 left-4 h-4 w-4 border-t-2 border-l-2 border-primary/20 rounded-tl-lg" />
      <div className="absolute top-4 right-4 h-4 w-4 border-t-2 border-r-2 border-primary/20 rounded-tr-lg" />
      <div className="absolute bottom-4 left-4 h-4 w-4 border-b-2 border-l-2 border-primary/20 rounded-bl-lg" />
      <div className="absolute bottom-4 right-4 h-4 w-4 border-b-2 border-r-2 border-primary/20 rounded-br-lg" />
    </div>
  );
}

// ─── Micro-components ─────────────────────────────────────────────────────────

function SectionTitle({ icon: Icon, label }: { icon: React.ElementType; label: string }) {
  return (
    <div className="flex items-center gap-4">
      <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/5 border border-primary/10 text-primary shadow-sm shadow-primary/5">
        <Icon className="h-5 w-5" />
      </div>
      <h3 className="text-lg font-black tracking-tight text-foreground/90">{label}</h3>
    </div>
  );
}
