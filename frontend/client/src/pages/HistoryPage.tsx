import React, { useState, useMemo } from "react";
import {
  CalendarClock,
  History as HistoryIcon,
  BrainCircuit,
  FileText,
  UserPlus,
  FolderKanban,
  Upload,
  Target,
  ClipboardCheck,
  Ruler,
  Filter,
  X,
  User,
  Folder,
  AlertCircle,
  AlertTriangle,
  DownloadCloud,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import {
  Card,
  Pill,
  PageHeader,
  SearchInput,
  IconBtn,
} from "@/components/_core/ClinicalComponents";
import {
  type TimelineItem,
  type CaseRecord,
  type Patient,
} from "@/lib/mappers";
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
  landmark:    { icon: Target,         label: "Landmark",    dotColor: "bg-primary",              bgColor: "bg-primary/10",    textColor: "text-primary",               borderColor: "border-primary/20"    },
  ai:          { icon: BrainCircuit,   label: "AI",          dotColor: "bg-info",                 bgColor: "bg-info/10",       textColor: "text-info-foreground",       borderColor: "border-info/20"       },
  report:      { icon: FileText,       label: "Report",      dotColor: "bg-success",              bgColor: "bg-success/10",    textColor: "text-success-foreground",    borderColor: "border-success/20"    },
  patient:     { icon: UserPlus,       label: "Patient",     dotColor: "bg-primary",              bgColor: "bg-primary/10",    textColor: "text-primary",               borderColor: "border-primary/20"    },
  case:        { icon: FolderKanban,   label: "Case",        dotColor: "bg-warning",              bgColor: "bg-warning/10",    textColor: "text-warning-foreground",    borderColor: "border-warning/20"    },
  calibration: { icon: Ruler,          label: "Calibration", dotColor: "bg-warning",              bgColor: "bg-warning/10",    textColor: "text-warning-foreground",    borderColor: "border-warning/20"    },
  upload:      { icon: Upload,         label: "Upload",      dotColor: "bg-info",                 bgColor: "bg-info/10",       textColor: "text-info-foreground",       borderColor: "border-info/20"       },
  review:      { icon: ClipboardCheck, label: "Review",      dotColor: "bg-success",              bgColor: "bg-success/10",    textColor: "text-success-foreground",    borderColor: "border-success/20"    },
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
const TYPE_OPTIONS = ["All", "Landmark", "AI", "Report", "Patient", "Case", "Calibration", "Upload", "Review"];
const SEVERITY_OPTIONS = ["All", "Info", "Warning", "Critical"];

function getSeverityIcon(severity?: string) {
  switch (severity?.toLowerCase()) {
    case "warning":
      return AlertTriangle;
    case "critical":
      return AlertCircle;
    default:
      return null;
  }
}

function getSeverityColor(severity?: string): string {
  switch (severity?.toLowerCase()) {
    case "warning":
      return "text-amber-500";
    case "critical":
      return "text-red-500";
    default:
      return "";
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

interface HistoryPageProps {
  history: TimelineItem[];
  cases: CaseRecord[];
  patients: Patient[];
}

export default function HistoryPage({ history, cases, patients }: HistoryPageProps) {
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("All");
  const [severityFilter, setSeverityFilter] = useState("All");

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
        typeFilter === "All" ||
        item.type.toLowerCase() === typeFilter.toLowerCase();
      const matchSeverity =
        severityFilter === "All" ||
        (item.severity ?? "info").toLowerCase() === severityFilter.toLowerCase();
      return matchQuery && matchType && matchSeverity;
    });
  }, [history, query, typeFilter, severityFilter, patients]);

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <PageHeader
        eyebrow="Clinical Audit Trail"
        title="Event History"
        description="A comprehensive, chronological log of all clinical interactions, AI processing events, and database modifications."
      />

      {/* Stats bar */}
      {history.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {STAT_TYPES.map(type => {
            const meta = getEventMeta(type);
            const Icon = meta.icon;
            const count = typeCounts[type] ?? 0;
            const isActive = typeFilter === meta.label;
            return (
              <button
                key={type}
                type="button"
                onClick={() => setTypeFilter(isActive ? "All" : meta.label)}
                className={cn(
                  "flex items-center gap-3 rounded-2xl border p-4 text-left transition-all duration-200 hover:shadow-sm active:scale-[0.98]",
                  isActive
                    ? "border-primary/30 bg-primary/5 shadow-sm"
                    : "border-border/40 bg-card hover:border-border/60"
                )}
              >
                <div
                  className={cn(
                    "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border",
                    meta.bgColor,
                    meta.borderColor
                  )}
                >
                  <Icon className={cn("h-4 w-4", meta.textColor)} />
                </div>
                <div>
                  <p className="text-xl font-bold leading-none tabular-nums">{count}</p>
                  <p className="mt-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                    {meta.label}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      )}

      <Card noPadding className="overflow-visible">
        {/* Toolbar */}
        <div className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between border-b border-border/40">
          <SearchInput
            value={query}
            onChange={setQuery}
            placeholder="Search events, patients, users, or details..."
            className="max-w-md flex-1"
          />
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2 rounded-xl border border-border/60 bg-muted/20 px-3 h-10">
              <Filter className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <select
                value={typeFilter}
                onChange={e => setTypeFilter(e.target.value)}
                className="bg-transparent text-xs font-bold uppercase tracking-wider outline-none cursor-pointer text-muted-foreground hover:text-foreground"
              >
                {TYPE_OPTIONS.map(o => (
                  <option key={o} value={o}>{o}</option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2 rounded-xl border border-border/60 bg-muted/20 px-3 h-10">
              <AlertTriangle className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <select
                value={severityFilter}
                onChange={e => setSeverityFilter(e.target.value)}
                className="bg-transparent text-xs font-bold uppercase tracking-wider outline-none cursor-pointer text-muted-foreground hover:text-foreground"
              >
                {SEVERITY_OPTIONS.map(o => (
                  <option key={o} value={o}>{o}</option>
                ))}
              </select>
            </div>
            {(query || typeFilter !== "All" || severityFilter !== "All") && (
              <IconBtn
                icon={X}
                label="Clear filters"
                onClick={() => { setQuery(""); setTypeFilter("All"); setSeverityFilter("All"); }}
                size="sm"
                variant="outline"
              />
            )}
            <Pill tone="neutral" className="bg-muted/40 border-border/60 shrink-0">
              {filtered.length} / {history.length}
            </Pill>
          </div>
        </div>

        <div className="p-6">
          {filtered.length ? (
            <div className="relative">
              {/* Vertical spine */}
              <div className="absolute left-[19px] top-3 bottom-6 w-px bg-border/40" />

              {filtered.map(item => {
                const meta = getEventMeta(item.type);
                const Icon = meta.icon;
                const patientName = getPatientName(item.patientId ?? "");
                const caseTitle = getCaseTitle(item.caseId ?? "");
                const SeverityIcon = getSeverityIcon(item.severity);
                const severityColor = getSeverityColor(item.severity);

                return (
                  <div key={item.id} className="relative flex gap-5 pb-8 group">
                    {/* Icon bubble */}
                    <div
                      className={cn(
                        "relative z-10 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border transition-all duration-200 group-hover:scale-110",
                        meta.bgColor,
                        meta.borderColor
                      )}
                    >
                      <Icon className={cn("h-3.5 w-3.5", meta.textColor)} />
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0 pt-0.5">
                      <div className="flex flex-wrap items-center gap-2 mb-1.5">
                        <span
                          className={cn(
                            "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest",
                            meta.bgColor,
                            meta.borderColor,
                            meta.textColor
                          )}
                        >
                          {meta.label}
                        </span>
                        {SeverityIcon && (
                          <span className={cn("flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest", severityColor)}>
                            <SeverityIcon className="h-3 w-3" />
                            {(item.severity ?? "info").toUpperCase()}
                          </span>
                        )}
                        <span className="text-[10px] font-mono text-muted-foreground/50 uppercase tracking-widest ml-auto">
                          {item.at}
                        </span>
                      </div>

                      <h4 className="text-sm font-bold tracking-tight text-foreground">
                        {item.title}
                      </h4>

                      {item.detail && (
                        <p className="mt-1 text-xs text-muted-foreground leading-relaxed max-w-2xl">
                          {item.detail}
                        </p>
                      )}

                      {(patientName || caseTitle || item.userName) && (
                        <div className="mt-2 flex flex-wrap items-center gap-4">
                          {item.userName && item.userName !== "System" && (
                            <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50">
                              <User className="h-3 w-3" />
                              {item.userName}
                            </span>
                          )}
                          {patientName && (
                            <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50">
                              <User className="h-3 w-3" />
                              {patientName}
                            </span>
                          )}
                          {caseTitle && (
                            <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50">
                              <Folder className="h-3 w-3" />
                              {caseTitle}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="py-20 text-center">
              <HistoryIcon className="h-12 w-12 text-muted-foreground/20 mx-auto mb-4" />
              <h3 className="text-lg font-bold">
                {history.length ? "No matching events" : "Audit log is empty"}
              </h3>
              <p className="text-sm text-muted-foreground mt-2 max-w-sm mx-auto">
                {history.length
                  ? "Try adjusting your search or filter criteria."
                  : "Clinical events will appear here as you interact with the workspace."}
              </p>
              {history.length > 0 && (query || typeFilter !== "All") && (
                <button
                  type="button"
                  onClick={() => { setQuery(""); setTypeFilter("All"); }}
                  className="mt-4 text-xs font-bold text-primary hover:underline"
                >
                  Clear filters
                </button>
              )}
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
