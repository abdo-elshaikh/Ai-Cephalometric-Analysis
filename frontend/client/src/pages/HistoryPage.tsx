import React, { useState, useMemo } from "react";
import {
  CalendarClock, History as HistoryIcon, BrainCircuit, FileText, UserPlus,
  FolderKanban, Upload, Target, ClipboardCheck, Ruler, Filter, X, User,
  Folder, AlertCircle, AlertTriangle, DownloadCloud, Sparkles, TrendingUp,
  Search, ArrowRight, ShieldCheck, Zap,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import {
  Card, Pill, PageHeader, SearchInput, IconBtn, Divider, TextInput,
} from "@/components/_core/ClinicalComponents";
import { type TimelineItem, type CaseRecord, type Patient } from "@/lib/mappers";
import { cn } from "@/lib/utils";

// ─── Event type metadata ───────────────────────────────────────────────────────

type EventMeta = {
  icon: LucideIcon;
  label: string;
  dotColor: string;
  bgColor: string;
  textColor: string;
  borderColor: string;
};

const EVENT_META: Record<string, EventMeta> = {
  landmark:    { icon: Target,         label: "Landmark Synthesis", dotColor: "bg-primary",              bgColor: "bg-primary/10",    textColor: "text-primary",               borderColor: "border-primary/20"    },
  ai:          { icon: BrainCircuit,   label: "AI Neural Pipeline", dotColor: "bg-sky-500",              bgColor: "bg-sky-500/10",    textColor: "text-sky-500",               borderColor: "border-sky-500/20"    },
  report:      { icon: FileText,       label: "Clinical Report",    dotColor: "bg-emerald-500",          bgColor: "bg-emerald-500/10", textColor: "text-emerald-500",            borderColor: "border-emerald-500/20" },
  patient:     { icon: UserPlus,       label: "Patient Intake",     dotColor: "bg-primary",              bgColor: "bg-primary/10",    textColor: "text-primary",               borderColor: "border-primary/20"    },
  case:        { icon: FolderKanban,   label: "Case Architecture",  dotColor: "bg-amber-500",            bgColor: "bg-amber-500/10",  textColor: "text-amber-500",             borderColor: "border-amber-500/20"  },
  calibration: { icon: Ruler,          label: "Metric Calibration", dotColor: "bg-amber-500",            bgColor: "bg-amber-500/10",  textColor: "text-amber-500",             borderColor: "border-amber-500/20"  },
  upload:      { icon: Upload,         label: "Asset Ingestion",    dotColor: "bg-sky-500",              bgColor: "bg-sky-500/10",    textColor: "text-sky-500",               borderColor: "border-sky-500/20"    },
  review:      { icon: ClipboardCheck, label: "Clinical Review",    dotColor: "bg-emerald-500",          bgColor: "bg-emerald-500/10", textColor: "text-emerald-500",            borderColor: "border-emerald-500/20" },
};

function getEventMeta(type: string): EventMeta {
  return (
    EVENT_META[type.toLowerCase()] ?? {
      icon: CalendarClock,
      label: type,
      dotColor: "bg-muted-foreground",
      bgColor: "bg-muted/30",
      textColor: "text-muted-foreground",
      borderColor: "border-border/40",
    }
  );
}

const STAT_TYPES = ["ai", "landmark", "report", "review"] as const;
const TYPE_OPTIONS = ["All Events", "Landmark", "AI", "Report", "Patient", "Case", "Calibration", "Upload", "Review"];
const SEVERITY_OPTIONS = ["All Severities", "Info", "Warning", "Critical"];

// ─── Component ────────────────────────────────────────────────────────────────

interface HistoryPageProps {
  history: TimelineItem[];
  cases: CaseRecord[];
  patients: Patient[];
}

export default function HistoryPage({ history, cases, patients }: HistoryPageProps) {
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("All Events");
  const [severityFilter, setSeverityFilter] = useState("All Severities");

  function getPatientName(id: string) {
    const p = patients.find(x => x.id === id);
    return p ? `${p.firstName} ${p.lastName}` : null;
  }

  function getCaseTitle(id: string) {
    const c = cases.find(x => x.id === id);
    return c ? c.title : null;
  }

  const typeCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    history.forEach(item => {
      const key = item.type.toLowerCase();
      counts[key] = (counts[key] ?? 0) + 1;
    });
    return counts;
  }, [history]);

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    return history.filter(item => {
      const matchQuery =
        !q ||
        item.title.toLowerCase().includes(q) ||
        (item.detail ?? "").toLowerCase().includes(q) ||
        (getPatientName(item.patientId ?? "") ?? "").toLowerCase().includes(q) ||
        (item.userName ?? "").toLowerCase().includes(q);
      const matchType =
        typeFilter === "All Events" ||
        item.type.toLowerCase() === typeFilter.toLowerCase().replace(" events", "");
      const matchSeverity =
        severityFilter === "All Severities" ||
        (item.severity ?? "info").toLowerCase() === severityFilter.toLowerCase().replace(" severities", "");
      return matchQuery && matchType && matchSeverity;
    });
  }, [history, query, typeFilter, severityFilter, patients]);

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
                Diagnostic Ledger
              </span>
            </div>
            <h1 className="text-4xl font-black tracking-tight text-gradient-primary md:text-5xl">
              Audit History
            </h1>
            <p className="text-muted-foreground font-medium max-w-2xl leading-relaxed">
              A comprehensive chronological immutable record of clinical events, AI telemetry computations, and clinician interventions.
            </p>
          </div>
          
          <div className="flex items-center gap-3 shrink-0 bg-card/30 backdrop-blur-md p-2 rounded-2xl border border-border/40 shadow-sm-professional">
             <div className="flex items-center gap-3 px-6 py-2.5 bg-primary/10 border border-primary/20 rounded-xl text-primary">
                <ShieldCheck className="h-4 w-4" />
                <span className="text-[10px] font-black uppercase tracking-widest">Authenticated Audit Trail</span>
             </div>
          </div>
        </div>

        {/* ── KPI Grid ── */}
        <div className="grid grid-cols-2 gap-6 lg:grid-cols-4">
          {STAT_TYPES.map(type => {
            const meta = getEventMeta(type);
            const count = typeCounts[type] ?? 0;
            const isActive = typeFilter.toLowerCase().includes(type);
            return (
              <Card
                key={type}
                onClick={() => setTypeFilter(isActive ? "All Events" : meta.label)}
                className={cn(
                  "relative group overflow-hidden p-8 glass-premium hover-glow transition-all duration-700 cursor-pointer shadow-md-professional border-border/40",
                  isActive && "border-primary/40 ring-1 ring-primary/20 shadow-primary/10"
                )}
              >
                <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:scale-125 group-hover:rotate-12 transition-transform duration-700">
                  <meta.icon className="h-16 w-16" />
                </div>
                <div className="space-y-4 relative z-10">
                  <div className={cn("h-12 w-12 rounded-2xl border flex items-center justify-center transition-all", meta.bgColor, meta.borderColor, meta.textColor)}>
                    <meta.icon className="h-6 w-6" />
                  </div>
                  <div>
                    <p className="text-4xl font-black tracking-tighter tabular-nums">{count}</p>
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/60 mt-1">{meta.label}</p>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>

        {/* ── Toolbar & Timeline ── */}
        <div className="space-y-10">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-center">
            <div className="relative flex-1 max-w-xl group">
              <Search className="absolute left-5 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground/40 group-focus-within:text-primary transition-colors" />
              <TextInput
                value={query}
                onChange={setQuery}
                placeholder="Query audit trail by patient, clinical user, or event title..."
                className="pl-14 h-14 rounded-2xl border-border/40 bg-card/40 backdrop-blur-md focus:ring-primary/20 shadow-sm"
              />
            </div>

            <div className="flex items-center gap-3 bg-card/30 backdrop-blur-md p-1.5 rounded-2xl border border-border/40 shadow-sm">
              <div className="flex items-center gap-2 px-3">
                <Filter className="h-4 w-4 text-muted-foreground/40" />
                <select
                  value={typeFilter}
                  onChange={e => setTypeFilter(e.target.value)}
                  className="bg-transparent text-[10px] font-black uppercase tracking-widest outline-none cursor-pointer text-muted-foreground/60 hover:text-foreground transition-colors"
                >
                  {TYPE_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>
              <Divider className="h-4 w-px bg-border/20" />
              <div className="flex items-center gap-2 px-3">
                <AlertTriangle className="h-4 w-4 text-muted-foreground/40" />
                <select
                  value={severityFilter}
                  onChange={e => setSeverityFilter(e.target.value)}
                  className="bg-transparent text-[10px] font-black uppercase tracking-widest outline-none cursor-pointer text-muted-foreground/60 hover:text-foreground transition-colors"
                >
                  {SEVERITY_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>
            </div>

            <Pill tone="neutral" className="bg-muted/40 border-border/20 px-4 py-2 font-black tabular-nums">
              {filtered.length} / {history.length} RECORDS
            </Pill>
          </div>

          <Card className="p-10 glass-premium border-border/40 shadow-lg-professional overflow-visible">
            {filtered.length ? (
              <div className="relative pl-12 space-y-12">
                {/* Vertical spine */}
                <div className="absolute left-[23px] top-4 bottom-4 w-0.5 bg-gradient-to-b from-primary/30 via-border/20 to-transparent" />

                {filtered.map((item, idx) => {
                  const meta = getEventMeta(item.type);
                  const Icon = meta.icon;
                  const patientName = getPatientName(item.patientId ?? "");
                  const caseTitle = getCaseTitle(item.caseId ?? "");
                  const isWarning = item.severity?.toLowerCase() === "warning" || item.severity?.toLowerCase() === "critical";

                  return (
                    <div key={item.id} className="relative group animate-in fade-in slide-in-from-left-4 duration-500" style={{ animationDelay: `${idx * 50}ms` }}>
                      {/* Timeline Dot/Icon */}
                      <div className={cn(
                        "absolute -left-[53px] top-0 h-10 w-10 rounded-xl border-2 flex items-center justify-center transition-all duration-500 group-hover:scale-110 group-hover:shadow-xl",
                        meta.bgColor, meta.borderColor, meta.textColor,
                        isWarning ? "border-rose-500/40 bg-rose-500/10 text-rose-500 shadow-rose-500/10" : "shadow-primary/5"
                      )}>
                        <Icon className="h-5 w-5" />
                        {isWarning && <div className="absolute -top-1 -right-1 h-3 w-3 bg-rose-500 rounded-full border-2 border-background animate-pulse" />}
                      </div>

                      <div className="space-y-3">
                        <div className="flex flex-wrap items-center gap-3">
                           <span className={cn("text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-lg border", meta.bgColor, meta.borderColor, meta.textColor)}>
                            {meta.label}
                           </span>
                           <span className="text-[10px] font-black tabular-nums text-muted-foreground/30 uppercase tracking-[0.2em] ml-auto">
                            {item.at}
                           </span>
                        </div>

                        <div className="space-y-1">
                          <h4 className="text-lg font-black tracking-tight text-foreground group-hover:text-primary transition-colors">{item.title}</h4>
                          {item.detail && (
                            <p className="text-sm text-muted-foreground font-medium leading-relaxed max-w-3xl">
                              {item.detail}
                            </p>
                          )}
                        </div>

                        {(patientName || caseTitle || item.userName) && (
                          <div className="flex flex-wrap items-center gap-6 pt-2">
                             {item.userName && item.userName !== "System" && (
                              <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-muted-foreground/40">
                                <User className="h-3 w-3" />
                                <span>Clinician: <span className="text-foreground/60">{item.userName}</span></span>
                              </div>
                            )}
                            {patientName && (
                              <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-muted-foreground/40">
                                <UserPlus className="h-3 w-3" />
                                <span>Patient: <span className="text-foreground/60">{patientName}</span></span>
                              </div>
                            )}
                            {caseTitle && (
                              <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-muted-foreground/40">
                                <FolderKanban className="h-3 w-3" />
                                <span>Case: <span className="text-foreground/60">{caseTitle}</span></span>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="py-32 text-center">
                <div className="flex h-20 w-20 items-center justify-center rounded-[32px] bg-muted/10 border-2 border-dashed border-border/20 mx-auto mb-8 shadow-inner-lg">
                  <HistoryIcon className="h-10 w-10 text-muted-foreground/20" />
                </div>
                <h3 className="text-2xl font-black tracking-tight mb-3">Audit Log Blank</h3>
                <p className="text-sm text-muted-foreground max-w-sm mx-auto font-medium leading-relaxed">
                  {history.length
                    ? "No clinical events match your current filter parameters."
                    : "Clinical operations will be recorded here as you process cephalometric studies."}
                </p>
                {history.length > 0 && (
                  <button
                    onClick={() => { setQuery(""); setTypeFilter("All Events"); setSeverityFilter("All Severities"); }}
                    className="mt-10 h-11 px-8 rounded-xl border border-primary/20 text-primary text-[10px] font-black uppercase tracking-widest hover:bg-primary/5 transition-all"
                  >
                    Clear Filter Pipeline
                  </button>
                )}
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
