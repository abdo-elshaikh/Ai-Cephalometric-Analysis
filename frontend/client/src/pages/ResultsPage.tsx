import React from "react";
import { 
  FileText, 
  FileCheck2, 
  Eye, 
  Download, 
  Sparkles, 
  Activity, 
  AlertTriangle, 
  ClipboardCheck 
} from "lucide-react";
import {
  Card,
  Pill,
  PrimaryBtn,
  SecondaryBtn,
  PageHeader,
  Divider,
  toneClasses
} from "@/components/_core/ClinicalComponents";
import { 
  type CaseRecord, 
  type Report, 
  type ClinicalArtifacts, 
  type ReportFormat 
} from "@/lib/mappers";
import { cn } from "@/lib/utils";

interface ResultsPageProps {
  activeCase?: CaseRecord;
  reports: Report[];
  artifacts: ClinicalArtifacts;
  onRequestReport: (f: ReportFormat) => void | Promise<void>;
}

export default function ResultsPage({
  activeCase,
  reports,
  artifacts,
  onRequestReport,
}: ResultsPageProps) {
  const { diagnosis, measurements, treatments } = artifacts;
  const caseReports = reports.filter(r => r.caseId === activeCase?.id);
  const confPct = Math.round((diagnosis.confidence || 0.85) * 100);

  function reportTone(status: string) {
    if (status === "Ready" || status === "generated") return "success";
    if (status === "Pending") return "warning";
    return "neutral";
  }

  function openReport(r: Report, intent: "preview" | "download") {
    if (!r.url) return;
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
        eyebrow="Diagnostic Output"
        title="Analysis Results"
        description="Review AI-generated skeletal classification, morphometric measurements, and ranked treatment plans."
        actions={
          <div className="flex gap-2">
            <PrimaryBtn onClick={() => onRequestReport("PDF")} icon={FileText}>Export PDF</PrimaryBtn>
            <SecondaryBtn onClick={() => onRequestReport("Word")} icon={FileCheck2}>Export Word</SecondaryBtn>
          </div>
        }
      />

      <div className="grid gap-8 xl:grid-cols-[1fr_1fr]">
        <div className="space-y-8">
          {/* Diagnosis Card */}
          <Card className="relative overflow-hidden group">
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-transparent" />
            <div className="flex items-start justify-between gap-3 mb-6">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-primary">Clinical Diagnosis</p>
                <h2 className="mt-2 text-2xl font-bold tracking-tight">{diagnosis.skeletalClass} Skeletal Pattern</h2>
              </div>
              <Pill tone="warning" className="bg-warning/5 border-warning/20">Requires Review</Pill>
            </div>
            
            <p className="text-sm text-muted-foreground leading-relaxed mb-8">{diagnosis.summary}</p>

            <div className="grid grid-cols-2 gap-4">
              {[
                { label: "Skeletal Class", value: `${diagnosis.skeletalClass} (${diagnosis.skeletalType || "Definitive"})`, tone: diagnosis.skeletalClass.includes("I") && !diagnosis.skeletalClass.includes("II") && !diagnosis.skeletalClass.includes("III") ? "success" : "warning" },
                { label: "Vertical Pattern", value: diagnosis.verticalPattern, tone: diagnosis.verticalPattern.toLowerCase().includes("normal") ? "success" : "warning" },
                { label: "Kim's APDI", value: diagnosis.apdi || "N/A", tone: diagnosis.apdi?.includes("I") ? "success" : "warning" },
                { label: "Kim's ODI", value: diagnosis.odi || "N/A", tone: diagnosis.odi?.includes("Balanced") ? "success" : "warning" },
                { label: "Soft Tissue", value: diagnosis.softTissueProfile, tone: "info" },
                { label: "AI Confidence", value: `${confPct}%`, tone: confPct >= 80 ? "success" : "warning" },
              ].map((item) => (
                <div key={item.label} className="p-4 rounded-xl border border-border/40 bg-muted/20">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2">{item.label}</p>
                  <Pill tone={item.tone as any} size="xs" className="font-bold">{item.value}</Pill>
                </div>
              ))}
            </div>

            {(diagnosis.warnings.length > 0 || diagnosis.clinicalNotes.length > 0) && (
              <div className="mt-8 space-y-4">
                {diagnosis.warnings.length > 0 && (
                  <div className="p-4 rounded-xl border border-warning/20 bg-warning/5">
                    <div className="flex items-center gap-2 mb-2 text-warning">
                       <AlertTriangle className="h-4 w-4" />
                       <span className="text-[10px] font-bold uppercase tracking-widest">Review Warnings</span>
                    </div>
                    <ul className="space-y-1">
                       {diagnosis.warnings.map(w => <li key={w} className="text-xs text-warning-foreground/80 leading-relaxed">• {w}</li>)}
                    </ul>
                  </div>
                )}
                {diagnosis.clinicalNotes.length > 0 && (
                  <div className="p-4 rounded-xl border border-primary/20 bg-primary/5">
                    <div className="flex items-center gap-2 mb-2 text-primary">
                       <ClipboardCheck className="h-4 w-4" />
                       <span className="text-[10px] font-bold uppercase tracking-widest">Clinical Annotations</span>
                    </div>
                    <ul className="space-y-1">
                       {diagnosis.clinicalNotes.map(n => <li key={n} className="text-xs text-primary-foreground/80 leading-relaxed">• {n}</li>)}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </Card>

          {/* Treatment Options */}
          <Card title="Treatment Planning">
             <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-bold tracking-tight">AI-Ranked Treatment Strategies</h3>
                <Pill tone="accent" size="xs">Machine Learning Assisted</Pill>
             </div>
             <div className="space-y-4">
                {treatments.map((t, i) => (
                  <div key={t.title} className="p-5 rounded-2xl border border-border/40 bg-muted/20 hover:border-primary/30 transition-colors">
                     <div className="flex items-start justify-between gap-4 mb-4">
                        <div className="flex items-center gap-3">
                           <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary font-bold text-sm">
                              {i + 1}
                           </div>
                           <h4 className="font-bold">{t.title}</h4>
                        </div>
                        <Pill tone={t.score >= 85 ? "success" : "warning"} size="xs">{t.score}% match</Pill>
                     </div>
                     <p className="text-xs text-muted-foreground leading-relaxed mb-4">{t.rationale}</p>
                     
                     <div className="flex flex-wrap gap-2">
                        <Pill tone="neutral" size="xs" className="bg-muted/40 uppercase tracking-tighter">{t.duration}</Pill>
                        <Pill tone={t.complexity === 'High' ? 'danger' : t.complexity === 'Moderate' ? 'warning' : 'success'} size="xs" className="uppercase tracking-tighter">{t.complexity} Complexity</Pill>
                     </div>
                  </div>
                ))}
             </div>
          </Card>
        </div>

        <div className="space-y-8">
           {/* Measurements Table */}
           <Card noPadding className="overflow-hidden">
              <div className="flex items-center justify-between p-6 border-b border-border/40">
                 <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-primary">Morphometrics</p>
                    <h3 className="text-lg font-bold tracking-tight">Measurement Analysis</h3>
                 </div>
                 <div className="flex items-center gap-2">
                    <Pill tone="neutral" size="xs">Steiner</Pill>
                    <Pill tone="neutral" size="xs">McNamara</Pill>
                 </div>
              </div>
              <div className="overflow-x-auto">
                 <table className="w-full text-left text-sm">
                    <thead>
                       <tr className="bg-muted/30 text-[10px] font-bold uppercase tracking-widest text-muted-foreground border-b border-border/40">
                          <th className="px-6 py-3">Code</th>
                          <th className="px-6 py-3">Parameter</th>
                          <th className="px-6 py-3">Result</th>
                          <th className="px-6 py-3">Normative</th>
                          <th className="px-6 py-3">Interpretation</th>
                       </tr>
                    </thead>
                    <tbody className="divide-y divide-border/20">
                       {measurements.map(m => (
                         <tr key={m.code} className="hover:bg-muted/10 transition-colors">
                            <td className="px-6 py-4 font-bold text-primary">{m.code}</td>
                            <td className="px-6 py-4 text-xs font-medium">{m.name}</td>
                            <td className="px-6 py-4 font-mono font-bold text-foreground">{m.value} {m.unit}</td>
                            <td className="px-6 py-4 text-xs text-muted-foreground">{m.normal}</td>
                            <td className="px-6 py-4">
                               <Pill tone={m.status === "Normal" ? "success" : m.severity === "Mild" ? "warning" : "danger"} size="xs" className="font-bold">
                                  {m.status}
                               </Pill>
                            </td>
                         </tr>
                       ))}
                    </tbody>
                 </table>
              </div>
           </Card>

           {/* Export Status */}
           <Card className="bg-muted/10">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                 <div>
                    <h4 className="font-bold text-sm">Clinical Report Status</h4>
                    <p className="text-xs text-muted-foreground mt-1">Status of generated exports for the active study.</p>
                 </div>
                 <div className="flex flex-wrap gap-2">
                    {caseReports.length ? caseReports.map(r => (
                      <Pill key={r.id} tone={reportTone(r.status)} size="sm">{r.format} · {r.status}</Pill>
                    )) : <Pill tone="warning" size="sm">No exports generated</Pill>}
                 </div>
              </div>
           </Card>
        </div>
      </div>
    </div>
  );
}
