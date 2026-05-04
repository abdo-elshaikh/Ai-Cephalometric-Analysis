import React, { useState } from "react";
import {
  BookOpen, Users, FolderKanban, Upload, ScanLine, BrainCircuit, Activity,
  BarChart3, FileText, ChevronDown, ChevronRight, CheckCircle2, Lightbulb,
  AlertTriangle, Keyboard, Microscope, Target, Info, Zap, Shield, ExternalLink,
  HelpCircle, MessageSquare, Globe, Layers, Sparkles, Command, MousePointer2,
  Monitor,
  ImageIcon,
  Layout,
  Share2,
} from "lucide-react";
import { Card, PageHeader, TabBar, Pill, Divider, TextInput } from "@/components/_core/ClinicalComponents";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

type GuideTab = "start" | "workflow" | "measurements" | "shortcuts" | "faq";

// ─── Callout component ────────────────────────────────────────────────────────

function Callout({
  type = "info",
  title,
  children,
}: {
  type?: "info" | "warning" | "tip" | "success";
  title?: string;
  children: React.ReactNode;
}) {
  const styles = {
    info: { border: "border-sky-500/20", bg: "bg-sky-500/5", icon: Info, iconColor: "text-sky-500" },
    warning: { border: "border-amber-500/20", bg: "bg-amber-500/5", icon: AlertTriangle, iconColor: "text-amber-500" },
    tip: { border: "border-primary/20", bg: "bg-primary/5", icon: Lightbulb, iconColor: "text-primary" },
    success: { border: "border-emerald-500/20", bg: "bg-emerald-500/5", icon: CheckCircle2, iconColor: "text-emerald-500" },
  }[type];
  const Icon = styles.icon;

  return (
    <div className={cn("flex gap-5 rounded-[24px] border p-6 backdrop-blur-sm", styles.border, styles.bg)}>
      <div className={cn("h-10 w-10 rounded-xl flex items-center justify-center shrink-0 border border-current opacity-20")}>
        <Icon className={cn("h-5 w-5", styles.iconColor)} />
      </div>
      <div>
        {title && <p className="text-[11px] font-black uppercase tracking-widest text-foreground mb-1">{title}</p>}
        <div className="text-sm leading-relaxed text-muted-foreground font-medium">{children}</div>
      </div>
    </div>
  );
}

// ─── Accordion item ───────────────────────────────────────────────────────────

function Accordion({
  question,
  children,
}: {
  question: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-border/10 last:border-b-0 group">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="flex w-full items-center justify-between gap-6 py-8 text-left transition-all hover:pl-2"
      >
        <span className={cn("text-base font-black tracking-tight transition-colors", open ? "text-primary" : "text-foreground/80 group-hover:text-foreground")}>{question}</span>
        <div className={cn("h-8 w-8 rounded-lg flex items-center justify-center border transition-all", open ? "bg-primary/10 border-primary/20 text-primary rotate-180" : "bg-muted/10 border-border/20 text-muted-foreground/40")}>
          <ChevronDown className="h-4 w-4" />
        </div>
      </button>
      <div className={cn("overflow-hidden transition-all duration-500", open ? "max-h-[500px] opacity-100 pb-8" : "max-h-0 opacity-0")}>
        <div className="text-sm leading-relaxed text-muted-foreground font-medium space-y-4 pl-2 border-l-2 border-primary/20">
          {children}
        </div>
      </div>
    </div>
  );
}

// ─── Workflow step ────────────────────────────────────────────────────────────

function WorkflowStep({
  step,
  icon: Icon,
  title,
  href,
  color,
  children,
}: {
  step: number;
  icon: React.ElementType;
  title: string;
  href: string;
  color: string;
  children: React.ReactNode;
}) {
  return (
    <div className="relative flex gap-10 group">
      {/* Spine connector */}
      {step < 7 && (
        <div className="absolute left-[23px] top-12 bottom-0 w-px bg-gradient-to-b from-primary/40 to-transparent" />
      )}
      <div className={cn(
        "relative z-10 flex h-12 w-12 shrink-0 items-center justify-center rounded-[18px] border-2 text-[14px] font-black transition-all duration-500 group-hover:scale-110",
        color
      )}>
        <Icon className="h-5 w-5" />
        <div className="absolute -top-2 -right-2 h-6 w-6 rounded-full bg-background border-2 border-current flex items-center justify-center text-[10px] font-black">
          {step}
        </div>
      </div>
      <div className="flex-1 pb-16">
        <div className="flex flex-wrap items-center gap-4 mb-4">
          <h3 className="text-xl font-black tracking-tight text-foreground group-hover:text-primary transition-colors">{title}</h3>
          <div className="px-3 py-1 rounded-lg bg-muted/20 border border-border/10 text-[9px] font-black font-mono tracking-widest text-muted-foreground/60 uppercase">
            Route: {href}
          </div>
        </div>
        <div className="text-sm leading-relaxed text-muted-foreground font-medium space-y-4 max-w-3xl">
          {children}
        </div>
      </div>
    </div>
  );
}

// ─── Shortcut row ─────────────────────────────────────────────────────────────

function ShortcutRow({ keys, action }: { keys: string[]; action: string }) {
  return (
    <div className="flex items-center justify-between py-5 border-b border-border/5 last:border-0 group/row">
      <span className="text-[11px] font-black uppercase tracking-widest text-muted-foreground group-hover/row:text-foreground transition-colors">{action}</span>
      <div className="flex items-center gap-2">
        {keys.map((k, i) => (
          <React.Fragment key={k}>
            {i > 0 && <span className="text-[10px] font-black text-muted-foreground/20">+</span>}
            <kbd className="inline-flex items-center h-8 min-w-8 justify-center rounded-lg border-2 border-border/40 bg-card/60 px-3 text-[10px] font-black font-mono text-foreground shadow-sm group-hover/row:border-primary/40 group-hover/row:text-primary transition-all">
              {k.toUpperCase()}
            </kbd>
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}

// ─── Measurement row ──────────────────────────────────────────────────────────

function MeasurementRow({ name, normal, unit, desc }: { name: string; normal: string; unit: string; desc: string }) {
  return (
    <tr className="border-b border-border/5 group hover:bg-muted/5 transition-colors">
      <td className="py-6 px-8">
        <div className="flex items-center gap-3">
          <div className="h-1.5 w-1.5 rounded-full bg-primary opacity-0 group-hover:opacity-100 transition-opacity" />
          <span className="text-sm font-black tracking-tight text-foreground group-hover:text-primary transition-colors">{name}</span>
        </div>
      </td>
      <td className="py-6 px-8">
        <div className="font-black tabular-nums text-xs text-foreground/80 bg-muted/20 px-3 py-1.5 rounded-lg border border-border/10 inline-block">
          {normal}
        </div>
      </td>
      <td className="py-6 px-8 text-[10px] font-black uppercase tracking-widest text-muted-foreground/40">{unit}</td>
      <td className="py-6 px-8 text-xs text-muted-foreground font-medium leading-relaxed max-w-[320px]">{desc}</td>
    </tr>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function GuidePage() {
  const [tab, setTab] = useState<GuideTab>("start");

  return (
    <div className="min-h-screen bg-background text-foreground selection:bg-primary/30 pb-20 animate-in fade-in duration-700">

      {/* ── Ambient background ── */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-60 -left-40 w-[800px] h-[800px] rounded-full bg-primary/5 blur-[120px] animate-pulse duration-[12s]" />
        <div className="absolute bottom-0 -right-40 w-[600px] h-[600px] rounded-full bg-emerald-500/5 blur-[100px] animate-pulse duration-[10s]" />
      </div>

      <div className="relative z-10 space-y-10 p-6 md:p-8 lg:p-10 max-w-[1600px] mx-auto">

        {/* ── Page header ── */}
        <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="h-1.5 w-8 rounded-full bg-gradient-to-r from-primary to-emerald-400" />
              <span className="text-xs font-black uppercase tracking-[0.25em] text-primary/80">
                Instructional Nexus
              </span>
            </div>
            <h1 className="text-4xl font-black tracking-tight text-gradient-primary md:text-5xl">
              User Guide
            </h1>
            <p className="text-muted-foreground font-medium max-w-2xl leading-relaxed">
              Comprehensive clinical documentation for the CephAI ecosystem. Master the diagnostic orchestration cycle, AI telemetry, and report synthesis.
            </p>
          </div>

          <div className="flex items-center gap-3 shrink-0 bg-card/30 backdrop-blur-md p-2 rounded-2xl border border-border/40 shadow-sm-professional">
            <div className="flex items-center gap-3 px-6 py-2.5 bg-primary/10 border border-primary/20 rounded-xl text-primary">
              <HelpCircle className="h-4 w-4" />
              <span className="text-[10px] font-black uppercase tracking-widest">Knowledge Base v2.2</span>
            </div>
          </div>
        </div>

        <TabBar<GuideTab>
          tabs={[
            { id: "start", label: "Orientation", icon: Zap },
            { id: "workflow", label: "Orchestration", icon: ChevronRight },
            { id: "measurements", label: "Biometrics", icon: Target },
            { id: "shortcuts", label: "Hotkeys", icon: Keyboard },
            { id: "faq", label: "Synthesis FAQ", icon: BookOpen },
          ]}
          active={tab}
          onChange={setTab}
          className="bg-card/40 backdrop-blur-xl border-border/20 p-2 rounded-[32px] shadow-lg-professional w-fit mx-auto lg:mx-0"
        />

        {/* ── Orientation ──────────────────────────────────────────────────── */}
        {tab === "start" && (
          <div className="space-y-12 animate-in fade-in slide-in-from-bottom-6 duration-700">
            <div className="grid gap-8 lg:grid-cols-3">
              {[
                { icon: Shield, title: "HIPAA Integrity", desc: "All patient metadata and clinical radiographs are persisted on secure surgical backends. Frontend assets are ephemeral." },
                { icon: BrainCircuit, title: "Neural Synthesis", desc: "Proprietary HRNet-W32 architectures facilitate 80-point landmark detection with sub-pixel geometric precision." },
                { icon: FileText, title: "Artifact Export", desc: "Synthesize high-fidelity PDF and Word reports containing complete diagnostic measurements and skeletal projections." },
              ].map((item, idx) => (
                <Card key={item.title} className="p-10 glass-premium hover-lift border-border/40 shadow-md-professional space-y-6">
                  <div className="h-14 w-14 rounded-[20px] bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shadow-xl shadow-primary/5">
                    <item.icon className="h-7 w-7" />
                  </div>
                  <div className="space-y-2">
                    <h3 className="text-xl font-black tracking-tight text-foreground">{item.title}</h3>
                    <p className="text-sm leading-relaxed text-muted-foreground font-medium opacity-70">{item.desc}</p>
                  </div>
                </Card>
              ))}
            </div>

            <div className="grid gap-8 lg:grid-cols-2">
              <Card className="p-10 glass-premium border-border/40 shadow-lg-professional space-y-8">
                <div className="flex items-center gap-4 mb-2">
                  <div className="h-10 w-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-500">
                    <CheckCircle2 className="h-5 w-5" />
                  </div>
                  <h3 className="text-xl font-black tracking-tight">Clinical Checklist</h3>
                </div>
                <div className="space-y-4">
                  {[
                    { done: true, label: "Initialize clinical identity (Sign In)" },
                    { done: false, label: "Register patient biometrics in the registry" },
                    { done: false, label: "Provision a clinical study (Case)" },
                    { done: false, label: "Asset ingestion (Radiograph Upload)" },
                    { done: false, label: "Metric calibration (Scale Sync)" },
                    { done: false, label: "Execute Neural Pipeline (AI Analysis)" },
                    { done: false, label: "Finalize biometric model (Viewer Review)" },
                    { done: false, label: "Artifact synthesis (Report Generation)" },
                  ].map((item, i) => (
                    <div key={i} className="flex items-start gap-4 group">
                      <div className={cn(
                        "mt-0.5 h-6 w-6 shrink-0 rounded-lg border-2 flex items-center justify-center text-[10px] font-black transition-all",
                        item.done ? "bg-emerald-500 border-emerald-500 text-white shadow-lg shadow-emerald-500/20" : "bg-muted/10 border-border/20 text-muted-foreground/30 group-hover:border-primary/40"
                      )}>
                        {item.done ? <CheckCircle2 className="h-3.5 w-3.5" /> : i + 1}
                      </div>
                      <p className={cn("text-sm font-bold tracking-tight", item.done ? "text-muted-foreground/40 line-through" : "text-foreground group-hover:text-primary transition-colors")}>
                        {item.label}
                      </p>
                    </div>
                  ))}
                </div>
              </Card>

              <div className="space-y-8">
                <Card className="p-8 glass-premium border-border/40 space-y-6">
                  <div className="flex items-center gap-4">
                    <Monitor className="h-5 w-5 text-primary" />
                    <h4 className="text-sm font-black uppercase tracking-widest text-foreground/80">System Telemetry</h4>
                  </div>
                  <ul className="grid gap-3">
                    {[
                      "Chrome 120+ / Edge 120+ Environment",
                      "1440 × 900 Spatial Resolution (Recommended)",
                      "Secure WebSocket Protocol Enabled",
                      "CephAI Backend Core v2.2 Handshake",
                    ].map((r, i) => (
                      <li key={i} className="flex items-center gap-3 text-[11px] font-black uppercase tracking-widest text-muted-foreground/60 bg-muted/5 p-3 rounded-xl border border-border/5">
                        <Zap className="h-3 w-3 text-primary/40" />
                        {r}
                      </li>
                    ))}
                  </ul>
                </Card>

                <Card className="p-8 glass-premium border-border/40 space-y-6">
                  <div className="flex items-center gap-4">
                    <ImageIcon className="h-5 w-5 text-sky-500" />
                    <h4 className="text-sm font-black uppercase tracking-widest text-foreground/80">Asset Parameters</h4>
                  </div>
                  <ul className="grid gap-3">
                    {[
                      "Format: Lossless PNG / High-Quality JPEG",
                      "Max Payload: 100 MB per study",
                      "Spatial Denisty: ≥ 1500px Cartesian Grid",
                      "Radiology: True Lateral Projection (90°)",
                    ].map((r, i) => (
                      <li key={i} className="flex items-center gap-3 text-[11px] font-black uppercase tracking-widest text-muted-foreground/60 bg-muted/5 p-3 rounded-xl border border-border/5">
                        <ScanLine className="h-3 w-3 text-sky-500/40" />
                        {r}
                      </li>
                    ))}
                  </ul>
                </Card>
              </div>
            </div>

            <Callout type="warning" title="Clinical Governance & Validation">
              The CephAI ecosystem is a diagnostic augmentation layer. All neural inferences, etiological summaries, and treatment modalities must be authenticated and validated by a licensed clinical professional. The system serves as a decision-support module, not a singular diagnostic entity.
            </Callout>
          </div>
        )}

        {/* ── Orchestration ──────────────────────────────────────────────────── */}
        {tab === "workflow" && (
          <div className="space-y-12 animate-in fade-in slide-in-from-bottom-6 duration-700">
            <Callout type="tip" title="Contextual Navigation">
              The platform operates within a global "Active Study" context. Initializing a session on the Registry or Portfolio modules synchronizes all subsequent diagnostic computations to that patient identity.
            </Callout>

            <Card className="p-12 glass-premium border-border/40 shadow-lg-professional">
              <WorkflowStep step={1} icon={Users} title="Patient Registration" href="/patients"
                color="border-primary/40 bg-primary/10 text-primary shadow-lg shadow-primary/10">
                <p>Access the <strong>Patient Registry</strong> to enroll a new identity. Critical biometric parameters include date of birth (for growth velocity calculation) and sex (for population normative baseline).</p>
                <div className="p-5 rounded-2xl bg-muted/10 border border-border/10 flex gap-4 items-start">
                  <Users className="h-5 w-5 text-primary mt-1" />
                  <p className="text-xs font-medium text-muted-foreground leading-relaxed italic">PRO TIP: Utilize the neural search filter to prevent redundant patient enrollment before provisioning a new profile.</p>
                </div>
              </WorkflowStep>

              <WorkflowStep step={2} icon={FolderKanban} title="Case Provisioning" href="/cases"
                color="border-amber-500/40 bg-amber-500/10 text-amber-500 shadow-lg shadow-amber-500/10">
                <p>Initialize a specific diagnostic study within the <strong>Clinical Portfolio</strong>. Select the target patient and define the analysis protocol (Steiner, Ricketts, or Full Synthesis). The case will enter a <Pill tone="neutral" size="xs" className="mx-1 uppercase font-black tracking-widest">DRAFT</Pill> state until asset ingestion.</p>
              </WorkflowStep>

              <WorkflowStep step={3} icon={Upload} title="Radiograph Ingestion" href="/analysis"
                color="border-sky-500/40 bg-sky-500/10 text-sky-500 shadow-lg shadow-sky-500/10">
                <p>Upload the lateral cephalometric asset. Our processing pipeline accepts high-resolution Cartesian grids and applies automatic exposure normalization. Once ingested, the session advances to <Pill tone="info" size="xs" className="mx-1 uppercase font-black tracking-widest">ASSET SYNCED</Pill>.</p>
              </WorkflowStep>

              <WorkflowStep step={4} icon={ScanLine} title="Metric Synchronization" href="/calibrate"
                color="border-emerald-500/40 bg-emerald-500/10 text-emerald-500 shadow-lg shadow-emerald-500/10">
                <p>Establish a spatial bridge by calibrating the pixel-to-millimeter ratio. Identify two points on a known geometric reference (ruler or marker) and enter the absolute clinical distance. This ensures biometric accuracy across all linear measurements.</p>
                <Callout type="warning">Execution without calibration will produce pixel-relative metrics, flagged with diagnostic warnings on all clinical artifacts.</Callout>
              </WorkflowStep>

              <WorkflowStep step={5} icon={BrainCircuit} title="Neural Engine Execution" href="/analysis"
                color="border-primary/40 bg-primary/10 text-primary shadow-lg shadow-primary/10">
                <p>Trigger the <strong>Full AI Pipeline</strong>. The engine performs asynchronous computation across four diagnostic tiers:</p>
                <div className="grid sm:grid-cols-2 gap-4 mt-6">
                  {[
                    { title: "Landmark Inversion", desc: "80 anatomical points via HRNet-W32" },
                    { title: "Biometric Synthesis", desc: "90+ clinical measurements computed" },
                    { title: "Diagnostic Mapping", desc: "Etiological classification & class mapping" },
                    { title: "Modality Ranking", desc: "Rule-based treatment recommendations" },
                  ].map(tier => (
                    <div key={tier.title} className="p-4 rounded-xl bg-background/40 border border-border/10">
                      <p className="text-[10px] font-black uppercase tracking-widest text-primary mb-1">{tier.title}</p>
                      <p className="text-xs text-muted-foreground font-medium">{tier.desc}</p>
                    </div>
                  ))}
                </div>
              </WorkflowStep>

              <WorkflowStep step={6} icon={Activity} title="Biometric Review" href="/viewer"
                color="border-sky-500/40 bg-sky-500/10 text-sky-500 shadow-lg shadow-sky-500/10">
                <p>Navigate to the <strong>Diagnostic Viewer</strong> to audit the neural output. High-fidelity vector overlays represent the skeletal and soft-tissue synthesis. Adjust landmarks manually for surgical precision and finalize the model to synchronize final measurements.</p>
              </WorkflowStep>

              <WorkflowStep step={7} icon={FileText} title="Artifact Synthesis" href="/results"
                color="border-emerald-500/40 bg-emerald-500/10 text-emerald-500 shadow-lg shadow-emerald-500/10">
                <p>Review the comprehensive <strong>Diagnostic Synthesis</strong>. Analyze growth projections, airway metrics, and dental torque. Export the clinical artifact as a serialized PDF or DOCX packet for patient communication or surgical documentation.</p>
              </WorkflowStep>
            </Card>
          </div>
        )}

        {/* ── Biometrics ──────────────────────────────────────────────────────── */}
        {tab === "measurements" && (
          <div className="space-y-12 animate-in fade-in slide-in-from-bottom-6 duration-700">
            <Callout type="info" title="Computational Matrix">
              The CephAI neural core computes metrics across Steiner, Tweed, McNamara, Jarabak, Downs, Ricketts, and Burstone modalities. All values include propagated uncertainty and deviation from normative population baselines.
            </Callout>

            {[
              {
                group: "Skeletal Architecture — Maxilla/Mandible",
                rows: [
                  { name: "SNA", normal: "82 ± 3°", unit: "degrees", desc: "Maxillary sagittal position relative to cranial base" },
                  { name: "SNB", normal: "80 ± 3°", unit: "degrees", desc: "Mandibular sagittal position relative to cranial base" },
                  { name: "ANB", normal: "2 ± 2°", unit: "degrees", desc: "Sagittal jaw relationship (negative = Class III tendency)" },
                  { name: "Wits", normal: "0 ± 2 mm", unit: "mm", desc: "Functional occlusal plane-based jaw discrepancy" },
                ],
              },
              {
                group: "Vertical Vector — Facial Pattern",
                rows: [
                  { name: "FMA (FH-MP)", normal: "25 ± 3°", unit: "degrees", desc: "Frankfort-Mandibular plane angle; high = hyperdivergent" },
                  { name: "Jarabak ratio", normal: "62–65%", unit: "%", desc: "Posterior/anterior facial height ratio" },
                  { name: "LAFH", normal: "55–60 mm", unit: "mm", desc: "Lower anterior facial height (ANS-Menton)" },
                ],
              },
              {
                group: "Dental Torque — Incisor Position",
                rows: [
                  { name: "UI-NA °", normal: "22 ± 5°", unit: "degrees", desc: "Upper incisor inclination to NA line" },
                  { name: "LI-NB °", normal: "25 ± 5°", unit: "degrees", desc: "Lower incisor inclination to NB line" },
                  { name: "IMPA", normal: "90 ± 5°", unit: "degrees", desc: "Mandibular incisor-mandibular plane angle (Tweed)" },
                ],
              },
            ].map(section => (
              <div key={section.group} className="space-y-6">
                <div className="flex items-center gap-4">
                  <div className="h-1.5 w-8 rounded-full bg-primary" />
                  <h3 className="text-[11px] font-black uppercase tracking-[0.25em] text-muted-foreground/60">{section.group}</h3>
                </div>
                <Card noPadding className="glass-premium border-border/20 shadow-lg-professional overflow-hidden">
                  <table className="w-full text-left">
                    <thead className="border-b border-border/10 bg-muted/5">
                      <tr>
                        {["Measurement", "Normative Baseline", "Metric", "Diagnostic Utility"].map(h => (
                          <th key={h} className="px-8 py-5 text-[10px] font-black uppercase tracking-widest text-muted-foreground/40">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/5">
                      {section.rows.map(r => <MeasurementRow key={r.name} {...r} />)}
                    </tbody>
                  </table>
                </Card>
              </div>
            ))}

            <Callout type="tip" title="Normative Adaptation">
              Biometric normal ranges are dynamically adjusted based on the population baseline selected in <strong>Settings → Clinical Models</strong>. The system supports 8 distinct ethnic datasets with unique coefficient offsets.
            </Callout>
          </div>
        )}

        {/* ── Hotkeys ────────────────────────────────────────────────────────── */}
        {tab === "shortcuts" && (
          <div className="grid gap-8 lg:grid-cols-2 animate-in fade-in slide-in-from-bottom-6 duration-700">
            {[
              {
                title: "Global Handshakes",
                icon: Command,
                shortcuts: [
                  { keys: ["G", "D"], action: "DASHBOARD ACCESS" },
                  { keys: ["G", "P"], action: "PATIENT REGISTRY" },
                  { keys: ["G", "C"], action: "CASE PORTFOLIO" },
                  { keys: ["G", "A"], action: "DIAGNOSTIC ANALYSIS" },
                  { keys: ["G", "V"], action: "INTERACTIVE VIEWER" },
                ],
              },
              {
                title: "Viewer Telemetry",
                icon: MousePointer2,
                shortcuts: [
                  { keys: ["Scroll"], action: "ZOOM SCALING" },
                  { keys: ["Alt", "Drag"], action: "VIEWPORT PAN" },
                  { keys: ["0"], action: "RESET PROJECTION" },
                  { keys: ["M"], action: "MINIMAP TOGGLE" },
                  { keys: ["L"], action: "LABEL OVERLAY" },
                ],
              },
              {
                title: "Core Operations",
                icon: Zap,
                shortcuts: [
                  { keys: ["Ctrl", "U"], action: "INITIATE UPLOAD" },
                  { keys: ["Ctrl", "R"], action: "EXECUTE AI PIPELINE" },
                  { keys: ["Ctrl", "K"], action: "COMMAND PALETTE" },
                  { keys: ["Esc"], action: "TERMINATE OPERATION" },
                ],
              },
              {
                title: "System UI",
                icon: Layout,
                shortcuts: [
                  { keys: ["Ctrl", "B"], action: "SIDEBAR TOGGLE" },
                  { keys: ["Ctrl", "L"], action: "LUMINANCE SHIFT" },
                  { keys: ["?"], action: "ORIENTATION GUIDE" },
                ],
              },
            ].map(group => (
              <Card key={group.title} className="p-10 glass-premium border-border/40 shadow-lg-professional space-y-8">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="h-10 w-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shadow-lg shadow-primary/5">
                      <group.icon className="h-5 w-5" />
                    </div>
                    <h3 className="text-xl font-black tracking-tight">{group.title}</h3>
                  </div>
                </div>
                <div className="space-y-1">
                  {group.shortcuts.map(s => (
                    <ShortcutRow key={s.action} keys={s.keys} action={s.action} />
                  ))}
                </div>
              </Card>
            ))}
          </div>
        )}

        {/* ── Synthesis FAQ ───────────────────────────────────────────────────────────────── */}
        {tab === "faq" && (
          <div className="space-y-12 animate-in fade-in slide-in-from-bottom-6 duration-700">
            <div className="max-w-4xl mx-auto">
              <Card className="p-10 glass-premium border-border/40 shadow-lg-professional divide-y divide-border/10">
                <Accordion question="How is AI landmark accuracy verified in the system?">
                  <p>The neural engine utilizes <strong>HRNet-W32</strong> with multi-axis test-time augmentation (flips + luminance shift) to achieve sub-millimeter precision. Each detected point is assigned a <strong>DSNT spatial variance score</strong>, representing the system's geometric confidence. High-variance (low confidence) points are automatically flagged for manual clinical audit in the Interactive Viewer.</p>
                </Accordion>

                <Accordion question="What is the significance of the 20mm metal reference ball in calibration?">
                  Cephalometric radiographs are subject to magnification and distortion based on patient positioning and sensor distance. To establish an absolute clinical scale, a known radio-opaque reference (typically a 20mm metallic marker or integrated ruler) must be present. Our calibration module synchronizes the pixel-space Cartesian grid to real-world millimeters based on this reference.
                </Accordion>

                <Accordion question="How do the automated treatment suggestions work?">
                  Recommendations are generated via a <strong>Modality Synthesis Engine</strong> that processes 22 distinct clinical logic paths. These rules evaluate skeletal class, vertical patterns, dental crowding, and growth velocity. Modalities (e.g., LeFort I, BSSO, Camouflage) are ranked by etiological relevance and evidence-based clinical protocols.
                </Accordion>

                <Accordion question="Can I adjust the normative baseline for different ethnicities?">
                  Yes. Navigate to <strong>System Settings → Clinical Parameters</strong>. The platform integrates normative datasets for Caucasian, Chinese, East Asian, Japanese, African-American, Hispanic, Indian, and Brazilian populations. Selecting a norm dynamically updates the SNA, SNB, and mandibular length coefficients across all analysis modules.
                </Accordion>

                <Accordion question="What diagnostic artifacts are included in the generated report?">
                  Formal exports include a multi-tier synthesis: patient biometrics, complete measurement matrix with normative deviations, 5 types of clinical vector overlays, skeletal diagnosis summary, growth velocity projections, and ranked treatment modalities with complexity tiers.
                </Accordion>
              </Card>
            </div>

            <div className="grid sm:grid-cols-3 gap-8">
              {[
                { label: "API Specification", icon: Globe, detail: "Swagger documentation for clinical endpoints." },
                { icon: MessageSquare, label: "Clinical Support", detail: "Professional consultancy for etiological mapping." },
                { icon: Share2, label: "Network Integration", detail: "PACS/DICOM synchronization guidelines." },
              ].map(item => (
                <Card key={item.label} className="p-8 glass-premium border-border/20 shadow-md-professional flex flex-col items-center text-center space-y-4 hover-lift">
                  <div className="h-12 w-12 rounded-2xl bg-muted/10 border border-border/10 flex items-center justify-center text-primary group-hover:bg-primary/10 transition-all">
                    <item.icon className="h-6 w-6" />
                  </div>
                  <h4 className="text-sm font-black uppercase tracking-widest">{item.label}</h4>
                  <p className="text-xs text-muted-foreground font-medium">{item.detail}</p>
                  <button className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-primary pt-4 group">
                    Access Terminal
                    <ExternalLink className="h-3 w-3 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
                  </button>
                </Card>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
