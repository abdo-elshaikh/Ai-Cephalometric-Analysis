import React from "react";
import { 
  FileText, 
  FileCheck2, 
  Eye, 
  Download, 
  Plus,
  RefreshCw,
  Search,
  Archive
} from "lucide-react";
import {
  Card,
  Pill,
  PrimaryBtn,
  SecondaryBtn,
  IconBtn,
  PageHeader,
  SearchInput,
  Divider
} from "@/components/_core/ClinicalComponents";
import { 
  type Report, 
  type CaseRecord, 
  type ReportFormat 
} from "@/lib/mappers";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

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
  onRequestReport 
}: ReportsPageProps) {
  
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

  function getReportTone(status: string) {
    if (status === "Ready" || status === "generated") return "success";
    if (status === "Pending" || status === "processing") return "warning";
    return "neutral";
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <PageHeader
        eyebrow="Clinical Documentation"
        title="Diagnostic Reports"
        description="Manage and export high-fidelity PDF and Word reports. Track generation status across all patient studies."
        actions={
          <div className="flex gap-2">
            <PrimaryBtn onClick={() => onRequestReport("PDF")} icon={FileText}>Generate PDF</PrimaryBtn>
            <SecondaryBtn onClick={() => onRequestReport("Word")} icon={FileCheck2}>Generate Word</SecondaryBtn>
          </div>
        }
      />

      {/* Target Case Context */}
      <Card className="border-primary/20 bg-primary/[0.02] flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between p-6">
        <div>
           <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-primary mb-1">Active Selection</p>
           <h3 className="text-xl font-bold tracking-tight">{activeCase?.title || "No Case Selected"}</h3>
           <p className="text-sm text-muted-foreground mt-1">Requesting a new export will target this clinical study.</p>
        </div>
        <Pill tone={activeCase?.reportStatus === "generated" ? "success" : "warning"} size="md">
           {activeCase?.reportStatus === "generated" ? "Export Ready" : "Generation Pending"}
        </Pill>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        {reports.length ? (
          reports.map(r => {
            const c = cases.find(x => x.id === r.caseId);
            return (
              <Card key={r.id} className="group hover:border-primary/30 transition-all">
                 <div className="flex items-start justify-between mb-6">
                    <div className="flex items-start gap-4">
                       <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-muted/40 text-muted-foreground border border-border/40 group-hover:bg-primary/10 group-hover:text-primary group-hover:border-primary/20 transition-all">
                          <FileText className="h-6 w-6" />
                       </div>
                       <div>
                          <h4 className="font-bold text-lg">{r.patientName}</h4>
                          <p className="text-sm text-muted-foreground">{c?.title || "Case " + r.caseId.slice(0, 8)}</p>
                       </div>
                    </div>
                    <Pill tone={getReportTone(r.status)} size="xs" className="font-bold uppercase tracking-widest">{r.format}</Pill>
                 </div>
                 
                 <div className="grid grid-cols-2 gap-3 mb-6">
                    <div className="p-3 rounded-xl bg-muted/20 border border-border/40">
                       <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1">Generated</p>
                       <p className="text-xs font-bold">{r.generatedAt}</p>
                    </div>
                    <div className="p-3 rounded-xl bg-muted/20 border border-border/40">
                       <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1">File Size</p>
                       <p className="text-xs font-bold">{r.size}</p>
                    </div>
                 </div>

                 <div className="flex gap-2">
                    <PrimaryBtn onClick={() => openReport(r, "preview")} icon={Eye} className="flex-1 bg-muted/40 text-foreground border border-border/40 hover:bg-muted/60 shadow-none">
                       Preview
                    </PrimaryBtn>
                    <SecondaryBtn onClick={() => openReport(r, "download")} icon={Download} className="flex-1">
                       Download
                    </SecondaryBtn>
                 </div>
              </Card>
            );
          })
        ) : (
          <div className="col-span-full py-20 text-center border-2 border-dashed border-border/40 rounded-3xl bg-muted/5">
             <Archive className="h-16 w-16 text-muted-foreground/20 mx-auto mb-4" />
             <h3 className="text-xl font-bold">No generated reports</h3>
             <p className="text-sm text-muted-foreground mt-2 max-w-sm mx-auto">
                Once you finalize a clinical review, the system will allow you to generate formal diagnostic reports.
             </p>
             <div className="mt-8 flex justify-center gap-3">
                <PrimaryBtn onClick={() => onRequestReport("PDF")} icon={FileText}>Start with PDF</PrimaryBtn>
             </div>
          </div>
        )}
      </div>
    </div>
  );
}
