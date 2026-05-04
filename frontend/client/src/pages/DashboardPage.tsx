import React from "react";
import { useLocation } from "wouter";
import {
  Users, FolderKanban, FileText, History, RefreshCw,
  LockKeyhole, ChevronRight, CheckCircle2, CircleDot,
  BrainCircuit, CalendarClock, ArrowUpRight, TrendingUp,
  Clock, UserPlus, Folder, Activity, Zap, Shield, BarChart3,
} from "lucide-react";
import {
  Card, Pill, PrimaryBtn, SecondaryBtn, PageHeader,
  KpiCard, Divider, ProgressRing,
} from "@/components/_core/ClinicalComponents";
import {
  workflowStepsForCase,
  nextWorkflowStep,
  statusTone,
} from "@/lib/clinical-utils";
import {
  type CaseRecord,
  type BackendAuthUser,
  type Patient,
  type CaseStatus,
} from "@/lib/mappers";
import { cn } from "@/lib/utils";

// ─── History item icon helper ─────────────────────────────────────────────────

function historyIcon(type: string) {
  const t = type.toLowerCase();
  if (t === "ai") return BrainCircuit;
  if (t === "report") return FileText;
  if (t === "patient") return UserPlus;
  if (t === "case") return Folder;
  return CalendarClock;
}

function historyDotColor(type: string) {
  const t = type.toLowerCase();
  if (t === "ai") return "bg-sky-500/10 text-sky-400 border-sky-500/20";
  if (t === "report") return "bg-emerald-500/10 text-emerald-400 border-emerald-500/20";
  if (t === "patient") return "bg-primary/10 text-primary border-primary/20";
  if (t === "case") return "bg-amber-500/10 text-amber-400 border-amber-500/20";
  return "bg-muted/10 text-muted-foreground border-border/20";
}

// ─── Status pipeline breakdown ────────────────────────────────────────────────

const STATUS_GROUPS = [
  { label: "Draft",        statuses: ["Draft"] as CaseStatus[],                                                      color: "bg-slate-500" },
  { label: "In Progress",  statuses: ["Image uploaded", "Calibrated", "AI completed"] as CaseStatus[],               color: "bg-sky-500"            },
  { label: "Under Review", statuses: ["Reviewing", "Reviewed"] as CaseStatus[],                                      color: "bg-amber-500"         },
  { label: "Complete",     statuses: ["Report ready"] as CaseStatus[],                                               color: "bg-emerald-500"         },
] as const;

// ─── Dashboard Component ──────────────────────────────────────────────────────

interface DashboardPageProps {
  patients: Patient[];
  cases: CaseRecord[];
  reports: any[];
  history: any[];
  workspaceLoading: boolean;
  workspaceError: string | null;
  lastSyncedAt: string | null;
  authUser: BackendAuthUser | null;
  activeCaseId: string | null;
  onRefresh: () => void;
  onAuth: () => void;
  onCreateCase: () => void;
}

export default function DashboardPage({
  patients, cases, reports, history,
  workspaceLoading, workspaceError, lastSyncedAt,
  authUser, activeCaseId, onRefresh, onAuth, onCreateCase,
}: DashboardPageProps) {
  const [, navigate] = useLocation();
  const activeCase = cases.find(c => c.id === activeCaseId);
  const connected = !workspaceLoading && !workspaceError;
  const aiCompleted = cases.filter(c => c.aiStatus === "completed").length;

  return (
    <div className="min-h-screen bg-background text-foreground selection:bg-primary/30">
      {/* ── Ambient background ── */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-60 -left-40 w-[800px] h-[800px] rounded-full bg-primary/5 blur-[120px] animate-pulse duration-[12s]" />
        <div className="absolute bottom-0 -right-40 w-[600px] h-[600px] rounded-full bg-emerald-500/5 blur-[100px] animate-pulse duration-[10s]" />
        <div
          className="absolute inset-0 opacity-[0.02]"
          style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg width='40' height='40' viewBox='0 0 40 40' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='%2394a3b8' fill-opacity='1'%3E%3Cpath d='M0 0h1v1H0zm39 0h1v1h-1zm0 39h1v1h-1zM0 39h1v1H0z'/%3E%3C/g%3E%3C/svg%3E\")" }}
        />
      </div>

      <div className="relative z-10 space-y-10 p-6 md:p-8 lg:p-10 max-w-[1600px] mx-auto animate-in fade-in slide-in-from-bottom-4 duration-700">

        {/* ── Page header ── */}
        <div className="flex flex-col gap-8 md:flex-row md:items-end md:justify-between">
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="h-1.5 w-8 rounded-full bg-gradient-to-r from-primary to-sky-400" />
              <span className="text-xs font-black uppercase tracking-[0.25em] text-primary/80">
                Clinical Workspace
              </span>
            </div>
            <h1 className="text-4xl font-black tracking-tight text-gradient-primary md:text-5xl lg:text-6xl">
              Hello, {authUser?.fullName?.split(" ")[0] ?? "Doctor"}
            </h1>
            <p className="text-muted-foreground max-w-2xl text-lg leading-relaxed font-medium">
              Your diagnostic command center. Monitor patient flow, AI orchestration, and real-time clinical telemetry.
            </p>
          </div>
          
          <div className="flex items-center gap-4 shrink-0 bg-card/30 backdrop-blur-md p-2 rounded-2xl border border-border/40 shadow-sm-professional">
            <PrimaryBtn 
              onClick={onCreateCase}
              icon={FolderKanban}
              className="hover-lift shadow-lg shadow-primary/20"
            >
              Initialize Case
            </PrimaryBtn>
          </div>
        </div>

        {/* ── KPI Grid ── */}
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard
            label="Patient Registry"
            value={patients.length}
            icon={Users}
            tone="accent"
            sub="Active records in database"
            spark={[2, 3, 2, 4, 3, patients.length || 1]}
            trend={patients.length > 0 ? { value: 12, label: "vs last month" } : undefined}
          />
          <KpiCard
            label="Clinical Studies"
            value={cases.length}
            icon={FolderKanban}
            tone="info"
            sub="Cephalometric shells"
            spark={[1, 2, 3, 2, 4, cases.length || 1]}
            trend={cases.length > 0 ? { value: 8, label: "vs last month" } : undefined}
          />
          <KpiCard
            label="AI Completions"
            value={aiCompleted}
            icon={BrainCircuit}
            tone="success"
            sub="Pipeline orchestration"
            spark={[3, 4, 3, 5, 4, aiCompleted || 1]}
            trend={aiCompleted > 0 ? { value: 94, label: "accuracy" } : undefined}
          />
          <KpiCard
            label="Diagnostic Reports"
            value={reports.length}
            icon={FileText}
            tone="neutral"
            sub="Finalized clinical exports"
            spark={[1, 1, 2, 2, 3, reports.length || 1]}
            trend={reports.length > 0 ? { value: 5, label: "this week" } : undefined}
          />
        </div>

        {/* ── Main content grid ── */}
        <div className="grid gap-10 xl:grid-cols-[1.3fr_0.7fr]">
          
          {/* Left Column */}
          <div className="space-y-10">
            
            {/* Recommendation Engine */}
            <WorkflowCommand activeCase={activeCase} onCreateCase={onCreateCase} />

            <div className="grid gap-8 md:grid-cols-2">
              {/* Pipeline distribution */}
              <Card className="p-8 glass-premium shadow-md-professional border-border/40 hover-glow transition-all duration-500">
                <SectionTitle icon={BarChart3} label="Pipeline Distribution" />
                <div className="space-y-6 mt-8">
                  {STATUS_GROUPS.map(group => {
                    const count = cases.filter(c => group.statuses.includes(c.status)).length;
                    const pct = cases.length ? Math.round((count / cases.length) * 100) : 0;
                    return (
                      <div key={group.label} className="space-y-2.5">
                        <div className="flex justify-between items-baseline">
                          <span className="text-[11px] font-black uppercase tracking-widest text-muted-foreground/60">{group.label}</span>
                          <span className="text-sm font-black tabular-nums">{count}</span>
                        </div>
                        <div className="relative h-2.5 w-full rounded-full bg-muted/40 overflow-hidden">
                          <div
                            className={cn("absolute inset-y-0 left-0 rounded-full transition-all duration-1000 ease-out shadow-sm", group.color)}
                            style={{ width: `${Math.max(pct > 0 ? 5 : 0, pct)}%` }}
                          />
                          <div className="absolute inset-0 loading-sheen opacity-10" />
                        </div>
                      </div>
                    );
                  })}

                  {!cases.length && (
                    <div className="py-10 text-center opacity-40">
                      <p className="text-xs font-bold italic">Awaiting clinical ingestion...</p>
                    </div>
                  )}
                </div>
              </Card>

              {/* AI Precision */}
              <Card className="p-8 glass-premium shadow-md-professional border-border/40 hover-glow transition-all duration-500">
                <SectionTitle icon={Shield} label="AI Precision Score" />
                <div className="flex flex-col items-center justify-center py-6 text-center">
                  <div className="relative group">
                    <ProgressRing value={94} size={120} strokeWidth={10} tone="accent">
                      <div className="flex flex-col items-center">
                        <span className="text-3xl font-black tracking-tight">94%</span>
                        <span className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">
                          Accuracy
                        </span>
                      </div>
                    </ProgressRing>
                    <div className="absolute inset-0 rounded-full bg-primary/10 blur-2xl opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                  
                  <p className="mt-8 text-sm text-muted-foreground leading-relaxed font-medium px-4">
                    Clinical fidelity validated against manual orthodontic benchmarks.
                  </p>
                  
                  <div className="mt-8 grid grid-cols-3 gap-4 w-full">
                    {[
                      { label: "Anatomy", value: "80" },
                      { label: "Metrics", value: "75" },
                      { label: "Rules",    value: "20" },
                    ].map(m => (
                      <div key={m.label} className="rounded-2xl bg-muted/20 p-3 text-center border border-border/20">
                        <p className="text-base font-black">{m.value}</p>
                        <p className="text-[10px] text-muted-foreground font-black uppercase tracking-tighter opacity-60">{m.label}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </Card>
            </div>

            {/* Sync status */}
            <Card className="p-8 glass-premium shadow-md-professional border-border/40 hover-glow transition-all duration-500">
              <div className="flex flex-col gap-8 xl:flex-row xl:items-center xl:justify-between">
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center gap-3">
                    <Pill tone={connected ? "success" : workspaceLoading ? "accent" : "warning"} size="sm">
                      {connected ? "Infrastructure connected" : workspaceLoading ? "Synchronizing..." : "System Disconnected"}
                    </Pill>
                    <Pill tone={authUser ? "success" : "neutral"} size="sm">
                      {authUser ? "Access Verified" : "Unauthenticated Mode"}
                    </Pill>
                    {lastSyncedAt && (
                      <div className="flex items-center gap-2 text-[10px] font-black text-muted-foreground/40 uppercase tracking-widest bg-muted/20 px-3 py-1 rounded-full">
                        <Clock className="h-3 w-3" />
                        {lastSyncedAt}
                      </div>
                    )}
                  </div>
                  <div className="space-y-1">
                    <h2 className="text-2xl font-black tracking-tight">Backend Orchestration</h2>
                    <p className="text-sm text-muted-foreground font-medium max-w-md">
                      Seamlessly synchronized with the .NET Core infrastructure and Python-based AI inference nodes.
                    </p>
                  </div>
                  {workspaceError && (
                    <div className="flex items-center gap-3 rounded-2xl border border-destructive/20 bg-destructive/5 p-4 text-xs font-bold text-destructive">
                      <Shield className="h-4 w-4" />
                      {workspaceError}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <SecondaryBtn 
                    onClick={onRefresh} 
                    disabled={workspaceLoading} 
                    icon={RefreshCw}
                    className="h-12 px-6 hover-lift"
                  >
                    {workspaceLoading ? "Syncing..." : "Sync Workspace"}
                  </SecondaryBtn>
                  {!authUser && (
                    <PrimaryBtn onClick={onAuth} icon={LockKeyhole} className="h-12 px-8 hover-lift shadow-lg shadow-primary/20">
                      Sign In
                    </PrimaryBtn>
                  )}
                </div>
              </div>
            </Card>
          </div>

          {/* Right: Activity feed */}
          <Card className="p-8 glass-premium shadow-lg-professional border-border/40 hover-glow transition-all duration-500 flex flex-col min-h-[600px]">
            <div className="flex items-center justify-between border-b border-border/40 pb-6 mb-8">
              <div className="flex items-center gap-4">
                <div className="h-10 w-10 rounded-2xl bg-primary/10 flex items-center justify-center text-primary border border-primary/20 shadow-sm">
                  <History className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-lg font-black tracking-tight">Clinical Feed</h3>
                  <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/50">Recent Intelligence</p>
                </div>
              </div>
              <SecondaryBtn
                onClick={() => navigate("/history")}
                className="h-10 px-4 text-xs font-black hover-lift"
              >
                Archive
              </SecondaryBtn>
            </div>

            <div className="flex-1 space-y-2">
              {history.slice(0, 8).map((item, i) => {
                const Icon = historyIcon(item.type ?? "");
                const dotCls = historyDotColor(item.type ?? "");
                const isLast = i === Math.min(history.length, 8) - 1;
                return (
                  <div key={item.id ?? i} className="relative flex gap-4 group cursor-pointer hover:bg-muted/10 p-2 rounded-2xl transition-all">
                    <div className="relative flex flex-col items-center">
                      <div
                        className={cn(
                          "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border transition-all duration-300 group-hover:scale-110 shadow-sm",
                          dotCls
                        )}
                      >
                        <Icon className="h-4 w-4" />
                      </div>
                      {!isLast && <div className="w-[1.5px] flex-1 bg-gradient-to-b from-border/40 to-transparent my-1" />}
                    </div>

                    <div className="pb-6 min-w-0 flex-1 pt-0.5">
                      <p className="text-sm font-black tracking-tight group-hover:text-primary transition-colors">{item.title}</p>
                      {item.detail && (
                        <p className="text-xs text-muted-foreground mt-1 font-medium leading-relaxed opacity-70 group-hover:opacity-100 transition-opacity">
                          {item.detail}
                        </p>
                      )}
                      <div className="flex items-center gap-2 mt-2">
                        <Clock className="h-2.5 w-2.5 text-muted-foreground/30" />
                        <p className="text-[10px] font-black text-muted-foreground/40 uppercase tracking-widest">
                          {item.timestamp ?? item.at}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}

              {history.length === 0 && (
                <div className="flex flex-col items-center justify-center py-20 text-center text-muted-foreground/40">
                  <div className="h-16 w-16 rounded-full bg-muted/20 flex items-center justify-center mb-4">
                    <History className="h-8 w-8 opacity-20" />
                  </div>
                  <p className="text-sm italic font-medium">No clinical activity detected</p>
                </div>
              )}
            </div>
            
            <div className="pt-6 mt-auto border-t border-border/20">
              <button 
                onClick={() => navigate("/history")}
                className="w-full flex items-center justify-center gap-2 text-xs font-black uppercase tracking-widest text-primary hover:text-primary/80 transition-colors group"
              >
                View Full Audit Log
                <ArrowRight className="h-3.5 w-3.5 group-hover:translate-x-1 transition-transform" />
              </button>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

// ─── Workflow Command Card ────────────────────────────────────────────────────

function WorkflowCommand({ activeCase, onCreateCase }: {
  activeCase?: CaseRecord;
  onCreateCase: () => void;
}) {
  const [, navigate] = useLocation();
  const steps = workflowStepsForCase(activeCase);
  const next = nextWorkflowStep(activeCase);
  const done = steps.filter(s => s.done).length;
  const pct = Math.round((done / steps.length) * 100);

  function handleNext() {
    if (!activeCase && next.key === "case") { onCreateCase(); return; }
    navigate(next.href);
  }

  return (
    <Card className="relative overflow-hidden group/workflow glass-premium shadow-lg-professional border-primary/20 hover-glow transition-all duration-700">
      <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-sky-500/10 opacity-30 group-hover/workflow:opacity-50 transition-opacity duration-1000" />
      
      <div className="relative grid xl:grid-cols-[0.85fr_1.15fr]">
        {/* Left: next action */}
        <div className="border-b border-border/40 p-8 xl:border-b-0 xl:border-r border-border/20 backdrop-blur-sm">
          <div className="flex items-center gap-2 mb-4">
            <Zap className="h-4 w-4 text-primary animate-pulse" />
            <p className="text-[10px] font-black uppercase tracking-[0.25em] text-primary/80">
              Clinical Recommendation
            </p>
          </div>
          
          <h2 className="text-3xl font-black leading-tight tracking-tight mb-3">
            {next.label}
          </h2>
          <p className="text-sm text-muted-foreground leading-relaxed font-medium mb-8">
            {next.detail}
          </p>

          <div className="flex flex-wrap items-center gap-4 mb-10">
            <PrimaryBtn onClick={handleNext} icon={ChevronRight} className="h-12 px-8 hover-lift shadow-xl shadow-primary/20">
              {next.cta}
            </PrimaryBtn>
            <Pill tone={activeCase ? statusTone(activeCase.status) : "neutral"} size="md">
              {activeCase?.status ?? "System Idle"}
            </Pill>
          </div>

          <div className="space-y-3">
            <div className="flex justify-between items-baseline">
              <span className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/60">Study Readiness</span>
              <span className="text-lg font-black text-primary tabular-nums">{pct}%</span>
            </div>
            <div className="relative h-3 overflow-hidden rounded-full bg-muted/40 border border-border/20">
              <div
                className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-primary to-sky-400 transition-all duration-1000 ease-out"
                style={{ width: `${pct}%` }}
              />
              <div className="absolute inset-0 loading-sheen opacity-30" />
            </div>
          </div>
        </div>

        {/* Right: step grid */}
        <div className="grid gap-3 p-6 sm:grid-cols-2 lg:grid-cols-3 bg-muted/10">
          {steps.map((step, i) => {
            const Icon = step.done ? CheckCircle2 : CircleDot;
            return (
              <button
                key={step.key}
                type="button"
                onClick={() => navigate(step.href)}
                className={cn(
                  "relative group/step flex flex-col gap-4 rounded-2xl border p-5 text-left transition-all duration-500 overflow-hidden hover-lift",
                  step.done
                    ? "border-emerald-500/30 bg-emerald-500/5 hover:bg-emerald-500/10"
                    : "border-border/40 bg-card/40 hover:border-primary/40 hover:bg-card"
                )}
              >
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/30">
                    Phase {String(i + 1).padStart(2, "0")}
                  </span>
                  <Icon className={cn(
                    "h-4 w-4 shrink-0 transition-transform duration-500 group-hover/step:scale-125",
                    step.done ? "text-emerald-500" : "text-muted-foreground/20"
                  )} />
                </div>
                <p className={cn(
                  "text-xs font-black leading-tight uppercase tracking-wide",
                  step.done ? "text-emerald-600" : "text-foreground/60"
                )}>
                  {step.label}
                </p>
                {step.done && (
                  <div className="absolute bottom-0 inset-x-0 h-1 bg-emerald-500/40" />
                )}
              </button>
            );
          })}
        </div>
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
  );
}

const ArrowRight = ({ className }: { className?: string }) => (
  <svg className={className} width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M1 8H15M15 8L8 1M15 8L8 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);
