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
  ArrowRight,
  Database,
  UserPlus,
  Users
} from "lucide-react";
import {
  Card,
  Pill,
  PrimaryBtn,
  SecondaryBtn,
  PageHeader,
  Field,
  Select,
  Divider
} from "@/components/_core/ClinicalComponents";
import {
  statusTone,
} from "@/lib/clinical-utils";
import { 
  type CaseRecord, 
  type Patient, 
  type ApiMode 
} from "@/lib/mappers";
import { cn } from "@/lib/utils";

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
    { label: "Patient Record", detail: activePatient ? `${activePatient.firstName} ${activePatient.lastName}` : "Select a patient", done: Boolean(activePatient) },
    { label: "Study Shell", detail: activeCase ? activeCase.title : "Create a clinical case", done: Boolean(activeCase) },
    { label: "X-Ray Image", detail: activeCase?.imageName || "Upload cephalometric image", done: Boolean(activeCase?.imageName) },
    { label: "Calibration", detail: activeCase?.calibrated ? "Ready for analysis" : "Required in viewer", done: Boolean(activeCase?.calibrated) },
  ];

  const canRunAi = readinessChecks.every(c => c.done);

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

      {/* Checklist */}
      <Card title="Clinical Readiness" className="border-primary/20 bg-primary/[0.02]">
        <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between mb-6">
           <div>
              <h3 className="text-lg font-bold tracking-tight">Pre-Analysis Checklist</h3>
              <p className="text-sm text-muted-foreground">Ensure all diagnostic requirements are met before sending to AI.</p>
           </div>
           <Pill tone={canRunAi ? "success" : "warning"} size="md" className="h-fit">
              {canRunAi ? "Ready for AI Analysis" : `${readinessChecks.filter(c => !c.done).length} Tasks Remaining`}
           </Pill>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
           {readinessChecks.map(check => (
             <div 
               key={check.label} 
               className={cn(
                 "p-4 rounded-xl border transition-all duration-300",
                 check.done ? "border-success/30 bg-success/10 shadow-sm" : "border-border/60 bg-muted/20 opacity-70"
               )}
             >
                <div className="flex items-center gap-2 mb-2">
                   {check.done ? <CheckCircle2 className="h-4 w-4 text-success" /> : <CircleDot className="h-4 w-4 text-muted-foreground/40" />}
                   <span className="text-xs font-bold uppercase tracking-wider">{check.label}</span>
                </div>
                <p className={cn("text-sm font-medium", check.done ? "text-foreground" : "text-muted-foreground")}>{check.detail}</p>
             </div>
           ))}
        </div>
      </Card>

      <div className="grid gap-8 xl:grid-cols-[0.8fr_1.2fr]">
        <div className="space-y-6">
           <Card title="Case Configuration">
              <div className="space-y-6">
                 <Field label="Target Patient">
                    <Select 
                      value={activePatientId} 
                      onChange={v => {
                        setActivePatientId(v);
                        const firstCase = cases.find(c => c.patientId === v);
                        if (firstCase) setActiveCaseId(firstCase.id);
                      }}
                    >
                       {patients.length ? patients.map(p => (
                         <option key={p.id} value={p.id}>{p.firstName} {p.lastName} — {p.mrn}</option>
                       )) : <option value="">No registered patients</option>}
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
                       {cases.length ? cases.map(c => (
                         <option key={c.id} value={c.id}>{c.title} ({c.status})</option>
                       )) : <option value="">No studies for patient</option>}
                    </Select>
                 </Field>

                 {!patients.length && (
                   <div className="p-6 text-center border border-dashed border-border/60 rounded-xl bg-muted/10">
                      <Users className="h-8 w-8 text-muted-foreground/40 mx-auto mb-3" />
                      <p className="text-sm text-muted-foreground mb-4">You need to register a patient first.</p>
                      <PrimaryBtn onClick={onCreatePatient} icon={UserPlus} className="w-full">Register Patient</PrimaryBtn>
                   </div>
                 )}
              </div>
           </Card>

           <Card title="Calibration Status">
              <div className="flex items-start gap-4">
                 <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-warning/10 text-warning border border-warning/20">
                    <Ruler className="h-5 w-5" />
                 </div>
                 <div>
                    <h4 className="text-sm font-bold">Spatial Calibration</h4>
                    <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                      Two-point ruler calibration is required for accurate morphometric measurements.
                    </p>
                    <SecondaryBtn onClick={() => navigate("/viewer")} className="mt-4 h-9 px-4 text-xs">
                       Open Viewer for Calibration
                    </SecondaryBtn>
                 </div>
              </div>
           </Card>
        </div>

        <div className="space-y-6">
           <Card title="Imaging Service">
              <h3 className="text-lg font-bold tracking-tight mb-4">Upload Cephalogram</h3>
              <UploadZone 
                activeCaseName={activeCase?.title} 
                onUpload={file => activeCase && onUpload(activeCase.id, file)} 
              />
           </Card>

           <Card className="relative overflow-hidden group">
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-transparent opacity-50" />
              <div className="relative">
                 <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-3">
                       <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/20 text-primary">
                          <BrainCircuit className="h-6 w-6" />
                       </div>
                       <div>
                          <h3 className="text-lg font-bold tracking-tight">AI Diagnostic Pipeline</h3>
                          <p className="text-xs text-muted-foreground">Proprietary deep learning morphometric engine.</p>
                       </div>
                    </div>
                    <div className="flex items-center gap-3">
                       <label className="flex items-center gap-2 text-xs font-bold text-muted-foreground cursor-pointer">
                          <input 
                            type="checkbox" 
                            checked={isCbct} 
                            onChange={e => setIsCbct(e.target.checked)}
                            className="h-4 w-4 rounded border-border/60 bg-muted/40 text-primary accent-primary" 
                          />
                          CBCT Derived
                       </label>
                    </div>
                 </div>

                 <Divider className="mb-6 opacity-40" />

                 <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="text-xs text-muted-foreground italic">
                       * Pipeline includes landmark detection, automated tracing, and skeletal classification.
                    </div>
                    <PrimaryBtn 
                      disabled={!canRunAi || apiMode !== "live" || activeCase?.aiStatus === "processing"}
                      loading={activeCase?.aiStatus === "processing"}
                      onClick={() => activeCase && onRunAi(activeCase.id, isCbct)}
                      icon={BrainCircuit}
                      className="h-12 px-8"
                    >
                       Initiate AI Pipeline
                    </PrimaryBtn>
                 </div>
              </div>
           </Card>
        </div>
      </div>
    </div>
  );
}

function UploadZone({ activeCaseName, onUpload }: { activeCaseName?: string; onUpload: (f: File) => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  return (
    <div
      onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={e => { e.preventDefault(); setIsDragging(false); if (e.dataTransfer.files?.[0]) onUpload(e.dataTransfer.files[0]); }}
      onClick={() => fileRef.current?.click()}
      className={cn(
        "relative cursor-pointer rounded-2xl border-2 border-dashed p-12 text-center transition-all duration-300",
        isDragging 
          ? "border-primary bg-primary/5 scale-[0.99] shadow-inner" 
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
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted/40 mx-auto mb-4 text-muted-foreground group-hover:text-primary transition-colors">
         <Upload className="h-8 w-8" />
      </div>
      <p className="text-base font-bold text-foreground">
        {activeCaseName ? `Attach radiograph to ${activeCaseName}` : "Select a case to upload image"}
      </p>
      <p className="mt-2 text-sm text-muted-foreground">
        Drag and drop your file here, or <span className="text-primary font-bold">browse</span>
      </p>
      <div className="mt-6 flex justify-center gap-3">
         <Pill tone="neutral" size="xs">JPEG / PNG</Pill>
         <Pill tone="neutral" size="xs">DICOM (DCM)</Pill>
         <Pill tone="neutral" size="xs">TIFF</Pill>
      </div>
    </div>
  );
}
