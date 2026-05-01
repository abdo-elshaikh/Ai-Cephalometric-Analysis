import React, { useState, useRef, useEffect } from "react";
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
  Maximize2,
  Minimize2,
  Crosshair,
  Settings2,
  Lock,
  Unlock
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
} from "@/components/_core/ClinicalComponents";
import {
  confidenceTone,
} from "@/lib/clinical-utils";
import { 
  type CaseRecord, 
  type Landmark, 
  type Point, 
  type OverlayArtifact 
} from "@/lib/mappers";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface ViewerPageProps {
  activeCase?: CaseRecord;
  landmarks: Landmark[];
  setLandmarks: (l: Landmark[]) => void;
  overlays: OverlayArtifact[];
  onCalibrate: (pts: Point[], mm: number) => void | Promise<void>;
  onSaveAndSend: (isCbct: boolean) => void | Promise<void>;
  onRefreshOverlays: () => void | Promise<void>;
}

export default function ViewerPage({
  activeCase,
  landmarks,
  setLandmarks,
  overlays,
  onCalibrate,
  onSaveAndSend,
  onRefreshOverlays,
}: ViewerPageProps) {
  const [, navigate] = useLocation();
  const [selectedCode, setSelectedCode] = useState<string | null>(null);
  const [calibMode, setCalibMode] = useState(false);
  const [isCbct, setIsCbct] = useState(false);
  const [calibPts, setCalibPts] = useState<Point[]>(activeCase?.calibrationPoints ?? []);
  const [distMm, setDistMm] = useState(String(activeCase?.calibrationDistanceMm ?? 10));
  const [layers, setLayers] = useState({ 
    landmarks: true, 
    measurements: true, 
    softTissue: true, 
    heatmap: false, 
    grid: false 
  });
  const [isLocked, setIsLocked] = useState(false);

  useEffect(() => { 
    setCalibPts(activeCase?.calibrationPoints ?? []); 
    setDistMm(String(activeCase?.calibrationDistanceMm ?? 10)); 
  }, [activeCase?.id]);

  const selected = landmarks.find(l => l.code === selectedCode);
  const lowConf = landmarks.filter(l => l.confidence < 0.7);

  const [filters, setFilters] = useState({ brightness: 100, contrast: 100 });
  const [adjustmentModal, setAdjustmentModal] = useState<{ code: string; pt: Point } | null>(null);
  const [adjustmentReason, setAdjustmentReason] = useState("");

  function updateLandmark(code: string, patch: Partial<Landmark>) {
    if (isLocked) return;
    setLandmarks(landmarks.map(l => l.code === code ? { ...l, ...patch, adjusted: true } : l));
  }

  function handleLandmarkMove(code: string, pt: Point) {
    if (isLocked) return;
    setAdjustmentModal({ code, pt });
  }

  function confirmAdjustment() {
    if (!adjustmentModal) return;
    const { code, pt } = adjustmentModal;
    updateLandmark(code, { ...pt, adjusted: true });
    toast.success(`Adjustment recorded: ${adjustmentReason || "Manual correction"}`);
    setAdjustmentModal(null);
    setAdjustmentReason("");
  }

  const layerLabels: Record<string, string> = { 
    landmarks: "Clinical Landmarks", 
    measurements: "Diagnostic Planes", 
    softTissue: "Soft Tissue Profile", 
    heatmap: "Confidence Mapping", 
    grid: "Reference Grid" 
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <PageHeader
        eyebrow="Diagnostic Review"
        title="Clinical Viewer"
        description="Verify landmark placement, adjust reference points, and review AI-generated diagnostic overlays."
        actions={
          <>
            <SecondaryBtn
              onClick={() => setCalibMode(p => !p)}
              icon={Ruler}
              className={calibMode ? "border-warning/40 bg-warning/10 text-warning" : ""}
            >
              {calibMode ? "Close Calibration" : "Calibrate Scale"}
            </SecondaryBtn>
            <div className="flex items-center gap-3 px-3 py-2 rounded-xl border border-border/40 bg-muted/20">
               <input 
                 type="checkbox" 
                 id="viewer-cbct" 
                 checked={isCbct} 
                 onChange={e => setIsCbct(e.target.checked)}
                 className="h-4 w-4 rounded border-border/60 bg-muted/40 text-primary accent-primary" 
               />
               <label htmlFor="viewer-cbct" className="text-xs font-bold text-muted-foreground cursor-pointer select-none">CBCT Data</label>
            </div>
            <PrimaryBtn onClick={() => onSaveAndSend(isCbct)} icon={Save}>
              Save Corrections
            </PrimaryBtn>
          </>
        }
      />

      <div className="grid gap-6 xl:grid-cols-[1fr_340px]">
        <div className="space-y-4">
          <CephPreview
            imageUrl={activeCase?.imageUrl} 
            landmarks={landmarks} 
            selectedCode={selectedCode}
            onSelect={setSelectedCode} 
            onMove={handleLandmarkMove}
            layers={layers} 
            filters={filters}
            calibrationMode={calibMode} 
            calibrationPoints={calibPts}
            locked={isLocked}
            onCalibrationPoint={pt => setCalibPts(p => { 
              const n = p.length >= 2 ? [pt] : [...p, pt]; 
              if (n.length === 2) toast.info("Reference points set. Save to calibrate."); 
              return n; 
            })}
          />
          
          {/* Draggable landmark summary */}
          <Card className="p-6">
             <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                   <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                      <Crosshair className="h-5 w-5" />
                   </div>
                   <div>
                      <h4 className="font-bold tracking-tight">Landmark Inventory</h4>
                      <p className="text-xs text-muted-foreground">{landmarks.length} clinical points detected</p>
                   </div>
                </div>
                <Pill tone={lowConf.length ? "warning" : "success"}>
                   {lowConf.length ? `${lowConf.length} Low Confidence` : "High Confidence"}
                </Pill>
             </div>
             
             <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                {landmarks.map(lm => (
                  <button
                    key={lm.code}
                    type="button"
                    onClick={() => setSelectedCode(lm.code)}
                    className={cn(
                      "flex items-center justify-between gap-3 p-3 rounded-xl border transition-all duration-200",
                      selectedCode === lm.code 
                        ? "border-primary/40 bg-primary/10 ring-2 ring-primary/10" 
                        : "border-border/60 bg-muted/20 hover:border-primary/20 hover:bg-muted/30"
                    )}
                  >
                    <div className="min-w-0">
                       <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest truncate">{lm.code}</p>
                       <p className="text-xs font-bold text-foreground mt-0.5 truncate">{lm.name}</p>
                    </div>
                    <div className={cn("h-1.5 w-1.5 rounded-full shrink-0", 
                      lm.confidence >= 0.85 ? "bg-success" : lm.confidence >= 0.7 ? "bg-primary" : "bg-warning"
                    )} />
                  </button>
                ))}
             </div>
          </Card>
        </div>

        <div className="space-y-6">
          {/* Controls Card */}
          <Card className="p-6">
            <div className="flex items-center justify-between mb-6">
               <h3 className="text-sm font-bold uppercase tracking-widest text-muted-foreground">Viewer Controls</h3>
               <IconBtn 
                 icon={isLocked ? Lock : Unlock} 
                 label="Toggle interaction" 
                 onClick={() => setIsLocked(!isLocked)} 
                 variant={isLocked ? "solid" : "outline"}
                 size="sm"
               />
            </div>
            
            <div className="space-y-4">
               {/* Image Processing */}
               <div className="space-y-4">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground ml-1">Image Processing</p>
                  <div className="space-y-3">
                     <div className="space-y-1.5">
                        <div className="flex justify-between text-[10px] font-bold uppercase text-muted-foreground">
                           <span>Brightness</span>
                           <span className="text-foreground">{filters.brightness}%</span>
                        </div>
                        <input 
                          type="range" min="50" max="200" 
                          value={filters.brightness} 
                          onChange={e => setFilters(f => ({ ...f, brightness: Number(e.target.value) }))}
                          className="w-full h-1.5 rounded-full bg-muted appearance-none accent-primary cursor-pointer"
                        />
                     </div>
                     <div className="space-y-1.5">
                        <div className="flex justify-between text-[10px] font-bold uppercase text-muted-foreground">
                           <span>Contrast</span>
                           <span className="text-foreground">{filters.contrast}%</span>
                        </div>
                        <input 
                          type="range" min="50" max="200" 
                          value={filters.contrast} 
                          onChange={e => setFilters(f => ({ ...f, contrast: Number(e.target.value) }))}
                          className="w-full h-1.5 rounded-full bg-muted appearance-none accent-primary cursor-pointer"
                        />
                     </div>
                  </div>
               </div>

               <Divider className="opacity-40" />

               {/* Layers Toggle */}
               <div className="space-y-1.5">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground ml-1">Visualization Layers</p>
                  <div className="grid gap-2">
                     {Object.entries(layers).map(([key, val]) => (
                       <button
                         key={key}
                         onClick={() => setLayers(p => ({ ...p, [key]: !val }))}
                         className={cn(
                           "flex items-center justify-between p-3 rounded-xl border transition-all",
                           val ? "border-primary/30 bg-primary/5 text-primary" : "border-border/60 bg-muted/20 text-muted-foreground hover:bg-muted/30"
                         )}
                       >
                          <span className="text-xs font-bold">{layerLabels[key] || key}</span>
                          <Layers3 className={cn("h-3.5 w-3.5", val ? "opacity-100" : "opacity-30")} />
                       </button>
                     ))}
                  </div>
               </div>
            </div>
          </Card>

          {/* Selection Detail */}
          <Card className={cn("p-6 transition-all duration-300", selected ? "border-primary/30" : "opacity-60")}>
             <div className="flex items-center gap-3 mb-6">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted/40 text-muted-foreground border border-border/40 font-bold uppercase text-xs">
                   {selected?.code || "--"}
                </div>
                <div>
                   <h4 className="font-bold tracking-tight">Active Landmark</h4>
                   <p className="text-xs text-muted-foreground">{selected ? "Precision adjustment" : "No point selected"}</p>
                </div>
             </div>
             
             {selected ? (
               <div className="space-y-5 animate-in fade-in slide-in-from-top-2 duration-300">
                  <p className="text-sm font-medium leading-relaxed">{selected.name}</p>
                  <div className="grid grid-cols-2 gap-3">
                     <Field label="Coordinate X">
                        <TextInput 
                          type="number" 
                          value={Math.round(selected.x)} 
                          onChange={v => updateLandmark(selected.code, { x: Number(v) })} 
                        />
                     </Field>
                     <Field label="Coordinate Y">
                        <TextInput 
                          type="number" 
                          value={Math.round(selected.y)} 
                          onChange={v => updateLandmark(selected.code, { y: Number(v) })} 
                        />
                     </Field>
                  </div>
                  <div className="p-3 rounded-xl border border-border/40 bg-muted/20">
                     <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1">AI Confidence</p>
                     <div className="flex items-center justify-between">
                        <span className="text-sm font-bold">{Math.round(selected.confidence * 100)}%</span>
                        <div className="h-1.5 w-24 rounded-full bg-muted overflow-hidden">
                           <div 
                             className={cn("h-full", 
                               selected.confidence >= 0.85 ? "bg-success" : selected.confidence >= 0.7 ? "bg-primary" : "bg-warning"
                             )} 
                             style={{ width: `${selected.confidence * 100}%` }} 
                           />
                        </div>
                     </div>
                  </div>
               </div>
             ) : (
               <div className="py-8 text-center border border-dashed border-border/60 rounded-2xl bg-muted/10">
                  <p className="text-xs text-muted-foreground italic">Click a point in the viewer or inventory to adjust its coordinates.</p>
               </div>
             )}
          </Card>

          {/* Calibration Card */}
          <Card className={cn("p-6 transition-all duration-300", calibMode ? "border-warning/40 ring-4 ring-warning/5" : "")}>
             <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                   <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-warning/10 text-warning">
                      <Ruler className="h-5 w-5" />
                   </div>
                   <h4 className="font-bold tracking-tight">Scale Calibration</h4>
                </div>
                <Pill tone={activeCase?.calibrated ? "success" : "warning"} size="xs">
                   {activeCase?.calibrated ? "Calibrated" : "Required"}
                </Pill>
             </div>
             <div className="space-y-4">
                <Field label="Reference Distance (mm)">
                   <TextInput type="number" value={distMm} onChange={setDistMm} min={1} />
                </Field>
                <div className="p-3 rounded-xl border border-border/40 bg-muted/20 text-[10px] text-muted-foreground leading-relaxed">
                   Set {calibPts.length}/2 reference points by clicking known ruler marks in the viewer.
                </div>
                <PrimaryBtn 
                  disabled={calibPts.length !== 2}
                  onClick={() => { onCalibrate(calibPts, Number(distMm)); setCalibMode(false); }}
                  className="w-full bg-warning text-warning-foreground hover:bg-warning/90 shadow-warning/20 border-none h-11"
                >
                   Save Calibration
                </PrimaryBtn>
             </div>
          </Card>

          {/* Overlays Card */}
          <Card className="p-6">
             <div className="flex items-center justify-between mb-6">
                <h3 className="text-sm font-bold uppercase tracking-widest text-muted-foreground">AI Overlays</h3>
                <IconBtn icon={RefreshCw} label="Refresh" onClick={onRefreshOverlays} variant="outline" size="sm" />
             </div>
             
             {overlays.length ? (
               <div className="grid gap-4">
                  {overlays.map(ov => (
                    <button
                      key={ov.key}
                      onClick={() => window.open(ov.url, "_blank", "noopener,noreferrer")}
                      className="group relative aspect-video overflow-hidden rounded-2xl border border-border/60 bg-black/80 transition-all hover:border-primary/40"
                    >
                       <img 
                         src={ov.url} 
                         alt={ov.label} 
                         className="h-full w-full object-cover opacity-60 transition group-hover:opacity-100 group-hover:scale-105" 
                       />
                       <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
                       <div className="absolute bottom-3 left-4 right-4 flex items-center justify-between">
                          <span className="text-[10px] font-bold uppercase tracking-widest text-white">{ov.label}</span>
                          <Eye className="h-4 w-4 text-white/60" />
                       </div>
                    </button>
                  ))}
               </div>
             ) : (
               <div className="py-10 text-center border border-dashed border-border/60 rounded-2xl bg-muted/10">
                  <Layers3 className="h-10 w-10 text-muted-foreground/20 mx-auto mb-3" />
                  <p className="text-xs text-muted-foreground italic px-6">Generate full pipeline overlays to see landmark traces and skeletal heatmaps.</p>
               </div>
             )}
          </Card>
        </div>
      </div>

      <div className="flex justify-end">
         <SecondaryBtn onClick={() => navigate("/results")} icon={BarChart3} className="h-12 px-8">
            Proceed to Analysis Results
            <ChevronRight className="h-4 w-4 ml-2" />
         </SecondaryBtn>
      </div>
    </div>
  );
}

function CephPreview({
  imageUrl, landmarks, selectedCode, onSelect, onMove, layers, filters, calibrationMode, calibrationPoints, locked, onCalibrationPoint,
}: {
  imageUrl?: string; landmarks: Landmark[]; selectedCode?: string | null;
  onSelect: (code: string | null) => void; onMove: (code: string, pt: Point) => void;
  layers: Record<string, boolean>; filters: { brightness: number, contrast: number }; calibrationMode: boolean;
  calibrationPoints: Point[]; locked?: boolean; onCalibrationPoint: (pt: Point) => void;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [draggingCode, setDraggingCode] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [lastPoint, setLastPoint] = useState<Point | null>(null);

  function ptFromEvent(e: React.PointerEvent) {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const rect = svg.getBoundingClientRect();
    const localX = ((e.clientX - rect.left) / rect.width) * 1000;
    const localY = ((e.clientY - rect.top) / rect.height) * 720;
    
    return {
      x: Math.max(0, Math.min(1000, (localX - pan.x) / zoom)),
      y: Math.max(0, Math.min(720, (localY - pan.y) / zoom)),
    };
  }

  function handlePointerDown(e: React.PointerEvent) {
    if (locked) return;
    if (e.altKey || e.button === 1) {
      setIsPanning(true);
      setLastPoint({ x: e.clientX, y: e.clientY });
      return;
    }
    if (!calibrationMode) { onSelect(null); } 
    else { onCalibrationPoint(ptFromEvent(e)); }
  }

  function handlePointerMove(e: React.PointerEvent) {
    if (isPanning) {
      if (!lastPoint) return;
      const dx = e.clientX - lastPoint.x;
      const dy = e.clientY - lastPoint.y;
      const svg = svgRef.current;
      if (svg) {
        const rect = svg.getBoundingClientRect();
        setPan(p => ({ x: p.x + (dx / rect.width) * 1000, y: p.y + (dy / rect.height) * 720 }));
      }
      setLastPoint({ x: e.clientX, y: e.clientY });
      return;
    }
    if (!draggingCode || locked) return;
    onMove(draggingCode, ptFromEvent(e));
  }

  const byCode = Object.fromEntries(landmarks.map(l => [l.code, l]));
  const planeLines = [
    ["S", "N", "oklch(var(--color-primary))", "SN Plane"],
    ["N", "A", "oklch(var(--color-info))", "NA"],
    ["N", "B", "oklch(var(--color-info))", "NB"],
    ["Po", "Or", "oklch(var(--color-warning))", "FH"],
    ["Go", "Gn", "oklch(var(--color-warning))", "Mand."],
    ["UI", "LI", "oklch(var(--color-success))", "Inc."],
    ["Prn", "Pg", "oklch(var(--color-success))", "E-Line"],
  ];

  return (
    <Card noPadding className="relative overflow-hidden aspect-[1000/720] min-h-[480px] bg-black border-border/20 shadow-2xl group/viewer">
      <svg
        ref={svgRef}
        viewBox="0 0 1000 720"
        className={cn("h-full w-full touch-none select-none", isPanning ? "cursor-grabbing" : "cursor-crosshair")}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={() => { setDraggingCode(null); setIsPanning(false); setLastPoint(null); }}
        onPointerLeave={() => { setDraggingCode(null); setIsPanning(false); setLastPoint(null); }}
        onWheel={e => {
          if (locked) return;
          const delta = e.deltaY > 0 ? 0.9 : 1.1;
          setZoom(z => Math.max(1, Math.min(5, z * delta)));
        }}
      >
        <rect width="1000" height="720" fill="black" />
        <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
        {imageUrl ? (
          <image 
            href={imageUrl} 
            x="0" y="0" width="1000" height="720" 
            preserveAspectRatio="xMidYMid slice" 
            opacity="0.8" 
            style={{ filter: `brightness(${filters.brightness}%) contrast(${filters.contrast}%)` }}
          />
        ) : (
          <g>
            <rect x="250" y="260" width="500" height="200" rx="20" fill="oklch(var(--color-muted) / 0.1)" stroke="oklch(var(--color-border) / 0.4)" strokeDasharray="10 10" />
            <text x="500" y="345" fill="oklch(var(--color-muted-foreground))" fontSize="24" fontWeight="bold" textAnchor="middle">Cloud Image Processing</text>
            <text x="500" y="380" fill="oklch(var(--color-muted-foreground) / 0.6)" fontSize="14" textAnchor="middle">Connect backend to view clinical cephalogram</text>
          </g>
        )}

        {/* Reference Grid */}
        {layers.grid && (
          <g opacity="0.15">
            {Array.from({ length: 11 }).map((_, i) => <line key={`v${i}`} x1={i * 100} y1="0" x2={i * 100} y2="720" stroke="oklch(var(--color-primary))" strokeWidth="0.5" />)}
            {Array.from({ length: 9 }).map((_, i) => <line key={`h${i}`} x1="0" y1={i * 90} x2="1000" y2={i * 90} stroke="oklch(var(--color-primary))" strokeWidth="0.5" />)}
          </g>
        )}

        {/* Tracing Planes */}
        {layers.measurements && planeLines.map(([a, b, color, label]) => {
          const p1 = byCode[a]; 
          const p2 = byCode[b];
          if (!p1 || !p2) return null;
          return (
            <g key={`${a}-${b}`} className="animate-in fade-in duration-700">
              <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke={color} strokeOpacity="0.5" strokeWidth="2" strokeDasharray={label === "E-Line" ? "10 8" : undefined} />
              <text x={(p1.x + p2.x) / 2 + 10} y={(p1.y + p2.y) / 2 - 10} fill={color} fontSize="11" fontWeight="bold" opacity="0.6" style={{ textShadow: "0 1px 4px black" }}>{label}</text>
            </g>
          );
        })}

        {/* Soft Tissue Contour Approximation */}
        {layers.softTissue && (
          <path
            d={`M ${byCode.N?.x ?? 600} ${byCode.N?.y ?? 196} C 730 250, 805 310, ${byCode.Prn?.x ?? 777} ${byCode.Prn?.y ?? 330} C 790 395, 762 433, ${byCode.Ls?.x ?? 740} ${byCode.Ls?.y ?? 456}`}
            fill="none" stroke="oklch(var(--color-success))" strokeOpacity="0.6" strokeWidth="3" strokeLinecap="round"
            className="animate-in fade-in duration-1000"
          />
        )}

        {/* Draggable Landmarks */}
        {layers.landmarks && landmarks.map(lm => {
          const sel = lm.code === selectedCode;
          const tone = confidenceTone(lm.confidence);
          const c = tone === "success" ? "oklch(var(--color-success))" : tone === "accent" ? "oklch(var(--color-primary))" : tone === "warning" ? "oklch(var(--color-warning))" : "oklch(var(--color-destructive))";
          
          return (
            <g
              key={lm.code}
              onPointerDown={e => { e.stopPropagation(); if (!locked) { setDraggingCode(lm.code); onSelect(lm.code); } }}
              className={cn("cursor-move transition-transform duration-150", sel && "scale-110", locked && "cursor-default")}
            >
              {sel && (
                <>
                  <circle cx={lm.x} cy={lm.y} r="25" fill="none" stroke={c} strokeOpacity="0.2" strokeWidth="1" className="animate-pulse" />
                  <circle cx={lm.x} cy={lm.y} r="18" fill="none" stroke={c} strokeOpacity="0.4" strokeWidth="2" strokeDasharray="4 4" />
                </>
              )}
              
              {/* Reticle UI */}
              <line x1={lm.x - 14} y1={lm.y} x2={lm.x - 4} y2={lm.y} stroke={c} strokeWidth="2.5" strokeLinecap="round" />
              <line x1={lm.x + 4} y1={lm.y} x2={lm.x + 14} y2={lm.y} stroke={c} strokeWidth="2.5" strokeLinecap="round" />
              <line x1={lm.x} y1={lm.y - 14} x2={lm.x} y2={lm.y - 4} stroke={c} strokeWidth="2.5" strokeLinecap="round" />
              <line x1={lm.x} y1={lm.y + 4} x2={lm.x} y2={lm.y + 14} stroke={c} strokeWidth="2.5" strokeLinecap="round" />
              
              <circle cx={lm.x} cy={lm.y} r={sel ? 5 : 4} fill={c} stroke="black" strokeWidth="1.5" />
              
              <g transform={`translate(${lm.x + 18}, ${lm.y - 22})`}>
                 <rect width={lm.code.length > 2 ? 46 : 32} height="18" rx="6" fill="black" fillOpacity="0.8" stroke={c} strokeOpacity="0.4" />
                 <text x={lm.code.length > 2 ? 23 : 16} y="13" fill="white" fontSize="10" fontWeight="bold" textAnchor="middle">{lm.code}</text>
              </g>
            </g>
          );
        })}

        {/* Calibration UI */}
        {calibrationPoints.map((pt, i) => (
          <g key={`cal-${i}`}>
            <circle cx={pt.x} cy={pt.y} r="12" fill="oklch(var(--color-warning) / 0.15)" stroke="oklch(var(--color-warning))" strokeWidth="2.5" />
            <text x={pt.x + 16} y={pt.y - 10} fill="oklch(var(--color-warning))" fontSize="14" fontWeight="bold" style={{ textShadow: "0 1px 4px black" }}>REF{i + 1}</text>
          </g>
        ))}
        {calibrationPoints.length === 2 && (
          <line x1={calibrationPoints[0].x} y1={calibrationPoints[0].y} x2={calibrationPoints[1].x} y2={calibrationPoints[1].y} stroke="oklch(var(--color-warning))" strokeWidth="2.5" strokeDasharray="10 6" />
        )}
        </g>
      </svg>

      {/* Zoom Controls */}
      <div className="absolute right-6 top-6 flex flex-col gap-2">
         <div className="flex flex-col rounded-xl border border-white/10 bg-black/60 backdrop-blur-md p-1 shadow-2xl">
            <IconBtn 
              icon={Maximize2} 
              label="Zoom In" 
              onClick={() => setZoom(z => Math.min(5, z * 1.2))} 
              variant="ghost" 
              size="sm" 
              className="text-white/60 hover:text-white"
            />
            <div className="h-px bg-white/5 mx-2" />
            <IconBtn 
              icon={Minimize2} 
              label="Zoom Out" 
              onClick={() => setZoom(z => Math.max(1, z / 1.2))} 
              variant="ghost" 
              size="sm" 
              className="text-white/60 hover:text-white"
            />
            <div className="h-px bg-white/5 mx-2" />
            <button 
              onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }}
              className="flex h-8 w-8 items-center justify-center text-[10px] font-bold text-white/40 hover:text-white transition-colors"
            >
               1:1
            </button>
         </div>
      </div>

      {/* Floating status badges */}
      <div className="absolute left-6 top-6 flex items-center gap-3 pointer-events-none">
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-black/60 backdrop-blur-md border border-white/10 shadow-lg">
           <div className={cn("h-2 w-2 rounded-full", calibrationMode ? "bg-warning animate-pulse" : "bg-primary")} />
           <span className="text-[10px] font-bold uppercase tracking-widest text-white/90">
              {calibrationMode ? "Spatial Calibration Active" : "Diagnostic Mode"}
           </span>
        </div>
        {zoom > 1 && (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/20 backdrop-blur-md border border-primary/40 animate-in zoom-in-95">
             <span className="text-[10px] font-bold uppercase tracking-widest text-primary">Zoom {Math.round(zoom * 100)}%</span>
          </div>
        )}
      </div>
      
      <div className="absolute bottom-0 inset-x-0 p-4 translate-y-full group-hover/viewer:translate-y-0 transition-transform duration-500">
         <div className="flex items-center justify-between gap-4 p-4 rounded-2xl bg-black/80 backdrop-blur-xl border border-white/10 shadow-2xl">
            <div className="flex items-center gap-3">
               <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/20 text-primary">
                  <Move className="h-4 w-4" />
               </div>
               <p className="text-xs text-white/80 font-medium">Drag points to refine positions. Use <kbd className="bg-white/10 px-1.5 py-0.5 rounded text-[10px]">Alt + Drag</kbd> or <kbd className="bg-white/10 px-1.5 py-0.5 rounded text-[10px]">Wheel</kbd> to explore.</p>
            </div>
            {selectedCode && (
               <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Active:</span>
                  <span className="text-xs font-bold text-primary">{selectedCode}</span>
               </div>
            )}
         </div>
      </div>
    </Card>
  );
}
