import {
  Activity,
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Moon,
  Search as SearchIcon,
  Sun,
  X,
  Database,
  type LucideIcon,
} from "lucide-react";
import React, { type FormEvent, type ReactNode } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { cn } from "@/lib/utils";
import { useTheme } from "@/contexts/ThemeContext";

// ─── Constants ────────────────────────────────────────────────────────────────

export const toneClasses = {
  success: "border-success/20 bg-success/10 text-success-foreground",
  warning: "border-warning/20 bg-warning/10 text-warning-foreground",
  danger: "border-destructive/20 bg-destructive/10 text-destructive-foreground",
  info: "border-info/20 bg-info/10 text-info-foreground",
  accent: "border-primary/20 bg-primary/10 text-primary-foreground",
  neutral: "border-border/40 bg-muted/30 text-muted-foreground",
};

// ─── Design System Components ─────────────────────────────────────────────────

/** Premium glass card with subtle gradient border and theme-aware styling */
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
  glow?: "cyan" | "emerald" | "amber" | "rose";
  noPadding?: boolean;
  title?: string;
  onClick?: () => void;
}) {
  const glowMap = {
    cyan: "shadow-[0_0_60px_-12px_var(--color-primary)]/10",
    emerald: "shadow-[0_0_60px_-12px_var(--color-success)]/10",
    amber: "shadow-[0_0_60px_-12px_var(--color-warning)]/10",
    rose: "shadow-[0_0_60px_-12px_var(--color-destructive)]/10",
  };
  
  return (
    <div
      onClick={onClick}
      className={cn(
        "relative overflow-hidden rounded-2xl border border-border/40 bg-card backdrop-blur-xl transition-all duration-300",
        glow && glowMap[glow],
        !noPadding && "p-6",
        onClick && "cursor-pointer active:scale-[0.99]",
        className
      )}
    >
      {/* Subtle top shine */}
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/30 to-transparent opacity-50" />
      {title && (
        <div className="mb-4 border-b border-border/40 pb-3">
          <h3 className="text-sm font-bold uppercase tracking-[0.2em] text-muted-foreground">{title}</h3>
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
        "inline-flex items-center gap-1.5 rounded-full border font-medium tracking-tight",
        size === "xs" && "px-2 py-0.5 text-[10px]",
        size === "sm" && "px-2.5 py-1 text-xs",
        size === "md" && "px-3 py-1.5 text-sm",
        toneClasses[tone],
        className
      )}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-80" />
      {children}
    </span>
  );
}

/** Metric display card */
export function KpiCard({
  label,
  value,
  icon: Icon,
  tone = "accent",
  delta,
  sub,
}: {
  label: string;
  value: string | number;
  icon: LucideIcon;
  tone?: keyof typeof toneClasses;
  delta?: string;
  sub?: string;
}) {
  return (
    <Card className="group transition-all duration-300 hover:border-border/80 hover:shadow-lg">
      <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
      <div className="relative">
        <div className="flex items-start justify-between gap-3">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">{label}</p>
          <div className={cn("rounded-xl border p-2", toneClasses[tone])}>
            <Icon className="h-4 w-4" />
          </div>
        </div>
        <div className="mt-3">
          <p className="text-3xl font-bold leading-none tracking-tight text-foreground">{value}</p>
          {sub && <p className="mt-2 text-xs text-muted-foreground">{sub}</p>}
        </div>
        {delta && (
          <div className="mt-4 flex items-center gap-1 text-xs font-medium text-success-foreground">
            <ArrowUpRight className="h-3 w-3" />
            {delta}
          </div>
        )}
      </div>
    </Card>
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
    <div className="flex flex-col gap-4 pb-4 lg:flex-row lg:items-end lg:justify-between">
      <div className="max-w-3xl space-y-2">
        <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-primary">{eyebrow}</p>
        <h1 className="text-2xl font-bold leading-tight tracking-tight text-foreground sm:text-4xl">{title}</h1>
        <p className="text-sm leading-relaxed text-muted-foreground">{description}</p>
      </div>
      {actions && (
        <div className="flex flex-wrap items-center gap-2 lg:mb-1">
          {actions}
        </div>
      )}
    </div>
  );
}

/** Divider line */
export function Divider({ className }: { className?: string }) {
  return <div className={cn("h-px w-full bg-border/40", className)} />;
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
        "inline-flex items-center justify-center rounded-xl transition-all duration-200 active:scale-95 disabled:opacity-50",
        size === "sm" ? "h-8 w-8" : "h-10 w-10",
        variant === "ghost" && (active ? "bg-primary/15 text-primary" : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"),
        variant === "outline" && "border border-border/60 bg-muted/20 text-foreground hover:border-border hover:bg-muted/40",
        variant === "solid" && "bg-primary text-primary-foreground shadow-md hover:bg-primary/90",
        className
      )}
    >
      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Icon className={size === "sm" ? "h-3.5 w-3.5" : "h-4.5 w-4.5"} />
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
        "inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-primary px-5 text-sm font-bold text-primary-foreground shadow-lg shadow-primary/20 transition-all duration-200 hover:bg-primary/90 hover:shadow-primary/30 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : Icon && <Icon className="h-4 w-4" />}
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
        "inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-border/60 bg-muted/30 px-5 text-sm font-semibold text-foreground transition-all duration-200 hover:border-border hover:bg-muted/50 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
    >
      {Icon && <Icon className="h-4 w-4" />}
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
        "inline-flex h-10 items-center gap-2 rounded-xl border border-destructive/20 bg-destructive/10 px-4 text-sm font-semibold text-destructive transition-all duration-200 hover:border-destructive/40 hover:bg-destructive/20 active:scale-[0.98]",
        className
      )}
    >
      {Icon && <Icon className="h-4 w-4" />}
      {children}
    </button>
  );
}

/** Styled input field wrapper */
export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="block text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">{label}</label>
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
          "h-10 w-full appearance-none rounded-xl border border-border/60 bg-muted/30 px-4 text-sm text-foreground outline-none transition-all focus:border-primary/50 focus:ring-4 focus:ring-primary/10",
          className
        )}
      >
        {children}
      </select>
      <div className="pointer-events-none absolute inset-y-0 right-3 flex items-center">
        <Activity className="h-3.5 w-3.5 text-muted-foreground rotate-90" />
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
        "h-10 w-full rounded-xl border border-border/60 bg-muted/30 px-4 text-sm text-foreground outline-none transition-all placeholder:text-muted-foreground/60 focus:border-primary/50 focus:ring-4 focus:ring-primary/10",
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
      <SearchIcon className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground transition-colors group-focus-within:text-primary" />
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-10 w-full rounded-xl border border-border/60 bg-muted/30 pl-10 pr-4 text-sm text-foreground outline-none transition-all focus:border-primary/50 focus:ring-4 focus:ring-primary/10"
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
    sm: "max-w-sm",
    md: "max-w-lg",
    lg: "max-w-2xl",
    xl: "max-w-4xl",
    full: "max-w-[95vw]",
  };

  return (
    <DialogPrimitive.Root open={open} onOpenChange={o => !o && onClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm animate-in fade-in duration-200" />
        <DialogPrimitive.Content
          className={cn(
            "fixed left-1/2 top-1/2 z-50 w-full -translate-x-1/2 -translate-y-1/2 animate-in zoom-in-95 duration-200",
            sizeMap[size],
            "p-4"
          )}
        >
          <Card className="p-0 shadow-2xl border-border/50">
            <div className="flex items-center justify-between border-b border-border/40 px-6 py-4">
              <div>
                <DialogPrimitive.Title className="text-lg font-bold tracking-tight text-foreground">
                  {title}
                </DialogPrimitive.Title>
                {description && (
                  <DialogPrimitive.Description className="mt-1 text-xs text-muted-foreground">
                    {description}
                  </DialogPrimitive.Description>
                )}
              </div>
              <IconBtn icon={X} label="Close" onClick={onClose} variant="ghost" size="sm" />
            </div>
            <div className="max-h-[80vh] overflow-y-auto p-6 [scrollbar-width:thin]">
              {children}
            </div>
          </Card>
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
    <div className="flex flex-col items-center rounded-2xl border border-dashed border-border/40 bg-muted/20 px-6 py-12 text-center">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10 text-primary">
        <Icon className="h-5 w-5" />
      </div>
      <h3 className="text-base font-semibold text-foreground">{title}</h3>
      <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-muted-foreground">{description}</p>
      {actions && <div className="mt-5 flex flex-wrap justify-center gap-2">{actions}</div>}
    </div>
  );
}

// ─── Deviation Bar ─────────────────────────────────────────────────────────────

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
      <div className="h-2.5 w-full rounded-full bg-muted/40">
        <div className="h-full w-1 bg-muted-foreground/40 rounded-full" />
      </div>
    );
  }
  const [lo, hi] = range;
  const span = hi - lo;
  const pad = Math.max(span * 0.8, 2);
  const barMin = lo - pad;
  const barMax = hi + pad;
  const barSpan = barMax - barMin;

  const normStartPct = Math.max(0, ((lo - barMin) / barSpan) * 100);
  const normWidthPct = Math.min(100 - normStartPct, (span / barSpan) * 100);
  const valuePct = Math.max(1, Math.min(99, ((value - barMin) / barSpan) * 100));

  const markerColor =
    severity === "Normal" ? "bg-success" :
    severity === "Mild" ? "bg-warning" :
    severity === "Moderate" ? "bg-orange-500" : "bg-destructive";

  return (
    <div className="relative h-2.5 w-full rounded-full bg-muted/40">
      <div
        className="absolute top-0 h-full rounded-sm bg-success/25 border-x border-success/40"
        style={{ left: `${normStartPct}%`, width: `${normWidthPct}%` }}
      />
      <div
        className={cn("absolute top-1/2 -translate-y-1/2 -translate-x-1/2 h-3.5 w-1.5 rounded-full shadow-sm", markerColor)}
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
    <div className={cn("flex items-center gap-1 rounded-2xl border border-border/40 bg-muted/20 p-1.5", className)}>
      {tabs.map(tab => {
        const Icon = tab.icon;
        const isActive = tab.id === active;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChange(tab.id)}
            className={cn(
              "relative flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition-all duration-200",
              isActive
                ? "bg-card text-foreground shadow-sm border border-border/40"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/30"
            )}
          >
            {Icon && <Icon className="h-3.5 w-3.5" />}
            {tab.label}
            {tab.badge !== undefined && (
              <span className={cn(
                "flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[9px] font-bold",
                isActive ? "bg-primary/15 text-primary" : "bg-muted/60 text-muted-foreground"
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

// ─── Section Header ────────────────────────────────────────────────────────────

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
    <div className={cn("flex items-center justify-between gap-3 mb-5", className)}>
      <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-muted-foreground">{label}</p>
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
          "relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none",
          checked ? "bg-primary shadow-inner shadow-primary/30" : "bg-muted/60"
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
        <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
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
    success: "oklch(var(--color-success))",
    accent: "oklch(var(--color-primary))",
    warning: "oklch(var(--color-warning))",
    danger: "oklch(var(--color-destructive))",
    info: "oklch(var(--color-info))",
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
          className="text-muted/30"
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

/** Theme toggle switch */
export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  
  return (
    <button
      onClick={toggleTheme}
      className="flex h-9 items-center gap-2 rounded-xl border border-border/60 bg-muted/20 px-3 text-xs font-medium text-foreground transition-all hover:bg-muted/40 active:scale-95"
    >
      {theme === "dark" ? (
        <>
          <Sun className="h-3.5 w-3.5 text-warning" />
          <span>Light mode</span>
        </>
      ) : (
        <>
          <Moon className="h-3.5 w-3.5 text-primary" />
          <span>Dark mode</span>
        </>
      )}
    </button>
  );
}
