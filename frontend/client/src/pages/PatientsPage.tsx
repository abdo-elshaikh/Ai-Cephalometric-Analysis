import React, { useState } from "react";
import {
  UserPlus, Plus, Edit3, Trash2, LayoutGrid, List,
  ChevronRight, CalendarDays, Phone, Mail, Activity,
  FolderKanban, BrainCircuit, ScanLine, ChevronDown,
  Microscope, Search, SearchIcon, Zap, Filter,
  ArrowUpDown,
} from "lucide-react";
import {
  Card, Pill, PrimaryBtn, SecondaryBtn, IconBtn,
  PageHeader, SearchInput, Divider,
} from "@/components/_core/ClinicalComponents";
import { type Patient, type CaseRecord } from "@/lib/mappers";
import { statusTone } from "@/lib/clinical-utils";
import { useLocation } from "wouter";
import { cn } from "@/lib/utils";

// ─── Avatar color helper ───────────────────────────────────────────────────────

const AVATAR_PALETTES = [
  "bg-primary/10 text-primary border-primary/20",
  "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
  "bg-amber-500/10 text-amber-500 border-amber-500/20",
  "bg-sky-500/10 text-sky-500 border-sky-500/20",
  "bg-violet-500/10 text-violet-500 border-violet-500/20",
  "bg-rose-500/10 text-rose-500 border-rose-500/20",
  "bg-teal-500/10 text-teal-500 border-teal-500/20",
] as const;

function avatarPalette(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_PALETTES[Math.abs(hash) % AVATAR_PALETTES.length];
}

function genderIcon(gender: string) {
  if (gender === "Male") return "M";
  if (gender === "Female") return "F";
  return "–";
}

function patientStatusTone(status: string): "success" | "warning" | "neutral" {
  if (status === "Active") return "success";
  if (status === "Review") return "warning";
  return "neutral";
}

// ─── Patient Cases Panel ──────────────────────────────────────────────────────

function PatientCasesPanel({
  patient,
  cases,
  onNavigate,
}: {
  patient: Patient;
  cases: CaseRecord[];
  onNavigate: (href: string) => void;
}) {
  const patientCases = cases.filter(c => c.patientId === patient.id);

  return (
    <div className="mt-6 border-t border-border/20 pt-6 space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
      {/* Contact row */}
      <div className="grid grid-cols-2 gap-4 text-[11px] font-medium">
        {patient.email && (
          <div className="flex items-center gap-2 text-muted-foreground group/mail cursor-pointer hover:text-primary transition-colors">
            <Mail className="h-3 w-3 shrink-0 opacity-40 group-hover/mail:opacity-100" />
            <span className="truncate">{patient.email}</span>
          </div>
        )}
        {patient.phone && (
          <div className="flex items-center gap-2 text-muted-foreground group/phone cursor-pointer hover:text-primary transition-colors">
            <Phone className="h-3 w-3 shrink-0 opacity-40 group-hover/phone:opacity-100" />
            <span>{patient.phone}</span>
          </div>
        )}
        <div className="flex items-center gap-2 text-muted-foreground col-span-2">
          <CalendarDays className="h-3 w-3 shrink-0 opacity-40" />
          <span>Last clinical engagement: <span className="font-bold text-foreground/70">{patient.lastVisit || "No visit detected"}</span></span>
        </div>
      </div>

      {/* Cases */}
      <div className="space-y-2">
        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/50">Clinical Studies</p>
        {patientCases.length > 0 ? (
          <div className="space-y-2">
            {patientCases.slice(0, 3).map(c => (
              <div
                key={c.id}
                className="group/study flex items-center justify-between gap-4 p-3 rounded-2xl border border-border/40 bg-muted/20 hover:bg-muted/40 transition-all hover-lift"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-black truncate group-hover/study:text-primary transition-colors">{c.title}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <Pill tone={statusTone(c.status)} size="xs">{c.status}</Pill>
                    <span className="text-[10px] font-bold text-muted-foreground/60 uppercase">{c.type}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {c.aiStatus === "completed" && (
                    <button
                      type="button"
                      onClick={() => onNavigate("/results")}
                      className="flex h-8 w-8 items-center justify-center rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20 transition-all shadow-sm"
                      title="View Analysis Results"
                    >
                      <BrainCircuit className="h-4 w-4" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => onNavigate("/viewer")}
                    className="flex h-8 w-8 items-center justify-center rounded-xl border border-border/40 bg-card text-muted-foreground hover:border-primary/40 hover:text-primary transition-all shadow-sm"
                    title="Open Clinical Viewer"
                  >
                    <ScanLine className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
            {patientCases.length > 3 && (
              <p className="text-[10px] font-black text-muted-foreground/40 italic pl-2 tracking-widest">
                +{patientCases.length - 3} ADDITIONAL SHELLS
              </p>
            )}
          </div>
        ) : (
          <div className="py-4 text-center border-2 border-dashed border-border/20 rounded-2xl bg-muted/10">
            <p className="text-[10px] font-black text-muted-foreground/40 uppercase tracking-widest">No active studies</p>
          </div>
        )}
      </div>

      {/* Quick action */}
      <PrimaryBtn
        onClick={() => onNavigate("/analysis")}
        icon={Microscope}
        className="w-full h-10 text-xs font-black uppercase tracking-widest justify-center hover-lift"
      >
        Initialize Analysis
      </PrimaryBtn>
    </div>
  );
}

// ─── PatientsPage Component ──────────────────────────────────────────────────

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
  patients, cases, activePatientId,
  onCreate, onEdit, onDelete, setActivePatientId,
}: PatientsPageProps) {
  const [, navigate] = useLocation();
  const [query, setQuery] = useState("");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const filtered = patients.filter(p =>
    `${p.firstName} ${p.lastName} ${p.mrn} ${p.email} ${p.phone}`
      .toLowerCase()
      .includes(query.toLowerCase())
  );

  function handlePatientClick(patientId: string) {
    setActivePatientId(patientId);
    setExpandedId(prev => prev === patientId ? null : patientId);
  }

  return (
    <div className="min-h-screen bg-background text-foreground selection:bg-primary/30">
      {/* ── Ambient background ── */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-60 -left-40 w-[800px] h-[800px] rounded-full bg-primary/5 blur-[120px] animate-pulse duration-[12s]" />
        <div className="absolute top-1/4 -right-40 w-[600px] h-[600px] rounded-full bg-teal-500/5 blur-[100px] animate-pulse duration-[10s]" />
        <div
          className="absolute inset-0 opacity-[0.02]"
          style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg width='40' height='40' viewBox='0 0 40 40' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='%2394a3b8' fill-opacity='1'%3E%3Cpath d='M0 0h1v1H0zm39 0h1v1h-1zm0 39h1v1h-1zM0 39h1v1H0z'/%3E%3C/g%3E%3C/svg%3E\")" }}
        />
      </div>

      <div className="relative z-10 space-y-10 p-6 md:p-8 lg:p-10 max-w-[1600px] mx-auto animate-in fade-in slide-in-from-bottom-4 duration-700">

        {/* ── Page header ── */}
        <div className="flex flex-col gap-8 md:flex-row md:items-end md:justify-between">
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="h-1.5 w-8 rounded-full bg-gradient-to-r from-primary to-emerald-400" />
              <span className="text-xs font-black uppercase tracking-[0.25em] text-primary/80">
                Clinical Registry
              </span>
            </div>
            <h1 className="text-4xl font-black tracking-tight text-gradient-primary md:text-5xl">
              Patient Management
            </h1>
            <p className="text-muted-foreground max-w-2xl text-lg leading-relaxed font-medium">
              Maintain high-fidelity diagnostic records and orchestrate clinical flow for your patient population.
            </p>
          </div>
          
          <div className="flex items-center gap-4 shrink-0 bg-card/30 backdrop-blur-md p-2 rounded-2xl border border-border/40 shadow-sm-professional">
            <PrimaryBtn 
              onClick={onCreate} 
              icon={UserPlus}
              className="hover-lift shadow-lg shadow-primary/20"
            >
              Register Patient
            </PrimaryBtn>
          </div>
        </div>

        {/* ── Registry Container ── */}
        <div className="glass-premium rounded-[32px] overflow-hidden border border-border/40 shadow-lg-professional group hover-glow transition-all duration-700">
          {/* Toolbar */}
          <div className="flex flex-col gap-6 p-6 md:flex-row md:items-center md:justify-between border-b border-border/20 bg-muted/10">
            <div className="relative max-w-md flex-1">
              <SearchInput
                value={query}
                onChange={setQuery}
                placeholder="Query name, MRN, or clinical ID..."
                className="w-full"
              />
            </div>
            <div className="flex items-center gap-4">
              <div className="bg-background/60 px-4 py-2 rounded-2xl border border-border/40 flex items-center gap-3">
                <span className="flex h-2 w-2 rounded-full bg-primary animate-pulse" />
                <span className="text-xs font-black tabular-nums tracking-wider uppercase">
                  {filtered.length} Population Count
                </span>
              </div>
              <Divider className="h-6 w-px bg-border/20 mx-2" />
              <div className="flex rounded-2xl border border-border/40 bg-muted/30 p-1.5 shadow-inner-sm">
                <button
                  onClick={() => setView("grid")}
                  className={cn(
                    "flex h-9 w-9 items-center justify-center rounded-xl transition-all duration-300",
                    view === "grid" ? "bg-background text-primary shadow-sm ring-1 ring-border/20" : "text-muted-foreground/40 hover:text-foreground"
                  )}
                >
                  <LayoutGrid className="h-4 w-4" />
                </button>
                <button
                  onClick={() => setView("list")}
                  className={cn(
                    "flex h-9 w-9 items-center justify-center rounded-xl transition-all duration-300",
                    view === "list" ? "bg-background text-primary shadow-sm ring-1 ring-border/20" : "text-muted-foreground/40 hover:text-foreground"
                  )}
                >
                  <List className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>

          {/* Grid View */}
          {view === "grid" ? (
            <div className="grid gap-6 p-8 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {filtered.map(p => {
                const patientCases = cases.filter(c => c.patientId === p.id);
                const isActive = activePatientId === p.id;
                const isExpanded = expandedId === p.id;
                const palette = avatarPalette(`${p.firstName}${p.lastName}`);
                const lastCase = patientCases.sort(
                  (a, b) => (b.updatedAt ?? b.date) > (a.updatedAt ?? a.date) ? 1 : -1
                )[0];

                return (
                  <Card
                    key={p.id}
                    className={cn(
                      "group relative transition-all duration-500 cursor-pointer overflow-hidden p-6 hover-lift",
                      isActive
                        ? "border-primary/50 bg-primary/5 ring-1 ring-primary/10 shadow-lg shadow-primary/5"
                        : "border-border/40 bg-card/20 hover:border-primary/30 hover:bg-card/40"
                    )}
                    onClick={() => handlePatientClick(p.id)}
                  >
                    {/* Header row */}
                    <div className="flex items-start justify-between mb-6">
                      <div
                        className={cn(
                          "flex h-14 w-14 items-center justify-center rounded-2xl text-base font-black transition-all duration-500 border group-hover:scale-110 shadow-sm",
                          palette
                        )}
                      >
                        {p.firstName[0]}{p.lastName[0]}
                      </div>
                      <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-all duration-300 translate-y-[-10px] group-hover:translate-y-0">
                        <IconBtn
                          icon={Edit3}
                          label="Edit Profile"
                          onClick={(e: React.MouseEvent) => { e.stopPropagation(); onEdit(p); }}
                          variant="outline"
                          size="sm"
                          className="rounded-xl border-border/60 hover:border-primary/40 hover:text-primary transition-all"
                        />
                        <IconBtn
                          icon={Trash2}
                          label="Archive Patient"
                          onClick={(e: React.MouseEvent) => { e.stopPropagation(); onDelete(p.id); }}
                          variant="outline"
                          size="sm"
                          className="rounded-xl border-border/60 hover:border-destructive/40 hover:text-destructive transition-all"
                        />
                      </div>
                    </div>

                    {/* Name + MRN */}
                    <div className="space-y-1">
                      <h3 className="font-black text-xl tracking-tight transition-colors group-hover:text-primary">
                        {p.firstName} {p.lastName}
                      </h3>
                      <div className="flex items-center gap-2 text-[10px] font-black text-muted-foreground uppercase tracking-[0.15em] opacity-50">
                        <Zap className="h-2.5 w-2.5" />
                        {p.mrn}
                      </div>
                    </div>

                    {/* Meta chips */}
                    <div className="mt-5 flex flex-wrap items-center gap-2">
                      <Pill tone={patientStatusTone(p.status)} size="xs">
                        {p.status}
                      </Pill>
                      <span className="inline-flex items-center gap-2 rounded-full border border-border/40 bg-muted/20 px-3 py-1 text-[10px] font-black text-muted-foreground/60 uppercase tracking-tighter">
                        {genderIcon(p.gender)} · {p.age} YEARS
                      </span>
                    </div>

                    {/* Stats row */}
                    <div className="mt-6 flex items-center justify-between pt-6 border-t border-border/20">
                      <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/5 text-primary border border-primary/10">
                          <FolderKanban className="h-4 w-4" />
                        </div>
                        <span className="text-xs font-black tracking-tight">{patientCases.length} Studies</span>
                      </div>
                      
                      {lastCase ? (
                        <div className="flex items-center gap-2 text-right">
                          <Pill tone={statusTone(lastCase.status)} size="xs">
                            {lastCase.status}
                          </Pill>
                        </div>
                      ) : (
                        <div className="flex flex-col items-end gap-0.5">
                          <span className="text-[9px] font-black text-muted-foreground/40 uppercase tracking-widest">NO PRIOR STUDY</span>
                        </div>
                      )}
                    </div>

                    {/* Expandable detail */}
                    {isExpanded && (
                      <PatientCasesPanel
                        patient={p}
                        cases={cases}
                        onNavigate={href => {
                          setActivePatientId(p.id);
                          navigate(href);
                        }}
                      />
                    )}

                    {/* Expand indicator */}
                    <div className="flex items-center justify-center mt-6">
                      <div className={cn(
                        "flex items-center justify-center h-6 w-12 rounded-full bg-muted/20 text-muted-foreground/30 transition-all duration-300",
                        isExpanded ? "bg-primary/10 text-primary rotate-180" : "group-hover:text-primary/40 group-hover:bg-muted/40"
                      )}>
                        <ChevronDown className="h-4 w-4" />
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          ) : (
            /* List View */
            <div className="overflow-x-auto [scrollbar-width:thin]">
              <table className="w-full text-left text-sm border-separate border-spacing-0">
                <thead>
                  <tr className="border-b border-border/20 bg-muted/20">
                    {["Patient Identity", "Medical Record", "Demographics", "Digital Engagement", "Status", "Clinical Studies", "Actions"].map(h => (
                      <th key={h} className="px-8 py-5 font-black uppercase tracking-[0.2em] text-[10px] text-muted-foreground/60 border-b border-border/20">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/10">
                  {filtered.map(p => {
                    const isActive = activePatientId === p.id;
                    const palette = avatarPalette(`${p.firstName}${p.lastName}`);
                    const patientCases = cases.filter(c => c.patientId === p.id);
                    return (
                      <tr
                        key={p.id}
                        className={cn(
                          "transition-all duration-300 group cursor-pointer",
                          isActive ? "bg-primary/[0.04]" : "hover:bg-muted/10"
                        )}
                        onClick={() => setActivePatientId(p.id)}
                      >
                        <td className="px-8 py-5">
                          <div className="flex items-center gap-4">
                            <div
                              className={cn(
                                "h-10 w-10 rounded-xl flex items-center justify-center text-xs font-black border transition-transform duration-300 group-hover:scale-110 shadow-sm",
                                palette
                              )}
                            >
                              {p.firstName[0]}{p.lastName[0]}
                            </div>
                            <span className="font-black tracking-tight group-hover:text-primary transition-colors text-base">{p.firstName} {p.lastName}</span>
                          </div>
                        </td>
                        <td className="px-8 py-5">
                          <div className="flex items-center gap-2 text-[11px] font-black text-muted-foreground/60 font-mono tracking-widest bg-muted/40 px-3 py-1 rounded-full w-fit">
                            {p.mrn}
                          </div>
                        </td>
                        <td className="px-8 py-5">
                          <span className="text-xs font-black tracking-tight uppercase opacity-70">{p.age}y · {p.gender}</span>
                        </td>
                        <td className="px-8 py-5">
                          <div className="space-y-1">
                            <p className="text-xs font-bold text-muted-foreground truncate max-w-[150px]">{p.email || "—"}</p>
                            <p className="text-[10px] font-black text-muted-foreground/40">{p.phone || "—"}</p>
                          </div>
                        </td>
                        <td className="px-8 py-5">
                          <Pill tone={patientStatusTone(p.status)} size="xs">{p.status}</Pill>
                        </td>
                        <td className="px-8 py-5">
                          <div className="flex items-center gap-3">
                            <span className="text-sm font-black tabular-nums">{patientCases.length}</span>
                            <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-primary/5 border border-primary/10 text-primary">
                              <FolderKanban className="h-3 w-3" />
                            </div>
                          </div>
                        </td>
                        <td className="px-8 py-5">
                          <div className="flex justify-end gap-3 opacity-0 group-hover:opacity-100 transition-all duration-300 translate-x-4 group-hover:translate-x-0">
                            <button
                              type="button"
                              onClick={e => { e.stopPropagation(); setActivePatientId(p.id); navigate("/analysis"); }}
                              className="flex h-10 items-center gap-3 px-5 rounded-2xl border border-primary/30 bg-primary/5 text-[10px] font-black uppercase tracking-[0.15em] text-primary hover:bg-primary/10 hover:border-primary/50 transition-all shadow-sm"
                            >
                              <Microscope className="h-4 w-4" />
                              Analyze
                            </button>
                            <IconBtn
                              icon={Edit3}
                              label="Edit"
                              onClick={(e: React.MouseEvent) => { e.stopPropagation(); onEdit(p); }}
                              variant="outline"
                              size="md"
                              className="rounded-2xl border-border/60 hover:border-primary/40 hover:text-primary transition-all shadow-sm"
                            />
                            <IconBtn
                              icon={Trash2}
                              label="Delete"
                              onClick={(e: React.MouseEvent) => { e.stopPropagation(); onDelete(p.id); }}
                              variant="outline"
                              size="md"
                              className="rounded-2xl border-border/60 hover:border-destructive/40 hover:text-destructive transition-all shadow-sm"
                            />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Empty State */}
          {filtered.length === 0 && (
            <div className="py-24 text-center">
              <div className="flex h-24 w-24 items-center justify-center rounded-[32px] bg-muted/20 border-2 border-dashed border-border/20 mx-auto mb-8 shadow-inner-lg">
                <UserPlus className="h-10 w-10 text-muted-foreground/20" />
              </div>
              <h3 className="text-2xl font-black tracking-tight mb-3">
                {patients.length ? "Precision Query Failed" : "Registry Vacant"}
              </h3>
              <p className="text-sm text-muted-foreground mt-2 max-w-sm mx-auto font-medium leading-relaxed mb-10">
                {patients.length
                  ? "Refine your clinical parameters or verify the Medical Record Number (MRN) syntax."
                  : "Initialize your patient population to unlock advanced cephalometric diagnostics and AI flow."}
              </p>
              <PrimaryBtn onClick={onCreate} icon={Plus} className="h-12 px-10 text-xs font-black uppercase tracking-widest shadow-xl shadow-primary/20 hover-lift">
                Register New Entity
              </PrimaryBtn>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const ChevronDownIcon = ({ className }: { className?: string }) => (
  <svg className={className} width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M4 6L8 10L12 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);
