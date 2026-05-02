import React, {
  useState, useRef, useEffect, useMemo, useCallback,
} from "react";
import { useLocation } from "wouter";
import {
  CheckCircle2, AlertTriangle, ChevronRight, ChevronLeft,
  Move, MousePointer2, ZoomIn, ZoomOut, X, RotateCcw,
  Target, Ruler, Info, Sparkles, ArrowLeft, Save,
  FlipHorizontal, Sun, Contrast, Eye,
} from "lucide-react";
import {
  Card, Pill, PrimaryBtn, SecondaryBtn, IconBtn,
  PageHeader, Field, TextInput,
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

function perpTick(p: Point, p2: Point, half: number) {
  const dx = p2.x - p.x, dy = p2.y - p.y, len = Math.sqrt(dx * dx + dy * dy) || 1;
  return { x1: p.x - dy / len * half, y1: p.y + dx / len * half, x2: p.x + dy / len * half, y2: p.y - dx / len * half };
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
    <div className="space-y-5 animate-in fade-in duration-400">
      <PageHeader
        eyebrow="Spatial Calibration"
        title="Image Calibration"
        description="Define the pixel-to-millimetre scale for accurate clinical measurements on this radiograph."
        actions={
          <>
            {prevCalibrated && (
              <Pill tone="success" size="sm">
                Previously calibrated · {activeCase.calibrationDistanceMm} mm ref
              </Pill>
            )}
            <SecondaryBtn onClick={() => navigate("/viewer")} icon={ArrowLeft} className="h-10 px-5">
              Back to Viewer
            </SecondaryBtn>
          </>
        }
      />

      {/* ── Step indicator ── */}
      <div className="flex items-center gap-0">
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
                  "flex items-center gap-3 px-5 py-3 rounded-2xl transition-all text-left",
                  active  ? "bg-primary/10 border border-primary/30"
                  : done  ? "hover:bg-muted/30 cursor-pointer"
                  : "opacity-40 cursor-not-allowed"
                )}
              >
                <div className={cn(
                  "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 text-xs font-bold transition-all",
                  active ? "border-primary bg-primary text-primary-foreground"
                  : done  ? "border-success bg-success/20 text-success"
                  : "border-border/50 bg-muted/30 text-muted-foreground"
                )}>
                  {done ? <CheckCircle2 className="h-4 w-4" /> : s.n}
                </div>
                <div>
                  <p className={cn("text-sm font-bold leading-tight", active ? "text-foreground" : "text-muted-foreground")}>{s.label}</p>
                  <p className="text-[10px] text-muted-foreground/60">{s.desc}</p>
                </div>
              </button>
              {i < STEPS.length - 1 && (
                <ChevronRight className={cn("h-4 w-4 shrink-0 mx-1", step > s.n ? "text-success" : "text-border/60")} />
              )}
            </React.Fragment>
          );
        })}
      </div>

      {/* ── Main layout ── */}
      <div className="grid gap-4 xl:grid-cols-[1fr_380px]">

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
        <div className="space-y-4">

          {/* Image controls */}
          <Card>
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-3">Image Display</p>
            <div className="space-y-3">
              {[
                { key:"brightness" as const, label:"Brightness", icon:Sun,      min:30, max:220 },
                { key:"contrast"   as const, label:"Contrast",   icon:Contrast, min:30, max:220 },
              ].map(f => (
                <div key={f.key} className="space-y-1">
                  <div className="flex items-center justify-between text-[10px] font-bold uppercase text-muted-foreground">
                    <span className="flex items-center gap-1"><f.icon className="h-3 w-3"/>{f.label}</span>
                    <span className="text-foreground tabular-nums">{filters[f.key]}%</span>
                  </div>
                  <input
                    type="range" min={f.min} max={f.max} value={filters[f.key]}
                    onChange={e => setFilters(fv => ({...fv, [f.key]:Number(e.target.value)}))}
                    className="w-full h-1.5 rounded-full bg-muted appearance-none accent-primary cursor-pointer"
                  />
                </div>
              ))}
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-1">
                  <FlipHorizontal className="h-3 w-3"/>Invert
                </span>
                <button
                  type="button"
                  onClick={() => setFilters(f => ({...f, invert:!f.invert}))}
                  className={cn(
                    "relative h-5 w-9 rounded-full border transition-all",
                    filters.invert ? "bg-primary border-primary" : "bg-muted/40 border-border/60"
                  )}
                >
                  <span className={cn(
                    "absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all",
                    filters.invert ? "left-4" : "left-0.5"
                  )} />
                </button>
              </div>
            </div>
          </Card>

          {/* ── Step 1: Place points ── */}
          {step === 1 && (
            <Card className="space-y-4">
              <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Target className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold">Place Two Reference Points</h3>
                  <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                    Click on any two identifiable locations whose real-world distance you know precisely — a ruler, 
                    known anatomical landmarks, or a calibration marker.
                  </p>
                </div>
              </div>

              {/* Point status */}
              <div className="grid grid-cols-2 gap-2">
                {[0, 1].map(i => (
                  <div key={i} className={cn(
                    "rounded-xl border p-3 transition-all",
                    pts.length > i ? "border-primary/40 bg-primary/5" : "border-border/50 bg-muted/10"
                  )}>
                    <div className="flex items-center gap-2 mb-1">
                      <div className={cn(
                        "h-5 w-5 rounded-full border-2 flex items-center justify-center text-[9px] font-bold",
                        pts.length > i ? "border-primary bg-primary text-primary-foreground" : "border-border/50 text-muted-foreground"
                      )}>
                        {pts.length > i ? "✓" : i + 1}
                      </div>
                      <span className={cn("text-xs font-bold", pts.length > i ? "text-primary" : "text-muted-foreground")}>
                        Ref {i + 1}
                      </span>
                    </div>
                    {pts[i] ? (
                      <p className="text-[9px] font-mono text-muted-foreground">
                        {Math.round(pts[i].x)}, {Math.round(pts[i].y)} px
                      </p>
                    ) : (
                      <p className="text-[9px] text-muted-foreground/50 italic">Click on canvas</p>
                    )}
                  </div>
                ))}
              </div>

              {pts.length === 2 && (
                <div className="rounded-xl border border-success/30 bg-success/5 p-3 flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-success shrink-0" />
                  <div>
                    <p className="text-xs font-bold text-success">Both points placed</p>
                    <p className="text-[10px] text-muted-foreground">
                      Span: {dist(pts[0], pts[1]).toFixed(0)} px · Drag points to refine
                    </p>
                  </div>
                </div>
              )}

              {/* Tips */}
              <div className="rounded-xl border border-border/40 bg-muted/10 p-3 space-y-2">
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Tips</p>
                <ul className="space-y-1 text-[10px] text-muted-foreground leading-relaxed">
                  <li>• <strong>Longer reference lines</strong> give more accurate calibration</li>
                  <li>• Points snap to nearby AI landmarks (shown in blue)</li>
                  <li>• Drag placed points to reposition them precisely</li>
                  <li>• Zoom in for precise point placement</li>
                </ul>
              </div>

              {pts.length > 0 && (
                <button type="button" onClick={handleReset}
                  className="text-[10px] font-bold text-destructive/60 hover:text-destructive transition-colors flex items-center gap-1">
                  <RotateCcw className="h-3 w-3" /> Reset all points
                </button>
              )}
            </Card>
          )}

          {/* ── Step 2: Set distance ── */}
          {step === 2 && (
            <Card className="space-y-4">
              <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Ruler className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold">Enter True Distance</h3>
                  <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                    What is the real-world distance between the two reference points you placed?
                  </p>
                </div>
              </div>

              <Field label="Distance (mm)">
                <TextInput
                  type="number"
                  value={distMm}
                  onChange={setDistMm}
                  min={1}
                  placeholder="e.g. 100"
                />
              </Field>

              {/* Preset distances */}
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2">Common References</p>
                <div className="space-y-1.5">
                  {PRESET_DISTANCES.map(p => (
                    <button
                      key={p.label}
                      type="button"
                      onClick={() => setDistMm(String(p.mm))}
                      className={cn(
                        "w-full flex items-start gap-3 rounded-xl border px-3 py-2.5 text-left transition-all",
                        distMm === String(p.mm)
                          ? "border-primary/40 bg-primary/5"
                          : "border-border/40 bg-muted/10 hover:border-primary/20 hover:bg-muted/20"
                      )}
                    >
                      <div className={cn(
                        "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[8px] font-bold mt-0.5",
                        distMm === String(p.mm) ? "border-primary bg-primary text-primary-foreground" : "border-border/50"
                      )}>
                        {distMm === String(p.mm) ? "✓" : ""}
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-bold leading-tight">{p.label}</p>
                        <p className="text-[9px] text-muted-foreground/70 mt-0.5 leading-relaxed">{p.note}</p>
                      </div>
                      <span className="text-xs font-bold text-muted-foreground shrink-0 ml-auto">{p.mm} mm</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Live preview */}
              {pixPerMm && (
                <div className="rounded-xl border border-border/40 bg-muted/10 p-3 space-y-1">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Preview</p>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="rounded-lg bg-muted/20 p-2 text-center">
                      <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest mb-0.5">px / mm</p>
                      <p className="text-base font-bold tabular-nums">{pixPerMm.toFixed(3)}</p>
                    </div>
                    <div className="rounded-lg bg-muted/20 p-2 text-center">
                      <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest mb-0.5">mm / px</p>
                      <p className="text-base font-bold tabular-nums">{(1 / pixPerMm).toFixed(4)}</p>
                    </div>
                  </div>
                </div>
              )}
            </Card>
          )}

          {/* ── Step 3: Confirm ── */}
          {step === 3 && (
            <Card className="space-y-4">
              <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-success/10 text-success">
                  <Sparkles className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold">Confirm Calibration</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">Review the spatial scale before saving.</p>
                </div>
              </div>

              {pixPerMm && quality && (
                <div className="space-y-3">
                  {/* Summary grid */}
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { label:"Reference span",  value:`${dist(pts[0],pts[1]).toFixed(0)} px` },
                      { label:"True distance",   value:`${distMm} mm`                         },
                      { label:"Pixel density",   value:`${pixPerMm.toFixed(3)} px/mm`         },
                      { label:"Spatial res.",    value:`${(1/pixPerMm).toFixed(4)} mm/px`      },
                    ].map(row => (
                      <div key={row.label} className="rounded-xl border border-border/40 bg-muted/10 p-3">
                        <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground mb-1">{row.label}</p>
                        <p className="text-sm font-bold tabular-nums">{row.value}</p>
                      </div>
                    ))}
                  </div>

                  {/* Quality indicator */}
                  <div className={cn(
                    "rounded-xl border p-3 flex items-start gap-3",
                    quality.tone === "success" ? "border-success/30 bg-success/5"
                    : quality.tone === "accent" ? "border-primary/30 bg-primary/5"
                    : "border-warning/30 bg-warning/5"
                  )}>
                    <div className={cn(
                      "flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-xs font-bold",
                      quality.tone === "success" ? "bg-success/20 text-success"
                      : quality.tone === "accent" ? "bg-primary/20 text-primary"
                      : "bg-warning/20 text-warning"
                    )}>
                      <Eye className="h-4 w-4" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <p className="text-xs font-bold">Quality: {quality.label}</p>
                        <Pill tone={quality.tone} size="xs">{pixPerMm.toFixed(2)} px/mm</Pill>
                      </div>
                      <p className="text-[10px] text-muted-foreground leading-relaxed">{quality.desc}</p>
                    </div>
                  </div>

                  {/* Example measurement preview */}
                  <div className="rounded-xl border border-border/40 bg-muted/10 p-3">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2">
                      Measurement preview
                    </p>
                    <div className="space-y-1">
                      {[50, 100, 150].map(px => (
                        <div key={px} className="flex items-center justify-between text-xs">
                          <span className="text-muted-foreground font-mono">{px} px</span>
                          <span className="h-px flex-1 mx-3 border-t border-dashed border-border/40" />
                          <span className="font-bold">{(px / pixPerMm).toFixed(2)} mm</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {prevCalibrated && (
                <div className="rounded-xl border border-warning/30 bg-warning/5 p-3 flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 text-warning shrink-0 mt-0.5" />
                  <p className="text-xs text-warning/90 leading-relaxed">
                    This will replace the existing calibration ({activeCase.calibrationDistanceMm} mm reference).
                  </p>
                </div>
              )}
            </Card>
          )}

          {/* ── Navigation buttons ── */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={goBack}
              className="flex items-center gap-2 rounded-xl border border-border/50 bg-muted/20 px-4 h-11 text-sm font-bold text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-all"
            >
              <ChevronLeft className="h-4 w-4" />
              {step === 1 ? "Back to Viewer" : "Previous"}
            </button>

            {step < 3 ? (
              <button
                type="button"
                onClick={goNext}
                disabled={step === 1 ? !canGoStep2 : !canGoStep3}
                className={cn(
                  "flex-1 flex items-center justify-center gap-2 h-11 rounded-xl font-bold text-sm transition-all",
                  (step === 1 ? canGoStep2 : canGoStep3)
                    ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20 hover:bg-primary/90"
                    : "bg-muted/30 text-muted-foreground cursor-not-allowed opacity-50"
                )}
              >
                Continue
                <ChevronRight className="h-4 w-4" />
              </button>
            ) : (
              <PrimaryBtn
                onClick={handleSave}
                icon={Save}
                disabled={isSaving || !canGoStep3}
                className="flex-1 h-11"
              >
                {isSaving ? "Saving…" : "Save Calibration"}
              </PrimaryBtn>
            )}
          </div>

          {/* No image warning */}
          {!hasImage && (
            <div className="rounded-xl border border-warning/30 bg-warning/5 p-4 flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-warning shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-bold text-warning">No image loaded</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Upload a radiograph in the Analysis page before calibrating.
                </p>
              </div>
            </div>
          )}

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

  // Auto-fit when image changes
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
    // Pan on alt/middle/pan drag
    if (e.altKey || e.button === 1) {
      (e.currentTarget as Element).setPointerCapture(e.pointerId);
      setIsPanning(true); setLastPanPt({ x: e.clientX, y: e.clientY });
      return;
    }

    // Only place/interact in step 1
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
    <Card noPadding className="relative overflow-hidden bg-[#07070e] border-border/20 shadow-2xl">

      {/* Zoom controls */}
      <div className="absolute right-4 bottom-14 z-20">
        <div className="flex flex-col rounded-xl border border-white/10 bg-black/80 backdrop-blur-md p-1 shadow-2xl gap-0.5">
          <button type="button" onClick={() => applyZoom(1.3, { x: 500, y: 360 })}
            className="h-9 w-9 flex items-center justify-center text-white/40 hover:text-white hover:bg-white/10 rounded-lg transition-all">
            <ZoomIn className="h-3.5 w-3.5" />
          </button>
          <div className="h-px bg-white/5 mx-1.5" />
          <button type="button" onClick={() => { if (zoom <= 1) { setZoom(1); setPan({ x: 0, y: 0 }); } else applyZoom(1 / 1.3, { x: 500, y: 360 }); }}
            className="h-9 w-9 flex items-center justify-center text-white/40 hover:text-white hover:bg-white/10 rounded-lg transition-all">
            <ZoomOut className="h-3.5 w-3.5" />
          </button>
          <div className="h-px bg-white/5 mx-1.5" />
          <button type="button" onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }}
            className="h-8 w-9 flex items-center justify-center text-[8px] font-bold text-white/25 hover:text-white transition-colors">
            FIT
          </button>
        </div>
      </div>

      {/* Top indicator */}
      <div className="absolute top-0 inset-x-0 z-10 flex items-center justify-between px-4 py-2.5 bg-gradient-to-b from-black/85 to-transparent pointer-events-none">
        <div className="flex items-center gap-2">
          <div className={cn(
            "flex items-center gap-2 px-3 py-1.5 rounded-full border text-[9px] font-bold uppercase tracking-widest backdrop-blur shadow",
            step === 1 ? "bg-primary/25 border-primary/50 text-primary"
            : step === 2 ? "bg-muted/60 border-white/10 text-white/70"
            : "bg-success/25 border-success/50 text-success"
          )}>
            <div className={cn("h-1.5 w-1.5 rounded-full",
              step === 1 ? "bg-primary animate-pulse" : step === 2 ? "bg-white/40" : "bg-success"
            )} />
            {step === 1 ? `${pts.length}/2 points placed` : step === 2 ? "View reference span" : "Calibration ready"}
          </div>
          {zoom !== 1 && (
            <div className="flex items-center gap-1 px-2.5 py-1.5 rounded-full bg-primary/20 backdrop-blur border border-primary/40 text-[9px] font-bold text-primary">
              <ZoomIn className="h-2.5 w-2.5" />{Math.round(zoom * 100)}%
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 text-[9px] font-mono text-white/30">
          {cursorPt && (
            <span className="px-2 py-1 rounded bg-black/50">{Math.round(cursorPt.x)}, {Math.round(cursorPt.y)}</span>
          )}
          {snapCode && <span className="text-yellow-400/70 px-2 py-1 rounded bg-black/50">⊕ snap: {snapCode}</span>}
        </div>
      </div>

      {/* Instructions overlay when no image */}
      {!imageUrl && (
        <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none">
          <div className="text-center">
            <Target className="h-10 w-10 text-white/10 mx-auto mb-3" />
            <p className="text-white/20 font-bold text-lg">No Image Loaded</p>
            <p className="text-white/10 text-sm mt-1">Upload a radiograph first</p>
          </div>
        </div>
      )}

      {/* Main SVG */}
      <div className="aspect-[1000/720] min-h-[520px]">
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
          <rect width="1000" height="720" fill="#07070e" />

          <g transform={`translate(${pan.x},${pan.y}) scale(${zoom})`}>

            {/* X-ray image */}
            {imageUrl && (
              <image
                href={imageUrl} x="0" y="0" width="1000" height="720"
                preserveAspectRatio="xMidYMid meet"
                style={{ filter: cssFilter }}
              />
            )}

            {/* Landmark dots for reference/snapping — faded */}
            {landmarks.map(lm => {
              const isSnap = lm.code === snapCode;
              return (
                <g key={lm.code} opacity={isSnap ? 1 : 0.25}>
                  <circle cx={lm.x} cy={lm.y} r={isSnap ? 14 : 0} fill="none"
                    stroke="#60a5fa" strokeWidth="1.5" strokeDasharray="3 2" className={isSnap?"animate-pulse":""} />
                  <circle cx={lm.x} cy={lm.y} r="3" fill="#60a5fa" stroke="#000" strokeWidth="1" />
                  {isSnap && (
                    <g transform={`translate(${lm.x + 14},${lm.y - 20})`}>
                      <rect x="-2" y="-9" width={lm.code.length * 7 + 10} height="14" rx="4" fill="rgba(0,0,0,0.9)" />
                      <text x={(lm.code.length * 7 + 10) / 2 - 2} y="1.5" fill="#60a5fa" fontSize="9"
                        fontWeight="bold" textAnchor="middle" fontFamily="system-ui">{lm.code}</text>
                    </g>
                  )}
                </g>
              );
            })}

            {/* Calibration ruler line */}
            {pts.length === 2 && pxDist && midPt && (
              <g>
                {/* Shadow glow */}
                <line x1={pts[0].x} y1={pts[0].y} x2={pts[1].x} y2={pts[1].y}
                  stroke="#f59e0b" strokeWidth="12" strokeOpacity="0.06" />
                {/* Main line */}
                <line x1={pts[0].x} y1={pts[0].y} x2={pts[1].x} y2={pts[1].y}
                  stroke="#f59e0b" strokeWidth="2.5" strokeOpacity="0.9"
                  strokeDasharray={step > 1 ? undefined : "12 6"} />
                {/* Tick marks */}
                {[perpTick(pts[0], pts[1], 16), perpTick(pts[1], pts[0], 16)].map((t, i) => (
                  <line key={i} x1={t.x1} y1={t.y1} x2={t.x2} y2={t.y2}
                    stroke="#f59e0b" strokeWidth="2.5" strokeOpacity="0.9" />
                ))}
                {/* Sub-ticks */}
                {Array.from({ length: Math.max(0, Math.floor(pxDist / 40) - 1) }).map((_, ti) => {
                  const frac = (ti + 1) / Math.floor(pxDist / 40);
                  const tx = pts[0].x + (pts[1].x - pts[0].x) * frac;
                  const ty = pts[0].y + (pts[1].y - pts[0].y) * frac;
                  const tp = perpTick({ x: tx, y: ty }, pts[1], 6);
                  return <line key={ti} x1={tp.x1} y1={tp.y1} x2={tp.x2} y2={tp.y2}
                    stroke="#f59e0b" strokeWidth="1.2" strokeOpacity="0.4" />;
                })}
                {/* Label */}
                <g transform={`translate(${midPt.x},${midPt.y})`}>
                  <rect x="-52" y="-32" width="104" height="57" rx="12"
                    fill="rgba(0,0,0,0.92)" stroke="#f59e0b" strokeWidth="1.5" />
                  <text x="0" y="-10" fill="#f59e0b" fontSize="15" fontWeight="bold"
                    textAnchor="middle" fontFamily="system-ui">
                    {distMm ? `${distMm} mm` : "? mm"}
                  </text>
                  <text x="0" y="9" fill="rgba(245,158,11,0.6)" fontSize="9"
                    textAnchor="middle" fontFamily="system-ui">
                    {pxDist.toFixed(0)} px
                  </text>
                  {pixPerMm && (
                    <text x="0" y="20" fill="rgba(245,158,11,0.8)" fontSize="9" fontWeight="bold"
                      textAnchor="middle" fontFamily="system-ui">
                      {pixPerMm.toFixed(3)} px/mm
                    </text>
                  )}
                </g>
              </g>
            )}

            {/* Reference point markers */}
            {pts.map((pt, i) => (
              <g
                key={i}
                onPointerDown={e => {
                  if (step !== 1) return;
                  e.stopPropagation();
                  (e.currentTarget as Element).setPointerCapture(e.pointerId);
                  setDraggingIdx(i);
                }}
                className={step === 1 ? "cursor-move" : "cursor-default"}
              >
                {/* Outer glow ring */}
                <circle cx={pt.x} cy={pt.y} r="28" fill="rgba(245,158,11,0.05)"
                  stroke="#f59e0b" strokeWidth="0.5" strokeDasharray="4 3" />
                {/* Inner ring */}
                <circle cx={pt.x} cy={pt.y} r="14" fill="rgba(245,158,11,0.15)"
                  stroke="#f59e0b" strokeWidth="2.5" />
                {/* Center */}
                <circle cx={pt.x} cy={pt.y} r="4" fill="#f59e0b" />
                {/* Crosshair arms */}
                {[[-18, 0, -7, 0], [7, 0, 18, 0], [0, -18, 0, -7], [0, 7, 0, 18]].map(([x1, y1, x2, y2], ci) => (
                  <line key={ci} x1={pt.x + x1} y1={pt.y + y1} x2={pt.x + x2} y2={pt.y + y2}
                    stroke="#f59e0b" strokeWidth="2" strokeOpacity="0.6" />
                ))}
                {/* Label badge */}
                <g transform={`translate(${pt.x + 22},${pt.y - 22})`}>
                  <rect x="-2" y="-10" width="44" height="14" rx="5"
                    fill="rgba(0,0,0,0.92)" stroke="#f59e0b" strokeWidth="0.8" />
                  <text x="20" y="1.5" fill="#f59e0b" fontSize="9" fontWeight="bold"
                    textAnchor="middle" fontFamily="system-ui">
                    REF {i + 1}
                  </text>
                </g>
                {step === 1 && (
                  <text x={pt.x} y={pt.y + 36} fill="rgba(245,158,11,0.4)" fontSize="7"
                    textAnchor="middle" fontFamily="system-ui">drag to move</text>
                )}
              </g>
            ))}

            {/* Live cursor indicator for step 1 */}
            {step === 1 && pts.length < 2 && cursorPt && !snapCode && (
              <g opacity="0.5" pointerEvents="none">
                <circle cx={cursorPt.x} cy={cursorPt.y} r="12" fill="none"
                  stroke="#f59e0b" strokeWidth="1.5" strokeDasharray="3 3" />
                <circle cx={cursorPt.x} cy={cursorPt.y} r="2.5" fill="#f59e0b" />
              </g>
            )}

          </g>

          {/* Minimap */}
          {zoom > 1.5 && (
            <g transform="translate(838,556)">
              <rect width="150" height="108" rx="10"
                fill="rgba(0,0,0,0.85)" stroke="rgba(255,255,255,0.08)" strokeWidth="1" />
              <text x="8" y="13" fill="rgba(255,255,255,0.22)" fontSize="7"
                fontFamily="system-ui" fontWeight="bold">MINIMAP</text>
              {pts.map((pt, i) => (
                <circle key={i}
                  cx={9 + (pt.x / 1000) * 132} cy={18 + (pt.y / 720) * 82}
                  r="3.5" fill="#f59e0b" stroke="#000" strokeWidth="1" />
              ))}
              {(() => {
                const vLeft = -pan.x / zoom, vTop = -pan.y / zoom;
                const rx = 9 + Math.max(0, vLeft / 1000 * 132);
                const ry = 18 + Math.max(0, vTop / 720 * 82);
                const rw = Math.min(132 - Math.max(0, vLeft / 1000 * 132), (1000 / zoom) / 1000 * 132);
                const rh = Math.min(82 - Math.max(0, vTop / 720 * 82), (720 / zoom) / 720 * 82);
                return (
                  <rect x={rx} y={ry} width={Math.max(4, rw)} height={Math.max(3, rh)}
                    fill="rgba(96,165,250,0.08)" stroke="rgba(96,165,250,0.7)"
                    strokeWidth="1" rx="2" />
                );
              })()}
            </g>
          )}
        </svg>
      </div>

      {/* Status bar */}
      <div className="border-t border-white/5 bg-black/70 px-4 py-1.5 flex items-center justify-between text-[9px] font-mono text-white/30">
        <span className="flex items-center gap-4">
          {cursorPt && (
            <>
              <span>X: <span className="text-white/60">{Math.round(cursorPt.x)}</span></span>
              <span>Y: <span className="text-white/60">{Math.round(cursorPt.y)}</span></span>
            </>
          )}
          {pxDist && <span className="text-yellow-400/60">span: {pxDist.toFixed(0)} px</span>}
          {pixPerMm && <span className="text-success/60">{pixPerMm.toFixed(3)} px/mm</span>}
          <span className="text-white/20 italic hidden lg:block">
            {step === 1 ? "Click to place points · Alt+drag to pan · Scroll to zoom · Double-click to zoom 2×"
             : "Alt+drag to pan · Scroll to zoom"}
          </span>
        </span>
        <span className="flex items-center gap-3">
          <span>{landmarks.length} AI pts</span>
          <span>Zoom <span className="text-white/50">{Math.round(zoom * 100)}%</span></span>
        </span>
      </div>
    </Card>
  );
}
