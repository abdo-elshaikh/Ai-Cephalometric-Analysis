import React, { useState, type ReactNode } from "react";
import { 
  Stethoscope, 
  Menu, 
  ChevronRight, 
  LogOut, 
  LockKeyhole, 
  Bell, 
  Activity,
  Users,
  FolderKanban,
  Microscope,
  ScanLine,
  BarChart3,
  History,
  FileText,
  Gauge
} from "lucide-react";
import { Link, useLocation } from "wouter";
import { 
  IconBtn, 
  SecondaryBtn, 
  Pill, 
  ThemeToggle, 
  Divider 
} from "./ClinicalComponents";
import { useTheme } from "@/contexts/ThemeContext";
import { 
  displayUserName, 
  type ApiMode 
} from "@/lib/mappers";
import { 
  type BackendAuthUser, 
  type ServiceHealth 
} from "@/lib/ceph-api";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { label: "Dashboard", href: "/", icon: Gauge },
  { label: "Patients", href: "/patients", icon: Users },
  { label: "Cases", href: "/cases", icon: FolderKanban },
  { label: "Analysis", href: "/analysis", icon: Microscope },
  { label: "Calibrate", href: "/calibrate", icon: ScanLine },
  { label: "Viewer", href: "/viewer", icon: Activity },
  { label: "Results", href: "/results", icon: BarChart3 },
  { label: "History", href: "/history", icon: History },
  { label: "Reports", href: "/reports", icon: FileText },
  { label: "Account", href: "/auth", icon: LockKeyhole },
];

const NAV_SECTIONS = [
  { label: "Overview", items: NAV_ITEMS.slice(0, 1) },
  { label: "Records", items: NAV_ITEMS.slice(1, 3) },
  { label: "Workflow", items: NAV_ITEMS.slice(3, 7) },
  { label: "Outputs", items: NAV_ITEMS.slice(7, 9) },
  { label: "System", items: NAV_ITEMS.slice(9) },
];

interface ShellProps {
  children: ReactNode;
  apiMode: ApiMode;
  authUser: BackendAuthUser | null;
  serviceHealth: ServiceHealth;
  onAuth: () => void;
  onLogout: () => void | Promise<void>;
  onRefreshHealth: () => void | Promise<void>;
}

export default function Shell({
  children,
  apiMode,
  authUser,
  serviceHealth,
  onAuth,
  onLogout,
  onRefreshHealth,
}: ShellProps) {
  const [location] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  const connTone = apiMode === "live" ? "success" : apiMode === "checking" ? "accent" : "warning";
  const connLabel = apiMode === "live" ? "Live" : apiMode === "checking" ? "Sync" : "Offline";

  const initials = authUser
    ? displayUserName(authUser).split(" ").filter(Boolean).slice(0, 2).map(p => p[0]?.toUpperCase()).join("")
    : "GU";

  return (
    <div className="min-h-screen bg-background text-foreground transition-colors duration-300">
      {/* Background accents */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 overflow-hidden opacity-30 dark:opacity-100"
      >
        <div className="absolute -left-[10%] -top-[10%] h-[40%] w-[40%] rounded-full bg-primary/10 blur-[120px]" />
        <div className="absolute -right-[5%] top-[10%] h-[30%] w-[30%] rounded-full bg-success/5 blur-[100px]" />
      </div>
      {/* Subtle grid overlay */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 opacity-[0.035]"
        style={{
          backgroundImage: "linear-gradient(rgba(148,163,184,0.6) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,0.6) 1px, transparent 1px)",
          backgroundSize: "40px 40px",
        }}
      />

      {/* Header for mobile and desktop */}
      <header className="sticky top-0 z-40 w-full border-b border-border/40 bg-background/60 backdrop-blur-xl lg:hidden">
        <div className="flex h-16 items-center justify-between px-4">
          <div className="flex items-center gap-3">
             <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Stethoscope className="h-5 w-5" />
             </div>
             <span className="font-bold tracking-tight">CephAI</span>
          </div>
          <IconBtn icon={Menu} label="Menu" onClick={() => setMobileOpen(true)} variant="outline" size="sm" />
        </div>
      </header>

      {/* Mobile overlay */}
      {mobileOpen && (
        <button
          type="button"
          aria-label="Close navigation"
          onClick={() => setMobileOpen(false)}
          className="fixed inset-0 z-40 bg-background/70 backdrop-blur-sm lg:hidden"
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-[280px] flex-col border-r border-border/40 bg-card/95 backdrop-blur-2xl transition-transform duration-300 lg:translate-x-0",
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {/* Logo */}
        <div className="relative overflow-hidden border-b border-border/40 p-6">
          <div className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full bg-primary/10 blur-2xl" />
          <div className="relative flex items-center justify-between gap-3">
            <Link href="/" onClick={() => setMobileOpen(false)} className="flex items-center gap-3 group">
              <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 transition-transform group-hover:scale-105">
                <Stethoscope className="h-5 w-5 text-primary" />
                <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-card bg-success animate-pulse" />
              </div>
              <div>
                <p className="text-[15px] font-bold leading-tight tracking-tight text-foreground">CephAI</p>
                <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-muted-foreground">Ortho Intelligence</p>
              </div>
            </Link>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto p-3 [scrollbar-width:thin]">
          <div className="space-y-5">
            {NAV_SECTIONS.map(section => (
              <div key={section.label}>
                <p className="mb-2 px-3 text-[10px] font-bold uppercase tracking-[0.24em] text-muted-foreground/60">{section.label}</p>
                <div className="space-y-0.5">
                  {section.items.map(item => {
                    const Icon = item.icon;
                    const active = item.href === "/" ? location === "/" : location.startsWith(item.href);
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={() => setMobileOpen(false)}
                        aria-current={active ? "page" : undefined}
                        className={cn(
                          "group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-all duration-150",
                          active
                            ? "bg-primary/10 text-primary"
                            : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                        )}
                      >
                        {active && <span className="absolute inset-y-1.5 left-0 w-0.5 rounded-r-full bg-primary" />}
                        <span
                          className={cn(
                            "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border transition-all duration-150",
                            active ? "border-primary/25 bg-primary/15 text-primary" : "border-border/40 bg-muted/20 text-muted-foreground group-hover:text-foreground"
                          )}
                        >
                          <Icon className="h-3.5 w-3.5" />
                        </span>
                        <span className="flex-1 font-medium">{item.label}</span>
                        {active && <ChevronRight className="h-3.5 w-3.5 text-primary/60" />}
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </nav>

        {/* User footer */}
        <div className="border-t border-border/40 p-3 space-y-2">
          <div className="flex items-center gap-3 rounded-xl border border-border/40 bg-muted/20 p-3">
            <div className={cn(
              "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-sm font-bold",
              authUser ? "bg-primary/20 text-primary" : "bg-muted/40 text-muted-foreground"
            )}>
              {initials}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-foreground">{authUser ? displayUserName(authUser) : "Guest"}</p>
              <p className="truncate text-xs text-muted-foreground">{authUser ? `${authUser.role ?? "Doctor"}` : "Sign in for access"}</p>
            </div>
            <IconBtn
              icon={authUser ? LogOut : LockKeyhole}
              label={authUser ? "Sign out" : "Sign in"}
              onClick={authUser ? onLogout : onAuth}
              variant="outline"
              size="sm"
            />
          </div>

          <div className="flex items-center justify-between px-2 text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground/60">
            <span>Platform v2.4</span>
            <span className={cn(
              "flex items-center gap-1",
              serviceHealth.backend.ok ? "text-success" : "text-warning"
            )}>
              <span className={cn("h-1.5 w-1.5 rounded-full", serviceHealth.backend.ok ? "bg-success" : "bg-warning")} />
              {serviceHealth.backend.ok ? "Online" : "Offline"}
            </span>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex flex-1 flex-col lg:pl-[280px]">
        {/* Topbar desktop */}
        <header className="sticky top-0 z-30 hidden h-16 border-b border-border/40 bg-background/60 backdrop-blur-xl lg:block">
          <div className="flex h-full items-center justify-between px-8">
            <div className="flex items-center gap-4">
               <Pill tone={connTone} size="sm" className="bg-muted/30">
                  Network: {connLabel}
               </Pill>
               <Divider className="h-4 w-px bg-border/40" />
               <p className="text-xs font-medium text-muted-foreground">
                 Clinical AI Engine Active
               </p>
            </div>
            <div className="flex items-center gap-3">
               <ThemeToggle />
               <IconBtn icon={Bell} label="Notifications" variant="outline" size="sm" />
               <SecondaryBtn onClick={onLogout} icon={LogOut} className="h-9 px-3 text-xs">
                 Logout
               </SecondaryBtn>
            </div>
          </div>
        </header>

        <main className="flex-1 p-6 lg:p-8 xl:p-10 max-w-[1600px] mx-auto w-full">
          {children}
        </main>

        <footer className="border-t border-border/40 py-6 px-8 flex flex-col md:flex-row items-center justify-between gap-4">
           <p className="text-xs text-muted-foreground font-medium">
             © 2026 Cephalometric Intelligence. For professional use only.
           </p>
           <div className="flex items-center gap-4">
             <Link href="/terms" className="text-xs text-muted-foreground hover:text-primary transition-colors">Terms</Link>
             <Link href="/privacy" className="text-xs text-muted-foreground hover:text-primary transition-colors">Privacy</Link>
           </div>
        </footer>
      </div>
    </div>
  );
}
