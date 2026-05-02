import React, { useState } from "react";
import {
  BookOpen,
  Users,
  FolderKanban,
  Upload,
  ScanLine,
  BrainCircuit,
  Activity,
  BarChart3,
  FileText,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  Lightbulb,
  AlertTriangle,
  Keyboard,
  Microscope,
  Target,
  Info,
  Zap,
  Shield,
  ExternalLink,
} from "lucide-react";
import { Card, PageHeader, TabBar, Pill, Divider } from "@/components/_core/ClinicalComponents";
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
    info:    { border: "border-info/20",    bg: "bg-info/8",    icon: Info,          iconColor: "text-info-foreground"    },
    warning: { border: "border-warning/20", bg: "bg-warning/8", icon: AlertTriangle, iconColor: "text-warning-foreground" },
    tip:     { border: "border-primary/20", bg: "bg-primary/8", icon: Lightbulb,     iconColor: "text-primary"            },
    success: { border: "border-success/20", bg: "bg-success/8", icon: CheckCircle2,  iconColor: "text-success-foreground" },
  }[type];
  const Icon = styles.icon;

  return (
    <div className={cn("flex gap-3 rounded-lg border p-4", styles.border, styles.bg)}>
      <Icon className={cn("h-4 w-4 mt-0.5 shrink-0", styles.iconColor)} />
      <div>
        {title && <p className="text-[12px] font-semibold text-foreground mb-1">{title}</p>}
        <div className="text-[12px] leading-relaxed text-muted-foreground">{children}</div>
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
    <div className="border-b border-border last:border-b-0">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="flex w-full items-center justify-between gap-4 py-4 text-left transition-colors hover:text-foreground"
      >
        <span className="text-[13px] font-medium text-foreground">{question}</span>
        {open
          ? <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
          : <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />}
      </button>
      {open && (
        <div className="pb-4 text-[12px] leading-relaxed text-muted-foreground space-y-2">
          {children}
        </div>
      )}
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
    <div className="relative flex gap-5">
      {/* Spine connector */}
      {step < 7 && (
        <div className="absolute left-[19px] top-12 bottom-0 w-px bg-border" />
      )}
      <div className={cn(
        "relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 text-[12px] font-bold",
        color
      )}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="flex-1 pb-8">
        <div className="flex items-center gap-2 mb-2">
          <h3 className="text-[14px] font-semibold text-foreground">{title}</h3>
          <code className="text-[10px] font-mono bg-muted px-1.5 py-0.5 rounded text-muted-foreground">{href}</code>
        </div>
        <div className="text-[13px] leading-relaxed text-muted-foreground space-y-2">
          {children}
        </div>
      </div>
    </div>
  );
}

// ─── Shortcut row ─────────────────────────────────────────────────────────────

function ShortcutRow({ keys, action }: { keys: string[]; action: string }) {
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-border/50 last:border-0">
      <span className="text-[13px] text-muted-foreground">{action}</span>
      <div className="flex items-center gap-1">
        {keys.map((k, i) => (
          <React.Fragment key={k}>
            {i > 0 && <span className="text-[11px] text-muted-foreground/50">+</span>}
            <kbd className="inline-flex items-center rounded border border-border bg-muted px-2 py-0.5 text-[11px] font-mono font-medium text-foreground shadow-sm">
              {k}
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
    <tr className="border-b border-border/40 hover:bg-muted/20 transition-colors">
      <td className="py-3 px-4 text-[13px] font-semibold text-foreground">{name}</td>
      <td className="py-3 px-4 font-mono text-[12px] text-muted-foreground tabular-nums">{normal}</td>
      <td className="py-3 px-4 text-[11px] text-muted-foreground/70">{unit}</td>
      <td className="py-3 px-4 text-[12px] text-muted-foreground max-w-[280px]">{desc}</td>
    </tr>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function GuidePage() {
  const [tab, setTab] = useState<GuideTab>("start");

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-3 duration-400">
      <PageHeader
        eyebrow="Documentation"
        title="User Guide"
        description="Everything you need to use the CephAI clinical platform — from first login to final report."
      />

      <TabBar<GuideTab>
        tabs={[
          { id: "start",        label: "Getting Started", icon: Zap         },
          { id: "workflow",     label: "Workflow",         icon: ChevronRight },
          { id: "measurements", label: "Measurements",     icon: Target       },
          { id: "shortcuts",    label: "Shortcuts",        icon: Keyboard     },
          { id: "faq",          label: "FAQ",              icon: BookOpen     },
        ]}
        active={tab}
        onChange={setTab}
      />

      {/* ── Getting Started ──────────────────────────────────────────────────── */}
      {tab === "start" && (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-3">
            {[
              { icon: Shield,      title: "HIPAA-Compliant",    desc: "All PHI stored on your backend server. The browser stores only your session token." },
              { icon: BrainCircuit,title: "AI-Powered Analysis",desc: "HRNet-W32 detects 80 anatomical landmarks. 90+ cephalometric measurements computed automatically." },
              { icon: FileText,    title: "Clinical Reports",   desc: "Export PDF and DOCX reports with measurements, overlays, diagnosis, and treatment plan." },
            ].map(item => {
              const Icon = item.icon;
              return (
                <Card key={item.title} className="flex flex-col gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-primary/20 bg-primary/10">
                    <Icon className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <p className="text-[13px] font-semibold text-foreground">{item.title}</p>
                    <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">{item.desc}</p>
                  </div>
                </Card>
              );
            })}
          </div>

          <Card title="Quick-start checklist">
            <div className="space-y-3">
              {[
                { done: true,  label: "Sign in with your clinic credentials" },
                { done: false, label: "Create at least one patient record" },
                { done: false, label: "Create a clinical case and attach it to a patient" },
                { done: false, label: "Upload a lateral cephalometric X-ray image (JPEG/PNG/BMP, max 100 MB)" },
                { done: false, label: "Calibrate the image using a known reference distance" },
                { done: false, label: "Run the AI full pipeline (detection → measurements → diagnosis → treatment)" },
                { done: false, label: "Review results, adjust any landmarks, and finalize" },
                { done: false, label: "Generate and export the clinical report" },
              ].map((item, i) => (
                <div key={i} className="flex items-start gap-3">
                  <div className={cn(
                    "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border",
                    item.done
                      ? "border-success/30 bg-success/10 text-success"
                      : "border-border bg-muted/30 text-muted-foreground/40"
                  )}>
                    {item.done
                      ? <CheckCircle2 className="h-3 w-3" />
                      : <span className="text-[9px] font-bold">{i + 1}</span>}
                  </div>
                  <p className={cn("text-[13px]", item.done ? "text-muted-foreground line-through" : "text-foreground")}>
                    {item.label}
                  </p>
                </div>
              ))}
            </div>
          </Card>

          <div className="grid gap-4 md:grid-cols-2">
            <Card title="System Requirements">
              <ul className="space-y-2 text-[12px] text-muted-foreground">
                {[
                  "Modern browser: Chrome 120+, Firefox 121+, Safari 17+, Edge 120+",
                  "Screen resolution: 1280 × 800 minimum (1440 × 900 recommended)",
                  "JavaScript enabled",
                  ".NET 9 backend reachable on configured port (default 5180)",
                  "Python FastAPI AI service on port 8000 (for landmark detection)",
                  "PostgreSQL 16 + Redis 7 on the server",
                ].map((r, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <ChevronRight className="h-3 w-3 shrink-0 mt-0.5 text-primary/60" />
                    {r}
                  </li>
                ))}
              </ul>
            </Card>

            <Card title="Image Requirements">
              <ul className="space-y-2 text-[12px] text-muted-foreground">
                {[
                  "Format: JPEG, PNG, BMP, or DICOM-derived PNG",
                  "Max file size: 100 MB",
                  "Recommended resolution: ≥ 1500 × 1500 px",
                  "View: standard lateral cephalometric (90° to Frankfort horizontal)",
                  "Contrast: avoid heavy filtering — raw radiographic tone preferred",
                  "Calibration object must be visible (e.g. 20 mm metal ball, ruler)",
                ].map((r, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <ChevronRight className="h-3 w-3 shrink-0 mt-0.5 text-primary/60" />
                    {r}
                  </li>
                ))}
              </ul>
            </Card>
          </div>

          <Callout type="warning" title="For professional clinical use only">
            CephAI is a decision-support tool. All AI-generated measurements, diagnoses, and treatment
            suggestions must be reviewed and validated by a qualified orthodontist or oral/maxillofacial
            specialist before clinical use. Do not rely solely on AI output for treatment decisions.
          </Callout>
        </div>
      )}

      {/* ── Workflow ──────────────────────────────────────────────────────────── */}
      {tab === "workflow" && (
        <div className="space-y-6">
          <Callout type="tip" title="Active case context">
            The platform uses an "active case" concept. Set the active case on the Cases page before
            running analysis — all AI pipeline steps operate on the active case's image.
          </Callout>

          <Card noPadding className="p-6">
            <WorkflowStep step={1} icon={Users} title="Register a Patient" href="/patients"
              color="border-primary/40 bg-primary/10 text-primary">
              <p>Navigate to <strong>Patients</strong> and click <em>New patient</em>. Fill in the patient's full name,
              date of birth, sex, and optional contact details. The patient record will appear in your workspace.</p>
              <Callout type="tip">Use the patient search to quickly find existing records before creating a duplicate.</Callout>
            </WorkflowStep>

            <WorkflowStep step={2} icon={FolderKanban} title="Create a Clinical Case" href="/cases"
              color="border-warning/40 bg-warning/10 text-warning-foreground">
              <p>On the <strong>Cases</strong> page, click <em>New case</em>. Select the patient, choose an analysis
              type (Steiner is the most common), and give the case a descriptive title. The case is now in
              <Pill tone="neutral" size="xs" className="mx-1">Draft</Pill> status.</p>
              <p>Set this case as the active case by selecting it in the table.</p>
            </WorkflowStep>

            <WorkflowStep step={3} icon={Upload} title="Upload the X-ray Image" href="/analysis"
              color="border-info/40 bg-info/10 text-info-foreground">
              <p>On the <strong>Analysis</strong> page, click the upload area and select your lateral X-ray image.
              Supported formats: JPEG, PNG, BMP. The image is uploaded directly to your backend server and a
              thumbnail is generated. Status changes to <Pill tone="info" size="xs" className="mx-1">Image uploaded</Pill>.</p>
            </WorkflowStep>

            <WorkflowStep step={4} icon={ScanLine} title="Calibrate the Image" href="/calibrate"
              color="border-success/40 bg-success/10 text-success-foreground">
              <p>Navigate to <strong>Calibrate</strong>. Click two known points on the X-ray (e.g. the two ends of a
              20 mm calibration ball or ruler), then enter the real-world distance in mm. The platform stores the
              px/mm scale factor.</p>
              <Callout type="warning">Skipping calibration means all measurements will be in pixels, not millimetres. Results will be flagged with an <em>UNCALIBRATED</em> watermark on overlays.</Callout>
            </WorkflowStep>

            <WorkflowStep step={5} icon={BrainCircuit} title="Run the AI Full Pipeline" href="/analysis"
              color="border-primary/40 bg-primary/10 text-primary">
              <p>Back on <strong>Analysis</strong>, click <em>Run full AI pipeline</em>. The engine performs four
              sequential steps:</p>
              <ol className="list-decimal list-inside space-y-1 pl-1">
                <li><strong>Landmark detection</strong> — HRNet-W32 with multi-axis TTA detects 80 landmarks</li>
                <li><strong>Measurement calculation</strong> — 90+ measurements computed with uncertainty propagation</li>
                <li><strong>Diagnosis classification</strong> — skeletal class, CVM stage, airway risk, Bolton</li>
                <li><strong>Treatment planning</strong> — 22 evidence-based rules produce ranked recommendations</li>
              </ol>
              <p>Status changes to <Pill tone="success" size="xs" className="mx-1">AI completed</Pill> when done.</p>
            </WorkflowStep>

            <WorkflowStep step={6} icon={Activity} title="Review & Adjust in the Viewer" href="/viewer"
              color="border-info/40 bg-info/10 text-info-foreground">
              <p>The <strong>Viewer</strong> renders the X-ray as an interactive SVG with all 80 landmarks and 11
              cephalometric tracing lines. Drag any landmark to correct its position, then click
              <em> Finalize</em> to re-calculate all measurements with the corrected positions.</p>
              <Callout type="tip">
                Low-confidence landmarks (below your threshold in Settings) are highlighted in amber.
                Always review these manually before finalizing.
              </Callout>
            </WorkflowStep>

            <WorkflowStep step={7} icon={FileText} title="Export the Clinical Report" href="/results"
              color="border-success/40 bg-success/10 text-success-foreground">
              <p>The <strong>Results</strong> page shows all measurements with deviation bars, the diagnosis summary,
              treatment options, and the growth prediction. Use the <em>Reports</em> tab to generate a
              PDF or DOCX report. The report includes:</p>
              <ul className="list-disc list-inside space-y-1 pl-1">
                <li>Patient and study metadata</li>
                <li>All measurements with normal ranges and severity ratings</li>
                <li>Clinical overlay images (5 types)</li>
                <li>Diagnosis summary with confidence score</li>
                <li>Ranked treatment recommendations with evidence levels</li>
                <li>Normative references bibliography</li>
              </ul>
            </WorkflowStep>
          </Card>
        </div>
      )}

      {/* ── Measurements ──────────────────────────────────────────────────────── */}
      {tab === "measurements" && (
        <div className="space-y-6">
          <Callout type="info" title="90+ measurements available">
            CephAI computes measurements across Steiner, Tweed, McNamara, Jarabak, Down's, Ricketts,
            Burstone soft-tissue, airway, CVM, and composite index analyses. Below are the most clinically
            significant values.
          </Callout>

          {[
            {
              group: "Skeletal — Maxilla/Mandible Relationship",
              rows: [
                { name: "SNA",    normal: "82 ± 3°", unit: "degrees", desc: "Maxillary sagittal position relative to cranial base" },
                { name: "SNB",    normal: "80 ± 3°", unit: "degrees", desc: "Mandibular sagittal position relative to cranial base" },
                { name: "ANB",    normal: "2 ± 2°",  unit: "degrees", desc: "Sagittal jaw relationship (negative = Class III tendency)" },
                { name: "Wits",   normal: "0 ± 2 mm",unit: "mm",      desc: "Functional occlusal plane-based jaw discrepancy (Jacobson)" },
                { name: "APDI",   normal: "81.4 ± 3.8°", unit: "degrees", desc: "Kim's antero-posterior dysplasia indicator" },
                { name: "ODI",    normal: "74.5 ± 6°",   unit: "degrees", desc: "Kim's overbite depth indicator" },
              ],
            },
            {
              group: "Vertical — Facial Pattern",
              rows: [
                { name: "FMA (FH-MP)",    normal: "25 ± 3°",  unit: "degrees", desc: "Frankfort-Mandibular plane angle; high = hyperdivergent" },
                { name: "SN-GoGn",        normal: "32 ± 3°",  unit: "degrees", desc: "Sella-Nasion to mandibular plane angle" },
                { name: "Jarabak ratio",  normal: "62–65%",   unit: "%",       desc: "Posterior/anterior facial height ratio" },
                { name: "Y-axis (SGn/SN)",normal: "59–66°",   unit: "degrees", desc: "Growth direction (Downs)" },
                { name: "LAFH",           normal: "55–60 mm", unit: "mm",      desc: "Lower anterior facial height (ANS-Menton)" },
              ],
            },
            {
              group: "Dental — Incisor Position",
              rows: [
                { name: "UI-NA mm",  normal: "4 ± 2 mm", unit: "mm",      desc: "Upper incisor horizontal protrusion" },
                { name: "UI-NA °",   normal: "22 ± 5°",  unit: "degrees", desc: "Upper incisor inclination to NA line" },
                { name: "LI-NB mm",  normal: "4 ± 2 mm", unit: "mm",      desc: "Lower incisor horizontal protrusion" },
                { name: "LI-NB °",   normal: "25 ± 5°",  unit: "degrees", desc: "Lower incisor inclination to NB line" },
                { name: "IMPA",      normal: "90 ± 5°",  unit: "degrees", desc: "Mandibular incisor-mandibular plane angle (Tweed)" },
                { name: "Interincisal angle", normal: "130 ± 10°", unit: "degrees", desc: "Angle between upper and lower incisor long axes" },
              ],
            },
            {
              group: "Soft Tissue (Burstone)",
              rows: [
                { name: "Upper lip to E-line", normal: "-4 to 0 mm", unit: "mm", desc: "Upper lip position relative to esthetic line" },
                { name: "Lower lip to E-line", normal: "-2 to 2 mm", unit: "mm", desc: "Lower lip position relative to esthetic line" },
                { name: "Nasolabial angle",    normal: "102 ± 8°",   unit: "degrees", desc: "Angle between subnasale, columella, and upper lip" },
                { name: "ST ChinThick",        normal: "≥ 10 mm",    unit: "mm", desc: "Soft tissue chin thickness (Holdaway)" },
                { name: "Pog-NB (Holdaway)",   normal: "0–2 mm",     unit: "mm", desc: "Pogonion to NB distance — chin projection" },
              ],
            },
          ].map(section => (
            <div key={section.group}>
              <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                {section.group}
              </h3>
              <Card noPadding>
                <table className="w-full">
                  <thead className="border-b border-border">
                    <tr>
                      {["Measurement", "Normal Range", "Unit", "Description"].map(h => (
                        <th key={h} className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {section.rows.map(r => <MeasurementRow key={r.name} {...r} />)}
                  </tbody>
                </table>
              </Card>
            </div>
          ))}

          <Callout type="tip" title="Population-adjusted norms">
            Normal ranges shown above are Caucasian defaults. The AI engine supports 8 population groups
            (Caucasian, Chinese, East Asian, Japanese, African-American, Hispanic, Indian, Brazilian) with
            per-measurement offsets. Change your population baseline in Settings → Clinical Preferences.
          </Callout>
        </div>
      )}

      {/* ── Shortcuts ────────────────────────────────────────────────────────── */}
      {tab === "shortcuts" && (
        <div className="grid gap-6 md:grid-cols-2">
          {[
            {
              title: "Global Navigation",
              shortcuts: [
                { keys: ["G", "D"], action: "Go to Dashboard"   },
                { keys: ["G", "P"], action: "Go to Patients"    },
                { keys: ["G", "C"], action: "Go to Cases"       },
                { keys: ["G", "A"], action: "Go to Analysis"    },
                { keys: ["G", "V"], action: "Go to Viewer"      },
                { keys: ["G", "R"], action: "Go to Results"     },
                { keys: ["G", "H"], action: "Go to History"     },
                { keys: ["G", "S"], action: "Go to Settings"    },
              ],
            },
            {
              title: "Landmark Viewer",
              shortcuts: [
                { keys: ["Scroll"],      action: "Zoom in / out"          },
                { keys: ["Alt", "Drag"], action: "Pan the viewport"       },
                { keys: ["Middle drag"], action: "Pan (alternate)"        },
                { keys: ["+"],           action: "Zoom in"                },
                { keys: ["-"],           action: "Zoom out"               },
                { keys: ["0"],           action: "Reset zoom to fit"      },
                { keys: ["M"],           action: "Toggle minimap"         },
                { keys: ["L"],           action: "Toggle landmark labels" },
              ],
            },
            {
              title: "Analysis Page",
              shortcuts: [
                { keys: ["Ctrl", "U"], action: "Open upload dialog"       },
                { keys: ["Ctrl", "R"], action: "Run AI full pipeline"     },
                { keys: ["Ctrl", "K"], action: "Open command palette"     },
                { keys: ["Escape"],    action: "Cancel current operation" },
              ],
            },
            {
              title: "UI Controls",
              shortcuts: [
                { keys: ["Ctrl", "B"],        action: "Toggle sidebar"    },
                { keys: ["Ctrl", "Shift", "L"], action: "Toggle dark mode" },
                { keys: ["?"],                action: "Open this guide"   },
                { keys: ["Escape"],           action: "Close open modal"  },
              ],
            },
          ].map(group => (
            <Card key={group.title} title={group.title}>
              <div className="mt-1">
                {group.shortcuts.map(s => (
                  <ShortcutRow key={s.action} keys={s.keys} action={s.action} />
                ))}
              </div>
            </Card>
          ))}

          <Card className="md:col-span-2">
            <div className="flex items-start gap-3">
              <Keyboard className="h-5 w-5 text-muted-foreground mt-0.5 shrink-0" />
              <div>
                <p className="text-[13px] font-semibold text-foreground mb-1">Keyboard navigation note</p>
                <p className="text-[12px] leading-relaxed text-muted-foreground">
                  Two-key shortcuts like <kbd className="border border-border bg-muted px-1.5 py-0.5 rounded text-[11px] font-mono">G</kbd> then <kbd className="border border-border bg-muted px-1.5 py-0.5 rounded text-[11px] font-mono">D</kbd> require
                  pressing both keys within 1 second. Shortcut hints are not yet wired in all pages — full
                  keyboard navigation will be expanded in a future release.
                </p>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* ── FAQ ───────────────────────────────────────────────────────────────── */}
      {tab === "faq" && (
        <div className="space-y-6">
          <Card noPadding className="px-6">
            <Accordion question="Why does the AI pipeline show 'Backend unreachable'?">
              <p>The .NET backend (port 5180) is not running or not accessible. Check that:</p>
              <ul className="list-disc list-inside space-y-1 mt-2">
                <li>The ASP.NET Core server is started</li>
                <li>PostgreSQL and Redis are running and connected</li>
                <li><code>VITE_BACKEND_API_BASE_URL</code> in the frontend environment points to the correct host and port</li>
                <li>CORS is configured to allow requests from the frontend origin</li>
              </ul>
            </Accordion>

            <Accordion question="Why are my measurements all in pixels instead of millimetres?">
              The image was not calibrated before running the pipeline. Go to the <strong>Calibrate</strong> page,
              click two known points on the image, and enter the real-world distance in mm. Then re-run the
              measurements step (or the full pipeline again).
            </Accordion>

            <Accordion question="How do I correct a misplaced landmark?">
              Open the <strong>Viewer</strong> page. Drag the landmark reticle to its correct anatomical position.
              Once all corrections are made, click <em>Finalize</em> — this saves the adjusted positions and
              re-runs the full measurement and diagnosis pipeline automatically.
            </Accordion>

            <Accordion question="What's the difference between the analysis types?">
              <ul className="space-y-2">
                <li><strong>Steiner</strong> — SNA/SNB/ANB, upper incisor angles, soft tissue E-line. Most common.</li>
                <li><strong>Tweed</strong> — FMA/FMIA/IMPA triangle. Focuses on mandibular plane and incisor torque.</li>
                <li><strong>McNamara</strong> — Linear distances (midfacial length, mandibular length, A-Nperp, Pg-Nperp).</li>
                <li><strong>Jarabak</strong> — Saddle/articular/gonial angles, posterior/anterior facial height ratio.</li>
                <li><strong>Ricketts</strong> — Xi-point, facial axis, mandibular arc, convexity, lower lip to E-plane.</li>
                <li><strong>Full</strong> — All of the above, plus composite indices (APDI/ODI), airway, and CVM.</li>
              </ul>
            </Accordion>

            <Accordion question="How accurate is the AI landmark detection?">
              The system uses HRNet-W32 with multi-axis test-time augmentation (flips + gamma contrast γ=0.8/1.2)
              and a 26-edge ScientificRefiner belief propagation pass. Internal validation shows ~94% mean landmark
              accuracy compared to manual clinician corrections. Each landmark also has a per-point confidence score
              and a ±σ positional uncertainty (DSNT spatial variance decoder). Measurements include propagated
              uncertainty (±σ_M and 95% CI) via first-order Taylor expansion.
            </Accordion>

            <Accordion question="Can I use CephAI with CBCT-derived 2D images?">
              Yes. On the Analysis page, enable the <em>CBCT-derived</em> toggle before running the pipeline.
              This applies correction factors to measurements that are affected by the volumetric projection
              geometry of CBCT-sourced lateral reconstructions (primarily linear distances).
            </Accordion>

            <Accordion question="How do I change the population norm baseline?">
              Go to <strong>Settings → Clinical Preferences → Population norms</strong> and select the appropriate
              group. Available: Caucasian, Chinese, East Asian, Japanese, African-American, Hispanic, Indian, Brazilian.
              The AI engine applies per-measurement offsets for SNA, SNB, ANB, FMA, SN-GoGn, IMPA, UI-NA, LI-NB,
              mandibular length, and midface length.
            </Accordion>

            <Accordion question="Why is the report generated in English even though I set the system language?">
              Report language is controlled by the backend report generator (QuestPDF). Multi-language report
              templates are not yet implemented. This is planned for a future release.
            </Accordion>

            <Accordion question="How do I export all patient data?">
              Individual reports can be downloaded as PDF or DOCX from the <strong>Reports</strong> page or the
              Results → Reports tab. Bulk export of all patient records requires direct database access via your
              backend administrator. A bulk export endpoint is planned for a future API version.
            </Accordion>

            <Accordion question="Is there a dark mode?">
              Yes. Toggle dark/light mode using the button in the top-right of the navigation bar, or go to
              <strong> Settings → Appearance → Color theme</strong>. Your preference is saved locally in the browser.
            </Accordion>
          </Card>

          <Card title="Still need help?">
            <div className="flex flex-wrap gap-3">
              {[
                { label: "Backend API (Swagger)",  href: "http://localhost:5180/swagger" },
                { label: "AI Service (FastAPI)",   href: "http://localhost:8000/docs"   },
                { label: "GitHub Repository",      href: "#"                            },
              ].map(link => (
                <a
                  key={link.label}
                  href={link.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-[12px] font-medium text-foreground hover:bg-muted transition-colors"
                >
                  {link.label}
                  <ExternalLink className="h-3 w-3 text-muted-foreground" />
                </a>
              ))}
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
