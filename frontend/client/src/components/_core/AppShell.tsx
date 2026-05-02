import React, { useState, type ReactNode } from "react";
import {
  Stethoscope,
  Menu,
  X,
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
  Gauge,
  ChevronRight,
  Wifi,
  WifiOff,
  RefreshCw,
} from "lucide-react";
import { Link, useLocation } from "wouter";
import { ThemeToggle } from "./ClinicalComponents";
import { displayUserName, type ApiMode } from "@/lib/mappers";
import { type BackendAuthUser, type ServiceHealth } from "@/lib/ceph-api";
import { cn } from "@/lib/utils";

// ─── Navigation structure ─────────────────────────────────────────────────────

const NAV_SECTIONS = [
  {
    label: "Overview",
    items: [{ label: "Dashboard", href: "/", icon: Gauge }],
  },
  {
    label: "Records",
    items: [
      { label: "Patients", href: "/patients", icon: Users },
      { label: "Cases",    href: "/cases",    icon: FolderKanban },
    ],
  },
  {
    label: "Workflow",
    items: [
      { label: "Analysis",  href: "/analysis",  icon: Microscope },
      { label: "Calibrate", href: "/calibrate", icon: ScanLine },
      { label: "Viewer",    href: "/viewer",    icon: Activity },
      { label: "Results",   href: "/results",   icon: BarChart3 },
    ],
  },
  {
    label: "Outputs",
    items: [
      { label: "History", href: "/history", icon: History },
      { label: "Reports", href: "/reports", icon: FileText },
    ],
  },
  {
    label: "Account",
    items: [{ label: "Account", href: "/auth", icon: LockKeyhole }],
  },
];

// ─── Types ────────────────────────────────────────────────────────────────────

interface ShellProps {
  children: ReactNode;
  apiMode: ApiMode;
  authUser: BackendAuthUser | null;
  serviceHealth: ServiceHealth;
  onAuth: () => void;
  onLogout: () => void | Promise<void>;
  onRefreshHealth: () => void | Promise<void>;
}

// ─── Sidebar nav item ─────────────────────────────────────────────────────────

function NavItem({
  href,
  icon: Icon,
  label,
  active,
  onClick,
}: {
  href: string;
  icon: React.ElementType;
  label: string;
  active: boolean;
  onClick?: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group flex items-center gap-2.5 rounded-md px-3 py-2 text-[13px] font-medium transition-all duration-100",
        active
          ? "bg-sidebar-accent text-sidebar-foreground"
          : "text-sidebar-foreground/50 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground"
      )}
    >
      <Icon
        className={cn(
          "h-4 w-4 shrink-0 transition-colors",
          active ? "text-sidebar-primary" : "text-sidebar-foreground/40 group-hover:text-sidebar-foreground/70"
        )}
      />
      <span className="flex-1 truncate">{label}</span>
      {active && <ChevronRight className="h-3 w-3 text-sidebar-primary/60 shrink-0" />}
    </Link>
  );
}

// ─── Shell ────────────────────────────────────────────────────────────────────

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

  const isLive    = apiMode === "live";
  const isChecking = apiMode === "checking";

  const initials = authUser
    ? displayUserName(authUser)
        .split(" ")
        .filter(Boolean)
        .slice(0, 2)
        .map((p) => p[0]?.toUpperCase())
        .join("")
    : "G";

  const userName = authUser ? displayUserName(authUser) : "Guest";
  const userRole = authUser?.role ?? (authUser ? "Doctor" : "Not signed in");

  // ── Sidebar contents (shared between mobile drawer and desktop) ────────────
  const SidebarContent = () => (
    <>
      {/* Logo */}
      <div className="flex h-[60px] items-center gap-3 border-b border-sidebar-border px-4">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-sidebar-primary/15">
          <Stethoscope className="h-4 w-4 text-sidebar-primary" />
        </div>
        <div className="min-w-0">
          <p className="text-[13px] font-bold leading-tight text-sidebar-foreground">CephAI</p>
          <p className="text-[10px] font-medium text-sidebar-foreground/40 tracking-widest uppercase">Ortho Intelligence</p>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-4 px-2 space-y-5 [scrollbar-width:thin]">
        {NAV_SECTIONS.map((section) => (
          <div key={section.label}>
            <p className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-sidebar-foreground/30">
              {section.label}
            </p>
            <div className="space-y-px">
              {section.items.map((item) => {
                const active =
                  item.href === "/"
                    ? location === "/"
                    : location.startsWith(item.href);
                return (
                  <NavItem
                    key={item.href}
                    href={item.href}
                    icon={item.icon}
                    label={item.label}
                    active={active}
                    onClick={() => setMobileOpen(false)}
                  />
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* User footer */}
      <div className="border-t border-sidebar-border p-3 space-y-2">
        {/* User identity row */}
        <div className="flex items-center gap-2.5 rounded-md px-2 py-2">
          <div
            className={cn(
              "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-bold",
              authUser
                ? "bg-sidebar-primary/20 text-sidebar-primary"
                : "bg-sidebar-accent text-sidebar-foreground/50"
            )}
          >
            {initials}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[12px] font-semibold text-sidebar-foreground leading-tight">{userName}</p>
            <p className="truncate text-[10px] text-sidebar-foreground/40 leading-tight">{userRole}</p>
          </div>
          <button
            type="button"
            onClick={authUser ? onLogout : onAuth}
            aria-label={authUser ? "Sign out" : "Sign in"}
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-sidebar-foreground/40 hover:text-sidebar-foreground/70 transition-colors"
          >
            {authUser ? <LogOut className="h-3.5 w-3.5" /> : <LockKeyhole className="h-3.5 w-3.5" />}
          </button>
        </div>

        {/* Status row */}
        <div className="flex items-center justify-between px-2">
          <span className="text-[10px] font-medium text-sidebar-foreground/30 tracking-wide uppercase">v2.2</span>
          <button
            type="button"
            onClick={onRefreshHealth}
            className="flex items-center gap-1.5 text-[10px] font-medium transition-colors hover:text-sidebar-foreground/60"
          >
            {isLive ? (
              <><Wifi className="h-3 w-3 text-green-400" /><span className="text-green-400">Online</span></>
            ) : isChecking ? (
              <><RefreshCw className="h-3 w-3 animate-spin text-sidebar-foreground/40" /><span className="text-sidebar-foreground/40">Syncing</span></>
            ) : (
              <><WifiOff className="h-3 w-3 text-amber-400" /><span className="text-amber-400">Offline</span></>
            )}
          </button>
        </div>
      </div>
    </>
  );

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* ── Mobile header ─────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-border bg-background/95 px-4 backdrop-blur-sm lg:hidden">
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10">
            <Stethoscope className="h-4 w-4 text-primary" />
          </div>
          <span className="text-[14px] font-bold tracking-tight">CephAI</span>
        </div>
        <button
          type="button"
          aria-label={mobileOpen ? "Close menu" : "Open menu"}
          onClick={() => setMobileOpen((o) => !o)}
          className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
        >
          {mobileOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
        </button>
      </header>

      {/* ── Mobile backdrop ───────────────────────────────────────────────── */}
      {mobileOpen && (
        <button
          type="button"
          aria-label="Close navigation"
          onClick={() => setMobileOpen(false)}
          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm lg:hidden"
        />
      )}

      {/* ── Sidebar ───────────────────────────────────────────────────────── */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-[240px] flex-col bg-sidebar transition-transform duration-200 lg:translate-x-0",
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <SidebarContent />
      </aside>

      {/* ── Main area ─────────────────────────────────────────────────────── */}
      <div className="flex min-h-screen flex-col lg:pl-[240px]">
        {/* Topbar */}
        <header className="sticky top-0 z-30 hidden h-[60px] items-center justify-between border-b border-border bg-background/95 px-6 backdrop-blur-sm lg:flex">
          {/* Left: connection status */}
          <div className="flex items-center gap-3">
            <div
              className={cn(
                "flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[11px] font-semibold",
                isLive
                  ? "border-green-500/20 bg-green-500/8 text-green-600 dark:text-green-400"
                  : isChecking
                  ? "border-border bg-muted/50 text-muted-foreground"
                  : "border-amber-500/20 bg-amber-500/8 text-amber-600 dark:text-amber-400"
              )}
            >
              <span
                className={cn(
                  "h-1.5 w-1.5 rounded-full",
                  isLive ? "bg-green-500 animate-pulse" : isChecking ? "bg-muted-foreground" : "bg-amber-500"
                )}
              />
              {isLive ? "Connected" : isChecking ? "Syncing…" : "Disconnected"}
            </div>
            <span className="text-[12px] text-muted-foreground">CephAI Clinical Platform</span>
          </div>

          {/* Right: actions */}
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <button
              type="button"
              aria-label="Notifications"
              className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            >
              <Bell className="h-4 w-4" />
            </button>
            {authUser && (
              <button
                type="button"
                onClick={onLogout}
                className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-[12px] font-medium text-muted-foreground hover:border-border/80 hover:bg-muted/50 hover:text-foreground transition-all"
              >
                <LogOut className="h-3.5 w-3.5" />
                Sign out
              </button>
            )}
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 p-6 lg:p-8 max-w-[1440px] mx-auto w-full">
          {children}
        </main>

        {/* Footer */}
        <footer className="border-t border-border py-4 px-6 flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-[11px] text-muted-foreground">
            © 2026 Cephalometric Intelligence Platform. For professional clinical use only.
          </p>
          <div className="flex items-center gap-4">
            <Link href="/terms"   className="text-[11px] text-muted-foreground hover:text-foreground transition-colors">Terms</Link>
            <Link href="/privacy" className="text-[11px] text-muted-foreground hover:text-foreground transition-colors">Privacy</Link>
          </div>
        </footer>
      </div>
    </div>
  );
}
