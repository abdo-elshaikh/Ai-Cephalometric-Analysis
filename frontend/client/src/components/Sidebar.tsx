import { useMemo, useState } from "react";

import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import {
  Activity,
  BarChart3,
  BrainCircuit,
  ChevronRight,
  FileText,
  FolderKanban,
  History,
  Home,
  LogOut,
  Menu,
  Microscope,
  Sparkles,
  Stethoscope,
  Users,
  Wifi,
  WifiOff,
  X,
  Zap,
} from "lucide-react";
import { Link, useLocation } from "wouter";

interface NavItem {
  label: string;
  icon: typeof Home;
  path: string;
  hint: string;
  eyebrow: string;
}

const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", icon: Home, path: "/", hint: "KPIs and clinical activity", eyebrow: "Command" },
  { label: "Patients", icon: Users, path: "/patients", hint: "Profiles and case readiness", eyebrow: "Registry" },
  { label: "Cases", icon: FolderKanban, path: "/cases", hint: "Case progression and handoffs", eyebrow: "Workflow" },
  { label: "Analysis", icon: Microscope, path: "/analysis", hint: "Upload and orchestrate AI runs", eyebrow: "Intake" },
  { label: "Results", icon: BarChart3, path: "/results", hint: "Landmarks, diagnosis, treatment", eyebrow: "Review" },
  { label: "History", icon: History, path: "/history", hint: "Timeline and workflow monitoring", eyebrow: "Audit" },
  { label: "Reports", icon: FileText, path: "/reports", hint: "Generated outputs and exports", eyebrow: "Output" },
];

const PIPELINE_POINTS = [
  { label: "Landmark detection", done: true },
  { label: "Measurements", done: true },
  { label: "Diagnosis", done: true },
  { label: "Treatment XAI", done: false },
  { label: "Reports", done: false },
];

export default function Sidebar() {
  const [location] = useLocation();
  const [isOpen, setIsOpen] = useState(false);
  const { user, logout } = useAuth();

  const { data: integrationStatus } = trpc.system.integrationStatus.useQuery(undefined, {
    refetchInterval: 30_000,
    refetchOnWindowFocus: false,
  });

  const initials = useMemo(() => {
    const source = user?.name || user?.email || "Clinical User";
    return source.split(/\s+/).filter(Boolean).slice(0, 2).map((p: string) => p[0]?.toUpperCase()).join("") || "CU";
  }, [user]);

  const backendOk = Boolean(integrationStatus?.backend.ok);
  const aiOk = Boolean(integrationStatus?.aiService.ok);
  const allOk = backendOk && aiOk;
  const partialOk = backendOk || aiOk;

  const serviceStatus = allOk
    ? { label: "All systems ready", color: "text-emerald-300", dot: "bg-emerald-400", Icon: Wifi }
    : partialOk
      ? { label: "Partial service", color: "text-amber-300", dot: "bg-amber-400", Icon: Activity }
      : { label: "Service degraded", color: "text-rose-300", dot: "bg-rose-400", Icon: WifiOff };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@600;700;800&family=DM+Sans:wght@300;400;500&display=swap');
        .font-display { font-family: 'Syne', sans-serif; }
        .font-body    { font-family: 'DM Sans', sans-serif; }

        @keyframes pulse-ring {
          0%   { transform: scale(0.9); opacity: 0.7; }
          100% { transform: scale(2.2); opacity: 0; }
        }
        @keyframes fade-in-left {
          from { opacity: 0; transform: translateX(-8px); }
          to   { opacity: 1; transform: translateX(0); }
        }
        @keyframes shimmer {
          0%   { background-position: -200% center; }
          100% { background-position:  200% center; }
        }

        .sidebar-enter { animation: fade-in-left 0.3s ease both; }

        .status-dot-live {
          width: 7px; height: 7px; border-radius: 50%; position: relative; flex-shrink: 0;
        }
        .status-dot-live::after {
          content: ''; position: absolute; inset: -3px; border-radius: 50%;
          border: 1px solid currentColor; animation: pulse-ring 2s ease-out infinite;
        }

        .nav-link {
          position: relative;
          transition: background 0.2s ease, border-color 0.2s ease, transform 0.15s ease;
        }
        .nav-link:hover  { transform: translateX(2px); }
        .nav-link.active { transform: translateX(0); }

        .active-bar {
          position: absolute; left: 0; top: 50%;
          transform: translateY(-50%);
          width: 3px; height: 56%;
          background: linear-gradient(180deg, #a5f3fc, #22d3ee);
          border-radius: 0 3px 3px 0;
          transition: opacity 0.2s;
        }

        .nav-icon-wrap {
          transition: background 0.2s, border-color 0.2s, color 0.2s;
        }

        .pipeline-bar {
          height: 2px;
          border-radius: 99px;
          background: linear-gradient(90deg, #22d3ee, #818cf8);
          transform-origin: left;
          animation: bar-grow 1s cubic-bezier(0.34,1.56,0.64,1) 0.6s both;
        }
        @keyframes bar-grow {
          from { transform: scaleX(0); }
          to   { transform: scaleX(1); }
        }

        .user-card {
          transition: background 0.2s, border-color 0.2s;
        }
        .user-card:hover {
          background: rgba(255,255,255,0.06);
          border-color: rgba(255,255,255,0.14);
        }

        .logout-btn {
          transition: background 0.2s, border-color 0.2s, color 0.2s;
        }
        .logout-btn:hover {
          background: rgba(239,68,68,0.1);
          border-color: rgba(239,68,68,0.2);
          color: #fca5a5;
        }

        .grid-bg {
          background-image: linear-gradient(rgba(148,163,184,0.04) 1px, transparent 1px),
                            linear-gradient(90deg, rgba(148,163,184,0.04) 1px, transparent 1px);
          background-size: 32px 32px;
        }

        .section-divider {
          height: 1px;
          background: linear-gradient(90deg, transparent, rgba(255,255,255,0.07), transparent);
          margin: 8px 0;
        }

        .service-chip {
          transition: border-color 0.2s, background 0.2s;
        }
      `}</style>

      {/* Mobile toggle */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="fixed left-4 top-4 z-50 flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-[#080c14]/90 text-slate-300 shadow-lg backdrop-blur lg:hidden"
        aria-label="Toggle sidebar"
        aria-expanded={isOpen}
        aria-controls="primary-navigation"
      >
        {isOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
      </button>

      {/* Overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/60 backdrop-blur-sm lg:hidden"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        id="primary-navigation"
        aria-label="Primary navigation"
        className={cn(
          "font-body fixed left-0 top-0 z-40 flex h-screen w-[268px] flex-col overflow-hidden border-r border-white/[0.07] bg-[#080c14] shadow-2xl shadow-black/60 transition-transform duration-300",
          isOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        )}
      >
        {/* Grid texture */}
        <div className="pointer-events-none absolute inset-0 grid-bg opacity-100" />

        {/* Top glow */}
        <div className="pointer-events-none absolute left-0 top-0 h-64 w-full bg-[radial-gradient(ellipse_80%_50%_at_20%_0%,rgba(6,182,212,0.13),transparent)]" />

        {/* ── HEADER ── */}
        <div className="relative border-b border-white/[0.07] p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-cyan-400/20 bg-cyan-400/10">
                <Stethoscope className="h-5 w-5 text-cyan-300" />
                {/* pulse ring */}
                <span className="absolute inset-0 rounded-xl border border-cyan-400/30 animate-[ping_3s_ease-out_infinite] opacity-40" />
              </div>
              <div>
                <p className="font-display text-[15px] font-bold leading-none text-white">CephAI</p>
                <p className="mt-1 text-[10px] uppercase tracking-[0.26em] text-slate-600">Advanced</p>
              </div>
            </div>

            {/* Live pill */}
            <div className="flex items-center gap-1.5 rounded-full border border-emerald-400/15 bg-emerald-400/8 px-2.5 py-1">
              <span className={`status-dot-live ${serviceStatus.dot} ${serviceStatus.color}`} />
              <span className="text-[10px] font-medium text-emerald-300">Live</span>
            </div>
          </div>
        </div>

        {/* ── NAV ── */}
        <nav className="relative flex-1 overflow-y-auto px-3 py-3" aria-label="Workspace sections">

          <p className="mb-2 px-2 text-[9px] font-semibold uppercase tracking-[0.22em] text-slate-600">
            Workspace
          </p>

          <div className="space-y-0.5">
            {NAV_ITEMS.map((item) => {
              const isActive = location === item.path;
              return (
                <Link
                  key={item.path}
                  href={item.path}
                  onClick={() => setIsOpen(false)}
                  aria-current={isActive ? "page" : undefined}
                  className={cn(
                    "nav-link group flex items-center gap-3 rounded-xl border px-3 py-2.5",
                    isActive
                      ? "active border-cyan-400/20 bg-cyan-400/[0.09]"
                      : "border-transparent hover:border-white/[0.07] hover:bg-white/[0.04]"
                  )}
                >
                  {isActive && <span className="active-bar" />}

                  {/* Icon */}
                  <div className={cn(
                    "nav-icon-wrap flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border",
                    isActive
                      ? "border-cyan-400/25 bg-cyan-400/15 text-cyan-200"
                      : "border-white/[0.07] bg-white/[0.03] text-slate-500 group-hover:border-white/10 group-hover:text-slate-300"
                  )}>
                    <item.icon className="h-3.5 w-3.5" />
                  </div>

                  {/* Text */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-1">
                      <span className={cn(
                        "text-[18px] font-medium leading-none",
                        isActive ? "text-cyan-50" : "text-slate-400 group-hover:text-slate-200"
                      )}>
                        {item.label}
                      </span>
                    </div>
                    
                    <p className="mt-0.5 truncate text-[11px] text-slate-600 group-hover:text-slate-500">
                      {item.hint}
                    </p>
                  </div>

                  <ChevronRight className={cn(
                    "h-3.5 w-3.5 shrink-0 transition-all duration-200",
                    isActive ? "text-cyan-400" : "text-slate-700 group-hover:text-slate-500 group-hover:translate-x-0.5"
                  )} />
                </Link>
              );
            })}
          </div>
        </nav>

        {/* ── FOOTER ── */}
        <div className="relative border-t border-white/[0.07] p-3 space-y-2">
          {user && (
            <div className="user-card flex items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.03] p-2.5 cursor-default">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-300 to-cyan-500 font-display text-xs font-bold text-slate-950 shadow-lg shadow-cyan-900/30">
                {initials}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-medium text-slate-200">
                  {user.name || "Clinician"}
                </p>
                <p className="truncate text-[11px] text-slate-500">{user.email}</p>
              </div>
              <div className="flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              </div>
            </div>
          )}

          <button
            onClick={logout}
            className="logout-btn flex w-full items-center gap-2.5 rounded-xl border border-transparent px-3 py-2.5 text-[13px] text-slate-500"
          >
            <LogOut className="h-3.5 w-3.5" />
            Sign out
          </button>
        </div>
      </aside>
    </>
  );
}
