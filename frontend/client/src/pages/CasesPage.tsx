import React, { useState } from "react";
import { 
  FolderKanban, 
  Plus, 
  Search, 
  Filter, 
  MoreHorizontal, 
  ChevronRight, 
  Clock3, 
  LayoutGrid, 
  List,
  Target,
  BrainCircuit
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
  statusTone,
  completionForCase
} from "@/lib/clinical-utils";
import { 
  type CaseRecord, 
  type Patient 
} from "@/lib/mappers";
import { useLocation } from "wouter";
import { cn } from "@/lib/utils";

interface CasesPageProps {
  patients: Patient[];
  cases: CaseRecord[];
  activeCaseId: string;
  setActiveCaseId: (id: string) => void;
  onCreateCase: () => void;
}

export default function CasesPage({
  patients,
  cases,
  activeCaseId,
  setActiveCaseId,
  onCreateCase,
}: CasesPageProps) {
  const [, navigate] = useLocation();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<string>("All");
  const [view, setView] = useState<"grid" | "list">("grid");

  const filtered = cases.filter(c => {
    const matchesQuery = c.title.toLowerCase().includes(query.toLowerCase());
    const matchesFilter = filter === "All" || c.status === filter;
    return matchesQuery && matchesFilter;
  });

  const statusOptions = ["All", "Draft", "Image uploaded", "Calibrated", "AI completed", "Reviewing", "Reviewed", "Report ready"];

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <PageHeader
        eyebrow="Clinical Portfolio"
        title="Diagnostic Worklist"
        description="Monitor the progress of ongoing studies, from initial intake to final report generation."
        actions={
          <PrimaryBtn onClick={onCreateCase} icon={Plus}>
            New clinical case
          </PrimaryBtn>
        }
      />

      <Card noPadding className="overflow-visible border-border/40">
        <div className="flex flex-col gap-4 p-4 md:flex-row md:items-center md:justify-between border-b border-border/40 bg-muted/5">
           <div className="flex flex-1 items-center gap-4 max-w-2xl">
              <SearchInput 
                value={query} 
                onChange={setQuery} 
                placeholder="Search cases by title or ID..." 
                className="flex-1"
              />
              <div className="flex items-center gap-2">
                 <Filter className="h-4 w-4 text-muted-foreground" />
                 <select 
                   value={filter} 
                   onChange={(e) => setFilter(e.target.value)}
                   className="bg-transparent text-xs font-bold uppercase tracking-wider outline-none cursor-pointer text-muted-foreground hover:text-foreground transition-colors"
                 >
                    {statusOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                 </select>
              </div>
           </div>
           
           <div className="flex items-center gap-3">
              <div className="flex rounded-xl border border-border/60 bg-muted/20 p-1">
                <IconBtn 
                  icon={LayoutGrid} 
                  label="Grid view" 
                  onClick={() => setView("grid")} 
                  size="sm" 
                  active={view === "grid"} 
                />
                <IconBtn 
                  icon={List} 
                  label="List view" 
                  onClick={() => setView("list")} 
                  size="sm" 
                  active={view === "list"} 
                />
              </div>
           </div>
        </div>

        {view === "grid" ? (
          <div className="grid gap-6 p-6 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map(c => {
              const p = patients.find(x => x.id === c.patientId);
              const progress = completionForCase(c);
              const isActive = activeCaseId === c.id;

              return (
                <Card 
                  key={c.id} 
                  className={cn(
                    "group relative overflow-hidden transition-all hover:shadow-lg cursor-pointer",
                    isActive ? "border-primary/40 ring-1 ring-primary/20 bg-primary/[0.01]" : "border-border/40"
                  )}
                  onClick={() => setActiveCaseId(c.id)}
                >
                  <div className="flex items-start justify-between mb-4">
                     <div className="space-y-1">
                        <Pill tone={statusTone(c.status)} size="xs" className="font-bold uppercase tracking-widest">{c.status}</Pill>
                        <h3 className="font-bold text-lg leading-tight mt-2">{c.title}</h3>
                        <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                           <Clock3 className="h-3 w-3" />
                           Modified {c.updatedAt || c.date}
                        </p>
                     </div>
                     <div className="h-10 w-10 rounded-xl bg-muted/40 flex items-center justify-center text-muted-foreground">
                        <FolderKanban className="h-5 w-5" />
                     </div>
                  </div>

                  <div className="mt-8 space-y-4">
                     <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground font-medium">Patient</span>
                        <span className="font-bold">{p ? `${p.firstName} ${p.lastName}` : "Unknown"}</span>
                     </div>
                     <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground font-medium">Readiness</span>
                        <span className="font-bold text-primary">{progress}%</span>
                     </div>
                     <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                        <div 
                          className="h-full bg-primary transition-all duration-500" 
                          style={{ width: `${progress}%` }} 
                        />
                     </div>
                  </div>

                  <div className="mt-8 flex gap-2">
                     <PrimaryBtn 
                       onClick={(e) => { e.stopPropagation(); setActiveCaseId(c.id); navigate("/analysis"); }}
                       icon={Target}
                       className="flex-1 h-9 text-xs"
                     >
                        Open Workflow
                     </PrimaryBtn>
                  </div>
                </Card>
              );
            })}
          </div>
        ) : (
          <div className="overflow-x-auto">
             <table className="w-full text-left text-sm">
                <thead>
                   <tr className="border-b border-border/40 bg-muted/10 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                      <th className="px-6 py-4">Study Title</th>
                      <th className="px-6 py-4">Patient</th>
                      <th className="px-6 py-4">Status</th>
                      <th className="px-6 py-4">Completion</th>
                      <th className="px-6 py-4 text-right">Action</th>
                   </tr>
                </thead>
                <tbody className="divide-y divide-border/20">
                   {filtered.map(c => {
                     const p = patients.find(x => x.id === c.patientId);
                     const isActive = activeCaseId === c.id;
                     return (
                       <tr 
                         key={c.id} 
                         onClick={() => setActiveCaseId(c.id)}
                         className={cn(
                           "hover:bg-muted/20 cursor-pointer transition-colors group",
                           isActive && "bg-primary/[0.03]"
                         )}
                       >
                          <td className="px-6 py-4">
                             <div className="flex items-center gap-3">
                                <div className={cn("h-2 w-2 rounded-full", isActive ? "bg-primary" : "bg-transparent")} />
                                <span className="font-bold">{c.title}</span>
                             </div>
                          </td>
                          <td className="px-6 py-4 text-xs font-medium text-muted-foreground">
                             {p ? `${p.firstName} ${p.lastName}` : "---"}
                          </td>
                          <td className="px-6 py-4">
                             <Pill tone={statusTone(c.status)} size="xs">{c.status}</Pill>
                          </td>
                          <td className="px-6 py-4">
                             <div className="flex items-center gap-3">
                                <div className="h-1.5 w-16 rounded-full bg-muted overflow-hidden">
                                   <div className="h-full bg-primary" style={{ width: `${completionForCase(c)}%` }} />
                                </div>
                                <span className="text-[10px] font-bold text-muted-foreground">{completionForCase(c)}%</span>
                             </div>
                          </td>
                          <td className="px-6 py-4 text-right">
                             <IconBtn 
                               icon={ChevronRight} 
                               label="Open" 
                               onClick={() => navigate("/analysis")} 
                               size="sm"
                               className="group-hover:translate-x-1 transition-transform" 
                             />
                          </td>
                       </tr>
                     );
                   })}
                </tbody>
             </table>
          </div>
        )}

        {filtered.length === 0 && (
          <div className="py-20 text-center">
             <FolderKanban className="h-12 w-12 text-muted-foreground/20 mx-auto mb-4" />
             <h3 className="text-lg font-bold">No studies found</h3>
             <p className="text-sm text-muted-foreground mt-2">Try adjusting your filters or create a new clinical case.</p>
             <PrimaryBtn onClick={onCreateCase} icon={Plus} className="mt-6">Create study</PrimaryBtn>
          </div>
        )}
      </Card>
    </div>
  );
}
