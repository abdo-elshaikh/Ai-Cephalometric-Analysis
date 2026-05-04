import React, { useState } from "react";
import {
  FileText, FileCheck2, Eye, Download, Plus, Archive, Clock, CheckCircle2,
  Search, FileDown, Sparkles, TrendingUp, ArrowRight, Layers, Layout,
  Printer, Share2, Mail, ExternalLink, Zap,
} from "lucide-react";
import {
  Card, Pill, PrimaryBtn, SecondaryBtn, IconBtn, PageHeader, SearchInput, SectionHeader, Divider, TextInput,
} from "@/components/_core/ClinicalComponents";
import {
  type Report, type CaseRecord, type ReportFormat,
} from "@/lib/mappers";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatMeta(format: ReportFormat) {
  if (format === "PDF") {
    return {
      icon: FileText,
      label: "Portable Document",
      ext: "PDF",
      colorClass: "border-rose-500/20 bg-rose-500/10 text-rose-500 shadow-rose-500/10",
      accent: "bg-rose-500",
    };
  }
  return {
    icon: FileCheck2,
    label: "Clinical Spreadsheet",
    ext: "DOCX",
    colorClass: "border-sky-500/20 bg-sky-500/10 text-sky-500 shadow-sky-500/10",
    accent: "bg-sky-500",
  };
}

function statusMeta(status: string) {
  if (status === "Ready" || status === "generated") {
    return { label: "Synchronized", tone: "success" as const, icon: CheckCircle2 };
  }
  if (status === "Pending" || status === "processing") {
    return { label: "Processing Engine", tone: "warning" as const, icon: Clock };
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
  reports, cases, activeCase, onRequestReport,
}: ReportsPageProps) {
  const [query, setQuery] = useState("");

  const filtered = reports.filter(r =>
    `${r.patientName} ${r.format} ${r.status}`.toLowerCase().includes(query.toLowerCase())
  );

  const pdfCount = reports.filter(r => r.format === "PDF").length;
  const wordCount = reports.filter(r => r.format === "Word").length;
  const readyCount = reports.filter(r => r.status === "generated").length;

  function openReport(r: Report, intent: "preview" | "download") {
    if (!r.url) {
      toast.error("Telemetry resource unavailable. Regenerate diagnostic artifact.");
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
    <div className="min-h-screen bg-background text-foreground selection:bg-primary/30 pb-20 animate-in fade-in duration-700">
      
      {/* ── Ambient background ── */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-60 -left-40 w-[800px] h-[800px] rounded-full bg-primary/5 blur-[120px] animate-pulse duration-[12s]" />
        <div className="absolute bottom-0 -right-40 w-[600px] h-[600px] rounded-full bg-rose-500/5 blur-[100px] animate-pulse duration-[10s]" />
      </div>

      <div className="relative z-10 space-y-10 p-6 md:p-8 lg:p-10 max-w-[1600px] mx-auto">
        
        {/* ── Page header ── */}
        <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="h-1.5 w-8 rounded-full bg-gradient-to-r from-primary to-rose-400" />
              <span className="text-xs font-black uppercase tracking-[0.25em] text-primary/80">
                Diagnostic Synthesis
              </span>
            </div>
            <h1 className="text-4xl font-black tracking-tight text-gradient-primary md:text-5xl">
              Clinical Reports
            </h1>
            <p className="text-muted-foreground font-medium max-w-2xl leading-relaxed">
              Export and manage high-fidelity cephalometric reports. These artifacts contain complete biometric measurements, skeletal projections, and etiological summaries.
            </p>
          </div>
          
          <div className="flex items-center gap-3 shrink-0 bg-card/30 backdrop-blur-md p-2 rounded-2xl border border-border/40 shadow-sm-professional">
            <PrimaryBtn onClick={() => onRequestReport("PDF")} icon={FileText} className="h-11 px-8 font-black uppercase tracking-widest text-[10px] shadow-lg shadow-rose-500/20 bg-rose-500 hover:bg-rose-600 transition-all hover-lift">
              Generate PDF
            </PrimaryBtn>
            <SecondaryBtn onClick={() => onRequestReport("Word")} icon={FileCheck2} className="h-11 px-8 font-black uppercase tracking-widest text-[10px] hover-lift">
              Export Word
            </SecondaryBtn>
          </div>
        </div>

        {/* ── KPI Grid ── */}
        <div className="grid grid-cols-2 gap-6 lg:grid-cols-4">
           {[
            { label: "Total Reports", value: reports.length, icon: Archive, accent: "bg-primary" },
            { label: "PDF Documents", value: pdfCount, icon: FileText, accent: "bg-rose-500" },
            { label: "Word Exports", value: wordCount, icon: FileCheck2, accent: "bg-sky-500" },
            { label: "Production Ready", value: readyCount, icon: CheckCircle2, accent: "bg-emerald-500" },
          ].map(stat => (
            <Card key={stat.label} className="p-8 glass-premium hover-glow shadow-md-professional border-border/40">
               <div className="flex items-center justify-between">
                 <div className="space-y-1">
                   <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60">{stat.label}</p>
                   <p className="text-3xl font-black tabular-nums">{stat.value}</p>
                 </div>
                 <div className={cn("h-12 w-12 rounded-2xl flex items-center justify-center text-white shadow-xl transition-all duration-500", stat.accent)}>
                   <stat.icon className="h-6 w-6" />
                 </div>
               </div>
            </Card>
          ))}
        </div>

        {/* ── Active Session Context ── */}
        <Card className="p-10 glass-premium border-primary/20 bg-primary/[0.03] shadow-lg-professional relative overflow-hidden group">
           <div className="absolute top-0 right-0 p-10 opacity-[0.03] group-hover:scale-125 group-hover:rotate-12 transition-transform duration-1000">
             <Layers className="h-40 w-40" />
           </div>
           <div className="flex flex-col gap-8 lg:flex-row lg:items-center lg:justify-between relative z-10">
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="h-2 w-2 rounded-full bg-primary animate-pulse" />
                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-primary">Target Session Context</span>
              </div>
              <h3 className="text-3xl font-black tracking-tight leading-tight">
                {activeCase?.title ?? "Awaiting Study Selection"}
              </h3>
              <p className="text-sm text-muted-foreground font-medium opacity-70">
                New clinical artifacts will be synchronized with the active biometric model for this patient study.
              </p>
            </div>
            <div className="flex items-center gap-4 shrink-0">
               <div className="bg-background/40 backdrop-blur-md p-2 rounded-2xl border border-border/20 shadow-sm flex items-center gap-2">
                 <button onClick={() => onRequestReport("PDF")} className="h-12 px-6 rounded-xl bg-rose-500 text-white text-[10px] font-black uppercase tracking-widest shadow-lg shadow-rose-500/20 hover:scale-105 transition-all">Request PDF</button>
                 <button onClick={() => onRequestReport("Word")} className="h-12 px-6 rounded-xl bg-sky-500 text-white text-[10px] font-black uppercase tracking-widest shadow-lg shadow-sky-500/20 hover:scale-105 transition-all">Request Word</button>
               </div>
               <div className={cn("px-6 py-3 rounded-2xl border font-black uppercase tracking-widest text-[10px]", activeCase?.reportStatus === "generated" ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-500" : "bg-amber-500/10 border-amber-500/20 text-amber-500")}>
                  {activeCase?.reportStatus === "generated" ? "Pipeline Complete" : "Pipeline Idle"}
               </div>
            </div>
          </div>
        </Card>

        {/* ── Report Directory ── */}
        <div className="space-y-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-center justify-between">
            <div className="space-y-1">
              <h2 className="text-2xl font-black tracking-tight">Clinical Repository</h2>
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-widest opacity-60">{filtered.length} Artifacts Indexed</p>
            </div>
            <div className="relative group w-full max-w-md">
              <Search className="absolute left-5 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground/40 group-focus-within:text-primary transition-colors" />
              <TextInput
                value={query}
                onChange={setQuery}
                placeholder="Query repository by patient, study, or format..."
                className="pl-14 h-14 rounded-2xl border-border/40 bg-card/40 backdrop-blur-md focus:ring-primary/20 shadow-sm"
              />
            </div>
          </div>

          <div className="grid gap-8 lg:grid-cols-2">
            {filtered.map((r, idx) => {
              const c = cases.find(x => x.id === r.caseId);
              const fmt = formatMeta(r.format);
              const st = statusMeta(r.status);
              const FormatIcon = fmt.icon;

              return (
                <div key={r.id} style={{ animationDelay: `${idx * 50}ms` }}>
                <Card className="group p-0 overflow-hidden glass-premium hover-glow transition-all duration-700 hover-lift shadow-lg-professional border-border/40 flex flex-col animate-in fade-in slide-in-from-bottom-4">
                  <div className="p-8 space-y-6">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-5">
                        <div className={cn("h-16 w-16 rounded-[24px] border-2 flex items-center justify-center transition-all duration-700 group-hover:scale-110 group-hover:rotate-3", fmt.colorClass)}>
                          <FormatIcon className="h-8 w-8" />
                        </div>
                        <div>
                          <div className="flex items-center gap-3">
                             <h4 className="text-xl font-black tracking-tight">{r.patientName}</h4>
                             <Pill tone={st.tone} size="xs" className="font-black uppercase tracking-widest text-[9px]">{st.label}</Pill>
                          </div>
                          <p className="text-xs font-black uppercase tracking-widest text-muted-foreground/40 mt-1">{c?.title ?? `STUDY-${r.caseId.slice(0, 8).toUpperCase()}`}</p>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <span className="text-[10px] font-black text-muted-foreground/30 uppercase tracking-widest">Type</span>
                        <span className={cn("text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-lg text-white", fmt.accent)}>{fmt.ext}</span>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="p-4 rounded-2xl bg-muted/10 border border-border/10 space-y-1">
                        <span className="text-[9px] font-black text-muted-foreground/40 uppercase tracking-widest">Generation Latency</span>
                        <p className="text-xs font-black text-foreground/80">{r.generatedAt ?? "Synchronizing..."}</p>
                      </div>
                      <div className="p-4 rounded-2xl bg-muted/10 border border-border/10 space-y-1">
                        <span className="text-[9px] font-black text-muted-foreground/40 uppercase tracking-widest">Payload Size</span>
                        <p className="text-xs font-black text-foreground/80">{r.size ?? "Calculating..."}</p>
                      </div>
                    </div>
                  </div>

                  <div className="px-8 py-6 border-t border-border/20 bg-muted/5 group-hover:bg-muted/10 transition-colors mt-auto flex items-center gap-3">
                    <button
                      onClick={() => openReport(r, "preview")}
                      className="flex-1 h-11 rounded-xl bg-background border border-border/40 flex items-center justify-center gap-3 group/btn hover:border-primary/40 transition-all text-[10px] font-black uppercase tracking-widest text-foreground/60"
                    >
                      <Eye className="h-4 w-4 text-muted-foreground/30 group-hover/btn:text-primary transition-all" />
                      Visual Preview
                    </button>
                    <button
                      onClick={() => openReport(r, "download")}
                      className={cn("flex-1 h-11 rounded-xl flex items-center justify-center gap-3 text-white text-[10px] font-black uppercase tracking-widest shadow-lg transition-all hover:opacity-90 hover-lift", fmt.accent, fmt.accent === "bg-rose-500" ? "shadow-rose-500/20" : "shadow-sky-500/20")}
                    >
                      <FileDown className="h-4 w-4" />
                      Download Artifact
                    </button>
                  </div>
                </Card>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Empty State ── */}
        {reports.length === 0 && (
          <div className="py-40 text-center">
            <div className="flex h-24 w-24 items-center justify-center rounded-[32px] bg-muted/10 border-2 border-dashed border-border/20 mx-auto mb-8 shadow-inner-lg">
              <Archive className="h-10 w-10 text-muted-foreground/20" />
            </div>
            <h3 className="text-2xl font-black tracking-tight mb-3">Diagnostic Vault Empty</h3>
            <p className="text-sm text-muted-foreground max-w-sm mx-auto font-medium leading-relaxed">
              Formal clinical reports are generated post-finalization. Initialize the diagnostic synthesis pipeline to produce official artifacts.
            </p>
            <div className="mt-12 flex justify-center gap-4">
              <button onClick={() => onRequestReport("PDF")} className="h-12 px-10 rounded-2xl bg-rose-500 text-white font-black uppercase tracking-widest text-[10px] shadow-xl shadow-rose-500/20 hover:scale-105 transition-all">Initialize PDF</button>
              <button onClick={() => onRequestReport("Word")} className="h-12 px-10 rounded-2xl border border-border/40 bg-card/40 backdrop-blur-md font-black uppercase tracking-widest text-[10px] hover:bg-muted/10 transition-all">Request DOCX</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
