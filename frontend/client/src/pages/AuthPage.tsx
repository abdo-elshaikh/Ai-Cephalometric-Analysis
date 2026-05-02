import React, { useState, type FormEvent } from "react";
import {
  ShieldCheck,
  LockKeyhole,
  LogOut,
  ArrowRight,
  RefreshCw,
  Mail,
  Eye,
  EyeOff,
  User,
  Stethoscope,
  Cpu,
  Activity,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import { cephApi, type BackendAuthUser, type ServiceHealth } from "@/lib/ceph-api";
import { displayUserName, type ApiMode } from "@/lib/mappers";
import { isFirebaseConfigured, signInWithGoogle, firebaseLogout } from "@/lib/firebase";
import { useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type AuthMode = "login" | "register";

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        fill="#EA4335"
      />
    </svg>
  );
}

interface AuthCardProps {
  onAuthenticated: (user: BackendAuthUser) => void | Promise<void>;
  onSuccess?: () => void;
  className?: string;
}

export function AuthCard({ onAuthenticated, onSuccess, className }: AuthCardProps) {
  const [mode, setMode] = useState<AuthMode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [specialty, setSpecialty] = useState("Orthodontist");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const firebaseReady = isFirebaseConfigured();

  async function handleGoogleSignIn() {
    if (!firebaseReady) {
      toast.error("Google Sign-In is not configured. Add Firebase credentials in Settings.");
      return;
    }
    setGoogleLoading(true);
    try {
      const googleUser = await signInWithGoogle();
      const result = await cephApi.loginWithGoogle({
        uid: googleUser.uid,
        email: googleUser.email,
        displayName: googleUser.displayName,
        photoURL: googleUser.photoURL,
      });
      if (!result.ok) { toast.error(result.error); return; }
      await onAuthenticated(result.data.user);
      toast.success(`Welcome, ${googleUser.displayName ?? googleUser.email}!`);
      onSuccess?.();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Google sign-in failed.";
      if (!msg.includes("popup-closed")) toast.error(msg);
    } finally {
      setGoogleLoading(false);
    }
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    const result = mode === "login"
      ? await cephApi.login({ email, password })
      : await cephApi.register({ email, password, fullName, specialty: specialty || undefined });
    setSubmitting(false);
    if (!result.ok) { toast.error(result.error); return; }
    await onAuthenticated(result.data.user);
    toast.success(mode === "login" ? "Signed in successfully" : "Account created");
    onSuccess?.();
  }

  return (
    <div className={cn("flex flex-col gap-6", className)}>
      {/* Google button */}
      <button
        type="button"
        onClick={handleGoogleSignIn}
        disabled={googleLoading || submitting}
        className={cn(
          "relative flex h-12 w-full items-center justify-center gap-3 rounded-xl border text-sm font-semibold transition-all duration-200",
          "border-border/60 bg-background/60 text-foreground hover:bg-muted/60 hover:border-border",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
          "disabled:opacity-50 disabled:cursor-not-allowed",
          !firebaseReady && "opacity-40 cursor-not-allowed"
        )}
        title={!firebaseReady ? "Firebase credentials not configured" : undefined}
      >
        {googleLoading ? (
          <RefreshCw className="h-4 w-4 animate-spin" />
        ) : (
          <GoogleIcon className="h-5 w-5" />
        )}
        {googleLoading ? "Connecting to Google…" : "Continue with Google"}
        {!firebaseReady && (
          <span className="absolute right-3 text-[10px] text-muted-foreground/60 font-normal">not configured</span>
        )}
      </button>

      {/* Divider */}
      <div className="flex items-center gap-3">
        <div className="h-px flex-1 bg-border/40" />
        <span className="text-[11px] font-medium text-muted-foreground/60 uppercase tracking-widest">or</span>
        <div className="h-px flex-1 bg-border/40" />
      </div>

      {/* Tab switcher */}
      <div className="grid grid-cols-2 gap-1 rounded-xl border border-border/40 bg-muted/20 p-1">
        {(["login", "register"] as const).map(m => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={cn(
              "rounded-lg py-2 text-sm font-medium transition-all duration-200",
              mode === m
                ? "bg-primary text-primary-foreground shadow-md shadow-primary/20"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {m === "login" ? "Sign in" : "Register"}
          </button>
        ))}
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {mode === "register" && (
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Full name</label>
            <div className="relative">
              <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/50" />
              <input
                className="h-11 w-full rounded-xl border border-border/50 bg-muted/20 pl-10 pr-4 text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all"
                placeholder="Dr. Jane Smith"
                value={fullName}
                onChange={e => setFullName(e.target.value)}
                required
                minLength={2}
                autoComplete="name"
              />
            </div>
          </div>
        )}

        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Email</label>
          <div className="relative">
            <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/50" />
            <input
              type="email"
              className="h-11 w-full rounded-xl border border-border/50 bg-muted/20 pl-10 pr-4 text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all"
              placeholder="doctor@clinic.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Password</label>
          <div className="relative">
            <LockKeyhole className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/50" />
            <input
              type={showPassword ? "text" : "password"}
              className="h-11 w-full rounded-xl border border-border/50 bg-muted/20 pl-10 pr-11 text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all"
              placeholder={mode === "register" ? "At least 8 characters" : "Your password"}
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              minLength={mode === "register" ? 8 : 1}
              autoComplete={mode === "login" ? "current-password" : "new-password"}
            />
            <button
              type="button"
              onClick={() => setShowPassword(p => !p)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/50 hover:text-muted-foreground transition-colors"
              tabIndex={-1}
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        {mode === "register" && (
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Specialty</label>
            <div className="relative">
              <Stethoscope className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/50" />
              <input
                className="h-11 w-full rounded-xl border border-border/50 bg-muted/20 pl-10 pr-4 text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all"
                placeholder="Orthodontist"
                value={specialty}
                onChange={e => setSpecialty(e.target.value)}
              />
            </div>
          </div>
        )}

        <button
          type="submit"
          disabled={submitting || googleLoading}
          className={cn(
            "mt-1 flex h-12 w-full items-center justify-center gap-2.5 rounded-xl text-sm font-semibold transition-all duration-200",
            "bg-primary text-primary-foreground hover:bg-primary/90 shadow-lg shadow-primary/25",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
            "disabled:opacity-50 disabled:cursor-not-allowed"
          )}
        >
          {submitting ? (
            <RefreshCw className="h-4 w-4 animate-spin" />
          ) : (
            <LockKeyhole className="h-4 w-4" />
          )}
          {submitting ? "Connecting…" : mode === "login" ? "Sign in to workspace" : "Create account"}
        </button>
      </form>

      <p className="text-center text-[11px] text-muted-foreground/50 leading-relaxed">
        Protected by TLS 1.3 · HIPAA-compliant storage · Token-based sessions
      </p>
    </div>
  );
}

export function AuthDialog({
  open,
  onClose,
  onAuthenticated,
}: {
  open: boolean;
  onClose: () => void;
  onAuthenticated: (user: BackendAuthUser) => void | Promise<void>;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-md rounded-2xl border border-border/40 bg-card shadow-2xl p-8 animate-in zoom-in-95 duration-200">
        <button onClick={onClose} className="absolute right-4 top-4 rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
          <ArrowRight className="h-4 w-4 rotate-180" />
        </button>
        <h2 className="text-lg font-semibold mb-1">Backend access</h2>
        <p className="text-sm text-muted-foreground mb-6">Authenticate to load live clinical data.</p>
        <AuthCard onAuthenticated={onAuthenticated} onSuccess={onClose} />
      </div>
    </div>
  );
}

interface AuthPageProps {
  authUser: BackendAuthUser | null;
  apiMode: ApiMode;
  serviceHealth: ServiceHealth;
  onAuthenticated: (user: BackendAuthUser) => void | Promise<void>;
  onLogout: () => void | Promise<void>;
  onRefreshHealth: () => void | Promise<void>;
}

const FEATURES = [
  {
    icon: Cpu,
    title: "AI-Powered Landmark Detection",
    detail: "HRNet-W32 detects 80 anatomical landmarks automatically. 90+ cephalometric measurements computed in seconds.",
  },
  {
    icon: Activity,
    title: "Multi-Protocol Analysis",
    detail: "Steiner, Ricketts, McNamara, Tweed, Jarabak, and Downs — with population-specific norm databases.",
  },
  {
    icon: ShieldCheck,
    title: "HIPAA-Compliant & Audited",
    detail: "End-to-end encrypted patient records. Full audit trail of all diagnostic overrides and landmark edits.",
  },
];

const SERVICES = [
  { label: "Clinical Backend", key: "backend" as const },
  { label: "AI Inference Engine", key: "ai" as const },
];

export default function AuthPage({
  authUser,
  apiMode,
  serviceHealth,
  onAuthenticated,
  onLogout,
  onRefreshHealth,
}: AuthPageProps) {
  const [, navigate] = useLocation();

  async function handleLogout() {
    await firebaseLogout().catch(() => {});
    await onLogout();
  }

  return (
    <div className="min-h-[calc(100vh-6rem)] flex flex-col lg:flex-row gap-0 rounded-2xl overflow-hidden border border-border/30 shadow-2xl animate-in fade-in duration-500">

      {/* ── Left panel: branding + features ── */}
      <div className="relative flex flex-col justify-between overflow-hidden bg-gradient-to-br from-[oklch(0.13_0.025_275)] via-[oklch(0.11_0.018_265)] to-[oklch(0.09_0.012_265)] p-8 lg:p-12 lg:w-[52%]">

        {/* Decorative glows */}
        <div className="pointer-events-none absolute -top-24 -left-24 h-64 w-64 rounded-full bg-primary/20 blur-3xl" />
        <div className="pointer-events-none absolute bottom-12 right-0 h-48 w-48 rounded-full bg-primary/10 blur-2xl" />

        {/* Logo */}
        <div className="relative flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/15 border border-primary/25 shadow-inner">
            <ShieldCheck className="h-5 w-5 text-primary" />
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-primary/60">CephAI</p>
            <p className="text-sm font-semibold text-white/90">Clinical Platform</p>
          </div>
        </div>

        {/* Headline */}
        <div className="relative my-10 lg:my-0">
          <p className="text-[11px] font-bold uppercase tracking-[0.28em] text-primary/50 mb-3">Clinical Gateway</p>
          <h1 className="text-3xl sm:text-4xl lg:text-[2.6rem] font-bold leading-[1.15] tracking-tight text-white">
            Advanced cephalometric<br />
            <span className="text-primary">analysis platform.</span>
          </h1>
          <p className="mt-4 text-[15px] text-white/50 leading-relaxed max-w-sm">
            Automated landmark detection and clinical reporting for orthodontic and surgical treatment planning.
          </p>

          {/* Feature list */}
          <div className="mt-10 space-y-5">
            {FEATURES.map(feat => (
              <div key={feat.title} className="flex gap-4">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 border border-primary/20">
                  <feat.icon className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-white/85">{feat.title}</p>
                  <p className="text-[13px] text-white/40 mt-0.5 leading-relaxed">{feat.detail}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Service health */}
        <div className="relative">
          <div className="flex items-center justify-between mb-3">
            <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-white/30">Infrastructure Status</p>
            <button
              onClick={onRefreshHealth}
              className="rounded-lg p-1.5 text-white/30 hover:text-white/60 hover:bg-white/5 transition-all"
              title="Refresh health"
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {SERVICES.map(svc => {
              const ok = serviceHealth[svc.key].ok;
              return (
                <div key={svc.key} className="rounded-xl border border-white/8 bg-white/4 p-3">
                  <div className="flex items-center justify-between mb-1.5">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-white/30">{svc.label}</p>
                    <div className={cn("h-1.5 w-1.5 rounded-full", ok ? "bg-green-400" : "bg-amber-400")} />
                  </div>
                  <p className="text-sm font-semibold text-white/60">{serviceHealth[svc.key].status}</p>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Right panel: auth form ── */}
      <div className="flex flex-1 flex-col justify-center p-8 lg:px-14 lg:py-12 bg-card">

        {authUser ? (
          /* ── Authenticated state ── */
          <div className="mx-auto w-full max-w-sm space-y-6 animate-in fade-in duration-300">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.28em] text-primary/60 mb-2">Active Session</p>
              <h2 className="text-2xl font-bold tracking-tight">You're signed in.</h2>
              <p className="text-sm text-muted-foreground mt-1">Your clinical workspace is active and ready.</p>
            </div>

            <div className="rounded-xl border border-border/40 bg-muted/20 p-5 space-y-3">
              <div className="flex items-center gap-3">
                {authUser.profileImageUrl ? (
                  <img src={authUser.profileImageUrl} className="h-10 w-10 rounded-full border border-border/40" alt="" />
                ) : (
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 border border-primary/20">
                    <User className="h-5 w-5 text-primary" />
                  </div>
                )}
                <div>
                  <p className="text-sm font-semibold">{displayUserName(authUser)}</p>
                  <p className="text-xs text-muted-foreground">{authUser.email}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground pt-1 border-t border-border/30">
                <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                {apiMode === "live" ? "Connected to clinical backend" : "Using local demo data"}
              </div>
            </div>

            <div className="flex flex-col gap-3">
              <button
                onClick={() => navigate("/")}
                className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold shadow-lg shadow-primary/20 hover:bg-primary/90 transition-all"
              >
                <ArrowRight className="h-4 w-4" />
                Go to Dashboard
              </button>
              <button
                onClick={handleLogout}
                className="flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-border/50 bg-transparent text-sm font-medium text-muted-foreground hover:border-red-500/50 hover:text-red-400 hover:bg-red-500/5 transition-all"
              >
                <LogOut className="h-4 w-4" />
                Sign Out
              </button>
            </div>

            <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 flex gap-3">
              <AlertCircle className="h-4 w-4 text-amber-400 mt-0.5 shrink-0" />
              <p className="text-xs text-amber-300/80 leading-relaxed">
                Backend connectivity depends on the clinical server being online. Some features may show demo data when offline.
              </p>
            </div>
          </div>
        ) : (
          /* ── Unauthenticated state: show form ── */
          <div className="mx-auto w-full max-w-sm">
            <div className="mb-8">
              <p className="text-[11px] font-bold uppercase tracking-[0.28em] text-primary/60 mb-2">Secure access</p>
              <h2 className="text-2xl font-bold tracking-tight">Welcome back.</h2>
              <p className="text-sm text-muted-foreground mt-1">Sign in to access your clinical workspace.</p>
            </div>

            <AuthCard onAuthenticated={onAuthenticated} onSuccess={() => navigate("/")} />
          </div>
        )}
      </div>
    </div>
  );
}
