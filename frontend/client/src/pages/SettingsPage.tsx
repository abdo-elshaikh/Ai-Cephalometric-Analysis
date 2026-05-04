import React, { useState } from "react";
import {
  Palette, SlidersHorizontal, BrainCircuit, Bell, Shield, RefreshCw, RotateCcw,
  CheckCircle2, Monitor, Moon, Sun, Zap, Download, Trash2, Info, ChevronRight,
  Layout, FileText, Target, ShieldCheck, Cpu, HardDrive, Settings as SettingsIcon,
  Sparkles, Fingerprint, Eye, Layers,
} from "lucide-react";
import {
  Card, PageHeader, PrimaryBtn, SecondaryBtn, Switch, Field, Select, Divider, TextInput, Pill,
} from "@/components/_core/ClinicalComponents";
import { useTheme } from "@/contexts/ThemeContext";
import {
  useSettings, DEFAULT_SETTINGS, type CephSettings, type AnalysisTypeDefault,
  type PopulationNorm, type UIDensity, type RefreshInterval, type ReportFormat,
} from "@/lib/settings";
import { cn } from "@/lib/utils";

// ─── Section wrapper ──────────────────────────────────────────────────────────

function Section({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: React.ElementType;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-10 lg:grid-cols-[320px_1fr] animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="space-y-4">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-[18px] border border-primary/20 bg-primary/5 text-primary shadow-sm shadow-primary/5">
            <Icon className="h-6 w-6" />
          </div>
          <h2 className="text-xl font-black tracking-tight text-foreground">{title}</h2>
        </div>
        <p className="text-sm leading-relaxed text-muted-foreground font-medium pl-1">{description}</p>
      </div>
      <Card className="p-10 glass-premium shadow-md-professional border-border/40 space-y-8">
        {children}
      </Card>
    </div>
  );
}

// ─── Row helper ───────────────────────────────────────────────────────────────

function SettingRow({
  label,
  description,
  children,
  danger,
}: {
  label: string;
  description?: string;
  children: React.ReactNode;
  danger?: boolean;
}) {
  return (
    <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 flex-1">
        <p className={cn("text-sm font-black uppercase tracking-widest", danger ? "text-rose-500" : "text-foreground/80")}>
          {label}
        </p>
        {description && (
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground font-medium opacity-70">{description}</p>
        )}
      </div>
      <div className="shrink-0 flex items-center">{children}</div>
    </div>
  );
}

// ─── Theme Selector ──────────────────────────────────────────────────────────

function ThemeSelector() {
  const { theme, toggleTheme } = useTheme();
  const options = [
    { id: "light", label: "Light", icon: Sun },
    { id: "dark", label: "Dark", icon: Moon },
  ];
  const active = theme ?? "dark";

  return (
    <div className="flex bg-muted/20 p-1.5 rounded-[20px] border border-border/20 backdrop-blur-sm">
      {options.map(opt => {
        const Icon = opt.icon;
        const isActive = opt.id === active;
        return (
          <button
            key={opt.id}
            type="button"
            onClick={() => { if (!isActive) toggleTheme?.(); }}
            className={cn(
              "flex items-center gap-3 px-6 py-3 rounded-[16px] text-[10px] font-black uppercase tracking-widest transition-all",
              isActive
                ? "bg-background text-primary shadow-lg-professional border border-border/40"
                : "text-muted-foreground/60 hover:text-foreground"
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

// ─── Density selector ─────────────────────────────────────────────────────────

function DensitySelector({
  value,
  onChange,
}: {
  value: UIDensity;
  onChange: (v: UIDensity) => void;
}) {
  const opts: { id: UIDensity; label: string; icon: any }[] = [
    { id: "compact", label: "Compact", icon: Layout },
    { id: "comfortable", label: "Standard", icon: Monitor },
    { id: "spacious", label: "Zen", icon: Sparkles },
  ];
  return (
    <div className="flex bg-muted/20 p-1.5 rounded-[20px] border border-border/20 backdrop-blur-sm">
      {opts.map(o => (
        <button
          key={o.id}
          type="button"
          onClick={() => onChange(o.id)}
          className={cn(
            "flex items-center gap-3 px-5 py-3 rounded-[16px] text-[10px] font-black uppercase tracking-widest transition-all",
            value === o.id
              ? "bg-background text-primary shadow-lg-professional border border-border/40"
              : "text-muted-foreground/60 hover:text-foreground"
          )}
        >
          <o.icon className="h-3.5 w-3.5" />
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ─── Confidence slider ────────────────────────────────────────────────────────

function ConfidenceSlider({
  value,
  onChange,
}: {
  value: number;
  onChange: (v: number) => void;
}) {
  const pct = Math.round(value * 100);
  const label =
    pct >= 85 ? "High Precision Protocol" :
      pct >= 70 ? "Balanced Synthesis" :
        "Lenient Heuristics";

  return (
    <div className="space-y-4 w-full max-w-[300px]">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60">{label}</span>
        <span className="text-sm font-black tabular-nums text-primary">{pct}%</span>
      </div>
      <div className="relative pt-1">
        <input
          type="range"
          min={50}
          max={95}
          step={5}
          value={pct}
          onChange={e => onChange(Number(e.target.value) / 100)}
          className="w-full h-1.5 bg-muted rounded-full appearance-none accent-primary cursor-pointer hover:bg-muted/60 transition-all"
        />
        <div className="flex justify-between text-[9px] font-black uppercase tracking-widest text-muted-foreground/20 mt-2">
          <span>50%</span>
          <span>75%</span>
          <span>95%</span>
        </div>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const { settings, update, reset } = useSettings();
  const [saved, setSaved] = useState(false);

  function handleSave() {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  function handleClearCache() {
    try {
      const keysToKeep = ["cephai:settings:v1", "theme"];
      Object.keys(localStorage)
        .filter(k => !keysToKeep.includes(k))
        .forEach(k => localStorage.removeItem(k));
      handleSave();
    } catch { }
  }

  return (
    <div className="min-h-screen bg-background text-foreground selection:bg-primary/30 pb-32 animate-in fade-in duration-700">

      {/* ── Ambient background ── */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-60 -left-40 w-[800px] h-[800px] rounded-full bg-primary/5 blur-[120px] animate-pulse duration-[12s]" />
        <div className="absolute bottom-0 -right-40 w-[600px] h-[600px] rounded-full bg-emerald-500/5 blur-[100px] animate-pulse duration-[10s]" />
      </div>

      <div className="relative z-10 space-y-16 p-6 md:p-8 lg:p-10 max-w-[1400px] mx-auto">

        {/* ── Page header ── */}
        <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="h-1.5 w-8 rounded-full bg-gradient-to-r from-primary to-amber-400" />
              <span className="text-xs font-black uppercase tracking-[0.25em] text-primary/80">
                System Configuration
              </span>
            </div>
            <h1 className="text-4xl font-black tracking-tight text-gradient-primary md:text-5xl">
              Platform Preferences
            </h1>
            <p className="text-muted-foreground font-medium max-w-2xl leading-relaxed">
              Tailor the diagnostic environment, AI heuristics, and report generation defaults to your clinical workflow requirements.
            </p>
          </div>

          <div className="flex items-center gap-3 shrink-0 bg-card/30 backdrop-blur-md p-2 rounded-2xl border border-border/40 shadow-sm-professional">
            <SecondaryBtn icon={RotateCcw} onClick={reset} className="h-11 px-6 font-black uppercase tracking-widest text-[10px] border-none bg-transparent hover:bg-muted/20">
              Factory Reset
            </SecondaryBtn>
            <PrimaryBtn
              icon={saved ? CheckCircle2 : SettingsIcon}
              onClick={handleSave}
              className={cn("h-11 px-8 font-black uppercase tracking-widest text-[10px] shadow-lg transition-all hover-lift", saved ? "bg-emerald-500 shadow-emerald-500/20" : "shadow-primary/20")}
            >
              {saved ? "Synchronized" : "Commit Changes"}
            </PrimaryBtn>
          </div>
        </div>

        {/* ── Sections ── */}
        <div className="space-y-20">

          {/* ── Appearance ── */}
          <Section
            icon={Palette}
            title="Visual Interface"
            description="Control the aesthetic parameters of the clinical dashboard and diagnostic modules."
          >
            <SettingRow label="Global Theme" description="Choose between optimized clinical modes for high-light or surgical dark environments.">
              <ThemeSelector />
            </SettingRow>

            <Divider className="opacity-10" />

            <SettingRow label="Interface Density" description="Calibrate the UI information density for different display resolutions.">
              <DensitySelector value={settings.density} onChange={v => update("density", v)} />
            </SettingRow>

            <Divider className="opacity-10" />

            <SettingRow label="Reduce System Motion" description="Minimize transitions and animations to improve performance or accessibility.">
              <div className="flex items-center gap-4">
                <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/40">{settings.reduceMotion ? "Stationary" : "Fluid"}</span>
                <Switch checked={settings.reduceMotion} onChange={v => update("reduceMotion", v)} />
              </div>
            </SettingRow>
          </Section>

          {/* ── AI Engine ── */}
          <Section
            icon={BrainCircuit}
            title="AI Diagnostics"
            description="Configure the underlying neural engine and clinical normative reference models."
          >
            <SettingRow label="Preferred Protocol" description="The cephalometric analysis standard pre-loaded into new clinical cases.">
              <Select
                value={settings.defaultAnalysisType}
                onChange={v => update("defaultAnalysisType", v as AnalysisTypeDefault)}
                className="w-48 h-12 rounded-[18px] border-border/40 bg-muted/20 font-black uppercase tracking-widest text-[10px] px-6"
              >
                {["Steiner", "Tweed", "McNamara", "Jarabak", "Ricketts", "Full"].map(t => (
                  <option key={t} value={t}>{t} MODEL</option>
                ))}
              </Select>
            </SettingRow>

            <Divider className="opacity-10" />

            <SettingRow label="Normative Population" description="Select the ethnically appropriate dataset for clinical measurement normalization.">
              <Select
                value={settings.populationNorm}
                onChange={v => update("populationNorm", v as PopulationNorm)}
                className="w-56 h-12 rounded-[18px] border-border/40 bg-muted/20 font-black uppercase tracking-widest text-[10px] px-6"
              >
                {["Caucasian", "Chinese", "East Asian", "Japanese", "African-American", "Hispanic", "Indian", "Brazilian"].map(p => (
                  <option key={p} value={p}>{p} NORM</option>
                ))}
              </Select>
            </SettingRow>

            <Divider className="opacity-10" />

            <SettingRow label="Engine Confidence" description="Determine the threshold for AI landmark verification and validity flagging.">
              <ConfidenceSlider value={settings.confidenceThreshold} onChange={v => update("confidenceThreshold", v)} />
            </SettingRow>
          </Section>

          {/* ── Workflow ── */}
          <Section
            icon={SlidersHorizontal}
            title="Workflow Logic"
            description="Manage automatic synchronization, report generation, and asset processing rules."
          >
            <SettingRow label="Telemetry Sync" description="Determine how frequently the workspace state is synchronized with the backend.">
              <Select
                value={settings.autoRefreshInterval}
                onChange={v => update("autoRefreshInterval", v as RefreshInterval)}
                className="w-48 h-12 rounded-[18px] border-border/40 bg-muted/20 font-black uppercase tracking-widest text-[10px] px-6"
              >
                <option value="off">MANUAL REFRESH</option>
                <option value="30s">30S SYNC</option>
                <option value="1m">1M SYNC</option>
                <option value="5m">5M SYNC</option>
              </Select>
            </SettingRow>

            <Divider className="opacity-10" />

            <SettingRow label="Report Artifact" description="The default file structure for exported diagnostic synthesis and measurements.">
              <div className="flex bg-muted/20 p-1.5 rounded-[20px] border border-border/20 backdrop-blur-sm">
                {["PDF", "DOCX"].map(fmt => (
                  <button
                    key={fmt}
                    onClick={() => update("defaultReportFormat", fmt as ReportFormat)}
                    className={cn(
                      "px-6 py-2.5 rounded-[16px] text-[10px] font-black uppercase tracking-widest transition-all",
                      settings.defaultReportFormat === fmt ? "bg-background text-primary shadow-sm" : "text-muted-foreground/60 hover:text-foreground"
                    )}
                  >
                    {fmt}
                  </button>
                ))}
              </div>
            </SettingRow>

            <Divider className="opacity-10" />

            <SettingRow label="Automated Overlays" description="Generate diagnostic vector overlays immediately after clinical finalization.">
              <Switch checked={settings.autoOverlayAfterFinalize} onChange={v => update("autoOverlayAfterFinalize", v)} />
            </SettingRow>
          </Section>

          {/* ── Security ── */}
          <Section
            icon={ShieldCheck}
            title="Security & Compliance"
            description="Manage data integrity, system logs, and local clinical cache parameters."
          >
            <SettingRow label="Purge Local Artifacts" description="De-identify the current browser session by wiping temporary cached data.">
              <button
                onClick={handleClearCache}
                className="flex items-center gap-3 px-6 h-12 rounded-[18px] border border-rose-500/10 bg-rose-500/5 text-rose-500 text-[10px] font-black uppercase tracking-widest hover:bg-rose-500/10 transition-all"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Flush Cache
              </button>
            </SettingRow>

            <Divider className="opacity-10" />

            <div className="rounded-3xl border border-primary/20 bg-primary/5 p-8 flex gap-6 items-start">
              <div className="h-12 w-12 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shrink-0 shadow-sm shadow-primary/10">
                <Fingerprint className="h-6 w-6" />
              </div>
              <div className="space-y-2">
                <h4 className="text-sm font-black uppercase tracking-widest text-foreground/80">Clinical Data Integrity</h4>
                <p className="text-xs text-muted-foreground font-medium leading-relaxed">
                  All diagnostic assets (X-rays, biometric landmarks, surgical projections) are processed in-situ and persisted exclusively on your secure .NET backend infrastructure. This interface acts as an encrypted telemetry bridge.
                </p>
                <div className="flex items-center gap-4 pt-3">
                  <Pill tone="info" size="xs" className="font-black">HIPAA SECURE</Pill>
                  <Pill tone="neutral" size="xs" className="font-black bg-muted/40 text-muted-foreground/60 border-border/20 uppercase">NO-STORE CACHE</Pill>
                </div>
              </div>
            </div>
          </Section>

          {/* ── System Status ── */}
          <Section
            icon={Cpu}
            title="System Telemetry"
            description="Environment specifications and active engine versions."
          >
            <div className="grid gap-4">
              {[
                { icon: Layers, label: "Frontend Stack", value: "React 19 + TypeScript + Vite 7" },
                { icon: HardDrive, label: "Backend Core", value: "ASP.NET 9 + CephAI Pipeline v2.2" },
                { icon: Zap, label: "AI Acceleration", value: "Torch (HRNet-W32 Architecture)" },
                { icon: Eye, label: "Landmark Engine", value: "80 Landmarks / 90 Clinical Biometrics" },
              ].map((sys, i) => (
                <div key={i} className="flex items-center justify-between p-6 rounded-2xl border border-border/20 bg-muted/5 group hover:border-primary/20 transition-all duration-500">
                  <div className="flex items-center gap-4">
                    <sys.icon className="h-4 w-4 text-muted-foreground/30 group-hover:text-primary transition-colors" />
                    <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60">{sys.label}</span>
                  </div>
                  <code className="text-[11px] font-black font-mono text-foreground/80 bg-background px-3 py-1.5 rounded-lg border border-border/40 shadow-sm">
                    {sys.value}
                  </code>
                </div>
              ))}
            </div>
          </Section>

        </div>
      </div>
    </div>
  );
}
