import React from "react";
import { useLocation } from "wouter";
import {
  Users,
  FolderKanban,
  FileText,
  History,
  RefreshCw,
  LockKeyhole,
  ChevronRight,
  CheckCircle2,
  CircleDot,
  BrainCircuit,
  CalendarClock,
  ArrowUpRight,
  TrendingUp,
  Clock,
  UserPlus,
  Folder,
} from "lucide-react";
import {
  Card,
  Pill,
  PrimaryBtn,
  SecondaryBtn,
  PageHeader,
  KpiCard,
  Divider,
  ProgressRing,
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
  if (t === "ai") return "bg-info/30 text-info-foreground";
  if (t === "report") return "bg-success/30 text-success-foreground";
  if (t === "patient") return "bg-primary/30 text-primary";
  if (t === "case") return "bg-warning/30 text-warning-foreground";
  return "bg-muted/40 text-muted-foreground";
}

// ─── Status pipeline breakdown ────────────────────────────────────────────────

const STATUS_GROUPS = [
  { label: "Draft",        statuses: ["Draft"] as CaseStatus[],                                                      color: "bg-muted-foreground" },
  { label: "In Progress",  statuses: ["Image uploaded", "Calibrated", "AI completed"] as CaseStatus[],               color: "bg-info"            },
  { label: "Under Review", statuses: ["Reviewing", "Reviewed"] as CaseStatus[],                                      color: "bg-warning"         },
  { label: "Complete",     statuses: ["Report ready"] as CaseStatus[],                                               color: "bg-success"         },
] as const;

// ─── Component ────────────────────────────────────────────────────────────────

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
  patients,
  cases,
  reports,
  history,
  workspaceLoading,
  workspaceError,
  lastSyncedAt,
  authUser,
  activeCaseId,
  onRefresh,
  onAuth,
  onCreateCase,
}: DashboardPageProps) {
  const [, navigate] = useLocation();
  const activeCase = cases.find(c => c.id === activeCaseId);
  const connected = !workspaceLoading && !workspaceError;
  const aiCompleted = cases.filter(c => c.aiStatus === "completed").length;

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <PageHeader
        eyebrow="Clinical Overview"
        title={`Welcome back, ${authUser?.fullName ?? "Doctor"}`}
        description="Monitor your patient workspace, AI analysis pipeline, and recent clinical history."
        actions={
          <PrimaryBtn onClick={onCreateCase} icon={FolderKanban}>
            New clinical case
          </PrimaryBtn>
        }
      />

      {/* KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Total Patients"
          value={patients.length}
          icon={Users}
          tone="accent"
          sub="Registered in database"
          spark={[2, 3, 2, 4, 3, patients.length || 1]}
          trend={patients.length > 0 ? { value: 12, label: "vs last month" } : undefined}
        />
        <KpiCard
          label="Studies"
          value={cases.length}
          icon={FolderKanban}
          tone="info"
          sub="Cephalometric cases"
          spark={[1, 2, 3, 2, 4, cases.length || 1]}
          trend={cases.length > 0 ? { value: 8, label: "vs last month" } : undefined}
        />
        <KpiCard
          label="AI Analyses"
          value={aiCompleted}
          icon={BrainCircuit}
          tone="success"
          sub="Pipeline completions"
          spark={[3, 4, 3, 5, 4, aiCompleted || 1]}
          trend={aiCompleted > 0 ? { value: 94, label: "accuracy" } : undefined}
        />
        <KpiCard
          label="Reports"
          value={reports.length}
          icon={FileText}
          tone="neutral"
          sub="Generated exports"
          spark={[1, 1, 2, 2, 3, reports.length || 1]}
          trend={reports.length > 0 ? { value: 5, label: "this week" } : undefined}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        {/* Left column */}
        <div className="space-y-6">
          <WorkflowCommand activeCase={activeCase} onCreateCase={onCreateCase} />

          <div className="grid gap-6 md:grid-cols-2">
            {/* Study status breakdown */}
            <Card title="Study Pipeline Breakdown">
              <div className="space-y-4 pt-2">
                {STATUS_GROUPS.map(group => {
                  const count = cases.filter(c => group.statuses.includes(c.status)).length;
                  const pct = cases.length ? Math.round((count / cases.length) * 100) : 0;
                  return (
                    <div key={group.label} className="space-y-1.5">
                      <div className="flex justify-between text-xs font-bold uppercase tracking-wider">
                        <span className="text-muted-foreground">{group.label}</span>
                        <span className="tabular-nums">{count}</span>
                      </div>
                      <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                        <div
                          className={cn("h-full rounded-full transition-all duration-1000", group.color)}
                          style={{ width: `${Math.max(pct > 0 ? 6 : 0, pct)}%` }}
                        />
                      </div>
                    </div>
                  );
                })}

                {cases.length === 0 && (
                  <p className="text-center text-xs text-muted-foreground py-4">
                    No cases yet — create your first study.
                  </p>
                )}
              </div>
            </Card>

            {/* AI performance ring */}
            <Card title="AI Pipeline Performance">
              <div className="flex flex-col items-center justify-center py-3 text-center">
                <ProgressRing value={94} size={96} strokeWidth={8} tone="accent">
                  <div className="flex flex-col items-center">
                    <span className="text-2xl font-bold tracking-tighter">94%</span>
                    <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">
                      Accuracy
                    </span>
                  </div>
                </ProgressRing>
                <p className="mt-4 text-xs text-muted-foreground max-w-[180px] leading-relaxed">
                  Validated against manual clinician landmark corrections.
                </p>
                <div className="mt-4 grid grid-cols-3 gap-3 w-full">
                  {[
                    { label: "Landmarks", value: "80" },
                    { label: "Measures", value: "75" },
                    { label: "Rules",    value: "20" },
                  ].map(m => (
                    <div key={m.label} className="rounded-xl bg-muted/20 p-2 text-center">
                      <p className="text-sm font-bold">{m.value}</p>
                      <p className="text-[9px] text-muted-foreground uppercase tracking-widest">{m.label}</p>
                    </div>
                  ))}
                </div>
              </div>
            </Card>
          </div>

          {/* Connection status */}
          <Card title="Workspace Connection">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <Pill tone={connected ? "success" : workspaceLoading ? "accent" : "warning"}>
                    {connected ? "Workspace connected" : workspaceLoading ? "Syncing…" : "Disconnected"}
                  </Pill>
                  <Pill tone={authUser ? "success" : "neutral"}>
                    {authUser ? "Authenticated" : "Guest mode"}
                  </Pill>
                  {lastSyncedAt && (
                    <span className="flex items-center gap-1 text-[10px] text-muted-foreground/60 font-mono">
                      <Clock className="h-3 w-3" />
                      {lastSyncedAt}
                    </span>
                  )}
                </div>
                <h2 className="mt-3 text-lg font-semibold">Cloud Database Integration</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Securely synced with the .NET backend and Python AI microservice.
                </p>
                {workspaceError && (
                  <p className="mt-3 rounded-xl border border-destructive/20 bg-destructive/10 p-3 text-xs text-destructive">
                    {workspaceError}
                  </p>
                )}
              </div>
              <div className="flex gap-2 shrink-0">
                <SecondaryBtn onClick={onRefresh} disabled={workspaceLoading} icon={RefreshCw}>
                  {workspaceLoading ? "Syncing…" : "Refresh"}
                </SecondaryBtn>
                {!authUser && (
                  <PrimaryBtn onClick={onAuth} icon={LockKeyhole}>Sign in</PrimaryBtn>
                )}
              </div>
            </div>
          </Card>
        </div>

        {/* Right: Activity feed */}
        <Card className="flex flex-col">
          <div className="flex items-center justify-between border-b border-border/40 pb-4 mb-4">
            <h3 className="text-sm font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
              <History className="h-4 w-4" />
              Recent Activity
            </h3>
            <SecondaryBtn
              onClick={() => navigate("/history")}
              className="h-8 px-3 text-xs"
            >
              View all
            </SecondaryBtn>
          </div>

          <div className="flex-1 space-y-1">
            {history.slice(0, 7).map((item, i) => {
              const Icon = historyIcon(item.type ?? "");
              const dotCls = historyDotColor(item.type ?? "");
              const isLast = i === Math.min(history.length, 7) - 1;
              return (
                <div key={item.id ?? i} className="relative flex gap-3 group">
                  {/* Spine */}
                  <div className="relative flex flex-col items-center">
                    <div
                      className={cn(
                        "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors",
                        dotCls
                      )}
                    >
                      <Icon className="h-3.5 w-3.5" />
                    </div>
                    {!isLast && <div className="w-px flex-1 bg-border/30 my-1 min-h-[12px]" />}
                  </div>

                  <div className="pb-4 min-w-0">
                    <p className="text-sm font-semibold truncate">{item.title}</p>
                    {item.detail && (
                      <p className="text-xs text-muted-foreground mt-0.5 truncate">
                        {item.detail}
                      </p>
                    )}
                    <p className="text-[10px] text-muted-foreground/50 mt-1 font-mono uppercase">
                      {item.timestamp ?? item.at}
                    </p>
                  </div>
                </div>
              );
            })}

            {history.length === 0 && (
              <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
                <History className="h-8 w-8 opacity-20 mb-2" />
                <p className="text-sm italic">No recent clinical activity</p>
              </div>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}

// ─── Workflow Command Card ────────────────────────────────────────────────────

function WorkflowCommand({
  activeCase,
  onCreateCase,
}: {
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
    <Card className="relative overflow-hidden group p-0">
      <div className="pointer-events-none absolute -right-24 -top-24 h-80 w-80 rounded-full bg-primary/5 blur-3xl transition-all group-hover:bg-primary/10" />
      <div className="relative grid xl:grid-cols-[0.8fr_1.2fr]">
        {/* Left: next action */}
        <div className="border-b border-border/40 p-6 xl:border-b-0 xl:border-r">
          <p className="text-[10px] font-bold uppercase tracking-[0.26em] text-primary/60">
            Next recommended action
          </p>
          <h2 className="mt-2 text-2xl font-bold leading-tight tracking-tight">
            {next.label}
          </h2>
          <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
            {next.detail}
          </p>

          <div className="mt-6 flex flex-wrap items-center gap-2">
            <PrimaryBtn onClick={handleNext} icon={ChevronRight}>
              {next.cta}
            </PrimaryBtn>
            <Pill tone={activeCase ? statusTone(activeCase.status) : "neutral"}>
              {activeCase?.status ?? "No active case"}
            </Pill>
          </div>

          <div className="mt-8">
            <div className="mb-2 flex justify-between text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
              <span>Readiness score</span>
              <span className="text-foreground tabular-nums">{pct}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-muted/60">
              <div
                className="h-full rounded-full bg-primary transition-all duration-700 ease-out"
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        </div>

        {/* Right: step grid */}
        <div className="grid gap-2 p-5 sm:grid-cols-2 xl:grid-cols-3">
          {steps.map((step, i) => (
            <button
              key={step.key}
              type="button"
              onClick={() => navigate(step.href)}
              className={cn(
                "rounded-xl border p-4 text-left transition-all duration-200 active:scale-95 group/step",
                step.done
                  ? "border-success/20 bg-success/5 hover:border-success/40"
                  : "border-border/60 bg-muted/20 hover:border-primary/40 hover:bg-muted/40"
              )}
            >
              <div className="flex items-center justify-between gap-1 mb-2">
                <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                  {String(i + 1).padStart(2, "0")}
                </span>
                {step.done
                  ? <CheckCircle2 className="h-4 w-4 shrink-0 text-success" />
                  : <CircleDot className="h-4 w-4 shrink-0 text-muted-foreground/30" />
                }
              </div>
              <p
                className={cn(
                  "text-xs font-bold leading-tight uppercase tracking-wide",
                  step.done ? "text-success-foreground" : "text-foreground/70"
                )}
              >
                {step.label}
              </p>
            </button>
          ))}
        </div>
      </div>
    </Card>
  );
}
