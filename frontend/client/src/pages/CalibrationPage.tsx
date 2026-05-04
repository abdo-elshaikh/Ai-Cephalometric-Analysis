import React, {
  useState, useRef, useEffect, useMemo,
} from "react";
import { useLocation } from "wouter";
import {
  CheckCircle2, AlertTriangle, ChevronRight, ChevronLeft,
  Move, MousePointer2, ZoomIn, ZoomOut, X, RotateCcw,
  Target, Ruler, Info, Sparkles, ArrowLeft, Save,
  FlipHorizontal, Sun, Contrast, Eye, Zap, Maximize2,
} from "lucide-react";
import {
  Card, Pill, PrimaryBtn, SecondaryBtn, IconBtn,
  PageHeader, Field, TextInput, Divider,
} from "@/components/_core/ClinicalComponents";
import { type CaseRecord, type Landmark, type Point } from "@/lib/mappers";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

// ─── Types ────────────────────────────────────────────────────────────────────

type Step = 1 | 2 | 3;

type ImageFilters = {
  brightness: number;
  contrast: number;
  invert: boolean;
};

// ─── Constants ────────────────────────────────────────────────────────────────

const PRESET_DISTANCES: { label: string; mm: number; note: string }[] = [
  { label: "Calibration ruler",         mm: 100,  note: "Standard 100 mm metal ruler included on film" },
  { label: "Long calibration ruler",    mm: 150,  note: "150 mm ruler — common in digital ceph units"   },
  { label: "Sella → Nasion",            mm: 72,   note: "Adult average 68–78 mm (age-dependent)"        },
  { label: "Nasion → Menton",           mm: 120,  note: "Adult average 110–130 mm"                      },
  { label: "Go → Gn (mandible plane)",  mm: 78,   note: "Adult average 70–85 mm"                        },
  { label: "Metallic marker (known)",   mm: 20,   note: "Small radio-opaque marker of known size"       },
];

const STEPS = [
  { n: 1 as Step, label: "Place Points",     desc: "Mark two reference points" },
  { n: 2 as Step, label: "Set Distance",     desc: "Enter real-world length"   },
  { n: 3 as Step, label: "Confirm & Save",   desc: "Review and apply"          },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function dist(a: Point, b: Point) {
  return Math.sqrt((b.x - a.x) ** 2 + (b.y - a.y) ** 2);
}

function qualityLabel(pxPerMm: number): { label: string; tone: "success" | "accent" | "warning"; desc: string } {
  if (pxPerMm >= 2.5) return { label: "Excellent", tone: "success", desc: "Very high spatial resolution — measurements will be highly accurate." };
  if (pxPerMm >= 1.5) return { label: "Good",      tone: "success", desc: "Adequate resolution for clinical measurements."                       };
  if (pxPerMm >= 0.8) return { label: "Fair",      tone: "accent",  desc: "Acceptable — consider using a longer reference line for better accuracy." };
  return                     { label: "Low",        tone: "warning", desc: "Short reference line reduces precision. Use a longer reference if possible." };
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface CalibrationPageProps {
  activeCase?: CaseRecord;
  landmarks?: Landmark[];
  onCalibrate: (pts: Point[], mm: number) => void | Promise<void>;
}

// ─── CalibrationPage ──────────────────────────────────────────────────────────

export default function CalibrationPage({
  activeCase, landmarks = [], onCalibrate,
}: CalibrationPageProps) {
  const [, navigate] = useLocation();

  const [step, setStep]         = useState<Step>(1);
  const [pts, setPts]           = useState<Point[]>(activeCase?.calibrationPoints?.length === 2 ? activeCase.calibrationPoints : []);
  const [distMm, setDistMm]     = useState(String(activeCase?.calibrationDistanceMm ?? ""));
  const [isSaving, setIsSaving] = useState(false);
  const [filters, setFilters]   = useState<ImageFilters>({ brightness: 100, contrast: 115, invert: false });

  const prevCalibrated = activeCase?.calibrated && activeCase.calibrationDistanceMm;

  // ── Derived ──
  const pixPerMm = useMemo(() => {
    if (pts.length === 2 && Number(distMm) > 0) return dist(pts[0], pts[1]) / Number(distMm);
    return null;
  }, [pts, distMm]);

  const quality = pixPerMm ? qualityLabel(pixPerMm) : null;

  // ── Step validation ──
  const canGoStep2 = pts.length === 2;
  const canGoStep3 = canGoStep2 && Number(distMm) > 0;

  // ── Navigation ──
  function goNext() {
    if (step === 1 && canGoStep2) setStep(2);
    else if (step === 2 && canGoStep3) setStep(3);
  }

  function goBack() {
    if (step === 2) setStep(1);
    else if (step === 3) setStep(2);
    else navigate("/viewer");
  }

  // ── Save ──
  async function handleSave() {
    if (!canGoStep3 || isSaving) return;
    setIsSaving(true);
    try {
      await onCalibrate(pts, Number(distMm));
      toast.success("Calibration saved — returning to Viewer");
      navigate("/viewer");
    } catch {
      toast.error("Failed to save calibration");
    } finally {
      setIsSaving(false);
    }
  }

  // ── Reset ──
  function handleReset() {
    setPts([]);
    setStep(1);
  }

  const imageUrl = activeCase?.imageUrl;
  const hasImage = Boolean(imageUrl);

  return (
    <div className="min-h-screen bg-background text-foreground selection:bg-primary/30 pb-20 animate-in fade-in duration-700">
      
      {/* ── Ambient background ── */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-60 -left-40 w-[800px] h-[800px] rounded-full bg-primary/5 blur-[120px] animate-pulse duration-[12s]" />
        <div className="absolute bottom-0 -right-40 w-[600px] h-[600px] rounded-full bg-emerald-500/5 blur-[100px] animate-pulse duration-[10s]" />
      </div>

      <div className="relative z-10 space-y-10 p-6 md:p-8 lg:p-10 max-w-[1600px] mx-auto">
        
        {/* ── Page header ── */}
        <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="h-1.5 w-8 rounded-full bg-gradient-to-r from-primary to-amber-400" />
              <span className="text-xs font-black uppercase tracking-[0.25em] text-primary/80">
                Spatial Telemetry
              </span>
            </div>
            <h1 className="text-4xl font-black tracking-tight text-gradient-primary md:text-5xl">
              Image Calibration
            </h1>
            <p className="text-muted-foreground font-medium max-w-2xl leading-relaxed">
              Define the pixel-to-millimetre scale to enable accurate clinical measurements. Use a physical ruler or known anatomical landmarks.
            </p>
          </div>
          
          <div className="flex items-center gap-3 shrink-0 bg-card/30 backdrop-blur-md p-2 rounded-2xl border border-border/40 shadow-sm-professional">
            <SecondaryBtn onClick={() => navigate("/viewer")} icon={ArrowLeft} className="h-11 px-6 font-black uppercase tracking-widest text-[10px] hover-lift">
              Return to Viewer
            </SecondaryBtn>
            {prevCalibrated && (
              <div className="flex items-center gap-3 px-6 py-2.5 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-500">
                <CheckCircle2 className="h-4 w-4" />
                <span className="text-[10px] font-black uppercase tracking-widest">Active Scale: {activeCase.calibrationDistanceMm}mm</span>
              </div>
            )}
          </div>
        </div>

        {/* ── Step indicator ── */}
        <div className="flex flex-wrap items-center justify-center gap-4 bg-card/30 backdrop-blur-xl p-3 rounded-[32px] border border-border/40 shadow-lg-professional w-fit mx-auto">
          {STEPS.map((s, i) => {
            const done    = step > s.n;
            const active  = step === s.n;
            return (
              <React.Fragment key={s.n}>
                <button
                  type="button"
                  onClick={() => {
                    if (done || (s.n === 2 && canGoStep2) || (s.n === 3 && canGoStep3)) setStep(s.n);
                  }}
                  disabled={!done && !active && !(s.n === 2 && canGoStep2) && !(s.n === 3 && canGoStep3)}
                  className={cn(
                    "flex items-center gap-4 px-6 py-4 rounded-[24px] transition-all text-left group",
                    active ? "bg-primary/10 border border-primary/20 shadow-inner-lg"
                    : done ? "hover:bg-muted/30 cursor-pointer border border-transparent"
                    : "opacity-40 cursor-not-allowed border border-transparent"
                  )}
                >
                  <div className={cn(
                    "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border-2 text-sm font-black transition-all",
                    active ? "border-primary bg-primary text-primary-foreground shadow-lg shadow-primary/20"
                    : done ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-500"
                    : "border-border/50 bg-muted/30 text-muted-foreground"
                  )}>
                    {done ? <CheckCircle2 className="h-5 w-5" /> : s.n}
                  </div>
                  <div className="hidden sm:block">
                    <p className={cn("text-xs font-black uppercase tracking-widest leading-tight", active ? "text-foreground" : "text-muted-foreground")}>{s.label}</p>
                    <p className="text-[10px] text-muted-foreground/50 font-medium mt-1">{s.desc}</p>
                  </div>
                </button>
                {i < STEPS.length - 1 && (
                  <div className={cn("h-px w-6 bg-border/20 hidden md:block", done && "bg-emerald-500/30")} />
                )}
              </React.Fragment>
            );
          })}
        </div>

        {/* ── Main layout ── */}
        <div className="grid gap-10 xl:grid-cols-[1fr_420px]">

          {/* ── Canvas ── */}
          <CalibCanvas
            imageUrl={imageUrl}
            pts={pts}
            setPts={setPts}
            landmarks={landmarks}
            step={step}
            filters={filters}
            distMm={distMm}
            pixPerMm={pixPerMm}
          />

          {/* ── Side panel ── */}
          <div className="space-y-8">

            {/* Image controls */}
            <Card className="p-8 glass-premium shadow-md-professional border-border/40">
              <div className="flex items-center gap-3 mb-6">
                <div className="h-8 w-8 rounded-lg bg-primary/5 flex items-center justify-center text-primary border border-primary/10">
                  <Sun className="h-4 w-4" />
                </div>
                <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Radiograph Fidelity</span>
              </div>
              <div className="space-y-6">
                {[
                  { key:"brightness" as const, label:"Exposure", icon:Sun,      min:30, max:220 },
                  { key:"contrast"   as const, label:"Clarity",   icon:Contrast, min:30, max:220 },
                ].map(f => (
                  <div key={f.key} className="space-y-3">
                    <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-widest text-muted-foreground/60">
                      <span className="flex items-center gap-2">{f.label}</span>
                      <span className="text-foreground tabular-nums">{filters[f.key]}%</span>
                    </div>
                    <input
                      type="range" min={f.min} max={f.max} value={filters[f.key]}
                      onChange={e => setFilters(fv => ({...fv, [f.key]:Number(e.target.value)}))}
                      className="w-full h-1.5 rounded-full bg-muted appearance-none accent-primary cursor-pointer"
                    />
                  </div>
                ))}
                <div className="flex items-center justify-between pt-4 border-t border-border/10">
                  <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60 flex items-center gap-2">
                    <FlipHorizontal className="h-4 w-4"/>Negative Inversion
                  </span>
                  <button
                    type="button"
                    onClick={() => setFilters(f => ({...f, invert:!f.invert}))}
                    className={cn(
                      "relative h-6 w-11 rounded-full border-2 transition-all",
                      filters.invert ? "bg-primary border-primary" : "bg-muted/40 border-border/60"
                    )}
                  >
                    <span className={cn(
                      "absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-lg transition-all",
                      filters.invert ? "left-5" : "left-0.5"
                    )} />
                  </button>
                </div>
              </div>
            </Card>

            {/* ── Step 1: Place points ── */}
            {step === 1 && (
              <Card className="p-8 glass-premium shadow-md-professional border-border/40 space-y-8">
                <div className="flex items-start gap-4">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary border border-primary/20 shadow-xl shadow-primary/10">
                    <Target className="h-6 w-6" />
                  </div>
                  <div>
                    <h3 className="text-lg font-black tracking-tight leading-tight">Place Reference Points</h3>
                    <p className="text-xs text-muted-foreground mt-2 font-medium leading-relaxed">
                      Anchor two points on the radiograph to define the clinical scale. Use a metallic ruler or anatomical markers.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  {[0, 1].map(i => (
                    <div key={i} className={cn(
                      "rounded-2xl border p-5 transition-all duration-500",
                      pts.length > i ? "border-primary/40 bg-primary/5 shadow-inner-lg" : "border-border/40 bg-muted/10 opacity-60"
                    )}>
                      <div className="flex items-center gap-3 mb-3">
                        <div className={cn(
                          "h-6 w-6 rounded-lg border-2 flex items-center justify-center text-[10px] font-black",
                          pts.length > i ? "border-primary bg-primary text-primary-foreground shadow-md" : "border-border/50 text-muted-foreground"
                        )}>
                          {pts.length > i ? "✓" : i + 1}
                        </div>
                        <span className={cn("text-[10px] font-black uppercase tracking-widest", pts.length > i ? "text-primary" : "text-muted-foreground")}>
                          Ref Point {i + 1}
                        </span>
                      </div>
                      {pts[i] ? (
                        <p className="text-sm font-black tabular-nums text-foreground tracking-tight">
                          {Math.round(pts[i].x)}, {Math.round(pts[i].y)} <span className="text-[10px] opacity-40 uppercase ml-1">px</span>
                        </p>
                      ) : (
                        <p className="text-[10px] text-muted-foreground/40 font-bold italic uppercase tracking-widest">Awaiting Capture</p>
                      )}
                    </div>
                  ))}
                </div>

                {pts.length === 2 && (
                  <div className="rounded-[24px] border border-emerald-500/20 bg-emerald-500/5 p-5 flex items-start gap-4 animate-in zoom-in-95 duration-500">
                    <div className="h-10 w-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-500 shadow-sm">
                      <CheckCircle2 className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-xs font-black uppercase tracking-widest text-emerald-600">Points Synchronized</p>
                      <p className="text-[11px] text-muted-foreground font-medium mt-1 leading-relaxed">
                        Reference span captured at <span className="text-foreground font-black">{dist(pts[0], pts[1]).toFixed(0)} pixels</span>. Proceed to scale input.
                      </p>
                    </div>
                  </div>
                )}

                <div className="p-6 rounded-[24px] border border-border/40 bg-muted/10 space-y-4">
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">Calibration Logic</p>
                  <ul className="space-y-3">
                    {[
                      { icon: Maximize2, text: "Longer reference lines increase geometric precision." },
                      { icon: Zap, text: "Points automatically snap to nearby AI landmarks." },
                      { icon: MousePointer2, text: "Drag points on canvas for sub-pixel refinement." },
                    ].map((tip, i) => (
                      <li key={i} className="flex items-start gap-3 text-[11px] text-muted-foreground font-medium leading-relaxed">
                        <tip.icon className="h-3.5 w-3.5 text-primary/40 shrink-0 mt-0.5" />
                        {tip.text}
                      </li>
                    ))}
                  </ul>
                </div>

                {pts.length > 0 && (
                  <button type="button" onClick={handleReset}
                    className="w-full h-11 rounded-xl border border-rose-500/10 text-rose-500/40 hover:text-rose-500 hover:bg-rose-500/5 transition-all text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 group">
                    <RotateCcw className="h-3.5 w-3.5 group-hover:rotate-[-120deg] transition-transform duration-500" /> 
                    Purge Point Data
                  </button>
                )}
              </Card>
            )}

            {/* ── Step 2: Set distance ── */}
            {step === 2 && (
              <Card className="p-8 glass-premium shadow-md-professional border-border/40 space-y-8">
                <div className="flex items-start gap-4">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary border border-primary/20 shadow-xl shadow-primary/10">
                    <Ruler className="h-6 w-6" />
                  </div>
                  <div>
                    <h3 className="text-lg font-black tracking-tight leading-tight">Define Physical Scale</h3>
                    <p className="text-xs text-muted-foreground mt-2 font-medium leading-relaxed">
                      Enter the absolute real-world length between the selected points to synchronize the digital grid.
                    </p>
                  </div>
                </div>

                <div className="relative">
                   <div className="absolute left-5 top-1/2 -translate-y-1/2 text-primary">
                    <Ruler className="h-5 w-5" />
                  </div>
                  <TextInput
                    type="number"
                    value={distMm}
                    onChange={setDistMm}
                    min={1}
                    placeholder="Enter millimeters..."
                    className="pl-14 h-16 text-xl font-black tabular-nums rounded-[24px] border-border/40 bg-muted/10 focus:ring-primary/20"
                  />
                  <div className="absolute right-5 top-1/2 -translate-y-1/2 text-[10px] font-black uppercase tracking-widest text-muted-foreground/40">
                    mm
                  </div>
                </div>

                <div className="space-y-3">
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">Standard Templates</p>
                  <div className="grid gap-2">
                    {PRESET_DISTANCES.slice(0, 4).map(p => (
                      <button
                        key={p.label}
                        type="button"
                        onClick={() => setDistMm(String(p.mm))}
                        className={cn(
                          "w-full flex items-center justify-between rounded-2xl border px-5 py-4 text-left transition-all duration-300",
                          distMm === String(p.mm)
                            ? "border-primary/40 bg-primary/5 shadow-inner-lg"
                            : "border-border/40 bg-muted/10 hover:border-primary/20 hover:bg-muted/20"
                        )}
                      >
                        <div className="flex items-center gap-4">
                          <div className={cn(
                            "h-5 w-5 shrink-0 rounded-lg border-2 flex items-center justify-center transition-all",
                            distMm === String(p.mm) ? "border-primary bg-primary shadow-md" : "border-border/50"
                          )}>
                            {distMm === String(p.mm) && <CheckCircle2 className="h-3.5 w-3.5 text-white" />}
                          </div>
                          <div>
                            <p className="text-xs font-black uppercase tracking-tight">{p.label}</p>
                            <p className="text-[9px] text-muted-foreground/60 font-medium mt-0.5">{p.note}</p>
                          </div>
                        </div>
                        <span className="text-sm font-black tabular-nums text-foreground/80">{p.mm}mm</span>
                      </button>
                    ))}
                  </div>
                </div>

                {pixPerMm && (
                  <div className="p-6 rounded-[24px] border border-border/40 bg-muted/20 space-y-4">
                    <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/40">Scale Telemetry</p>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <p className="text-xl font-black tabular-nums tracking-tighter">{pixPerMm.toFixed(3)}</p>
                        <p className="text-[9px] font-black text-muted-foreground uppercase tracking-widest">px / mm</p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-xl font-black tabular-nums tracking-tighter">{(1 / pixPerMm).toFixed(4)}</p>
                        <p className="text-[9px] font-black text-muted-foreground uppercase tracking-widest">mm / px</p>
                      </div>
                    </div>
                  </div>
                )}
              </Card>
            )}

            {/* ── Step 3: Confirm ── */}
            {step === 3 && (
              <Card className="p-8 glass-premium shadow-md-professional border-border/40 space-y-8">
                <div className="flex items-start gap-4">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 shadow-xl shadow-emerald-500/10">
                    <Sparkles className="h-6 w-6" />
                  </div>
                  <div>
                    <h3 className="text-lg font-black tracking-tight leading-tight">Calibration Summary</h3>
                    <p className="text-xs text-muted-foreground mt-2 font-medium leading-relaxed">
                      Review the calculated spatial resolution before committing to the clinical database.
                    </p>
                  </div>
                </div>

                {pixPerMm && quality && (
                  <div className="space-y-6">
                    <div className="grid grid-cols-2 gap-3">
                      {[
                        { label:"Geometric Span", value:`${dist(pts[0],pts[1]).toFixed(0)} px` },
                        { label:"Reference Scale", value:`${distMm} mm` },
                      ].map(row => (
                        <div key={row.label} className="rounded-2xl border border-border/40 bg-muted/10 p-5">
                          <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground/40 mb-2">{row.label}</p>
                          <p className="text-base font-black tabular-nums tracking-tight">{row.value}</p>
                        </div>
                      ))}
                    </div>

                    <div className={cn(
                      "rounded-[32px] border p-6 flex items-start gap-5 transition-all duration-700",
                      quality.tone === "success" ? "border-emerald-500/20 bg-emerald-500/5"
                      : quality.tone === "accent" ? "border-primary/20 bg-primary/5"
                      : "border-amber-500/20 bg-amber-500/5"
                    )}>
                      <div className={cn(
                        "flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border shadow-xl transition-all",
                        quality.tone === "success" ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-500 shadow-emerald-500/10"
                        : quality.tone === "accent" ? "bg-primary/10 border-primary/20 text-primary shadow-primary/10"
                        : "bg-amber-500/10 border-amber-500/20 text-amber-500 shadow-amber-500/10"
                      )}>
                        <Eye className="h-6 w-6" />
                      </div>
                      <div>
                        <div className="flex items-center gap-3 mb-2">
                          <p className="text-sm font-black tracking-tight">Resolution: {quality.label}</p>
                          <Pill tone={quality.tone} size="xs" className="font-black">{pixPerMm.toFixed(2)} PX/MM</Pill>
                        </div>
                        <p className="text-xs text-muted-foreground font-medium leading-relaxed opacity-70">{quality.desc}</p>
                      </div>
                    </div>

                    <div className="p-6 rounded-[24px] border border-border/40 bg-muted/10">
                      <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/40 mb-4">Sample Projection</p>
                      <div className="space-y-3">
                        {[50, 100].map(px => (
                          <div key={px} className="flex items-center justify-between text-xs">
                            <span className="text-muted-foreground font-mono opacity-40">{px} PX</span>
                            <div className="h-px flex-1 mx-4 border-t border-dashed border-border/40" />
                            <span className="font-black tabular-nums text-foreground">{(px / pixPerMm).toFixed(2)} MM</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {prevCalibrated && (
                  <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-5 flex items-start gap-3">
                    <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                    <p className="text-xs text-muted-foreground font-medium leading-relaxed">
                      Saving will overwrite the existing <span className="font-black text-amber-500">{activeCase.calibrationDistanceMm}mm</span> reference model.
                    </p>
                  </div>
                )}
              </Card>
            )}

            {/* ── Navigation buttons ── */}
            <div className="flex items-center gap-4">
              <button
                type="button"
                onClick={goBack}
                className="flex items-center gap-3 rounded-[20px] border border-border/40 bg-muted/10 px-6 h-14 text-xs font-black uppercase tracking-widest text-muted-foreground hover:text-foreground hover:bg-muted/20 transition-all group"
              >
                <ChevronLeft className="h-4 w-4 group-hover:-translate-x-1 transition-transform" />
                {step === 1 ? "Back" : "Previous"}
              </button>

              {step < 3 ? (
                <button
                  type="button"
                  onClick={goNext}
                  disabled={step === 1 ? !canGoStep2 : !canGoStep3}
                  className={cn(
                    "flex-1 flex items-center justify-center gap-3 h-14 rounded-[20px] font-black text-xs uppercase tracking-widest transition-all group",
                    (step === 1 ? canGoStep2 : canGoStep3)
                      ? "bg-primary text-primary-foreground shadow-xl shadow-primary/20 hover:scale-[1.02] active:scale-[0.98]"
                      : "bg-muted/30 text-muted-foreground cursor-not-allowed opacity-50 border border-border/10"
                  )}
                >
                  Continue Flow
                  <ChevronRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
                </button>
              ) : (
                <PrimaryBtn
                  onClick={handleSave}
                  icon={Save}
                  disabled={isSaving || !canGoStep3}
                  className="flex-1 h-14 rounded-[20px] shadow-xl shadow-primary/20 font-black text-xs uppercase tracking-widest"
                >
                  {isSaving ? "Synchronizing..." : "Apply Scale"}
                </PrimaryBtn>
              )}
            </div>

            {!hasImage && (
              <div className="rounded-2xl border border-rose-500/20 bg-rose-500/5 p-6 flex items-start gap-4">
                <AlertTriangle className="h-6 w-6 text-rose-500 shrink-0 mt-0.5 animate-pulse" />
                <div>
                  <p className="text-sm font-black text-rose-500">Image Asset Missing</p>
                  <p className="text-xs text-muted-foreground mt-1 font-medium leading-relaxed">
                    Upload a clinical radiograph in the analysis orchestration module before initializing calibration.
                  </p>
                </div>
              </div>
            )}

          </div>
        </div>
      </div>
    </div>
  );
}

// ─── CalibCanvas ──────────────────────────────────────────────────────────────

interface CalibCanvasProps {
  imageUrl?: string;
  pts: Point[];
  setPts: (pts: Point[]) => void;
  landmarks: Landmark[];
  step: Step;
  filters: ImageFilters;
  distMm: string;
  pixPerMm: number | null;
}

function CalibCanvas({ imageUrl, pts, setPts, landmarks, step, filters, distMm, pixPerMm }: CalibCanvasProps) {
  const svgRef = useRef<SVGSVGElement>(null);

  const [zoom, setZoom]           = useState(1);
  const [pan, setPan]             = useState<Point>({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [lastPanPt, setLastPanPt] = useState<Point | null>(null);
  const [draggingIdx, setDraggingIdx] = useState<number | null>(null);
  const [cursorPt, setCursorPt]   = useState<Point | null>(null);
  const [snapCode, setSnapCode]   = useState<string | null>(null);

  useEffect(() => { setZoom(1); setPan({ x: 0, y: 0 }); }, [imageUrl]);

  function svgPt(e: React.PointerEvent | React.WheelEvent): Point {
    const svg = svgRef.current; if (!svg) return { x: 0, y: 0 };
    const r = svg.getBoundingClientRect();
    const cx = ('clientX' in e ? e.clientX : 0), cy = ('clientY' in e ? e.clientY : 0);
    const vx = ((cx - r.left) / r.width) * 1000;
    const vy = ((cy - r.top) / r.height) * 720;
    return { x: (vx - pan.x) / zoom, y: (vy - pan.y) / zoom };
  }

  function vpPt(e: React.PointerEvent | React.WheelEvent): Point {
    const svg = svgRef.current; if (!svg) return { x: 0, y: 0 };
    const r = svg.getBoundingClientRect();
    const cx = ('clientX' in e ? e.clientX : 0), cy = ('clientY' in e ? e.clientY : 0);
    return { x: ((cx - r.left) / r.width) * 1000, y: ((cy - r.top) / r.height) * 720 };
  }

  function nearestLandmark(pt: Point, thresh: number): Landmark | null {
    let best: Landmark | null = null, bDist = thresh;
    for (const lm of landmarks) {
      const d = dist(pt, lm);
      if (d < bDist) { bDist = d; best = lm; }
    }
    return best;
  }

  function applyZoom(factor: number, pivot: Point) {
    const nz = Math.max(0.5, Math.min(12, zoom * factor));
    setPan({ x: pivot.x - (pivot.x - pan.x) * nz / zoom, y: pivot.y - (pivot.y - pan.y) * nz / zoom });
    setZoom(nz);
  }

  function handleWheel(e: React.WheelEvent) {
    e.preventDefault();
    applyZoom(e.deltaY < 0 ? 1.12 : 1 / 1.12, vpPt(e));
  }

  function handlePointerDown(e: React.PointerEvent) {
    if (e.altKey || e.button === 1) {
      (e.currentTarget as Element).setPointerCapture(e.pointerId);
      setIsPanning(true); setLastPanPt({ x: e.clientX, y: e.clientY });
      return;
    }
    if (step !== 1) {
      (e.currentTarget as Element).setPointerCapture(e.pointerId);
      setIsPanning(true); setLastPanPt({ x: e.clientX, y: e.clientY });
      return;
    }
    const raw  = svgPt(e);
    const snap = nearestLandmark(raw, 24 / zoom);
    const pt   = snap ? { x: snap.x, y: snap.y } : raw;
    const updated = pts.length >= 2 ? [pt] : [...pts, pt];
    setPts(updated);
  }

  function handlePointerMove(e: React.PointerEvent) {
    const raw = svgPt(e);
    setCursorPt(raw);
    const snap = nearestLandmark(raw, 24 / zoom);
    setSnapCode(snap?.code ?? null);
    if (isPanning && lastPanPt) {
      const svg = svgRef.current; if (!svg) return;
      const r = svg.getBoundingClientRect();
      const dx = (e.clientX - lastPanPt.x) / r.width * 1000;
      const dy = (e.clientY - lastPanPt.y) / r.height * 720;
      setPan(p => ({ x: p.x + dx, y: p.y + dy }));
      setLastPanPt({ x: e.clientX, y: e.clientY });
      return;
    }
    if (draggingIdx !== null) {
      const snap = nearestLandmark(raw, 24 / zoom);
      const pt = snap ? { x: snap.x, y: snap.y } : raw;
      setPts(pts.map((p, i) => i === draggingIdx ? pt : p));
    }
  }

  function handlePointerUp(e: React.PointerEvent) {
    try { (e.currentTarget as Element).releasePointerCapture(e.pointerId); } catch {}
    setIsPanning(false); setLastPanPt(null);
    setDraggingIdx(null);
  }

  function handleDoubleClick(e: React.MouseEvent) {
    const vp = vpPt(e as unknown as React.PointerEvent);
    if (zoom >= 4) { setZoom(1); setPan({ x: 0, y: 0 }); }
    else applyZoom(2, vp);
  }

  const cssFilter = [
    `brightness(${filters.brightness}%)`,
    `contrast(${filters.contrast}%)`,
    filters.invert ? "invert(100%)" : "",
  ].filter(Boolean).join(" ");

  const pxDist = pts.length === 2 ? dist(pts[0], pts[1]) : null;
  const midPt  = pts.length === 2 ? { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 } : null;

  return (
    <Card noPadding className="relative overflow-hidden bg-[#07070e] border-border/20 shadow-2xl-professional rounded-[40px] group/canvas">

      {/* Zoom controls */}
      <div className="absolute right-6 bottom-16 z-20 transition-all duration-500 opacity-0 group-hover/canvas:opacity-100 translate-y-4 group-hover/canvas:translate-y-0">
        <div className="flex flex-col rounded-[20px] border border-white/10 bg-black/60 backdrop-blur-xl p-1.5 shadow-2xl gap-1">
          <button type="button" onClick={() => applyZoom(1.3, { x: 500, y: 360 })}
            className="h-10 w-10 flex items-center justify-center text-white/40 hover:text-white hover:bg-primary/20 rounded-xl transition-all">
            <ZoomIn className="h-4 w-4" />
          </button>
          <button type="button" onClick={() => { if (zoom <= 1) { setZoom(1); setPan({ x: 0, y: 0 }); } else applyZoom(1 / 1.3, { x: 500, y: 360 }); }}
            className="h-10 w-10 flex items-center justify-center text-white/40 hover:text-white hover:bg-primary/20 rounded-xl transition-all">
            <ZoomOut className="h-4 w-4" />
          </button>
          <div className="h-px bg-white/5 mx-2" />
          <button type="button" onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }}
            className="h-10 w-10 flex items-center justify-center text-[9px] font-black text-white/20 hover:text-white transition-colors">
            FIT
          </button>
        </div>
      </div>

      {/* Top indicator */}
      <div className="absolute top-0 inset-x-0 z-10 flex items-center justify-between px-8 py-6 bg-gradient-to-b from-black/80 via-black/40 to-transparent pointer-events-none">
        <div className="flex items-center gap-4">
          <div className={cn(
            "flex items-center gap-3 px-4 py-2 rounded-full border text-[10px] font-black uppercase tracking-widest backdrop-blur-xl shadow-lg transition-all duration-700",
            step === 1 ? "bg-primary/20 border-primary/40 text-primary"
            : step === 2 ? "bg-white/10 border-white/20 text-white/60"
            : "bg-emerald-500/20 border-emerald-500/40 text-emerald-500"
          )}>
            <div className={cn("h-1.5 w-1.5 rounded-full",
              step === 1 ? "bg-primary animate-pulse shadow-[0_0_8px_rgba(var(--primary),0.8)]" : step === 2 ? "bg-white/40" : "bg-emerald-500"
            )} />
            {step === 1 ? `${pts.length}/2 Captured` : step === 2 ? "Metric Synchronization" : "Telemetry Ready"}
          </div>
          {zoom !== 1 && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-full bg-white/5 backdrop-blur-xl border border-white/10 text-[10px] font-black text-white/40 shadow-lg">
              <Maximize2 className="h-3 w-3" />{Math.round(zoom * 100)}%
            </div>
          )}
        </div>
        <div className="flex items-center gap-4 text-[10px] font-mono text-white/20">
          {cursorPt && (
            <span className="bg-black/40 px-3 py-1.5 rounded-lg border border-white/5">{Math.round(cursorPt.x)}, {Math.round(cursorPt.y)}</span>
          )}
          {snapCode && <span className="text-primary/60 bg-primary/10 px-3 py-1.5 rounded-lg border border-primary/20">⊕ SNAP: {snapCode}</span>}
        </div>
      </div>

      {/* Main SVG */}
      <div className="aspect-[1000/720] min-h-[580px]">
        <svg
          ref={svgRef}
          viewBox="0 0 1000 720"
          className={cn("h-full w-full touch-none select-none",
            isPanning || draggingIdx !== null ? "cursor-grabbing"
            : step === 1 ? "cursor-crosshair"
            : "cursor-grab"
          )}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
          onWheel={handleWheel}
          onDoubleClick={handleDoubleClick}
        >
          <defs>
            <radialGradient id="glow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.4" />
              <stop offset="100%" stopColor="var(--primary)" stopOpacity="0" />
            </radialGradient>
          </defs>
          
          <rect width="1000" height="720" fill="#07070e" />

          <g transform={`translate(${pan.x},${pan.y}) scale(${zoom})`}>
            {imageUrl && (
              <image
                href={imageUrl} x="0" y="0" width="1000" height="720"
                preserveAspectRatio="xMidYMid meet"
                style={{ filter: cssFilter }}
              />
            )}

            {/* Snap markers */}
            {landmarks.map(lm => {
              const isSnap = lm.code === snapCode;
              return (
                <g key={lm.code} opacity={isSnap ? 1 : 0.15}>
                  {isSnap && <circle cx={lm.x} cy={lm.y} r="20" fill="url(#glow)" className="animate-pulse" />}
                  <circle cx={lm.x} cy={lm.y} r={isSnap ? 12 : 0} fill="none"
                    stroke="var(--primary)" strokeWidth="1.5" strokeDasharray="4 3" />
                  <circle cx={lm.x} cy={lm.y} r="3" fill="var(--primary)" stroke="#000" strokeWidth="1" />
                </g>
              );
            })}

            {/* Calibration UI */}
            {pts.length === 2 && pxDist && midPt && (
              <g className="animate-in fade-in duration-1000">
                <line x1={pts[0].x} y1={pts[0].y} x2={pts[1].x} y2={pts[1].y}
                  stroke="var(--primary)" strokeWidth="16" strokeOpacity="0.05" />
                <line x1={pts[0].x} y1={pts[0].y} x2={pts[1].x} y2={pts[1].y}
                  stroke="var(--primary)" strokeWidth="2" strokeOpacity="0.8"
                  strokeDasharray={step > 1 ? undefined : "10 5"} />
                
                {pts.map((p, i) => (
                  <g key={i} onPointerDown={e => { e.stopPropagation(); setDraggingIdx(i); }}>
                    <circle cx={p.x} cy={p.y} r="24" fill="transparent" className="cursor-pointer" />
                    <circle cx={p.x} cy={p.y} r="10" fill="var(--primary)" stroke="#fff" strokeWidth="2.5" className="shadow-lg shadow-black/50" />
                    <circle cx={p.x} cy={p.y} r="4" fill="#000" />
                  </g>
                ))}

                {midPt && (
                  <g transform={`translate(${midPt.x},${midPt.y})`}>
                    <rect x="-45" y="-35" width="90" height="24" rx="12" fill="rgba(0,0,0,0.8)" stroke="rgba(255,255,255,0.1)" strokeWidth="1" />
                    <text y="-19" textAnchor="middle" fill="#fff" fontSize="11" fontWeight="black" fontFamily="system-ui" className="tabular-nums">
                      {distMm ? `${distMm}mm` : `${pxDist.toFixed(0)}px`}
                    </text>
                  </g>
                )}
              </g>
            )}

            {/* Single point placement */}
            {pts.length === 1 && (
              <g>
                <circle cx={pts[0].x} cy={pts[0].y} r="24" fill="rgba(var(--primary),0.1)" className="animate-pulse" />
                <circle cx={pts[0].x} cy={pts[0].y} r="6" fill="var(--primary)" stroke="#fff" strokeWidth="2" />
              </g>
            )}
          </g>
        </svg>
      </div>
    </Card>
  );
}
