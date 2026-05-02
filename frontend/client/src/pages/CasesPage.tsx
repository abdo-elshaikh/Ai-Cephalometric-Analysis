import React, { useState } from "react";
import {
  FolderKanban,
  Plus,
  Filter,
  ChevronRight,
  Clock3,
  LayoutGrid,
  List,
  Target,
  BrainCircuit,
  ImageIcon,
  Ruler,
  CheckCircle2,
  CircleDot,
  ScanLine,
  Upload,
  BarChart3,
  Microscope,
  type LucideIcon,
} from "lucide-react";
import {
  Card,
  Pill,
  PrimaryBtn,
  SecondaryBtn,
  IconBtn,
  PageHeader,
  SearchInput,
  Divider,
} from "@/components/_core/ClinicalComponents";
import { statusTone, completionForCase } from "@/lib/clinical-utils";
import { type CaseRecord, type Patient } from "@/lib/mappers";
import { useLocation } from "wouter";
import { cn } from "@/lib/utils";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function studyTypeTone(type: string): "accent" | "info" | "warning" {
  if (type === "Lateral") return "accent";
  if (type === "PA") return "info";
  return "warning";
}

function aiStatusDisplay(status: string) {
  if (status === "completed") return { label: "AI Done", color: "bg-success" };
  if (status === "processing") return { label: "Processing", color: "bg-warning animate-pulse" };
  return { label: "Pending", color: "bg-muted-foreground/30" };
}

function pipelineSteps(c: CaseRecord) {
  return [
    { key: "image",   done: Boolean(c.imageName),                                              icon: ImageIcon  },
    { key: "cal",     done: Boolean(c.calibrated),                                             icon: Ruler      },
    { key: "ai",      done: c.aiStatus === "completed",                                        icon: BrainCircuit },
    { key: "review",  done: ["Reviewing","Reviewed","Report ready"].includes(c.status),        icon: CheckCircle2 },
  ];
}

function getSmartAction(c: CaseRecord): { label: string; href: string; icon: LucideIcon; tone: "primary" | "secondary" } {
  if (!c.imageName) return { label: "Upload Image", href: "/analysis", icon: Upload, tone: "primary" };
  if (!c.calibrated) return { label: "Calibrate", href: "/viewer", icon: Ruler, tone: "primary" };
  if (c.aiStatus !== "completed") return { label: "Run AI Analysis", href: "/analysis", icon: BrainCircuit, tone: "primary" };
  if (["AI completed", "Reviewing"].includes(c.status)) return { label: "Open Viewer", href: "/viewer", icon: ScanLine, tone: "primary" };
  if (["Reviewed", "Report ready"].includes(c.status)) return { label: "View Results", href: "/results", icon: BarChart3, tone: "primary" };
  return { label: "Open Workflow", href: "/analysis", icon: Target, tone: "secondary" };
}

// ─── Component ────────────────────────────────────────────────────────────────

interface CasesPageProps {
  patients: Patient[];
  cases: CaseRecord[];
  activeCaseId: string;
  setActiveCaseId: (id: string) => void;
  onCreateCase: () => void;
}

export default function CasesPage({
  patients,
  cases,
  activeCaseId,
  setActiveCaseId,
  onCreateCase,
}: CasesPageProps) {
  const [, navigate] = useLocation();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<string>("All");
  const [view, setView] = useState<"grid" | "list">("grid");

  const statusOptions = ["All", "Draft", "Image uploaded", "Calibrated", "AI completed", "Reviewing", "Reviewed", "Report ready"];

  const filtered = cases.filter(c => {
    const matchQuery = c.title.toLowerCase().includes(query.toLowerCase());
    const matchFilter = filter === "All" || c.status === filter;
    return matchQuery && matchFilter;
  });

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <PageHeader
        eyebrow="Clinical Portfolio"
        title="Diagnostic Worklist"
        description="Monitor the progress of ongoing studies, from initial intake to final report generation."
        actions={
          <PrimaryBtn onClick={onCreateCase} icon={Plus}>
            New clinical case
          </PrimaryBtn>
        }
      />

      <Card noPadding className="overflow-visible border-border/40">
        {/* Toolbar */}
        <div className="flex flex-col gap-4 p-4 md:flex-row md:items-center md:justify-between border-b border-border/40 bg-muted/5">
          <div className="flex flex-1 items-center gap-3 max-w-2xl">
            <SearchInput
              value={query}
              onChange={setQuery}
              placeholder="Search cases by title..."
              className="flex-1"
            />
            <div className="flex items-center gap-2 rounded-xl border border-border/60 bg-muted/20 px-3 h-10 shrink-0">
              <Filter className="h-3.5 w-3.5 text-muted-foreground" />
              <select
                value={filter}
                onChange={e => setFilter(e.target.value)}
                className="bg-transparent text-xs font-bold uppercase tracking-wider outline-none cursor-pointer text-muted-foreground hover:text-foreground"
              >
                {statusOptions.map(opt => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Pill tone="neutral" className="bg-muted/40 border-border/60">
              {filtered.length} Case{filtered.length !== 1 ? "s" : ""}
            </Pill>
            <Divider className="h-4 w-px bg-border/40" />
            <div className="flex rounded-xl border border-border/60 bg-muted/20 p-1">
              <IconBtn
                icon={LayoutGrid}
                label="Grid view"
                onClick={() => setView("grid")}
                size="sm"
                active={view === "grid"}
              />
              <IconBtn
                icon={List}
                label="List view"
                onClick={() => setView("list")}
                size="sm"
                active={view === "list"}
              />
            </div>
          </div>
        </div>

        {/* Grid */}
        {view === "grid" ? (
          <div className="grid gap-5 p-6 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map(c => {
              const p = patients.find(x => x.id === c.patientId);
              const progress = completionForCase(c);
              const isActive = activeCaseId === c.id;
              const ai = aiStatusDisplay(c.aiStatus);
              const steps = pipelineSteps(c);
              const smartAction = getSmartAction(c);
              const SmartIcon = smartAction.icon;

              return (
                <Card
                  key={c.id}
                  className={cn(
                    "group relative overflow-hidden transition-all hover:shadow-lg cursor-pointer p-5",
                    isActive
                      ? "border-primary/40 ring-1 ring-primary/20 bg-primary/[0.01]"
                      : "border-border/40 hover:border-border/70"
                  )}
                  onClick={() => setActiveCaseId(c.id)}
                >
                  {/* Status + type row */}
                  <div className="flex items-start justify-between mb-4">
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-1.5">
                        <Pill tone={statusTone(c.status)} size="xs">{c.status}</Pill>
                        <Pill tone={studyTypeTone(c.type)} size="xs">{c.type}</Pill>
                      </div>
                      <h3 className="font-bold text-base leading-tight">{c.title}</h3>
                    </div>
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-border/40 bg-muted/30 text-muted-foreground shrink-0">
                      <ScanLine className="h-4 w-4" />
                    </div>
                  </div>

                  {/* Patient + date */}
                  <div className="space-y-1.5 mb-4">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">Patient</span>
                      <span className="font-semibold">{p ? `${p.firstName} ${p.lastName}` : "—"}</span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground flex items-center gap-1">
                        <Clock3 className="h-3 w-3" /> Modified
                      </span>
                      <span className="text-muted-foreground">{c.updatedAt || c.date || "—"}</span>
                    </div>
                  </div>

                  {/* Pipeline steps */}
                  <div className="flex items-center gap-1.5 mb-4">
                    {steps.map(step => {
                      const Icon = step.icon;
                      return (
                        <div
                          key={step.key}
                          className={cn(
                            "flex h-6 w-6 items-center justify-center rounded-lg border transition-all",
                            step.done
                              ? "border-success/30 bg-success/10 text-success-foreground"
                              : "border-border/40 bg-muted/20 text-muted-foreground/30"
                          )}
                          title={step.key}
                        >
                          <Icon className="h-3 w-3" />
                        </div>
                      );
                    })}
                    <div className="ml-auto flex items-center gap-1">
                      <div className={cn("h-1.5 w-1.5 rounded-full", ai.color)} />
                      <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                        {ai.label}
                      </span>
                    </div>
                  </div>

                  {/* Progress bar */}
                  <div className="space-y-1.5 mb-4">
                    <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                      <span>Readiness</span>
                      <span className="text-primary">{progress}%</span>
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-full bg-primary transition-all duration-700"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                  </div>

                  {/* Smart actions */}
                  <div className="flex gap-2">
                    <PrimaryBtn
                      onClick={(e: React.MouseEvent) => {
                        e.stopPropagation();
                        setActiveCaseId(c.id);
                        navigate(smartAction.href);
                      }}
                      icon={SmartIcon}
                      className="flex-1 h-9 text-xs justify-center"
                    >
                      {smartAction.label}
                    </PrimaryBtn>
                    {/* Secondary: quick access to analysis intake */}
                    {smartAction.href !== "/analysis" && (
                      <button
                        type="button"
                        onClick={(e: React.MouseEvent) => {
                          e.stopPropagation();
                          setActiveCaseId(c.id);
                          navigate("/analysis");
                        }}
                        title="Analysis intake"
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-border/60 bg-muted/20 text-muted-foreground hover:border-primary/30 hover:text-primary hover:bg-primary/5 transition-all"
                      >
                        <Microscope className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        ) : (
          /* List */
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border/40 bg-muted/10 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                  {["Study Title", "Patient", "Type", "Status", "Pipeline", "Completion", "Next Step", ""].map(h => (
                    <th key={h} className="px-5 py-3.5">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border/20">
                {filtered.map(c => {
                  const p = patients.find(x => x.id === c.patientId);
                  const isActive = activeCaseId === c.id;
                  const steps = pipelineSteps(c);
                  const smartAction = getSmartAction(c);
                  const SmartIcon = smartAction.icon;
                  return (
                    <tr
                      key={c.id}
                      onClick={() => setActiveCaseId(c.id)}
                      className={cn(
                        "hover:bg-muted/20 cursor-pointer transition-colors group",
                        isActive && "bg-primary/[0.03]"
                      )}
                    >
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-2">
                          <div className={cn("h-2 w-2 rounded-full shrink-0", isActive ? "bg-primary" : "bg-transparent")} />
                          <span className="font-bold">{c.title}</span>
                        </div>
                      </td>
                      <td className="px-5 py-3.5 text-xs text-muted-foreground">
                        {p ? `${p.firstName} ${p.lastName}` : "—"}
                      </td>
                      <td className="px-5 py-3.5">
                        <Pill tone={studyTypeTone(c.type)} size="xs">{c.type}</Pill>
                      </td>
                      <td className="px-5 py-3.5">
                        <Pill tone={statusTone(c.status)} size="xs">{c.status}</Pill>
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-1">
                          {steps.map(step => {
                            const Icon = step.done ? CheckCircle2 : CircleDot;
                            return (
                              <Icon
                                key={step.key}
                                className={cn(
                                  "h-3.5 w-3.5",
                                  step.done ? "text-success" : "text-muted-foreground/30"
                                )}
                              />
                            );
                          })}
                        </div>
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 w-16 rounded-full bg-muted overflow-hidden">
                            <div
                              className="h-full bg-primary transition-all"
                              style={{ width: `${completionForCase(c)}%` }}
                            />
                          </div>
                          <span className="text-[10px] font-bold text-muted-foreground tabular-nums">
                            {completionForCase(c)}%
                          </span>
                        </div>
                      </td>
                      <td className="px-5 py-3.5">
                        <button
                          type="button"
                          onClick={e => { e.stopPropagation(); setActiveCaseId(c.id); navigate(smartAction.href); }}
                          className="flex items-center gap-1.5 h-7 px-2.5 rounded-lg border border-border/60 bg-muted/20 text-[10px] font-bold uppercase tracking-wider text-muted-foreground hover:border-primary/30 hover:text-primary hover:bg-primary/5 transition-all"
                        >
                          <SmartIcon className="h-3 w-3" />
                          {smartAction.label}
                        </button>
                      </td>
                      <td className="px-5 py-3.5">
                        <IconBtn
                          icon={ChevronRight}
                          label="Open"
                          onClick={() => navigate("/analysis")}
                          size="sm"
                          className="opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all"
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Empty */}
        {filtered.length === 0 && (
          <div className="py-20 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted/30 mx-auto mb-4">
              <FolderKanban className="h-8 w-8 text-muted-foreground/30" />
            </div>
            <h3 className="text-lg font-bold">
              {cases.length ? "No studies found" : "No studies yet"}
            </h3>
            <p className="text-sm text-muted-foreground mt-2 max-w-sm mx-auto">
              {cases.length
                ? "Try adjusting your search or status filter."
                : "Create your first clinical case to begin the cephalometric workflow."}
            </p>
            <PrimaryBtn onClick={onCreateCase} icon={Plus} className="mt-6">
              Create study
            </PrimaryBtn>
          </div>
        )}
      </Card>
    </div>
  );
}
