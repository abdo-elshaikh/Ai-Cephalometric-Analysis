import { ArrowLeft, Compass, Home, ShieldAlert } from "lucide-react";
import { useLocation } from "wouter";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export default function NotFound() {
  const [, setLocation] = useLocation();

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-slate-950 px-5 py-10 text-slate-50">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-[-12rem] top-[-10rem] h-[30rem] w-[30rem] rounded-full bg-cyan-400/16 blur-3xl" />
        <div className="absolute bottom-[-14rem] right-[-12rem] h-[34rem] w-[34rem] rounded-full bg-emerald-300/10 blur-3xl" />
        <div className="absolute inset-0 bg-[linear-gradient(rgba(148,163,184,0.055)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.055)_1px,transparent_1px)] bg-[size:44px_44px]" />
      </div>

      <Card className="relative w-full max-w-2xl overflow-hidden rounded-[2rem] border-white/[0.12] bg-slate-900/78 text-slate-50 shadow-clinical backdrop-blur-xl">
        <CardContent className="p-8 text-center sm:p-10">
          <div className="mx-auto mb-7 flex h-20 w-20 items-center justify-center rounded-[1.7rem] border border-cyan-200/20 bg-cyan-300/10 shadow-glow">
            <Compass className="h-9 w-9 text-cyan-100" />
          </div>

          <div className="mx-auto mb-4 inline-flex items-center gap-2 rounded-full border border-amber-200/20 bg-amber-300/10 px-4 py-2 text-sm text-amber-50">
            <ShieldAlert className="h-4 w-4" />
            Route not available
          </div>

          <h1 className="text-5xl font-semibold tracking-[-0.06em] text-white sm:text-6xl">
            404
          </h1>
          <h2 className="mt-3 text-2xl font-semibold text-slate-100">
            This clinical workspace route does not exist.
          </h2>
          <p className="mx-auto mt-4 max-w-lg text-sm leading-7 text-slate-400 sm:text-base">
            The page may have moved, or the link may point outside the protected
            cephalometric workflow. Return to the workspace and continue from the
            patient, analysis, results, history, or reports modules.
          </p>

          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <Button
              onClick={() => setLocation("/")}
              className="h-12 rounded-2xl bg-cyan-200 px-6 font-semibold text-slate-950 hover:bg-cyan-100"
            >
              <Home className="mr-2 h-4 w-4" />
              Go to dashboard
            </Button>
            <Button
              variant="outline"
              onClick={() => window.history.back()}
              className="h-12 rounded-2xl border-white/15 bg-white/[0.04] px-6 text-slate-100 hover:bg-white/10"
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Button>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
