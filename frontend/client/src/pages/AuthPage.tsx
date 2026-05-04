import React, { useState, type FormEvent } from "react";
import {
  ArrowRight,
  Building2,
  Eye,
  EyeOff,
  LockKeyhole,
  LogOut,
  Mail,
  RefreshCw,
  ShieldCheck,
  User,
} from "lucide-react";
import { cephApi, type BackendAuthUser, type ServiceHealth } from "@/lib/ceph-api";
import { displayUserName, type ApiMode } from "@/lib/mappers";
import { isFirebaseConfigured, signInWithGoogle, firebaseLogout } from "@/lib/firebase";
import { useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import ThemeToggle from "@/components/ThemeToggle";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type AuthMode = "login" | "register";

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
    </svg>
  );
}

function SectionIcon({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-8 w-8 items-center justify-center rounded-xl border border-border/70 bg-background/80 text-foreground shadow-sm">
      {children}
    </div>
  );
}

function StatusDot({ ok }: { ok: boolean }) {
  return <span className={cn("h-2 w-2 rounded-full", ok ? "bg-emerald-500 shadow-[0_0_0_4px_rgba(16,185,129,0.12)]" : "bg-amber-500 shadow-[0_0_0_4px_rgba(245,158,11,0.12)]")} />;
}

function ModeToggle({ mode, setMode }: { mode: AuthMode; setMode: (value: AuthMode) => void }) {
  return (
    <div className="inline-flex rounded-full border border-border/70 bg-background/70 p-1 shadow-sm backdrop-blur">
      {(["login", "register"] as const).map(value => {
        const active = mode === value;
        return (
          <button
            key={value}
            type="button"
            onClick={() => setMode(value)}
            className={cn(
              "rounded-full px-4 py-2 text-sm font-medium transition-colors",
              active ? "bg-foreground text-background shadow-sm" : "text-muted-foreground hover:text-foreground"
            )}
          >
            {value === "login" ? "Sign in" : "Create account"}
          </button>
        );
      })}
    </div>
  );
}

function AuthField({
  label,
  icon,
  className,
  ...props
}: React.ComponentProps<typeof Input> & { label: string; icon: React.ReactNode }) {
  return (
    <label className="space-y-2">
      <span className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
        {icon}
        {label}
      </span>
      <Input className={cn("h-11 rounded-xl border-border/70 bg-background/80 shadow-sm placeholder:text-muted-foreground/40", className)} {...props} />
    </label>
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
      toast.error("Google sign-in is not enabled in this environment.");
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

      if (!result.ok) {
        toast.error(result.error);
        return;
      }

      await onAuthenticated(result.data.user);
      toast.success(`Welcome, ${googleUser.displayName ?? googleUser.email}.`);
      onSuccess?.();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Google authentication failed.";
      if (!msg.includes("popup-closed")) {
        toast.error(msg);
      }
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

    if (!result.ok) {
      toast.error(result.error);
      return;
    }

    await onAuthenticated(result.data.user);
    toast.success(mode === "login" ? "Session initialized" : "Clinical profile created");
    onSuccess?.();
  }

  return (
    <Card className={cn("w-full max-w-md border-border/70 bg-card/85 shadow-[0_24px_80px_-48px_rgba(15,23,42,0.35)] backdrop-blur-xl", className)}>
      <CardHeader className="space-y-4 pb-2">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-background/70 px-3 py-1 text-[11px] font-medium text-muted-foreground">
              <ShieldCheck className="h-3.5 w-3.5 text-foreground" />
              Secure access
            </div>
            <CardTitle className="text-2xl font-semibold tracking-tight">
              {mode === "login" ? "Sign in" : "Create your account"}
            </CardTitle>
            <CardDescription className="max-w-sm text-sm leading-6">
              Minimal access point for the CephAI clinical workspace.
            </CardDescription>
          </div>

          <div className="hidden sm:block">
            <SectionIcon>
              <ShieldCheck className="h-4 w-4" />
            </SectionIcon>
          </div>
        </div>

        <ModeToggle mode={mode} setMode={setMode} />
      </CardHeader>

      <CardContent className="space-y-5 pt-4">
        <Button
          type="button"
          variant="outline"
          className="h-11 w-full justify-center rounded-xl border-border/70 bg-background/70 text-sm font-medium shadow-sm backdrop-blur"
          onClick={handleGoogleSignIn}
          disabled={googleLoading || submitting || !firebaseReady}
        >
          {googleLoading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <GoogleIcon className="h-4 w-4" />}
          {googleLoading ? "Connecting" : "Continue with Google"}
        </Button>

        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-border/70" />
          </div>
          <div className="relative flex justify-center">
            <span className="rounded-full bg-card px-3 text-[11px] uppercase tracking-[0.24em] text-muted-foreground">
              Or use email
            </span>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === "register" && (
            <AuthField
              label="Full name"
              icon={<User className="h-3.5 w-3.5" />}
              placeholder="Dr. Alexander Wright"
              value={fullName}
              onChange={e => setFullName(e.target.value)}
              required
              minLength={2}
              autoComplete="name"
            />
          )}

          <AuthField
            label="Email address"
            icon={<Mail className="h-3.5 w-3.5" />}
            type="email"
            placeholder="you@clinic.com"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
            autoComplete="email"
          />

          <label className="space-y-2">
            <span className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
              <LockKeyhole className="h-3.5 w-3.5" />
              Password
            </span>
            <div className="relative">
              <Input
                type={showPassword ? "text" : "password"}
                className="h-11 rounded-xl border-border/70 bg-background/80 pr-11 shadow-sm placeholder:text-muted-foreground/40"
                placeholder="••••••••"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                minLength={mode === "register" ? 8 : 1}
                autoComplete={mode === "login" ? "current-password" : "new-password"}
              />
              <button
                type="button"
                onClick={() => setShowPassword(prev => !prev)}
                className="absolute inset-y-0 right-0 flex items-center px-3 text-muted-foreground transition-colors hover:text-foreground"
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </label>

          {mode === "register" && (
            <AuthField
              label="Specialty"
              icon={<Building2 className="h-3.5 w-3.5" />}
              placeholder="Maxillofacial Surgeon"
              value={specialty}
              onChange={e => setSpecialty(e.target.value)}
            />
          )}

          <Button
            type="submit"
            disabled={submitting || googleLoading}
            className="h-11 w-full rounded-xl bg-foreground text-background shadow-sm transition-transform hover:translate-y-[-1px] active:translate-y-0"
          >
            {submitting ? <RefreshCw className="h-4 w-4 animate-spin" /> : <LockKeyhole className="h-4 w-4" />}
            {submitting ? "Processing" : mode === "login" ? "Sign in" : "Create account"}
          </Button>
        </form>

        <div className="flex items-center justify-between gap-3 text-[11px] text-muted-foreground">
          <span className="uppercase tracking-[0.22em]">Protected session</span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            TLS 1.3
          </span>
        </div>
      </CardContent>
    </Card>
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

const SERVICES = [
  { label: "Clinical Nexus", key: "backend" as const },
  { label: "Neural Engine", key: "ai" as const },
];

function ServiceRow({ label, status, ok }: { label: string; status: string; ok: boolean }) {
  return (
    <div className="flex items-center justify-between rounded-2xl border border-border/70 bg-background/70 px-4 py-3">
      <div>
        <div className="text-sm font-medium">{label}</div>
        <div className="text-xs text-muted-foreground">Runtime status</div>
      </div>
      <div className={cn("inline-flex items-center gap-2 text-xs font-medium uppercase tracking-[0.18em]", ok ? "text-emerald-600" : "text-amber-600")}>
        <StatusDot ok={ok} />
        {status}
      </div>
    </div>
  );
}

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
    await firebaseLogout().catch(() => { });
    await onLogout();
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-background text-foreground">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(59,130,246,0.12),transparent_30%),radial-gradient(circle_at_bottom_right,rgba(16,185,129,0.10),transparent_28%)] dark:bg-[radial-gradient(circle_at_top_left,rgba(59,130,246,0.20),transparent_30%),radial-gradient(circle_at_bottom_right,rgba(16,185,129,0.14),transparent_28%)]" />
      <div className="relative mx-auto grid min-h-screen max-w-[1440px] lg:grid-cols-[1.05fr_minmax(0,0.95fr)]">
        <aside className="hidden flex-col justify-between border-r border-border/70 bg-background/65 px-8 py-10 backdrop-blur xl:flex xl:px-12">
          <div className="space-y-10">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-border/70 bg-foreground text-background shadow-sm">
                  <ShieldCheck className="h-5 w-5" />
                </div>
                <div>
                  <div className="text-sm font-semibold tracking-tight">CephAI</div>
                  <div className="text-xs text-muted-foreground">Clinical access portal</div>
                </div>
              </div>
              <ThemeToggle />
            </div>

            <div className="max-w-md space-y-4">
              <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-muted-foreground">Secure authentication</p>
              <h1 className="max-w-lg text-4xl font-semibold tracking-tight text-foreground">
                Access the clinical workspace.
              </h1>
              <p className="max-w-lg text-base leading-7 text-muted-foreground">
                Sign in to review patient studies, clinical artifacts, and service status from a single controlled entry point.
              </p>
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between text-xs uppercase tracking-[0.22em] text-muted-foreground">
              <span>Service health</span>
              <Button type="button" variant="ghost" size="sm" onClick={onRefreshHealth} className="h-8 rounded-full px-3 text-xs">
                Refresh
                <RefreshCw className="h-3.5 w-3.5" />
              </Button>
            </div>
            <div className="space-y-3">
              {SERVICES.map(service => (
                <ServiceRow
                  key={service.key}
                  label={service.label}
                  status={serviceHealth[service.key].status}
                  ok={serviceHealth[service.key].ok}
                />
              ))}
            </div>
          </div>
        </aside>

        <main className="relative flex items-center justify-center px-4 py-10 sm:px-6 lg:px-10">
          <div className="absolute right-4 top-4 z-10 xl:hidden">
            <ThemeToggle />
          </div>

          <div className="w-full max-w-xl space-y-6">
            <div className="flex items-center justify-between gap-4 xl:hidden">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-border/70 bg-foreground text-background shadow-sm">
                  <ShieldCheck className="h-4 w-4" />
                </div>
                <div>
                  <div className="text-sm font-semibold tracking-tight">CephAI</div>
                  <div className="text-xs text-muted-foreground">Clinical access portal</div>
                </div>
              </div>
            </div>

            {authUser ? (
              <Card className="border-border/70 bg-card/85 shadow-[0_24px_80px_-48px_rgba(15,23,42,0.35)] backdrop-blur-xl">
                <CardHeader className="space-y-3 pb-2">
                  <div className="inline-flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.22em] text-muted-foreground">
                    <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" />
                    Verified session
                  </div>
                  <div>
                    <CardTitle className="text-2xl font-semibold tracking-tight">Welcome back</CardTitle>
                    <CardDescription className="mt-2 text-sm leading-6">
                      Your session is active and the workspace is ready.
                    </CardDescription>
                  </div>
                </CardHeader>

                <CardContent className="space-y-5 pt-4">
                  <div className="rounded-2xl border border-border/70 bg-background/70 p-5">
                    <div className="flex items-center gap-4">
                      <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-border/70 bg-foreground text-sm font-semibold text-background uppercase">
                        {displayUserName(authUser).slice(0, 2)}
                      </div>
                      <div className="min-w-0">
                        <div className="truncate text-base font-semibold tracking-tight">{displayUserName(authUser)}</div>
                        <div className="truncate text-sm text-muted-foreground">{authUser.email}</div>
                      </div>
                    </div>

                    <div className="mt-5 grid gap-3 sm:grid-cols-2">
                      <div className="rounded-xl border border-border/70 bg-card/80 px-4 py-3">
                        <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Session</div>
                        <div className="mt-1 text-sm font-medium text-emerald-600">Active</div>
                      </div>
                      <div className="rounded-xl border border-border/70 bg-card/80 px-4 py-3">
                        <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Mode</div>
                        <div className="mt-1 text-sm font-medium">{apiMode === "live" ? "Cloud" : "Local"}</div>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <Button
                      type="button"
                      onClick={() => navigate("/")}
                      className="h-11 w-full rounded-xl bg-foreground text-background shadow-sm transition-transform hover:translate-y-[-1px] active:translate-y-0"
                    >
                      Open workspace
                      <ArrowRight className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleLogout}
                      className="h-11 w-full rounded-xl border-border/70 bg-background/70 shadow-sm"
                    >
                      <LogOut className="h-4 w-4" />
                      End session
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <AuthCard onAuthenticated={onAuthenticated} onSuccess={() => navigate("/")} />
            )}

            <div className="xl:hidden">
              <div className="flex items-center justify-between text-xs uppercase tracking-[0.22em] text-muted-foreground">
                <span>Service health</span>
                <Button type="button" variant="ghost" size="sm" onClick={onRefreshHealth} className="h-8 rounded-full px-3 text-xs">
                  Refresh
                  <RefreshCw className="h-3.5 w-3.5" />
                </Button>
              </div>
              <div className="mt-3 space-y-3">
                {SERVICES.map(service => (
                  <ServiceRow
                    key={service.key}
                    label={service.label}
                    status={serviceHealth[service.key].status}
                    ok={serviceHealth[service.key].ok}
                  />
                ))}
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
