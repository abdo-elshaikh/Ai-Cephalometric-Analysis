import React, { useState, useRef } from "react";
import { useLocation } from "wouter";
import {
  Plus,
  ScanLine,
  Upload,
  Ruler,
  BrainCircuit,
  CheckCircle2,
  CircleDot,
  Target,
  UserPlus,
  Users,
  Activity,
  Crosshair,
  FlaskConical,
  Stethoscope,
  ImageIcon,
  Loader2,
  ChevronRight,
  ZoomIn,
} from "lucide-react";
import {
  Card,
  Pill,
  PrimaryBtn,
  SecondaryBtn,
  PageHeader,
  Field,
  Select,
  Switch,
  Divider,
  ProgressRing,
} from "@/components/_core/ClinicalComponents";
import { statusTone } from "@/lib/clinical-utils";
import { type CaseRecord, type Patient, type ApiMode } from "@/lib/mappers";
import { cn } from "@/lib/utils";

// ─── Analysis Protocol Definitions ────────────────────────────────────────────

const ANALYSIS_PROTOCOLS: {
  id: string;
  name: string;
  fullName: string;
  params: string;
  focus: string;
  tier: "standard" | "advanced" | "supplemental";
}[] = [
  {
    id: "Steiner",
    name: "Steiner",
    fullName: "Steiner Analysis",
    params: "SNA · SNB · ANB · U1-NA · L1-NB",
    focus: "Skeletal & dental baseline",
    tier: "standard",
  },
  {
    id: "Ricketts",
    name: "Ricketts",
    fullName: "Ricketts Analysis",
    params: "Facial Depth · Axis · Convexity · Lower Lip",
    focus: "Growth prediction & aesthetics",
    tier: "standard",
  },
  {
    id: "McNamara",
    name: "McNamara",
    fullName: "McNamara Analysis",
    params: "NaPerp-A · NaPerp-Pog · CoA · CoGn",
    focus: "Jaw length & airway",
    tier: "standard",
  },
  {
    id: "Tweed",
    name: "Tweed",
    fullName: "Tweed Triangle",
    params: "FMIA · FMA · IMPA",
    focus: "Lower incisor position",
    tier: "advanced",
  },
  {
    id: "Jarabak",
    name: "Jarabak",
    fullName: "Björk-Jarabak",
    params: "PFH/AFH · S-Ar-Go · Gonion angle",
    focus: "Vertical growth pattern",
    tier: "advanced",
  },
  {
    id: "Wits",
    name: "Wits",
    fullName: "Wits Appraisal",
    params: "AO–BO perpendicular to occlusal plane",
    focus: "ANB correction on occlusal plane",
    tier: "advanced",
  },
  {
    id: "Bolton",
    name: "Bolton",
    fullName: "Bolton Analysis",
    params: "Overall ratio · Anterior ratio",
    focus: "Mesiodistal tooth size discrepancy",
    tier: "supplemental",
  },
  {
    id: "Broadbent",
    name: "Broadbent",
    fullName: "Broadbent–Bolton",
    params: "R-point · Bolton plane · Facial growth",
    focus: "Serial growth prediction",
    tier: "supplemental",
  },
];

const TIER_LABELS: Record<string, { label: string; tone: "success" | "accent" | "neutral" }> = {
  standard: { label: "Standard", tone: "success" },
  advanced: { label: "Advanced", tone: "accent" },
  supplemental: { label: "Supplemental", tone: "neutral" },
};

// ─── Pipeline stage definitions ───────────────────────────────────────────────

const PIPELINE_STAGES = [
  { key: "landmarks",    label: "Landmark Detection",    sub: "HRNet-W32 · 80 points", icon: Crosshair  },
  { key: "measurements", label: "Clinical Measurements", sub: "75 morphometric params", icon: Activity   },
  { key: "diagnosis",    label: "Skeletal Diagnosis",    sub: "GMM probabilistic class", icon: FlaskConical },
  { key: "treatment",    label: "Treatment Plan",        sub: "20 evidence-based rules", icon: Stethoscope },
] as const;

function pipelineStageState(aiStatus: CaseRecord["aiStatus"], idx: number) {
  if (aiStatus === "completed") return "done";
  if (aiStatus === "processing") return idx === 0 ? "active" : "pending";
  return "pending";
}

// ─── Analysis Protocol Selector ───────────────────────────────────────────────

function AnalysisProtocolSelector({
  selected,
  onChange,
}: {
  selected: string[];
  onChange: (types: string[]) => void;
}) {
  function toggle(id: string) {
    if (selected.includes(id)) {
      if (selected.length === 1) return; // keep at least one
      onChange(selected.filter(t => t !== id));
    } else {
      onChange([...selected, id]);
    }
  }

  const primary = selected[0];

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
            Analysis Protocols
          </p>
          <p className="text-[10px] text-muted-foreground/60 mt-0.5">
            Primary: <span className="text-primary font-bold">{primary}</span>
            {selected.length > 1 && ` + ${selected.length - 1} supplemental`}
          </p>
        </div>
        <Pill tone="neutral" size="xs">{selected.length} selected</Pill>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {ANALYSIS_PROTOCOLS.map(protocol => {
          const isSelected = selected.includes(protocol.id);
          const isPrimary = primary === protocol.id;
          const tier = TIER_LABELS[protocol.tier];
          return (
            <button
              key={protocol.id}
              type="button"
              onClick={() => toggle(protocol.id)}
              className={cn(
                "relative flex flex-col gap-1.5 rounded-xl border p-3 text-left transition-all duration-200 hover:shadow-sm",
                isSelected
                  ? isPrimary
                    ? "border-primary/50 bg-primary/10 shadow-sm ring-1 ring-primary/20"
                    : "border-success/30 bg-success/8"
                  : "border-border/40 bg-muted/10 hover:border-border/70 hover:bg-muted/20 opacity-70 hover:opacity-100"
              )}
            >
              {isPrimary && (
                <span className="absolute -top-2 -right-2 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[8px] font-bold text-primary-foreground">
                  1
                </span>
              )}
              <div className="flex items-center justify-between">
                <span className={cn(
                  "text-xs font-bold",
                  isSelected ? isPrimary ? "text-primary" : "text-success-foreground" : "text-muted-foreground"
                )}>
                  {protocol.name}
                </span>
                {isSelected
                  ? <CheckCircle2 className={cn("h-3.5 w-3.5 shrink-0", isPrimary ? "text-primary" : "text-success")} />
                  : <CircleDot className="h-3.5 w-3.5 shrink-0 text-muted-foreground/30" />
                }
              </div>
              <p className="text-[9px] text-muted-foreground leading-relaxed line-clamp-2">
                {protocol.focus}
              </p>
              <Pill tone={tier.tone} size="xs" className="self-start text-[8px] px-1.5 py-0.5">
                {tier.label}
              </Pill>
            </button>
          );
        })}
      </div>
      {selected.length > 1 && (
        <p className="mt-2 text-[10px] text-muted-foreground/60 italic">
          * Only the primary protocol ({primary}) is sent to the AI. Additional protocols shown as reference groups in Results.
        </p>
      )}
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

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
  patients,
  cases,
  apiMode,
  activeCaseId,
  activePatientId,
  setActiveCaseId,
  setActivePatientId,
  onCreatePatient,
  onCreateCase,
  onUpload,
  onRunAi,
}: AnalysisPageProps) {
  const [, navigate] = useLocation();
  const [isCbct, setIsCbct] = useState(false);
  const [selectedTypes, setSelectedTypes] = useState<string[]>(["Steiner"]);

  const activeCase = cases.find(c => c.id === activeCaseId);
  const activePatient = patients.find(p => p.id === activePatientId);

  const readinessChecks = [
    {
      label: "Patient Record",
      detail: activePatient ? `${activePatient.firstName} ${activePatient.lastName}` : "Select a patient",
      done: Boolean(activePatient),
      step: 1,
    },
    {
      label: "Study Shell",
      detail: activeCase ? activeCase.title : "Create a clinical case",
      done: Boolean(activeCase),
      step: 2,
    },
    {
      label: "X-Ray Image",
      detail: activeCase?.imageName || "Upload cephalometric image",
      done: Boolean(activeCase?.imageName),
      step: 3,
    },
    {
      label: "Calibration",
      detail: activeCase?.calibrated ? "2-point calibration saved" : "Required in viewer",
      done: Boolean(activeCase?.calibrated),
      step: 4,
    },
  ];

  const canRunAi = readinessChecks.every(c => c.done);
  const completedChecks = readinessChecks.filter(c => c.done).length;
  const readinessPct = Math.round((completedChecks / readinessChecks.length) * 100);

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <PageHeader
        eyebrow="Clinical Workspace"
        title="Diagnostic Intake"
        description="Configure the clinical case, upload radiographs, select analysis protocols, and initiate the AI-driven cephalometric pipeline."
        actions={
          <>
            <SecondaryBtn onClick={onCreateCase} icon={Plus}>Add case</SecondaryBtn>
            <PrimaryBtn onClick={() => navigate("/viewer")} icon={ScanLine}>Open Viewer</PrimaryBtn>
          </>
        }
      />

      {/* Pre-flight checklist */}
      <Card className="border-primary/20 bg-primary/[0.02]">
        <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between mb-6">
          <div>
            <h3 className="text-lg font-bold tracking-tight">Pre-Analysis Checklist</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Complete all 4 steps before sending to AI.
            </p>
          </div>
          <div className="flex items-center gap-4">
            <ProgressRing value={readinessPct} size={52} strokeWidth={5} tone={canRunAi ? "success" : "accent"}>
              <span className="text-[11px] font-bold">{readinessPct}%</span>
            </ProgressRing>
            <Pill tone={canRunAi ? "success" : "warning"} size="md">
              {canRunAi ? "Ready for AI" : `${readinessChecks.filter(c => !c.done).length} tasks remaining`}
            </Pill>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {readinessChecks.map((check) => (
            <div
              key={check.label}
              className={cn(
                "flex items-start gap-3 p-4 rounded-xl border transition-all duration-300",
                check.done
                  ? "border-success/30 bg-success/8 shadow-sm"
                  : "border-border/60 bg-muted/20 opacity-70"
              )}
            >
              <div className={cn(
                "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border text-[10px] font-bold mt-0.5",
                check.done
                  ? "border-success/30 bg-success/10 text-success-foreground"
                  : "border-border/40 bg-muted/30 text-muted-foreground"
              )}>
                {check.done
                  ? <CheckCircle2 className="h-4 w-4" />
                  : <span>{String(check.step).padStart(2, "0")}</span>
                }
              </div>
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                  {check.label}
                </p>
                <p className={cn(
                  "text-sm font-semibold mt-0.5 truncate",
                  check.done ? "text-foreground" : "text-muted-foreground"
                )}>
                  {check.detail}
                </p>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <div className="grid gap-8 xl:grid-cols-[0.8fr_1.2fr]">
        {/* Left column */}
        <div className="space-y-6">
          <Card title="Case Configuration">
            <div className="space-y-5">
              <Field label="Target Patient">
                <Select
                  value={activePatientId}
                  onChange={v => {
                    setActivePatientId(v);
                    const firstCase = cases.find(c => c.patientId === v);
                    if (firstCase) setActiveCaseId(firstCase.id);
                  }}
                >
                  {patients.length
                    ? patients.map(p => (
                        <option key={p.id} value={p.id}>
                          {p.firstName} {p.lastName} — {p.mrn}
                        </option>
                      ))
                    : <option value="">No registered patients</option>}
                </Select>
              </Field>

              <Field label="Clinical Study">
                <Select
                  value={activeCaseId}
                  onChange={v => {
                    setActiveCaseId(v);
                    const c = cases.find(x => x.id === v);
                    if (c) setActivePatientId(c.patientId);
                  }}
                >
                  {cases.length
                    ? cases.map(c => (
                        <option key={c.id} value={c.id}>
                          {c.title} ({c.status})
                        </option>
                      ))
                    : <option value="">No studies for patient</option>}
                </Select>
              </Field>

              {activeCase && (
                <div className="rounded-xl border border-border/40 bg-muted/10 p-3 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Study type</span>
                    <Pill tone="accent" size="xs">{activeCase.type}</Pill>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Status</span>
                    <Pill tone={statusTone(activeCase.status)} size="xs">{activeCase.status}</Pill>
                  </div>
                  {activeCase.calibrationDistanceMm && (
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">Calibration</span>
                      <span className="font-bold">{activeCase.calibrationDistanceMm} mm</span>
                    </div>
                  )}
                </div>
              )}

              {!patients.length && (
                <div className="p-6 text-center border border-dashed border-border/60 rounded-xl bg-muted/10">
                  <Users className="h-8 w-8 text-muted-foreground/40 mx-auto mb-3" />
                  <p className="text-sm text-muted-foreground mb-4">
                    Register a patient to begin.
                  </p>
                  <PrimaryBtn onClick={onCreatePatient} icon={UserPlus} className="w-full justify-center">
                    Register Patient
                  </PrimaryBtn>
                </div>
              )}
            </div>
          </Card>

          <Card title="Calibration">
            <div className="flex items-start gap-4">
              <div className={cn(
                "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border",
                activeCase?.calibrated
                  ? "border-success/30 bg-success/10 text-success-foreground"
                  : "border-warning/20 bg-warning/10 text-warning"
              )}>
                <Ruler className="h-5 w-5" />
              </div>
              <div>
                <h4 className="text-sm font-bold">Spatial Calibration</h4>
                <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                  {activeCase?.calibrated
                    ? `2-point calibration saved · ${activeCase.calibrationDistanceMm ?? "—"} mm reference`
                    : "Two-point ruler calibration is required for accurate measurements."}
                </p>
                <SecondaryBtn onClick={() => navigate("/viewer")} className="mt-4 h-9 px-4 text-xs" icon={ChevronRight}>
                  {activeCase?.calibrated ? "Recalibrate in Viewer" : "Open Viewer for Calibration"}
                </SecondaryBtn>
              </div>
            </div>
          </Card>
        </div>

        {/* Right column */}
        <div className="space-y-6">
          <Card title="Imaging Service">
            <UploadZone
              activeCase={activeCase}
              onUpload={file => activeCase && onUpload(activeCase.id, file)}
            />
          </Card>

          {/* AI Pipeline card */}
          <Card className="relative overflow-hidden group">
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-transparent opacity-60" />
            <div className="relative">
              {/* Header */}
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/20 text-primary">
                    <BrainCircuit className="h-6 w-6" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold tracking-tight">AI Diagnostic Pipeline</h3>
                    <p className="text-xs text-muted-foreground">
                      {activeCase?.aiStatus === "processing"
                        ? "Analysis in progress…"
                        : activeCase?.aiStatus === "completed"
                        ? "All 4 stages complete"
                        : "Proprietary deep-learning engine"}
                    </p>
                  </div>
                </div>
                <Switch
                  checked={isCbct}
                  onChange={setIsCbct}
                  label="CBCT Derived"
                />
              </div>

              {/* Protocol selector */}
              <div className="mb-5 p-4 rounded-xl border border-border/40 bg-muted/5">
                <AnalysisProtocolSelector
                  selected={selectedTypes}
                  onChange={setSelectedTypes}
                />
              </div>

              {/* Pipeline stages */}
              <div className="grid grid-cols-2 gap-2 mb-5 sm:grid-cols-4">
                {PIPELINE_STAGES.map((stage, i) => {
                  const state = activeCase
                    ? pipelineStageState(activeCase.aiStatus, i)
                    : "pending";
                  const Icon = stage.icon;
                  return (
                    <div
                      key={stage.key}
                      className={cn(
                        "relative flex flex-col items-center gap-2 rounded-xl border p-3 text-center transition-all",
                        state === "done" && "border-success/30 bg-success/8",
                        state === "active" && "border-primary/30 bg-primary/5 animate-pulse",
                        state === "pending" && "border-border/40 bg-muted/10 opacity-60"
                      )}
                    >
                      <div className={cn(
                        "flex h-8 w-8 items-center justify-center rounded-lg border",
                        state === "done" && "border-success/30 bg-success/10 text-success-foreground",
                        state === "active" && "border-primary/30 bg-primary/10 text-primary",
                        state === "pending" && "border-border/40 bg-muted/20 text-muted-foreground/40"
                      )}>
                        {state === "active"
                          ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          : state === "done"
                          ? <CheckCircle2 className="h-3.5 w-3.5" />
                          : <Icon className="h-3.5 w-3.5" />
                        }
                      </div>
                      <div>
                        <p className={cn(
                          "text-[10px] font-bold leading-tight",
                          state === "done" ? "text-success-foreground" : state === "active" ? "text-primary" : "text-muted-foreground/50"
                        )}>
                          {stage.label}
                        </p>
                        <p className="text-[9px] text-muted-foreground/40 mt-0.5">{stage.sub}</p>
                      </div>
                      {/* connector line */}
                      {i < PIPELINE_STAGES.length - 1 && (
                        <div className="hidden sm:block absolute -right-1.5 top-1/2 -translate-y-1/2 z-10">
                          <div className={cn(
                            "h-px w-3",
                            state === "done" ? "bg-success/40" : "bg-border/40"
                          )} />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              <Divider className="mb-5 opacity-40" />

              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="space-y-0.5">
                  <p className="text-xs text-muted-foreground italic">
                    * Requires image upload and 2-point calibration before analysis.
                  </p>
                  {activeCase?.aiStatus === "completed" && (
                    <p className="text-xs text-success-foreground font-medium">
                      ✓ AI analysis completed — view results in Viewer or Results tab.
                    </p>
                  )}
                </div>
                <div className="flex gap-2 items-center shrink-0">
                  {activeCase?.aiStatus === "completed" && (
                    <SecondaryBtn onClick={() => navigate("/results")} className="h-11 px-5" icon={Target}>
                      View Results
                    </SecondaryBtn>
                  )}
                  <PrimaryBtn
                    disabled={!canRunAi || apiMode !== "live" || activeCase?.aiStatus === "processing"}
                    loading={activeCase?.aiStatus === "processing"}
                    onClick={() => activeCase && onRunAi(activeCase.id, isCbct, selectedTypes[0] || "Steiner")}
                    icon={BrainCircuit}
                    className="h-11 px-8"
                  >
                    {activeCase?.aiStatus === "processing" ? "Processing…" : "Initiate AI Pipeline"}
                  </PrimaryBtn>
                </div>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

// ─── Upload Zone ──────────────────────────────────────────────────────────────

function UploadZone({
  activeCase,
  onUpload,
}: {
  activeCase?: CaseRecord;
  onUpload: (f: File) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const hasImage = Boolean(activeCase?.imageName);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  function handleFile(file: File) {
    const local = URL.createObjectURL(file);
    setPreviewUrl(local);
    onUpload(file);
  }

  const displayUrl = previewUrl || activeCase?.imageUrl || null;

  return (
    <div>
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
          "relative cursor-pointer rounded-2xl border-2 border-dashed p-8 text-center transition-all duration-300",
          isDragging
            ? "border-primary bg-primary/5 scale-[0.99] shadow-inner"
            : hasImage
            ? "border-success/40 bg-success/5 hover:border-success/60"
            : "border-border/60 bg-muted/10 hover:border-primary/40 hover:bg-muted/20"
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
          <div className="flex flex-col items-center gap-3">
            {displayUrl ? (
              <div className="relative group/img">
                <img
                  src={displayUrl}
                  alt="X-ray preview"
                  className="h-28 w-auto rounded-xl border border-success/30 object-contain shadow-sm"
                  onError={() => setPreviewUrl(null)}
                />
                <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-black/40 opacity-0 group-hover/img:opacity-100 transition-opacity">
                  <ZoomIn className="h-6 w-6 text-white" />
                </div>
              </div>
            ) : (
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-success/10 border border-success/30 mx-auto">
                <CheckCircle2 className="h-7 w-7 text-success-foreground" />
              </div>
            )}
            <div>
              <p className="text-base font-bold text-foreground">Image attached</p>
              <p className="mt-1 text-sm text-muted-foreground truncate max-w-xs mx-auto">
                {activeCase?.imageName}
              </p>
              <p className="mt-2 text-xs text-muted-foreground">
                Click or drag to <span className="text-primary font-bold">replace</span>
              </p>
            </div>
          </div>
        ) : (
          <>
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted/40 mx-auto mb-3 text-muted-foreground">
              {activeCase ? <Upload className="h-7 w-7" /> : <ImageIcon className="h-7 w-7" />}
            </div>
            <p className="text-base font-bold text-foreground">
              {activeCase ? `Attach radiograph to "${activeCase.title}"` : "Select a case first"}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {activeCase
                ? <>Drag and drop, or <span className="text-primary font-bold">browse files</span></>
                : "Choose a case above, then upload the cephalometric image"}
            </p>
            <div className="mt-5 flex justify-center gap-2">
              <Pill tone="neutral" size="xs">JPEG / PNG</Pill>
              <Pill tone="neutral" size="xs">DICOM (DCM)</Pill>
              <Pill tone="neutral" size="xs">TIFF / BMP</Pill>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
