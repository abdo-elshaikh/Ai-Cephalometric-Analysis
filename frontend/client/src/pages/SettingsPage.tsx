import React, { useState } from "react";
import {
  Palette,
  SlidersHorizontal,
  BrainCircuit,
  Bell,
  Shield,
  RefreshCw,
  RotateCcw,
  CheckCircle2,
  Monitor,
  Moon,
  Sun,
  Zap,
  Download,
  Trash2,
  Info,
  ChevronRight,
  Layout,
  FileText,
  Target,
} from "lucide-react";
import {
  Card,
  PageHeader,
  PrimaryBtn,
  SecondaryBtn,
  Switch,
  Field,
  Select,
  Divider,
} from "@/components/_core/ClinicalComponents";
import { useTheme } from "@/contexts/ThemeContext";
import {
  useSettings,
  DEFAULT_SETTINGS,
  type CephSettings,
  type AnalysisTypeDefault,
  type PopulationNorm,
  type UIDensity,
  type RefreshInterval,
  type ReportFormat,
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
    <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-md border border-border bg-muted">
            <Icon className="h-3.5 w-3.5 text-muted-foreground" />
          </div>
          <h2 className="text-[14px] font-semibold text-foreground">{title}</h2>
        </div>
        <p className="text-[12px] leading-relaxed text-muted-foreground pl-9">{description}</p>
      </div>
      <Card className="space-y-5">{children}</Card>
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
    <div className="flex items-start justify-between gap-6">
      <div className="min-w-0 flex-1">
        <p className={cn("text-[13px] font-medium", danger ? "text-destructive" : "text-foreground")}>
          {label}
        </p>
        {description && (
          <p className="mt-0.5 text-[12px] leading-relaxed text-muted-foreground">{description}</p>
        )}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

// ─── Theme card selector ──────────────────────────────────────────────────────

function ThemeSelector() {
  const { theme, toggleTheme } = useTheme();
  const options = [
    { id: "light", label: "Light",  icon: Sun  },
    { id: "dark",  label: "Dark",   icon: Moon },
    { id: "system",label: "System", icon: Monitor },
  ];
  const active = theme ?? "light";

  return (
    <div className="flex gap-2">
      {options.map(opt => {
        const Icon = opt.icon;
        const isActive = opt.id === "system" ? false : opt.id === active;
        return (
          <button
            key={opt.id}
            type="button"
            onClick={() => {
              if (opt.id !== "system" && opt.id !== active) toggleTheme?.();
            }}
            className={cn(
              "flex flex-col items-center gap-1.5 rounded-lg border px-4 py-3 text-[11px] font-semibold transition-all",
              isActive
                ? "border-primary bg-primary/10 text-primary"
                : "border-border bg-muted/30 text-muted-foreground hover:border-border/80 hover:bg-muted/50"
            )}
          >
            <Icon className="h-4 w-4" />
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
  const opts: { id: UIDensity; label: string; desc: string }[] = [
    { id: "compact",     label: "Compact",     desc: "Tighter spacing" },
    { id: "comfortable", label: "Comfortable", desc: "Balanced default" },
    { id: "spacious",    label: "Spacious",    desc: "More breathing room" },
  ];
  return (
    <div className="flex gap-2">
      {opts.map(o => (
        <button
          key={o.id}
          type="button"
          onClick={() => onChange(o.id)}
          className={cn(
            "flex-1 rounded-lg border px-3 py-2.5 text-center transition-all",
            value === o.id
              ? "border-primary bg-primary/10 text-primary"
              : "border-border bg-muted/30 text-muted-foreground hover:bg-muted/50"
          )}
        >
          <p className="text-[12px] font-semibold">{o.label}</p>
          <p className="text-[10px] opacity-70">{o.desc}</p>
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
    pct >= 85 ? "Strict — fewer flagged landmarks" :
    pct >= 70 ? "Balanced — recommended" :
                "Lenient — more landmarks pass";

  return (
    <div className="space-y-2 w-full max-w-[260px]">
      <div className="flex items-center justify-between">
        <span className="text-[12px] text-muted-foreground">{label}</span>
        <span className="text-[13px] font-bold tabular-nums text-foreground">{pct}%</span>
      </div>
      <input
        type="range"
        min={50}
        max={95}
        step={5}
        value={pct}
        onChange={e => onChange(Number(e.target.value) / 100)}
        className="w-full accent-primary cursor-pointer"
      />
      <div className="flex justify-between text-[10px] text-muted-foreground">
        <span>50% lenient</span>
        <span>95% strict</span>
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
    } catch {}
    handleSave();
  }

  return (
    <div className="space-y-10 animate-in fade-in slide-in-from-bottom-3 duration-400">
      <PageHeader
        eyebrow="Preferences"
        title="Settings"
        description="Customize the platform appearance, clinical defaults, and workflow behavior."
        actions={
          <div className="flex items-center gap-2">
            <SecondaryBtn icon={RotateCcw} onClick={reset}>
              Reset defaults
            </SecondaryBtn>
            <PrimaryBtn
              icon={saved ? CheckCircle2 : undefined}
              onClick={handleSave}
              className={saved ? "bg-success hover:bg-success/90" : ""}
            >
              {saved ? "Saved" : "Save changes"}
            </PrimaryBtn>
          </div>
        }
      />

      {/* ── Appearance ───────────────────────────────────────────────────────── */}
      <Section
        icon={Palette}
        title="Appearance"
        description="Control how the interface looks across the platform."
      >
        <SettingRow label="Color theme" description="Choose between light and dark mode.">
          <ThemeSelector />
        </SettingRow>

        <Divider />

        <SettingRow
          label="Interface density"
          description="Controls spacing and padding throughout the UI."
        >
          <DensitySelector value={settings.density} onChange={v => update("density", v)} />
        </SettingRow>

        <Divider />

        <SettingRow
          label="Reduce motion"
          description="Disable entrance animations and transitions for accessibility."
        >
          <Switch
            checked={settings.reduceMotion}
            onChange={v => update("reduceMotion", v)}
            label="Reduce"
          />
        </SettingRow>
      </Section>

      {/* ── Clinical Preferences ──────────────────────────────────────────────── */}
      <Section
        icon={BrainCircuit}
        title="Clinical Preferences"
        description="Default values applied to every new analysis session."
      >
        <SettingRow
          label="Default analysis protocol"
          description="The analysis type pre-selected when starting a new AI pipeline."
        >
          <Field label="">
            <Select
              value={settings.defaultAnalysisType}
              onChange={v => update("defaultAnalysisType", v as AnalysisTypeDefault)}
              className="w-40"
            >
              {(["Steiner","Tweed","McNamara","Jarabak","Ricketts","Full"] as const).map(t => (
                <option key={t} value={t}>{t}</option>
              ))}
            </Select>
          </Field>
        </SettingRow>

        <Divider />

        <SettingRow
          label="Population norms"
          description="Normative reference values used when classifying measurements."
        >
          <Field label="">
            <Select
              value={settings.populationNorm}
              onChange={v => update("populationNorm", v as PopulationNorm)}
              className="w-44"
            >
              {(["Caucasian","Chinese","East Asian","Japanese","African-American","Hispanic","Indian","Brazilian"] as const).map(p => (
                <option key={p} value={p}>{p}</option>
              ))}
            </Select>
          </Field>
        </SettingRow>

        <Divider />

        <SettingRow
          label="AI confidence threshold"
          description="Landmarks below this threshold are flagged as low-confidence."
        >
          <ConfidenceSlider
            value={settings.confidenceThreshold}
            onChange={v => update("confidenceThreshold", v)}
          />
        </SettingRow>

        <Divider />

        <SettingRow
          label="CBCT-derived mode by default"
          description="Pre-enables CBCT-derived correction factors when calculating measurements."
        >
          <Switch
            checked={settings.cbctDerivedDefault}
            onChange={v => update("cbctDerivedDefault", v)}
          />
        </SettingRow>
      </Section>

      {/* ── Workflow ─────────────────────────────────────────────────────────── */}
      <Section
        icon={SlidersHorizontal}
        title="Workflow"
        description="Control how data refreshes, overlays, and reports are handled."
      >
        <SettingRow
          label="Auto-refresh interval"
          description="How often the workspace data is automatically synced from the backend."
        >
          <Field label="">
            <Select
              value={settings.autoRefreshInterval}
              onChange={v => update("autoRefreshInterval", v as RefreshInterval)}
              className="w-32"
            >
              <option value="off">Off</option>
              <option value="30s">30 seconds</option>
              <option value="1m">1 minute</option>
              <option value="5m">5 minutes</option>
            </Select>
          </Field>
        </SettingRow>

        <Divider />

        <SettingRow
          label="Default report format"
          description="File format used when generating and exporting clinical reports."
        >
          <Field label="">
            <Select
              value={settings.defaultReportFormat}
              onChange={v => update("defaultReportFormat", v as ReportFormat)}
              className="w-28"
            >
              <option value="PDF">PDF</option>
              <option value="DOCX">DOCX</option>
            </Select>
          </Field>
        </SettingRow>

        <Divider />

        <SettingRow
          label="Auto-generate overlays after finalize"
          description="Automatically runs the overlay generation step when a session is finalized."
        >
          <Switch
            checked={settings.autoOverlayAfterFinalize}
            onChange={v => update("autoOverlayAfterFinalize", v)}
          />
        </SettingRow>

        <Divider />

        <SettingRow
          label="Show confidence overlay in viewer"
          description="Display landmark confidence heatmap by default when opening the viewer."
        >
          <Switch
            checked={settings.showConfidenceOverlay}
            onChange={v => update("showConfidenceOverlay", v)}
          />
        </SettingRow>
      </Section>

      {/* ── Notifications ─────────────────────────────────────────────────────── */}
      <Section
        icon={Bell}
        title="Notifications"
        description="In-app toast alerts for key pipeline and workspace events."
      >
        <SettingRow
          label="AI pipeline complete"
          description="Show a toast when landmark detection and analysis finishes."
        >
          <Switch
            checked={settings.notifyAiComplete}
            onChange={v => update("notifyAiComplete", v)}
          />
        </SettingRow>

        <Divider />

        <SettingRow
          label="Report ready"
          description="Notify when a PDF or DOCX report has been generated."
        >
          <Switch
            checked={settings.notifyReportReady}
            onChange={v => update("notifyReportReady", v)}
          />
        </SettingRow>

        <Divider />

        <SettingRow
          label="Connection lost"
          description="Alert when the backend or AI service becomes unreachable."
        >
          <Switch
            checked={settings.notifyDisconnect}
            onChange={v => update("notifyDisconnect", v)}
          />
        </SettingRow>
      </Section>

      {/* ── Data & Privacy ────────────────────────────────────────────────────── */}
      <Section
        icon={Shield}
        title="Data & Privacy"
        description="Manage local cache and session data. All clinical data lives exclusively on your backend server."
      >
        <SettingRow
          label="Clear local cache"
          description="Removes temporary frontend cache. Does not affect clinical records stored on the server."
        >
          <SecondaryBtn icon={Trash2} onClick={handleClearCache}>
            Clear cache
          </SecondaryBtn>
        </SettingRow>

        <Divider />

        <div className="flex items-start gap-3 rounded-lg border border-info/20 bg-info/8 p-4">
          <Info className="h-4 w-4 text-info-foreground mt-0.5 shrink-0" />
          <div className="space-y-1">
            <p className="text-[12px] font-semibold text-foreground">HIPAA Compliance</p>
            <p className="text-[12px] leading-relaxed text-muted-foreground">
              All patient data (X-rays, landmarks, measurements, reports) is stored solely on your
              .NET backend server and never in the browser. The frontend only caches session tokens
              and user preferences locally. All API responses include <code className="text-[11px] bg-muted px-1 rounded">Cache-Control: no-store</code> headers.
            </p>
          </div>
        </div>
      </Section>

      {/* ── System Info ───────────────────────────────────────────────────────── */}
      <Section
        icon={Monitor}
        title="System"
        description="Platform version and environment details. Read-only."
      >
        {[
          { label: "Frontend",       value: "React 19 + Vite 7 + TypeScript" },
          { label: "Backend",        value: "ASP.NET Core 9 + CephAI v2.2" },
          { label: "AI Engine",      value: "FastAPI + PyTorch HRNet-W32" },
          { label: "Design System",  value: "ClinicalComponents v3 (Linear/Vercel)" },
          { label: "AI Version",     value: "CephAI v2.2 — 80 landmarks, 90+ measurements" },
          { label: "Backend URL",    value: import.meta.env.VITE_BACKEND_API_BASE_URL ?? "http://localhost:5180" },
        ].map((row, i, arr) => (
          <React.Fragment key={row.label}>
            <SettingRow label={row.label}>
              <code className="text-[12px] font-mono text-muted-foreground bg-muted/60 px-2 py-1 rounded-md">
                {row.value}
              </code>
            </SettingRow>
            {i < arr.length - 1 && <Divider />}
          </React.Fragment>
        ))}
      </Section>
    </div>
  );
}
