import React, { useState, type FormEvent } from "react";
import { 
  ShieldCheck, 
  Database, 
  LockKeyhole, 
  Users, 
  Cpu, 
  RefreshCw, 
  LogOut, 
  ArrowUpRight,
  Activity
} from "lucide-react";
import { 
  Card, 
  Pill, 
  PrimaryBtn, 
  SecondaryBtn, 
  DangerBtn, 
  IconBtn, 
  PageHeader, 
  Divider,
  Field,
  TextInput,
  Modal
} from "@/components/_core/ClinicalComponents";
import { 
  cephApi, 
  type BackendAuthUser, 
  type ServiceHealth 
} from "@/lib/ceph-api";
import { 
  displayUserName,
  type ApiMode
} from "@/lib/mappers";
import { useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type AuthMode = "login" | "register";

interface AuthCardProps {
  onAuthenticated: (user: BackendAuthUser) => void | Promise<void>;
  onSuccess?: () => void;
  className?: string;
}

export function AuthCard({
  onAuthenticated,
  onSuccess,
  className,
}: AuthCardProps) {
  const [mode, setMode] = useState<AuthMode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [specialty, setSpecialty] = useState("Orthodontist");
  const [submitting, setSubmitting] = useState(false);

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
    <Card className={cn("relative overflow-hidden", className)}>
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/50 to-transparent" />

      <div className="p-6 pb-5">
        <p className="text-[11px] font-bold uppercase tracking-[0.28em] text-primary/60">Secure access</p>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
          {mode === "login" ? "Welcome back" : "Create account"}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {mode === "login" ? "Sign in to access your clinical workspace." : "Register for authenticated backend access."}
        </p>
      </div>

      <Divider />

      <div className="p-6 pt-5">
        <div className="mb-5 grid grid-cols-2 gap-1 rounded-xl border border-border/40 bg-muted/20 p-1">
          {(["login", "register"] as const).map(m => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={cn(
                "rounded-lg py-2 text-sm font-medium transition-all duration-200",
                mode === m ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {m === "login" ? "Sign in" : "Register"}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === "register" && (
            <Field label="Full name">
              <TextInput value={fullName} onChange={setFullName} required minLength={2} placeholder="Dr. Clinic User" />
            </Field>
          )}
          <Field label="Email">
            <TextInput type="email" value={email} onChange={setEmail} required placeholder="doctor@clinic.com" />
          </Field>
          <Field label="Password">
            <TextInput type="password" value={password} onChange={setPassword} required minLength={mode === "register" ? 8 : 1} placeholder={mode === "register" ? "At least 8 characters" : "Your password"} />
          </Field>
          {mode === "register" && (
            <Field label="Specialty">
              <TextInput value={specialty} onChange={setSpecialty} />
            </Field>
          )}
          <div className="grid grid-cols-2 gap-3 rounded-xl border border-border/40 bg-muted/20 p-3 text-xs text-muted-foreground">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-3.5 w-3.5 text-success" />
              Token-based session
            </div>
            <div className="flex items-center gap-2">
              <Database className="h-3.5 w-3.5 text-primary" />
              Workspace hydration
            </div>
          </div>
          <PrimaryBtn type="submit" disabled={submitting} loading={submitting} icon={LockKeyhole} className="w-full justify-center h-12">
            {submitting ? "Connecting…" : mode === "login" ? "Sign in" : "Create account"}
          </PrimaryBtn>
        </form>
      </div>
    </Card>
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
  return (
    <Modal open={open} onClose={onClose} title="Backend access" description="Authenticate to load live clinical data from the server.">
      <AuthCard onAuthenticated={onAuthenticated} onSuccess={onClose} className="border-0 bg-transparent shadow-none p-0" />
    </Modal>
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

export default function AuthPage({
  authUser,
  apiMode,
  serviceHealth,
  onAuthenticated,
  onLogout,
  onRefreshHealth,
}: AuthPageProps) {
  const [, navigate] = useLocation();
  const connected = apiMode === "live";

  return (
    <div className="space-y-10 animate-in fade-in duration-500">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
        <PageHeader
          eyebrow="Clinical Gateway"
          title="Authenticate your session."
          description="Access live clinical records, AI processing, and patient history through our secure backend gateway."
          actions={
            <SecondaryBtn onClick={() => navigate("/")} disabled={!authUser} icon={ArrowUpRight}>
              Back to dashboard
            </SecondaryBtn>
          }
        />
        <Pill tone={connected ? "success" : "warning"} size="md" className="h-fit">
          {connected ? "Connected to Clinical Server" : "Disconnected from Backend"}
        </Pill>
      </div>

      <div className="grid gap-8 lg:grid-cols-2">
        <div className="space-y-6">
          {/* Identity panel */}
          <Card className="relative p-0 overflow-hidden group border-border/40">
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-transparent opacity-50" />
            <div className="p-8 relative">
              <div className="flex items-center gap-4">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary border border-primary/20 shadow-inner">
                   <ShieldCheck className="h-7 w-7" />
                </div>
                <div>
                   <h3 className="text-xl font-bold tracking-tight">Clinical Identity</h3>
                   <p className="text-sm text-muted-foreground">{authUser ? "Session verified and active." : "Sign in to verify your credentials."}</p>
                </div>
              </div>
              
              <div className="mt-8 space-y-4">
                 <div className="flex items-center justify-between p-4 rounded-xl border border-border/40 bg-muted/20">
                    <div className="flex items-center gap-3">
                       <Users className="h-4 w-4 text-muted-foreground" />
                       <span className="text-sm font-medium">User Profile</span>
                    </div>
                    <span className="text-sm font-bold">{authUser ? displayUserName(authUser) : "Unauthenticated"}</span>
                 </div>
                 <div className="flex items-center justify-between p-4 rounded-xl border border-border/40 bg-muted/20">
                    <div className="flex items-center gap-3">
                       <Database className="h-4 w-4 text-muted-foreground" />
                       <span className="text-sm font-medium">Workspace Access</span>
                    </div>
                    <Pill tone={authUser ? "success" : "neutral"}>{authUser ? "Authorized" : "Locked"}</Pill>
                 </div>
              </div>

              {authUser && (
                <div className="mt-8">
                   <DangerBtn onClick={onLogout} icon={LogOut} className="w-full justify-center h-12">
                     Terminate Session
                   </DangerBtn>
                </div>
              )}
            </div>
          </Card>

          {/* Infrastructure status */}
          <Card className="p-8 border-border/40">
            <div className="flex items-center justify-between mb-6">
               <h3 className="text-lg font-bold tracking-tight flex items-center gap-2">
                 <Cpu className="h-5 w-5 text-primary" />
                 Infrastructure Health
               </h3>
               <IconBtn icon={RefreshCw} label="Refresh" onClick={onRefreshHealth} variant="outline" size="sm" />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
               {[
                 { label: "Clinical Backend", ok: serviceHealth.backend.ok, status: serviceHealth.backend.status },
                 { label: "AI Inference Engine", ok: serviceHealth.ai.ok, status: serviceHealth.ai.status }
               ].map(service => (
                 <div key={service.label} className="p-4 rounded-xl border border-border/40 bg-muted/30">
                    <div className="flex items-center justify-between mb-2">
                       <span className="text-xs font-bold text-muted-foreground uppercase tracking-widest">{service.label}</span>
                       <div className={cn("h-2 w-2 rounded-full", service.ok ? "bg-success" : "bg-warning")} />
                    </div>
                    <p className="text-sm font-bold">{service.status}</p>
                 </div>
               ))}
            </div>
          </Card>
        </div>

        <div className="space-y-6">
           <AuthCard onAuthenticated={onAuthenticated} onSuccess={() => navigate("/")} className="border-border/40" />
           
           <Card className="p-8 bg-primary/5 border-primary/20">
              <h3 className="text-sm font-bold uppercase tracking-[0.2em] text-primary mb-4">Enterprise Capabilities</h3>
              <div className="space-y-4">
                 {[
                   { title: "Advanced Morphometrics", detail: "Automated Steiner, Ricketts, and Downs analysis with precision scaling.", icon: Activity },
                   { title: "Clinical Accountability", detail: "Full audit trail of all landmark modifications and diagnostic overrides.", icon: ShieldCheck },
                   { title: "Secure Data Sovereignity", detail: "End-to-end encrypted patient records with role-based access control.", icon: ShieldCheck }
                 ].map(item => (
                   <div key={item.title} className="flex gap-4">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                         <item.icon className="h-4.5 w-4.5" />
                      </div>
                      <div>
                         <p className="text-sm font-bold">{item.title}</p>
                         <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{item.detail}</p>
                      </div>
                   </div>
                 ))}
              </div>
           </Card>
        </div>
      </div>
    </div>
  );
}
