import { ArrowLeft, Compass, Home, ShieldAlert, Target, Sparkles, Map, Search } from "lucide-react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Pill } from "@/components/_core/ClinicalComponents";

export default function NotFound() {
  const [, setLocation] = useLocation();

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#050508] px-6 py-10 text-foreground selection:bg-primary/30">
      
      {/* ── Ambient Background ── */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-[-12rem] top-[-10rem] h-[50rem] w-[50rem] rounded-full bg-primary/10 blur-[160px] animate-pulse duration-[15s]" />
        <div className="absolute bottom-[-14rem] right-[-12rem] h-[40rem] w-[40rem] rounded-full bg-emerald-500/10 blur-[160px] animate-pulse duration-[12s]" />
        <div className="absolute inset-0 bg-[linear-gradient(rgba(148,163,184,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.03)_1px,transparent_1px)] bg-[size:44px_44px]" />
        <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-[0.15] brightness-100 contrast-150 pointer-events-none" />
      </div>

      <div className="relative w-full max-w-2xl animate-in fade-in zoom-in-95 duration-700">
        <Card className="relative overflow-hidden rounded-[48px] border-border/20 bg-card/10 backdrop-blur-3xl shadow-2xl-professional border-2">
          
          {/* Decorative scan line */}
          <div className="absolute inset-0 pointer-events-none overflow-hidden">
            <div className="absolute inset-x-0 h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent animate-scan-line" style={{ top: '30%' }} />
          </div>

          <CardContent className="p-12 sm:p-20 text-center relative z-10 space-y-10">
            <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-[32px] border-2 border-primary/20 bg-primary/10 shadow-2xl shadow-primary/20 group hover:rotate-12 transition-transform duration-700">
              <Compass className="h-10 w-10 text-primary" />
            </div>

            <div className="space-y-4">
               <div className="flex items-center justify-center gap-3">
                 <div className="h-1 w-6 rounded-full bg-amber-500" />
                 <span className="text-[10px] font-black uppercase tracking-[0.3em] text-amber-500">Route De-synchronized</span>
               </div>
               
               <h1 className="text-8xl font-black tracking-tighter text-white leading-none">
                 404
               </h1>
               
               <h2 className="text-2xl font-black tracking-tight text-foreground/90">
                 Diagnostic Endpoint Not Found
               </h2>
               
               <p className="mx-auto max-w-sm text-sm font-medium leading-relaxed text-muted-foreground/60">
                 The requested resource identifier does not map to a valid clinical workflow. Return to the neural core to re-establish session parameters.
               </p>
            </div>

            <div className="flex flex-col sm:flex-row justify-center gap-4 pt-6">
              <button
                onClick={() => setLocation("/")}
                className="h-14 px-10 rounded-2xl bg-primary text-primary-foreground font-black uppercase tracking-[0.2em] text-[10px] shadow-2xl shadow-primary/20 hover-lift transition-all flex items-center justify-center gap-3"
              >
                <Home className="h-4 w-4" />
                Return to Core
              </button>
              <button
                onClick={() => window.history.back()}
                className="h-14 px-10 rounded-2xl border-2 border-white/5 bg-white/5 backdrop-blur-md text-white font-black uppercase tracking-[0.2em] text-[10px] hover:bg-white/10 transition-all flex items-center justify-center gap-3"
              >
                <ArrowLeft className="h-4 w-4" />
                Previous Step
              </button>
            </div>

            <div className="pt-10 flex items-center justify-center gap-6">
               <div className="flex items-center gap-2">
                  <div className="h-1.5 w-1.5 rounded-full bg-primary/40" />
                  <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground/30">PATIENT REGISTRY</span>
               </div>
               <div className="flex items-center gap-2">
                  <div className="h-1.5 w-1.5 rounded-full bg-primary/40" />
                  <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground/30">NEURAL ANALYSIS</span>
               </div>
               <div className="flex items-center gap-2">
                  <div className="h-1.5 w-1.5 rounded-full bg-primary/40" />
                  <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground/30">SYSTEM AUDIT</span>
               </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
