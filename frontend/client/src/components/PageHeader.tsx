import type { ReactNode } from "react";
import { useRef } from "react";

interface Stat {
  value: string;
  label: string;
}

interface PageHeaderProps {
  eyebrow?: string;
  title: ReactNode;
  description: string;
  actions?: ReactNode;
  stats?: Stat[];
}

export default function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  stats,
}: PageHeaderProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const glowRef = useRef<HTMLDivElement>(null);

  function handleMouseMove(e: React.MouseEvent<HTMLDivElement>) {
    const rect = cardRef.current?.getBoundingClientRect();
    if (!rect || !glowRef.current) return;
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    glowRef.current.style.transform = `translate(${x - 170}px, ${y - 170}px)`;
  }

  function handleMouseLeave() {
    if (glowRef.current) {
      glowRef.current.style.transform = "translate(-60px, -60px)";
    }
  }

  return (
    <div
      ref={cardRef}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      className={[
        "relative overflow-hidden rounded-[1.75rem]",
        "border border-black/[0.08] dark:border-white/[0.08]",
        "bg-white/70 dark:bg-slate-950/85",
        "backdrop-blur-xl",
        "shadow-[0_1px_0_rgba(255,255,255,0.5)_inset,0_20px_60px_rgba(15,23,42,0.08)]",
        "px-8 py-8",
        "animate-fade-up",
      ].join(" ")}
    >
      {/* Ambient glow that follows the cursor */}
      <div
        ref={glowRef}
        aria-hidden
        className={[
          "pointer-events-none absolute -left-[60px] -top-[60px]",
          "h-[340px] w-[340px] rounded-full",
          "bg-[radial-gradient(circle,rgba(56,189,248,0.15)_0%,transparent_70%)]",
          "dark:bg-[radial-gradient(circle,rgba(34,211,238,0.12)_0%,transparent_70%)]",
          "transition-transform duration-[600ms] ease-[cubic-bezier(0.22,1,0.36,1)]",
        ].join(" ")}
      />

      {/* Shimmer sweep */}
      <div
        aria-hidden
        className={[
          "pointer-events-none absolute inset-0 opacity-60",
          "bg-[linear-gradient(105deg,transparent_40%,rgba(255,255,255,0.6)_50%,transparent_60%)]",
          "bg-[length:200%_100%]",
          "animate-shimmer",
        ].join(" ")}
      />

      <div className="relative flex flex-col gap-7">
        {/* Top row: text + actions */}
        <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
          {/* Left: eyebrow + title + description */}
          <div className="flex-1 space-y-4">
            {eyebrow ? (
              <div className="animate-slide-in inline-flex items-center gap-1.5 rounded-full border border-blue-500/20 bg-blue-500/[0.08] px-3 py-[5px] text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-blue-600 dark:border-blue-400/25 dark:bg-blue-400/10 dark:text-blue-400">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-blue-500 dark:bg-blue-400" />
                {eyebrow}
              </div>
            ) : null}

            <div className="animate-fade-up-delay space-y-2">
              <h1 className="max-w-3xl text-[clamp(1.6rem,4vw,2.5rem)] font-semibold leading-[1.15] tracking-[-0.025em] text-slate-900 dark:text-slate-100">
                {title}
              </h1>
              <p className="max-w-[52ch] text-sm font-light leading-[1.75] text-slate-500 dark:text-slate-400 md:text-[0.9rem]">
                {description}
              </p>
              {/* Gradient rule */}
              <div className="mt-4 h-px w-20 origin-left animate-grow bg-gradient-to-r from-blue-500 to-transparent" />
            </div>
          </div>

          {/* Right: action buttons */}
          {actions ? (
            <div className="animate-fade-up-delay flex flex-wrap items-center gap-2.5 xl:pt-1">
              {actions}
            </div>
          ) : null}
        </div>

        {/* Bottom: optional stats row */}
        {stats && stats.length > 0 ? (
          <div className="animate-fade-up-delay2 flex flex-wrap gap-6 border-t border-black/[0.06] pt-4 dark:border-white/[0.06]">
            {stats.map((s, i) => (
              <div key={i} className="flex flex-col gap-0.5">
                <span className="text-[1.1rem] font-semibold text-slate-900 dark:text-slate-100">
                  {s.value}
                </span>
                <span className="text-[0.72rem] tracking-[0.04em] text-slate-400 dark:text-slate-500">
                  {s.label}
                </span>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}