import React, { useState } from "react";
import {
  UserPlus,
  Plus,
  Edit3,
  Trash2,
  LayoutGrid,
  List,
  ChevronRight,
  CalendarDays,
  Phone,
  Mail,
  Activity,
  FolderKanban,
} from "lucide-react";
import {
  Card,
  Pill,
  PrimaryBtn,
  IconBtn,
  PageHeader,
  SearchInput,
  Divider,
} from "@/components/_core/ClinicalComponents";
import { type Patient, type CaseRecord } from "@/lib/mappers";
import { cn } from "@/lib/utils";

// ─── Avatar color helper ───────────────────────────────────────────────────────

const AVATAR_PALETTES = [
  "bg-primary/20 text-primary",
  "bg-success/20 text-success-foreground",
  "bg-warning/20 text-warning-foreground",
  "bg-info/20 text-info-foreground",
  "bg-purple-500/20 text-purple-400",
  "bg-rose-500/20 text-rose-400",
  "bg-teal-500/20 text-teal-400",
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

// ─── Component ────────────────────────────────────────────────────────────────

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
    `${p.firstName} ${p.lastName} ${p.mrn} ${p.email} ${p.phone}`
      .toLowerCase()
      .includes(query.toLowerCase())
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
        {/* Toolbar */}
        <div className="flex flex-col gap-4 p-4 md:flex-row md:items-center md:justify-between border-b border-border/40">
          <SearchInput
            value={query}
            onChange={setQuery}
            placeholder="Search by name, MRN, or contact..."
            className="max-w-md flex-1"
          />
          <div className="flex items-center gap-3">
            <Pill tone="neutral" className="bg-muted/40 border-border/60">
              {filtered.length} Patient{filtered.length !== 1 ? "s" : ""}
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

        {/* Grid */}
        {view === "grid" ? (
          <div className="grid gap-4 p-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filtered.map(p => {
              const patientCases = cases.filter(c => c.patientId === p.id);
              const isActive = activePatientId === p.id;
              const palette = avatarPalette(`${p.firstName}${p.lastName}`);
              const lastCase = patientCases.sort(
                (a, b) => (b.updatedAt ?? b.date) > (a.updatedAt ?? a.date) ? 1 : -1
              )[0];

              return (
                <Card
                  key={p.id}
                  className={cn(
                    "group transition-all cursor-pointer p-5",
                    isActive
                      ? "border-primary bg-primary/[0.03] ring-1 ring-primary/20 shadow-md"
                      : "hover:border-primary/40 hover:shadow-md"
                  )}
                  onClick={() => setActivePatientId(p.id)}
                >
                  {/* Header row */}
                  <div className="flex items-start justify-between mb-4">
                    <div
                      className={cn(
                        "flex h-12 w-12 items-center justify-center rounded-2xl text-sm font-bold transition-transform group-hover:scale-105",
                        palette
                      )}
                    >
                      {p.firstName[0]}{p.lastName[0]}
                    </div>
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <IconBtn
                        icon={Edit3}
                        label="Edit"
                        onClick={(e: React.MouseEvent) => { e.stopPropagation(); onEdit(p); }}
                        size="sm"
                      />
                      <IconBtn
                        icon={Trash2}
                        label="Delete"
                        onClick={(e: React.MouseEvent) => { e.stopPropagation(); onDelete(p.id); }}
                        size="sm"
                        className="text-destructive hover:bg-destructive/10"
                      />
                    </div>
                  </div>

                  {/* Name + MRN */}
                  <h3 className="font-bold text-base leading-tight">
                    {p.firstName} {p.lastName}
                  </h3>
                  <p className="text-xs text-muted-foreground font-mono mt-0.5 uppercase tracking-wider">
                    {p.mrn}
                  </p>

                  {/* Meta chips */}
                  <div className="mt-3 flex flex-wrap items-center gap-1.5">
                    <Pill tone={patientStatusTone(p.status)} size="xs">
                      {p.status}
                    </Pill>
                    <span className="inline-flex items-center gap-1 rounded-full border border-border/40 bg-muted/30 px-2 py-0.5 text-[10px] font-bold text-muted-foreground">
                      {genderIcon(p.gender)} · {p.age}y
                    </span>
                  </div>

                  {/* Stats row */}
                  <div className="mt-4 grid grid-cols-2 gap-2 pt-4 border-t border-border/40">
                    <div className="flex items-center gap-1.5">
                      <FolderKanban className="h-3 w-3 text-muted-foreground" />
                      <span className="text-xs font-bold">{patientCases.length} Case{patientCases.length !== 1 ? "s" : ""}</span>
                    </div>
                    {lastCase ? (
                      <div className="flex items-center gap-1.5 justify-end">
                        <Activity className="h-3 w-3 text-muted-foreground" />
                        <span className="text-[10px] text-muted-foreground truncate">
                          {lastCase.status}
                        </span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5 justify-end">
                        <CalendarDays className="h-3 w-3 text-muted-foreground" />
                        <span className="text-[10px] text-muted-foreground">
                          {p.lastVisit || "No visit"}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Contact */}
                  {(p.email || p.phone) && (
                    <div className="mt-3 space-y-1">
                      {p.email && (
                        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground/70">
                          <Mail className="h-3 w-3" />
                          <span className="truncate">{p.email}</span>
                        </div>
                      )}
                      {p.phone && (
                        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground/70">
                          <Phone className="h-3 w-3" />
                          <span>{p.phone}</span>
                        </div>
                      )}
                    </div>
                  )}

                  <ChevronRight className="absolute bottom-4 right-4 h-4 w-4 text-muted-foreground/30 group-hover:text-primary group-hover:translate-x-1 transition-all" />
                </Card>
              );
            })}
          </div>
        ) : (
          /* List */
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border/40 bg-muted/10">
                  {["Patient", "MRN", "Age / Gender", "Contact", "Status", "Cases", "Last Visit", ""].map(h => (
                    <th key={h} className="px-5 py-3.5 font-bold uppercase tracking-widest text-[10px] text-muted-foreground">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border/20">
                {filtered.map(p => {
                  const isActive = activePatientId === p.id;
                  const palette = avatarPalette(`${p.firstName}${p.lastName}`);
                  return (
                    <tr
                      key={p.id}
                      className={cn(
                        "transition-colors group cursor-pointer",
                        isActive ? "bg-primary/[0.04]" : "hover:bg-muted/20"
                      )}
                      onClick={() => setActivePatientId(p.id)}
                    >
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-3">
                          <div
                            className={cn(
                              "h-8 w-8 rounded-lg flex items-center justify-center text-xs font-bold shrink-0",
                              palette
                            )}
                          >
                            {p.firstName[0]}{p.lastName[0]}
                          </div>
                          <span className="font-bold">{p.firstName} {p.lastName}</span>
                        </div>
                      </td>
                      <td className="px-5 py-3.5 font-mono text-xs text-muted-foreground">{p.mrn}</td>
                      <td className="px-5 py-3.5 text-xs font-medium">{p.age}y · {p.gender}</td>
                      <td className="px-5 py-3.5 text-xs text-muted-foreground">{p.email || p.phone || "—"}</td>
                      <td className="px-5 py-3.5">
                        <Pill tone={patientStatusTone(p.status)} size="xs">{p.status}</Pill>
                      </td>
                      <td className="px-5 py-3.5">
                        <span className="text-xs font-bold">{cases.filter(c => c.patientId === p.id).length}</span>
                      </td>
                      <td className="px-5 py-3.5 text-xs text-muted-foreground">{p.lastVisit || "—"}</td>
                      <td className="px-5 py-3.5 text-right">
                        <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <IconBtn
                            icon={Edit3}
                            label="Edit"
                            onClick={(e: React.MouseEvent) => { e.stopPropagation(); onEdit(p); }}
                            size="sm"
                          />
                          <IconBtn
                            icon={Trash2}
                            label="Delete"
                            onClick={(e: React.MouseEvent) => { e.stopPropagation(); onDelete(p.id); }}
                            size="sm"
                            className="text-destructive hover:bg-destructive/10"
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

        {/* Empty */}
        {filtered.length === 0 && (
          <div className="py-20 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted/30 mx-auto mb-4">
              <UserPlus className="h-8 w-8 text-muted-foreground/30" />
            </div>
            <h3 className="text-lg font-bold">
              {patients.length ? "No patients found" : "No patients registered"}
            </h3>
            <p className="text-sm text-muted-foreground mt-2 max-w-sm mx-auto">
              {patients.length
                ? "Try adjusting your search criteria or register a new patient."
                : "Start by registering your first patient to unlock the clinical workflow."}
            </p>
            <PrimaryBtn onClick={onCreate} icon={Plus} className="mt-6">
              Register patient
            </PrimaryBtn>
          </div>
        )}
      </Card>
    </div>
  );
}
