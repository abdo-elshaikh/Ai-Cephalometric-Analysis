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
  Database,
  UserPlus,
  Users,
  Activity,
  Crosshair,
  FlaskConical,
  Stethoscope,
  ImageIcon,
  Loader2,
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

// ─── Pipeline stage definitions ───────────────────────────────────────────────

const PIPELINE_STAGES = [
  {
    key: "landmarks",
    label: "Landmark Detection",
    sub: "HRNet-W32 · 80 points",
    icon: Crosshair,
  },
  {
    key: "measurements",
    label: "Clinical Measurements",
    sub: "75 morphometric params",
    icon: Activity,
  },
  {
    key: "diagnosis",
    label: "Skeletal Diagnosis",
    sub: "GMM probabilistic class",
    icon: FlaskConical,
  },
  {
    key: "treatment",
    label: "Treatment Plan",
    sub: "20 evidence-based rules",
    icon: Stethoscope,
  },
] as const;

function pipelineStageState(aiStatus: CaseRecord["aiStatus"], idx: number) {
  if (aiStatus === "completed") return "done";
  if (aiStatus === "processing") return idx === 0 ? "active" : "pending";
  return "pending";
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
  onRunAi: (caseId: string, isCbctDerived: boolean) => void | Promise<void>;
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

  const activeCase = cases.find(c => c.id === activeCaseId);
  const activePatient = patients.find(p => p.id === activePatientId);

  const readinessChecks = [
    {
      label: "Patient Record",
      detail: activePatient ? `${activePatient.firstName} ${activePatient.lastName}` : "Select a patient",
      done: Boolean(activePatient),
    },
    {
      label: "Study Shell",
      detail: activeCase ? activeCase.title : "Create a clinical case",
      done: Boolean(activeCase),
    },
    {
      label: "X-Ray Image",
      detail: activeCase?.imageName || "Upload cephalometric image",
      done: Boolean(activeCase?.imageName),
    },
    {
      label: "Calibration",
      detail: activeCase?.calibrated ? "2-point calibration saved" : "Required in viewer",
      done: Boolean(activeCase?.calibrated),
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
        description="Configure the clinical case, upload radiographs, and initiate the AI-driven cephalometric analysis pipeline."
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
              Ensure all requirements are met before sending to AI.
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
          {readinessChecks.map((check, i) => (
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
                  : <span>{String(i + 1).padStart(2, "0")}</span>
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
                <SecondaryBtn onClick={() => navigate("/viewer")} className="mt-4 h-9 px-4 text-xs">
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
                <p className="text-xs text-muted-foreground italic">
                  * Requires image upload and 2-point calibration before analysis.
                </p>
                <PrimaryBtn
                  disabled={!canRunAi || apiMode !== "live" || activeCase?.aiStatus === "processing"}
                  loading={activeCase?.aiStatus === "processing"}
                  onClick={() => activeCase && onRunAi(activeCase.id, isCbct)}
                  icon={BrainCircuit}
                  className="h-11 px-8 shrink-0"
                >
                  {activeCase?.aiStatus === "processing" ? "Processing…" : "Initiate AI Pipeline"}
                </PrimaryBtn>
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

  return (
    <div
      onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={e => {
        e.preventDefault();
        setIsDragging(false);
        if (e.dataTransfer.files?.[0]) onUpload(e.dataTransfer.files[0]);
      }}
      onClick={() => fileRef.current?.click()}
      className={cn(
        "relative cursor-pointer rounded-2xl border-2 border-dashed p-10 text-center transition-all duration-300",
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
        onChange={e => e.target.files?.[0] && onUpload(e.target.files[0])}
      />

      {hasImage ? (
        <>
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-success/10 border border-success/30 mx-auto mb-3">
            <CheckCircle2 className="h-7 w-7 text-success-foreground" />
          </div>
          <p className="text-base font-bold text-foreground">Image attached</p>
          <p className="mt-1 text-sm text-muted-foreground truncate max-w-xs mx-auto">
            {activeCase?.imageName}
          </p>
          <p className="mt-3 text-xs text-muted-foreground">
            Click or drag to <span className="text-primary font-bold">replace</span>
          </p>
        </>
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
  );
}
