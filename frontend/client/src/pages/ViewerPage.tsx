import React, { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { useLocation } from "wouter";
import {
  Ruler, Save, Layers3, RefreshCw, Eye, BarChart3, Move,
  ChevronRight, ChevronDown, Crosshair, Lock, Unlock,
  ZoomIn, ZoomOut, ScanLine, MousePointer2, Triangle,
  Maximize2, Minimize2, FlipHorizontal, Sun, Contrast,
  X, CheckCircle2, AlertTriangle, Undo2, Redo2, Download,
  EyeOff, Copy, RotateCcw, Zap, Sliders, Trash2, ListChecks,
} from "lucide-react";
import {
  Card, Pill, PrimaryBtn, SecondaryBtn, IconBtn,
  PageHeader, Field, TextInput, Divider, Switch,
} from "@/components/_core/ClinicalComponents";
import { type CaseRecord, type Landmark, type Point, type OverlayArtifact } from "@/lib/mappers";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

// ─── Constants ────────────────────────────────────────────────────────────────

const LANDMARK_GROUPS = [
  { label: "Cranial Base",  codes: ["S","N","Or","Po","Ba","Pt","Ar","Se"],                                            color: "#60a5fa" },
  { label: "Maxilla",       codes: ["A","ANS","PNS","Sp","Ss","Prn","Ns"],                                            color: "#34d399" },
  { label: "Mandible",      codes: ["B","Pog","Gn","Me","Go","Co","D","Id"],                                          color: "#f59e0b" },
  { label: "Dental",        codes: ["UI","LI","U1r","L1r","UM","LM","UP","LP","U6","L6"],                            color: "#a78bfa" },
  { label: "Soft Tissue",   codes: ["Ls","Li","Pg","Cm","Sn","Dt","Tt","Gls","Sts","Sti","N_st","Pog_st"],           color: "#fb7185" },
  { label: "Airway / CVM",  codes: ["PNW","PPW","Eb","Tb","C2","C3","C4","C3ant","C3post","C4ant","C4post","C2inf"], color: "#38bdf8" },
  { label: "Ricketts",      codes: ["Xi","Dc","Cf","Ag","Pm","Cc","ENS","ENS2"],                                      color: "#e879f9" },
];

type TracingPlane = {
  key: string; from: string; to: string; color: string;
  label: string; dashed?: boolean; group: "skeletal"|"dental"|"soft"|"vertical";
};

const TRACING_PLANES: TracingPlane[] = [
  { key:"SN",      from:"S",    to:"N",     color:"#60a5fa", label:"SN",          group:"skeletal"              },
  { key:"FH",      from:"Po",   to:"Or",    color:"#f59e0b", label:"FH",          group:"skeletal"              },
  { key:"NA",      from:"N",    to:"A",     color:"#34d399", label:"NA",          group:"skeletal"              },
  { key:"NB",      from:"N",    to:"B",     color:"#34d399", label:"NB",          group:"skeletal"              },
  { key:"NPog",    from:"N",    to:"Pog",   color:"#a78bfa", label:"N-Pog",       group:"skeletal", dashed:true },
  { key:"GoGn",    from:"Go",   to:"Gn",    color:"#f59e0b", label:"Md. Plane",   group:"vertical"              },
  { key:"GoMe",    from:"Go",   to:"Me",    color:"#fbbf24", label:"Go-Me",       group:"vertical", dashed:true },
  { key:"Inc",     from:"UI",   to:"LI",    color:"#34d399", label:"Inc.",         group:"dental"               },
  { key:"OcPlane", from:"U6",   to:"L6",    color:"#e879f9", label:"Occ. Plane",  group:"dental",   dashed:true },
  { key:"ELine",   from:"Prn",  to:"Pg",    color:"#fb7185", label:"E-Line",      group:"soft",     dashed:true },
  { key:"SoftN",   from:"N_st", to:"Pog_st",color:"#fb7185", label:"Facial",      group:"soft"                  },
];

type ToolMode = "select" | "pan" | "ruler" | "calibrate" | "angle";

const TOOLS: { mode: ToolMode; icon: React.ElementType; label: string; shortcut: string }[] = [
  { mode:"select",    icon:MousePointer2, label:"Select / Move",    shortcut:"S" },
  { mode:"pan",       icon:Move,          label:"Pan / Navigate",   shortcut:"H" },
  { mode:"ruler",     icon:Ruler,         label:"Measure Distance", shortcut:"R" },
  { mode:"calibrate", icon:ScanLine,      label:"Calibrate Scale",  shortcut:"C" },
  { mode:"angle",     icon:Triangle,      label:"Measure Angle",    shortcut:"A" },
];

const IMAGE_PRESETS = [
  { label:"Standard",      filters:{ brightness:100, contrast:110, gamma:1.0, invert:false, sharpen:false } },
  { label:"High Contrast", filters:{ brightness:75,  contrast:175, gamma:0.85,invert:false, sharpen:false } },
  { label:"Soft Tissue",   filters:{ brightness:125, contrast:90,  gamma:1.2, invert:false, sharpen:false } },
  { label:"Bone Detail",   filters:{ brightness:80,  contrast:200, gamma:0.7, invert:false, sharpen:true  } },
  { label:"Negative",      filters:{ brightness:100, contrast:120, gamma:1.0, invert:true,  sharpen:false } },
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

function perpTick(p: Point, p2: Point, half: number) {
  const dx = p2.x-p.x, dy = p2.y-p.y, len = Math.sqrt(dx*dx+dy*dy)||1;
  return { x1:p.x-dy/len*half, y1:p.y+dx/len*half, x2:p.x+dy/len*half, y2:p.y-dx/len*half };
}

function dist(a: Point, b: Point) { return Math.sqrt((b.x-a.x)**2+(b.y-a.y)**2); }

function angleDeg(center: Point, p1: Point, p2: Point) {
  const v1={x:p1.x-center.x,y:p1.y-center.y}, v2={x:p2.x-center.x,y:p2.y-center.y};
  const dot=v1.x*v2.x+v1.y*v2.y, l1=Math.sqrt(v1.x**2+v1.y**2), l2=Math.sqrt(v2.x**2+v2.y**2);
  if (!l1||!l2) return 0;
  return Math.acos(Math.max(-1,Math.min(1,dot/(l1*l2))))*(180/Math.PI);
}

function arcPath(c: Point, p1: Point, p2: Point, r: number) {
  const a1=Math.atan2(p1.y-c.y,p1.x-c.x), a2=Math.atan2(p2.y-c.y,p2.x-c.x);
  let diff=a2-a1; while(diff>Math.PI)diff-=2*Math.PI; while(diff<-Math.PI)diff+=2*Math.PI;
  const sx=c.x+r*Math.cos(a1),sy=c.y+r*Math.sin(a1),ex=c.x+r*Math.cos(a2),ey=c.y+r*Math.sin(a2);
  return `M ${sx} ${sy} A ${r} ${r} 0 ${Math.abs(diff)>Math.PI?1:0} ${diff>0?1:0} ${ex} ${ey}`;
}

function uid() { return Math.random().toString(36).slice(2); }

// ─── Types ────────────────────────────────────────────────────────────────────

type ImageFilters = { brightness:number; contrast:number; gamma:number; invert:boolean; sharpen:boolean };

type SavedMeasurement = {
  id: string; kind: "distance"|"angle";
  value: number; unit: string; pts: Point[]; label?: string; at: string;
};

type CtxMenu = { screenX: number; screenY: number; code: string };

interface ViewerPageProps {
  activeCase?: CaseRecord;
  landmarks: Landmark[];
  setLandmarks: (l: Landmark[]) => void;
  overlays: OverlayArtifact[];
  onCalibrate: (pts: Point[], mm: number) => void|Promise<void>;
  onSaveAndSend: (isCbct: boolean) => void|Promise<void>;
  onRefreshOverlays: () => void|Promise<void>;
}

// ─── ViewerPage ───────────────────────────────────────────────────────────────

export default function ViewerPage({
  activeCase, landmarks, setLandmarks, overlays,
  onCalibrate, onSaveAndSend, onRefreshOverlays,
}: ViewerPageProps) {
  const [, navigate] = useLocation();

  // Tool / interaction
  const [tool, setTool]               = useState<ToolMode>("select");
  const [selectedCode, setSelectedCode] = useState<string|null>(null);
  const [hoveredCode, setHoveredCode]   = useState<string|null>(null);
  const [isCbct, setIsCbct]           = useState(false);
  const [isLocked, setIsLocked]       = useState(false);
  const [fullscreen, setFullscreen]   = useState(false);

  // Calibration
  const [calibPts, setCalibPts]       = useState<Point[]>(activeCase?.calibrationPoints ?? []);
  const [distMm, setDistMm]           = useState(String(activeCase?.calibrationDistanceMm ?? 100));

  // Measurement tools
  const [rulerPts, setRulerPts]       = useState<Point[]>([]);
  const [anglePts, setAnglePts]       = useState<Point[]>([]);
  const [measurements, setMeasurements] = useState<SavedMeasurement[]>([]);

  // Image filters
  const [filters, setFilters] = useState<ImageFilters>(
    { brightness:100, contrast:110, gamma:1.0, invert:false, sharpen:false }
  );

  // Layer / plane visibility
  const [layers, setLayers] = useState({ landmarks:true, planes:true, softTissue:true, grid:false });
  const [planeVis, setPlaneVis] = useState<Record<string,boolean>>(
    Object.fromEntries(TRACING_PLANES.map(p => [p.key, true]))
  );

  // UI state
  const [activeTab, setActiveTab]     = useState<"controls"|"planes"|"calibrate"|"measures">("controls");
  const [expandedGroups, setExpandedGroups] = useState<Record<string,boolean>>(
    Object.fromEntries(LANDMARK_GROUPS.map(g => [g.label, false]))
  );
  const [ctxMenu, setCtxMenu]         = useState<CtxMenu|null>(null);
  const [alwaysLabels, setAlwaysLabels] = useState(false);
  const [flipH, setFlipH]             = useState(false);
  const [centerTarget, setCenterTarget] = useState<Point|null>(null);

  // Undo / Redo
  const undoStack = useRef<Landmark[][]>([]);
  const redoStack = useRef<Landmark[][]>([]);

  function pushUndo() {
    undoStack.current = [...undoStack.current.slice(-24), [...landmarks]];
    redoStack.current = [];
  }

  function undo() {
    if (!undoStack.current.length) return;
    redoStack.current = [landmarks, ...redoStack.current.slice(0, 24)];
    setLandmarks(undoStack.current[undoStack.current.length - 1]);
    undoStack.current = undoStack.current.slice(0, -1);
    toast.info("Undo");
  }

  function redo() {
    if (!redoStack.current.length) return;
    undoStack.current = [...undoStack.current, landmarks];
    setLandmarks(redoStack.current[0]);
    redoStack.current = redoStack.current.slice(1);
    toast.info("Redo");
  }

  useEffect(() => {
    setCalibPts(activeCase?.calibrationPoints ?? []);
    setDistMm(String(activeCase?.calibrationDistanceMm ?? 100));
  }, [activeCase?.id]);

  // ── Context menu close ──
  useEffect(() => {
    if (!ctxMenu) return;
    const close = () => setCtxMenu(null);
    window.addEventListener("pointerdown", close);
    return () => window.removeEventListener("pointerdown", close);
  }, [ctxMenu]);

  // ── Keyboard shortcuts ──
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const inInput = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;
      if (inInput && !e.ctrlKey && !e.metaKey) return;

      const ctrl = e.ctrlKey || e.metaKey;

      if (ctrl && e.key === "z" && !e.shiftKey) { e.preventDefault(); undo(); return; }
      if (ctrl && (e.key === "y" || (e.key === "z" && e.shiftKey))) { e.preventDefault(); redo(); return; }
      if (inInput) return;

      switch (e.key.toLowerCase()) {
        case "s": case "v": setTool("select"); break;
        case "h": setTool("pan"); break;
        case "r": setTool("ruler"); break;
        case "c": setTool("calibrate"); break;
        case "a": setTool("angle"); break;
        case "l": setAlwaysLabels(v => !v); break;
        case "f": setFilters(f => ({ ...f, flipH: !flipH })); break;
        case "escape":
          setRulerPts([]); setAnglePts([]);
          if (tool === "calibrate") setCalibPts([]);
          setSelectedCode(null); setCtxMenu(null);
          break;
        case "arrowleft":  moveSel(e.shiftKey?-5:-1, 0); e.preventDefault(); break;
        case "arrowright": moveSel(e.shiftKey? 5: 1, 0); e.preventDefault(); break;
        case "arrowup":    moveSel(0, e.shiftKey?-5:-1); e.preventDefault(); break;
        case "arrowdown":  moveSel(0, e.shiftKey? 5: 1); e.preventDefault(); break;
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [tool, selectedCode, landmarks, isLocked, flipH]);

  function updateLandmark(code: string, patch: Partial<Landmark>) {
    if (isLocked) return;
    setLandmarks(landmarks.map(l => l.code === code ? { ...l, ...patch } : l));
  }

  function moveSel(dx: number, dy: number) {
    if (!selectedCode || isLocked) return;
    const lm = landmarks.find(l => l.code === selectedCode);
    if (lm) { pushUndo(); updateLandmark(selectedCode, { x:lm.x+dx, y:lm.y+dy, adjusted:true }); }
  }

  // ── Context menu actions ──
  function copyLandmarkCoords(code: string) {
    const lm = landmarks.find(l => l.code === code);
    if (!lm) return;
    const text = pixPerMm
      ? `${code}: X=${lm.x.toFixed(1)}px (${(lm.x/pixPerMm).toFixed(1)}mm), Y=${lm.y.toFixed(1)}px (${(lm.y/pixPerMm).toFixed(1)}mm)`
      : `${code}: X=${lm.x.toFixed(1)}px, Y=${lm.y.toFixed(1)}px`;
    navigator.clipboard?.writeText(text).then(() => toast.success("Coordinates copied")).catch(() => {});
  }

  function centerOnLandmark(code: string) {
    const lm = landmarks.find(l => l.code === code);
    if (lm) setCenterTarget({ x: lm.x, y: lm.y });
  }

  function clearAdjusted(code: string) {
    updateLandmark(code, { adjusted: false });
    toast.info(`${code}: adjustment flag cleared`);
  }

  // ── Calibration ──
  const pixPerMm = useMemo(() => {
    const pts = calibPts.length === 2 ? calibPts : (activeCase?.calibrationPoints ?? []);
    const mm = calibPts.length === 2 ? Number(distMm) : (activeCase?.calibrationDistanceMm ?? 0);
    if (pts.length === 2 && mm > 0) return dist(pts[0], pts[1]) / mm;
    return null;
  }, [calibPts, distMm, activeCase]);

  const calibrated = Boolean(activeCase?.calibrated || calibPts.length === 2);

  function handleCalibrate() {
    if (calibPts.length !== 2) return;
    onCalibrate(calibPts, Number(distMm));
    toast.success(`Spatial calibration saved — ${distMm} mm reference`);
    setTool("select"); setCalibPts([]);
  }

  // ── Measurements ──
  function saveMeasurement(m: Omit<SavedMeasurement,"id"|"at">) {
    setMeasurements(prev => [{ ...m, id: uid(), at: new Date().toLocaleTimeString() }, ...prev.slice(0, 49)]);
    setActiveTab("measures");
  }

  // ── Export ──
  const svgRef = useRef<SVGSVGElement>(null);
  function exportSVG() {
    const svg = svgRef.current;
    if (!svg) return;
    const s = new XMLSerializer().serializeToString(svg);
    const blob = new Blob([s], { type:"image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `ceph-${activeCase?.title ?? "viewer"}.svg`; a.click();
    URL.revokeObjectURL(url);
    toast.success("Viewer exported as SVG");
  }

  // ── Layout ──
  const containerRef = useRef<HTMLDivElement>(null);
  function toggleFullscreen() {
    if (!document.fullscreenElement && containerRef.current) {
      containerRef.current.requestFullscreen?.(); setFullscreen(true);
    } else { document.exitFullscreen?.(); setFullscreen(false); }
  }

  const selected = landmarks.find(l => l.code === selectedCode) ?? null;
  const lowConf  = landmarks.filter(l => l.confidence < 0.7);
  const canUndo  = undoStack.current.length > 0;
  const canRedo  = redoStack.current.length > 0;

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

  return (
    <div className="space-y-5 animate-in fade-in duration-500">
      <PageHeader
        eyebrow="Diagnostic Review"
        title="Clinical Viewer"
        description="Professional cephalometric workspace with live landmark editing, measurement tools, and spatial calibration."
        actions={
          <>
            <div className="flex items-center gap-1 rounded-xl border border-border/40 bg-muted/20 p-1">
              {([
                { icon:Undo2, label:"Undo (Ctrl+Z)",       action:undo, enabled:canUndo },
                { icon:Redo2, label:"Redo (Ctrl+Shift+Z)", action:redo, enabled:canRedo },
              ] as const).map(b => (
                <button
                  key={b.label}
                  type="button"
                  title={b.label}
                  onClick={b.action}
                  disabled={!b.enabled}
                  className={cn(
                    "h-8 w-8 flex items-center justify-center rounded-lg transition-all",
                    b.enabled ? "text-foreground hover:bg-muted/40" : "text-muted-foreground/25 cursor-not-allowed"
                  )}
                >
                  <b.icon className="h-3.5 w-3.5" />
                </button>
              ))}
            </div>
            <IconBtn icon={Download} label="Export SVG" onClick={exportSVG} variant="outline" />
            <div className="flex items-center gap-2 rounded-xl border border-border/40 bg-muted/20 px-3 h-10">
              <Switch checked={isCbct} onChange={setIsCbct} label="CBCT" />
            </div>
            <IconBtn
              icon={isLocked ? Lock : Unlock}
              label={isLocked ? "Unlock" : "Lock editing"}
              onClick={() => setIsLocked(l => !l)}
              variant={isLocked ? "solid" : "outline"}
            />
            <PrimaryBtn onClick={() => onSaveAndSend(isCbct)} icon={Save}>Save & Send</PrimaryBtn>
          </>
        }
      />

      <div ref={containerRef} className={cn(
        "grid gap-4 xl:grid-cols-[1fr_360px]",
        fullscreen && "fixed inset-0 z-50 bg-background p-4 overflow-auto"
      )}>
        {/* Left column */}
        <div className="space-y-4 min-h-0">
          <CephCanvas
            svgRef={svgRef}
            imageUrl={activeCase?.imageUrl}
            landmarks={landmarks}
            setLandmarks={setLandmarks}
            pushUndo={pushUndo}
            selectedCode={selectedCode}
            hoveredCode={hoveredCode}
            tool={tool}
            setTool={setTool}
            onSelect={setSelectedCode}
            onHover={setHoveredCode}
            layers={layers}
            planeVis={planeVis}
            filters={filters}
            calibPts={calibPts}
            setCalibPts={setCalibPts}
            locked={isLocked}
            pixPerMm={pixPerMm}
            rulerPts={rulerPts}
            setRulerPts={setRulerPts}
            anglePts={anglePts}
            setAnglePts={setAnglePts}
            alwaysLabels={alwaysLabels}
            flipH={flipH}
            centerTarget={centerTarget}
            onCenterConsumed={() => setCenterTarget(null)}
            onAddMeasurement={saveMeasurement}
            onContextMenu={(code, x, y) => { setCtxMenu({ screenX:x, screenY:y, code }); }}
            onFullscreen={toggleFullscreen}
            fullscreen={fullscreen}
          />

          {/* Landmark Inventory */}
          <Card noPadding className="overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border/40">
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Crosshair className="h-4 w-4" />
                </div>
                <div>
                  <h4 className="text-sm font-bold">Landmark Inventory</h4>
                  <p className="text-[10px] text-muted-foreground">
                    {landmarks.length} pts · {landmarks.filter(l=>l.adjusted).length} adjusted
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  title="Toggle all labels (L)"
                  onClick={() => setAlwaysLabels(v=>!v)}
                  className={cn(
                    "flex h-7 w-7 items-center justify-center rounded-lg border text-[10px] transition-all",
                    alwaysLabels ? "border-primary/40 bg-primary/10 text-primary" : "border-border/50 text-muted-foreground"
                  )}
                >
                  L
                </button>
                {lowConf.length > 0 && (
                  <Pill tone="warning" size="xs">{lowConf.length} low</Pill>
                )}
                <Pill tone={!landmarks.length ? "neutral" : lowConf.length ? "warning" : "success"} size="xs">
                  {landmarks.length
                    ? `${Math.round(landmarks.reduce((s,l)=>s+l.confidence,0)/landmarks.length*100)}% avg`
                    : "—"}
                </Pill>
              </div>
            </div>

            <div className="p-3 space-y-1">
              {groupedLandmarks.map(grp => {
                const open = expandedGroups[grp.label];
                const low = grp.landmarks.filter(l=>l.confidence<0.7).length;
                return (
                  <div key={grp.label} className="rounded-xl border border-border/40 overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setExpandedGroups(g => ({...g, [grp.label]:!g[grp.label]}))}
                      className="w-full flex items-center justify-between gap-3 px-4 py-2.5 bg-muted/10 hover:bg-muted/20 transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-2 rounded-full shrink-0" style={{ background: grp.color }} />
                        <span className="text-xs font-bold">{grp.label}</span>
                        <span className="text-[10px] text-muted-foreground/50">{grp.landmarks.length} pts</span>
                        {low > 0 && <Pill tone="warning" size="xs">{low} low</Pill>}
                      </div>
                      {open ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                             : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
                    </button>
                    {open && (
                      <div className="grid gap-1 p-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 animate-in fade-in duration-150">
                        {grp.landmarks.map(lm => (
                          <LandmarkChip
                            key={lm.code} landmark={lm}
                            selected={lm.code === selectedCode} hovered={lm.code === hoveredCode}
                            color={grp.color} onClick={() => setSelectedCode(lm.code)}
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
                    onClick={() => setExpandedGroups(g => ({...g, __other:!g["__other"]}))}
                    className="w-full flex items-center justify-between gap-3 px-4 py-2.5 bg-muted/10 hover:bg-muted/20 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-2 rounded-full bg-muted-foreground/40" />
                      <span className="text-xs font-bold">Other</span>
                      <span className="text-[10px] text-muted-foreground/50">{ungroupedLandmarks.length} pts</span>
                    </div>
                    {expandedGroups["__other"] ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                                               : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
                  </button>
                  {expandedGroups["__other"] && (
                    <div className="grid gap-1 p-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 animate-in fade-in duration-150">
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
                  <p className="text-xs text-muted-foreground italic">Run AI to populate landmarks.</p>
                </div>
              )}
            </div>
          </Card>
        </div>

        {/* Right panel */}
        <div className="space-y-4">
          {/* Landmark detail */}
          <Card className={cn("transition-all", selected ? "border-primary/30" : "opacity-80")}>
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
              <div className="flex-1 min-w-0">
                <h4 className="text-sm font-bold">Active Landmark</h4>
                <p className="text-xs text-muted-foreground truncate">
                  {selected ? selected.name : "Click a point to inspect"}
                </p>
              </div>
              {selected && (
                <button
                  type="button"
                  title="Center view on landmark"
                  onClick={() => centerOnLandmark(selected.code)}
                  className="h-7 w-7 flex items-center justify-center rounded-lg border border-border/50 text-muted-foreground hover:text-primary hover:border-primary/40 transition-all"
                >
                  <Crosshair className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            {selected ? (
              <div className="space-y-3 animate-in fade-in duration-200">
                <div className="grid grid-cols-2 gap-2">
                  <Field label="X (px)">
                    <TextInput type="number" value={Math.round(selected.x)}
                      onChange={v => updateLandmark(selected.code, { x:Number(v) })} />
                  </Field>
                  <Field label="Y (px)">
                    <TextInput type="number" value={Math.round(selected.y)}
                      onChange={v => updateLandmark(selected.code, { y:Number(v) })} />
                  </Field>
                </div>
                {pixPerMm && (
                  <div className="grid grid-cols-2 gap-2">
                    <div className="rounded-xl border border-border/40 bg-muted/20 p-2.5 text-center">
                      <p className="text-[10px] font-bold uppercase text-muted-foreground tracking-widest mb-1">X (mm)</p>
                      <p className="text-sm font-bold">{(selected.x/pixPerMm).toFixed(1)}</p>
                    </div>
                    <div className="rounded-xl border border-border/40 bg-muted/20 p-2.5 text-center">
                      <p className="text-[10px] font-bold uppercase text-muted-foreground tracking-widest mb-1">Y (mm)</p>
                      <p className="text-sm font-bold">{(selected.y/pixPerMm).toFixed(1)}</p>
                    </div>
                  </div>
                )}
                <div className="rounded-xl border border-border/40 bg-muted/20 p-3">
                  <div className="flex justify-between mb-2">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">AI Confidence</p>
                    <span className={cn("text-sm font-bold",
                      selected.confidence>=0.85?"text-success":selected.confidence>=0.7?"text-primary":"text-warning"
                    )}>{Math.round(selected.confidence*100)}%</span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                    <div className={cn("h-full transition-all duration-500",
                      selected.confidence>=0.85?"bg-success":selected.confidence>=0.7?"bg-primary":"bg-warning"
                    )} style={{ width:`${selected.confidence*100}%` }} />
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {selected.adjusted && <Pill tone="accent" size="xs">Manually adjusted</Pill>}
                  {selected.confidence < 0.7 && <Pill tone="warning" size="xs">Low confidence</Pill>}
                </div>
                <p className="text-[10px] text-muted-foreground/40">
                  Arrows ±1px · Shift+arrows ±5px · Right-click for more
                </p>
              </div>
            ) : (
              <div className="py-5 text-center border border-dashed border-border/60 rounded-2xl bg-muted/10">
                <p className="text-xs text-muted-foreground italic">Click a landmark in the viewer or inventory</p>
              </div>
            )}
          </Card>

          {/* Tabbed controls */}
          <Card noPadding className="overflow-hidden">
            <div className="flex border-b border-border/40 overflow-x-auto">
              {(["controls","planes","calibrate","measures"] as const).map(tab => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setActiveTab(tab)}
                  className={cn(
                    "flex-1 py-2.5 text-[9px] font-bold uppercase tracking-widest whitespace-nowrap px-2 transition-all",
                    activeTab === tab
                      ? "border-b-2 border-primary text-primary bg-primary/5"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/20"
                  )}
                >
                  {tab === "controls" ? "Image" : tab === "planes" ? "Planes" : tab === "calibrate" ? "Calib." : "Measures"}
                  {tab === "measures" && measurements.length > 0 && (
                    <span className="ml-1 inline-flex h-3.5 w-3.5 items-center justify-center rounded-full bg-primary/20 text-primary text-[8px] font-bold">
                      {measurements.length}
                    </span>
                  )}
                </button>
              ))}
            </div>

            <div className="p-4">
              {/* ── Image Controls ── */}
              {activeTab === "controls" && (
                <div className="space-y-5">
                  {/* Presets */}
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2">Presets</p>
                    <div className="flex flex-wrap gap-1.5">
                      {IMAGE_PRESETS.map(p => (
                        <button
                          key={p.label}
                          type="button"
                          onClick={() => setFilters(p.filters)}
                          className="px-2.5 py-1 rounded-lg border border-border/50 bg-muted/20 text-[10px] font-bold hover:border-primary/40 hover:text-primary transition-all"
                        >
                          {p.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <Divider className="opacity-40" />

                  {/* Sliders */}
                  <div className="space-y-3">
                    {[
                      { key:"brightness" as const, label:"Brightness", icon:Sun,      min:20, max:220 },
                      { key:"contrast"   as const, label:"Contrast",   icon:Contrast, min:20, max:220 },
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

                    {/* Gamma */}
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-[10px] font-bold uppercase text-muted-foreground">
                        <span className="flex items-center gap-1"><Sliders className="h-3 w-3"/>Gamma</span>
                        <span className="text-foreground tabular-nums">{filters.gamma.toFixed(2)}</span>
                      </div>
                      <input
                        type="range" min={40} max={200} step={5}
                        value={Math.round(filters.gamma * 100)}
                        onChange={e => setFilters(fv => ({...fv, gamma:Number(e.target.value)/100}))}
                        className="w-full h-1.5 rounded-full bg-muted appearance-none accent-primary cursor-pointer"
                      />
                    </div>
                  </div>

                  <Divider className="opacity-40" />

                  {/* Toggles */}
                  <div className="space-y-2">
                    {[
                      { key:"invert"  as const, label:"Invert (Negative)",    icon:FlipHorizontal },
                      { key:"sharpen" as const, label:"Edge Sharpen",          icon:Zap            },
                    ].map(t => (
                      <div key={t.key} className="flex items-center justify-between">
                        <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
                          <t.icon className="h-3 w-3"/>{t.label}
                        </span>
                        <Switch checked={filters[t.key] as boolean} onChange={v => setFilters(f => ({...f, [t.key]:v}))} />
                      </div>
                    ))}
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
                        <FlipHorizontal className="h-3 w-3"/>Flip Horizontal
                      </span>
                      <Switch checked={flipH} onChange={setFlipH} />
                    </div>
                  </div>

                  <Divider className="opacity-40" />

                  {/* Layers */}
                  <div className="space-y-1.5">
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
                        onClick={() => setLayers(l => ({...l, [key]:!l[key as keyof typeof l]}))}
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

                  <button
                    type="button"
                    onClick={() => setFilters({ brightness:100, contrast:110, gamma:1.0, invert:false, sharpen:false })}
                    className="text-[10px] font-bold text-primary/50 hover:text-primary transition-colors"
                  >
                    ↺ Reset image to defaults
                  </button>
                </div>
              )}

              {/* ── Planes ── */}
              {activeTab === "planes" && (
                <div className="space-y-1">
                  {(["skeletal","vertical","dental","soft"] as const).map(grp => {
                    const planes = TRACING_PLANES.filter(p => p.group === grp);
                    return (
                      <div key={grp}>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1.5 px-1">{grp}</p>
                        {planes.map(plane => (
                          <button
                            key={plane.key}
                            type="button"
                            onClick={() => setPlaneVis(pv => ({...pv, [plane.key]:!pv[plane.key]}))}
                            className={cn(
                              "flex items-center justify-between w-full px-3 py-2 rounded-xl border text-xs transition-all mb-1",
                              planeVis[plane.key] ? "border-transparent bg-muted/10" : "border-border/40 opacity-40"
                            )}
                          >
                            <div className="flex items-center gap-2">
                              <div
                                className="h-3 w-3 rounded-full shrink-0"
                                style={{
                                  background: planeVis[plane.key] ? plane.color : "transparent",
                                  border: `1.5px solid ${plane.color}`,
                                }}
                              />
                              <span className="font-bold" style={{ color: planeVis[plane.key] ? plane.color : undefined }}>
                                {plane.label}
                              </span>
                              {plane.dashed && <span className="text-[9px] text-muted-foreground/50">dashed</span>}
                            </div>
                            <span className="text-[9px] text-muted-foreground/40 font-mono">{plane.from}–{plane.to}</span>
                          </button>
                        ))}
                        <div className="h-px bg-border/30 mb-3 mt-1" />
                      </div>
                    );
                  })}
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setPlaneVis(Object.fromEntries(TRACING_PLANES.map(p=>[p.key,true])))}
                      className="text-[10px] font-bold text-primary/60 hover:text-primary transition-colors"
                    >Show all</button>
                    <span className="text-muted-foreground/30">·</span>
                    <button
                      type="button"
                      onClick={() => setPlaneVis(Object.fromEntries(TRACING_PLANES.map(p=>[p.key,false])))}
                      className="text-[10px] font-bold text-muted-foreground/50 hover:text-foreground transition-colors"
                    >Hide all</button>
                  </div>
                </div>
              )}

              {/* ── Calibration ── */}
              {activeTab === "calibrate" && (
                <div className="space-y-4">
                  <div className={cn(
                    "flex items-center gap-3 p-3 rounded-xl border transition-all",
                    calibrated ? "border-success/30 bg-success/5" : "border-warning/30 bg-warning/5"
                  )}>
                    {calibrated
                      ? <CheckCircle2 className="h-5 w-5 text-success shrink-0" />
                      : <AlertTriangle className="h-5 w-5 text-warning shrink-0" />}
                    <div>
                      <p className="text-xs font-bold">{calibrated ? "Image calibrated" : "Calibration required"}</p>
                      {pixPerMm && (
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          {pixPerMm.toFixed(2)} px/mm · {(1/pixPerMm).toFixed(3)} mm/px
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="rounded-xl border border-border/40 bg-muted/20 p-3 text-xs text-muted-foreground leading-relaxed space-y-1.5">
                    <p className="font-bold text-foreground text-[10px] uppercase tracking-widest">Protocol</p>
                    <ol className="list-decimal list-inside space-y-1 text-[10px]">
                      <li>Activate <strong className="text-warning">Calibrate</strong> tool (C key)</li>
                      <li>Click two known reference points on the radiograph</li>
                      <li>Points are draggable — reposition as needed</li>
                      <li>Enter true distance in mm and save</li>
                    </ol>
                  </div>

                  <Field label="Reference Distance (mm)">
                    <TextInput type="number" value={distMm} onChange={setDistMm} min={1} placeholder="e.g. 100" />
                  </Field>

                  <div className="grid grid-cols-3 gap-2">
                    {[0,1,"dist"].map((k,i) => {
                      const isRef = typeof k === "number";
                      const active = isRef ? calibPts.length > k : calibPts.length === 2;
                      return (
                        <div key={i} className={cn(
                          "flex flex-col items-center justify-center rounded-xl border p-2.5 transition-all",
                          active ? "border-warning/40 bg-warning/8" : "border-border/40 bg-muted/10"
                        )}>
                          <div className={cn("h-2 w-2 rounded-full mb-1",
                            active ? (i===2 ? "bg-success animate-pulse" : "bg-warning") : "bg-muted-foreground/30"
                          )} />
                          <span className="text-[9px] font-bold text-muted-foreground">
                            {i < 2 ? `Ref ${i+1}` : (calibPts.length===2 ? `${dist(calibPts[0],calibPts[1]).toFixed(0)} px` : "Dist")}
                          </span>
                          {isRef && calibPts[k] && (
                            <span className="text-[8px] text-muted-foreground/50 font-mono mt-0.5">
                              {Math.round(calibPts[k].x)},{Math.round(calibPts[k].y)}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {calibPts.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setCalibPts([])}
                      className="text-[10px] font-bold text-destructive/60 hover:text-destructive transition-colors"
                    >
                      ✕ Clear reference points
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
                    Save Spatial Calibration
                  </button>
                </div>
              )}

              {/* ── Measurements ── */}
              {activeTab === "measures" && (
                <div className="space-y-3">
                  {measurements.length === 0 ? (
                    <div className="py-8 text-center border border-dashed border-border/60 rounded-2xl bg-muted/10">
                      <ListChecks className="h-8 w-8 text-muted-foreground/20 mx-auto mb-2" />
                      <p className="text-xs text-muted-foreground italic">
                        Use the Ruler (R) or Angle (A) tools to record measurements
                      </p>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center justify-between">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                          {measurements.length} recorded
                        </p>
                        <button
                          type="button"
                          onClick={() => setMeasurements([])}
                          className="text-[10px] font-bold text-destructive/50 hover:text-destructive transition-colors flex items-center gap-1"
                        >
                          <Trash2 className="h-3 w-3" /> Clear all
                        </button>
                      </div>
                      <div className="space-y-1.5">
                        {measurements.map(m => (
                          <div
                            key={m.id}
                            className="flex items-center justify-between p-3 rounded-xl border border-border/40 bg-muted/10"
                          >
                            <div className="flex items-center gap-2.5">
                              <div className={cn(
                                "flex h-7 w-7 items-center justify-center rounded-lg border text-[10px] font-bold shrink-0",
                                m.kind === "distance"
                                  ? "border-blue-500/30 bg-blue-500/10 text-blue-400"
                                  : "border-purple-500/30 bg-purple-500/10 text-purple-400"
                              )}>
                                {m.kind === "distance" ? <Ruler className="h-3 w-3" /> : <Triangle className="h-3 w-3" />}
                              </div>
                              <div>
                                <p className="text-sm font-bold tabular-nums">{m.value.toFixed(1)} {m.unit}</p>
                                <p className="text-[9px] text-muted-foreground font-mono">{m.at}</p>
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => setMeasurements(prev => prev.filter(x => x.id !== m.id))}
                              className="h-6 w-6 flex items-center justify-center rounded-lg text-muted-foreground/40 hover:text-destructive hover:bg-destructive/10 transition-all"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          </Card>

          {/* AI Overlays */}
          {overlays.length > 0 && (
            <Card>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">AI Overlays</h3>
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

      {/* Proceed */}
      <div className="flex justify-end">
        <SecondaryBtn onClick={() => navigate("/results")} icon={BarChart3} className="h-12 px-8">
          Analysis Results <ChevronRight className="h-4 w-4 ml-1" />
        </SecondaryBtn>
      </div>

      {/* Context Menu */}
      {ctxMenu && (
        <div
          className="fixed z-[200] rounded-2xl border border-border/60 bg-popover/98 backdrop-blur-sm shadow-2xl overflow-hidden py-1.5 min-w-[200px] animate-in fade-in zoom-in-95 duration-100"
          style={{ left: ctxMenu.screenX + 4, top: ctxMenu.screenY + 4 }}
          onPointerDown={e => e.stopPropagation()}
        >
          {[
            { icon:Crosshair, label:"Select Landmark",      action:() => { setSelectedCode(ctxMenu.code); } },
            { icon:Copy,      label:"Copy Coordinates",     action:() => copyLandmarkCoords(ctxMenu.code)   },
            { icon:MousePointer2, label:"Center View Here", action:() => centerOnLandmark(ctxMenu.code)     },
          ].map(item => (
            <button
              key={item.label}
              type="button"
              onClick={() => { item.action(); setCtxMenu(null); }}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-muted/40 transition-colors text-left"
            >
              <item.icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              {item.label}
            </button>
          ))}
          {landmarks.find(l=>l.code===ctxMenu.code)?.adjusted && (
            <>
              <div className="h-px bg-border/40 mx-3 my-1" />
              <button
                type="button"
                onClick={() => { clearAdjusted(ctxMenu.code); setCtxMenu(null); }}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-muted/40 transition-colors text-left text-muted-foreground"
              >
                <RotateCcw className="h-3.5 w-3.5 shrink-0" /> Clear Adjustment Flag
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ─── LandmarkChip ─────────────────────────────────────────────────────────────

function LandmarkChip({ landmark:lm, selected, hovered, color, onClick }: {
  landmark: Landmark; selected: boolean; hovered?: boolean; color?: string; onClick: () => void;
}) {
  const conf = lm.confidence>=0.85?"#4ade80":lm.confidence>=0.7?"#60a5fa":"#f59e0b";
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center justify-between gap-1 p-2 rounded-xl border transition-all text-left",
        selected ? "border-primary/40 bg-primary/10 ring-2 ring-primary/10"
        : hovered ? "border-primary/20 bg-muted/30"
        : "border-border/50 bg-muted/10 hover:border-primary/20 hover:bg-muted/20"
      )}
    >
      <div className="min-w-0">
        <p className="text-[10px] font-bold uppercase tracking-widest truncate" style={selected&&color?{color}:undefined}>
          {lm.code}
        </p>
        {lm.adjusted && <div className="h-0.5 w-3 bg-primary/60 rounded-full mt-0.5" />}
      </div>
      <div className="h-1.5 w-1.5 rounded-full shrink-0" style={{ background:conf }} />
    </button>
  );
}

// ─── CephCanvas ───────────────────────────────────────────────────────────────

interface CephCanvasProps {
  svgRef: React.RefObject<SVGSVGElement | null>;
  imageUrl?: string;
  landmarks: Landmark[];
  setLandmarks: (l: Landmark[]) => void;
  pushUndo: () => void;
  selectedCode: string|null;
  hoveredCode: string|null;
  tool: ToolMode; setTool: (t:ToolMode)=>void;
  onSelect: (code:string|null)=>void;
  onHover: (code:string|null)=>void;
  layers: Record<string,boolean>;
  planeVis: Record<string,boolean>;
  filters: ImageFilters;
  calibPts: Point[]; setCalibPts: (pts:Point[])=>void;
  locked: boolean;
  pixPerMm: number|null;
  rulerPts: Point[];   setRulerPts: (pts:Point[])=>void;
  anglePts: Point[];   setAnglePts: (pts:Point[])=>void;
  alwaysLabels: boolean;
  flipH: boolean;
  centerTarget: Point|null;
  onCenterConsumed: ()=>void;
  onAddMeasurement: (m:Omit<SavedMeasurement,"id"|"at">)=>void;
  onContextMenu: (code:string,x:number,y:number)=>void;
  onFullscreen: ()=>void;
  fullscreen: boolean;
}

function CephCanvas({
  svgRef, imageUrl, landmarks, setLandmarks, pushUndo,
  selectedCode, hoveredCode, tool, setTool,
  onSelect, onHover, layers, planeVis, filters,
  calibPts, setCalibPts, locked, pixPerMm,
  rulerPts, setRulerPts, anglePts, setAnglePts,
  alwaysLabels, flipH, centerTarget, onCenterConsumed,
  onAddMeasurement, onContextMenu, onFullscreen, fullscreen,
}: CephCanvasProps) {
  const [zoom, setZoom]         = useState(1);
  const [pan, setPan]           = useState<Point>({x:0,y:0});
  const [isPanning, setIsPanning] = useState(false);
  const [lastPanPt, setLastPanPt] = useState<Point|null>(null);
  const [draggingCode, setDraggingCode] = useState<string|null>(null);
  const [dragOrigin, setDragOrigin]     = useState<Point|null>(null);
  const [draggingCalibIdx, setDraggingCalibIdx] = useState<number|null>(null);
  const [cursorPt, setCursorPt] = useState<Point|null>(null);
  const [snapCode, setSnapCode] = useState<string|null>(null);
  const [liveRuler, setLiveRuler] = useState<Point|null>(null);
  const [liveAngle, setLiveAngle] = useState<Point|null>(null);

  // Center view when requested
  useEffect(() => {
    if (!centerTarget) return;
    setPan({ x: 500 - centerTarget.x * zoom, y: 360 - centerTarget.y * zoom });
    if (zoom < 2) {
      const nz = 2.5;
      setPan({ x: 500 - centerTarget.x * nz, y: 360 - centerTarget.y * nz });
      setZoom(nz);
    }
    onCenterConsumed();
  }, [centerTarget]);

  function svgPt(e: React.PointerEvent | React.WheelEvent): Point {
    const svg = svgRef.current; if (!svg) return {x:0,y:0};
    const r = svg.getBoundingClientRect();
    const cx = ('clientX' in e ? e.clientX : 0), cy = ('clientY' in e ? e.clientY : 0);
    const vx = ((cx - r.left) / r.width) * 1000;
    const vy = ((cy - r.top) / r.height) * 720;
    return {
      x: Math.max(0,Math.min(1000,(vx-pan.x)/zoom)),
      y: Math.max(0,Math.min(720,(vy-pan.y)/zoom)),
    };
  }

  function vpPt(e: React.PointerEvent | React.WheelEvent): Point {
    const svg = svgRef.current; if (!svg) return {x:0,y:0};
    const r = svg.getBoundingClientRect();
    const cx = ('clientX' in e ? e.clientX : 0), cy = ('clientY' in e ? e.clientY : 0);
    return { x: ((cx-r.left)/r.width)*1000, y: ((cy-r.top)/r.height)*720 };
  }

  function nearestLandmark(pt: Point, threshSvg: number): Landmark|null {
    if (!["ruler","angle","calibrate"].includes(tool)) return null;
    let best: Landmark|null = null, bDist = threshSvg;
    for (const lm of landmarks) {
      const d = dist(pt, lm);
      if (d < bDist) { bDist = d; best = lm; }
    }
    return best;
  }

  function handleWheel(e: React.WheelEvent) {
    e.preventDefault();
    const vp = vpPt(e);
    const factor = e.deltaY < 0 ? 1.15 : 1/1.15;
    const nz = Math.max(1, Math.min(8, zoom * factor));
    setPan({ x: vp.x-(vp.x-pan.x)*nz/zoom, y: vp.y-(vp.y-pan.y)*nz/zoom });
    setZoom(nz);
  }

  function handlePointerDown(e: React.PointerEvent) {
    const activePan = tool==="pan" || e.altKey || e.button===1;
    if (activePan) { setIsPanning(true); setLastPanPt({x:e.clientX,y:e.clientY}); return; }
    if (locked && tool==="select") return;

    const raw = svgPt(e);
    const snap = nearestLandmark(raw, 20/zoom);
    const pt = snap ? {x:snap.x, y:snap.y} : raw;

    if (tool === "calibrate") {
      setCalibPts(calibPts.length >= 2 ? [pt] : [...calibPts, pt]);
      if (calibPts.length === 1) toast.info("Two reference points set. Enter distance and save.");
      return;
    }
    if (tool === "ruler") {
      const next = rulerPts.length >= 2 ? [pt] : [...rulerPts, pt];
      setRulerPts(next);
      if (next.length === 2) {
        const d = dist(next[0], next[1]);
        const mm = pixPerMm ? d/pixPerMm : null;
        onAddMeasurement({ kind:"distance", value:mm??d, unit:mm?"mm":"px", pts:next });
      }
      return;
    }
    if (tool === "angle") {
      const next = anglePts.length >= 3 ? [pt] : [...anglePts, pt];
      setAnglePts(next);
      if (next.length === 3) {
        const deg = angleDeg(next[1], next[0], next[2]);
        onAddMeasurement({ kind:"angle", value:deg, unit:"°", pts:next });
      }
      return;
    }
    if (tool === "select") { onSelect(null); }
  }

  function handlePointerMove(e: React.PointerEvent) {
    const raw = svgPt(e);
    setCursorPt(raw);

    // Snap detection
    const snap = nearestLandmark(raw, 20/zoom);
    setSnapCode(snap?.code ?? null);

    if (isPanning && lastPanPt) {
      const svg = svgRef.current; if (!svg) return;
      const r = svg.getBoundingClientRect();
      const dx = (e.clientX-lastPanPt.x)/r.width*1000;
      const dy = (e.clientY-lastPanPt.y)/r.height*720;
      setPan(p => ({x:p.x+dx, y:p.y+dy}));
      setLastPanPt({x:e.clientX,y:e.clientY});
      return;
    }

    // Drag calibration point
    if (draggingCalibIdx !== null) {
      const updated = calibPts.map((p,i) => i===draggingCalibIdx ? raw : p);
      setCalibPts(updated);
      return;
    }

    // Drag landmark — immediate, no modal
    if (draggingCode && !locked) {
      setLandmarks(landmarks.map(l => l.code===draggingCode ? {...l, x:raw.x, y:raw.y, adjusted:true} : l));
      return;
    }

    if (tool==="ruler" && rulerPts.length===1) setLiveRuler(raw);
    if (tool==="angle" && (anglePts.length===1||anglePts.length===2)) setLiveAngle(raw);
  }

  function handlePointerUp(e: React.PointerEvent) {
    if (draggingCode && dragOrigin) {
      const lm = landmarks.find(l => l.code===draggingCode);
      if (lm && dist(dragOrigin, {x:lm.x, y:lm.y}) > 2) {
        toast.success(`${draggingCode} adjusted`, { description:"Position updated · Ctrl+Z to undo" });
      }
    }
    setDraggingCode(null); setDragOrigin(null);
    setDraggingCalibIdx(null);
    setIsPanning(false); setLastPanPt(null);
  }

  const byCode = useMemo(() => Object.fromEntries(landmarks.map(l=>[l.code,l])), [landmarks]);

  const activePlanes = useMemo(() => TRACING_PLANES.filter(p => {
    if (!layers.planes || !planeVis[p.key]) return false;
    if (p.group==="soft" && !layers.softTissue) return false;
    return byCode[p.from] && byCode[p.to];
  }), [byCode, layers, planeVis]);

  const cssFilter = [
    `brightness(${filters.brightness}%)`,
    `contrast(${filters.contrast}%)`,
    filters.invert ? "invert(100%)" : "",
  ].filter(Boolean).join(" ");

  const activeTool = TOOLS.find(t=>t.mode===tool);

  return (
    <div className="relative">
      <Card noPadding className="relative overflow-hidden bg-[#07070e] border-border/20 shadow-2xl group/viewer">

        {/* ── Defs for SVG filters ── */}
        <svg width="0" height="0" className="absolute">
          <defs>
            <filter id="ceph-gamma">
              <feComponentTransfer>
                <feFuncR type="gamma" amplitude="1" exponent={1/filters.gamma} offset="0" />
                <feFuncG type="gamma" amplitude="1" exponent={1/filters.gamma} offset="0" />
                <feFuncB type="gamma" amplitude="1" exponent={1/filters.gamma} offset="0" />
              </feComponentTransfer>
            </filter>
            <filter id="ceph-sharpen">
              <feConvolveMatrix order="3" kernelMatrix="0 -0.6 0 -0.6 3.4 -0.6 0 -0.6 0" preserveAlpha="true" />
            </filter>
            <filter id="ceph-sharpen-gamma">
              <feComponentTransfer result="g">
                <feFuncR type="gamma" amplitude="1" exponent={1/filters.gamma} offset="0" />
                <feFuncG type="gamma" amplitude="1" exponent={1/filters.gamma} offset="0" />
                <feFuncB type="gamma" amplitude="1" exponent={1/filters.gamma} offset="0" />
              </feComponentTransfer>
              <feConvolveMatrix in="g" order="3" kernelMatrix="0 -0.6 0 -0.6 3.4 -0.6 0 -0.6 0" preserveAlpha="true" />
            </filter>
          </defs>
        </svg>

        {/* ── Tool Palette ── */}
        <div className="absolute left-3 top-1/2 -translate-y-1/2 z-20 flex flex-col">
          <div className="flex flex-col rounded-2xl border border-white/10 bg-black/88 backdrop-blur-md p-1.5 shadow-2xl gap-0.5">
            {TOOLS.map(t => (
              <button
                key={t.mode}
                type="button"
                onClick={() => setTool(t.mode)}
                title={`${t.label} (${t.shortcut})`}
                className={cn(
                  "flex flex-col h-10 w-10 items-center justify-center rounded-xl gap-0.5 transition-all",
                  tool===t.mode
                    ? "bg-primary text-primary-foreground shadow-lg shadow-primary/30"
                    : "text-white/40 hover:bg-white/10 hover:text-white"
                )}
              >
                <t.icon className="h-3.5 w-3.5" />
                <span className="text-[7px] font-bold opacity-60">{t.shortcut}</span>
              </button>
            ))}
            <div className="h-px bg-white/10 my-0.5 mx-1" />
            <button
              type="button"
              onClick={() => { setZoom(1); setPan({x:0,y:0}); }}
              title="Fit (F)"
              className="flex h-8 w-10 items-center justify-center text-[8px] font-bold text-white/25 hover:text-white hover:bg-white/10 rounded-xl transition-all"
            >FIT</button>
          </div>
        </div>

        {/* ── Top bar ── */}
        <div className="absolute top-0 inset-x-0 z-10 flex items-center justify-between px-4 py-2 bg-gradient-to-b from-black/85 to-transparent pointer-events-none">
          <div className="flex items-center gap-2 pointer-events-auto">
            <div className={cn(
              "flex items-center gap-2 px-3 py-1.5 rounded-full backdrop-blur border shadow-lg text-[9px] font-bold uppercase tracking-widest",
              tool==="calibrate" ? "bg-warning/25 border-warning/50 text-warning"
              : tool==="ruler"||tool==="angle" ? "bg-primary/25 border-primary/50 text-primary"
              : "bg-black/60 border-white/10 text-white/80"
            )}>
              <div className={cn("h-1.5 w-1.5 rounded-full",
                tool==="calibrate"?"bg-warning animate-pulse":
                tool==="ruler"||tool==="angle"?"bg-primary animate-pulse":"bg-emerald-400"
              )} />
              {activeTool?.label}
            </div>
            {zoom > 1 && (
              <div className="flex items-center gap-1 px-2.5 py-1.5 rounded-full bg-primary/20 backdrop-blur border border-primary/40 text-[9px] font-bold text-primary">
                <ZoomIn className="h-2.5 w-2.5" />{Math.round(zoom*100)}%
              </div>
            )}
          </div>
          <div className="flex items-center gap-2 pointer-events-auto">
            {selectedCode && (
              <div className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-black/60 border border-white/10">
                <span className="text-[8px] text-white/35 font-bold uppercase">Active:</span>
                <span className="text-xs font-bold text-primary">{selectedCode}</span>
              </div>
            )}
            <button
              type="button"
              onClick={onFullscreen}
              className="flex h-8 w-8 items-center justify-center rounded-xl bg-black/60 border border-white/10 text-white/40 hover:text-white transition-colors"
            >
              {fullscreen ? <Minimize2 className="h-3.5 w-3.5"/> : <Maximize2 className="h-3.5 w-3.5"/>}
            </button>
          </div>
        </div>

        {/* ── Main SVG ── */}
        <div className="aspect-[1000/720] min-h-[520px]">
          <svg
            ref={svgRef}
            viewBox="0 0 1000 720"
            className={cn(
              "h-full w-full touch-none select-none",
              isPanning || tool==="pan" ? "cursor-grab" : "cursor-crosshair"
            )}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerUp}
            onWheel={handleWheel}
          >
            <rect width="1000" height="720" fill="#070710" />

            <g transform={`translate(${pan.x},${pan.y}) scale(${zoom})`}>

              {/* Image */}
              {imageUrl ? (
                <g filter={
                  filters.sharpen && filters.gamma!==1 ? "url(#ceph-sharpen-gamma)" :
                  filters.sharpen ? "url(#ceph-sharpen)" :
                  filters.gamma!==1 ? "url(#ceph-gamma)" : undefined
                }>
                  <image
                    href={imageUrl} x="0" y="0" width="1000" height="720"
                    preserveAspectRatio="xMidYMid meet"
                    style={{ filter: cssFilter }}
                    transform={flipH ? "translate(1000,0) scale(-1,1)" : undefined}
                  />
                </g>
              ) : (
                <g>
                  <rect x="150" y="200" width="700" height="320" rx="24"
                    fill="rgba(255,255,255,0.015)" stroke="rgba(255,255,255,0.06)" strokeDasharray="14 8" />
                  <text x="500" y="350" fill="rgba(255,255,255,0.22)" fontSize="20"
                    fontWeight="bold" textAnchor="middle" fontFamily="system-ui">Cephalometric Image</text>
                  <text x="500" y="385" fill="rgba(255,255,255,0.1)" fontSize="13"
                    textAnchor="middle" fontFamily="system-ui">Upload X-ray · Run AI · View results</text>
                </g>
              )}

              {/* Grid */}
              {layers.grid && (
                <g opacity="0.09">
                  {Array.from({length:11}).map((_,i) => (
                    <line key={`v${i}`} x1={i*100} y1="0" x2={i*100} y2="720" stroke="#60a5fa" strokeWidth="0.5"/>
                  ))}
                  {Array.from({length:8}).map((_,i) => (
                    <line key={`h${i}`} x1="0" y1={(i+1)*90} x2="1000" y2={(i+1)*90} stroke="#60a5fa" strokeWidth="0.5"/>
                  ))}
                  <text x="6" y="12" fill="rgba(96,165,250,0.3)" fontSize="7" fontFamily="system-ui">100 px grid</text>
                </g>
              )}

              {/* Tracing Planes */}
              {activePlanes.map(plane => {
                const p1=byCode[plane.from], p2=byCode[plane.to];
                if (!p1||!p2) return null;
                const [e1,e2] = extendedLine(p1, p2, 70);
                const midX=(e1.x+e2.x)/2, midY=(e1.y+e2.y)/2-14;
                const lw = plane.label.length*6+8;
                return (
                  <g key={plane.key} className="animate-in fade-in duration-500">
                    <line x1={e1.x} y1={e1.y} x2={e2.x} y2={e2.y}
                      stroke={plane.color} strokeOpacity="0.08" strokeWidth="10"/>
                    <line x1={e1.x} y1={e1.y} x2={e2.x} y2={e2.y}
                      stroke={plane.color} strokeOpacity="0.65" strokeWidth="1.5"
                      strokeDasharray={plane.dashed?"8 5":undefined}/>
                    <g transform={`translate(${midX},${midY})`}>
                      <rect x="-2" y="-9" width={lw} height="13" rx="4" fill="rgba(0,0,0,0.75)"/>
                      <text x={lw/2-2} y="1" fill={plane.color} fontSize="9" fontWeight="bold"
                        textAnchor="middle" fontFamily="system-ui">{plane.label}</text>
                    </g>
                  </g>
                );
              })}

              {/* Soft tissue profile */}
              {layers.softTissue && byCode.N_st && byCode.Prn && byCode.Ls && byCode.Li && byCode.Pog_st && (
                <path
                  d={`M ${byCode.N_st.x} ${byCode.N_st.y}
                      C ${byCode.Prn.x+50} ${byCode.N_st.y+70}, ${byCode.Prn.x+35} ${byCode.Prn.y-25}, ${byCode.Prn.x} ${byCode.Prn.y}
                      C ${byCode.Prn.x-12} ${byCode.Prn.y+35}, ${byCode.Ls.x+25} ${byCode.Ls.y-20}, ${byCode.Ls.x} ${byCode.Ls.y}
                      C ${byCode.Ls.x-10} ${byCode.Ls.y+20}, ${byCode.Li.x+10} ${byCode.Li.y-15}, ${byCode.Li.x} ${byCode.Li.y}
                      C ${byCode.Li.x-10} ${byCode.Li.y+25}, ${byCode.Pog_st.x+20} ${byCode.Pog_st.y-25}, ${byCode.Pog_st.x} ${byCode.Pog_st.y}`}
                  fill="none" stroke="#fb7185" strokeOpacity="0.5" strokeWidth="2.5" strokeLinecap="round"/>
              )}

              {/* Landmarks */}
              {layers.landmarks && landmarks.map(lm => {
                const sel = lm.code===selectedCode;
                const hov = lm.code===hoveredCode;
                const snap = lm.code===snapCode;
                const gc = getGroupColor(lm.code);
                const cc = lm.confidence>=0.85?"#4ade80":lm.confidence>=0.7?"#60a5fa":"#f59e0b";
                const dc = sel ? gc : cc;
                const r  = sel ? 6 : hov ? 5 : 4;

                return (
                  <g
                    key={lm.code}
                    onPointerDown={e => {
                      e.stopPropagation();
                      if (tool==="select" && !locked) {
                        pushUndo();
                        setDraggingCode(lm.code);
                        setDragOrigin({x:lm.x, y:lm.y});
                        onSelect(lm.code);
                      }
                    }}
                    onPointerEnter={() => onHover(lm.code)}
                    onPointerLeave={() => onHover(null)}
                    onContextMenu={e => { e.preventDefault(); e.stopPropagation(); onContextMenu(lm.code, e.clientX, e.clientY); }}
                    className={tool==="select"&&!locked?"cursor-move":"cursor-pointer"}
                  >
                    {/* Snap indicator */}
                    {snap && !sel && (
                      <circle cx={lm.x} cy={lm.y} r="18" fill="none"
                        stroke="#fff" strokeOpacity="0.5" strokeWidth="1.5"
                        strokeDasharray="4 3" className="animate-pulse"/>
                    )}
                    {/* Selection rings */}
                    {sel && <>
                      <circle cx={lm.x} cy={lm.y} r="32" fill="none"
                        stroke={gc} strokeOpacity="0.1" strokeWidth="1.5" className="animate-pulse"/>
                      <circle cx={lm.x} cy={lm.y} r="22" fill="none"
                        stroke={gc} strokeOpacity="0.35" strokeWidth="1.5" strokeDasharray="5 3"/>
                    </>}
                    {/* Hover ring */}
                    {hov && !sel && (
                      <circle cx={lm.x} cy={lm.y} r="16" fill="none"
                        stroke={dc} strokeOpacity="0.3" strokeWidth="1"/>
                    )}
                    {/* Crosshair */}
                    {[[-14,0,-4,0],[4,0,14,0],[0,-14,0,-4],[0,4,0,14]].map(([x1,y1,x2,y2],i) => (
                      <line key={i}
                        x1={lm.x+x1} y1={lm.y+y1} x2={lm.x+x2} y2={lm.y+y2}
                        stroke={dc} strokeWidth={sel?2.5:hov?2:1.8} strokeLinecap="round"/>
                    ))}
                    {/* Center */}
                    {lm.confidence < 0.7 ? (
                      <polygon
                        points={`${lm.x},${lm.y-r} ${lm.x+r},${lm.y} ${lm.x},${lm.y+r} ${lm.x-r},${lm.y}`}
                        fill={dc} stroke="#000" strokeWidth="1.2"/>
                    ) : (
                      <circle cx={lm.x} cy={lm.y} r={r} fill={dc} stroke="#000" strokeWidth="1.5"/>
                    )}
                    {/* Adjusted dot */}
                    {lm.adjusted && (
                      <circle cx={lm.x+8} cy={lm.y-8} r="3" fill="#60a5fa" stroke="#000" strokeWidth="1"/>
                    )}
                    {/* Label */}
                    {(alwaysLabels || sel || hov || zoom>=2.5) && (
                      <g transform={`translate(${lm.x+14},${lm.y-24})`}>
                        <rect width={Math.max(28,lm.code.length*6.5+8)} height="17" rx="5"
                          fill="rgba(0,0,0,0.9)" stroke={dc} strokeOpacity="0.5" strokeWidth="0.5"/>
                        <text x={Math.max(14,lm.code.length*3.25+4)} y="12"
                          fill="white" fontSize="9.5" fontWeight="bold" textAnchor="middle" fontFamily="system-ui">
                          {lm.code}
                        </text>
                      </g>
                    )}
                    {/* Hover tooltip */}
                    {hov && !sel && (
                      <g transform={`translate(${lm.x+14},${lm.y+12})`}>
                        <rect width={Math.max(60,lm.name.length*5.2+12)} height="28" rx="5" fill="rgba(0,0,0,0.9)"/>
                        <text x={Math.max(30,(lm.name.length*5.2+12)/2)} y="11"
                          fill="rgba(255,255,255,0.75)" fontSize="8.5" textAnchor="middle" fontFamily="system-ui">{lm.name}</text>
                        <text x={Math.max(30,(lm.name.length*5.2+12)/2)} y="22"
                          fill={cc} fontSize="8" textAnchor="middle" fontFamily="system-ui">{Math.round(lm.confidence*100)}% conf</text>
                      </g>
                    )}
                  </g>
                );
              })}

              {/* Calibration ruler */}
              {calibPts.length >= 1 && (
                <g>
                  {calibPts.map((pt, i) => (
                    <g
                      key={`cal-${i}`}
                      onPointerDown={e => { e.stopPropagation(); setDraggingCalibIdx(i); }}
                      className="cursor-move"
                    >
                      <circle cx={pt.x} cy={pt.y} r="22" fill="rgba(245,158,11,0.06)" stroke="#f59e0b" strokeWidth="0.5" strokeDasharray="3 2"/>
                      <circle cx={pt.x} cy={pt.y} r="11" fill="rgba(245,158,11,0.2)" stroke="#f59e0b" strokeWidth="2"/>
                      <circle cx={pt.x} cy={pt.y} r="3" fill="#f59e0b"/>
                      {[[-13,0,13,0],[0,-13,0,13]].map(([x1,y1,x2,y2],ci) => (
                        <line key={ci} x1={pt.x+x1} y1={pt.y+y1} x2={pt.x+x2} y2={pt.y+y2}
                          stroke="#f59e0b" strokeWidth="1.5" strokeOpacity="0.55"/>
                      ))}
                      <g transform={`translate(${pt.x+22},${pt.y-18})`}>
                        <rect x="-2" y="-9" width="36" height="13" rx="4" fill="rgba(0,0,0,0.88)" stroke="#f59e0b" strokeWidth="0.5"/>
                        <text x="16" y="1" fill="#f59e0b" fontSize="9" fontWeight="bold" textAnchor="middle" fontFamily="system-ui">REF {i+1}</text>
                      </g>
                    </g>
                  ))}
                  {calibPts.length===2&&(()=>{
                    const [p1,p2]=calibPts;
                    const pd = dist(p1,p2);
                    const midX=(p1.x+p2.x)/2, midY=(p1.y+p2.y)/2;
                    const t1=perpTick(p1,p2,12), t2=perpTick(p2,p1,12);
                    const angle=Math.atan2(p2.y-p1.y,p2.x-p1.x);
                    // Tick marks along ruler
                    const numTicks = Math.floor(pd/30);
                    return (
                      <g>
                        <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y}
                          stroke="#f59e0b" strokeWidth="2" strokeDasharray="10 5" strokeOpacity="0.8"/>
                        <line x1={t1.x1} y1={t1.y1} x2={t1.x2} y2={t1.y2} stroke="#f59e0b" strokeWidth="2.5" strokeOpacity="0.9"/>
                        <line x1={t2.x1} y1={t2.y1} x2={t2.x2} y2={t2.y2} stroke="#f59e0b" strokeWidth="2.5" strokeOpacity="0.9"/>
                        {Array.from({length:numTicks-1}).map((_,ti) => {
                          const frac=(ti+1)/numTicks;
                          const tx=p1.x+(p2.x-p1.x)*frac, ty=p1.y+(p2.y-p1.y)*frac;
                          const tp=perpTick({x:tx,y:ty},p2,5);
                          return <line key={ti} x1={tp.x1} y1={tp.y1} x2={tp.x2} y2={tp.y2} stroke="#f59e0b" strokeWidth="1" strokeOpacity="0.5"/>;
                        })}
                        <g transform={`translate(${midX},${midY})`}>
                          <rect x="-40" y="-26" width="80" height="46" rx="9" fill="rgba(0,0,0,0.92)" stroke="#f59e0b" strokeWidth="1.2"/>
                          <text x="0" y="-8" fill="#f59e0b" fontSize="12" fontWeight="bold" textAnchor="middle" fontFamily="system-ui">? mm</text>
                          <text x="0" y="9" fill="rgba(245,158,11,0.55)" fontSize="9" textAnchor="middle" fontFamily="system-ui">{pd.toFixed(0)} px · {angle*(180/Math.PI) < 0 ? (180+angle*(180/Math.PI)).toFixed(0) : (angle*(180/Math.PI)).toFixed(0)}°</text>
                        </g>
                      </g>
                    );
                  })()}
                </g>
              )}

              {/* Ruler tool overlay */}
              {rulerPts.length>0&&(()=>{
                const p1=rulerPts[0], p2=rulerPts[1]??liveRuler;
                if (!p2) return null;
                const pd=dist(p1,p2), mm=pixPerMm?pd/pixPerMm:null;
                const midX=(p1.x+p2.x)/2, midY=(p1.y+p2.y)/2;
                const deg=Math.atan2(p2.y-p1.y,p2.x-p1.x)*(180/Math.PI);
                const t1=perpTick(p1,p2,8), t2=perpTick(p2,p1,8);
                return (
                  <g>
                    <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke="#60a5fa" strokeOpacity="0.12" strokeWidth="8"/>
                    <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y}
                      stroke="#60a5fa" strokeOpacity="0.8" strokeWidth="1.5"
                      strokeDasharray={rulerPts.length===1?"6 4":undefined}/>
                    <line x1={t1.x1} y1={t1.y1} x2={t1.x2} y2={t1.y2} stroke="#60a5fa" strokeWidth="2" strokeOpacity="0.8"/>
                    <line x1={t2.x1} y1={t2.y1} x2={t2.x2} y2={t2.y2} stroke="#60a5fa" strokeWidth="2" strokeOpacity="0.8"/>
                    <circle cx={p1.x} cy={p1.y} r="5" fill="#60a5fa" stroke="#000" strokeWidth="1.5"/>
                    {rulerPts.length===2&&<circle cx={p2.x} cy={p2.y} r="5" fill="#60a5fa" stroke="#000" strokeWidth="1.5"/>}
                    <g transform={`translate(${midX+6},${midY-32})`}>
                      <rect x="-2" y="-12" width={mm?82:60} height="38" rx="8" fill="rgba(0,0,0,0.92)" stroke="#60a5fa" strokeWidth="1"/>
                      <text x={(mm?39:28)} y="2" fill="#60a5fa" fontSize="11.5" fontWeight="bold" textAnchor="middle" fontFamily="system-ui">
                        {mm?`${mm.toFixed(1)} mm`:`${pd.toFixed(0)} px`}
                      </text>
                      <text x={(mm?39:28)} y="17" fill="rgba(96,165,250,0.5)" fontSize="8.5" textAnchor="middle" fontFamily="system-ui">
                        {deg.toFixed(1)}° · {pd.toFixed(0)} px
                      </text>
                    </g>
                  </g>
                );
              })()}

              {/* Angle tool overlay */}
              {anglePts.length>=1&&(()=>{
                const p1=anglePts[0], p2=anglePts[1]??liveAngle;
                if (!p2) return null;
                const p3=anglePts[2]??(anglePts.length===2?liveAngle:null);
                return (
                  <g>
                    <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y}
                      stroke="#a78bfa" strokeOpacity="0.8" strokeWidth="1.5" strokeDasharray={anglePts.length<2?"6 4":undefined}/>
                    {p3&&<>
                      <line x1={p2.x} y1={p2.y} x2={p3.x} y2={p3.y}
                        stroke="#a78bfa" strokeOpacity="0.8" strokeWidth="1.5" strokeDasharray={anglePts.length<3?"6 4":undefined}/>
                      <path d={arcPath(p2,p1,p3,32)}
                        fill="rgba(167,139,250,0.1)" stroke="#a78bfa" strokeOpacity="0.7" strokeWidth="1.5" strokeDasharray="4 3"/>
                      <g transform={`translate(${p2.x+38},${p2.y-16})`}>
                        <rect x="-2" y="-10" width="56" height="22" rx="7" fill="rgba(0,0,0,0.92)" stroke="#a78bfa" strokeWidth="1"/>
                        <text x="26" y="5" fill="#a78bfa" fontSize="12" fontWeight="bold" textAnchor="middle" fontFamily="system-ui">
                          {angleDeg(p2,p1,p3).toFixed(1)}°
                        </text>
                      </g>
                    </>}
                    {[p1,p2,...(p3?[p3]:[])].map((pt,i) => (
                      <circle key={i} cx={pt.x} cy={pt.y} r="5" fill="#a78bfa" stroke="#000" strokeWidth="1.5"/>
                    ))}
                  </g>
                );
              })()}

            </g>{/* end transform */}

            {/* Minimap */}
            {zoom > 1.5 && (
              <g transform="translate(840,558)">
                <rect width="148" height="106" rx="9" fill="rgba(0,0,0,0.85)" stroke="rgba(255,255,255,0.1)" strokeWidth="1"/>
                <text x="8" y="13" fill="rgba(255,255,255,0.25)" fontSize="7" fontFamily="system-ui" fontWeight="bold">MINIMAP</text>
                {landmarks.map(lm => (
                  <circle key={lm.code}
                    cx={8+(lm.x/1000)*132} cy={18+(lm.y/720)*80}
                    r={lm.code===selectedCode?2.5:1.2}
                    fill={getGroupColor(lm.code)} opacity="0.8"/>
                ))}
                <rect
                  x={8+Math.max(0,(-pan.x/zoom/1000)*132)}
                  y={18+Math.max(0,(-pan.y/zoom/720)*80)}
                  width={Math.min(132,(1/zoom)*132)} height={Math.min(80,(1/zoom)*80)}
                  fill="rgba(96,165,250,0.1)" stroke="rgba(96,165,250,0.7)" strokeWidth="1" rx="2"/>
              </g>
            )}
          </svg>
        </div>

        {/* Zoom controls */}
        <div className="absolute right-4 bottom-16 z-10">
          <div className="flex flex-col rounded-xl border border-white/10 bg-black/80 backdrop-blur-md p-1 shadow-2xl">
            <IconBtn icon={ZoomIn} label="Zoom In"
              onClick={() => { const nz=Math.min(8,zoom*1.3); setPan(p=>({x:500-(500-p.x)*nz/zoom,y:360-(360-p.y)*nz/zoom})); setZoom(nz); }}
              variant="ghost" size="sm" className="text-white/60 hover:text-white"/>
            <div className="h-px bg-white/5 mx-1.5"/>
            <IconBtn icon={ZoomOut} label="Zoom Out"
              onClick={() => {
                const nz=Math.max(1,zoom/1.3);
                if (nz===1){setZoom(1);setPan({x:0,y:0});}
                else{setPan(p=>({x:500-(500-p.x)*nz/zoom,y:360-(360-p.y)*nz/zoom}));setZoom(nz);}
              }}
              variant="ghost" size="sm" className="text-white/60 hover:text-white"/>
            <div className="h-px bg-white/5 mx-1.5"/>
            <button type="button" onClick={()=>{setZoom(1);setPan({x:0,y:0});}}
              className="h-8 w-8 flex items-center justify-center text-[8px] font-bold text-white/25 hover:text-white transition-colors">
              1:1
            </button>
          </div>
        </div>

        {/* Permanent status bar */}
        <div className="border-t border-white/5 bg-black/70 px-4 py-1.5 flex items-center justify-between text-[9px] font-mono text-white/30">
          <span className="flex items-center gap-4">
            {cursorPt && (
              <>
                <span>X: <span className="text-white/60">{Math.round(cursorPt.x)}</span></span>
                <span>Y: <span className="text-white/60">{Math.round(cursorPt.y)}</span></span>
                {pixPerMm && (
                  <span className="text-primary/50">
                    {(cursorPt.x/pixPerMm).toFixed(1)} · {(cursorPt.y/pixPerMm).toFixed(1)} mm
                  </span>
                )}
              </>
            )}
          </span>
          <span className="flex items-center gap-3">
            {snapCode && <span className="text-yellow-400/70">⊕ snap: {snapCode}</span>}
            {landmarks.length>0 && <span><span className="text-white/50">{landmarks.length}</span> pts</span>}
            <span>Zoom <span className="text-white/50">{Math.round(zoom*100)}%</span></span>
            <span className="hidden lg:block">
              <kbd className="bg-white/8 px-1 py-0.5 rounded text-[8px]">S</kbd>{" "}
              <kbd className="bg-white/8 px-1 py-0.5 rounded text-[8px]">H</kbd>{" "}
              <kbd className="bg-white/8 px-1 py-0.5 rounded text-[8px]">R</kbd>{" "}
              <kbd className="bg-white/8 px-1 py-0.5 rounded text-[8px]">A</kbd>{" "}
              <kbd className="bg-white/8 px-1 py-0.5 rounded text-[8px]">C</kbd>{" "}
              <kbd className="bg-white/8 px-1 py-0.5 rounded text-[8px]">L</kbd>
            </span>
          </span>
        </div>
      </Card>

      {/* Clear measurement tools */}
      {(rulerPts.length>0||anglePts.length>0) && (
        <div className="flex justify-end gap-3 mt-1">
          {rulerPts.length>0&&(
            <button type="button" onClick={()=>{setRulerPts([]);setLiveRuler(null);}}
              className="flex items-center gap-1 text-[10px] font-bold text-muted-foreground hover:text-foreground transition-colors">
              <X className="h-3 w-3"/> Clear ruler
            </button>
          )}
          {anglePts.length>0&&(
            <button type="button" onClick={()=>{setAnglePts([]);setLiveAngle(null);}}
              className="flex items-center gap-1 text-[10px] font-bold text-muted-foreground hover:text-foreground transition-colors">
              <X className="h-3 w-3"/> Clear angle
            </button>
          )}
        </div>
      )}
    </div>
  );
}
