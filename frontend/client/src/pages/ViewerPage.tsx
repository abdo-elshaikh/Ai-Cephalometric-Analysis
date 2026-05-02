import React, {
  useState,
  useRef,
  useEffect,
  useMemo,
  useCallback,
} from "react";
import { useLocation } from "wouter";
import {
  Ruler,
  Save,
  Layers3,
  RefreshCw,
  Eye,
  BarChart3,
  Move,
  ChevronRight,
  ChevronDown,
  Crosshair,
  Lock,
  Unlock,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  ScanLine,
  MousePointer2,
  Triangle,
  Maximize2,
  Minimize2,
  FlipHorizontal,
  Grid3x3,
  Sun,
  Contrast,
  Activity,
  X,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";
import {
  Card,
  Pill,
  PrimaryBtn,
  SecondaryBtn,
  IconBtn,
  PageHeader,
  Field,
  TextInput,
  Divider,
  SectionHeader,
  Switch,
} from "@/components/_core/ClinicalComponents";
import { confidenceTone } from "@/lib/clinical-utils";
import {
  type CaseRecord,
  type Landmark,
  type Point,
  type OverlayArtifact,
} from "@/lib/mappers";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

// ─── Landmark Groups ──────────────────────────────────────────────────────────

const LANDMARK_GROUPS: { label: string; codes: string[]; color: string }[] = [
  { label: "Cranial Base",  codes: ["S","N","Or","Po","Ba","Pt","Ar","Se"],                                              color: "#60a5fa" },
  { label: "Maxilla",       codes: ["A","ANS","PNS","Sp","Ss","Prn","Ns"],                                              color: "#34d399" },
  { label: "Mandible",      codes: ["B","Pog","Gn","Me","Go","Co","D","Id"],                                            color: "#f59e0b" },
  { label: "Dental",        codes: ["UI","LI","U1r","L1r","UM","LM","UP","LP","U6","L6"],                              color: "#a78bfa" },
  { label: "Soft Tissue",   codes: ["Ls","Li","Pg","Cm","Sn","Dt","Tt","Gls","Sts","Sti","N_st","Pog_st"],             color: "#fb7185" },
  { label: "Airway / CVM",  codes: ["PNW","PPW","Eb","Tb","C2","C3","C4","C3ant","C3post","C4ant","C4post","C2inf"],    color: "#38bdf8" },
  { label: "Ricketts",      codes: ["Xi","Dc","Cf","Ag","Pm","Cc","ENS","ENS2"],                                        color: "#e879f9" },
];

// ─── Tracing Planes ───────────────────────────────────────────────────────────

type TracingPlane = {
  key: string; from: string; to: string; color: string;
  label: string; dashed?: boolean; group: "skeletal"|"dental"|"soft"|"vertical";
};

const TRACING_PLANES: TracingPlane[] = [
  { key:"SN",      from:"S",    to:"N",     color:"#60a5fa", label:"SN",         group:"skeletal"  },
  { key:"FH",      from:"Po",   to:"Or",    color:"#f59e0b", label:"FH",         group:"skeletal"  },
  { key:"NA",      from:"N",    to:"A",     color:"#34d399", label:"NA",         group:"skeletal"  },
  { key:"NB",      from:"N",    to:"B",     color:"#34d399", label:"NB",         group:"skeletal"  },
  { key:"NPog",    from:"N",    to:"Pog",   color:"#a78bfa", label:"N-Pog",      group:"skeletal",  dashed:true },
  { key:"GoGn",    from:"Go",   to:"Gn",    color:"#f59e0b", label:"Md. Plane",  group:"vertical"  },
  { key:"GoMe",    from:"Go",   to:"Me",    color:"#fbbf24", label:"Go-Me",      group:"vertical",  dashed:true },
  { key:"Inc",     from:"UI",   to:"LI",    color:"#34d399", label:"Inc.",        group:"dental"    },
  { key:"OcPlane", from:"U6",   to:"L6",    color:"#e879f9", label:"Occ. Plane", group:"dental",    dashed:true },
  { key:"ELine",   from:"Prn",  to:"Pg",    color:"#fb7185", label:"E-Line",     group:"soft",      dashed:true },
  { key:"SoftN",   from:"N_st", to:"Pog_st",color:"#fb7185", label:"Facial",     group:"soft"      },
];

// ─── Tool Modes ───────────────────────────────────────────────────────────────

type ToolMode = "select" | "pan" | "ruler" | "calibrate" | "angle";

const TOOLS: { mode: ToolMode; icon: React.ElementType; label: string; shortcut: string }[] = [
  { mode:"select",    icon:MousePointer2, label:"Select / Move",     shortcut:"S" },
  { mode:"pan",       icon:Move,          label:"Pan / Navigate",    shortcut:"H" },
  { mode:"ruler",     icon:Ruler,         label:"Measure Distance",  shortcut:"R" },
  { mode:"calibrate", icon:ScanLine,      label:"Calibrate Scale",   shortcut:"C" },
  { mode:"angle",     icon:Triangle,      label:"Measure Angle",     shortcut:"A" },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getGroupColor(code: string): string {
  for (const g of LANDMARK_GROUPS) if (g.codes.includes(code)) return g.color;
  return "#60a5fa";
}

function extendedLine(p1: Point, p2: Point, ext = 80): [Point, Point] {
  const dx = p2.x - p1.x, dy = p2.y - p1.y;
  const len = Math.sqrt(dx*dx + dy*dy) || 1;
  return [
    { x: p1.x - (dx/len)*ext, y: p1.y - (dy/len)*ext },
    { x: p2.x + (dx/len)*ext, y: p2.y + (dy/len)*ext },
  ];
}

function perpTick(p: Point, p2: Point, halfLen: number) {
  const dx = p2.x - p.x, dy = p2.y - p.y;
  const len = Math.sqrt(dx*dx + dy*dy) || 1;
  const nx = -dy/len, ny = dx/len;
  return { x1: p.x+nx*halfLen, y1: p.y+ny*halfLen, x2: p.x-nx*halfLen, y2: p.y-ny*halfLen };
}

function pixelDist(a: Point, b: Point) {
  return Math.sqrt((b.x-a.x)**2 + (b.y-a.y)**2);
}

function angleDeg(center: Point, p1: Point, p2: Point) {
  const v1 = { x: p1.x-center.x, y: p1.y-center.y };
  const v2 = { x: p2.x-center.x, y: p2.y-center.y };
  const dot = v1.x*v2.x + v1.y*v2.y;
  const l1 = Math.sqrt(v1.x**2+v1.y**2), l2 = Math.sqrt(v2.x**2+v2.y**2);
  if (!l1 || !l2) return 0;
  return Math.acos(Math.max(-1,Math.min(1,dot/(l1*l2)))) * (180/Math.PI);
}

function arcPath(center: Point, p1: Point, p2: Point, r: number): string {
  const a1 = Math.atan2(p1.y-center.y, p1.x-center.x);
  const a2 = Math.atan2(p2.y-center.y, p2.x-center.x);
  let diff = a2-a1;
  while (diff > Math.PI) diff -= 2*Math.PI;
  while (diff < -Math.PI) diff += 2*Math.PI;
  const sweep = diff > 0 ? 1 : 0;
  const large = Math.abs(diff) > Math.PI ? 1 : 0;
  const sx = center.x + r*Math.cos(a1), sy = center.y + r*Math.sin(a1);
  const ex = center.x + r*Math.cos(a2), ey = center.y + r*Math.sin(a2);
  return `M ${sx} ${sy} A ${r} ${r} 0 ${large} ${sweep} ${ex} ${ey}`;
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface ViewerPageProps {
  activeCase?: CaseRecord;
  landmarks: Landmark[];
  setLandmarks: (l: Landmark[]) => void;
  overlays: OverlayArtifact[];
  onCalibrate: (pts: Point[], mm: number) => void | Promise<void>;
  onSaveAndSend: (isCbct: boolean) => void | Promise<void>;
  onRefreshOverlays: () => void | Promise<void>;
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function ViewerPage({
  activeCase, landmarks, setLandmarks, overlays,
  onCalibrate, onSaveAndSend, onRefreshOverlays,
}: ViewerPageProps) {
  const [, navigate] = useLocation();
  const [tool, setTool] = useState<ToolMode>("select");
  const [selectedCode, setSelectedCode] = useState<string | null>(null);
  const [hoveredCode, setHoveredCode] = useState<string | null>(null);
  const [isCbct, setIsCbct] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);

  const [calibPts, setCalibPts] = useState<Point[]>(activeCase?.calibrationPoints ?? []);
  const [distMm, setDistMm] = useState(String(activeCase?.calibrationDistanceMm ?? 100));
  const [rulerPts, setRulerPts] = useState<Point[]>([]);
  const [anglePts, setAnglePts] = useState<Point[]>([]);

  const [filters, setFilters] = useState({ brightness: 100, contrast: 110, invert: false });
  const [layers, setLayers] = useState({ landmarks: true, planes: true, softTissue: true, heatmap: false, grid: false });
  const [planeVis, setPlaneVis] = useState<Record<string, boolean>>(
    Object.fromEntries(TRACING_PLANES.map(p => [p.key, true]))
  );
  const [activeRightTab, setActiveRightTab] = useState<"planes"|"controls"|"calibrate">("controls");
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>(
    Object.fromEntries(LANDMARK_GROUPS.map(g => [g.label, false]))
  );
  const [adjustmentModal, setAdjustmentModal] = useState<{ code: string; pt: Point } | null>(null);
  const [adjustmentReason, setAdjustmentReason] = useState("");

  useEffect(() => {
    setCalibPts(activeCase?.calibrationPoints ?? []);
    setDistMm(String(activeCase?.calibrationDistanceMm ?? 100));
  }, [activeCase?.id]);

  // ── Keyboard shortcuts ──
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      switch (e.key.toLowerCase()) {
        case "s": case "v": setTool("select"); break;
        case "h": setTool("pan"); break;
        case "r": setTool("ruler"); break;
        case "c": setTool("calibrate"); break;
        case "a": setTool("angle"); break;
        case "escape":
          setRulerPts([]); setAnglePts([]);
          if (tool === "calibrate") setCalibPts([]);
          setSelectedCode(null);
          break;
        case "delete": case "backspace":
          if (selectedCode) {
            const lm = landmarks.find(l => l.code === selectedCode);
            if (lm) { updateLandmark(selectedCode, { x: lm.x, y: lm.y, adjusted: false }); }
          }
          break;
        case "arrowleft":  moveSelectedBy(e.shiftKey ? -5 : -1, 0); e.preventDefault(); break;
        case "arrowright": moveSelectedBy(e.shiftKey ?  5 :  1, 0); e.preventDefault(); break;
        case "arrowup":    moveSelectedBy(0, e.shiftKey ? -5 : -1); e.preventDefault(); break;
        case "arrowdown":  moveSelectedBy(0, e.shiftKey ?  5 :  1); e.preventDefault(); break;
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [tool, selectedCode, landmarks, isLocked]);

  function updateLandmark(code: string, patch: Partial<Landmark>) {
    if (isLocked) return;
    setLandmarks(landmarks.map(l => l.code === code ? { ...l, ...patch } : l));
  }

  function moveSelectedBy(dx: number, dy: number) {
    if (!selectedCode || isLocked) return;
    const lm = landmarks.find(l => l.code === selectedCode);
    if (lm) updateLandmark(selectedCode, { x: lm.x + dx, y: lm.y + dy, adjusted: true });
  }

  function handleLandmarkMove(code: string, pt: Point) {
    if (isLocked) return;
    setAdjustmentModal({ code, pt });
  }

  function confirmAdjustment() {
    if (!adjustmentModal) return;
    const { code, pt } = adjustmentModal;
    updateLandmark(code, { ...pt, adjusted: true });
    toast.success(`${code} adjusted — ${adjustmentReason || "Manual correction"}`);
    setAdjustmentModal(null);
    setAdjustmentReason("");
  }

  function handleCalibrate() {
    if (calibPts.length !== 2) return;
    onCalibrate(calibPts, Number(distMm));
    toast.success(`Calibrated: ${distMm} mm reference saved`);
    setTool("select");
    setCalibPts([]);
  }

  const selected = landmarks.find(l => l.code === selectedCode) ?? null;
  const lowConf  = landmarks.filter(l => l.confidence < 0.7);

  const groupedLandmarks = useMemo(() => {
    const byCode = Object.fromEntries(landmarks.map(l => [l.code, l]));
    return LANDMARK_GROUPS
      .map(g => ({ ...g, landmarks: g.codes.map(c => byCode[c]).filter(Boolean) as Landmark[] }))
      .filter(g => g.landmarks.length > 0);
  }, [landmarks]);

  const ungroupedLandmarks = useMemo(() => {
    const known = new Set(LANDMARK_GROUPS.flatMap(g => g.codes));
    return landmarks.filter(l => !known.has(l.code));
  }, [landmarks]);

  const pixPerMm = useMemo(() => {
    if (calibPts.length === 2 && Number(distMm) > 0)
      return pixelDist(calibPts[0], calibPts[1]) / Number(distMm);
    if (activeCase?.calibrated && activeCase.calibrationPoints?.length === 2 && (activeCase.calibrationDistanceMm ?? 0) > 0)
      return pixelDist(activeCase.calibrationPoints[0], activeCase.calibrationPoints[1]) / activeCase.calibrationDistanceMm!;
    return null;
  }, [calibPts, distMm, activeCase]);

  const calibrated = Boolean(activeCase?.calibrated || calibPts.length === 2);

  // ── Viewer container ref for fullscreen ──
  const containerRef = useRef<HTMLDivElement>(null);

  function toggleFullscreen() {
    if (!document.fullscreenElement && containerRef.current) {
      containerRef.current.requestFullscreen?.();
      setFullscreen(true);
    } else {
      document.exitFullscreen?.();
      setFullscreen(false);
    }
  }

  return (
    <div className="space-y-5 animate-in fade-in duration-500">
      <PageHeader
        eyebrow="Diagnostic Review"
        title="Clinical Viewer"
        description="Professional cephalometric analysis with landmark editing, tracing planes, and precision calibration."
        actions={
          <>
            <div className="flex items-center gap-2 rounded-xl border border-border/40 bg-muted/20 px-3 h-10">
              <Switch checked={isCbct} onChange={setIsCbct} label="CBCT" />
            </div>
            <IconBtn
              icon={isLocked ? Lock : Unlock}
              label={isLocked ? "Unlock editing" : "Lock editing"}
              onClick={() => setIsLocked(l => !l)}
              variant={isLocked ? "solid" : "outline"}
            />
            <PrimaryBtn onClick={() => onSaveAndSend(isCbct)} icon={Save}>
              Save &amp; Send
            </PrimaryBtn>
          </>
        }
      />

      {/* ── Main Layout ── */}
      <div ref={containerRef} className={cn(
        "grid gap-4 xl:grid-cols-[1fr_360px]",
        fullscreen && "fixed inset-0 z-50 bg-background p-4 overflow-auto"
      )}>
        {/* Left: Viewer + Inventory */}
        <div className="space-y-4 min-h-0">
          <CephCanvas
            imageUrl={activeCase?.imageUrl}
            landmarks={landmarks}
            selectedCode={selectedCode}
            hoveredCode={hoveredCode}
            tool={tool}
            setTool={setTool}
            onSelect={setSelectedCode}
            onHover={setHoveredCode}
            onMove={handleLandmarkMove}
            layers={layers}
            planeVis={planeVis}
            filters={filters}
            calibrationPoints={calibPts}
            locked={isLocked}
            pixPerMm={pixPerMm}
            rulerPts={rulerPts}
            setRulerPts={setRulerPts}
            anglePts={anglePts}
            setAnglePts={setAnglePts}
            onCalibrationPoint={pt => {
              setCalibPts(prev => {
                const next = prev.length >= 2 ? [pt] : [...prev, pt];
                if (next.length === 2) toast.info("Two reference points set. Enter distance and save calibration.");
                return next;
              });
            }}
            onFullscreen={toggleFullscreen}
            fullscreen={fullscreen}
          />

          {/* ── Landmark Inventory ── */}
          <Card noPadding className="overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border/40">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Crosshair className="h-4.5 w-4.5" />
                </div>
                <div>
                  <h4 className="text-sm font-bold">Landmark Inventory</h4>
                  <p className="text-xs text-muted-foreground">
                    {landmarks.length} detected · {landmarks.filter(l=>l.adjusted).length} adjusted
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {lowConf.length > 0 && (
                  <Pill tone="warning" size="xs">
                    <AlertTriangle className="h-3 w-3" /> {lowConf.length} low conf.
                  </Pill>
                )}
                <Pill tone={lowConf.length ? "warning" : "success"} size="xs">
                  {landmarks.length ? `${Math.round(landmarks.reduce((s,l)=>s+l.confidence,0)/landmarks.length*100)}% avg` : "—"}
                </Pill>
              </div>
            </div>

            <div className="p-3 space-y-1.5">
              {groupedLandmarks.map(group => {
                const open = expandedGroups[group.label];
                const groupLow = group.landmarks.filter(l => l.confidence < 0.7).length;
                return (
                  <div key={group.label} className="rounded-xl border border-border/40 overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setExpandedGroups(g => ({ ...g, [group.label]: !g[group.label] }))}
                      className="w-full flex items-center justify-between gap-3 px-4 py-2.5 bg-muted/10 hover:bg-muted/20 transition-colors"
                    >
                      <div className="flex items-center gap-2.5">
                        <div className="h-2 w-2 rounded-full shrink-0" style={{ background: group.color }} />
                        <span className="text-xs font-bold">{group.label}</span>
                        <span className="text-[10px] text-muted-foreground/60">{group.landmarks.length} pts</span>
                        {groupLow > 0 && <Pill tone="warning" size="xs">{groupLow} low</Pill>}
                      </div>
                      {open ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                            : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
                    </button>
                    {open && (
                      <div className="grid gap-1 p-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 animate-in fade-in slide-in-from-top-1 duration-200">
                        {group.landmarks.map(lm => (
                          <LandmarkChip
                            key={lm.code}
                            landmark={lm}
                            selected={lm.code === selectedCode}
                            hovered={lm.code === hoveredCode}
                            color={group.color}
                            onClick={() => setSelectedCode(lm.code)}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}

              {ungroupedLandmarks.length > 0 && (
                <div className="rounded-xl border border-border/40 overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setExpandedGroups(g => ({ ...g, __other: !g["__other"] }))}
                    className="w-full flex items-center justify-between gap-3 px-4 py-2.5 bg-muted/10 hover:bg-muted/20 transition-colors"
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="h-2 w-2 rounded-full shrink-0 bg-muted-foreground/40" />
                      <span className="text-xs font-bold">Other</span>
                      <span className="text-[10px] text-muted-foreground/60">{ungroupedLandmarks.length} pts</span>
                    </div>
                    {expandedGroups["__other"] ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                                               : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
                  </button>
                  {expandedGroups["__other"] && (
                    <div className="grid gap-1 p-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 animate-in fade-in duration-200">
                      {ungroupedLandmarks.map(lm => (
                        <LandmarkChip
                          key={lm.code} landmark={lm}
                          selected={lm.code === selectedCode} hovered={lm.code === hoveredCode}
                          onClick={() => setSelectedCode(lm.code)}
                        />
                      ))}
                    </div>
                  )}
                </div>
              )}

              {landmarks.length === 0 && (
                <div className="py-8 text-center border border-dashed border-border/60 rounded-2xl bg-muted/10">
                  <Crosshair className="h-8 w-8 text-muted-foreground/20 mx-auto mb-2" />
                  <p className="text-xs text-muted-foreground italic">
                    Run AI analysis to populate landmark positions.
                  </p>
                </div>
              )}
            </div>
          </Card>
        </div>

        {/* ── Right Panel ── */}
        <div className="space-y-4">
          {/* Selected landmark detail */}
          <Card className={cn("transition-all duration-300", selected ? "border-primary/30" : "opacity-80")}>
            <div className="flex items-center gap-3 mb-4">
              <div
                className="flex h-10 w-10 items-center justify-center rounded-xl border font-bold text-xs uppercase"
                style={selected ? {
                  background: getGroupColor(selected.code) + "20",
                  borderColor: getGroupColor(selected.code) + "50",
                  color: getGroupColor(selected.code),
                } : {}}
              >
                {selected?.code ?? "—"}
              </div>
              <div>
                <h4 className="text-sm font-bold">Active Landmark</h4>
                <p className="text-xs text-muted-foreground">{selected ? selected.name : "Click a point to inspect"}</p>
              </div>
            </div>

            {selected ? (
              <div className="space-y-3 animate-in fade-in duration-200">
                <div className="grid grid-cols-2 gap-3">
                  <Field label="X (px)">
                    <TextInput
                      type="number"
                      value={Math.round(selected.x)}
                      onChange={v => updateLandmark(selected.code, { x: Number(v) })}
                    />
                  </Field>
                  <Field label="Y (px)">
                    <TextInput
                      type="number"
                      value={Math.round(selected.y)}
                      onChange={v => updateLandmark(selected.code, { y: Number(v) })}
                    />
                  </Field>
                </div>
                {pixPerMm && (
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-xl border border-border/40 bg-muted/20 p-2.5 text-center">
                      <p className="text-[10px] font-bold uppercase text-muted-foreground tracking-widest mb-1">X (mm)</p>
                      <p className="text-sm font-bold">{(selected.x / pixPerMm).toFixed(1)}</p>
                    </div>
                    <div className="rounded-xl border border-border/40 bg-muted/20 p-2.5 text-center">
                      <p className="text-[10px] font-bold uppercase text-muted-foreground tracking-widest mb-1">Y (mm)</p>
                      <p className="text-sm font-bold">{(selected.y / pixPerMm).toFixed(1)}</p>
                    </div>
                  </div>
                )}
                <div className="rounded-xl border border-border/40 bg-muted/20 p-3">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">AI Confidence</p>
                    <span className={cn("text-sm font-bold",
                      selected.confidence>=0.85?"text-success":selected.confidence>=0.7?"text-primary":"text-warning"
                    )}>
                      {Math.round(selected.confidence*100)}%
                    </span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                    <div
                      className={cn("h-full transition-all duration-500",
                        selected.confidence>=0.85?"bg-success":selected.confidence>=0.7?"bg-primary":"bg-warning"
                      )}
                      style={{ width: `${selected.confidence*100}%` }}
                    />
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {selected.adjusted && <Pill tone="accent" size="xs">Manually adjusted</Pill>}
                  {selected.confidence < 0.7 && <Pill tone="warning" size="xs">Low confidence</Pill>}
                </div>
                <p className="text-[10px] text-muted-foreground/50 mt-1">
                  Use arrow keys to nudge ±1px · Shift+arrow for ±5px
                </p>
              </div>
            ) : (
              <div className="py-6 text-center border border-dashed border-border/60 rounded-2xl bg-muted/10">
                <p className="text-xs text-muted-foreground italic">
                  Click a landmark in the viewer or inventory
                </p>
              </div>
            )}
          </Card>

          {/* Tabbed right panel */}
          <Card noPadding className="overflow-hidden">
            {/* Tab bar */}
            <div className="flex border-b border-border/40">
              {(["controls","planes","calibrate"] as const).map(tab => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setActiveRightTab(tab)}
                  className={cn(
                    "flex-1 py-2.5 text-[10px] font-bold uppercase tracking-widest transition-all",
                    activeRightTab === tab
                      ? "border-b-2 border-primary text-primary bg-primary/5"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/20"
                  )}
                >
                  {tab === "controls" ? "Image" : tab === "planes" ? "Planes" : "Calibrate"}
                </button>
              ))}
            </div>

            <div className="p-4">
              {/* ── Image Controls ── */}
              {activeRightTab === "controls" && (
                <div className="space-y-5">
                  <div className="space-y-3">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Adjustments</p>
                    {[
                      { key:"brightness" as const, label:"Brightness", icon:Sun,      min:20, max:220 },
                      { key:"contrast"   as const, label:"Contrast",   icon:Contrast, min:20, max:220 },
                    ].map(f => (
                      <div key={f.key} className="space-y-1.5">
                        <div className="flex items-center justify-between text-[10px] font-bold uppercase text-muted-foreground">
                          <span className="flex items-center gap-1.5"><f.icon className="h-3 w-3" />{f.label}</span>
                          <span className="text-foreground tabular-nums">{filters[f.key]}%</span>
                        </div>
                        <input
                          type="range" min={f.min} max={f.max}
                          value={filters[f.key]}
                          onChange={e => setFilters(fv => ({ ...fv, [f.key]: Number(e.target.value) }))}
                          className="w-full h-1.5 rounded-full bg-muted appearance-none accent-primary cursor-pointer"
                        />
                      </div>
                    ))}
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
                        <FlipHorizontal className="h-3 w-3" /> Invert (Negative)
                      </span>
                      <Switch checked={filters.invert} onChange={v => setFilters(f => ({ ...f, invert: v }))} />
                    </div>
                    <button
                      type="button"
                      onClick={() => setFilters({ brightness: 100, contrast: 110, invert: false })}
                      className="text-[10px] font-bold text-primary/60 hover:text-primary transition-colors"
                    >
                      Reset to defaults
                    </button>
                  </div>
                  <Divider className="opacity-40" />
                  <div className="space-y-2">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Layers</p>
                    {[
                      { key:"landmarks",  label:"Clinical Landmarks" },
                      { key:"planes",     label:"Tracing Planes"     },
                      { key:"softTissue", label:"Soft Tissue Profile" },
                      { key:"grid",       label:"Reference Grid"      },
                    ].map(({ key, label }) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setLayers(l => ({ ...l, [key]: !l[key as keyof typeof l] }))}
                        className={cn(
                          "flex items-center justify-between w-full p-2.5 rounded-xl border text-xs font-bold transition-all",
                          layers[key as keyof typeof layers]
                            ? "border-primary/30 bg-primary/5 text-primary"
                            : "border-border/60 bg-muted/20 text-muted-foreground hover:bg-muted/30"
                        )}
                      >
                        {label}
                        <div className={cn("h-2 w-2 rounded-full transition-colors",
                          layers[key as keyof typeof layers] ? "bg-primary" : "bg-muted-foreground/30"
                        )} />
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* ── Tracing Planes ── */}
              {activeRightTab === "planes" && (
                <div className="space-y-1.5">
                  {(["skeletal","vertical","dental","soft"] as const).map(grp => {
                    const planes = TRACING_PLANES.filter(p => p.group === grp);
                    return (
                      <div key={grp}>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1.5 px-1">
                          {grp}
                        </p>
                        {planes.map(plane => (
                          <button
                            key={plane.key}
                            type="button"
                            onClick={() => setPlaneVis(pv => ({ ...pv, [plane.key]: !pv[plane.key] }))}
                            className={cn(
                              "flex items-center justify-between w-full px-3 py-2 rounded-xl border text-xs transition-all mb-1",
                              planeVis[plane.key]
                                ? "border-transparent bg-muted/10"
                                : "border-border/40 bg-transparent opacity-40"
                            )}
                          >
                            <div className="flex items-center gap-2.5">
                              <div
                                className="h-3 w-3 rounded-full shrink-0"
                                style={{ background: planeVis[plane.key] ? plane.color : "transparent", border: `1.5px solid ${plane.color}` }}
                              />
                              <span className="font-bold" style={{ color: planeVis[plane.key] ? plane.color : undefined }}>
                                {plane.label}
                              </span>
                              {plane.dashed && (
                                <span className="text-[9px] text-muted-foreground/50 uppercase">dashed</span>
                              )}
                            </div>
                            <span className="text-[9px] text-muted-foreground/40 font-mono">{plane.from}–{plane.to}</span>
                          </button>
                        ))}
                        <div className="h-px bg-border/30 mb-3 mt-1" />
                      </div>
                    );
                  })}
                </div>
              )}

              {/* ── Calibration ── */}
              {activeRightTab === "calibrate" && (
                <div className="space-y-4">
                  <div className={cn(
                    "flex items-center gap-3 p-3 rounded-xl border transition-all",
                    calibrated ? "border-success/30 bg-success/5" : "border-warning/30 bg-warning/5"
                  )}>
                    {calibrated
                      ? <CheckCircle2 className="h-5 w-5 text-success shrink-0" />
                      : <AlertTriangle className="h-5 w-5 text-warning shrink-0" />}
                    <div>
                      <p className="text-xs font-bold">{calibrated ? "Image is calibrated" : "Calibration required"}</p>
                      {activeCase?.calibrated && activeCase.calibrationDistanceMm && (
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          Scale: {activeCase.calibrationDistanceMm} mm reference
                          {pixPerMm && ` · ${pixPerMm.toFixed(2)} px/mm`}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="rounded-xl border border-border/40 bg-muted/20 p-3 text-xs text-muted-foreground leading-relaxed space-y-2">
                    <p className="font-bold text-foreground">How to calibrate:</p>
                    <ol className="list-decimal list-inside space-y-1">
                      <li>Click the <strong className="text-warning">Calibrate</strong> tool (C) in the viewer toolbar</li>
                      <li>Click two known reference points on the image</li>
                      <li>Enter the true distance in mm below</li>
                      <li>Click Save Calibration</li>
                    </ol>
                  </div>

                  <Field label="Reference Distance (mm)">
                    <TextInput
                      type="number"
                      value={distMm}
                      onChange={setDistMm}
                      min={1}
                      placeholder="e.g. 100"
                    />
                  </Field>

                  <div className="grid grid-cols-3 gap-2">
                    <div className={cn(
                      "flex flex-col items-center justify-center rounded-xl border p-3 transition-all",
                      calibPts.length >= 1 ? "border-warning/40 bg-warning/8" : "border-border/40 bg-muted/10"
                    )}>
                      <div className={cn("h-2 w-2 rounded-full mb-1",
                        calibPts.length >= 1 ? "bg-warning" : "bg-muted-foreground/30"
                      )} />
                      <span className="text-[10px] font-bold text-muted-foreground">Ref 1</span>
                      {calibPts[0] && (
                        <span className="text-[9px] text-muted-foreground/60 mt-0.5 font-mono">
                          {Math.round(calibPts[0].x)},{Math.round(calibPts[0].y)}
                        </span>
                      )}
                    </div>
                    <div className={cn(
                      "flex flex-col items-center justify-center rounded-xl border p-3 transition-all",
                      calibPts.length >= 2 ? "border-warning/40 bg-warning/8" : "border-border/40 bg-muted/10"
                    )}>
                      <div className={cn("h-2 w-2 rounded-full mb-1",
                        calibPts.length >= 2 ? "bg-warning" : "bg-muted-foreground/30"
                      )} />
                      <span className="text-[10px] font-bold text-muted-foreground">Ref 2</span>
                      {calibPts[1] && (
                        <span className="text-[9px] text-muted-foreground/60 mt-0.5 font-mono">
                          {Math.round(calibPts[1].x)},{Math.round(calibPts[1].y)}
                        </span>
                      )}
                    </div>
                    <div className={cn(
                      "flex flex-col items-center justify-center rounded-xl border p-3",
                      calibPts.length === 2 ? "border-success/30 bg-success/5" : "border-border/40 bg-muted/10"
                    )}>
                      <div className={cn("h-2 w-2 rounded-full mb-1",
                        calibPts.length === 2 ? "bg-success animate-pulse" : "bg-muted-foreground/30"
                      )} />
                      <span className="text-[10px] font-bold text-muted-foreground">
                        {calibPts.length === 2
                          ? `${pixelDist(calibPts[0],calibPts[1]).toFixed(0)} px`
                          : "Distance"}
                      </span>
                    </div>
                  </div>

                  {calibPts.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setCalibPts([])}
                      className="text-[10px] font-bold text-destructive/60 hover:text-destructive transition-colors"
                    >
                      Clear reference points
                    </button>
                  )}

                  <button
                    type="button"
                    disabled={calibPts.length !== 2 || !Number(distMm)}
                    onClick={handleCalibrate}
                    className={cn(
                      "w-full h-11 rounded-xl font-bold text-sm transition-all",
                      calibPts.length === 2 && Number(distMm)
                        ? "bg-warning text-black shadow-lg shadow-warning/20 hover:bg-warning/90"
                        : "bg-muted/30 text-muted-foreground cursor-not-allowed opacity-50"
                    )}
                  >
                    Save Calibration
                  </button>
                </div>
              )}
            </div>
          </Card>

          {/* AI Overlays */}
          {overlays.length > 0 && (
            <Card>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">AI Overlays</h3>
                <IconBtn icon={RefreshCw} label="Refresh" onClick={onRefreshOverlays} variant="outline" size="sm" />
              </div>
              <div className="grid gap-2">
                {overlays.map(ov => (
                  <button
                    key={ov.key}
                    type="button"
                    onClick={() => window.open(ov.url, "_blank", "noopener,noreferrer")}
                    className="group relative aspect-video overflow-hidden rounded-2xl border border-border/60 bg-black/80 hover:border-primary/40 transition-all"
                  >
                    <img src={ov.url} alt={ov.label} className="h-full w-full object-cover opacity-60 transition group-hover:opacity-100" />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
                    <div className="absolute bottom-2 left-3 right-3 flex items-center justify-between">
                      <span className="text-[10px] font-bold uppercase tracking-widest text-white">{ov.label}</span>
                      <Eye className="h-3.5 w-3.5 text-white/60" />
                    </div>
                  </button>
                ))}
              </div>
            </Card>
          )}
        </div>
      </div>

      {/* Proceed button */}
      <div className="flex justify-end">
        <SecondaryBtn onClick={() => navigate("/results")} icon={BarChart3} className="h-12 px-8">
          Proceed to Analysis Results
          <ChevronRight className="h-4 w-4 ml-1" />
        </SecondaryBtn>
      </div>

      {/* Adjustment Modal */}
      {adjustmentModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-md p-4">
            <Card className="shadow-2xl">
              <div className="mb-4">
                <h3 className="text-lg font-bold">Record Adjustment</h3>
                <p className="text-xs text-muted-foreground mt-1">
                  Moving <span className="font-bold text-primary">{adjustmentModal.code}</span> to ({Math.round(adjustmentModal.pt.x)}, {Math.round(adjustmentModal.pt.y)}).
                  {pixPerMm && ` ≈ (${(adjustmentModal.pt.x/pixPerMm).toFixed(1)} mm, ${(adjustmentModal.pt.y/pixPerMm).toFixed(1)} mm)`}
                </p>
              </div>
              <Field label="Reason for adjustment (audit trail)">
                <TextInput
                  value={adjustmentReason}
                  onChange={setAdjustmentReason}
                  placeholder="e.g. Better anatomical fit, corrected landmark placement"
                />
              </Field>
              <div className="flex gap-2 mt-4">
                <PrimaryBtn onClick={confirmAdjustment} className="flex-1">Confirm Move</PrimaryBtn>
                <SecondaryBtn onClick={() => setAdjustmentModal(null)} className="flex-1">Cancel</SecondaryBtn>
              </div>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Landmark Chip ────────────────────────────────────────────────────────────

function LandmarkChip({ landmark: lm, selected, hovered, color, onClick }: {
  landmark: Landmark; selected: boolean; hovered?: boolean; color?: string; onClick: () => void;
}) {
  const confColor = lm.confidence >= 0.85 ? "#4ade80" : lm.confidence >= 0.7 ? "#60a5fa" : "#f59e0b";
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center justify-between gap-1.5 p-2 rounded-xl border transition-all duration-150 text-left",
        selected
          ? "border-primary/40 bg-primary/10 ring-2 ring-primary/10"
          : hovered
          ? "border-primary/20 bg-muted/30"
          : "border-border/50 bg-muted/10 hover:border-primary/20 hover:bg-muted/20"
      )}
    >
      <div className="min-w-0">
        <p className="text-[10px] font-bold uppercase tracking-widest truncate"
           style={selected && color ? { color } : undefined}>
          {lm.code}
        </p>
        {lm.adjusted && <div className="h-0.5 w-3 bg-primary/60 rounded-full mt-0.5" />}
      </div>
      <div className="h-1.5 w-1.5 rounded-full shrink-0" style={{ background: confColor }} />
    </button>
  );
}

// ─── CephCanvas ───────────────────────────────────────────────────────────────

interface CephCanvasProps {
  imageUrl?: string;
  landmarks: Landmark[];
  selectedCode: string | null;
  hoveredCode: string | null;
  tool: ToolMode;
  setTool: (t: ToolMode) => void;
  onSelect: (code: string | null) => void;
  onHover: (code: string | null) => void;
  onMove: (code: string, pt: Point) => void;
  layers: Record<string, boolean>;
  planeVis: Record<string, boolean>;
  filters: { brightness: number; contrast: number; invert: boolean };
  calibrationPoints: Point[];
  locked: boolean;
  pixPerMm: number | null;
  rulerPts: Point[];
  setRulerPts: (pts: Point[]) => void;
  anglePts: Point[];
  setAnglePts: (pts: Point[]) => void;
  onCalibrationPoint: (pt: Point) => void;
  onFullscreen: () => void;
  fullscreen: boolean;
}

function CephCanvas({
  imageUrl, landmarks, selectedCode, hoveredCode, tool, setTool,
  onSelect, onHover, onMove, layers, planeVis, filters,
  calibrationPoints, locked, pixPerMm,
  rulerPts, setRulerPts, anglePts, setAnglePts,
  onCalibrationPoint, onFullscreen, fullscreen,
}: CephCanvasProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [draggingCode, setDraggingCode] = useState<string | null>(null);
  const [draggingCalibIdx, setDraggingCalibIdx] = useState<number | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState<Point>({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [lastPanPt, setLastPanPt] = useState<Point | null>(null);
  const [cursorPt, setCursorPt] = useState<Point | null>(null);
  const [liveRuler, setLiveRuler] = useState<Point | null>(null);
  const [liveAngle, setLiveAngle] = useState<Point | null>(null);

  function svgPoint(e: React.PointerEvent | React.WheelEvent): Point {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const rect = svg.getBoundingClientRect();
    const vx = ((('clientX' in e ? e.clientX : 0) - rect.left) / rect.width) * 1000;
    const vy = ((('clientY' in e ? e.clientY : 0) - rect.top) / rect.height) * 720;
    return {
      x: Math.max(0, Math.min(1000, (vx - pan.x) / zoom)),
      y: Math.max(0, Math.min(720, (vy - pan.y) / zoom)),
    };
  }

  function viewportPoint(e: React.PointerEvent): Point {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const rect = svg.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * 1000,
      y: ((e.clientY - rect.top) / rect.height) * 720,
    };
  }

  function handleWheel(e: React.WheelEvent) {
    if (locked) return;
    e.preventDefault();
    const vp = viewportPoint(e as unknown as React.PointerEvent);
    const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
    const newZoom = Math.max(1, Math.min(8, zoom * factor));
    setPan({
      x: vp.x - (vp.x - pan.x) * newZoom / zoom,
      y: vp.y - (vp.y - pan.y) * newZoom / zoom,
    });
    setZoom(newZoom);
  }

  function handlePointerDown(e: React.PointerEvent) {
    if (locked && tool !== "ruler" && tool !== "angle") return;
    const activePan = tool === "pan" || e.altKey || e.button === 1;
    if (activePan) {
      setIsPanning(true);
      setLastPanPt({ x: e.clientX, y: e.clientY });
      return;
    }

    const pt = svgPoint(e);

    if (tool === "calibrate") {
      onCalibrationPoint(pt);
      return;
    }
    if (tool === "ruler") {
      setRulerPts(rulerPts.length >= 2 ? [pt] : [...rulerPts, pt]);
      return;
    }
    if (tool === "angle") {
      setAnglePts(anglePts.length >= 3 ? [pt] : [...anglePts, pt]);
      return;
    }
    if (tool === "select") {
      onSelect(null);
    }
  }

  function handlePointerMove(e: React.PointerEvent) {
    const pt = svgPoint(e);
    setCursorPt(pt);

    if (isPanning && lastPanPt) {
      const svg = svgRef.current;
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      const dx = (e.clientX - lastPanPt.x) / rect.width * 1000;
      const dy = (e.clientY - lastPanPt.y) / rect.height * 720;
      setPan(p => ({ x: p.x + dx, y: p.y + dy }));
      setLastPanPt({ x: e.clientX, y: e.clientY });
      return;
    }

    if (draggingCalibIdx !== null) {
      // handled via point drag
    }

    if (draggingCode && !locked) {
      onMove(draggingCode, pt);
      return;
    }

    if (tool === "ruler" && rulerPts.length === 1) setLiveRuler(pt);
    if (tool === "angle" && (anglePts.length === 1 || anglePts.length === 2)) setLiveAngle(pt);
  }

  function handlePointerUp() {
    setDraggingCode(null);
    setDraggingCalibIdx(null);
    setIsPanning(false);
    setLastPanPt(null);
  }

  const byCode = useMemo(() => Object.fromEntries(landmarks.map(l => [l.code, l])), [landmarks]);

  const activePlanes = useMemo(() => TRACING_PLANES.filter(p => {
    if (!layers.planes) return false;
    if (!planeVis[p.key]) return false;
    if (p.group === "soft" && !layers.softTissue) return false;
    return byCode[p.from] && byCode[p.to];
  }), [byCode, layers, planeVis]);

  // Determine cursor style
  const cursorStyle = (() => {
    if (isPanning || tool === "pan") return "cursor-grab";
    if (tool === "calibrate") return "cursor-crosshair";
    if (tool === "ruler")     return "cursor-crosshair";
    if (tool === "angle")     return "cursor-crosshair";
    return "cursor-crosshair";
  })();

  const filterStr = [
    `brightness(${filters.brightness}%)`,
    `contrast(${filters.contrast}%)`,
    filters.invert ? "invert(100%)" : "",
  ].filter(Boolean).join(" ");

  return (
    <div className="relative">
      <Card noPadding className="relative overflow-hidden bg-[#080810] border-border/20 shadow-2xl group/viewer">

        {/* ── Floating Tool Palette ── */}
        <div className="absolute left-3 top-1/2 -translate-y-1/2 z-20 flex flex-col gap-1">
          <div className="flex flex-col rounded-2xl border border-white/10 bg-black/85 backdrop-blur-md p-1.5 shadow-2xl gap-0.5">
            {TOOLS.map(t => (
              <button
                key={t.mode}
                type="button"
                onClick={() => setTool(t.mode)}
                title={`${t.label} (${t.shortcut})`}
                className={cn(
                  "flex flex-col h-10 w-10 items-center justify-center rounded-xl gap-0.5 transition-all",
                  tool === t.mode
                    ? "bg-primary text-primary-foreground shadow-lg shadow-primary/30"
                    : "text-white/40 hover:bg-white/10 hover:text-white"
                )}
              >
                <t.icon className="h-3.5 w-3.5" />
                <span className="text-[8px] font-bold opacity-70">{t.shortcut}</span>
              </button>
            ))}
            <div className="h-px bg-white/10 my-0.5 mx-1" />
            <button
              type="button"
              onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }}
              title="Fit to view (F)"
              className="flex h-8 w-10 items-center justify-center text-[9px] font-bold text-white/30 hover:text-white hover:bg-white/10 rounded-xl transition-all"
            >
              FIT
            </button>
          </div>
        </div>

        {/* ── Top Status Bar ── */}
        <div className="absolute top-0 inset-x-0 z-10 flex items-center justify-between px-4 py-2 bg-gradient-to-b from-black/80 to-transparent pointer-events-none">
          <div className="flex items-center gap-2 pointer-events-auto">
            {/* Active tool badge */}
            <div className={cn(
              "flex items-center gap-2 px-3 py-1.5 rounded-full backdrop-blur-md border shadow-lg text-[10px] font-bold uppercase tracking-widest",
              tool === "calibrate"
                ? "bg-warning/25 border-warning/50 text-warning"
                : tool === "ruler" || tool === "angle"
                ? "bg-primary/25 border-primary/50 text-primary"
                : "bg-black/60 border-white/10 text-white/80"
            )}>
              <div className={cn("h-1.5 w-1.5 rounded-full",
                tool === "calibrate" ? "bg-warning animate-pulse" :
                tool === "ruler" || tool === "angle" ? "bg-primary animate-pulse" :
                "bg-green-400"
              )} />
              {TOOLS.find(t => t.mode === tool)?.label}
            </div>

            {zoom > 1 && (
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary/20 backdrop-blur-md border border-primary/40 text-[10px] font-bold text-primary">
                <ZoomIn className="h-3 w-3" />
                {Math.round(zoom * 100)}%
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 pointer-events-auto">
            {selectedCode && (
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-black/60 backdrop-blur-md border border-white/10">
                <span className="text-[9px] text-white/40 font-bold uppercase">Active:</span>
                <span className="text-xs font-bold text-primary">{selectedCode}</span>
              </div>
            )}
            <button
              type="button"
              onClick={onFullscreen}
              className="flex h-8 w-8 items-center justify-center rounded-xl bg-black/60 border border-white/10 text-white/50 hover:text-white transition-colors"
              title="Toggle fullscreen"
            >
              {fullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
            </button>
          </div>
        </div>

        {/* ── SVG Viewer ── */}
        <div className="aspect-[1000/720] min-h-[520px]">
          <svg
            ref={svgRef}
            viewBox="0 0 1000 720"
            className={cn("h-full w-full touch-none select-none", cursorStyle)}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerUp}
            onWheel={handleWheel}
          >
            {/* Backdrop */}
            <rect width="1000" height="720" fill="#08080f" />

            <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>

              {/* Image */}
              {imageUrl ? (
                <image
                  href={imageUrl}
                  x="0" y="0" width="1000" height="720"
                  preserveAspectRatio="xMidYMid meet"
                  style={{ filter: filterStr }}
                />
              ) : (
                <g>
                  <rect x="150" y="200" width="700" height="320" rx="24"
                    fill="rgba(255,255,255,0.02)" stroke="rgba(255,255,255,0.07)" strokeDasharray="14 8" />
                  <text x="500" y="352" fill="rgba(255,255,255,0.25)" fontSize="20"
                    fontWeight="bold" textAnchor="middle" fontFamily="system-ui">
                    Cephalometric Image
                  </text>
                  <text x="500" y="386" fill="rgba(255,255,255,0.12)" fontSize="13"
                    textAnchor="middle" fontFamily="system-ui">
                    Connect backend · Upload X-ray · Run AI pipeline
                  </text>
                </g>
              )}

              {/* Reference Grid */}
              {layers.grid && (
                <g opacity="0.10">
                  {Array.from({ length: 11 }).map((_, i) => (
                    <line key={`v${i}`} x1={i*100} y1="0" x2={i*100} y2="720"
                      stroke="#60a5fa" strokeWidth="0.5" />
                  ))}
                  {Array.from({ length: 8 }).map((_, i) => (
                    <line key={`h${i}`} x1="0" y1={i*90+90} x2="1000" y2={i*90+90}
                      stroke="#60a5fa" strokeWidth="0.5" />
                  ))}
                  <text x="6" y="12" fill="rgba(96,165,250,0.35)" fontSize="8" fontFamily="system-ui">GRID 100px</text>
                </g>
              )}

              {/* ── Tracing Planes ── */}
              {activePlanes.map(plane => {
                const p1 = byCode[plane.from], p2 = byCode[plane.to];
                if (!p1 || !p2) return null;
                const [ext1, ext2] = extendedLine(p1, p2, 70);
                const midX = (ext1.x + ext2.x) / 2;
                const midY = (ext1.y + ext2.y) / 2 - 14;
                return (
                  <g key={plane.key} className="animate-in fade-in duration-500">
                    <line x1={ext1.x} y1={ext1.y} x2={ext2.x} y2={ext2.y}
                      stroke={plane.color} strokeOpacity="0.09" strokeWidth="8" />
                    <line x1={ext1.x} y1={ext1.y} x2={ext2.x} y2={ext2.y}
                      stroke={plane.color} strokeOpacity="0.6" strokeWidth="1.5"
                      strokeDasharray={plane.dashed ? "8 5" : undefined} />
                    <g transform={`translate(${midX}, ${midY})`}>
                      <rect x="-2" y="-9" width={plane.label.length*6+8} height="13"
                        rx="4" fill="rgba(0,0,0,0.75)" />
                      <text x={plane.label.length*3+2} y="1"
                        fill={plane.color} fontSize="9" fontWeight="bold"
                        textAnchor="middle" fontFamily="system-ui">{plane.label}</text>
                    </g>
                  </g>
                );
              })}

              {/* Soft-tissue cubic curve */}
              {layers.softTissue && byCode.N_st && byCode.Prn && byCode.Ls && byCode.Li && byCode.Pog_st && (
                <path
                  d={`M ${byCode.N_st.x} ${byCode.N_st.y}
                      C ${byCode.Prn.x+50} ${byCode.N_st.y+70},
                        ${byCode.Prn.x+35} ${byCode.Prn.y-25},
                        ${byCode.Prn.x} ${byCode.Prn.y}
                      C ${byCode.Prn.x-12} ${byCode.Prn.y+35},
                        ${byCode.Ls.x+25} ${byCode.Ls.y-20},
                        ${byCode.Ls.x} ${byCode.Ls.y}
                      C ${byCode.Ls.x-10} ${byCode.Ls.y+20},
                        ${byCode.Li.x+10} ${byCode.Li.y-15},
                        ${byCode.Li.x} ${byCode.Li.y}
                      C ${byCode.Li.x-10} ${byCode.Li.y+25},
                        ${byCode.Pog_st.x+20} ${byCode.Pog_st.y-25},
                        ${byCode.Pog_st.x} ${byCode.Pog_st.y}`}
                  fill="none" stroke="#fb7185" strokeOpacity="0.55"
                  strokeWidth="2.5" strokeLinecap="round"
                  className="animate-in fade-in duration-700"
                />
              )}

              {/* ── Landmarks ── */}
              {layers.landmarks && landmarks.map(lm => {
                const sel = lm.code === selectedCode;
                const hov = lm.code === hoveredCode;
                const groupColor = getGroupColor(lm.code);
                const confColor = lm.confidence>=0.85?"#4ade80":lm.confidence>=0.7?"#60a5fa":"#f59e0b";
                const dotColor = sel ? groupColor : confColor;
                const r = sel ? 6 : hov ? 5 : 4;

                return (
                  <g
                    key={lm.code}
                    onPointerDown={e => {
                      e.stopPropagation();
                      if (tool === "select" && !locked) {
                        setDraggingCode(lm.code);
                        onSelect(lm.code);
                      }
                    }}
                    onPointerEnter={() => onHover(lm.code)}
                    onPointerLeave={() => onHover(null)}
                    className={tool === "select" && !locked ? "cursor-move" : "cursor-pointer"}
                  >
                    {/* Selection rings */}
                    {sel && <>
                      <circle cx={lm.x} cy={lm.y} r="30" fill="none"
                        stroke={groupColor} strokeOpacity="0.12" strokeWidth="1.5"
                        className="animate-pulse" />
                      <circle cx={lm.x} cy={lm.y} r="20" fill="none"
                        stroke={groupColor} strokeOpacity="0.4" strokeWidth="1.5"
                        strokeDasharray="5 3" />
                    </>}

                    {/* Hover ring */}
                    {hov && !sel && (
                      <circle cx={lm.x} cy={lm.y} r="16" fill="none"
                        stroke={dotColor} strokeOpacity="0.3" strokeWidth="1" />
                    )}

                    {/* Crosshair reticle */}
                    {[[-14,0,-4,0],[4,0,14,0],[0,-14,0,-4],[0,4,0,14]].map(([x1,y1,x2,y2],i) => (
                      <line key={i}
                        x1={lm.x+x1} y1={lm.y+y1}
                        x2={lm.x+x2} y2={lm.y+y2}
                        stroke={dotColor} strokeWidth={sel?2.5:hov?2:1.8} strokeLinecap="round"
                      />
                    ))}

                    {/* Center dot — diamond shape if low confidence */}
                    {lm.confidence < 0.7 ? (
                      <polygon
                        points={`${lm.x},${lm.y-r} ${lm.x+r},${lm.y} ${lm.x},${lm.y+r} ${lm.x-r},${lm.y}`}
                        fill={dotColor} stroke="#000" strokeWidth="1.2"
                      />
                    ) : (
                      <circle cx={lm.x} cy={lm.y} r={r}
                        fill={dotColor} stroke="#000" strokeWidth="1.5" />
                    )}

                    {/* Adjusted indicator */}
                    {lm.adjusted && (
                      <circle cx={lm.x+8} cy={lm.y-8} r="3.5"
                        fill="#60a5fa" stroke="#000" strokeWidth="1" />
                    )}

                    {/* Label */}
                    {(sel || hov || zoom >= 2) && (
                      <g transform={`translate(${lm.x+14}, ${lm.y-24})`}>
                        <rect
                          width={Math.max(28, lm.code.length*6.5+8)} height="17" rx="5"
                          fill="rgba(0,0,0,0.88)" stroke={dotColor} strokeOpacity="0.5" strokeWidth="0.5"
                        />
                        <text
                          x={Math.max(14, lm.code.length*3.25+4)} y="12"
                          fill="white" fontSize="9.5" fontWeight="bold"
                          textAnchor="middle" fontFamily="system-ui"
                        >{lm.code}</text>
                      </g>
                    )}

                    {/* Hover tooltip with name */}
                    {hov && !sel && (
                      <g transform={`translate(${lm.x+14}, ${lm.y+12})`}>
                        <rect width={Math.max(60, lm.name.length*5.5+10)} height="16"
                          rx="4" fill="rgba(0,0,0,0.88)" />
                        <text x={Math.max(30, (lm.name.length*5.5+10)/2)} y="11"
                          fill="rgba(255,255,255,0.7)" fontSize="8.5"
                          textAnchor="middle" fontFamily="system-ui">{lm.name}</text>
                      </g>
                    )}
                  </g>
                );
              })}

              {/* ── Calibration Ruler ── */}
              {calibrationPoints.length >= 1 && (
                <g>
                  {calibrationPoints.map((pt, i) => {
                    const otherPt = calibrationPoints[1 - i];
                    return (
                      <g
                        key={`cal-${i}`}
                        onPointerDown={e => { e.stopPropagation(); setDraggingCalibIdx(i); }}
                        className="cursor-move"
                      >
                        <circle cx={pt.x} cy={pt.y} r="18"
                          fill="rgba(245,158,11,0.08)" stroke="#f59e0b"
                          strokeWidth="0.5" strokeDasharray="3 2" />
                        <circle cx={pt.x} cy={pt.y} r="10"
                          fill="rgba(245,158,11,0.18)" stroke="#f59e0b" strokeWidth="2" />
                        <circle cx={pt.x} cy={pt.y} r="3" fill="#f59e0b" />
                        {[[-12,0,12,0],[0,-12,0,12]].map(([x1,y1,x2,y2],ci) => (
                          <line key={ci}
                            x1={pt.x+x1} y1={pt.y+y1} x2={pt.x+x2} y2={pt.y+y2}
                            stroke="#f59e0b" strokeWidth="1.5" strokeOpacity="0.6" />
                        ))}
                        <g transform={`translate(${pt.x + 20}, ${pt.y - 18})`}>
                          <rect x="-2" y="-9" width="34" height="13" rx="4"
                            fill="rgba(0,0,0,0.85)" stroke="#f59e0b" strokeWidth="0.5" />
                          <text x="15" y="1"
                            fill="#f59e0b" fontSize="9" fontWeight="bold"
                            textAnchor="middle" fontFamily="system-ui">REF {i+1}</text>
                        </g>
                      </g>
                    );
                  })}

                  {calibrationPoints.length === 2 && (() => {
                    const [p1, p2] = calibrationPoints;
                    const pxDist = pixelDist(p1, p2);
                    const midX = (p1.x+p2.x)/2, midY = (p1.y+p2.y)/2;
                    const tick1 = perpTick(p1, p2, 10);
                    const tick2 = perpTick(p2, p1, 10);
                    return (
                      <g>
                        {/* Ruler line */}
                        <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y}
                          stroke="#f59e0b" strokeWidth="2" strokeDasharray="10 5" strokeOpacity="0.8" />
                        {/* End ticks */}
                        <line x1={tick1.x1} y1={tick1.y1} x2={tick1.x2} y2={tick1.y2}
                          stroke="#f59e0b" strokeWidth="2.5" strokeOpacity="0.9" />
                        <line x1={tick2.x1} y1={tick2.y1} x2={tick2.x2} y2={tick2.y2}
                          stroke="#f59e0b" strokeWidth="2.5" strokeOpacity="0.9" />
                        {/* Distance label */}
                        <g transform={`translate(${midX}, ${midY})`}>
                          <rect x="-38" y="-24" width="76" height="42" rx="8"
                            fill="rgba(0,0,0,0.9)" stroke="#f59e0b" strokeWidth="1.2" />
                          <text x="0" y="-7" fill="#f59e0b" fontSize="11" fontWeight="bold"
                            textAnchor="middle" fontFamily="system-ui">? mm</text>
                          <text x="0" y="10" fill="rgba(245,158,11,0.55)" fontSize="9"
                            textAnchor="middle" fontFamily="system-ui">{pxDist.toFixed(0)} px</text>
                        </g>
                      </g>
                    );
                  })()}
                </g>
              )}

              {/* ── Ruler Measurement Tool ── */}
              {(rulerPts.length > 0 || (rulerPts.length === 1 && liveRuler)) && (() => {
                const p1 = rulerPts[0];
                const p2 = rulerPts[1] ?? liveRuler;
                if (!p2) return null;
                const pxDist = pixelDist(p1, p2);
                const mmDist = pixPerMm ? pxDist / pixPerMm : null;
                const midX = (p1.x+p2.x)/2, midY = (p1.y+p2.y)/2;
                const angleFromH = Math.atan2(p2.y-p1.y, p2.x-p1.x) * 180/Math.PI;
                const tick1 = perpTick(p1, p2, 8);
                const tick2 = perpTick(p2, p1, 8);
                return (
                  <g className="animate-in fade-in duration-300">
                    {/* Ruler background blur */}
                    <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y}
                      stroke="#60a5fa" strokeOpacity="0.1" strokeWidth="6" />
                    <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y}
                      stroke="#60a5fa" strokeOpacity="0.75" strokeWidth="1.5"
                      strokeDasharray={rulerPts.length===1?"6 4":undefined} />
                    <line x1={tick1.x1} y1={tick1.y1} x2={tick1.x2} y2={tick1.y2}
                      stroke="#60a5fa" strokeWidth="2" strokeOpacity="0.8" />
                    <line x1={tick2.x1} y1={tick2.y1} x2={tick2.x2} y2={tick2.y2}
                      stroke="#60a5fa" strokeWidth="2" strokeOpacity="0.8" />
                    <circle cx={p1.x} cy={p1.y} r="5" fill="#60a5fa" stroke="#000" strokeWidth="1.5" />
                    {rulerPts.length===2 && (
                      <circle cx={p2.x} cy={p2.y} r="5" fill="#60a5fa" stroke="#000" strokeWidth="1.5" />
                    )}
                    {/* Measurement label */}
                    <g transform={`translate(${midX+5}, ${midY-30})`}>
                      <rect x="-2" y="-12" width={mmDist ? 80 : 58} height="36" rx="7"
                        fill="rgba(0,0,0,0.9)" stroke="#60a5fa" strokeWidth="1" />
                      <text x={(mmDist?38:26)} y="1"
                        fill="#60a5fa" fontSize="11" fontWeight="bold"
                        textAnchor="middle" fontFamily="system-ui">
                        {mmDist ? `${mmDist.toFixed(1)} mm` : `${pxDist.toFixed(0)} px`}
                      </text>
                      <text x={(mmDist?38:26)} y="15"
                        fill="rgba(96,165,250,0.5)" fontSize="9"
                        textAnchor="middle" fontFamily="system-ui">
                        {angleFromH.toFixed(1)}° · {pxDist.toFixed(0)} px
                      </text>
                    </g>
                  </g>
                );
              })()}

              {/* ── Angle Measurement Tool ── */}
              {anglePts.length >= 1 && (() => {
                const p1 = anglePts[0];
                const p2 = anglePts[1] ?? liveAngle;
                if (!p2) return null;
                const p3 = anglePts[2] ?? (anglePts.length === 2 ? liveAngle : null);

                return (
                  <g className="animate-in fade-in duration-300">
                    <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y}
                      stroke="#a78bfa" strokeOpacity="0.8" strokeWidth="1.5"
                      strokeDasharray={anglePts.length<2?"6 4":undefined} />
                    {p3 && <>
                      <line x1={p2.x} y1={p2.y} x2={p3.x} y2={p3.y}
                        stroke="#a78bfa" strokeOpacity="0.8" strokeWidth="1.5"
                        strokeDasharray={anglePts.length<3?"6 4":undefined} />
                      <path
                        d={arcPath(p2, p1, p3, 30)}
                        fill="rgba(167,139,250,0.12)"
                        stroke="#a78bfa" strokeOpacity="0.7" strokeWidth="1.5"
                        strokeDasharray="4 3"
                      />
                      <g transform={`translate(${p2.x+35}, ${p2.y-15})`}>
                        <rect x="-2" y="-10" width="54" height="20" rx="6"
                          fill="rgba(0,0,0,0.9)" stroke="#a78bfa" strokeWidth="1" />
                        <text x="25" y="4"
                          fill="#a78bfa" fontSize="11" fontWeight="bold"
                          textAnchor="middle" fontFamily="system-ui">
                          {angleDeg(p2, p1, p3).toFixed(1)}°
                        </text>
                      </g>
                    </>}
                    {/* Point markers */}
                    {[p1, p2, ...(p3 ? [p3] : [])].map((pt, i) => (
                      <circle key={i} cx={pt.x} cy={pt.y} r="5"
                        fill="#a78bfa" stroke="#000" strokeWidth="1.5" />
                    ))}
                  </g>
                );
              })()}

            </g>{/* end transform group */}

            {/* ── Minimap (SVG-space, not transformed) ── */}
            {zoom > 1.4 && (
              <g transform="translate(840, 558)">
                <rect width="148" height="106" rx="9"
                  fill="rgba(0,0,0,0.82)" stroke="rgba(255,255,255,0.12)" strokeWidth="1" />
                <text x="8" y="13" fill="rgba(255,255,255,0.3)"
                  fontSize="7.5" fontFamily="system-ui" fontWeight="bold">MINIMAP</text>
                {/* Thumbnail landmarks */}
                {landmarks.slice(0, 20).map(lm => (
                  <circle key={lm.code}
                    cx={8 + (lm.x/1000)*132}
                    cy={18 + (lm.y/720)*80}
                    r="1.2" fill={getGroupColor(lm.code)} opacity="0.7" />
                ))}
                {/* Viewport box */}
                <rect
                  x={8 + Math.max(0, (-pan.x / zoom / 1000) * 132)}
                  y={18 + Math.max(0, (-pan.y / zoom / 720) * 80)}
                  width={Math.min(132, (1/zoom)*132)}
                  height={Math.min(80, (1/zoom)*80)}
                  fill="rgba(96,165,250,0.12)"
                  stroke="rgba(96,165,250,0.7)"
                  strokeWidth="1" rx="2"
                />
              </g>
            )}
          </svg>
        </div>

        {/* ── Zoom Controls ── */}
        <div className="absolute right-4 bottom-16 flex flex-col gap-1 z-10">
          <div className="flex flex-col rounded-xl border border-white/10 bg-black/75 backdrop-blur-md p-1 shadow-2xl">
            <IconBtn icon={ZoomIn} label="Zoom In (+)"
              onClick={() => {
                const ctr = { x: 500, y: 360 };
                const nz = Math.min(8, zoom * 1.3);
                setPan(p => ({ x: ctr.x - (ctr.x-p.x)*nz/zoom, y: ctr.y - (ctr.y-p.y)*nz/zoom }));
                setZoom(nz);
              }}
              variant="ghost" size="sm" className="text-white/60 hover:text-white" />
            <div className="h-px bg-white/5 mx-1.5" />
            <IconBtn icon={ZoomOut} label="Zoom Out (-)"
              onClick={() => {
                const nz = Math.max(1, zoom / 1.3);
                if (nz === 1) { setZoom(1); setPan({ x:0, y:0 }); }
                else {
                  const ctr = { x: 500, y: 360 };
                  setPan(p => ({ x: ctr.x - (ctr.x-p.x)*nz/zoom, y: ctr.y - (ctr.y-p.y)*nz/zoom }));
                  setZoom(nz);
                }
              }}
              variant="ghost" size="sm" className="text-white/60 hover:text-white" />
            <div className="h-px bg-white/5 mx-1.5" />
            <button type="button"
              onClick={() => { setZoom(1); setPan({ x:0, y:0 }); }}
              className="flex h-8 w-8 items-center justify-center text-[9px] font-bold text-white/30 hover:text-white transition-colors"
            >1:1</button>
          </div>
        </div>

        {/* ── Status Bar (hover to reveal) ── */}
        <div className="absolute bottom-0 inset-x-0 translate-y-full group-hover/viewer:translate-y-0 transition-transform duration-300 z-10">
          <div className="flex items-center justify-between gap-4 p-3 mx-3 mb-2 rounded-2xl bg-black/90 backdrop-blur-xl border border-white/10 shadow-2xl">
            <div className="flex items-center gap-4 text-[10px] font-mono text-white/40">
              {cursorPt && (
                <span>
                  X: <span className="text-white/70">{Math.round(cursorPt.x)}</span>
                  {" "} Y: <span className="text-white/70">{Math.round(cursorPt.y)}</span>
                  {pixPerMm && (
                    <span className="ml-2 text-primary/60">
                      ({(cursorPt.x/pixPerMm).toFixed(1)} mm, {(cursorPt.y/pixPerMm).toFixed(1)} mm)
                    </span>
                  )}
                </span>
              )}
            </div>
            <div className="flex items-center gap-3 text-[10px] text-white/40">
              {landmarks.length > 0 && (
                <span><span className="text-white/70">{landmarks.length}</span> pts</span>
              )}
              <span>Zoom <span className="text-white/70">{Math.round(zoom*100)}%</span></span>
              <span className="hidden sm:block">
                <kbd className="bg-white/10 px-1.5 py-0.5 rounded text-[9px]">S</kbd> Select ·{" "}
                <kbd className="bg-white/10 px-1.5 py-0.5 rounded text-[9px]">H</kbd> Pan ·{" "}
                <kbd className="bg-white/10 px-1.5 py-0.5 rounded text-[9px]">R</kbd> Ruler ·{" "}
                <kbd className="bg-white/10 px-1.5 py-0.5 rounded text-[9px]">A</kbd> Angle ·{" "}
                <kbd className="bg-white/10 px-1.5 py-0.5 rounded text-[9px]">C</kbd> Calibrate
              </span>
            </div>
          </div>
        </div>
      </Card>

      {/* Ruler tool — clear button */}
      {(rulerPts.length > 0 || anglePts.length > 0) && (
        <div className="flex items-center gap-2 mt-2 justify-end">
          {rulerPts.length > 0 && (
            <button
              type="button"
              onClick={() => { setRulerPts([]); setLiveRuler(null); }}
              className="flex items-center gap-1.5 text-[10px] font-bold text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="h-3 w-3" /> Clear ruler
            </button>
          )}
          {anglePts.length > 0 && (
            <button
              type="button"
              onClick={() => { setAnglePts([]); setLiveAngle(null); }}
              className="flex items-center gap-1.5 text-[10px] font-bold text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="h-3 w-3" /> Clear angle
            </button>
          )}
        </div>
      )}
    </div>
  );
}
