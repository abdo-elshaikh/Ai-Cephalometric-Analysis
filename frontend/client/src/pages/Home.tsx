import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity, ArrowRight, BrainCircuit, CheckCircle2, ChevronDown, DatabaseZap,
  FileCheck2, Loader2, LockKeyhole, ScanLine, ShieldCheck, Sparkles, Stethoscope,
  Zap, BarChart3, Clock, Users, Globe, ShieldAlert, Cpu, HardDrive, Layers, Target,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Pill, Card as PremiumCard } from "@/components/_core/ClinicalComponents";

const trustSignals = [
  "HIPAA COMPLIANT",
  "AI NEURAL PIPELINE",
  "IMMUTABLE LEDGER",
  "CLINICAL ACCOUNTABILITY",
];

const workflow = [
  {
    icon: ScanLine,
    step: "01",
    label: "Ingestion",
    title: "Surgical Radiograph Acquisition",
    text: "Stage lateral radiographs with automatic exposure normalization and DICOM-grade validation. High-fidelity asset ingestion for sub-millimeter analysis.",
    color: "from-primary/20 to-primary/5",
    accent: "primary",
  },
  {
    icon: BrainCircuit,
    step: "02",
    label: "Synthesis",
    title: "Neural Landmark Orchestration",
    text: "HRNet-W32 detects 80 anatomical landmarks with immediate computation of 90+ clinical biometrics. Review confidence scores in a real-time Cartesian grid.",
    color: "from-sky-500/20 to-sky-500/5",
    accent: "sky",
  },
  {
    icon: FileCheck2,
    step: "03",
    label: "Artifact",
    title: "Diagnostic Documentation Synthesis",
    text: "Produce serialized clinical report packets with skeletal projections, etiological rationales, and full audit logs for surgical planning.",
    color: "from-emerald-500/20 to-emerald-500/5",
    accent: "emerald",
  },
];

const platformStats = [
  { value: "80", label: "Neural Landmarks", icon: Target },
  { value: "90+", label: "Clinical Biometrics", icon: BarChart3 },
  { value: "1.2s", label: "Inference Latency", icon: Zap },
  { value: "SLA", label: "Mission Critical", icon: ShieldCheck },
];

const services = [
  { name: "Clinical Backend", detail: "Active Handshake", status: "online", icon: HardDrive },
  { name: "AI Inference Engine", detail: "Neural Core Ready", status: "online", icon: Cpu },
  { name: "Asset Repository", detail: "Storage Synchronized", status: "online", icon: DatabaseZap },
];

export default function Home() {
  const { user, loading, isAuthenticated, logout, refresh } = useAuth();
  const [, setLocation] = useLocation();
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [specialty, setSpecialty] = useState("");
  const [mousePos, setMousePos] = useState({ x: 0.5, y: 0.5 });
  
  const utils = trpc.useUtils();
  const login = trpc.auth.login.useMutation();
  const register = trpc.auth.register.useMutation();
  const isSubmitting = login.isPending || register.isPending;

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      setMousePos({ x: e.clientX / window.innerWidth, y: e.clientY / window.innerHeight });
    };
    window.addEventListener("mousemove", handler);
    return () => window.removeEventListener("mousemove", handler);
  }, []);

  const initials = useMemo(() => {
    const source = user?.name || user?.email || "CU";
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
      toast.success(authMode === "register" ? "Clinical profile provisioned." : "Secure session initialized.");
      setLocation("/");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Handshake failed.");
    }
  };

  return (
    <div className="min-h-screen bg-[#050508] text-foreground selection:bg-primary/30 font-sans relative overflow-hidden">
      
      {/* ── Ambient Matrix ── */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div 
          className="absolute -top-60 -left-40 w-[1000px] h-[1000px] rounded-full bg-primary/10 blur-[160px] animate-pulse duration-[15s]" 
          style={{ transform: `translate(${mousePos.x * 30}px, ${mousePos.y * 20}px)` }}
        />
        <div 
          className="absolute -bottom-60 -right-40 w-[800px] h-[800px] rounded-full bg-blue-500/10 blur-[160px] animate-pulse duration-[12s]" 
          style={{ transform: `translate(${-mousePos.x * 20}px, ${-mousePos.y * 15}px)` }}
        />
        {/* Grid and Noise */}
        <div className="absolute inset-0 bg-[linear-gradient(rgba(148,163,184,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.03)_1px,transparent_1px)] bg-[size:40px_40px]" />
        <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-[0.15] brightness-100 contrast-150 pointer-events-none" />
      </div>

      <div className="relative z-10 max-w-[1600px] mx-auto p-6 md:p-10 lg:p-16">
        
        {/* ── Navigation ── */}
        <nav className="flex items-center justify-between gap-6 mb-20 animate-in fade-in slide-in-from-top-4 duration-1000">
          <div className="flex items-center gap-4">
             <div className="h-12 w-12 rounded-[20px] bg-primary flex items-center justify-center text-primary-foreground shadow-2xl shadow-primary/30">
               <ShieldCheck className="h-7 w-7" />
             </div>
             <div className="hidden sm:block">
                <h2 className="text-xl font-black tracking-tight text-white">CephAI</h2>
                <p className="text-[10px] font-black uppercase tracking-[0.4em] text-primary/60">Surgical Analytics</p>
             </div>
          </div>

          <div className="hidden lg:flex items-center gap-10">
             {["Protocol", "Infrastructure", "Security"].map(item => (
               <button key={item} className="text-[10px] font-black uppercase tracking-[0.25em] text-muted-foreground/60 hover:text-white transition-colors">{item}</button>
             ))}
          </div>

          <div className="flex items-center gap-4">
             <div className="hidden md:flex items-center gap-3 px-5 py-2.5 rounded-2xl bg-emerald-500/5 border border-emerald-500/10 text-emerald-500">
                <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse shadow-lg shadow-emerald-500/50" />
                <span className="text-[10px] font-black uppercase tracking-widest">Global Engine Online</span>
             </div>
             {isAuthenticated && (
               <button onClick={() => setLocation("/")} className="h-11 px-6 rounded-xl bg-primary/10 border border-primary/20 text-primary text-[10px] font-black uppercase tracking-widest hover:bg-primary/20 transition-all">
                 Active Workspace
               </button>
             )}
          </div>
        </nav>

        {/* ── Hero Section ── */}
        <div className="grid lg:grid-cols-[1.1fr_0.9fr] gap-20 items-center mb-32">
           <div className="space-y-10 animate-in fade-in slide-in-from-left-10 duration-1000">
              <div className="inline-flex items-center gap-3 px-4 py-2 rounded-full bg-primary/10 border border-primary/20 text-primary">
                 <Sparkles className="h-3.5 w-3.5" />
                 <span className="text-[10px] font-black uppercase tracking-widest">Next-Gen Neural Diagnostics v2.2</span>
              </div>

              <h1 className="text-6xl md:text-8xl font-black tracking-tighter leading-[0.85] text-white">
                Advanced<br />
                <span className="text-gradient-primary">Cephalometric</span><br />
                Orchestration.
              </h1>

              <p className="text-xl text-muted-foreground font-medium max-w-xl leading-relaxed">
                Seamlessly unify image ingestion, neural landmark synthesis, and high-fidelity diagnostic reporting in a mission-critical surgical workspace.
              </p>

              <div className="flex flex-wrap gap-4">
                 <button onClick={() => { if(isAuthenticated) setLocation("/"); else document.getElementById("auth-matrix")?.scrollIntoView({ behavior: 'smooth' }); }} className="h-16 px-10 rounded-2xl bg-primary text-primary-foreground font-black uppercase tracking-[0.2em] text-[11px] shadow-2xl shadow-primary/20 hover-lift transition-all">
                    Initialize Handshake
                 </button>
                 <button className="h-16 px-10 rounded-2xl border-2 border-white/5 bg-white/5 backdrop-blur-md text-white font-black uppercase tracking-[0.2em] text-[11px] hover:bg-white/10 transition-all">
                    Clinical Workflow
                 </button>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-10">
                 {platformStats.map(stat => (
                   <div key={stat.label} className="p-6 rounded-3xl border border-white/5 bg-white/[0.02] backdrop-blur-sm group hover:border-primary/20 transition-all duration-700">
                      <stat.icon className="h-5 w-5 text-primary/40 mb-3 group-hover:text-primary transition-colors" />
                      <p className="text-3xl font-black tracking-tighter text-white">{stat.value}</p>
                      <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground/60 mt-1">{stat.label}</p>
                   </div>
                 ))}
              </div>
           </div>

           {/* ── Auth Matrix ── */}
           <div id="auth-matrix" className="relative animate-in fade-in slide-in-from-right-10 duration-1000">
              <div className="absolute -inset-10 bg-primary/10 blur-[100px] opacity-20" />
              <div className="relative glass-premium rounded-[48px] border-border/20 shadow-2xl-professional overflow-hidden">
                 {/* Decorative scanning element */}
                 <div className="absolute inset-0 pointer-events-none overflow-hidden rounded-[48px]">
                    <div className="absolute inset-x-0 h-px bg-gradient-to-r from-transparent via-primary/60 to-transparent animate-scan-line" style={{ top: '20%' }} />
                 </div>

                 <div className="p-10 border-b border-border/10 flex items-center justify-between bg-muted/5 backdrop-blur-md">
                    <div className="space-y-1">
                       <p className="text-[10px] font-black uppercase tracking-[0.3em] text-primary/60">Registry Portal</p>
                       <h3 className="text-2xl font-black tracking-tight">{isAuthenticated ? "Session Synchronized" : "Identity Handshake"}</h3>
                    </div>
                    <div className="h-14 w-14 rounded-[20px] bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-500 shadow-xl shadow-emerald-500/5">
                       <LockKeyhole className="h-6 w-6" />
                    </div>
                 </div>

                 <div className="p-10 space-y-8">
                    {isAuthenticated ? (
                      <div className="p-8 rounded-[32px] bg-primary/5 border border-primary/20 space-y-6">
                         <div className="flex items-center gap-5">
                            <div className="h-16 w-16 rounded-[24px] bg-primary flex items-center justify-center text-primary-foreground font-black text-2xl shadow-xl shadow-primary/20">
                               {initials}
                            </div>
                            <div className="space-y-1">
                               <h4 className="text-xl font-black tracking-tight">{user?.name || "Clinical Professional"}</h4>
                               <p className="text-xs font-bold text-muted-foreground/60">{user?.email}</p>
                            </div>
                         </div>
                         <div className="grid gap-3 pt-4">
                            <button onClick={() => setLocation("/")} className="h-14 rounded-2xl bg-primary text-primary-foreground font-black uppercase tracking-widest text-[11px] shadow-xl shadow-primary/20 hover-lift transition-all">Enter Workspace</button>
                            <button onClick={() => logout()} className="h-14 rounded-2xl border border-border/20 text-muted-foreground hover:text-rose-500 hover:border-rose-500/20 transition-all font-black uppercase tracking-widest text-[11px]">Terminate Session</button>
                         </div>
                      </div>
                    ) : (
                      <>
                        <div className="grid grid-cols-2 gap-2 p-1.5 rounded-[22px] bg-muted/20 border border-border/10 backdrop-blur-sm">
                           {(["login", "register"] as const).map(mode => (
                             <button
                               key={mode}
                               onClick={() => setAuthMode(mode)}
                               className={cn("py-3.5 rounded-[16px] text-[10px] font-black uppercase tracking-widest transition-all duration-500", authMode === mode ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20" : "text-muted-foreground/60 hover:text-foreground")}
                             >
                               {mode === "login" ? "IDENTITY LOGIN" : "NEW ENROLLMENT"}
                             </button>
                           ))}
                        </div>

                        <form onSubmit={handleAuthSubmit} className="space-y-5">
                           {authMode === "register" && (
                             <div className="space-y-2">
                                <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/40 ml-1">Full Clinical Name</Label>
                                <Input value={fullName} onChange={e => setFullName(e.target.value)} required className="h-14 rounded-2xl border-2 border-border/40 bg-muted/10 font-bold px-6 focus:border-primary/40 transition-all" placeholder="Dr. Julian Vane" />
                             </div>
                           )}
                           <div className="space-y-2">
                              <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/40 ml-1">Registry Email</Label>
                              <Input type="email" value={email} onChange={e => setEmail(e.target.value)} required className="h-14 rounded-2xl border-2 border-border/40 bg-muted/10 font-bold px-6 focus:border-primary/40 transition-all" placeholder="clinical@cephai.io" />
                           </div>
                           <div className="space-y-2">
                              <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/40 ml-1">Passkey</Label>
                              <Input type="password" value={password} onChange={e => setPassword(e.target.value)} required className="h-14 rounded-2xl border-2 border-border/40 bg-muted/10 font-bold px-6 focus:border-primary/40 transition-all" placeholder="••••••••••••" />
                           </div>
                           <button type="submit" disabled={isSubmitting} className="h-16 w-full rounded-2xl bg-primary text-primary-foreground font-black uppercase tracking-[0.25em] text-[11px] shadow-2xl shadow-primary/20 hover-lift transition-all mt-4">
                              {isSubmitting ? "VERIFYING HANDSHAKE..." : authMode === "login" ? "INITIALIZE SESSION" : "PROVISION ACCOUNT"}
                           </button>
                        </form>
                      </>
                    )}

                    {/* Infrastructure Monitor */}
                    <div className="p-6 rounded-[32px] border border-white/5 bg-white/[0.02] backdrop-blur-sm space-y-4">
                       <div className="flex items-center justify-between">
                          <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/40">Infrastructure Integrity</span>
                          <Pill tone="success" size="xs" className="font-black uppercase tracking-widest text-[8px]">Synchronized</Pill>
                       </div>
                       <div className="grid gap-2">
                          {services.map(svc => (
                            <div key={svc.name} className="flex items-center justify-between p-3.5 rounded-xl bg-background/40 border border-border/10 group hover:border-primary/20 transition-all">
                               <div className="flex items-center gap-3">
                                  <svc.icon className="h-3.5 w-3.5 text-muted-foreground/30 group-hover:text-primary transition-colors" />
                                  <div>
                                     <p className="text-[10px] font-black text-white/80">{svc.name}</p>
                                     <p className="text-[8px] font-black uppercase tracking-tighter text-muted-foreground/40">{svc.detail}</p>
                                  </div>
                               </div>
                               <Activity className="h-3.5 w-3.5 text-emerald-500/40" />
                            </div>
                          ))}
                       </div>
                    </div>
                 </div>
              </div>
           </div>
        </div>

        {/* ── Workflow Architecture ── */}
        <section className="py-20 border-t border-border/10">
           <div className="text-center mb-20 space-y-4">
              <span className="text-[10px] font-black uppercase tracking-[0.4em] text-primary/60">Core Architecture</span>
              <h2 className="text-4xl md:text-5xl font-black tracking-tight">Clinical Pipeline Orchestration</h2>
              <p className="text-muted-foreground font-medium max-w-2xl mx-auto">
                 An integrated diagnostic loop designed for surgical precision and clinical accountability.
              </p>
           </div>

           <div className="grid lg:grid-cols-3 gap-10">
              {workflow.map((item, i) => (
                <PremiumCard key={item.label} className="p-12 glass-premium hover-glow group shadow-lg-professional border-border/20 relative overflow-hidden">
                   <div className={cn("absolute inset-0 bg-gradient-to-br opacity-0 group-hover:opacity-100 transition-opacity duration-1000", item.color)} />
                   <div className="absolute right-10 top-10 text-8xl font-black text-white opacity-[0.02] select-none group-hover:scale-110 transition-transform duration-1000">{item.step}</div>
                   
                   <div className="relative z-10 space-y-8">
                      <div className={cn("h-16 w-16 rounded-[24px] border-2 flex items-center justify-center transition-all duration-700 group-hover:scale-110 group-hover:rotate-6", item.accent === 'primary' ? 'border-primary/20 bg-primary/10 text-primary' : item.accent === 'sky' ? 'border-sky-500/20 bg-sky-500/10 text-sky-500' : 'border-emerald-500/20 bg-emerald-500/10 text-emerald-500')}>
                         <item.icon className="h-8 w-8" />
                      </div>

                      <div className="space-y-4">
                         <div className="flex items-center gap-3">
                            <span className={cn("px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest text-white shadow-lg", item.accent === 'primary' ? 'bg-primary shadow-primary/20' : item.accent === 'sky' ? 'bg-sky-500 shadow-sky-500/20' : 'bg-emerald-500 shadow-emerald-500/20')}>
                               {item.label}
                            </span>
                            <span className="text-[10px] font-black text-muted-foreground/30 uppercase tracking-widest">Phase 0{i+1}</span>
                         </div>
                         <h3 className="text-2xl font-black tracking-tight leading-tight">{item.title}</h3>
                         <p className="text-sm text-muted-foreground font-medium leading-relaxed opacity-70 group-hover:opacity-100 transition-opacity">
                            {item.text}
                         </p>
                      </div>

                      <div className="flex items-center gap-3 text-[10px] font-black uppercase tracking-widest text-muted-foreground/40 pt-4">
                         <Zap className="h-3.5 w-3.5" />
                         Engine Augmented Step
                      </div>
                   </div>
                </PremiumCard>
              ))}
           </div>
        </section>

        {/* ── Footer ── */}
        <footer className="mt-40 pt-10 border-t border-border/10 flex flex-col md:flex-row items-center justify-between gap-8 text-[10px] font-black uppercase tracking-widest text-muted-foreground/30">
           <div className="flex items-center gap-4">
              <ShieldCheck className="h-4 w-4 text-primary/40" />
              <span>CLINICAL DECISION SUPPORT · HIPAA SECURE TRANSMISSION</span>
           </div>
           <div className="flex items-center gap-8">
              <span>BACKEND v2.2</span>
              <span>ENGINE v1.8</span>
              <span className="text-foreground/20">© 2025 CEPHAI SURGICAL</span>
           </div>
        </footer>
      </div>
    </div>
  );
}