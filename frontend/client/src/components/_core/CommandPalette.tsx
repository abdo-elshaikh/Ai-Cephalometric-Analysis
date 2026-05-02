import React, { useEffect, useState, useCallback } from "react";
import { useLocation } from "wouter";
import {
  Gauge, Users, FolderKanban, Microscope,
  Activity, BarChart3, History, FileText, Settings,
  BookOpen, LockKeyhole, BrainCircuit, UserPlus, Plus,
  ArrowRight, Search,
} from "lucide-react";
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandShortcut,
  CommandSeparator,
} from "@/components/ui/command";
import { type Patient, type CaseRecord } from "@/lib/mappers";
import { cn } from "@/lib/utils";

// ─── Navigation items ──────────────────────────────────────────────────────────

const NAV_ITEMS = [
  { label: "Dashboard",  href: "/",         icon: Gauge,        section: "Overview"  },
  { label: "Patients",   href: "/patients", icon: Users,        section: "Records"   },
  { label: "Cases",      href: "/cases",    icon: FolderKanban, section: "Records"   },
  { label: "Analysis",   href: "/analysis", icon: Microscope,   section: "Workflow"  },
  { label: "Viewer",     href: "/viewer",   icon: Activity,     section: "Workflow"  },
  { label: "Results",    href: "/results",  icon: BarChart3,    section: "Workflow"  },
  { label: "History",    href: "/history",  icon: History,      section: "Outputs"   },
  { label: "Reports",    href: "/reports",  icon: FileText,     section: "Outputs"   },
  { label: "Settings",   href: "/settings", icon: Settings,     section: "Platform"  },
  { label: "User Guide", href: "/guide",    icon: BookOpen,     section: "Platform"  },
  { label: "Account",    href: "/auth",     icon: LockKeyhole,  section: "Platform"  },
];

// ─── Props ─────────────────────────────────────────────────────────────────────

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  patients: Patient[];
  cases: CaseRecord[];
  onCreatePatient: () => void;
  onCreateCase: () => void;
}

// ─── Component ─────────────────────────────────────────────────────────────────

export default function CommandPalette({
  open,
  onClose,
  patients,
  cases,
  onCreatePatient,
  onCreateCase,
}: CommandPaletteProps) {
  const [, navigate] = useLocation();

  const go = useCallback(
    (href: string) => {
      navigate(href);
      onClose();
    },
    [navigate, onClose]
  );

  function handleSelect(fn: () => void) {
    fn();
    onClose();
  }

  const recentPatients = patients.slice(0, 5);
  const recentCases    = cases.slice(0, 5);

  return (
    <CommandDialog
      open={open}
      onOpenChange={(o) => { if (!o) onClose(); }}
      showCloseButton={false}
      className="max-w-[640px] border border-border/60 shadow-2xl"
    >
      <CommandInput placeholder="Search pages, patients, cases…" autoFocus />
      <CommandList className="max-h-[420px]">
        <CommandEmpty>
          <div className="flex flex-col items-center gap-2 py-8 text-muted-foreground">
            <Search className="h-8 w-8 opacity-20" />
            <p className="text-sm">No results found.</p>
          </div>
        </CommandEmpty>

        {/* Navigation */}
        <CommandGroup heading="Navigate">
          {NAV_ITEMS.map((item) => (
            <CommandItem
              key={item.href}
              value={`navigate ${item.label} ${item.section}`}
              onSelect={() => go(item.href)}
              className="gap-3 py-2.5"
            >
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-border/50 bg-muted/30">
                <item.icon className="h-3.5 w-3.5 text-muted-foreground" />
              </div>
              <div className="flex-1 min-w-0">
                <span className="font-medium text-sm">{item.label}</span>
                <span className="text-xs text-muted-foreground ml-2">{item.section}</span>
              </div>
              <ArrowRight className="h-3 w-3 text-muted-foreground/40 shrink-0" />
            </CommandItem>
          ))}
        </CommandGroup>

        {recentPatients.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Patients">
              {recentPatients.map((p) => (
                <CommandItem
                  key={p.id}
                  value={`patient ${p.firstName} ${p.lastName} ${p.mrn}`}
                  onSelect={() => go("/patients")}
                  className="gap-3 py-2.5"
                >
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary font-bold text-xs">
                    {p.firstName[0]}{p.lastName[0]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="font-medium text-sm">{p.firstName} {p.lastName}</span>
                    <span className="text-xs text-muted-foreground ml-2 font-mono">{p.mrn}</span>
                  </div>
                  <span className={cn(
                    "text-[10px] font-bold uppercase tracking-wider shrink-0",
                    p.status === "Active" ? "text-green-500" : "text-muted-foreground"
                  )}>
                    {p.status}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}

        {recentCases.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Cases">
              {recentCases.map((c) => {
                const patient = patients.find((p) => p.id === c.patientId);
                return (
                  <CommandItem
                    key={c.id}
                    value={`case ${c.title} ${c.type} ${c.status} ${patient?.lastName ?? ""}`}
                    onSelect={() => go("/cases")}
                    className="gap-3 py-2.5"
                  >
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-info/10">
                      <BrainCircuit className="h-3.5 w-3.5 text-info-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="font-medium text-sm truncate block">{c.title}</span>
                      {patient && (
                        <span className="text-xs text-muted-foreground">
                          {patient.firstName} {patient.lastName} · {c.type}
                        </span>
                      )}
                    </div>
                    <span className="text-[10px] text-muted-foreground shrink-0">{c.status}</span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </>
        )}

        <CommandSeparator />
        <CommandGroup heading="Quick Actions">
          <CommandItem
            value="create new patient register"
            onSelect={() => handleSelect(onCreatePatient)}
            className="gap-3 py-2.5"
          >
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-dashed border-border/60 bg-transparent">
              <UserPlus className="h-3.5 w-3.5 text-muted-foreground" />
            </div>
            <span className="font-medium text-sm">Register new patient</span>
            <CommandShortcut>⌘P</CommandShortcut>
          </CommandItem>
          <CommandItem
            value="create new case study"
            onSelect={() => handleSelect(onCreateCase)}
            className="gap-3 py-2.5"
          >
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-dashed border-border/60 bg-transparent">
              <Plus className="h-3.5 w-3.5 text-muted-foreground" />
            </div>
            <span className="font-medium text-sm">Create new case</span>
            <CommandShortcut>⌘N</CommandShortcut>
          </CommandItem>
          <CommandItem
            value="open viewer cephalometric"
            onSelect={() => go("/viewer")}
            className="gap-3 py-2.5"
          >
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-dashed border-border/60 bg-transparent">
              <Activity className="h-3.5 w-3.5 text-muted-foreground" />
            </div>
            <span className="font-medium text-sm">Open cephalometric viewer</span>
            <CommandShortcut>⌘V</CommandShortcut>
          </CommandItem>
        </CommandGroup>
      </CommandList>

      <div className="flex items-center justify-between border-t border-border/40 px-3 py-2 bg-muted/10">
        <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
          <span className="flex items-center gap-1"><kbd className="rounded border border-border/60 bg-muted/50 px-1 py-px font-mono text-[9px]">↑↓</kbd> navigate</span>
          <span className="flex items-center gap-1"><kbd className="rounded border border-border/60 bg-muted/50 px-1 py-px font-mono text-[9px]">↵</kbd> open</span>
          <span className="flex items-center gap-1"><kbd className="rounded border border-border/60 bg-muted/50 px-1 py-px font-mono text-[9px]">Esc</kbd> close</span>
        </div>
        <span className="text-[10px] text-muted-foreground/50">CephAI Command Palette</span>
      </div>
    </CommandDialog>
  );
}
