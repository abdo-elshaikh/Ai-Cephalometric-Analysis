import React, { useState } from "react";
import { 
  UserPlus, 
  Search, 
  Plus, 
  Edit3, 
  Trash2, 
  LayoutGrid, 
  List, 
  MoreHorizontal,
  ChevronRight,
  Database
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
import { type Patient, type CaseRecord } from "@/lib/mappers";
import { cn } from "@/lib/utils";

interface PatientsPageProps {
  patients: Patient[];
  cases: CaseRecord[];
  activePatientId: string | null;
  onCreate: () => void;
  onEdit: (p: Patient) => void;
  onDelete: (id: string) => void;
  setActivePatientId: (id: string) => void;
}

export default function PatientsPage({
  patients,
  cases,
  activePatientId,
  onCreate,
  onEdit,
  onDelete,
  setActivePatientId,
}: PatientsPageProps) {
  const [query, setQuery] = useState("");
  const [view, setView] = useState<"grid" | "list">("grid");

  const filtered = patients.filter(p => 
    `${p.firstName} ${p.lastName} ${p.mrn} ${p.email}`.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <PageHeader
        eyebrow="Clinical Registry"
        title="Patient Management"
        description="Search, create, and manage clinical patient records and their associated diagnostic studies."
        actions={
          <PrimaryBtn onClick={onCreate} icon={UserPlus}>
            Register new patient
          </PrimaryBtn>
        }
      />

      <Card noPadding className="border-border/40 overflow-visible">
        <div className="flex flex-col gap-4 p-4 md:flex-row md:items-center md:justify-between border-b border-border/40">
           <SearchInput 
             value={query} 
             onChange={setQuery} 
             placeholder="Search by name, MRN, or email..." 
             className="max-w-md flex-1"
           />
           <div className="flex items-center gap-3">
              <Pill tone="neutral" className="bg-muted/40 border-border/60">
                 {filtered.length} Patients
              </Pill>
              <Divider className="h-4 w-px bg-border/40" />
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
          <div className="grid gap-4 p-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filtered.map(p => {
              const patientCases = cases.filter(c => c.patientId === p.id);
              const isActive = activePatientId === p.id;
              return (
                <Card 
                  key={p.id} 
                  className={cn(
                    "group transition-all cursor-pointer",
                    isActive ? "border-primary bg-primary/[0.03] ring-1 ring-primary/20 shadow-md" : "hover:border-primary/40 hover:shadow-md"
                  )}
                  onClick={() => setActivePatientId(p.id)}
                >
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors duration-300">
                       <span className="text-lg font-bold">{p.firstName[0]}{p.lastName[0]}</span>
                    </div>
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                       <IconBtn icon={Edit3} label="Edit" onClick={(e: any) => { e.stopPropagation(); onEdit(p); }} size="sm" />
                       <IconBtn icon={Trash2} label="Delete" onClick={(e: any) => { e.stopPropagation(); onDelete(p.id); }} size="sm" className="text-destructive hover:bg-destructive/10" />
                    </div>
                  </div>
                  <h3 className="font-bold text-lg leading-tight">{p.firstName} {p.lastName}</h3>
                  <p className="text-xs text-muted-foreground font-mono mt-1 uppercase tracking-wider">{p.mrn}</p>
                  
                  <div className="mt-6 flex items-center justify-between">
                     <div className="flex items-center gap-2">
                        <Database className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="text-xs font-medium">{patientCases.length} Cases</span>
                     </div>
                     <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:translate-x-1 transition-transform" />
                  </div>
                </Card>
              );
            })}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border/40 bg-muted/10">
                  <th className="px-6 py-4 font-bold uppercase tracking-widest text-[10px] text-muted-foreground">Patient</th>
                  <th className="px-6 py-4 font-bold uppercase tracking-widest text-[10px] text-muted-foreground">MRN</th>
                  <th className="px-6 py-4 font-bold uppercase tracking-widest text-[10px] text-muted-foreground">Contact</th>
                  <th className="px-6 py-4 font-bold uppercase tracking-widest text-[10px] text-muted-foreground">Studies</th>
                  <th className="px-6 py-4 text-right font-bold uppercase tracking-widest text-[10px] text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/20">
                {filtered.map(p => {
                  const isActive = activePatientId === p.id;
                  return (
                    <tr 
                      key={p.id} 
                      className={cn(
                        "transition-colors group cursor-pointer",
                        isActive ? "bg-primary/[0.05] border-l-2 border-l-primary" : "hover:bg-muted/20"
                      )}
                      onClick={() => setActivePatientId(p.id)}
                    >
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center text-xs font-bold">
                           {p.firstName[0]}{p.lastName[0]}
                        </div>
                        <span className="font-bold">{p.firstName} {p.lastName}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 font-mono text-xs text-muted-foreground">{p.mrn}</td>
                    <td className="px-6 py-4 text-xs">{p.email || p.phone || "-"}</td>
                    <td className="px-6 py-4">
                       <Pill tone="accent" size="xs" className="bg-primary/5">{cases.filter(c => c.patientId === p.id).length} Cases</Pill>
                    </td>
                    <td className="px-6 py-4 text-right">
                       <div className="flex justify-end gap-1">
                          <IconBtn icon={Edit3} label="Edit" onClick={(e: any) => { e.stopPropagation(); onEdit(p); }} size="sm" />
                          <IconBtn icon={Trash2} label="Delete" onClick={(e: any) => { e.stopPropagation(); onDelete(p.id); }} size="sm" className="text-destructive hover:bg-destructive/10" />
                       </div>
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
             <Search className="h-12 w-12 text-muted-foreground/20 mx-auto mb-4" />
             <h3 className="text-lg font-bold">No patients found</h3>
             <p className="text-sm text-muted-foreground mt-2">Try adjusting your search criteria or register a new patient.</p>
             <PrimaryBtn onClick={onCreate} icon={Plus} className="mt-6">Register patient</PrimaryBtn>
          </div>
        )}
      </Card>
    </div>
  );
}
