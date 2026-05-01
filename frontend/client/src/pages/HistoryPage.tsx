import React from "react";
import { 
  Activity, 
  CalendarClock, 
  History as HistoryIcon,
  Search,
  Filter,
  User,
  Folder
} from "lucide-react";
import {
  Card,
  Pill,
  PageHeader,
  SearchInput,
  Divider,
  SecondaryBtn
} from "@/components/_core/ClinicalComponents";
import { 
  type TimelineItem, 
  type CaseRecord, 
  type Patient 
} from "@/lib/mappers";
import { cn } from "@/lib/utils";

interface HistoryPageProps {
  history: TimelineItem[];
  cases: CaseRecord[];
  patients: Patient[];
}

export default function HistoryPage({ 
  history, 
  cases, 
  patients 
}: HistoryPageProps) {
  
  function getPatientName(id: string) {
    const p = patients.find(x => x.id === id);
    return p ? `${p.firstName} ${p.lastName}` : "Unknown Patient";
  }

  function getCaseTitle(id: string) {
    const c = cases.find(x => x.id === id);
    return c ? c.title : "General System Event";
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <PageHeader
        eyebrow="Clinical Audit Trail"
        title="Event History"
        description="A comprehensive, chronological log of all clinical interactions, AI processing events, and database modifications."
      />

      <Card noPadding className="overflow-visible">
         <div className="flex flex-col gap-4 p-4 md:flex-row md:items-center md:justify-between border-b border-border/40">
           <SearchInput 
             value="" 
             onChange={() => {}} 
             placeholder="Filter history by event or patient..." 
             className="max-w-md flex-1"
           />
           <div className="flex items-center gap-3">
              <SecondaryBtn icon={Filter} className="h-9 px-3 text-xs">Filter by Type</SecondaryBtn>
              <Pill tone="neutral" className="bg-muted/40 border-border/60">
                 {history.length} Events Total
              </Pill>
           </div>
        </div>

        <div className="p-6">
          {history.length ? (
            <div className="relative space-y-0">
               {/* Vertical line for the timeline */}
               <div className="absolute left-6 top-0 bottom-0 w-px bg-border/40" />
               
               {history.map((item, i) => (
                 <div key={item.id} className="relative pl-14 pb-10 group">
                    {/* Timeline dot */}
                    <div className="absolute left-[21px] top-1 h-2.5 w-2.5 rounded-full bg-border border-2 border-background z-10 group-hover:bg-primary transition-colors" />
                    
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                       <div className="space-y-2 flex-1">
                          <div className="flex items-center gap-3">
                             <Pill tone="accent" size="xs" className="font-bold tracking-widest uppercase py-0 px-2">{item.type}</Pill>
                             <span className="text-xs font-mono text-muted-foreground uppercase tracking-widest">{item.at}</span>
                          </div>
                          <h4 className="text-lg font-bold tracking-tight">{item.title}</h4>
                          <p className="text-sm text-muted-foreground leading-relaxed max-w-2xl">{item.detail}</p>
                          
                          <div className="flex flex-wrap gap-4 mt-4 pt-2">
                             <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">
                                <User className="h-3 w-3" />
                                {getPatientName(item.patientId || "")}
                             </div>
                             <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">
                                <Folder className="h-3 w-3" />
                                {getCaseTitle(item.caseId || "")}
                             </div>
                          </div>
                       </div>
                       
                       <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-muted/30 border border-border/40 text-muted-foreground group-hover:text-primary group-hover:border-primary/20 transition-all">
                          <CalendarClock className="h-6 w-6" />
                       </div>
                    </div>
                 </div>
               ))}
            </div>
          ) : (
            <div className="py-20 text-center">
               <HistoryIcon className="h-12 w-12 text-muted-foreground/20 mx-auto mb-4" />
               <h3 className="text-lg font-bold">Audit log is empty</h3>
               <p className="text-sm text-muted-foreground mt-2">Clinical events will appear here as you interact with the workspace.</p>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
