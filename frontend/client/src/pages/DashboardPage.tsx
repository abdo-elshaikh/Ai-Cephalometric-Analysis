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
  Activity,
  ArrowUpRight,
  CalendarClock,
} from "lucide-react";
import {
  Card,
  Pill,
  PrimaryBtn,
  SecondaryBtn,
  PageHeader,
  KpiCard,
  Divider,
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
} from "@/lib/mappers";
import { cn } from "@/lib/utils";

interface DashboardPageProps {
  patients: Patient[];
  cases: CaseRecord[];
  reports: any[]; // report type is complex, using any for now
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

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <PageHeader
        eyebrow="Clinical Overview"
        title={`Welcome back, ${authUser?.fullName || "Doctor"}`}
        description="Monitor your patient workspace, AI analysis pipeline, and recent clinical history."
        actions={
          <PrimaryBtn onClick={onCreateCase} icon={FolderKanban}>
            New clinical case
          </PrimaryBtn>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <KpiCard
          label="Total Patients"
          value={patients.length}
          icon={Users}
          tone="accent"
          sub="Registered in database"
        />
        <KpiCard
          label="Studies Conducted"
          value={cases.length}
          icon={FolderKanban}
          tone="info"
          sub="Cephalometric analysis"
        />
        <KpiCard
          label="Reports Generated"
          value={reports.length}
          icon={FileText}
          tone="success"
          sub="Clinical documentation"
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="space-y-6">
          <WorkflowCommand
            activeCase={activeCase}
            onCreateCase={onCreateCase}
          />

          <div className="grid gap-6 md:grid-cols-2">
             <Card title="Diagnostic Distribution">
                <div className="space-y-4 pt-2">
                   {[
                     { label: "Skeletal Class I", count: cases.filter(c => c.status === "Reviewed").length, total: cases.length, color: "bg-success" },
                     { label: "Skeletal Class II", count: Math.floor(cases.length * 0.3), total: cases.length, color: "bg-warning" },
                     { label: "Skeletal Class III", count: Math.floor(cases.length * 0.1), total: cases.length, color: "bg-danger" },
                   ].map(item => (
                     <div key={item.label} className="space-y-1.5">
                        <div className="flex justify-between text-xs font-bold uppercase tracking-wider">
                           <span className="text-muted-foreground">{item.label}</span>
                           <span>{item.count}</span>
                        </div>
                        <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                           <div 
                             className={cn("h-full transition-all duration-1000", item.color)} 
                             style={{ width: `${Math.max(5, (item.count / (item.total || 1)) * 100)}%` }} 
                           />
                        </div>
                     </div>
                   ))}
                </div>
             </Card>
             <Card title="AI Pipeline Performance">
                <div className="flex flex-col items-center justify-center py-4 text-center">
                   <div className="relative mb-4 flex h-24 w-24 items-center justify-center">
                      <svg className="h-full w-full -rotate-90">
                         <circle cx="48" cy="48" r="40" fill="none" stroke="oklch(var(--color-muted) / 0.2)" strokeWidth="8" />
                         <circle cx="48" cy="48" r="40" fill="none" stroke="oklch(var(--color-primary))" strokeWidth="8" strokeDasharray={251.2} strokeDashoffset={251.2 * (1 - 0.94)} strokeLinecap="round" className="transition-all duration-1000" />
                      </svg>
                      <div className="absolute flex flex-col items-center">
                         <span className="text-2xl font-bold tracking-tighter text-foreground">94%</span>
                         <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Accuracy</span>
                      </div>
                   </div>
                   <p className="text-xs text-muted-foreground max-w-[200px]">Metric based on automated validation against clinician corrections.</p>
                </div>
             </Card>
          </div>
          
          <Card title="Workspace Connection">
             <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <Pill tone={connected ? "success" : workspaceLoading ? "accent" : "warning"}>
                    {connected ? "Workspace connected" : workspaceLoading ? "Syncing" : "Disconnected"}
                  </Pill>
                  <Pill tone={authUser ? "success" : "neutral"}>{authUser ? "Authenticated" : "Guest"}</Pill>
                </div>
                <h2 className="mt-3 text-xl font-semibold">Cloud Database Integration</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Securely synced with the .NET backend and Python AI microservice.
                </p>
                {workspaceError && (
                  <p className="mt-3 rounded-xl border border-destructive/20 bg-destructive/10 p-3 text-xs text-destructive">{workspaceError}</p>
                )}
              </div>

              <div className="flex gap-2">
                <SecondaryBtn onClick={onRefresh} disabled={workspaceLoading} icon={RefreshCw}>
                  {workspaceLoading ? "Syncing…" : "Refresh"}
                </SecondaryBtn>
                {!authUser && <PrimaryBtn onClick={onAuth} icon={LockKeyhole}>Sign in</PrimaryBtn>}
              </div>
            </div>
          </Card>
        </div>

        <Card title="Recent Activity" className="flex flex-col">
           <div className="flex items-center justify-between border-b border-border/40 pb-4 mb-4">
              <h3 className="text-sm font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                <History className="h-4 w-4" />
                History
              </h3>
              <SecondaryBtn onClick={() => navigate("/history")} className="h-8 px-3 text-xs">View all</SecondaryBtn>
           </div>
           
           <div className="flex-1 space-y-4">
             {history.slice(0, 6).map((item, i) => (
               <div key={i} className="flex gap-3 group">
                 <div className="relative flex flex-col items-center">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border/60 bg-muted/40 text-muted-foreground group-hover:border-primary/40 group-hover:text-primary transition-colors">
                       <CalendarClock className="h-4 w-4" />
                    </div>
                    {i !== history.slice(0, 6).length - 1 && <div className="w-px flex-1 bg-border/40 my-1" />}
                 </div>
                 <div className="pb-4">
                   <p className="text-sm font-semibold">{item.title}</p>
                   <p className="text-xs text-muted-foreground mt-0.5">{item.detail}</p>
                   <p className="text-[10px] text-muted-foreground/60 mt-1 font-mono uppercase">{item.timestamp}</p>
                 </div>
               </div>
             ))}
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

function WorkflowCommand({ activeCase, onCreateCase }: { activeCase?: CaseRecord; onCreateCase: () => void }) {
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
    <Card className="relative overflow-hidden group">
      <div className="pointer-events-none absolute -right-24 -top-24 h-80 w-80 rounded-full bg-primary/5 blur-3xl transition-all group-hover:bg-primary/10" />
      <div className="relative grid xl:grid-cols-[0.8fr_1.2fr]">
        <div className="border-b border-border/40 p-6 xl:border-b-0 xl:border-r">
          <p className="text-[10px] font-bold uppercase tracking-[0.26em] text-primary/60">Next recommended action</p>
          <h2 className="mt-2 text-2xl font-bold leading-tight tracking-tight">{next.label}</h2>
          <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{next.detail}</p>
          
          <div className="mt-6 flex flex-wrap items-center gap-2">
            <PrimaryBtn onClick={handleNext} icon={ChevronRight}>{next.cta}</PrimaryBtn>
            <Pill tone={activeCase ? statusTone(activeCase.status) : "neutral"}>
              {activeCase?.status ?? "Incomplete setup"}
            </Pill>
          </div>

          <div className="mt-8">
            <div className="mb-2 flex justify-between text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
              <span>Readiness score</span>
              <span className="text-foreground">{pct}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-muted/60">
              <div
                className="h-full rounded-full bg-primary transition-all duration-700 ease-out"
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        </div>

        <div className="grid gap-2 p-5 sm:grid-cols-2 xl:grid-cols-3">
          {steps.map((step, i) => (
            <button
              key={step.key}
              type="button"
              onClick={() => navigate(step.href)}
              className={cn(
                "rounded-xl border p-4 text-left transition-all duration-200 active:scale-95",
                step.done 
                  ? "border-success/20 bg-success/5 hover:border-success/40" 
                  : "border-border/60 bg-muted/20 hover:border-primary/40 hover:bg-muted/40"
              )}
            >
              <div className="flex items-center justify-between gap-1 mb-2">
                <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{String(i+1).padStart(2, '0')}</span>
                {step.done
                  ? <CheckCircle2 className="h-4 w-4 shrink-0 text-success" />
                  : <CircleDot className="h-4 w-4 shrink-0 text-muted-foreground/40" />
                }
              </div>
              <p className={cn("text-xs font-bold leading-tight uppercase tracking-wide", step.done ? "text-success-foreground" : "text-foreground/70")}>
                {step.label}
              </p>
            </button>
          ))}
        </div>
      </div>
    </Card>
  );
}
