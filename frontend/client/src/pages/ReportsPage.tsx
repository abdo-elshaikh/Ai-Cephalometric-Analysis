import React, { useState } from "react";
import {
  FileText,
  FileCheck2,
  Eye,
  Download,
  Plus,
  Archive,
  Clock,
  CheckCircle2,
  Search,
  FileDown,
} from "lucide-react";
import {
  Card,
  Pill,
  PrimaryBtn,
  SecondaryBtn,
  IconBtn,
  PageHeader,
  SearchInput,
  SectionHeader,
} from "@/components/_core/ClinicalComponents";
import {
  type Report,
  type CaseRecord,
  type ReportFormat,
} from "@/lib/mappers";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatMeta(format: ReportFormat) {
  if (format === "PDF") {
    return {
      icon: FileText,
      label: "PDF",
      colorClass: "border-rose-500/20 bg-rose-500/10 text-rose-400",
    };
  }
  return {
    icon: FileCheck2,
    label: "Word",
    colorClass: "border-blue-500/20 bg-blue-500/10 text-blue-400",
  };
}

function statusMeta(status: string) {
  if (status === "Ready" || status === "generated") {
    return { label: "Ready", tone: "success" as const, icon: CheckCircle2 };
  }
  if (status === "Pending" || status === "processing") {
    return { label: "Pending", tone: "warning" as const, icon: Clock };
  }
  return { label: status, tone: "neutral" as const, icon: Clock };
}

// ─── Component ────────────────────────────────────────────────────────────────

interface ReportsPageProps {
  reports: Report[];
  cases: CaseRecord[];
  activeCase?: CaseRecord;
  onRequestReport: (f: ReportFormat) => void | Promise<void>;
}

export default function ReportsPage({
  reports,
  cases,
  activeCase,
  onRequestReport,
}: ReportsPageProps) {
  const [query, setQuery] = useState("");

  const filtered = reports.filter(r =>
    `${r.patientName} ${r.format} ${r.status}`.toLowerCase().includes(query.toLowerCase())
  );

  const pdfCount = reports.filter(r => r.format === "PDF").length;
  const wordCount = reports.filter(r => r.format === "Word").length;
  const pendingCount = reports.filter(r => r.status === "pending").length;
  const readyCount = reports.filter(r => r.status === "generated").length;

  function openReport(r: Report, intent: "preview" | "download") {
    if (!r.url) {
      toast.error("Resource URL not available. Regenerate via backend.");
      return;
    }
    if (intent === "download") {
      const a = document.createElement("a");
      a.href = r.url;
      a.download = `${r.patientName.replace(/\s+/g, "-").toLowerCase()}-${r.format.toLowerCase()}`;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      document.body.appendChild(a);
      a.click();
      a.remove();
      return;
    }
    window.open(r.url, "_blank", "noopener,noreferrer");
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <PageHeader
        eyebrow="Clinical Documentation"
        title="Diagnostic Reports"
        description="Manage and export high-fidelity PDF and Word reports. Track generation status across all patient studies."
        actions={
          <div className="flex gap-2">
            <PrimaryBtn onClick={() => onRequestReport("PDF")} icon={FileText}>
              Generate PDF
            </PrimaryBtn>
            <SecondaryBtn onClick={() => onRequestReport("Word")} icon={FileCheck2}>
              Generate Word
            </SecondaryBtn>
          </div>
        }
      />

      {/* Stats bar */}
      {reports.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: "Total",   value: reports.length, color: "bg-muted/40 border-border/60 text-foreground" },
            { label: "PDF",     value: pdfCount,       color: "bg-rose-500/10 border-rose-500/20 text-rose-400" },
            { label: "Word",    value: wordCount,      color: "bg-blue-500/10 border-blue-500/20 text-blue-400" },
            { label: "Ready",   value: readyCount,     color: "bg-success/10 border-success/20 text-success-foreground" },
          ].map(stat => (
            <div
              key={stat.label}
              className={cn(
                "flex items-center justify-between rounded-2xl border p-4",
                stat.color
              )}
            >
              <p className="text-[10px] font-bold uppercase tracking-widest opacity-70">
                {stat.label}
              </p>
              <p className="text-2xl font-bold tabular-nums">{stat.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Active case context */}
      <Card className="border-primary/20 bg-primary/[0.02]">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-primary mb-1">
              Active Selection
            </p>
            <h3 className="text-xl font-bold tracking-tight">
              {activeCase?.title ?? "No Case Selected"}
            </h3>
            <p className="text-sm text-muted-foreground mt-1">
              Requesting a new export will target this clinical study.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Pill
              tone={activeCase?.reportStatus === "generated" ? "success" : "warning"}
              size="md"
            >
              {activeCase?.reportStatus === "generated" ? "Export Ready" : "Generation Pending"}
            </Pill>
            <div className="flex gap-2">
              <SecondaryBtn
                onClick={() => onRequestReport("PDF")}
                icon={FileText}
                className="h-9 px-3 text-xs"
              >
                PDF
              </SecondaryBtn>
              <SecondaryBtn
                onClick={() => onRequestReport("Word")}
                icon={FileCheck2}
                className="h-9 px-3 text-xs"
              >
                Word
              </SecondaryBtn>
            </div>
          </div>
        </div>
      </Card>

      {/* Report list */}
      {reports.length > 0 && (
        <div className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <SectionHeader label={`${filtered.length} Report${filtered.length !== 1 ? "s" : ""}`} />
            <SearchInput
              value={query}
              onChange={setQuery}
              placeholder="Search by patient or format..."
              className="max-w-xs"
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            {filtered.map(r => {
              const c = cases.find(x => x.id === r.caseId);
              const fmt = formatMeta(r.format);
              const st = statusMeta(r.status);
              const FormatIcon = fmt.icon;
              const StatusIcon = st.icon;

              return (
                <Card key={r.id} className="group hover:border-primary/30 transition-all p-5">
                  <div className="flex items-start gap-4 mb-5">
                    {/* Format icon */}
                    <div
                      className={cn(
                        "flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border transition-all group-hover:scale-105",
                        fmt.colorClass
                      )}
                    >
                      <FormatIcon className="h-6 w-6" />
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="font-bold text-base leading-tight">{r.patientName}</h4>
                        <span
                          className={cn(
                            "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest",
                            fmt.colorClass
                          )}
                        >
                          {fmt.label}
                        </span>
                      </div>
                      <p className="text-sm text-muted-foreground mt-0.5">
                        {c?.title ?? `Case ${r.caseId.slice(0, 8)}`}
                      </p>
                    </div>

                    {/* Status */}
                    <Pill tone={st.tone} size="xs" className="shrink-0">
                      {st.label}
                    </Pill>
                  </div>

                  {/* Meta */}
                  <div className="grid grid-cols-2 gap-2 mb-5">
                    <div className="rounded-xl border border-border/40 bg-muted/20 p-3">
                      <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1">
                        Generated
                      </p>
                      <p className="text-xs font-bold">{r.generatedAt ?? "—"}</p>
                    </div>
                    <div className="rounded-xl border border-border/40 bg-muted/20 p-3">
                      <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1">
                        File Size
                      </p>
                      <p className="text-xs font-bold">{r.size ?? "—"}</p>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => openReport(r, "preview")}
                      className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-border/60 bg-muted/20 h-9 text-xs font-semibold transition-all hover:bg-muted/40 hover:border-border"
                    >
                      <Eye className="h-3.5 w-3.5" />
                      Preview
                    </button>
                    <button
                      type="button"
                      onClick={() => openReport(r, "download")}
                      className={cn(
                        "flex flex-1 items-center justify-center gap-2 rounded-xl border h-9 text-xs font-bold transition-all",
                        fmt.colorClass,
                        "hover:opacity-80"
                      )}
                    >
                      <FileDown className="h-3.5 w-3.5" />
                      Download
                    </button>
                  </div>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* Empty state */}
      {reports.length === 0 && (
        <div className="py-20 text-center border-2 border-dashed border-border/40 rounded-3xl bg-muted/5">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted/30 mx-auto mb-4">
            <Archive className="h-8 w-8 text-muted-foreground/30" />
          </div>
          <h3 className="text-xl font-bold">No generated reports</h3>
          <p className="text-sm text-muted-foreground mt-2 max-w-sm mx-auto">
            Once you finalize a clinical review, generate formal diagnostic reports in PDF or Word format.
          </p>
          <div className="mt-8 flex justify-center gap-3">
            <PrimaryBtn onClick={() => onRequestReport("PDF")} icon={FileText}>
              Start with PDF
            </PrimaryBtn>
            <SecondaryBtn onClick={() => onRequestReport("Word")} icon={FileCheck2}>
              Word Format
            </SecondaryBtn>
          </div>
        </div>
      )}
    </div>
  );
}
