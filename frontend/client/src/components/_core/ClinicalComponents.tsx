import {
  Activity,
  ArrowUpRight,
  ArrowDownRight,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Moon,
  Search as SearchIcon,
  Sun,
  X,
  Database,
  TrendingUp,
  TrendingDown,
  type LucideIcon,
} from "lucide-react";
import React, { type FormEvent, type ReactNode, useEffect, useState } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { cn } from "@/lib/utils";
import { useTheme } from "@/contexts/ThemeContext";

// ─── Constants ────────────────────────────────────────────────────────────────

export const toneClasses = {
  success: "border-success/25 bg-success/10 text-success-foreground",
  warning: "border-warning/25 bg-warning/10 text-warning-foreground",
  danger:  "border-destructive/25 bg-destructive/10 text-destructive-foreground",
  info:    "border-info/25 bg-info/10 text-info-foreground",
  accent:  "border-primary/20 bg-primary/10 text-primary",
  neutral: "border-border/50 bg-muted/40 text-muted-foreground",
};

const toneAccentBar: Record<string, string> = {
  success: "bg-success",
  warning: "bg-warning",
  danger:  "bg-destructive",
  info:    "bg-info",
  accent:  "bg-primary",
  neutral: "bg-muted-foreground/30",
};

const toneSparkBar: Record<string, string> = {
  success: "bg-success",
  warning: "bg-warning",
  danger:  "bg-destructive",
  info:    "bg-info",
  accent:  "bg-primary",
  neutral: "bg-muted-foreground",
};

// ─── Hooks ────────────────────────────────────────────────────────────────────

/** Animates a number from 0 → target using an ease-out cubic over `duration` ms. */
export function useCountUp(target: number, duration = 1000): number {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (target === 0) { setCount(0); return; }
    const startTime = performance.now();
    let rafId: number;
    function tick(now: number) {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setCount(Math.round(eased * target));
      if (progress < 1) rafId = requestAnimationFrame(tick);
    }
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [target, duration]);
  return count;
}

// ─── Mini helpers ─────────────────────────────────────────────────────────────

function MiniSparkBar({ data, tone }: { data: number[]; tone: string }) {
  const max = Math.max(...data, 1);
  return (
    <div className="flex items-end gap-px h-6 w-16 shrink-0">
      {data.map((v, i) => (
        <div
          key={i}
          className={cn("flex-1 rounded-sm transition-all", toneSparkBar[tone] ?? "bg-primary")}
          style={{
            height: `${Math.max(8, (v / max) * 100)}%`,
            opacity: 0.3 + (i / (data.length - 1 || 1)) * 0.7,
          }}
        />
      ))}
    </div>
  );
}

// ─── Design System Components ─────────────────────────────────────────────────

/** Clean, premium card with subtle border — Linear/Vercel inspired */
export function Card({
  children,
  className,
  glow,
  noPadding = false,
  title,
  onClick,
}: {
  children: ReactNode;
  className?: string;
  glow?: "violet" | "emerald" | "amber" | "rose";
  noPadding?: boolean;
  title?: string;
  onClick?: () => void;
}) {
  const glowMap = {
    violet:  "shadow-[0_0_40px_-10px_var(--color-primary)]/15",
    emerald: "shadow-[0_0_40px_-10px_var(--color-success)]/15",
    amber:   "shadow-[0_0_40px_-10px_var(--color-warning)]/15",
    rose:    "shadow-[0_0_40px_-10px_var(--color-destructive)]/15",
  };

  return (
    <div
      onClick={onClick}
      className={cn(
        "relative overflow-hidden rounded-lg border border-border bg-card transition-all duration-200",
        glow && glowMap[glow],
        !noPadding && "p-6",
        onClick && "cursor-pointer hover:border-border/80 active:scale-[0.99]",
        className
      )}
    >
      {title && (
        <div className="mb-4 flex items-center gap-2 border-b border-border pb-3">
          <h3 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{title}</h3>
        </div>
      )}
      {children}
    </div>
  );
}

/** Pill-style status badge */
export function Pill({
  children,
  tone = "neutral",
  size = "sm",
  className,
}: {
  children: ReactNode;
  tone?: keyof typeof toneClasses;
  size?: "xs" | "sm" | "md";
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border font-medium",
        size === "xs" && "px-2 py-0.5 text-[10px]",
        size === "sm" && "px-2.5 py-0.5 text-[11px]",
        size === "md" && "px-3 py-1 text-xs",
        toneClasses[tone],
        className
      )}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70 shrink-0" />
      {children}
    </span>
  );
}

/** Metric display card — Linear/Vercel KPI aesthetic with count-up animation */
export function KpiCard({
  label,
  value,
  icon: Icon,
  tone = "accent",
  delta,
  sub,
  spark,
  trend,
}: {
  label: string;
  value: string | number;
  icon: LucideIcon;
  tone?: keyof typeof toneClasses;
  delta?: string;
  sub?: string;
  spark?: number[];
  trend?: { value: number; label?: string };
}) {
  const numVal = typeof value === "number" ? value : parseFloat(String(value));
  const isNumeric = !isNaN(numVal) && typeof value === "number";
  const animated = useCountUp(isNumeric ? numVal : 0);
  const displayValue = isNumeric ? animated.toLocaleString() : value;

  const trendUp   = trend && trend.value >= 0;
  const TrendIcon = trendUp ? TrendingUp : TrendingDown;

  return (
    <div className="group relative overflow-hidden rounded-lg border border-border bg-card transition-all duration-200 hover:border-border/80 hover:shadow-md p-6">
      <div className={cn("absolute left-0 top-0 h-full w-[3px] rounded-l-lg transition-all", toneAccentBar[tone])} />
      <div className="flex items-start justify-between gap-3 mb-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground leading-none">
          {label}
        </p>
        <div className="flex items-center gap-2">
          {spark && <MiniSparkBar data={spark} tone={tone} />}
          <div className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-md border", toneClasses[tone])}>
            <Icon className="h-3.5 w-3.5" />
          </div>
        </div>
      </div>
      <p className="text-[2rem] font-bold leading-none tracking-tight text-foreground tabular-nums">
        {displayValue}
      </p>
      {sub && (
        <p className="mt-2 text-[11px] text-muted-foreground leading-tight">{sub}</p>
      )}
      <div className="mt-3 flex items-center gap-3">
        {trend && (
          <div className={cn(
            "flex items-center gap-1 text-[11px] font-bold",
            trendUp ? "text-success-foreground" : "text-destructive"
          )}>
            <TrendIcon className="h-3 w-3" />
            <span>{trendUp ? "+" : ""}{trend.value}%</span>
            {trend.label && <span className="text-muted-foreground font-normal">{trend.label}</span>}
          </div>
        )}
        {delta && !trend && (
          <div className="flex items-center gap-1 text-[11px] font-semibold text-success-foreground">
            <ArrowUpRight className="h-3 w-3" />
            {delta}
          </div>
        )}
      </div>
    </div>
  );
}

/** Trend badge — small inline positive/negative indicator */
export function TrendBadge({
  value,
  label,
}: {
  value: number;
  label?: string;
}) {
  const up = value >= 0;
  return (
    <span className={cn(
      "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold",
      up
        ? "bg-success/15 text-success-foreground"
        : "bg-destructive/15 text-destructive"
    )}>
      {up ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
      {up ? "+" : ""}{value}%
      {label && <span className="opacity-70 font-normal ml-0.5">{label}</span>}
    </span>
  );
}

/** Page header with eyebrow, title, description, actions */
export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow: string;
  title: string;
  description: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 pb-2 lg:flex-row lg:items-end lg:justify-between">
      <div className="max-w-2xl space-y-1.5">
        <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-primary">{eyebrow}</p>
        <h1 className="text-2xl font-bold leading-tight tracking-tight text-foreground sm:text-[1.9rem]">{title}</h1>
        <p className="text-sm leading-relaxed text-muted-foreground">{description}</p>
      </div>
      {actions && (
        <div className="flex flex-wrap items-center gap-2 lg:mb-0.5">
          {actions}
        </div>
      )}
    </div>
  );
}

/** Divider line */
export function Divider({ className }: { className?: string }) {
  return <div className={cn("h-px w-full bg-border", className)} />;
}

/** Icon button */
export function IconBtn({
  icon: Icon,
  label,
  onClick,
  loading,
  variant = "ghost",
  size = "md",
  className,
  active,
}: {
  icon: LucideIcon;
  label: string;
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  loading?: boolean;
  variant?: "ghost" | "outline" | "solid";
  size?: "sm" | "md";
  className?: string;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={cn(
        "inline-flex items-center justify-center rounded-md transition-all duration-150 active:scale-95 disabled:opacity-50",
        size === "sm" ? "h-7 w-7" : "h-8 w-8",
        variant === "ghost" && (active
          ? "bg-primary/12 text-primary"
          : "text-muted-foreground hover:bg-muted hover:text-foreground"),
        variant === "outline" && "border border-border bg-background text-foreground hover:bg-muted transition-colors",
        variant === "solid"   && "bg-primary text-primary-foreground shadow-sm hover:bg-primary/90",
        className
      )}
    >
      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Icon className={size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4"} />
      )}
    </button>
  );
}

/** Primary CTA button */
export function PrimaryBtn({
  children,
  onClick,
  disabled,
  loading,
  icon: Icon,
  type = "button",
  className,
}: {
  children: ReactNode;
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  disabled?: boolean;
  loading?: boolean;
  icon?: LucideIcon;
  type?: "button" | "submit";
  className?: string;
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || loading}
      className={cn(
        "inline-flex h-9 items-center justify-center gap-2 rounded-md bg-primary px-4 text-[13px] font-semibold text-primary-foreground shadow-sm transition-all duration-150 hover:bg-primary/88 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
    >
      {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : Icon && <Icon className="h-3.5 w-3.5" />}
      {children}
    </button>
  );
}

/** Secondary button */
export function SecondaryBtn({
  children,
  onClick,
  disabled,
  icon: Icon,
  type = "button",
  className,
}: {
  children: ReactNode;
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  disabled?: boolean;
  icon?: LucideIcon;
  type?: "button" | "submit";
  className?: string;
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "inline-flex h-9 items-center justify-center gap-2 rounded-md border border-border bg-background px-4 text-[13px] font-semibold text-foreground transition-all duration-150 hover:bg-muted active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
    >
      {Icon && <Icon className="h-3.5 w-3.5" />}
      {children}
    </button>
  );
}

/** Danger button */
export function DangerBtn({
  children,
  onClick,
  icon: Icon,
  className,
}: {
  children: ReactNode;
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  icon?: LucideIcon;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex h-9 items-center gap-2 rounded-md border border-destructive/25 bg-destructive/8 px-4 text-[13px] font-semibold text-destructive transition-all duration-150 hover:bg-destructive/15 active:scale-[0.98]",
        className
      )}
    >
      {Icon && <Icon className="h-3.5 w-3.5" />}
      {children}
    </button>
  );
}

/** Styled field label wrapper */
export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="block text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
        {label}
      </label>
      {children}
    </div>
  );
}

/** Styled select */
export function Select({
  value,
  onChange,
  children,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className={cn(
          "h-9 w-full appearance-none rounded-md border border-border bg-background px-3 text-[13px] text-foreground outline-none transition-all focus:border-primary/60 focus:ring-2 focus:ring-primary/15",
          className
        )}
      >
        {children}
      </select>
      <div className="pointer-events-none absolute inset-y-0 right-2.5 flex items-center">
        <Activity className="h-3.5 w-3.5 text-muted-foreground/60 rotate-90" />
      </div>
    </div>
  );
}

/** Styled text input */
export function TextInput({
  value,
  onChange,
  placeholder,
  type = "text",
  required,
  minLength,
  min,
  max,
  className,
}: {
  value: string | number;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  required?: boolean;
  minLength?: number;
  min?: number;
  max?: number;
  className?: string;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      required={required}
      minLength={minLength}
      min={min}
      max={max}
      className={cn(
        "h-9 w-full rounded-md border border-border bg-background px-3 text-[13px] text-foreground outline-none transition-all placeholder:text-muted-foreground/50 focus:border-primary/60 focus:ring-2 focus:ring-primary/15",
        className
      )}
    />
  );
}

/** Search input with icon */
export function SearchInput({
  value,
  onChange,
  placeholder = "Search…",
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
}) {
  return (
    <div className={cn("relative group", className)}>
      <SearchIcon className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/60 transition-colors group-focus-within:text-primary" />
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-9 w-full rounded-md border border-border bg-background pl-9 pr-3 text-[13px] text-foreground outline-none transition-all placeholder:text-muted-foreground/50 focus:border-primary/60 focus:ring-2 focus:ring-primary/15"
      />
    </div>
  );
}

/** Modal dialog using Radix UI */
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  size = "md",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  size?: "sm" | "md" | "lg" | "xl" | "full";
}) {
  const sizeMap = {
    sm:   "max-w-sm",
    md:   "max-w-lg",
    lg:   "max-w-2xl",
    xl:   "max-w-4xl",
    full: "max-w-[95vw]",
  };

  return (
    <DialogPrimitive.Root open={open} onOpenChange={o => !o && onClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm animate-in fade-in duration-150" />
        <DialogPrimitive.Content
          className={cn(
            "fixed left-1/2 top-1/2 z-50 w-full -translate-x-1/2 -translate-y-1/2 animate-in zoom-in-95 duration-150",
            sizeMap[size],
            "p-4"
          )}
        >
          <div className="rounded-lg border border-border bg-card shadow-2xl">
            <div className="flex items-start justify-between border-b border-border px-5 py-4">
              <div>
                <DialogPrimitive.Title className="text-[15px] font-semibold tracking-tight text-foreground">
                  {title}
                </DialogPrimitive.Title>
                {description && (
                  <DialogPrimitive.Description className="mt-1 text-[12px] text-muted-foreground">
                    {description}
                  </DialogPrimitive.Description>
                )}
              </div>
              <IconBtn icon={X} label="Close" onClick={onClose} variant="ghost" size="sm" className="mt-0.5 shrink-0" />
            </div>
            <div className="max-h-[80vh] overflow-y-auto p-5 [scrollbar-width:thin]">
              {children}
            </div>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

/** Empty state placeholder */
export function EmptyState({
  icon: Icon = Database,
  title,
  description,
  actions,
}: {
  icon?: LucideIcon;
  title: string;
  description: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center rounded-lg border border-dashed border-border bg-muted/20 px-6 py-12 text-center">
      <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-muted text-muted-foreground">
        <Icon className="h-5 w-5" />
      </div>
      <h3 className="text-[14px] font-semibold text-foreground">{title}</h3>
      <p className="mt-1.5 max-w-sm text-[13px] leading-relaxed text-muted-foreground">{description}</p>
      {actions && <div className="mt-5 flex flex-wrap justify-center gap-2">{actions}</div>}
    </div>
  );
}

// ─── Deviation Bar ────────────────────────────────────────────────────────────

/**
 * Visual bullet-chart bar that places the patient's value against the normal range.
 * Green zone = normative band. Marker color encodes severity.
 */
export function DeviationBar({
  value,
  normal,
  severity,
}: {
  value: number;
  normal: string;
  severity: "Normal" | "Mild" | "Moderate" | "Severe";
}) {
  const range = parseNormalRange(normal);
  if (!range) {
    return (
      <div className="h-2 w-full rounded-full bg-muted/50">
        <div className="h-full w-1 bg-muted-foreground/30 rounded-full" />
      </div>
    );
  }
  const [lo, hi] = range;
  const span  = hi - lo;
  const pad   = Math.max(span * 0.8, 2);
  const barMin = lo - pad;
  const barMax = hi + pad;
  const barSpan = barMax - barMin;

  const normStartPct = Math.max(0, ((lo - barMin) / barSpan) * 100);
  const normWidthPct = Math.min(100 - normStartPct, (span / barSpan) * 100);
  const valuePct     = Math.max(1, Math.min(99, ((value - barMin) / barSpan) * 100));

  const markerColor =
    severity === "Normal"   ? "bg-success" :
    severity === "Mild"     ? "bg-warning" :
    severity === "Moderate" ? "bg-orange-500" : "bg-destructive";

  return (
    <div className="relative h-2 w-full rounded-full bg-muted/50">
      <div
        className="absolute top-0 h-full rounded-sm bg-success/20 border-x border-success/30"
        style={{ left: `${normStartPct}%`, width: `${normWidthPct}%` }}
      />
      <div
        className={cn("absolute top-1/2 -translate-y-1/2 -translate-x-1/2 h-3 w-1.5 rounded-full shadow-sm", markerColor)}
        style={{ left: `${valuePct}%` }}
      />
    </div>
  );
}

function parseNormalRange(normal: string): [number, number] | null {
  const m = normal.match(/^(-?[\d.]+)\s*[–\-]\s*(-?[\d.]+)/);
  if (m) return [parseFloat(m[1]), parseFloat(m[2])];
  const gte = normal.match(/^[≥>]\s*([\d.]+)/);
  if (gte) { const v = parseFloat(gte[1]); return [v, v + 4]; }
  const lte = normal.match(/^[≤<]\s*([\d.]+)/);
  if (lte) { const v = parseFloat(lte[1]); return [v - 4, v]; }
  return null;
}

// ─── Tab Bar ──────────────────────────────────────────────────────────────────

export function TabBar<T extends string>({
  tabs,
  active,
  onChange,
  className,
}: {
  tabs: { id: T; label: string; icon?: React.ComponentType<{ className?: string }>; badge?: string | number }[];
  active: T;
  onChange: (id: T) => void;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center gap-0.5 rounded-lg border border-border bg-muted/30 p-1", className)}>
      {tabs.map(tab => {
        const Icon = tab.icon;
        const isActive = tab.id === active;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChange(tab.id)}
            className={cn(
              "relative flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] font-semibold transition-all duration-150",
              isActive
                ? "bg-background text-foreground shadow-sm border border-border"
                : "text-muted-foreground hover:text-foreground hover:bg-background/60"
            )}
          >
            {Icon && <Icon className="h-3.5 w-3.5" />}
            {tab.label}
            {tab.badge !== undefined && (
              <span className={cn(
                "flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[9px] font-bold tabular-nums",
                isActive ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"
              )}>
                {tab.badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ─── Section Header ───────────────────────────────────────────────────────────

export function SectionHeader({
  label,
  children,
  className,
}: {
  label: string;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center justify-between gap-3 mb-4", className)}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">{label}</p>
      {children && <div className="flex items-center gap-2">{children}</div>}
    </div>
  );
}

/** Boolean toggle switch */
export function Switch({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: string;
  disabled?: boolean;
}) {
  return (
    <label className={cn("flex cursor-pointer items-center gap-2.5", disabled && "cursor-not-allowed opacity-50")}>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => !disabled && onChange(!checked)}
        className={cn(
          "relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background",
          checked ? "bg-primary" : "bg-muted"
        )}
      >
        <span
          className={cn(
            "pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow-sm ring-0 transition-transform duration-200",
            checked ? "translate-x-4" : "translate-x-0"
          )}
        />
      </button>
      {label && (
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
      )}
    </label>
  );
}

/** Circular progress ring */
export function ProgressRing({
  value,
  size = 80,
  strokeWidth = 6,
  tone = "accent",
  children,
}: {
  value: number;
  size?: number;
  strokeWidth?: number;
  tone?: "success" | "accent" | "warning" | "danger" | "info" | "neutral";
  children?: ReactNode;
}) {
  const r = (size - strokeWidth) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - Math.max(0, Math.min(100, value)) / 100);
  const colorVar: Record<string, string> = {
    success: "var(--color-success)",
    accent:  "var(--color-primary)",
    warning: "var(--color-warning)",
    danger:  "var(--color-destructive)",
    info:    "var(--color-info)",
    neutral: "currentColor",
  };
  return (
    <div
      className="relative inline-flex items-center justify-center"
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} className="-rotate-90 absolute inset-0">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          className="text-muted/40"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={colorVar[tone] ?? colorVar.accent}
          strokeWidth={strokeWidth}
          strokeDasharray={circ}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className="transition-all duration-700"
        />
      </svg>
      <div className="relative z-10">{children}</div>
    </div>
  );
}

/** Theme toggle button */
export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();

  return (
    <button
      onClick={toggleTheme}
      aria-label="Toggle theme"
      className="flex h-8 items-center gap-2 rounded-md border border-border px-3 text-[12px] font-medium text-muted-foreground transition-all hover:bg-muted hover:text-foreground active:scale-95"
    >
      {theme === "dark" ? (
        <Sun className="h-3.5 w-3.5" />
      ) : (
        <Moon className="h-3.5 w-3.5" />
      )}
      {theme === "dark" ? "Light" : "Dark"}
    </button>
  );
}
