import React, {
  useState, useRef, useEffect, useMemo, useCallback,
} from "react";
import { useLocation } from "wouter";
import {
  Ruler, Save, Layers3, RefreshCw, BarChart3, Move,
  ChevronRight, ChevronDown, Crosshair, Lock, Unlock,
  ZoomIn, ZoomOut, MousePointer2, Triangle,
  Maximize2, Minimize2, FlipHorizontal, Sun, Contrast,
  X, AlertTriangle, Undo2, Redo2, Download,
  EyeOff, Copy, RotateCcw, Zap, Sliders, Trash2, ListChecks,
  Search, ExternalLink, ImageOff, Clipboard,
  PencilLine, ChevronLeft, ScanLine, CheckCircle2, Target,
  Activity,
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
  { label: "Cranial Base", codes: ["S", "N", "Or", "Po", "Ba", "Pt", "Ar", "Se"], color: "#60a5fa" },
  { label: "Maxilla", codes: ["A", "ANS", "PNS", "Sp", "Ss", "Prn", "Ns"], color: "#34d399" },
  { label: "Mandible", codes: ["B", "Pog", "Gn", "Me", "Go", "Co", "D", "Id"], color: "#f59e0b" },
  { label: "Dental", codes: ["UI", "LI", "U1r", "L1r", "UM", "LM", "UP", "LP", "U6", "L6"], color: "#a78bfa" },
  { label: "Soft Tissue", codes: ["Ls", "Li", "Pg", "Cm", "Sn", "Dt", "Tt", "Gls", "Sts", "Sti", "N_st", "Pog_st"], color: "#fb7185" },
  { label: "Airway / CVM", codes: ["PNW", "PPW", "Eb", "Tb", "C2", "C3", "C4", "C3ant", "C3post", "C4ant", "C4post", "C2inf"], color: "#38bdf8" },
  { label: "Ricketts", codes: ["Xi", "Dc", "Cf", "Ag", "Pm", "Cc", "ENS", "ENS2"], color: "#e879f9" },
];

type TracingPlane = {
  key: string; from: string; to: string; color: string;
  label: string; dashed?: boolean; group: "skeletal" | "dental" | "soft" | "vertical";
};

const TRACING_PLANES: TracingPlane[] = [
  { key: "SN", from: "S", to: "N", color: "#60a5fa", label: "SN", group: "skeletal" },
  { key: "FH", from: "Po", to: "Or", color: "#f59e0b", label: "FH", group: "skeletal" },
  { key: "NA", from: "N", to: "A", color: "#34d399", label: "NA", group: "skeletal" },
  { key: "NB", from: "N", to: "B", color: "#34d399", label: "NB", group: "skeletal" },
  { key: "NPog", from: "N", to: "Pog", color: "#a78bfa", label: "N-Pog", group: "skeletal", dashed: true },
  { key: "GoGn", from: "Go", to: "Gn", color: "#f59e0b", label: "Md. Plane", group: "vertical" },
  { key: "GoMe", from: "Go", to: "Me", color: "#fbbf24", label: "Go-Me", group: "vertical", dashed: true },
  { key: "Inc", from: "UI", to: "LI", color: "#34d399", label: "Inc.", group: "dental" },
  { key: "OcPlane", from: "U6", to: "L6", color: "#e879f9", label: "Occ. Plane", group: "dental", dashed: true },
  { key: "ELine", from: "Prn", to: "Pg", color: "#fb7185", label: "E-Line", group: "soft", dashed: true },
  { key: "SoftN", from: "N_st", to: "Pog_st", color: "#fb7185", label: "Facial", group: "soft" },
];

type ToolMode = "select" | "pan" | "ruler" | "angle";

const TOOLS: { mode: ToolMode; icon: React.ElementType; label: string; shortcut: string; hint: string }[] = [
  { mode: "select", icon: MousePointer2, label: "Select / Move", shortcut: "S", hint: "Click to select · Drag to reposition · Arrows ±1px" },
  { mode: "pan", icon: Move, label: "Pan / Navigate", shortcut: "H", hint: "Drag to pan · Alt+drag from any mode · Middle-mouse" },
  { mode: "ruler", icon: Ruler, label: "Measure Distance", shortcut: "R", hint: "Click two points to measure · Snaps to landmarks" },
  { mode: "angle", icon: Triangle, label: "Measure Angle", shortcut: "A", hint: "Click three points: arm1 → vertex → arm2" },
];

const IMAGE_PRESETS = [
  { label: "Standard", filters: { brightness: 100, contrast: 110, gamma: 1.0, invert: false, sharpen: false } },
  { label: "High Contrast", filters: { brightness: 75, contrast: 175, gamma: 0.85, invert: false, sharpen: false } },
  { label: "Soft Tissue", filters: { brightness: 125, contrast: 90, gamma: 1.2, invert: false, sharpen: false } },
  { label: "Bone Detail", filters: { brightness: 80, contrast: 200, gamma: 0.7, invert: false, sharpen: true } },
  { label: "Negative", filters: { brightness: 100, contrast: 120, gamma: 1.0, invert: true, sharpen: false } },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getGroupColor(code: string): string {
  for (const g of LANDMARK_GROUPS) if (g.codes.includes(code)) return g.color;
  return "#60a5fa";
}

function extendedLine(p1: Point, p2: Point, ext = 80): [Point, Point] {
  const dx = p2.x - p1.x, dy = p2.y - p1.y;
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  return [
    { x: p1.x - (dx / len) * ext, y: p1.y - (dy / len) * ext },
    { x: p2.x + (dx / len) * ext, y: p2.y + (dy / len) * ext },
  ];
}

function perpTick(p: Point, p2: Point, half: number) {
  const dx = p2.x - p.x, dy = p2.y - p.y, len = Math.sqrt(dx * dx + dy * dy) || 1;
  return { x1: p.x - dy / len * half, y1: p.y + dx / len * half, x2: p.x + dy / len * half, y2: p.y - dx / len * half };
}

function dist(a: Point, b: Point) { return Math.sqrt((b.x - a.x) ** 2 + (b.y - a.y) ** 2); }

function angleDeg(center: Point, p1: Point, p2: Point) {
  const v1 = { x: p1.x - center.x, y: p1.y - center.y }, v2 = { x: p2.x - center.x, y: p2.y - center.y };
  const dot = v1.x * v2.x + v1.y * v2.y, l1 = Math.sqrt(v1.x ** 2 + v1.y ** 2), l2 = Math.sqrt(v2.x ** 2 + v2.y ** 2);
  if (!l1 || !l2) return 0;
  return Math.acos(Math.max(-1, Math.min(1, dot / (l1 * l2)))) * (180 / Math.PI);
}

function arcPath(c: Point, p1: Point, p2: Point, r: number) {
  const a1 = Math.atan2(p1.y - c.y, p1.x - c.x), a2 = Math.atan2(p2.y - c.y, p2.x - c.x);
  let diff = a2 - a1; while (diff > Math.PI) diff -= 2 * Math.PI; while (diff < -Math.PI) diff += 2 * Math.PI;
  const sx = c.x + r * Math.cos(a1), sy = c.y + r * Math.sin(a1), ex = c.x + r * Math.cos(a2), ey = c.y + r * Math.sin(a2);
  return `M ${sx} ${sy} A ${r} ${r} 0 ${Math.abs(diff) > Math.PI ? 1 : 0} ${diff > 0 ? 1 : 0} ${ex} ${ey}`;
}

function uid() { return Math.random().toString(36).slice(2); }

// ─── Types ────────────────────────────────────────────────────────────────────

type ImageFilters = { brightness: number; contrast: number; gamma: number; invert: boolean; sharpen: boolean };

type SavedMeasurement = {
  id: string; kind: "distance" | "angle";
  value: number; unit: string; pts: Point[]; label: string; at: string;
};

type CtxMenu = { screenX: number; screenY: number; code: string };

interface ViewerPageProps {
  activeCase?: CaseRecord;
  landmarks: Landmark[];
  setLandmarks: (l: Landmark[]) => void;
  overlays: OverlayArtifact[];
  onSaveAndSend: (isCbct: boolean) => void | Promise<void>;
  onRefreshOverlays: () => void | Promise<void>;
}

// ─── ViewerPage ───────────────────────────────────────────────────────────────

export default function ViewerPage({
  activeCase, landmarks, setLandmarks, overlays,
  onSaveAndSend, onRefreshOverlays,
}: ViewerPageProps) {
  const [, navigate] = useLocation();

  // Tool / interaction
  const [tool, setTool] = useState<ToolMode>("select");
  const [selectedCode, setSelectedCode] = useState<string | null>(null);
  const [hoveredCode, setHoveredCode] = useState<string | null>(null);
  const [isCbct, setIsCbct] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);

  // Measurement tools
  const [rulerPts, setRulerPts] = useState<Point[]>([]);
  const [anglePts, setAnglePts] = useState<Point[]>([]);
  const [measurements, setMeasurements] = useState<SavedMeasurement[]>([]);
  const [editingMsrId, setEditingMsrId] = useState<string | null>(null);

  // Image filters
  const [filters, setFilters] = useState<ImageFilters>(
    { brightness: 100, contrast: 110, gamma: 1.0, invert: false, sharpen: false }
  );
  const [flipH, setFlipH] = useState(false);

  // Layer / plane visibility
  const [layers, setLayers] = useState({ landmarks: true, planes: true, softTissue: true, grid: false, measurements: true });
  const [planeVis, setPlaneVis] = useState<Record<string, boolean>>(
    Object.fromEntries(TRACING_PLANES.map(p => [p.key, true]))
  );

  // UI state
  const [activeTab, setActiveTab] = useState<"controls" | "planes" | "measures">("controls");
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>(
    Object.fromEntries(LANDMARK_GROUPS.map(g => [g.label, false]))
  );
  const [ctxMenu, setCtxMenu] = useState<CtxMenu | null>(null);
  const [alwaysLabels, setAlwaysLabels] = useState(false);
  const [centerTarget, setCenterTarget] = useState<Point | null>(null);
  const [overlayModal, setOverlayModal] = useState<OverlayArtifact | null>(null);
  const [lmSearch, setLmSearch] = useState("");
  const [fitSignal, setFitSignal] = useState(0);  // increment to trigger fit

  // Undo / Redo — useState so canUndo/canRedo trigger re-renders
  const [undoStack, setUndoStack] = useState<Landmark[][]>([]);
  const [redoStack, setRedoStack] = useState<Landmark[][]>([]);

  // Store original AI-predicted positions for "Reset to AI" feature
  const origLandmarksRef = useRef<Landmark[]>([]);
  useEffect(() => {
    if (landmarks.length > 0 && origLandmarksRef.current.length === 0) {
      origLandmarksRef.current = [...landmarks];
    }
  }, [landmarks]);

  const pushUndo = useCallback(() => {
    setUndoStack(prev => [...prev.slice(-29), [...landmarks]]);
    setRedoStack([]);
  }, [landmarks]);

  const undo = useCallback(() => {
    if (!undoStack.length) return;
    setRedoStack(prev => [[...landmarks], ...prev.slice(0, 29)]);
    setLandmarks(undoStack[undoStack.length - 1]);
    setUndoStack(prev => prev.slice(0, -1));
    toast.info("Undo");
  }, [undoStack, landmarks, setLandmarks]);

  const redo = useCallback(() => {
    if (!redoStack.length) return;
    setUndoStack(prev => [...prev, [...landmarks]]);
    setLandmarks(redoStack[0]);
    setRedoStack(prev => prev.slice(1));
    toast.info("Redo");
  }, [redoStack, landmarks, setLandmarks]);

  // ── Context menu close ──
  useEffect(() => {
    if (!ctxMenu) return;
    const close = () => setCtxMenu(null);
    window.addEventListener("pointerdown", close);
    return () => window.removeEventListener("pointerdown", close);
  }, [ctxMenu]);

  // ── Overlay lightbox Escape ──
  useEffect(() => {
    if (!overlayModal) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOverlayModal(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [overlayModal]);

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
        case "a": setTool("angle"); break;
        case "l": setAlwaysLabels(v => !v); break;
        case "f": setFitSignal(s => s + 1); break;
        case "x": setFlipH(v => !v); break;
        case "c": navigate("/calibrate"); break;
        case "escape":
          setRulerPts([]); setAnglePts([]);
          setSelectedCode(null); setCtxMenu(null); setOverlayModal(null);
          break;
        case "arrowleft": moveSel(e.shiftKey ? -5 : -1, 0); e.preventDefault(); break;
        case "arrowright": moveSel(e.shiftKey ? 5 : 1, 0); e.preventDefault(); break;
        case "arrowup": moveSel(0, e.shiftKey ? -5 : -1); e.preventDefault(); break;
        case "arrowdown": moveSel(0, e.shiftKey ? 5 : 1); e.preventDefault(); break;
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [tool, selectedCode, landmarks, isLocked, undo, redo]);

  function updateLandmark(code: string, patch: Partial<Landmark>) {
    if (isLocked) return;
    setLandmarks(landmarks.map(l => l.code === code ? { ...l, ...patch } : l));
  }

  function moveSel(dx: number, dy: number) {
    if (!selectedCode || isLocked) return;
    const lm = landmarks.find(l => l.code === selectedCode);
    if (lm) { pushUndo(); updateLandmark(selectedCode, { x: lm.x + dx, y: lm.y + dy, adjusted: true }); }
  }

  // ── Reset landmark to original AI position ──
  function resetLandmarkToAI(code: string) {
    const orig = origLandmarksRef.current.find(l => l.code === code);
    if (!orig) { toast.error("Original AI position not available"); return; }
    pushUndo();
    updateLandmark(code, { x: orig.x, y: orig.y, adjusted: false, confidence: orig.confidence });
    toast.success(`${code} reset to AI prediction`);
  }

  // ── Context menu actions ──
  function copyLandmarkCoords(code: string) {
    const lm = landmarks.find(l => l.code === code);
    if (!lm) return;
    const text = pixPerMm
      ? `${code}: X=${lm.x.toFixed(1)}px (${(lm.x / pixPerMm).toFixed(1)}mm), Y=${lm.y.toFixed(1)}px (${(lm.y / pixPerMm).toFixed(1)}mm)`
      : `${code}: X=${lm.x.toFixed(1)}px, Y=${lm.y.toFixed(1)}px`;
    navigator.clipboard?.writeText(text).then(() => toast.success("Coordinates copied")).catch(() => { });
  }

  function centerOnLandmark(code: string) {
    const lm = landmarks.find(l => l.code === code);
    if (lm) setCenterTarget({ x: lm.x, y: lm.y });
  }

  function clearAdjusted(code: string) {
    updateLandmark(code, { adjusted: false });
    toast.info(`${code}: adjustment flag cleared`);
  }

  // ── Calibration (read-only — editing happens in CalibrationPage) ──
  const pixPerMm = useMemo(() => {
    const pts = activeCase?.calibrationPoints ?? [];
    const mm = activeCase?.calibrationDistanceMm ?? 0;
    if (pts.length === 2 && mm > 0) return dist(pts[0], pts[1]) / mm;
    return null;
  }, [activeCase]);

  const calibrated = Boolean(activeCase?.calibrated);

  // ── Measurements ──
  function saveMeasurement(m: Omit<SavedMeasurement, "id" | "at" | "label">) {
    const id = uid();
    const kind = m.kind === "distance" ? "Dist" : "Angle";
    const label = `${kind} ${Math.round(m.value)}${m.unit}`;
    setMeasurements(prev => [{ ...m, id, at: new Date().toLocaleTimeString(), label }, ...prev.slice(0, 49)]);
    setActiveTab("measures");
  }

  function updateMeasurementLabel(id: string, label: string) {
    setMeasurements(prev => prev.map(m => m.id === id ? { ...m, label } : m));
  }

  // ── Export measurements ──
  function exportMeasurements() {
    if (!measurements.length) { toast.error("No measurements to export"); return; }
    const lines = measurements.map(m =>
      `${m.label}\t${m.value.toFixed(2)} ${m.unit}\t${m.at}`
    );
    const text = ["Label\tValue\tTime", ...lines].join("\n");
    navigator.clipboard?.writeText(text)
      .then(() => toast.success(`${measurements.length} measurements copied to clipboard`))
      .catch(() => {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(new Blob([text], { type: "text/tab-separated-values" }));
        a.download = "measurements.tsv";
        a.click();
      });
  }

  // ── Export SVG ──
  const svgRef = useRef<SVGSVGElement>(null);
  function exportSVG() {
    const svg = svgRef.current;
    if (!svg) return;
    const s = new XMLSerializer().serializeToString(svg);
    const blob = new Blob([s], { type: "image/svg+xml" });
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
  const lowConf = landmarks.filter(l => l.confidence < 0.7);
  const canUndo = undoStack.length > 0;
  const canRedo = redoStack.length > 0;

  // ── Filtered landmarks for inventory ──
  const filteredLandmarks = useMemo(() => {
    if (!lmSearch.trim()) return landmarks;
    const q = lmSearch.toLowerCase();
    return landmarks.filter(l =>
      l.code.toLowerCase().includes(q) || l.name.toLowerCase().includes(q)
    );
  }, [landmarks, lmSearch]);

  const groupedLandmarks = useMemo(() => {
    const byCode = Object.fromEntries(filteredLandmarks.map(l => [l.code, l]));
    return LANDMARK_GROUPS
      .map(g => ({ ...g, landmarks: g.codes.map(c => byCode[c]).filter(Boolean) as Landmark[] }))
      .filter(g => g.landmarks.length > 0);
  }, [filteredLandmarks]);

  const ungroupedLandmarks = useMemo(() => {
    const known = new Set(LANDMARK_GROUPS.flatMap(g => g.codes));
    return filteredLandmarks.filter(l => !known.has(l.code));
  }, [filteredLandmarks]);

  const activeTool = TOOLS.find(t => t.mode === tool);

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-700 min-h-screen bg-background">
      <PageHeader
        eyebrow="Diagnostic Suite"
        title="Cephalometric Viewer"
        description="High-precision clinical workspace for landmark verification, metric measurements, and spatial analysis."
        actions={
          <div className="flex items-center gap-3 bg-card/40 backdrop-blur-md p-1.5 rounded-2xl border border-border/40 shadow-sm-professional">
            {/* Undo / Redo */}
            <div className="flex items-center gap-1 bg-muted/30 p-1 rounded-xl border border-border/20">
              {([
                { icon: Undo2, label: "Undo (Ctrl+Z)", action: undo, enabled: canUndo },
                { icon: Redo2, label: "Redo (Ctrl+Shift+Z)", action: redo, enabled: canRedo },
              ] as const).map(b => (
                <button
                  key={b.label}
                  type="button"
                  title={b.label}
                  onClick={b.action}
                  disabled={!b.enabled}
                  className={cn(
                    "h-8 w-8 flex items-center justify-center rounded-lg transition-all",
                    b.enabled ? "text-foreground hover:bg-background shadow-sm" : "text-muted-foreground/30 cursor-not-allowed"
                  )}
                >
                  <b.icon className="h-4 w-4" />
                </button>
              ))}
            </div>

            <IconBtn icon={Download} label="Export SVG" onClick={exportSVG} variant="outline" className="h-10 hover-lift" />

            <div className="h-10 flex items-center gap-3 px-4 rounded-xl border border-border/40 bg-muted/20 font-bold text-xs">
              <span className="text-muted-foreground uppercase tracking-widest">CBCT</span>
              <Switch checked={isCbct} onChange={setIsCbct} />
            </div>

            <button
              onClick={() => { setIsLocked(l => !l); toast.info(isLocked ? "Editing unlocked" : "Editing locked"); }}
              className={cn(
                "h-10 px-4 flex items-center gap-2 rounded-xl font-bold text-xs transition-all hover-lift",
                isLocked
                  ? "bg-warning/10 border border-warning/30 text-warning"
                  : "bg-muted border border-border/40 text-muted-foreground"
              )}
            >
              {isLocked ? <Lock className="h-4 w-4" /> : <Unlock className="h-4 w-4" />}
              {isLocked ? "LOCKED" : "UNLOCKED"}
            </button>

            <PrimaryBtn onClick={() => onSaveAndSend(isCbct)} icon={Save} className="h-10 hover-lift shadow-lg shadow-primary/20">
              Save & Analyze
            </PrimaryBtn>
          </div>
        }
      />

      <div ref={containerRef} className={cn(
        "grid gap-6 xl:grid-cols-[1fr_400px]",
        fullscreen && "fixed inset-0 z-50 bg-background p-6 overflow-auto"
      )}>

        {/* ── Left column ── */}
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
            measurements={measurements}
            onContextMenu={(code, x, y) => setCtxMenu({ screenX: x, screenY: y, code })}
            onFullscreen={toggleFullscreen}
            fullscreen={fullscreen}
            fitSignal={fitSignal}
          />

          {/* ── Landmark Inventory ── */}
          <Card noPadding className="overflow-hidden glass-premium shadow-md-professional border-border/40 transition-all duration-500 hover-glow">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border/40 bg-muted/10">
              <div className="flex items-center gap-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10 text-primary border border-primary/20 shadow-sm">
                  <Crosshair className="h-5 w-5" />
                </div>
                <div>
                  <h4 className="text-base font-black tracking-tight">Landmark Inventory</h4>
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                    {landmarks.length} Entities · {landmarks.filter(l => l.adjusted).length} Adjusted
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  title="Toggle all labels (L)"
                  onClick={() => setAlwaysLabels(v => !v)}
                  className={cn(
                    "flex h-8 px-3 items-center justify-center rounded-xl border text-[10px] transition-all font-black uppercase tracking-tighter hover-lift",
                    alwaysLabels ? "bg-primary text-primary-foreground border-primary shadow-lg shadow-primary/20" : "bg-muted/50 border-border/60 text-muted-foreground"
                  )}
                >
                  Labels
                </button>
                {lowConf.length > 0 && <Pill tone="warning" size="xs">{lowConf.length} Low Conf</Pill>}
                <div className="bg-background/60 px-3 py-1 rounded-xl border border-border/40">
                  <span className={cn("text-xs font-black tabular-nums", !landmarks.length ? "text-muted-foreground/30" : lowConf.length ? "text-warning" : "text-success")}>
                    {landmarks.length
                      ? `${Math.round(landmarks.reduce((s, l) => s + l.confidence, 0) / landmarks.length * 100)}% Confidence`
                      : "—"}
                  </span>
                </div>
              </div>
            </div>

            {/* Search bar */}
            {landmarks.length > 0 && (
              <div className="px-3 pt-3 pb-0">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground/50" />
                  <input
                    type="text"
                    placeholder="Search landmarks…"
                    value={lmSearch}
                    onChange={e => setLmSearch(e.target.value)}
                    className="w-full h-8 pl-8 pr-8 rounded-xl border border-border/40 bg-muted/20 text-xs placeholder:text-muted-foreground/40 focus:outline-none focus:border-primary/40 transition-colors"
                  />
                  {lmSearch && (
                    <button type="button" onClick={() => setLmSearch("")}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground/40 hover:text-foreground">
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </div>
              </div>
            )}

            <div className="p-3 space-y-1">
              {groupedLandmarks.map(grp => {
                const open = expandedGroups[grp.label];
                const low = grp.landmarks.filter(l => l.confidence < 0.7).length;
                return (
                  <div key={grp.label} className="rounded-xl border border-border/40 overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setExpandedGroups(g => ({ ...g, [grp.label]: !g[grp.label] }))}
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
                            color={grp.color}
                            onClick={() => { setSelectedCode(lm.code); centerOnLandmark(lm.code); }}
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
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-2 rounded-full bg-muted-foreground/40" />
                      <span className="text-xs font-bold">Other</span>
                      <span className="text-[10px] text-muted-foreground/50">{ungroupedLandmarks.length} pts</span>
                    </div>
                    {expandedGroups["__other"]
                      ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                      : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
                  </button>
                  {expandedGroups["__other"] && (
                    <div className="grid gap-1 p-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 animate-in fade-in duration-150">
                      {ungroupedLandmarks.map(lm => (
                        <LandmarkChip
                          key={lm.code} landmark={lm}
                          selected={lm.code === selectedCode} hovered={lm.code === hoveredCode}
                          onClick={() => { setSelectedCode(lm.code); centerOnLandmark(lm.code); }}
                        />
                      ))}
                    </div>
                  )}
                </div>
              )}

              {lmSearch && groupedLandmarks.length === 0 && ungroupedLandmarks.length === 0 && (
                <div className="py-6 text-center border border-dashed border-border/60 rounded-2xl bg-muted/10">
                  <Search className="h-6 w-6 text-muted-foreground/20 mx-auto mb-1.5" />
                  <p className="text-xs text-muted-foreground italic">No landmarks match "{lmSearch}"</p>
                </div>
              )}

              {!lmSearch && landmarks.length === 0 && (
                <div className="py-8 text-center border border-dashed border-border/60 rounded-2xl bg-muted/10">
                  <Crosshair className="h-8 w-8 text-muted-foreground/20 mx-auto mb-2" />
                  <p className="text-xs text-muted-foreground italic">Run AI analysis to populate landmarks.</p>
                </div>
              )}
            </div>
          </Card>
        </div>

        {/* ── Right panel ── */}
        <div className="space-y-4">

          {/* ── Landmark Detail ── */}
          <Card className={cn("transition-all duration-500 border-border/40 glass-premium shadow-md-professional p-6", selected ? "ring-2 ring-primary/20" : "opacity-80")}>
            <div className="flex items-center gap-4 mb-6">
              <div
                className="flex h-14 w-14 items-center justify-center rounded-2xl border-2 font-black text-sm uppercase shrink-0 shadow-sm transition-all duration-500 group-hover:scale-105"
                style={selected ? {
                  background: getGroupColor(selected.code) + "15",
                  borderColor: getGroupColor(selected.code) + "40",
                  color: getGroupColor(selected.code),
                } : {}}
              >
                {selected?.code ?? "—"}
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="text-base font-black tracking-tight">Active Landmark</h4>
                <p className="text-xs text-muted-foreground truncate font-medium opacity-60">
                  {selected ? selected.name : "Select a clinical point"}
                </p>
              </div>
              {selected && (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    title="Center view (F)"
                    onClick={() => centerOnLandmark(selected.code)}
                    className="h-10 w-10 flex items-center justify-center rounded-xl border border-border/60 bg-muted/20 text-muted-foreground hover:text-primary hover:border-primary/40 transition-all hover-lift"
                  >
                    <Crosshair className="h-5 w-5" />
                  </button>
                  {origLandmarksRef.current.length > 0 && selected.adjusted && (
                    <button
                      type="button"
                      title="Restore original position"
                      onClick={() => resetLandmarkToAI(selected.code)}
                      className="h-10 w-10 flex items-center justify-center rounded-xl border border-warning/30 bg-warning/5 text-warning/70 hover:text-warning hover:border-warning/60 transition-all hover-lift"
                    >
                      <RotateCcw className="h-5 w-5" />
                    </button>
                  )}
                </div>
              )}
            </div>

            {selected ? (
              <div className="space-y-3 animate-in fade-in duration-200">
                <div className="grid grid-cols-2 gap-2">
                  <Field label="X (px)">
                    <TextInput
                      type="number"
                      value={Math.round(selected.x)}
                      onChange={v => { pushUndo(); updateLandmark(selected.code, { x: Number(v), adjusted: true }); }}
                    />
                  </Field>
                  <Field label="Y (px)">
                    <TextInput
                      type="number"
                      value={Math.round(selected.y)}
                      onChange={v => { pushUndo(); updateLandmark(selected.code, { y: Number(v), adjusted: true }); }}
                    />
                  </Field>
                </div>

                {pixPerMm && (
                  <div className="grid grid-cols-2 gap-2">
                    <div className="rounded-xl border border-border/40 bg-muted/20 p-2.5 text-center">
                      <p className="text-[10px] font-bold uppercase text-muted-foreground tracking-widest mb-1">X (mm)</p>
                      <p className="text-sm font-bold tabular-nums">{(selected.x / pixPerMm).toFixed(2)}</p>
                    </div>
                    <div className="rounded-xl border border-border/40 bg-muted/20 p-2.5 text-center">
                      <p className="text-[10px] font-bold uppercase text-muted-foreground tracking-widest mb-1">Y (mm)</p>
                      <p className="text-sm font-bold tabular-nums">{(selected.y / pixPerMm).toFixed(2)}</p>
                    </div>
                  </div>
                )}

                <div className="rounded-xl border border-border/40 bg-muted/20 p-3">
                  <div className="flex justify-between mb-2">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">AI Confidence</p>
                    <span className={cn("text-sm font-bold tabular-nums",
                      selected.confidence >= 0.85 ? "text-success" : selected.confidence >= 0.7 ? "text-primary" : "text-warning"
                    )}>{Math.round(selected.confidence * 100)}%</span>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                    <div className={cn("h-full transition-all duration-500",
                      selected.confidence >= 0.85 ? "bg-success" : selected.confidence >= 0.7 ? "bg-primary" : "bg-warning"
                    )} style={{ width: `${selected.confidence * 100}%` }} />
                  </div>
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {selected.adjusted && <Pill tone="accent" size="xs">Manually adjusted</Pill>}
                  {selected.confidence < 0.7 && <Pill tone="warning" size="xs">Low confidence</Pill>}
                </div>

                <p className="text-[10px] text-muted-foreground/40">
                  Drag on canvas · Arrows ±1px · Shift+Arrows ±5px
                </p>
              </div>
            ) : (
              <div className="py-5 text-center border border-dashed border-border/60 rounded-2xl bg-muted/10">
                <p className="text-xs text-muted-foreground italic">Click a landmark in the viewer or inventory</p>
              </div>
            )}
          </Card>

          {/* ── Tabbed Controls ── */}
          <Card noPadding className="overflow-hidden">
            <div className="flex bg-muted/20 border-b border-border/40 p-1">
              {(["controls", "planes", "measures"] as const).map(tab => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setActiveTab(tab)}
                  className={cn(
                    "flex-1 py-2 rounded-xl text-[10px] font-black uppercase tracking-[0.15em] transition-all duration-300",
                    activeTab === tab
                      ? "bg-background text-primary shadow-sm ring-1 ring-border/40"
                      : "text-muted-foreground hover:text-foreground hover:bg-background/50"
                  )}
                >
                  {tab === "controls" ? "Imaging" : tab === "planes" ? "Traces" : "Metrics"}
                  {tab === "measures" && measurements.length > 0 && (
                    <span className="ml-2 inline-flex h-4 w-4 items-center justify-center rounded-full bg-primary text-primary-foreground text-[8px] font-black animate-pulse">
                      {measurements.length}
                    </span>
                  )}
                </button>
              ))}
            </div>

            <div className="p-4">
              {/* ── Image Controls ── */}
              {activeTab === "controls" && (
                <div className="space-y-4">
                  <div className="space-y-3">
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/40">Imaging Presets</p>
                    <div className="grid grid-cols-2 gap-2">
                      {IMAGE_PRESETS.map(p => (
                        <button
                          key={p.label}
                          type="button"
                          onClick={() => setFilters(p.filters)}
                          className="px-3 py-2 rounded-xl border border-border/40 bg-card/40 text-[10px] font-bold uppercase tracking-tighter hover:border-primary/50 hover:bg-card hover:text-primary transition-all text-center"
                        >
                          {p.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <Divider className="opacity-40" />

                  <div className="space-y-3">
                    {[
                      { key: "brightness" as const, label: "Brightness", icon: Sun, min: 20, max: 220 },
                      { key: "contrast" as const, label: "Contrast", icon: Contrast, min: 20, max: 220 },
                    ].map(f => (
                      <div key={f.key} className="space-y-1">
                        <div className="flex items-center justify-between text-[10px] font-bold uppercase text-muted-foreground">
                          <span className="flex items-center gap-1"><f.icon className="h-3 w-3" />{f.label}</span>
                          <span className="text-foreground tabular-nums">{filters[f.key]}%</span>
                        </div>
                        <input
                          type="range" min={f.min} max={f.max} value={filters[f.key]}
                          onChange={e => setFilters(fv => ({ ...fv, [f.key]: Number(e.target.value) }))}
                          className="w-full h-1.5 rounded-full bg-muted appearance-none accent-primary cursor-pointer"
                        />
                      </div>
                    ))}

                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-[10px] font-bold uppercase text-muted-foreground">
                        <span className="flex items-center gap-1"><Sliders className="h-3 w-3" />Gamma</span>
                        <span className="text-foreground tabular-nums">{filters.gamma.toFixed(2)}</span>
                      </div>
                      <input
                        type="range" min={40} max={200} step={5}
                        value={Math.round(filters.gamma * 100)}
                        onChange={e => setFilters(fv => ({ ...fv, gamma: Number(e.target.value) / 100 }))}
                        className="w-full h-1.5 rounded-full bg-muted appearance-none accent-primary cursor-pointer"
                      />
                    </div>
                  </div>

                  <Divider className="opacity-40" />

                  <div className="space-y-2">
                    {[
                      { key: "invert" as const, label: "Invert (Negative)", icon: FlipHorizontal },
                      { key: "sharpen" as const, label: "Edge Sharpen", icon: Zap },
                    ].map(t => (
                      <div key={t.key} className="flex items-center justify-between">
                        <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
                          <t.icon className="h-3 w-3" />{t.label}
                        </span>
                        <Switch checked={filters[t.key] as boolean} onChange={v => setFilters(f => ({ ...f, [t.key]: v }))} />
                      </div>
                    ))}
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
                        <FlipHorizontal className="h-3 w-3" />Flip Horizontal
                        <kbd className="ml-1 text-[8px] bg-muted/40 px-1 py-0.5 rounded">X</kbd>
                      </span>
                      <Switch checked={flipH} onChange={setFlipH} />
                    </div>
                  </div>

                  <Divider className="opacity-40" />

                  <div className="space-y-3">
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/40">Visualization Layers</p>
                    <div className="grid gap-2">
                      {[
                        { key: "landmarks", label: "Clinical Landmarks", icon: Crosshair },
                        { key: "planes", label: "Tracing Planes", icon: PencilLine },
                        { key: "softTissue", label: "Soft Tissue Profile", icon: Activity },
                        { key: "measurements", label: "Metrics Overlay", icon: Ruler },
                        { key: "grid", label: "Reference Grid", icon: Layers3 },
                      ].map(({ key, label, icon: Icon }) => (
                        <button
                          key={key}
                          type="button"
                          onClick={() => setLayers(l => ({ ...l, [key]: !l[key as keyof typeof l] }))}
                          className={cn(
                            "flex items-center justify-between w-full p-3 rounded-2xl border transition-all duration-300",
                            layers[key as keyof typeof layers]
                              ? "border-primary/30 bg-primary/10 text-primary shadow-sm ring-1 ring-primary/5"
                              : "border-border/40 bg-muted/20 text-muted-foreground/60 hover:bg-muted/40"
                          )}
                        >
                          <div className="flex items-center gap-3">
                            <Icon className="h-4 w-4" />
                            <span className="text-xs font-black tracking-tight uppercase">{label}</span>
                          </div>
                          <div className={cn(
                            "h-4 w-8 rounded-full border-2 transition-all p-0.5",
                            layers[key as keyof typeof layers] ? "border-primary bg-primary" : "border-border bg-transparent"
                          )}>
                            <div className={cn(
                              "h-full aspect-square rounded-full bg-white transition-all",
                              layers[key as keyof typeof layers] ? "translate-x-3.5" : "translate-x-0"
                            )} />
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setFilters({ brightness: 100, contrast: 110, gamma: 1.0, invert: false, sharpen: false })}
                    className="text-[10px] font-bold text-primary/50 hover:text-primary transition-colors"
                  >
                    ↺ Reset image to defaults
                  </button>
                </div>
              )}

              {/* ── Planes ── */}
              {activeTab === "planes" && (
                <div className="space-y-1">
                  {(["skeletal", "vertical", "dental", "soft"] as const).map(grp => {
                    const planes = TRACING_PLANES.filter(p => p.group === grp);
                    const allOn = planes.every(p => planeVis[p.key]);
                    return (
                      <div key={grp}>
                        <div className="flex items-center justify-between mb-1.5 px-1">
                          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{grp}</p>
                          <button
                            type="button"
                            onClick={() => setPlaneVis(pv => {
                              const next = { ...pv };
                              planes.forEach(p => { next[p.key] = !allOn; });
                              return next;
                            })}
                            className="text-[9px] text-muted-foreground/50 hover:text-primary transition-colors"
                          >
                            {allOn ? "hide all" : "show all"}
                          </button>
                        </div>
                        {planes.map(plane => (
                          <button
                            key={plane.key}
                            type="button"
                            onClick={() => setPlaneVis(pv => ({ ...pv, [plane.key]: !pv[plane.key] }))}
                            className={cn(
                              "flex items-center justify-between w-full px-3 py-2 rounded-xl border text-xs transition-all mb-1",
                              planeVis[plane.key] ? "border-transparent bg-muted/10" : "border-border/40 opacity-40"
                            )}
                          >
                            <div className="flex items-center gap-2">
                              <div className="h-3 w-3 rounded-full shrink-0" style={{
                                background: planeVis[plane.key] ? plane.color : "transparent",
                                border: `1.5px solid ${plane.color}`,
                              }} />
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
                    <button type="button"
                      onClick={() => setPlaneVis(Object.fromEntries(TRACING_PLANES.map(p => [p.key, true])))}
                      className="text-[10px] font-bold text-primary/60 hover:text-primary transition-colors">
                      Show all
                    </button>
                    <span className="text-muted-foreground/30">·</span>
                    <button type="button"
                      onClick={() => setPlaneVis(Object.fromEntries(TRACING_PLANES.map(p => [p.key, false])))}
                      className="text-[10px] font-bold text-muted-foreground/50 hover:text-foreground transition-colors">
                      Hide all
                    </button>
                  </div>
                </div>
              )}

              {/* ── Measurements ── */}
              {activeTab === "measures" && (
                <div className="space-y-3">
                  {measurements.length === 0 ? (
                    <div className="py-8 text-center border border-dashed border-border/60 rounded-2xl bg-muted/10">
                      <ListChecks className="h-8 w-8 text-muted-foreground/20 mx-auto mb-2" />
                      <p className="text-xs text-muted-foreground italic">
                        Use Ruler (<kbd className="bg-muted px-1 py-0.5 rounded text-[9px]">R</kbd>) or
                        Angle (<kbd className="bg-muted px-1 py-0.5 rounded text-[9px]">A</kbd>) tools
                      </p>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center justify-between">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                          {measurements.length} recorded
                        </p>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={exportMeasurements}
                            title="Copy all to clipboard"
                            className="flex items-center gap-1 text-[10px] font-bold text-primary/60 hover:text-primary transition-colors"
                          >
                            <Clipboard className="h-3 w-3" /> Copy
                          </button>
                          <button
                            type="button"
                            onClick={() => setMeasurements([])}
                            className="flex items-center gap-1 text-[10px] font-bold text-destructive/50 hover:text-destructive transition-colors"
                          >
                            <Trash2 className="h-3 w-3" /> Clear
                          </button>
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        {measurements.map(m => (
                          <div
                            key={m.id}
                            className="flex items-center gap-2 p-2.5 rounded-xl border border-border/40 bg-muted/10"
                          >
                            <div className={cn(
                              "flex h-7 w-7 items-center justify-center rounded-lg border shrink-0",
                              m.kind === "distance"
                                ? "border-blue-500/30 bg-blue-500/10 text-blue-400"
                                : "border-purple-500/30 bg-purple-500/10 text-purple-400"
                            )}>
                              {m.kind === "distance"
                                ? <Ruler className="h-3 w-3" />
                                : <Triangle className="h-3 w-3" />}
                            </div>
                            <div className="flex-1 min-w-0">
                              {editingMsrId === m.id ? (
                                <input
                                  autoFocus
                                  type="text"
                                  value={m.label}
                                  onChange={e => updateMeasurementLabel(m.id, e.target.value)}
                                  onBlur={() => setEditingMsrId(null)}
                                  onKeyDown={e => { if (e.key === "Enter" || e.key === "Escape") setEditingMsrId(null); }}
                                  className="w-full text-xs font-bold bg-transparent border-b border-primary/40 outline-none"
                                />
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => setEditingMsrId(m.id)}
                                  className="text-xs font-bold text-left truncate hover:text-primary transition-colors group flex items-center gap-1"
                                >
                                  {m.label}
                                  <PencilLine className="h-2.5 w-2.5 opacity-0 group-hover:opacity-40" />
                                </button>
                              )}
                              <p className="text-[9px] text-muted-foreground font-mono">
                                {m.value.toFixed(2)} {m.unit} · {m.at}
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() => setMeasurements(prev => prev.filter(x => x.id !== m.id))}
                              className="h-6 w-6 flex items-center justify-center rounded-lg text-muted-foreground/40 hover:text-destructive hover:bg-destructive/10 transition-all shrink-0"
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

          {/* ── AI Overlays ── */}
          {overlays.length > 0 && (
            <Card noPadding className="overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-border/40">
                <div className="flex items-center gap-2">
                  <Layers3 className="h-4 w-4 text-primary" />
                  <h3 className="text-xs font-bold">AI Overlays</h3>
                  <Pill tone="accent" size="xs">{overlays.length}</Pill>
                </div>
                <IconBtn icon={RefreshCw} label="Re-generate overlays" onClick={onRefreshOverlays} variant="outline" size="sm" />
              </div>
              <div className="p-3 grid grid-cols-2 gap-2">
                {overlays.map(ov => (
                  <button
                    key={ov.key}
                    type="button"
                    onClick={() => setOverlayModal(ov)}
                    className="group relative aspect-video overflow-hidden rounded-xl border border-border/60 bg-black/80 hover:border-primary/50 transition-all"
                  >
                    <img
                      src={ov.url}
                      alt={ov.label}
                      className="h-full w-full object-cover opacity-60 transition group-hover:opacity-100"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
                    <div className="absolute bottom-1.5 left-2 right-2 flex items-center justify-between">
                      <span className="text-[9px] font-bold uppercase tracking-widest text-white/90 truncate">{ov.label}</span>
                      <Maximize2 className="h-3 w-3 text-white/50 shrink-0" />
                    </div>
                  </button>
                ))}
              </div>
            </Card>
          )}
        </div>
      </div>

      {/* ── Calibration status banner ── */}
      {!calibrated && (
        <div className="flex items-center justify-between gap-6 rounded-3xl border border-warning/30 bg-warning/5 px-8 py-5 glass-premium group hover-glow transition-all duration-500">
          <div className="flex items-center gap-5">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-warning/10 text-warning border border-warning/20 shadow-lg shadow-warning/5">
              <Target className="h-6 w-6 animate-pulse" />
            </div>
            <div className="space-y-1">
              <p className="text-lg font-black tracking-tight text-warning">Metric Calibration Pending</p>
              <p className="text-sm text-muted-foreground font-medium">Diagnostic measurements are currently restricted to pixel coordinates. Establish spatial reference for millimetric accuracy.</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => navigate("/calibrate")}
            className="shrink-0 flex items-center gap-3 h-12 px-6 rounded-2xl bg-warning text-warning-foreground font-black text-sm hover:scale-105 active:scale-95 transition-all shadow-xl shadow-warning/20"
          >
            <ScanLine className="h-5 w-5" /> INITIALIZE CALIBRATION
          </button>
        </div>
      )}
      {calibrated && pixPerMm && (
        <div className="flex items-center justify-between gap-6 rounded-3xl border border-success/30 bg-success/5 px-8 py-5 glass-premium group hover-glow transition-all duration-500">
          <div className="flex items-center gap-5">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-success/10 text-success border border-success/20 shadow-lg shadow-success/5">
              <CheckCircle2 className="h-6 w-6" />
            </div>
            <div className="space-y-1">
              <p className="text-lg font-black tracking-tight text-success">Spatial Integrity Validated</p>
              <p className="text-sm text-muted-foreground font-mono font-medium">
                PRECISION: {pixPerMm.toFixed(4)} PX/MM · REFERENCE: {activeCase?.calibrationDistanceMm} MM
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => navigate("/calibrate")}
            className="shrink-0 flex items-center gap-3 h-12 px-6 rounded-2xl border border-border/60 bg-card/60 text-sm font-black hover:bg-card hover:border-border transition-all hover-lift"
          >
            <ScanLine className="h-5 w-5 opacity-40" /> RECALIBRATE SYSTEM
          </button>
        </div>
      )}

      {/* ── Proceed ── */}
      <div className="flex justify-end">
        <SecondaryBtn onClick={() => navigate("/results")} icon={BarChart3} className="h-12 px-8">
          View Analysis Results <ChevronRight className="h-4 w-4 ml-1" />
        </SecondaryBtn>
      </div>

      {/* ── Context Menu ── */}
      {ctxMenu && (
        <div
          className="fixed z-[200] rounded-2xl border border-border/60 bg-popover/98 backdrop-blur-sm shadow-2xl overflow-hidden py-1.5 min-w-[210px] animate-in fade-in zoom-in-95 duration-100"
          style={{ left: ctxMenu.screenX + 4, top: ctxMenu.screenY + 4 }}
          onPointerDown={e => e.stopPropagation()}
        >
          {[
            { icon: Crosshair, label: "Select Landmark", action: () => setSelectedCode(ctxMenu.code) },
            { icon: Copy, label: "Copy Coordinates", action: () => copyLandmarkCoords(ctxMenu.code) },
            { icon: MousePointer2, label: "Center View Here", action: () => centerOnLandmark(ctxMenu.code) },
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

          {/* Reset to AI — only if adjusted */}
          {landmarks.find(l => l.code === ctxMenu.code)?.adjusted && origLandmarksRef.current.length > 0 && (
            <>
              <div className="h-px bg-border/40 mx-3 my-1" />
              <button
                type="button"
                onClick={() => { resetLandmarkToAI(ctxMenu.code); setCtxMenu(null); }}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-warning/10 transition-colors text-left text-warning/80"
              >
                <RotateCcw className="h-3.5 w-3.5 shrink-0" /> Reset to AI Position
              </button>
            </>
          )}

          {/* Clear adjustment flag */}
          {landmarks.find(l => l.code === ctxMenu.code)?.adjusted && (
            <button
              type="button"
              onClick={() => { clearAdjusted(ctxMenu.code); setCtxMenu(null); }}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-muted/40 transition-colors text-left text-muted-foreground"
            >
              <EyeOff className="h-3.5 w-3.5 shrink-0" /> Clear Adjusted Flag
            </button>
          )}
        </div>
      )}

      {/* ── Overlay Lightbox ── */}
      {overlayModal && (
        <div
          className="fixed inset-0 z-[300] bg-black/90 backdrop-blur-sm flex flex-col animate-in fade-in duration-150"
          onClick={() => setOverlayModal(null)}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 shrink-0" onClick={e => e.stopPropagation()}>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-white/40">AI Overlay</p>
              <h3 className="text-lg font-bold text-white">{overlayModal.label}</h3>
            </div>
            <div className="flex items-center gap-2">
              {/* Prev / Next navigation */}
              {overlays.length > 1 && (
                <>
                  <button type="button"
                    onClick={e => { e.stopPropagation(); const i = overlays.findIndex(o => o.key === overlayModal.key); setOverlayModal(overlays[(i - 1 + overlays.length) % overlays.length]); }}
                    className="h-9 w-9 flex items-center justify-center rounded-xl border border-white/10 text-white/60 hover:text-white hover:border-white/30 transition-all">
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <button type="button"
                    onClick={e => { e.stopPropagation(); const i = overlays.findIndex(o => o.key === overlayModal.key); setOverlayModal(overlays[(i + 1) % overlays.length]); }}
                    className="h-9 w-9 flex items-center justify-center rounded-xl border border-white/10 text-white/60 hover:text-white hover:border-white/30 transition-all">
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </>
              )}
              <a
                href={overlayModal.url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={e => e.stopPropagation()}
                className="h-9 w-9 flex items-center justify-center rounded-xl border border-white/10 text-white/60 hover:text-white hover:border-white/30 transition-all"
                title="Open full resolution in new tab"
              >
                <ExternalLink className="h-4 w-4" />
              </a>
              <button type="button" onClick={() => setOverlayModal(null)}
                className="h-9 w-9 flex items-center justify-center rounded-xl border border-white/10 text-white/60 hover:text-white hover:border-white/30 transition-all">
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Image */}
          <div className="flex-1 flex items-center justify-center p-6 overflow-hidden" onClick={e => e.stopPropagation()}>
            <img
              src={overlayModal.url}
              alt={overlayModal.label}
              className="max-h-full max-w-full rounded-2xl object-contain shadow-2xl"
            />
          </div>

          {/* Thumbnail strip */}
          {overlays.length > 1 && (
            <div className="flex items-center justify-center gap-2 pb-5 shrink-0" onClick={e => e.stopPropagation()}>
              {overlays.map(ov => (
                <button
                  key={ov.key}
                  type="button"
                  onClick={() => setOverlayModal(ov)}
                  className={cn(
                    "h-12 w-20 overflow-hidden rounded-xl border-2 transition-all",
                    ov.key === overlayModal.key ? "border-primary" : "border-transparent opacity-50 hover:opacity-80"
                  )}
                >
                  <img src={ov.url} alt={ov.label} className="h-full w-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── LandmarkChip ─────────────────────────────────────────────────────────────

function LandmarkChip({ landmark: lm, selected, hovered, color, onClick }: {
  landmark: Landmark; selected: boolean; hovered?: boolean; color?: string; onClick: () => void;
}) {
  const conf = lm.confidence >= 0.85 ? "oklch(0.75 0.13 160)" : lm.confidence >= 0.7 ? "oklch(0.71 0.13 230)" : "oklch(0.80 0.15 85)";
  return (
    <button
      type="button"
      onClick={onClick}
      title={`${lm.name} — ${Math.round(lm.confidence * 100)}% confidence`}
      className={cn(
        "group/chip flex items-center justify-between gap-3 p-2.5 rounded-xl border transition-all text-left hover-lift",
        selected ? "border-primary/50 bg-primary/10 shadow-sm"
          : hovered ? "border-primary/30 bg-muted/40"
            : "border-border/40 bg-card/40 hover:border-border/80 hover:bg-card/60"
      )}
    >
      <div className="min-w-0 flex items-center gap-2">
        <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-background border border-border/40 text-[9px] font-black uppercase tracking-tighter" style={selected && color ? { color, borderColor: color + '40' } : undefined}>
          {lm.code}
        </div>
        <div className="min-w-0">
          <p className="text-[10px] font-bold text-muted-foreground truncate uppercase tracking-tighter opacity-60 group-hover/chip:opacity-100 transition-opacity">
            {lm.name}
          </p>
          {lm.adjusted && <div className="h-0.5 w-4 bg-primary/60 rounded-full mt-0.5 animate-pulse" />}
        </div>
      </div>
      <div className="h-2 w-2 rounded-full shrink-0 shadow-sm" style={{ background: conf }} />
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
  selectedCode: string | null;
  hoveredCode: string | null;
  tool: ToolMode; setTool: (t: ToolMode) => void;
  onSelect: (code: string | null) => void;
  onHover: (code: string | null) => void;
  layers: Record<string, boolean>;
  planeVis: Record<string, boolean>;
  filters: ImageFilters;
  locked: boolean;
  pixPerMm: number | null;
  rulerPts: Point[]; setRulerPts: (pts: Point[]) => void;
  anglePts: Point[]; setAnglePts: (pts: Point[]) => void;
  alwaysLabels: boolean;
  flipH: boolean;
  centerTarget: Point | null;
  onCenterConsumed: () => void;
  onAddMeasurement: (m: Omit<SavedMeasurement, "id" | "at" | "label">) => void;
  measurements: SavedMeasurement[];
  onContextMenu: (code: string, x: number, y: number) => void;
  onFullscreen: () => void;
  fullscreen: boolean;
  fitSignal: number;
}

function CephCanvas({
  svgRef, imageUrl, landmarks, setLandmarks, pushUndo,
  selectedCode, hoveredCode, tool, setTool,
  onSelect, onHover, layers, planeVis, filters,
  locked, pixPerMm,
  rulerPts, setRulerPts, anglePts, setAnglePts,
  alwaysLabels, flipH, centerTarget, onCenterConsumed,
  onAddMeasurement, measurements, onContextMenu,
  onFullscreen, fullscreen, fitSignal,
}: CephCanvasProps) {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState<Point>({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [lastPanPt, setLastPanPt] = useState<Point | null>(null);
  const [draggingCode, setDraggingCode] = useState<string | null>(null);
  const [dragOrigin, setDragOrigin] = useState<Point | null>(null);
  const [cursorPt, setCursorPt] = useState<Point | null>(null);
  const [snapCode, setSnapCode] = useState<string | null>(null);
  const [liveRuler, setLiveRuler] = useState<Point | null>(null);
  const [liveAngle, setLiveAngle] = useState<Point | null>(null);

  // Pinch-to-zoom tracking
  const lastPinchDist = useRef<number | null>(null);

  // ── Zoom-to-fit: triggered by F key or when image loads ──
  const fitToView = useCallback(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, []);

  useEffect(() => {
    if (fitSignal > 0) fitToView();
  }, [fitSignal, fitToView]);

  // Auto-fit when image URL changes
  useEffect(() => {
    if (imageUrl) fitToView();
  }, [imageUrl]);

  // ── Center view on landmark ──
  useEffect(() => {
    if (!centerTarget) return;
    const targetZoom = Math.max(zoom, 2.5);
    // Center the target point in the viewport (SVG viewBox 1000x720 → center is 500,360)
    setPan({ x: 500 - centerTarget.x * targetZoom, y: 360 - centerTarget.y * targetZoom });
    setZoom(targetZoom);
    onCenterConsumed();
  }, [centerTarget]);

  // ── SVG coordinate transform ──
  function svgPt(e: React.PointerEvent | React.WheelEvent): Point {
    const svg = svgRef.current; if (!svg) return { x: 0, y: 0 };
    const r = svg.getBoundingClientRect();
    const cx = ('clientX' in e ? e.clientX : 0), cy = ('clientY' in e ? e.clientY : 0);
    const vx = ((cx - r.left) / r.width) * 1000;
    const vy = ((cy - r.top) / r.height) * 720;
    // No clamping — allow coordinates outside image for tool operations
    return { x: (vx - pan.x) / zoom, y: (vy - pan.y) / zoom };
  }

  function vpPt(e: React.PointerEvent | React.WheelEvent): Point {
    const svg = svgRef.current; if (!svg) return { x: 0, y: 0 };
    const r = svg.getBoundingClientRect();
    const cx = ('clientX' in e ? e.clientX : 0), cy = ('clientY' in e ? e.clientY : 0);
    return { x: ((cx - r.left) / r.width) * 1000, y: ((cy - r.top) / r.height) * 720 };
  }

  function nearestLandmark(pt: Point, threshSvg: number): Landmark | null {
    if (!["ruler", "angle"].includes(tool)) return null;
    let best: Landmark | null = null, bDist = threshSvg;
    for (const lm of landmarks) {
      const d = dist(pt, lm);
      if (d < bDist) { bDist = d; best = lm; }
    }
    return best;
  }

  // ── Zoom ──
  function applyZoom(factor: number, pivotVp: Point) {
    const nz = Math.max(0.5, Math.min(12, zoom * factor));
    setPan({ x: pivotVp.x - (pivotVp.x - pan.x) * nz / zoom, y: pivotVp.y - (pivotVp.y - pan.y) * nz / zoom });
    setZoom(nz);
  }

  function handleWheel(e: React.WheelEvent) {
    e.preventDefault();
    applyZoom(e.deltaY < 0 ? 1.12 : 1 / 1.12, vpPt(e));
  }

  // ── Pointer events ──
  function handlePointerDown(e: React.PointerEvent) {
    const activePan = tool === "pan" || e.altKey || e.button === 1;
    if (activePan) {
      (e.currentTarget as Element).setPointerCapture(e.pointerId);
      setIsPanning(true);
      setLastPanPt({ x: e.clientX, y: e.clientY });
      return;
    }
    if (locked && tool === "select") return;

    const raw = svgPt(e);
    const snap = nearestLandmark(raw, 22 / zoom);
    const pt = snap ? { x: snap.x, y: snap.y } : raw;

    if (tool === "ruler") {
      const next = rulerPts.length >= 2 ? [pt] : [...rulerPts, pt];
      setRulerPts(next);
      if (next.length === 2) {
        const d = dist(next[0], next[1]);
        const mm = pixPerMm ? d / pixPerMm : null;
        onAddMeasurement({ kind: "distance", value: mm ?? d, unit: mm ? "mm" : "px", pts: next });
        toast.success(mm ? `${mm.toFixed(2)} mm` : `${d.toFixed(0)} px`, { description: "Saved to Measures tab" });
      }
      return;
    }
    if (tool === "angle") {
      const next = anglePts.length >= 3 ? [pt] : [...anglePts, pt];
      setAnglePts(next);
      if (next.length === 3) {
        const deg = angleDeg(next[1], next[0], next[2]);
        onAddMeasurement({ kind: "angle", value: deg, unit: "°", pts: next });
        toast.success(`${deg.toFixed(2)}°`, { description: "Angle saved to Measures tab" });
      }
      return;
    }
    if (tool === "select") { onSelect(null); }
  }

  function handlePointerMove(e: React.PointerEvent) {
    const raw = svgPt(e);
    setCursorPt(raw);

    // Snap detection for measurement tools
    const snap = nearestLandmark(raw, 22 / zoom);
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

    if (draggingCode && !locked) {
      setLandmarks(landmarks.map(l => l.code === draggingCode
        ? { ...l, x: raw.x, y: raw.y, adjusted: true }
        : l
      ));
      return;
    }

    if (tool === "ruler" && rulerPts.length === 1) setLiveRuler(raw);
    if (tool === "angle" && (anglePts.length === 1 || anglePts.length === 2)) setLiveAngle(raw);
  }

  function handlePointerUp(e: React.PointerEvent) {
    try { (e.currentTarget as Element).releasePointerCapture(e.pointerId); } catch { }

    if (draggingCode && dragOrigin) {
      const lm = landmarks.find(l => l.code === draggingCode);
      if (lm && dist(dragOrigin, { x: lm.x, y: lm.y }) > 2) {
        toast.success(`${draggingCode} adjusted`, { description: "Ctrl+Z to undo · Right-click to reset" });
      }
    }
    setDraggingCode(null); setDragOrigin(null);
    setIsPanning(false); setLastPanPt(null);
  }

  // ── Double-click to zoom in/out ──
  function handleDoubleClick(e: React.MouseEvent) {
    const vp = vpPt(e as unknown as React.PointerEvent);
    if (zoom >= 4) {
      setZoom(1); setPan({ x: 0, y: 0 });
    } else {
      applyZoom(2, vp);
    }
  }

  // ── Touch pinch-to-zoom ──
  function handleTouchMove(e: React.TouchEvent) {
    if (e.touches.length === 2) {
      e.preventDefault();
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (lastPinchDist.current !== null) {
        const factor = d / lastPinchDist.current;
        const svg = svgRef.current; if (!svg) return;
        const r = svg.getBoundingClientRect();
        const cx = (e.touches[0].clientX + e.touches[1].clientX) / 2;
        const cy = (e.touches[0].clientY + e.touches[1].clientY) / 2;
        const pivotVp = {
          x: ((cx - r.left) / r.width) * 1000,
          y: ((cy - r.top) / r.height) * 720,
        };
        applyZoom(factor, pivotVp);
      }
      lastPinchDist.current = d;
    }
  }
  function handleTouchEnd() { lastPinchDist.current = null; }

  const byCode = useMemo(() => Object.fromEntries(landmarks.map(l => [l.code, l])), [landmarks]);

  const activePlanes = useMemo(() => TRACING_PLANES.filter(p => {
    if (!layers.planes || !planeVis[p.key]) return false;
    if (p.group === "soft" && !layers.softTissue) return false;
    return byCode[p.from] && byCode[p.to];
  }), [byCode, layers, planeVis]);

  const cssFilter = [
    `brightness(${filters.brightness}%)`,
    `contrast(${filters.contrast}%)`,
    filters.invert ? "invert(100%)" : "",
  ].filter(Boolean).join(" ");

  const activeTool = TOOLS.find(t => t.mode === tool);

  // ── Cursor style ──
  const cursorClass =
    isPanning || tool === "pan" ? "cursor-grab" :
      draggingCode ? "cursor-grabbing" :
        tool === "select" && !locked ? "cursor-crosshair" :
          tool === "ruler" || tool === "angle" ? "cursor-crosshair" :
            "cursor-default";

  return (
    <div className="relative">
      <Card noPadding className="relative overflow-hidden bg-[#07070e] border-border/20 shadow-2xl group/viewer">

        {/* ── SVG filter defs ── */}
        <svg width="0" height="0" className="absolute">
          <defs>
            <filter id="ceph-gamma">
              <feComponentTransfer>
                <feFuncR type="gamma" amplitude="1" exponent={1 / filters.gamma} offset="0" />
                <feFuncG type="gamma" amplitude="1" exponent={1 / filters.gamma} offset="0" />
                <feFuncB type="gamma" amplitude="1" exponent={1 / filters.gamma} offset="0" />
              </feComponentTransfer>
            </filter>
            <filter id="ceph-sharpen">
              <feConvolveMatrix order="3" kernelMatrix="0 -0.6 0 -0.6 3.4 -0.6 0 -0.6 0" preserveAlpha="true" />
            </filter>
            <filter id="ceph-sharpen-gamma">
              <feComponentTransfer result="g">
                <feFuncR type="gamma" amplitude="1" exponent={1 / filters.gamma} offset="0" />
                <feFuncG type="gamma" amplitude="1" exponent={1 / filters.gamma} offset="0" />
                <feFuncB type="gamma" amplitude="1" exponent={1 / filters.gamma} offset="0" />
              </feComponentTransfer>
              <feConvolveMatrix in="g" order="3" kernelMatrix="0 -0.6 0 -0.6 3.4 -0.6 0 -0.6 0" preserveAlpha="true" />
            </filter>
          </defs>
        </svg>

        {/* ── Tool palette ── */}
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
                  tool === t.mode
                    ? "bg-primary text-primary-foreground shadow-lg shadow-primary/30"
                    : "text-white/40 hover:bg-white/10 hover:text-white"
                )}
              >
                <t.icon className="h-3.5 w-3.5" />
                <span className="text-[7px] font-bold opacity-70">{t.shortcut}</span>
              </button>
            ))}
            <div className="h-px bg-white/10 my-0.5 mx-1" />
            {/* Fit to view */}
            <button
              type="button"
              onClick={fitToView}
              title="Fit to view (F)"
              className="flex h-8 w-10 items-center justify-center text-[8px] font-bold text-white/25 hover:text-white hover:bg-white/10 rounded-xl transition-all"
            >FIT</button>
          </div>
        </div>

        {/* ── Top overlay bar ── */}
        <div className="absolute top-0 inset-x-0 z-10 flex items-center justify-between px-4 py-2 bg-gradient-to-b from-black/85 to-transparent pointer-events-none">
          <div className="flex items-center gap-2 pointer-events-auto">
            {/* Active tool indicator */}
            <div className={cn(
              "flex items-center gap-2 px-3 py-1.5 rounded-full backdrop-blur border shadow-lg text-[9px] font-bold uppercase tracking-widest",
              tool === "ruler" || tool === "angle" ? "bg-primary/25 border-primary/50 text-primary"
                : "bg-black/60 border-white/10 text-white/80"
            )}>
              <div className={cn("h-1.5 w-1.5 rounded-full shrink-0",
                tool === "ruler" || tool === "angle" ? "bg-primary animate-pulse" : "bg-emerald-400"
              )} />
              {activeTool?.label}
            </div>
            {/* Zoom indicator */}
            {zoom !== 1 && (
              <div className="flex items-center gap-1 px-2.5 py-1.5 rounded-full bg-primary/20 backdrop-blur border border-primary/40 text-[9px] font-bold text-primary">
                <ZoomIn className="h-2.5 w-2.5" />{Math.round(zoom * 100)}%
              </div>
            )}
            {/* Lock indicator */}
            {locked && (
              <div className="flex items-center gap-1 px-2.5 py-1.5 rounded-full bg-destructive/20 backdrop-blur border border-destructive/40 text-[9px] font-bold text-destructive">
                <Lock className="h-2.5 w-2.5" /> Locked
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
              title="Toggle fullscreen"
              className="flex h-8 w-8 items-center justify-center rounded-xl bg-black/60 border border-white/10 text-white/40 hover:text-white transition-colors"
            >
              {fullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
            </button>
          </div>
        </div>

        {/* ── Main SVG canvas ── */}
        <div className="aspect-[1000/720] min-h-[520px]">
          <svg
            ref={svgRef}
            viewBox="0 0 1000 720"
            className={cn("h-full w-full touch-none select-none", cursorClass)}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerUp}
            onWheel={handleWheel}
            onDoubleClick={handleDoubleClick}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
          >
            <rect width="1000" height="720" fill="#070710" />

            <g transform={`translate(${pan.x},${pan.y}) scale(${zoom})`}>

              {/* ── X-ray Image ── */}
              {imageUrl ? (
                <g filter={
                  filters.sharpen && filters.gamma !== 1 ? "url(#ceph-sharpen-gamma)" :
                    filters.sharpen ? "url(#ceph-sharpen)" :
                      filters.gamma !== 1 ? "url(#ceph-gamma)" : undefined
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
                  <rect x="80" y="120" width="840" height="480" rx="32"
                    fill="rgba(255,255,255,0.012)" stroke="rgba(255,255,255,0.05)" strokeDasharray="14 8" />
                  <ImageOff x="455" y="285" width="90" height="90"
                    color="rgba(255,255,255,0.07)" />
                  <text x="500" y="410" fill="rgba(255,255,255,0.18)" fontSize="18"
                    fontWeight="bold" textAnchor="middle" fontFamily="system-ui">Cephalometric Image</text>
                  <text x="500" y="440" fill="rgba(255,255,255,0.08)" fontSize="12"
                    textAnchor="middle" fontFamily="system-ui">Upload X-ray · Run AI · View results</text>
                </g>
              )}

              {/* ── Reference Grid ── */}
              {layers.grid && (
                <g opacity="0.08">
                  {Array.from({ length: 11 }).map((_, i) => (
                    <line key={`v${i}`} x1={i * 100} y1="0" x2={i * 100} y2="720" stroke="#60a5fa" strokeWidth="0.6" />
                  ))}
                  {Array.from({ length: 8 }).map((_, i) => (
                    <line key={`h${i}`} x1="0" y1={(i + 1) * 90} x2="1000" y2={(i + 1) * 90} stroke="#60a5fa" strokeWidth="0.6" />
                  ))}
                  <text x="7" y="13" fill="rgba(96,165,250,0.35)" fontSize="7" fontFamily="system-ui">100 px</text>
                </g>
              )}

              {/* ── Tracing Planes ── */}
              {activePlanes.map(plane => {
                const p1 = byCode[plane.from], p2 = byCode[plane.to];
                if (!p1 || !p2) return null;
                const [e1, e2] = extendedLine(p1, p2, 70);
                const midX = (e1.x + e2.x) / 2, midY = (e1.y + e2.y) / 2 - 14;
                const lw = plane.label.length * 6 + 12;
                return (
                  <g key={plane.key} className="animate-in fade-in duration-500">
                    <line x1={e1.x} y1={e1.y} x2={e2.x} y2={e2.y}
                      stroke={plane.color} strokeOpacity="0.07" strokeWidth="12" />
                    <line x1={e1.x} y1={e1.y} x2={e2.x} y2={e2.y}
                      stroke={plane.color} strokeOpacity="0.7" strokeWidth="1.5"
                      strokeDasharray={plane.dashed ? "8 5" : undefined} />
                    <g transform={`translate(${midX},${midY})`}>
                      <rect x="-2" y="-9" width={lw} height="14" rx="4" fill="rgba(0,0,0,0.80)" />
                      <text x={lw / 2 - 2} y="2" fill={plane.color} fontSize="9" fontWeight="bold"
                        textAnchor="middle" fontFamily="system-ui">{plane.label}</text>
                    </g>
                  </g>
                );
              })}

              {/* ── Soft tissue profile ── */}
              {layers.softTissue &&
                byCode.N_st && byCode.Prn && byCode.Ls && byCode.Li && byCode.Pog_st && (
                  <path
                    d={`M ${byCode.N_st.x} ${byCode.N_st.y}
                    C ${byCode.Prn.x + 50} ${byCode.N_st.y + 70}, ${byCode.Prn.x + 35} ${byCode.Prn.y - 25}, ${byCode.Prn.x} ${byCode.Prn.y}
                    C ${byCode.Prn.x - 12} ${byCode.Prn.y + 35}, ${byCode.Ls.x + 25} ${byCode.Ls.y - 20}, ${byCode.Ls.x} ${byCode.Ls.y}
                    C ${byCode.Ls.x - 10} ${byCode.Ls.y + 20}, ${byCode.Li.x + 10} ${byCode.Li.y - 15}, ${byCode.Li.x} ${byCode.Li.y}
                    C ${byCode.Li.x - 10} ${byCode.Li.y + 25}, ${byCode.Pog_st.x + 20} ${byCode.Pog_st.y - 25}, ${byCode.Pog_st.x} ${byCode.Pog_st.y}`}
                    fill="none" stroke="#fb7185" strokeOpacity="0.55" strokeWidth="2.5" strokeLinecap="round" />
                )}

              {/* ── Saved Measurements overlay on canvas ── */}
              {layers.measurements && measurements.map(m => {
                if (m.kind === "distance" && m.pts.length >= 2) {
                  const [p1, p2] = m.pts;
                  const midX = (p1.x + p2.x) / 2, midY = (p1.y + p2.y) / 2;
                  const lw = m.label.length * 5.5 + 14;
                  return (
                    <g key={m.id} opacity="0.75">
                      <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y}
                        stroke="#60a5fa" strokeOpacity="0.5" strokeWidth="1.2" strokeDasharray="6 3" />
                      <circle cx={p1.x} cy={p1.y} r="3" fill="#60a5fa" stroke="#000" strokeWidth="1" />
                      <circle cx={p2.x} cy={p2.y} r="3" fill="#60a5fa" stroke="#000" strokeWidth="1" />
                      <g transform={`translate(${midX + 4},${midY - 22})`}>
                        <rect x="-2" y="-9" width={lw} height="13" rx="4" fill="rgba(0,0,0,0.85)" />
                        <text x={lw / 2 - 2} y="1" fill="#60a5fa" fontSize="8" fontWeight="bold"
                          textAnchor="middle" fontFamily="system-ui">{m.label}</text>
                      </g>
                    </g>
                  );
                }
                if (m.kind === "angle" && m.pts.length === 3) {
                  const [p1, p2, p3] = m.pts;
                  return (
                    <g key={m.id} opacity="0.70">
                      <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke="#a78bfa" strokeWidth="1.2" strokeOpacity="0.5" />
                      <line x1={p2.x} y1={p2.y} x2={p3.x} y2={p3.y} stroke="#a78bfa" strokeWidth="1.2" strokeOpacity="0.5" />
                      <path d={arcPath(p2, p1, p3, 24)}
                        fill="rgba(167,139,250,0.08)" stroke="#a78bfa" strokeWidth="1.2" strokeOpacity="0.6" />
                      {[p1, p2, p3].map((pt, i) => (
                        <circle key={i} cx={pt.x} cy={pt.y} r="2.5" fill="#a78bfa" stroke="#000" strokeWidth="1" />
                      ))}
                      <g transform={`translate(${p2.x + 28},${p2.y - 14})`}>
                        <rect x="-2" y="-8" width="46" height="12" rx="3" fill="rgba(0,0,0,0.85)" />
                        <text x="21" y="1" fill="#a78bfa" fontSize="8" fontWeight="bold"
                          textAnchor="middle" fontFamily="system-ui">{m.label}</text>
                      </g>
                    </g>
                  );
                }
                return null;
              })}

              {/* ── Landmarks ── */}
              {layers.landmarks && landmarks.map(lm => {
                const sel = lm.code === selectedCode;
                const hov = lm.code === hoveredCode;
                const snap = lm.code === snapCode;
                const gc = getGroupColor(lm.code);
                const cc = lm.confidence >= 0.85 ? "#4ade80" : lm.confidence >= 0.7 ? "#60a5fa" : "#f59e0b";
                const dc = sel ? gc : cc;
                const r = sel ? 6 : hov ? 5 : 4;

                return (
                  <g
                    key={lm.code}
                    onPointerDown={e => {
                      e.stopPropagation();
                      if (tool === "select" && !locked) {
                        (e.currentTarget as Element).setPointerCapture(e.pointerId);
                        pushUndo();
                        setDraggingCode(lm.code);
                        setDragOrigin({ x: lm.x, y: lm.y });
                        onSelect(lm.code);
                      }
                    }}
                    onPointerEnter={() => onHover(lm.code)}
                    onPointerLeave={() => onHover(null)}
                    onContextMenu={e => {
                      e.preventDefault(); e.stopPropagation();
                      onContextMenu(lm.code, e.clientX, e.clientY);
                    }}
                    className={tool === "select" && !locked ? "cursor-move" : "cursor-pointer"}
                  >
                    {/* Snap ring */}
                    {snap && !sel && (
                      <circle cx={lm.x} cy={lm.y} r="20" fill="none"
                        stroke="#fff" strokeOpacity="0.55" strokeWidth="1.5"
                        strokeDasharray="4 3" className="animate-pulse" />
                    )}
                    {/* Selection rings */}
                    {sel && <>
                      <circle cx={lm.x} cy={lm.y} r="34" fill="none"
                        stroke={gc} strokeOpacity="0.1" strokeWidth="1.5" className="animate-pulse" />
                      <circle cx={lm.x} cy={lm.y} r="22" fill="none"
                        stroke={gc} strokeOpacity="0.35" strokeWidth="1.5" strokeDasharray="5 3" />
                    </>}
                    {/* Hover ring */}
                    {hov && !sel && (
                      <circle cx={lm.x} cy={lm.y} r="16" fill="none"
                        stroke={dc} strokeOpacity="0.3" strokeWidth="1" />
                    )}
                    {/* Crosshair arms */}
                    {[[-14, 0, -4, 0], [4, 0, 14, 0], [0, -14, 0, -4], [0, 4, 0, 14]].map(([x1, y1, x2, y2], i) => (
                      <line key={i}
                        x1={lm.x + x1} y1={lm.y + y1} x2={lm.x + x2} y2={lm.y + y2}
                        stroke={dc} strokeWidth={sel ? 2.5 : hov ? 2 : 1.8} strokeLinecap="round" />
                    ))}
                    {/* Center dot — diamond for low confidence */}
                    {lm.confidence < 0.7 ? (
                      <polygon
                        points={`${lm.x},${lm.y - r} ${lm.x + r},${lm.y} ${lm.x},${lm.y + r} ${lm.x - r},${lm.y}`}
                        fill={dc} stroke="#000" strokeWidth="1.2" />
                    ) : (
                      <circle cx={lm.x} cy={lm.y} r={r} fill={dc} stroke="#000" strokeWidth="1.5" />
                    )}
                    {/* Adjusted indicator */}
                    {lm.adjusted && (
                      <circle cx={lm.x + 8} cy={lm.y - 8} r="3" fill="#60a5fa" stroke="#000" strokeWidth="1" />
                    )}
                    {/* Label */}
                    {(alwaysLabels || sel || hov || zoom >= 2.5) && (() => {
                      const lw = Math.max(28, lm.code.length * 6.5 + 10);
                      return (
                        <g transform={`translate(${lm.x + 14},${lm.y - 26})`}>
                          <rect width={lw} height="17" rx="5"
                            fill="rgba(0,0,0,0.92)" stroke={dc} strokeOpacity="0.5" strokeWidth="0.5" />
                          <text x={lw / 2} y="12"
                            fill="white" fontSize="9.5" fontWeight="bold" textAnchor="middle" fontFamily="system-ui">
                            {lm.code}
                          </text>
                        </g>
                      );
                    })()}
                    {/* Hover tooltip */}
                    {hov && !sel && (() => {
                      const tw = Math.max(64, lm.name.length * 5 + 16);
                      return (
                        <g transform={`translate(${lm.x + 14},${lm.y + 14})`}>
                          <rect width={tw} height="30" rx="6" fill="rgba(0,0,0,0.92)" />
                          <text x={tw / 2} y="12" fill="rgba(255,255,255,0.80)" fontSize="8.5"
                            textAnchor="middle" fontFamily="system-ui">{lm.name}</text>
                          <text x={tw / 2} y="23" fill={cc} fontSize="8"
                            textAnchor="middle" fontFamily="system-ui">{Math.round(lm.confidence * 100)}% confidence</text>
                        </g>
                      );
                    })()}
                  </g>
                );
              })}

              {/* ── Ruler tool ── */}
              {rulerPts.length > 0 && (() => {
                const p1 = rulerPts[0], p2 = rulerPts[1] ?? liveRuler;
                if (!p2) return null;
                const pd = dist(p1, p2), mm = pixPerMm ? pd / pixPerMm : null;
                const midX = (p1.x + p2.x) / 2, midY = (p1.y + p2.y) / 2;
                const t1 = perpTick(p1, p2, 8), t2 = perpTick(p2, p1, 8);
                const lw = mm ? 90 : 68;
                return (
                  <g>
                    <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y}
                      stroke="#60a5fa" strokeOpacity="0.10" strokeWidth="10" />
                    <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y}
                      stroke="#60a5fa" strokeOpacity="0.85" strokeWidth="1.5"
                      strokeDasharray={rulerPts.length === 1 ? "6 4" : undefined} />
                    <line x1={t1.x1} y1={t1.y1} x2={t1.x2} y2={t1.y2}
                      stroke="#60a5fa" strokeWidth="2" strokeOpacity="0.85" />
                    <line x1={t2.x1} y1={t2.y1} x2={t2.x2} y2={t2.y2}
                      stroke="#60a5fa" strokeWidth="2" strokeOpacity="0.85" />
                    <circle cx={p1.x} cy={p1.y} r="5" fill="#60a5fa" stroke="#000" strokeWidth="1.5" />
                    {rulerPts.length === 2 && <circle cx={p2.x} cy={p2.y} r="5" fill="#60a5fa" stroke="#000" strokeWidth="1.5" />}
                    <g transform={`translate(${midX + 6},${midY - 34})`}>
                      <rect x="-2" y="-12" width={lw} height="40" rx="9"
                        fill="rgba(0,0,0,0.92)" stroke="#60a5fa" strokeWidth="1" />
                      <text x={lw / 2 - 2} y="4" fill="#60a5fa" fontSize="12" fontWeight="bold"
                        textAnchor="middle" fontFamily="system-ui">
                        {mm ? `${mm.toFixed(2)} mm` : `${pd.toFixed(0)} px`}
                      </text>
                      <text x={lw / 2 - 2} y="19" fill="rgba(96,165,250,0.5)" fontSize="8.5"
                        textAnchor="middle" fontFamily="system-ui">
                        {pd.toFixed(0)} px
                      </text>
                    </g>
                  </g>
                );
              })()}

              {/* ── Angle tool ── */}
              {anglePts.length >= 1 && (() => {
                const p1 = anglePts[0], p2 = anglePts[1] ?? liveAngle;
                if (!p2) return null;
                const p3 = anglePts[2] ?? (anglePts.length === 2 ? liveAngle : null);
                return (
                  <g>
                    <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y}
                      stroke="#a78bfa" strokeOpacity="0.85" strokeWidth="1.5"
                      strokeDasharray={anglePts.length < 2 ? "6 4" : undefined} />
                    {p3 && <>
                      <line x1={p2.x} y1={p2.y} x2={p3.x} y2={p3.y}
                        stroke="#a78bfa" strokeOpacity="0.85" strokeWidth="1.5"
                        strokeDasharray={anglePts.length < 3 ? "6 4" : undefined} />
                      <path d={arcPath(p2, p1, p3, 32)}
                        fill="rgba(167,139,250,0.1)" stroke="#a78bfa" strokeOpacity="0.7"
                        strokeWidth="1.5" strokeDasharray="4 3" />
                      <g transform={`translate(${p2.x + 40},${p2.y - 18})`}>
                        <rect x="-2" y="-10" width="60" height="24" rx="7"
                          fill="rgba(0,0,0,0.92)" stroke="#a78bfa" strokeWidth="1" />
                        <text x="28" y="7" fill="#a78bfa" fontSize="13" fontWeight="bold"
                          textAnchor="middle" fontFamily="system-ui">
                          {angleDeg(p2, p1, p3).toFixed(1)}°
                        </text>
                      </g>
                    </>}
                    {[p1, p2, ...(p3 ? [p3] : [])].map((pt, i) => (
                      <circle key={i} cx={pt.x} cy={pt.y} r="5"
                        fill="#a78bfa" stroke="#000" strokeWidth="1.5" />
                    ))}
                  </g>
                );
              })()}

            </g>{/* end pan/zoom transform */}

            {/* ── Minimap (outside pan group) ── */}
            {zoom > 1.5 && (
              <g transform="translate(838,556)">
                <rect width="150" height="108" rx="10"
                  fill="rgba(0,0,0,0.85)" stroke="rgba(255,255,255,0.08)" strokeWidth="1" />
                <text x="8" y="13" fill="rgba(255,255,255,0.22)" fontSize="7"
                  fontFamily="system-ui" fontWeight="bold">MINIMAP</text>
                {/* Landmark dots on minimap */}
                {landmarks.map(lm => (
                  <circle key={lm.code}
                    cx={9 + (lm.x / 1000) * 132}
                    cy={18 + (lm.y / 720) * 82}
                    r={lm.code === selectedCode ? 2.5 : 1.2}
                    fill={getGroupColor(lm.code)} opacity="0.85" />
                ))}
                {/* Viewport rectangle — corrected calculation */}
                {(() => {
                  // The visible area in SVG-world coordinates:
                  // left = -pan.x/zoom, top = -pan.y/zoom
                  // width = 1000/zoom, height = 720/zoom
                  const vLeft = -pan.x / zoom;
                  const vTop = -pan.y / zoom;
                  const vWidth = 1000 / zoom;
                  const vHeight = 720 / zoom;
                  // Map to minimap space (132 wide × 82 tall, offset 9,18)
                  const rx = 9 + Math.max(0, vLeft / 1000 * 132);
                  const ry = 18 + Math.max(0, vTop / 720 * 82);
                  const rw = Math.min(132 - Math.max(0, vLeft / 1000 * 132), vWidth / 1000 * 132);
                  const rh = Math.min(82 - Math.max(0, vTop / 720 * 82), vHeight / 720 * 82);
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

        {/* ── Zoom controls ── */}
        <div className="absolute right-4 bottom-14 z-10">
          <div className="flex flex-col rounded-xl border border-white/10 bg-black/80 backdrop-blur-md p-1 shadow-2xl gap-0.5">
            <IconBtn icon={ZoomIn} label="Zoom In (+)"
              onClick={() => applyZoom(1.3, { x: 500, y: 360 })}
              variant="ghost" size="sm" className="text-white/60 hover:text-white" />
            <div className="h-px bg-white/5 mx-1.5" />
            <IconBtn icon={ZoomOut} label="Zoom Out (-)"
              onClick={() => {
                const nz = Math.max(0.5, zoom / 1.3);
                if (nz <= 1) { setZoom(1); setPan({ x: 0, y: 0 }); }
                else applyZoom(1 / 1.3, { x: 500, y: 360 });
              }}
              variant="ghost" size="sm" className="text-white/60 hover:text-white" />
            <div className="h-px bg-white/5 mx-1.5" />
            <button type="button" onClick={fitToView}
              className="h-8 w-8 flex items-center justify-center text-[8px] font-bold text-white/25 hover:text-white transition-colors">
              1:1
            </button>
          </div>
        </div>

        {/* ── Status bar ── */}
        <div className="border-t border-white/5 bg-black/70 px-4 py-1.5 flex items-center justify-between text-[9px] font-mono text-white/30">
          <span className="flex items-center gap-4">
            {cursorPt && (
              <>
                <span>X: <span className="text-white/60">{Math.round(cursorPt.x)}</span></span>
                <span>Y: <span className="text-white/60">{Math.round(cursorPt.y)}</span></span>
                {pixPerMm && (
                  <span className="text-primary/60">
                    {(cursorPt.x / pixPerMm).toFixed(1)} · {(cursorPt.y / pixPerMm).toFixed(1)} mm
                  </span>
                )}
              </>
            )}
            {/* Tool hint */}
            <span className="text-white/20 italic hidden lg:block">
              {activeTool?.hint}
            </span>
          </span>
          <span className="flex items-center gap-3">
            {snapCode && <span className="text-yellow-400/70">⊕ {snapCode}</span>}
            {landmarks.length > 0 && <span><span className="text-white/50">{landmarks.length}</span> pts</span>}
            <span>Zoom <span className="text-white/50">{Math.round(zoom * 100)}%</span></span>
            <span className="hidden lg:flex items-center gap-1">
              {["S", "H", "R", "A", "F", "X", "C=Calib"].map(k => (
                <kbd key={k} className="bg-white/8 px-1 py-0.5 rounded text-[8px]">{k}</kbd>
              ))}
            </span>
          </span>
        </div>
      </Card>

      {/* ── Clear tool overlays ── */}
      {(rulerPts.length > 0 || anglePts.length > 0) && (
        <div className="flex justify-end gap-3 mt-1">
          {rulerPts.length > 0 && (
            <button type="button"
              onClick={() => { setRulerPts([]); setLiveRuler(null); }}
              className="flex items-center gap-1 text-[10px] font-bold text-muted-foreground hover:text-foreground transition-colors">
              <X className="h-3 w-3" /> Clear ruler
            </button>
          )}
          {anglePts.length > 0 && (
            <button type="button"
              onClick={() => { setAnglePts([]); setLiveAngle(null); }}
              className="flex items-center gap-1 text-[10px] font-bold text-muted-foreground hover:text-foreground transition-colors">
              <X className="h-3 w-3" /> Clear angle
            </button>
          )}
        </div>
      )}
    </div>
  );
}
