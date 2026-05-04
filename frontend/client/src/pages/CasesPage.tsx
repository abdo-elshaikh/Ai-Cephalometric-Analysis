import React, { useState } from "react";
import {
  FolderKanban, Plus, Filter, ChevronRight, Clock3, LayoutGrid, List,
  Target, BrainCircuit, ImageIcon, Ruler, CheckCircle2, CircleDot,
  ScanLine, Upload, BarChart3, Microscope, Zap, Search, ArrowRight,
  TrendingUp, Sparkles, FileText, Calendar,
} from "lucide-react";
import {
  Card, Pill, PrimaryBtn, SecondaryBtn, IconBtn, PageHeader, SearchInput, Divider, TextInput,
} from "@/components/_core/ClinicalComponents";
import { statusTone, completionForCase } from "@/lib/clinical-utils";
import { type CaseRecord } from "@/lib/mappers";
import { useLocation } from "wouter";
import { cn } from "@/lib/utils";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function studyTypeTone(type: string): "accent" | "info" | "warning" {
  if (type === "Lateral") return "accent";
  if (type === "PA") return "info";
  return "warning";
}

function aiStatusDisplay(status: string) {
  if (status === "completed") return { label: "AI Synchronized", color: "bg-emerald-500", icon: BrainCircuit };
  if (status === "processing") return { label: "Processing Data", color: "bg-amber-500 animate-pulse", icon: Zap };
  return { label: "Engine Idle", color: "bg-muted-foreground/30", icon: CircleDot };
}

function pipelineSteps(c: CaseRecord) {
  return [
    { key: "image",   done: Boolean(c.imageName),   icon: ImageIcon  },
    { key: "cal",     done: Boolean(c.calibrated),  icon: Ruler      },
    { key: "ai",      done: c.aiStatus === "completed", icon: BrainCircuit },
    { key: "review",  done: ["Reviewing","Reviewed","Report ready"].includes(c.status), icon: CheckCircle2 },
  ];
}

function getSmartAction(c: CaseRecord): { label: string; href: string; icon: any; tone: "primary" | "secondary" } {
  if (!c.imageName) return { label: "Upload Image", href: "/analysis", icon: Upload, tone: "primary" };
  if (!c.calibrated) return { label: "Calibrate Scale", href: "/viewer", icon: Ruler, tone: "primary" };
  if (c.aiStatus !== "completed") return { label: "Run AI Analysis", href: "/analysis", icon: BrainCircuit, tone: "primary" };
  if (["AI completed", "Reviewing"].includes(c.status)) return { label: "Launch Viewer", href: "/viewer", icon: ScanLine, tone: "primary" };
  if (["Reviewed", "Report ready"].includes(c.status)) return { label: "View Diagnostics", href: "/results", icon: BarChart3, tone: "primary" };
  return { label: "Open Workspace", href: "/analysis", icon: Target, tone: "secondary" };
}

// ─── Component ────────────────────────────────────────────────────────────────

interface CasesPageProps {
  cases: CaseRecord[];
  activeCaseId: string;
  setActiveCaseId: (id: string) => void;
  onCreateCase: () => void;
}

export default function CasesPage({
  cases, activeCaseId, setActiveCaseId, onCreateCase,
}: CasesPageProps) {
  const [, navigate] = useLocation();
  const [query, setQuery] = useState("");
  const [filterGroup, setFilterGroup] = useState<string>("All");
  const [sort, setSort] = useState<"newest" | "oldest" | "az" | "status">("newest");
  const [view, setView] = useState<"grid" | "list">("grid");

  const FILTER_GROUPS: { label: string; statuses: string[] | null; count: number }[] = [
    { label: "All Studies", statuses: null, count: cases.length },
    { label: "Drafts", statuses: ["Draft"], count: cases.filter(c => c.status === "Draft").length },
    { label: "Analysis Phase", statuses: ["Image uploaded","Calibrated","AI completed"], count: cases.filter(c => ["Image uploaded","Calibrated","AI completed"].includes(c.status)).length },
    { label: "Clinical Review", statuses: ["Reviewing","Reviewed"], count: cases.filter(c => ["Reviewing","Reviewed"].includes(c.status)).length },
    { label: "Finalized", statuses: ["Report ready"], count: cases.filter(c => c.status === "Report ready").length },
  ];

  const sortedCases = [...cases].sort((a, b) => {
    if (sort === "newest") return (b.updatedAt || b.date || "").localeCompare(a.updatedAt || a.date || "");
    if (sort === "oldest") return (a.updatedAt || a.date || "").localeCompare(b.updatedAt || b.date || "");
    if (sort === "az")     return a.title.localeCompare(b.title);
    return a.status.localeCompare(b.status);
  });

  const currentGroup = FILTER_GROUPS.find(g => g.label === filterGroup);
  const filtered = sortedCases.filter(c => {
    const q = query.toLowerCase();
    const matchQuery = !q ||
      c.title.toLowerCase().includes(q) ||
      Boolean(c.patientName?.toLowerCase().includes(q));
    const matchFilter = !currentGroup?.statuses || currentGroup.statuses.includes(c.status);
    return matchQuery && matchFilter;
  });

  return (
    <div className="min-h-screen bg-background text-foreground selection:bg-primary/30 pb-20 animate-in fade-in duration-700">
      
      {/* ── Ambient background ── */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-60 -left-40 w-[800px] h-[800px] rounded-full bg-primary/5 blur-[120px] animate-pulse duration-[12s]" />
        <div className="absolute bottom-0 -right-40 w-[600px] h-[600px] rounded-full bg-sky-500/5 blur-[100px] animate-pulse duration-[10s]" />
      </div>

      <div className="relative z-10 space-y-10 p-6 md:p-8 lg:p-10 max-w-[1600px] mx-auto">
        
        {/* ── Page header ── */}
        <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="h-1.5 w-8 rounded-full bg-gradient-to-r from-primary to-sky-400" />
              <span className="text-xs font-black uppercase tracking-[0.25em] text-primary/80">
                Clinical Workflow
              </span>
            </div>
            <h1 className="text-4xl font-black tracking-tight text-gradient-primary md:text-5xl">
              Diagnostic Portfolio
            </h1>
            <p className="text-muted-foreground font-medium max-w-2xl leading-relaxed">
              Track and manage all cephalometric analysis studies. Navigate through active diagnostic cycles and review historical reports.
            </p>
          </div>
          
          <div className="flex items-center gap-3 shrink-0 bg-card/30 backdrop-blur-md p-2 rounded-2xl border border-border/40 shadow-sm-professional">
             <div className="flex rounded-xl border border-border/60 bg-muted/20 p-0.5">
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
            <PrimaryBtn onClick={onCreateCase} icon={Plus} className="h-11 px-8 font-black uppercase tracking-widest text-[10px] shadow-lg shadow-primary/20 hover-lift">
              New Study
            </PrimaryBtn>
          </div>
        </div>

        {/* ── Filter Bar ── */}
        <div className="flex flex-col gap-6">
           <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
            <div className="relative flex-1 max-w-xl group">
              <Search className="absolute left-5 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground/40 group-focus-within:text-primary transition-colors" />
              <TextInput
                value={query}
                onChange={setQuery}
                placeholder="Search patient name, study ID, or protocol..."
                className="pl-14 h-14 rounded-2xl border-border/40 bg-card/40 backdrop-blur-md focus:ring-primary/20 shadow-sm"
              />
            </div>

            <div className="flex items-center gap-3 bg-card/30 backdrop-blur-md p-1.5 rounded-2xl border border-border/40 shadow-sm">
              <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/40 px-4">Sort</span>
              {[
                { id: "newest", label: "Recent" },
                { id: "az",     label: "A-Z" },
                { id: "status", label: "Status" },
              ].map(s => (
                <button
                  key={s.id}
                  onClick={() => setSort(s.id as any)}
                  className={cn(
                    "h-9 px-5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all",
                    sort === s.id ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20" : "text-muted-foreground/60 hover:text-foreground"
                  )}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-3 flex-wrap bg-muted/20 p-2 rounded-[24px] border border-border/20 backdrop-blur-sm">
            {FILTER_GROUPS.map(group => {
              const isActive = filterGroup === group.label;
              return (
                <button
                  key={group.label}
                  onClick={() => setFilterGroup(group.label)}
                  className={cn(
                    "flex items-center gap-3 px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border",
                    isActive
                      ? "bg-background border-border/40 shadow-sm text-primary"
                      : "border-transparent text-muted-foreground/60 hover:text-foreground hover:bg-background/40"
                  )}
                >
                  {group.label}
                  <span className={cn(
                    "px-2 py-0.5 rounded-lg font-black tabular-nums border transition-colors",
                    isActive ? "bg-primary/10 border-primary/20 text-primary" : "bg-muted/40 border-border/20 text-muted-foreground/40"
                  )}>
                    {group.count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Main Content ── */}
        {view === "grid" ? (
          <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filtered.map(c => {
              const progress = completionForCase(c);
              const isActive = activeCaseId === c.id;
              const ai = aiStatusDisplay(c.aiStatus);
              const steps = pipelineSteps(c);
              const smartAction = getSmartAction(c);
              
              return (
                <Card
                  key={c.id}
                  onClick={() => setActiveCaseId(c.id)}
                  className={cn(
                    "group relative p-0 overflow-hidden glass-premium hover-glow transition-all duration-700 hover-lift shadow-lg-professional flex flex-col h-[460px]",
                    isActive ? "border-primary/40 ring-1 ring-primary/20 shadow-primary/10 bg-primary/[0.02]" : "border-border/40"
                  )}
                >
                  <div className="p-8 space-y-6 flex-1 flex flex-col">
                    {/* Header: Type + Status */}
                    <div className="flex items-start justify-between">
                      <div className="flex gap-2">
                         <Pill tone={studyTypeTone(c.type)} size="xs" className="font-black uppercase tracking-widest">{c.type}</Pill>
                         <Pill tone={statusTone(c.status)} size="xs" className="font-black uppercase tracking-widest">{c.status}</Pill>
                      </div>
                      <div className={cn("h-10 w-10 rounded-xl border border-border/40 flex items-center justify-center text-muted-foreground group-hover:border-primary/40 group-hover:text-primary transition-all", isActive && "bg-primary/10 text-primary border-primary/20")}>
                        <FileText className="h-5 w-5" />
                      </div>
                    </div>

                    <div className="space-y-1">
                      <h3 className="text-xl font-black tracking-tight leading-tight group-hover:text-primary transition-colors">{c.title}</h3>
                      <p className="text-sm text-muted-foreground font-medium">{c.patientName ?? "Unassigned Patient"}</p>
                    </div>

                    <Divider className="opacity-10" />

                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/40">Diagnostic Pipeline</span>
                        <div className="flex items-center gap-1.5">
                          <ai.icon className={cn("h-3 w-3", ai.color.includes("emerald") ? "text-emerald-500" : "text-amber-500")} />
                          <span className={cn("text-[9px] font-black uppercase tracking-widest", ai.color.includes("emerald") ? "text-emerald-500" : "text-amber-500")}>{ai.label}</span>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        {steps.map((step, idx) => {
                          const Icon = step.icon;
                          return (
                            <div
                              key={idx}
                              className={cn(
                                "flex-1 h-9 rounded-xl border flex items-center justify-center transition-all duration-500",
                                step.done ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-500 shadow-sm shadow-emerald-500/5" : "bg-muted/10 border-border/20 text-muted-foreground/20"
                              )}
                              title={step.key}
                            >
                              <Icon className="h-4 w-4" />
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    <div className="space-y-2 mt-auto">
                      <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-widest text-muted-foreground/40">
                        <span>Readiness</span>
                        <span className="text-foreground">{progress}%</span>
                      </div>
                      <div className="h-2 w-full rounded-full bg-muted/40 overflow-hidden relative">
                        <div
                          className="absolute inset-y-0 left-0 bg-primary rounded-full transition-all duration-1000 shadow-sm"
                          style={{ width: `${progress}%` }}
                        />
                        <div className="absolute inset-0 loading-sheen opacity-20" />
                      </div>
                    </div>
                  </div>

                  <div className="px-8 py-6 border-t border-border/20 bg-muted/10 group-hover:bg-muted/20 transition-colors mt-auto">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setActiveCaseId(c.id);
                        navigate(smartAction.href);
                      }}
                      className="w-full h-11 rounded-2xl bg-background border border-border/40 flex items-center justify-between px-6 group/btn hover:border-primary/40 transition-all"
                    >
                      <div className="flex items-center gap-3">
                        <smartAction.icon className="h-4 w-4 text-primary opacity-60 group-hover/btn:opacity-100 group-hover/btn:scale-110 transition-all" />
                        <span className="text-[10px] font-black uppercase tracking-widest text-foreground/70 group-hover/btn:text-primary transition-colors">{smartAction.label}</span>
                      </div>
                      <ArrowRight className="h-4 w-4 text-muted-foreground/30 group-hover/btn:text-primary group-hover/btn:translate-x-1 transition-all" />
                    </button>
                    <div className="flex items-center justify-center gap-2 mt-4 text-[10px] text-muted-foreground/40 font-black uppercase tracking-widest">
                       <Calendar className="h-3 w-3" />
                       Modified {c.updatedAt || c.date || "---"}
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        ) : (
          /* List View */
          <Card className="p-0 glass-premium border-border/40 shadow-lg-professional overflow-hidden">
             <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-border/20 bg-muted/10 text-[10px] font-black uppercase tracking-widest text-muted-foreground/60">
                    <th className="px-8 py-5">Case / Protocol</th>
                    <th className="px-8 py-5">Patient Name</th>
                    <th className="px-8 py-5">Workflow State</th>
                    <th className="px-8 py-5">Completion</th>
                    <th className="px-8 py-5 text-right">Contextual Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/10">
                  {filtered.map(c => {
                    const isActive = activeCaseId === c.id;
                    const smartAction = getSmartAction(c);
                    return (
                      <tr
                        key={c.id}
                        onClick={() => setActiveCaseId(c.id)}
                        className={cn(
                          "group hover:bg-muted/10 cursor-pointer transition-all",
                          isActive && "bg-primary/[0.03]"
                        )}
                      >
                        <td className="px-8 py-6">
                          <div className="flex items-center gap-4">
                            <div className={cn("h-10 w-10 rounded-xl flex items-center justify-center border transition-all", isActive ? "bg-primary/10 border-primary/20 text-primary" : "bg-muted/20 border-border/40 text-muted-foreground group-hover:border-primary/20 group-hover:text-primary")}>
                              <FileText className="h-5 w-5" />
                            </div>
                            <div>
                              <p className="font-black text-foreground group-hover:text-primary transition-colors">{c.title}</p>
                              <div className="flex gap-2 mt-1">
                                <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground/40">{c.type} PROTOCOL</span>
                                <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground/20">|</span>
                                <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground/40">{c.date}</span>
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-8 py-6">
                           <p className="text-sm font-bold text-foreground/80">{c.patientName ?? "---"}</p>
                           <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground/40 mt-1">Surgical Record</p>
                        </td>
                        <td className="px-8 py-6">
                           <Pill tone={statusTone(c.status)} size="xs" className="font-black uppercase tracking-widest">{c.status}</Pill>
                        </td>
                        <td className="px-8 py-6">
                          <div className="flex items-center gap-4">
                            <div className="h-1.5 w-24 rounded-full bg-muted/40 overflow-hidden relative">
                              <div className="absolute inset-y-0 left-0 bg-primary transition-all duration-1000" style={{ width: `${completionForCase(c)}%` }} />
                            </div>
                            <span className="text-[10px] font-black tabular-nums text-foreground/60">{completionForCase(c)}%</span>
                          </div>
                        </td>
                        <td className="px-8 py-6 text-right">
                           <button
                              onClick={(e) => { e.stopPropagation(); setActiveCaseId(c.id); navigate(smartAction.href); }}
                              className="inline-flex items-center gap-3 h-10 px-6 rounded-xl border border-border/60 bg-muted/20 text-[10px] font-black uppercase tracking-widest text-muted-foreground hover:border-primary/30 hover:text-primary hover:bg-primary/5 transition-all"
                            >
                              <smartAction.icon className="h-3.5 w-3.5" />
                              {smartAction.label}
                            </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        )}

        {/* Empty State */}
        {filtered.length === 0 && (
          <div className="py-32 text-center">
            <div className="flex h-24 w-24 items-center justify-center rounded-[32px] bg-muted/10 border-2 border-dashed border-border/20 mx-auto mb-8 shadow-inner-lg">
              <FolderKanban className="h-10 w-10 text-muted-foreground/20" />
            </div>
            <h3 className="text-2xl font-black tracking-tight mb-3">Portfolio Empty</h3>
            <p className="text-sm text-muted-foreground max-w-sm mx-auto font-medium leading-relaxed">
              {cases.length
                ? "Your search parameters returned no matching clinical studies. Try broader query terms."
                : "Initialize your first clinical analysis study to begin the diagnostic orchestration cycle."}
            </p>
            <PrimaryBtn onClick={onCreateCase} icon={Plus} className="mt-10 h-12 px-10 font-black uppercase tracking-widest text-[10px] shadow-xl shadow-primary/20">
              Initialize Case
            </PrimaryBtn>
          </div>
        )}
      </div>
    </div>
  );
}
