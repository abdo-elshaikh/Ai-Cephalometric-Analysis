import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  ArrowRight,
  BrainCircuit,
  CheckCircle2,
  ChevronDown,
  DatabaseZap,
  FileCheck2,
  Loader2,
  LockKeyhole,
  ScanLine,
  ShieldCheck,
  Sparkles,
  Stethoscope,
  Zap,
  BarChart3,
  Clock,
  Users,
} from "lucide-react";
import { useLocation } from "wouter";

import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

const trustSignals = [
  "Secure study storage",
  "AI-service aware workflow",
  "Clinician-reviewed reporting",
  "Role-based session layer",
];

const workflow = [
  {
    icon: ScanLine,
    step: "01",
    label: "Acquire",
    title: "Upload X-ray or DICOM Studies",
    text: "Stage images with metadata, storage keys, status tracking, and file validation. Supports full DICOM spec with instant preview.",
    color: "from-cyan-400/20 to-cyan-600/5",
    accent: "cyan",
  },
  {
    icon: BrainCircuit,
    step: "02",
    label: "Analyze",
    title: "Landmarks, Measurements & Diagnosis",
    text: "Review AI-assisted cephalometric findings with manual adjustment and confidence context. 38 landmarks tracked across 4 analysis families.",
    color: "from-violet-400/20 to-violet-600/5",
    accent: "violet",
  },
  {
    icon: FileCheck2,
    step: "03",
    label: "Report",
    title: "Generate Clinical Report Packets",
    text: "Create summaries, treatment rationales, overlays, and downloadable PDF reports with full audit trail and clinician signature.",
    color: "from-emerald-400/20 to-emerald-600/5",
    accent: "emerald",
  },
];

const platformStats = [
  { value: "38", label: "Landmarks Tracked", icon: BarChart3 },
  { value: "4", label: "Analysis Families", icon: BrainCircuit },
  { value: "<2s", label: "AI Response Time", icon: Clock },
  { value: "PDF", label: "Report Export", icon: FileCheck2 },
];

const services = [
  { name: "Backend API", detail: "Patient and report records", status: "online" },
  { name: "AI Service", detail: "Landmarks and clinical summaries", status: "online" },
  { name: "Object Storage", detail: "X-rays, overlays, PDFs", status: "online" },
];

// Animated counter hook
function useCounter(target: number, duration = 1500) {
  const [count, setCount] = useState(0);
  const [started, setStarted] = useState(false);

  useEffect(() => {
    if (!started) return;
    const start = performance.now();
    const frame = (now: number) => {
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setCount(Math.floor(eased * target));
      if (progress < 1) requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }, [started, target, duration]);

  return { count, start: () => setStarted(true) };
}

function AnimatedStat({ value, label, icon: Icon }: { value: string; label: string; icon: any }) {
  const ref = useRef<HTMLDivElement>(null);
  const numericValue = parseInt(value.replace(/\D/g, ""), 10);
  const isNumeric = !isNaN(numericValue);
  const { count, start } = useCounter(numericValue, 1200);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setVisible(true); start(); obs.disconnect(); } },
      { threshold: 0.4 }
    );
    if (ref.current) obs.observe(ref.current);
    return () => obs.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={`stat-card group relative overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.03] p-5 backdrop-blur transition-all duration-500 hover:border-white/20 hover:bg-white/[0.06] ${visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}
      style={{ transitionDelay: "0.1s" }}
    >
      <div className="absolute inset-0 bg-gradient-to-br from-cyan-400/5 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
      <Icon className="mb-3 h-5 w-5 text-cyan-400/70" />
      <p className="font-display text-3xl font-bold tracking-tight text-white">
        {isNumeric ? (visible ? count : 0) : value}{value.includes("<") ? "" : ""}
      </p>
      <p className="mt-1 text-sm text-slate-400">{label}</p>
    </div>
  );
}

export default function Home() {
  const { user, loading, isAuthenticated, logout, refresh } = useAuth();
  const [, setLocation] = useLocation();
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [specialty, setSpecialty] = useState("");
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const heroRef = useRef<HTMLDivElement>(null);
  const utils = trpc.useUtils();
  const login = trpc.auth.login.useMutation();
  const register = trpc.auth.register.useMutation();
  const isSubmitting = login.isPending || register.isPending;

  // Mouse parallax
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      setMousePos({ x: e.clientX / window.innerWidth, y: e.clientY / window.innerHeight });
    };
    window.addEventListener("mousemove", handler);
    return () => window.removeEventListener("mousemove", handler);
  }, []);

  const initials = useMemo(() => {
    const source = user?.name || user?.email || "Clinical User";
    return source.split(/\s+/).slice(0, 2).map((part: any) => part[0]?.toUpperCase()).join("");
  }, [user]);

  const handleAuthSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      const authResult = await (authMode === "register"
        ? register.mutateAsync({ email, password, fullName, specialty: specialty || undefined })
        : login.mutateAsync({ email, password }));
      utils.auth.me.setData(undefined, authResult.user as any);
      await refresh();
      toast.success(authMode === "register" ? "Account created and signed in" : "Signed in successfully");
      setLocation("/");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Authentication failed");
    }
  };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;500;600;700;800&family=DM+Sans:wght@300;400;500&display=swap');

        * { box-sizing: border-box; }

        .font-display { font-family: 'Syne', sans-serif; }
        .font-body { font-family: 'DM Sans', sans-serif; }

        @keyframes float {
          0%, 100% { transform: translateY(0px) rotate(0deg); }
          33% { transform: translateY(-12px) rotate(1deg); }
          66% { transform: translateY(-6px) rotate(-1deg); }
        }
        @keyframes pulse-ring {
          0% { transform: scale(0.8); opacity: 1; }
          100% { transform: scale(2); opacity: 0; }
        }
        @keyframes scan-line {
          0% { transform: translateY(-100%); opacity: 0; }
          10% { opacity: 1; }
          90% { opacity: 1; }
          100% { transform: translateY(500%); opacity: 0; }
        }
        @keyframes fade-up {
          from { opacity: 0; transform: translateY(24px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes shimmer {
          0% { background-position: -200% center; }
          100% { background-position: 200% center; }
        }
        @keyframes dot-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
        @keyframes grid-fade {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes border-spin {
          from { --angle: 0deg; }
          to { --angle: 360deg; }
        }

        .animate-float { animation: float 6s ease-in-out infinite; }
        .animate-fade-up { animation: fade-up 0.6s ease forwards; }
        .animate-shimmer {
          background: linear-gradient(90deg, transparent, rgba(255,255,255,0.08), transparent);
          background-size: 200% 100%;
          animation: shimmer 2s infinite;
        }

        .hero-fade-1 { animation: fade-up 0.7s ease 0.1s both; }
        .hero-fade-2 { animation: fade-up 0.7s ease 0.25s both; }
        .hero-fade-3 { animation: fade-up 0.7s ease 0.4s both; }
        .hero-fade-4 { animation: fade-up 0.7s ease 0.55s both; }
        .hero-fade-5 { animation: fade-up 0.7s ease 0.7s both; }

        .scan-anim { animation: scan-line 4s ease-in-out infinite; }

        .status-dot {
          width: 8px; height: 8px; border-radius: 50%; background: #34d399;
          position: relative;
        }
        .status-dot::after {
          content: ''; position: absolute; inset: -3px; border-radius: 50%;
          border: 1px solid #34d399;
          animation: pulse-ring 2s ease-out infinite;
        }

        .gradient-text {
          background: linear-gradient(135deg, #e2f8ff 0%, #67e8f9 40%, #a5f3fc 70%, #fff 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }

        .card-glow:hover {
          box-shadow: 0 0 40px rgba(103,232,249,0.12), 0 20px 60px rgba(0,0,0,0.4);
        }

        .workflow-card {
          transition: transform 0.35s cubic-bezier(0.34,1.56,0.64,1), box-shadow 0.35s ease, border-color 0.35s ease;
        }
        .workflow-card:hover {
          transform: translateY(-6px);
        }

        .auth-panel {
          box-shadow: 0 0 0 1px rgba(255,255,255,0.08), 0 32px 80px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.1);
        }

        .input-field {
          transition: border-color 0.2s, box-shadow 0.2s;
        }
        .input-field:focus {
          border-color: rgba(103,232,249,0.4) !important;
          box-shadow: 0 0 0 3px rgba(103,232,249,0.08);
        }

        .btn-primary {
          background: linear-gradient(135deg, #a5f3fc, #67e8f9);
          position: relative;
          overflow: hidden;
          transition: all 0.3s ease;
        }
        .btn-primary::after {
          content: '';
          position: absolute;
          inset: 0;
          background: linear-gradient(135deg, rgba(255,255,255,0.2), transparent);
          opacity: 0;
          transition: opacity 0.3s;
        }
        .btn-primary:hover::after { opacity: 1; }
        .btn-primary:hover { transform: translateY(-1px); box-shadow: 0 12px 40px rgba(103,232,249,0.35); }
        .btn-primary:active { transform: translateY(0); }

        .noise-overlay {
          position: fixed; inset: 0; pointer-events: none; z-index: 1; opacity: 0.025;
          background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E");
          background-size: 200px;
        }

        .divider-line {
          height: 1px;
          background: linear-gradient(90deg, transparent, rgba(255,255,255,0.1), transparent);
        }

        .parallax-orb {
          transition: transform 0.1s ease-out;
        }

        .tab-pill {
          transition: all 0.25s cubic-bezier(0.34,1.56,0.64,1);
        }

        .stat-card {
          transition: all 0.4s cubic-bezier(0.34,1.56,0.64,1);
        }
      `}</style>

      <div className="noise-overlay" />

      <main className="relative min-h-screen overflow-hidden bg-[#080c14] font-body text-slate-50">

        {/* Background orbs with parallax */}
        <div className="pointer-events-none fixed inset-0 overflow-hidden">
          <div
            className="parallax-orb absolute -left-40 top-[-15rem] h-[42rem] w-[42rem] rounded-full"
            style={{
              background: "radial-gradient(circle, rgba(6,182,212,0.18) 0%, transparent 70%)",
              transform: `translate(${mousePos.x * 20}px, ${mousePos.y * 15}px)`,
            }}
          />
          <div
            className="parallax-orb absolute right-[-12rem] top-10 h-[38rem] w-[38rem] rounded-full"
            style={{
              background: "radial-gradient(circle, rgba(139,92,246,0.12) 0%, transparent 70%)",
              transform: `translate(${-mousePos.x * 15}px, ${mousePos.y * 12}px)`,
            }}
          />
          <div
            className="parallax-orb absolute bottom-[-20rem] left-1/3 h-[40rem] w-[40rem] rounded-full"
            style={{
              background: "radial-gradient(circle, rgba(16,185,129,0.1) 0%, transparent 70%)",
              transform: `translate(${mousePos.x * 10}px, ${-mousePos.y * 10}px)`,
            }}
          />
          {/* Fine grid */}
          <div className="absolute inset-0 bg-[linear-gradient(rgba(148,163,184,0.04)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.04)_1px,transparent_1px)] bg-[size:40px_40px]" />
          {/* Vignette */}
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_80%_at_50%_50%,transparent_50%,rgba(8,12,20,0.8)_100%)]" />
        </div>

        <section className="relative z-10 mx-auto w-full max-w-7xl px-5 py-6 sm:px-8 lg:px-10">

          {/* Nav */}
          <nav className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="relative flex h-11 w-11 items-center justify-center rounded-2xl border border-cyan-400/20 bg-gradient-to-br from-cyan-400/20 to-cyan-600/5">
                <Stethoscope className="h-5 w-5 text-cyan-300" />
                <div className="absolute inset-0 rounded-2xl animate-shimmer" />
              </div>
              <div>
                <p className="font-display text-lg font-bold tracking-tight text-white">CephAI Advanced</p>
                <p className="text-[10px] uppercase tracking-[0.3em] text-cyan-300/50">Clinical Intelligence</p>
              </div>
            </div>

            <div className="hidden items-center gap-6 text-sm text-slate-400 md:flex">
              {["Workflow", "Analysis", "Reporting"].map((item) => (
                <button
                  key={item}
                  onClick={() => document.getElementById("clinical-workflow")?.scrollIntoView({ behavior: "smooth" })}
                  className="transition-colors hover:text-slate-200"
                >
                  {item}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-3">
              <div className="hidden items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/5 px-3 py-1.5 md:flex">
                <div className="status-dot" />
                <span className="text-xs text-emerald-300">All systems operational</span>
              </div>
              {isAuthenticated && (
                <button
                  onClick={() => setLocation("/")}
                  className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-1.5 text-sm text-slate-300 transition hover:bg-white/[0.08]"
                >
                  Dashboard →
                </button>
              )}
            </div>
          </nav>

          {/* Hero */}
          <div ref={heroRef} className="grid flex-1 items-center gap-10 py-16 lg:grid-cols-[1.15fr_0.85fr] lg:py-24">
            <div className="space-y-8">

              <div className="hero-fade-1 inline-flex items-center gap-2 rounded-full border border-cyan-400/20 bg-cyan-400/8 px-4 py-2 text-sm text-cyan-200">
                <Sparkles className="h-3.5 w-3.5" />
                AI-assisted cephalometric operations platform
                <span className="ml-1 rounded-full bg-cyan-400/20 px-2 py-0.5 text-xs text-cyan-100">v2.0</span>
              </div>

              <h1 className="hero-fade-2 font-display max-w-3xl text-[3.2rem] font-bold leading-[0.95] tracking-[-0.04em] sm:text-6xl lg:text-7xl">
                <span className="gradient-text">Orthodontic</span>
                <br />
                <span className="text-white">analysis &</span>
                <br />
                <span className="text-slate-400">AI evidence</span>
                <br />
                <span className="text-white">in one cockpit.</span>
              </h1>

              <p className="hero-fade-3 max-w-xl text-lg leading-8 text-slate-400">
                CephAI connects image upload, landmark review, measurement interpretation,
                treatment rationale generation, and report export into a{" "}
                <span className="text-slate-200">secure workspace</span> built for serious cephalometric review.
              </p>

              <div className="hero-fade-4 flex flex-col gap-3 sm:flex-row">
                <button
                  onClick={() => {
                    if (isAuthenticated) { setLocation("/"); return; }
                    document.getElementById("backend-auth-form")?.scrollIntoView({ behavior: "smooth" });
                  }}
                  disabled={loading}
                  className="btn-primary inline-flex h-12 items-center justify-center gap-2 rounded-2xl px-6 text-sm font-semibold text-slate-950"
                >
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
                  {isAuthenticated ? "Enter workspace" : "Sign in securely"}
                </button>
                <button
                  onClick={() => document.getElementById("clinical-workflow")?.scrollIntoView({ behavior: "smooth" })}
                  className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[0.03] px-6 text-sm text-slate-300 transition hover:bg-white/[0.07] hover:text-white"
                >
                  View workflow
                  <ChevronDown className="h-4 w-4" />
                </button>
              </div>

              {/* Stats */}
              <div className="hero-fade-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {platformStats.map((stat) => (
                  <AnimatedStat key={stat.label} value={stat.value} label={stat.label} icon={stat.icon} />
                ))}
              </div>
            </div>

            {/* Auth Panel */}
            <aside className="relative">
              <div className="absolute -inset-8 rounded-[3rem] bg-gradient-to-br from-cyan-400/10 via-violet-400/5 to-transparent blur-3xl" />
              <div className="auth-panel relative overflow-hidden rounded-[1.75rem] border border-white/[0.09] bg-[#0c1422]/90 backdrop-blur-2xl">

                {/* Decorative scan line */}
                <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-[1.75rem]">
                  <div className="scan-anim absolute inset-x-0 h-px bg-gradient-to-r from-transparent via-cyan-400/60 to-transparent" />
                </div>

                <div className="border-b border-white/[0.07] p-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-[10px] uppercase tracking-[0.3em] text-cyan-300/50">Access Console</p>
                      <h2 className="font-display mt-1.5 text-xl font-bold text-white">
                        {isAuthenticated ? "Session Active" : "Secure Sign-in"}
                      </h2>
                    </div>
                    <div className="relative flex h-11 w-11 items-center justify-center rounded-2xl border border-emerald-400/20 bg-emerald-400/8">
                      <LockKeyhole className="h-4.5 w-4.5 text-emerald-300" />
                      {isAuthenticated && <div className="absolute -right-1 -top-1 h-3 w-3 rounded-full border-2 border-[#0c1422] bg-emerald-400" />}
                    </div>
                  </div>
                </div>

                <div className="space-y-4 p-5">
                  {isAuthenticated ? (
                    <div className="rounded-2xl border border-cyan-400/15 bg-gradient-to-br from-cyan-400/10 to-transparent p-5">
                      <div className="flex items-center gap-4">
                        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-200 to-cyan-400 font-display text-lg font-bold text-slate-950">
                          {initials || "CU"}
                        </div>
                        <div>
                          <p className="font-semibold text-white">{user?.name || "Clinical User"}</p>
                          <p className="text-sm text-slate-400">{user?.email}</p>
                          <div className="mt-1 flex items-center gap-1.5">
                            <div className="status-dot scale-75" />
                            <span className="text-xs text-emerald-300">Session active</span>
                          </div>
                        </div>
                      </div>
                      <div className="mt-4 grid gap-2 sm:grid-cols-2">
                        <button onClick={() => setLocation("/")} className="btn-primary h-10 rounded-xl text-sm font-semibold text-slate-950">
                          Open workspace
                        </button>
                        <button onClick={() => void logout()} className="h-10 rounded-xl border border-white/10 bg-white/[0.04] text-sm text-slate-300 transition hover:bg-white/[0.08]">
                          Sign out
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      {/* Mode toggle */}
                      <div className="rounded-2xl border border-white/[0.07] bg-white/[0.03] p-4">
                        <div className="mb-4 grid grid-cols-2 gap-1.5 rounded-xl bg-black/30 p-1">
                          {(["login", "register"] as const).map((mode) => (
                            <button
                              key={mode}
                              type="button"
                              onClick={() => setAuthMode(mode)}
                              className={`tab-pill rounded-lg py-2 text-sm font-medium ${authMode === mode
                                  ? "bg-gradient-to-r from-cyan-300 to-cyan-400 text-slate-950 shadow-lg shadow-cyan-400/20"
                                  : "text-slate-400 hover:text-slate-200"
                                }`}
                            >
                              {mode === "login" ? "Sign in" : "Register"}
                            </button>
                          ))}
                        </div>

                        <form id="backend-auth-form" className="space-y-3" onSubmit={handleAuthSubmit}>
                          {authMode === "register" && (
                            <div className="space-y-1.5">
                              <Label htmlFor="fullName" className="text-xs font-medium text-slate-400">Full name</Label>
                              <Input
                                id="fullName"
                                value={fullName}
                                onChange={(e) => setFullName(e.target.value)}
                                required
                                minLength={2}
                                autoComplete="name"
                                className="input-field h-10 rounded-xl border-white/[0.08] bg-black/30 text-sm text-slate-100 placeholder:text-slate-600"
                                placeholder="Dr. Yasmin Abdallah"
                              />
                            </div>
                          )}
                          <div className="space-y-1.5">
                            <Label htmlFor="email" className="text-xs font-medium text-slate-400">Email address</Label>
                            <Input
                              id="email"
                              type="email"
                              value={email}
                              onChange={(e) => setEmail(e.target.value)}
                              required
                              autoComplete="email"
                              className="input-field h-10 rounded-xl border-white/[0.08] bg-black/30 text-sm text-slate-100 placeholder:text-slate-600"
                              placeholder="doctor@clinic.com"
                            />
                          </div>
                          <div className="space-y-1.5">
                            <Label htmlFor="password" className="text-xs font-medium text-slate-400">Password</Label>
                            <Input
                              id="password"
                              type="password"
                              value={password}
                              onChange={(e) => setPassword(e.target.value)}
                              required
                              minLength={authMode === "register" ? 8 : 1}
                              autoComplete={authMode === "register" ? "new-password" : "current-password"}
                              className="input-field h-10 rounded-xl border-white/[0.08] bg-black/30 text-sm text-slate-100 placeholder:text-slate-600"
                              placeholder={authMode === "register" ? "Min. 8 characters" : "Your password"}
                            />
                          </div>
                          {authMode === "register" && (
                            <div className="space-y-1.5">
                              <Label htmlFor="specialty" className="text-xs font-medium text-slate-400">
                                Specialty <span className="text-slate-600">(optional)</span>
                              </Label>
                              <Input
                                id="specialty"
                                value={specialty}
                                onChange={(e) => setSpecialty(e.target.value)}
                                autoComplete="organization-title"
                                className="input-field h-10 rounded-xl border-white/[0.08] bg-black/30 text-sm text-slate-100 placeholder:text-slate-600"
                                placeholder="Orthodontist"
                              />
                            </div>
                          )}
                          <button
                            type="submit"
                            disabled={loading || isSubmitting}
                            className="btn-primary mt-1 flex h-11 w-full items-center justify-center gap-2 rounded-xl text-sm font-bold text-slate-950 disabled:opacity-60"
                          >
                            {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
                            {authMode === "register" ? "Create account" : "Sign in"}
                          </button>
                        </form>
                      </div>

                      {/* Trust signals */}
                      <div className="grid grid-cols-2 gap-2">
                        {trustSignals.map((signal) => (
                          <div
                            key={signal}
                            className="flex items-center gap-2 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2.5 text-xs text-slate-400"
                          >
                            <CheckCircle2 className="h-3.5 w-3.5 flex-shrink-0 text-emerald-400" />
                            {signal}
                          </div>
                        ))}
                      </div>
                    </>
                  )}

                  {/* Service status */}
                  <div className="rounded-2xl border border-white/[0.07] bg-gradient-to-br from-white/[0.03] to-transparent p-4">
                    <div className="mb-3 flex items-center justify-between">
                      <p className="text-xs font-medium text-slate-300">Service Readiness</p>
                      <span className="flex items-center gap-1.5 rounded-full border border-emerald-400/20 bg-emerald-400/8 px-2.5 py-1 text-xs text-emerald-300">
                        <div className="status-dot scale-75" />
                        All online
                      </span>
                    </div>
                    <div className="space-y-2">
                      {services.map((svc) => (
                        <div key={svc.name} className="flex items-center justify-between rounded-xl bg-white/[0.03] px-3 py-2.5">
                          <div>
                            <p className="text-sm font-medium text-white">{svc.name}</p>
                            <p className="text-xs text-slate-500">{svc.detail}</p>
                          </div>
                          <Activity className="h-4 w-4 text-cyan-400/60" />
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </aside>
          </div>

          {/* Divider */}
          <div className="divider-line my-2" />

          {/* Workflow section */}
          <section id="clinical-workflow" className="py-16">
            <div className="mb-10 text-center">
              <p className="mb-3 text-xs uppercase tracking-[0.3em] text-cyan-300/60">Clinical Pipeline</p>
              <h2 className="font-display text-4xl font-bold text-white">How it works</h2>
              <p className="mx-auto mt-4 max-w-xl text-slate-400">
                From image acquisition to report export — a single, secure workflow purpose-built for cephalometric analysis.
              </p>
            </div>

            <div className="grid gap-4 lg:grid-cols-3">
              {workflow.map((item, i) => (
                <article
                  key={item.label}
                  className={`workflow-card card-glow group relative overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.03] p-6 backdrop-blur cursor-default`}
                >
                  <div className={`absolute inset-0 bg-gradient-to-br ${item.color} opacity-0 transition-opacity duration-500 group-hover:opacity-100`} />
                  <div className="absolute right-4 top-4 font-display text-6xl font-black text-white/[0.04] select-none">{item.step}</div>

                  <div className="relative">
                    <div className={`mb-6 inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-${item.accent}-400/20 bg-${item.accent}-400/10`}>
                      <item.icon className={`h-5 w-5 text-${item.accent}-300`} />
                    </div>

                    <div className="mb-2 flex items-center gap-2">
                      <span className={`rounded-full border border-${item.accent}-400/20 bg-${item.accent}-400/10 px-2.5 py-0.5 text-xs font-medium text-${item.accent}-300`}>
                        {item.label}
                      </span>
                      <span className="text-xs text-slate-600">Step {i + 1}</span>
                    </div>

                    <h3 className="font-display text-lg font-bold text-white">{item.title}</h3>
                    <p className="mt-2 text-sm leading-6 text-slate-400">{item.text}</p>

                    <div className="mt-5 flex items-center gap-1.5 text-xs text-slate-500 transition-colors group-hover:text-slate-300">
                      <Zap className="h-3 w-3" />
                      AI-assisted step
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </section>

          {/* Footer */}
          <div className="divider-line mb-6" />
          <footer className="flex flex-col gap-3 py-6 text-xs text-slate-600 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-3.5 w-3.5 text-cyan-400/40" />
              Clinical decision support. Final diagnosis remains clinician-reviewed.
            </div>
            <div className="flex items-center gap-2">
              <DatabaseZap className="h-3.5 w-3.5 text-cyan-400/40" />
              Backend, AI service, and storage-aware frontend.
            </div>
            <div className="text-slate-700">© 2025 CephAI Advanced</div>
          </footer>
        </section>
      </main>
    </>
  );
}