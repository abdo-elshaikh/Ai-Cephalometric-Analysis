import React, { useState, useRef, useEffect, useMemo } from "react";
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
  Maximize2,
  Minimize2,
  Crosshair,
  Lock,
  Unlock,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  ScanLine,
  Circle,
  Grid3x3,
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

// ─── Landmark Groups ──────────────────────────────────────────────────────────

const LANDMARK_GROUPS: { label: string; codes: string[]; color: string }[] = [
  { label: "Cranial Base", codes: ["S", "N", "Or", "Po", "Ba", "Pt", "Ar", "Se"], color: "#60a5fa" },
  { label: "Maxilla", codes: ["A", "ANS", "PNS", "Sp", "Ss", "Prn", "Ns"], color: "#34d399" },
  { label: "Mandible", codes: ["B", "Pog", "Gn", "Me", "Go", "Co", "D", "Id"], color: "#f59e0b" },
  { label: "Dental", codes: ["UI", "LI", "U1r", "L1r", "UM", "LM", "UP", "LP", "U6", "L6"], color: "#a78bfa" },
  { label: "Soft Tissue", codes: ["Ls", "Li", "Pg", "Cm", "Sn", "Dt", "Tt", "Gls", "Sts", "Sti", "N_st", "Pog_st"], color: "#fb7185" },
  { label: "Airway / CVM", codes: ["PNW", "PPW", "Eb", "Tb", "C2", "C3", "C4", "C3ant", "C3post", "C4ant", "C4post", "C2inf"], color: "#38bdf8" },
  { label: "Ricketts", codes: ["Xi", "Dc", "Cf", "Ag", "Pm", "Cc", "ENS", "ENS2"], color: "#e879f9" },
];

// ─── Cephalometric Planes ─────────────────────────────────────────────────────

type TracingPlane = {
  key: string;
  from: string;
  to: string;
  color: string;
  label: string;
  dashed?: boolean;
  group: "skeletal" | "dental" | "soft" | "vertical";
};

const TRACING_PLANES: TracingPlane[] = [
  // Skeletal
  { key: "SN", from: "S", to: "N", color: "#60a5fa", label: "SN", group: "skeletal" },
  { key: "FH", from: "Po", to: "Or", color: "#f59e0b", label: "FH", group: "skeletal" },
  { key: "NA", from: "N", to: "A", color: "#34d399", label: "NA", group: "skeletal" },
  { key: "NB", from: "N", to: "B", color: "#34d399", label: "NB", group: "skeletal" },
  { key: "NPog", from: "N", to: "Pog", color: "#a78bfa", label: "N-Pog", group: "skeletal", dashed: true },
  { key: "GoGn", from: "Go", to: "Gn", color: "#f59e0b", label: "Md. Plane", group: "vertical" },
  { key: "GoMe", from: "Go", to: "Me", color: "#fbbf24", label: "Go-Me", group: "vertical", dashed: true },
  // Dental
  { key: "Inc", from: "UI", to: "LI", color: "#34d399", label: "Inc.", group: "dental" },
  { key: "OcPlane", from: "U6", to: "L6", color: "#e879f9", label: "Occ. Plane", group: "dental", dashed: true },
  // Soft tissue
  { key: "ELine", from: "Prn", to: "Pg", color: "#fb7185", label: "E-Line", group: "soft", dashed: true },
  { key: "SoftN", from: "N_st", to: "Pog_st", color: "#fb7185", label: "Facial", group: "soft" },
];

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
    grid: false,
  });
  const [isLocked, setIsLocked] = useState(false);
  const [filters, setFilters] = useState({ brightness: 100, contrast: 100 });
  const [adjustmentModal, setAdjustmentModal] = useState<{ code: string; pt: Point } | null>(null);
  const [adjustmentReason, setAdjustmentReason] = useState("");
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>(
    Object.fromEntries(LANDMARK_GROUPS.map(g => [g.label, false]))
  );

  useEffect(() => {
    setCalibPts(activeCase?.calibrationPoints ?? []);
    setDistMm(String(activeCase?.calibrationDistanceMm ?? 10));
  }, [activeCase?.id]);

  const selected = landmarks.find(l => l.code === selectedCode);
  const lowConf = landmarks.filter(l => l.confidence < 0.7);

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

  function toggleGroup(label: string) {
    setExpandedGroups(g => ({ ...g, [label]: !g[label] }));
  }

  const groupedLandmarks = useMemo(() => {
    const byCode = Object.fromEntries(landmarks.map(l => [l.code, l]));
    return LANDMARK_GROUPS.map(group => ({
      ...group,
      landmarks: group.codes.map(c => byCode[c]).filter(Boolean) as Landmark[],
    })).filter(g => g.landmarks.length > 0);
  }, [landmarks]);

  const ungroupedLandmarks = useMemo(() => {
    const knownCodes = new Set(LANDMARK_GROUPS.flatMap(g => g.codes));
    return landmarks.filter(l => !knownCodes.has(l.code));
  }, [landmarks]);

  const layerLabels: Record<string, string> = {
    landmarks: "Clinical Landmarks",
    measurements: "Diagnostic Planes",
    softTissue: "Soft Tissue Profile",
    heatmap: "Confidence Mapping",
    grid: "Reference Grid",
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <PageHeader
        eyebrow="Diagnostic Review"
        title="Clinical Viewer"
        description="Verify landmark placement, adjust reference points, and review AI-generated cephalometric tracing overlays."
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
        {/* ── Main Viewer ── */}
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

          {/* Landmark Inventory — grouped */}
          <Card>
            <div className="flex items-center justify-between mb-5">
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

            <div className="space-y-2">
              {groupedLandmarks.map(group => {
                const open = expandedGroups[group.label];
                const groupLowConf = group.landmarks.filter(l => l.confidence < 0.7).length;
                return (
                  <div key={group.label} className="rounded-xl border border-border/40 overflow-hidden">
                    <button
                      type="button"
                      onClick={() => toggleGroup(group.label)}
                      className="w-full flex items-center justify-between gap-3 px-4 py-3 bg-muted/10 hover:bg-muted/20 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <div className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: group.color }} />
                        <span className="text-xs font-bold">{group.label}</span>
                        <span className="text-[10px] text-muted-foreground/60">{group.landmarks.length} pts</span>
                        {groupLowConf > 0 && (
                          <Pill tone="warning" size="xs">{groupLowConf} low</Pill>
                        )}
                      </div>
                      {open
                        ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                        : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                      }
                    </button>
                    {open && (
                      <div className="grid gap-1.5 p-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 animate-in fade-in slide-in-from-top-1 duration-200">
                        {group.landmarks.map(lm => (
                          <LandmarkChip
                            key={lm.code}
                            landmark={lm}
                            selected={lm.code === selectedCode}
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
                    onClick={() => toggleGroup("__other")}
                    className="w-full flex items-center justify-between gap-3 px-4 py-3 bg-muted/10 hover:bg-muted/20 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className="h-2.5 w-2.5 rounded-full shrink-0 bg-muted-foreground/40" />
                      <span className="text-xs font-bold">Other</span>
                      <span className="text-[10px] text-muted-foreground/60">{ungroupedLandmarks.length} pts</span>
                    </div>
                    {expandedGroups["__other"]
                      ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                      : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                    }
                  </button>
                  {expandedGroups["__other"] && (
                    <div className="grid gap-1.5 p-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 animate-in fade-in slide-in-from-top-1 duration-200">
                      {ungroupedLandmarks.map(lm => (
                        <LandmarkChip
                          key={lm.code}
                          landmark={lm}
                          selected={lm.code === selectedCode}
                          onClick={() => setSelectedCode(lm.code)}
                        />
                      ))}
                    </div>
                  )}
                </div>
              )}

              {landmarks.length === 0 && (
                <div className="py-10 text-center border border-dashed border-border/60 rounded-2xl bg-muted/10">
                  <Crosshair className="h-10 w-10 text-muted-foreground/20 mx-auto mb-3" />
                  <p className="text-xs text-muted-foreground italic px-6">No landmarks detected yet. Run AI analysis to populate landmark positions.</p>
                </div>
              )}
            </div>
          </Card>
        </div>

        {/* ── Right Panel ── */}
        <div className="space-y-5">
          {/* Controls */}
          <Card>
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Viewer Controls</h3>
              <IconBtn
                icon={isLocked ? Lock : Unlock}
                label="Toggle interaction"
                onClick={() => setIsLocked(!isLocked)}
                variant={isLocked ? "solid" : "outline"}
                size="sm"
              />
            </div>

            <div className="space-y-5">
              <div className="space-y-3">
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Image Processing</p>
                {[
                  { key: "brightness" as const, label: "Brightness", min: 50, max: 200 },
                  { key: "contrast" as const, label: "Contrast", min: 50, max: 200 },
                ].map(f => (
                  <div key={f.key} className="space-y-1.5">
                    <div className="flex justify-between text-[10px] font-bold uppercase text-muted-foreground">
                      <span>{f.label}</span>
                      <span className="text-foreground">{filters[f.key]}%</span>
                    </div>
                    <input
                      type="range" min={f.min} max={f.max}
                      value={filters[f.key]}
                      onChange={e => setFilters(fv => ({ ...fv, [f.key]: Number(e.target.value) }))}
                      className="w-full h-1.5 rounded-full bg-muted appearance-none accent-primary cursor-pointer"
                    />
                  </div>
                ))}
              </div>

              <Divider className="opacity-40" />

              <div className="space-y-2">
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground ml-1">Visualization Layers</p>
                {Object.entries(layers).map(([key, val]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setLayers(p => ({ ...p, [key]: !val }))}
                    className={cn(
                      "flex items-center justify-between w-full p-3 rounded-xl border transition-all",
                      val ? "border-primary/30 bg-primary/5 text-primary" : "border-border/60 bg-muted/20 text-muted-foreground hover:bg-muted/30"
                    )}
                  >
                    <span className="text-xs font-bold">{layerLabels[key] || key}</span>
                    <Layers3 className={cn("h-3.5 w-3.5", val ? "opacity-100" : "opacity-30")} />
                  </button>
                ))}
              </div>
            </div>
          </Card>

          {/* Landmark Detail */}
          <Card className={cn("transition-all duration-300", selected ? "border-primary/30" : "opacity-70")}>
            <div className="flex items-center gap-3 mb-5">
              <div
                className="flex h-10 w-10 items-center justify-center rounded-xl border border-border/40 font-bold uppercase text-xs"
                style={selected ? { background: getGroupColor(selected.code) + "20", borderColor: getGroupColor(selected.code) + "50", color: getGroupColor(selected.code) } : {}}
              >
                {selected?.code || "--"}
              </div>
              <div>
                <h4 className="font-bold tracking-tight">Active Landmark</h4>
                <p className="text-xs text-muted-foreground">{selected ? selected.name : "No point selected"}</p>
              </div>
            </div>

            {selected ? (
              <div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
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
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">AI Confidence</p>
                    <span className={cn("text-sm font-bold",
                      selected.confidence >= 0.85 ? "text-success" : selected.confidence >= 0.7 ? "text-primary" : "text-warning"
                    )}>
                      {Math.round(selected.confidence * 100)}%
                    </span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                    <div
                      className={cn("h-full transition-all duration-500",
                        selected.confidence >= 0.85 ? "bg-success" : selected.confidence >= 0.7 ? "bg-primary" : "bg-warning"
                      )}
                      style={{ width: `${selected.confidence * 100}%` }}
                    />
                  </div>
                </div>
                {selected.adjusted && (
                  <Pill tone="accent" size="xs">Manually adjusted</Pill>
                )}
              </div>
            ) : (
              <div className="py-8 text-center border border-dashed border-border/60 rounded-2xl bg-muted/10">
                <p className="text-xs text-muted-foreground italic">Click a point in the viewer or inventory to inspect it.</p>
              </div>
            )}
          </Card>

          {/* Calibration */}
          <Card className={cn("transition-all duration-300", calibMode ? "border-warning/40 ring-4 ring-warning/5" : "")}>
            <div className="flex items-center justify-between mb-5">
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
                Click known ruler marks in the viewer to set {calibPts.length}/2 reference points.
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

          {/* AI Overlays */}
          <Card>
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">AI Overlays</h3>
              <IconBtn icon={RefreshCw} label="Refresh" onClick={onRefreshOverlays} variant="outline" size="sm" />
            </div>

            {overlays.length ? (
              <div className="grid gap-3">
                {overlays.map(ov => (
                  <button
                    key={ov.key}
                    type="button"
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
              <div className="py-8 text-center border border-dashed border-border/60 rounded-2xl bg-muted/10">
                <Layers3 className="h-10 w-10 text-muted-foreground/20 mx-auto mb-3" />
                <p className="text-xs text-muted-foreground italic px-4">Generate full pipeline overlays to see landmark traces and skeletal heatmaps.</p>
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

      {/* Adjustment Confirmation Modal */}
      {adjustmentModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-md p-4">
            <Card className="shadow-2xl">
              <div className="mb-4">
                <h3 className="text-lg font-bold">Record Adjustment</h3>
                <p className="text-xs text-muted-foreground mt-1">
                  Moving <span className="font-bold text-primary">{adjustmentModal.code}</span> to ({Math.round(adjustmentModal.pt.x)}, {Math.round(adjustmentModal.pt.y)}).
                  Enter a reason for clinical audit trail.
                </p>
              </div>
              <Field label="Reason (optional)">
                <TextInput
                  value={adjustmentReason}
                  onChange={setAdjustmentReason}
                  placeholder="e.g. Better anatomical fit"
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

function LandmarkChip({
  landmark: lm,
  selected,
  color,
  onClick,
}: {
  landmark: Landmark;
  selected: boolean;
  color?: string;
  onClick: () => void;
}) {
  const confColor = lm.confidence >= 0.85 ? "#4ade80" : lm.confidence >= 0.7 ? "#60a5fa" : "#f59e0b";
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center justify-between gap-2 p-2.5 rounded-xl border transition-all duration-150 text-left",
        selected
          ? "border-primary/40 bg-primary/10 ring-2 ring-primary/10"
          : "border-border/50 bg-muted/15 hover:border-primary/20 hover:bg-muted/25"
      )}
    >
      <div className="min-w-0">
        <p className="text-[10px] font-bold uppercase tracking-widest truncate" style={selected && color ? { color } : undefined}>
          {lm.code}
        </p>
        <p className="text-[10px] text-muted-foreground truncate mt-0.5">{lm.name}</p>
      </div>
      <div className="h-1.5 w-1.5 rounded-full shrink-0" style={{ background: confColor }} />
    </button>
  );
}

// ─── Group Color Helper ────────────────────────────────────────────────────────

function getGroupColor(code: string): string {
  for (const g of LANDMARK_GROUPS) {
    if (g.codes.includes(code)) return g.color;
  }
  return "oklch(var(--color-primary))";
}

// ─── CephPreview ──────────────────────────────────────────────────────────────

function CephPreview({
  imageUrl, landmarks, selectedCode, onSelect, onMove, layers, filters, calibrationMode,
  calibrationPoints, locked, onCalibrationPoint,
}: {
  imageUrl?: string;
  landmarks: Landmark[];
  selectedCode?: string | null;
  onSelect: (code: string | null) => void;
  onMove: (code: string, pt: Point) => void;
  layers: Record<string, boolean>;
  filters: { brightness: number; contrast: number };
  calibrationMode: boolean;
  calibrationPoints: Point[];
  locked?: boolean;
  onCalibrationPoint: (pt: Point) => void;
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

  // Resolve active tracing planes
  const activePlanes = TRACING_PLANES.filter(p => {
    if (p.group === "soft" && !layers.softTissue) return false;
    if (!layers.measurements) return false;
    return byCode[p.from] && byCode[p.to];
  });

  // Extended lines — extend beyond endpoints for proper tracing appearance
  function extendedLine(p1: Point, p2: Point, extend = 80): [Point, Point] {
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    const ux = dx / len;
    const uy = dy / len;
    return [
      { x: p1.x - ux * extend, y: p1.y - uy * extend },
      { x: p2.x + ux * extend, y: p2.y + uy * extend },
    ];
  }

  return (
    <Card noPadding className="relative overflow-hidden bg-black border-border/20 shadow-2xl group/viewer">
      {/* Viewer toolbar */}
      <div className="absolute top-0 inset-x-0 z-10 flex items-center justify-between px-4 py-2 bg-gradient-to-b from-black/70 to-transparent pointer-events-none">
        <div className="flex items-center gap-2 pointer-events-auto">
          <div className={cn(
            "flex items-center gap-2 px-3 py-1.5 rounded-full backdrop-blur-md border shadow-lg text-[10px] font-bold uppercase tracking-widest",
            calibrationMode
              ? "bg-warning/20 border-warning/40 text-warning"
              : "bg-black/50 border-white/10 text-white/80"
          )}>
            <div className={cn("h-1.5 w-1.5 rounded-full", calibrationMode ? "bg-warning animate-pulse" : "bg-primary")} />
            {calibrationMode ? "Spatial Calibration Active" : "Diagnostic Mode"}
          </div>
          {zoom > 1 && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary/20 backdrop-blur-md border border-primary/40 text-[10px] font-bold text-primary animate-in zoom-in-95">
              <ZoomIn className="h-3 w-3" />
              {Math.round(zoom * 100)}%
            </div>
          )}
        </div>
        {selectedCode && (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-black/50 backdrop-blur-md border border-white/10 pointer-events-auto">
            <span className="text-[9px] text-white/40 font-bold uppercase tracking-widest">Active:</span>
            <span className="text-xs font-bold text-primary">{selectedCode}</span>
          </div>
        )}
      </div>

      {/* SVG Viewer */}
      <div className="aspect-[1000/720] min-h-[480px]">
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
          <rect width="1000" height="720" fill="#0a0a0f" />
          <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
            {imageUrl ? (
              <image
                href={imageUrl}
                x="0" y="0" width="1000" height="720"
                preserveAspectRatio="xMidYMid meet"
                style={{ filter: `brightness(${filters.brightness}%) contrast(${filters.contrast}%)` }}
              />
            ) : (
              <g>
                <rect x="200" y="220" width="600" height="280" rx="20" fill="rgba(255,255,255,0.03)" stroke="rgba(255,255,255,0.08)" strokeDasharray="12 8" />
                <text x="500" y="345" fill="rgba(255,255,255,0.3)" fontSize="22" fontWeight="bold" textAnchor="middle" fontFamily="system-ui">Cloud Image Processing</text>
                <text x="500" y="380" fill="rgba(255,255,255,0.15)" fontSize="13" textAnchor="middle" fontFamily="system-ui">Connect backend to view clinical cephalogram</text>
              </g>
            )}

            {/* Reference Grid */}
            {layers.grid && (
              <g opacity="0.12">
                {Array.from({ length: 11 }).map((_, i) => (
                  <line key={`v${i}`} x1={i * 100} y1="0" x2={i * 100} y2="720" stroke="#60a5fa" strokeWidth="0.5" />
                ))}
                {Array.from({ length: 9 }).map((_, i) => (
                  <line key={`h${i}`} x1="0" y1={i * 90} x2="1000" y2={i * 90} stroke="#60a5fa" strokeWidth="0.5" />
                ))}
              </g>
            )}

            {/* Cephalometric Tracing Planes */}
            {activePlanes.map(plane => {
              const p1 = byCode[plane.from];
              const p2 = byCode[plane.to];
              if (!p1 || !p2) return null;
              const [ext1, ext2] = extendedLine(p1, p2, 60);
              const midX = (p1.x + p2.x) / 2;
              const midY = (p1.y + p2.y) / 2;
              return (
                <g key={plane.key} className="animate-in fade-in duration-500">
                  {/* Extended background glow */}
                  <line
                    x1={ext1.x} y1={ext1.y} x2={ext2.x} y2={ext2.y}
                    stroke={plane.color} strokeOpacity="0.08" strokeWidth="6"
                  />
                  {/* Main line */}
                  <line
                    x1={ext1.x} y1={ext1.y} x2={ext2.x} y2={ext2.y}
                    stroke={plane.color} strokeOpacity="0.55" strokeWidth="1.5"
                    strokeDasharray={plane.dashed ? "8 6" : undefined}
                  />
                  {/* Label */}
                  <g transform={`translate(${midX + 10}, ${midY - 12})`}>
                    <rect x="-2" y="-10" width={plane.label.length * 6 + 8} height="14" rx="4" fill="rgba(0,0,0,0.65)" />
                    <text x={plane.label.length * 3 + 2} y="1" fill={plane.color} fontSize="9" fontWeight="bold" textAnchor="middle" fontFamily="system-ui">{plane.label}</text>
                  </g>
                </g>
              );
            })}

            {/* Soft Tissue Profile Curve */}
            {layers.softTissue && byCode.N_st && byCode.Prn && byCode.Ls && (
              <path
                d={`M ${byCode.N_st.x} ${byCode.N_st.y} C ${byCode.Prn.x + 40} ${byCode.N_st.y + 60}, ${byCode.Prn.x + 30} ${byCode.Prn.y - 20}, ${byCode.Prn.x} ${byCode.Prn.y} C ${byCode.Prn.x - 10} ${byCode.Prn.y + 30}, ${byCode.Ls.x + 20} ${byCode.Ls.y - 20}, ${byCode.Ls.x} ${byCode.Ls.y}`}
                fill="none" stroke="#fb7185" strokeOpacity="0.5" strokeWidth="2.5" strokeLinecap="round"
                className="animate-in fade-in duration-700"
              />
            )}

            {/* Draggable Landmarks */}
            {layers.landmarks && landmarks.map(lm => {
              const sel = lm.code === selectedCode;
              const groupColor = getGroupColor(lm.code);
              const confColor = lm.confidence >= 0.85 ? "#4ade80" : lm.confidence >= 0.7 ? "#60a5fa" : "#f59e0b";
              const dotColor = sel ? groupColor : confColor;

              return (
                <g
                  key={lm.code}
                  onPointerDown={e => { e.stopPropagation(); if (!locked) { setDraggingCode(lm.code); onSelect(lm.code); } }}
                  className={cn("cursor-move transition-all duration-150", locked && "cursor-default")}
                >
                  {/* Outer glow when selected */}
                  {sel && (
                    <>
                      <circle cx={lm.x} cy={lm.y} r="28" fill="none" stroke={groupColor} strokeOpacity="0.15" strokeWidth="1" className="animate-pulse" />
                      <circle cx={lm.x} cy={lm.y} r="20" fill="none" stroke={groupColor} strokeOpacity="0.35" strokeWidth="1.5" strokeDasharray="4 3" />
                    </>
                  )}

                  {/* Crosshair reticle */}
                  {[[-14, 0, -4, 0], [4, 0, 14, 0], [0, -14, 0, -4], [0, 4, 0, 14]].map(([x1, y1, x2, y2], i) => (
                    <line
                      key={i}
                      x1={lm.x + x1} y1={lm.y + y1}
                      x2={lm.x + x2} y2={lm.y + y2}
                      stroke={dotColor} strokeWidth={sel ? 2.5 : 2} strokeLinecap="round"
                    />
                  ))}

                  {/* Center dot */}
                  <circle cx={lm.x} cy={lm.y} r={sel ? 5.5 : 4} fill={dotColor} stroke="#000" strokeWidth="1.5" />

                  {/* Label tag */}
                  {(sel || zoom >= 2) && (
                    <g transform={`translate(${lm.x + 16}, ${lm.y - 22})`}>
                      <rect
                        width={lm.code.length > 3 ? lm.code.length * 6 + 8 : 28}
                        height="17" rx="5"
                        fill="rgba(0,0,0,0.85)" stroke={dotColor} strokeOpacity="0.5" strokeWidth="0.5"
                      />
                      <text
                        x={(lm.code.length > 3 ? lm.code.length * 3 + 4 : 14)} y="12"
                        fill="white" fontSize="9.5" fontWeight="bold" textAnchor="middle" fontFamily="system-ui"
                      >{lm.code}</text>
                    </g>
                  )}
                </g>
              );
            })}

            {/* Calibration UI */}
            {calibrationPoints.map((pt, i) => (
              <g key={`cal-${i}`}>
                <circle cx={pt.x} cy={pt.y} r="14" fill="rgba(251,191,36,0.12)" stroke="#f59e0b" strokeWidth="2.5" />
                <circle cx={pt.x} cy={pt.y} r="3" fill="#f59e0b" />
                <text x={pt.x + 18} y={pt.y - 10} fill="#f59e0b" fontSize="13" fontWeight="bold" fontFamily="system-ui">REF{i + 1}</text>
              </g>
            ))}
            {calibrationPoints.length === 2 && (
              <line
                x1={calibrationPoints[0].x} y1={calibrationPoints[0].y}
                x2={calibrationPoints[1].x} y2={calibrationPoints[1].y}
                stroke="#f59e0b" strokeWidth="2" strokeDasharray="10 6" strokeOpacity="0.8"
              />
            )}
          </g>

          {/* Minimap (bottom-right, fixed in SVG space) */}
          {zoom > 1 && (
            <g transform="translate(840, 560)">
              <rect width="140" height="100" rx="8" fill="rgba(0,0,0,0.75)" stroke="rgba(255,255,255,0.12)" strokeWidth="1" />
              <text x="8" y="14" fill="rgba(255,255,255,0.4)" fontSize="8" fontFamily="system-ui" fontWeight="bold">MINIMAP</text>
              {/* Viewport indicator */}
              <rect
                x={8 + ((-pan.x / zoom) / 1000) * 124}
                y={20 + ((-pan.y / zoom) / 720) * 72}
                width={Math.min(124, (1 / zoom) * 124)}
                height={Math.min(72, (1 / zoom) * 72)}
                fill="rgba(96,165,250,0.15)"
                stroke="rgba(96,165,250,0.6)"
                strokeWidth="1"
                rx="2"
              />
            </g>
          )}
        </svg>
      </div>

      {/* Zoom controls */}
      <div className="absolute right-5 bottom-20 flex flex-col gap-1">
        <div className="flex flex-col rounded-xl border border-white/10 bg-black/70 backdrop-blur-md p-1 shadow-2xl">
          <IconBtn icon={ZoomIn} label="Zoom In" onClick={() => setZoom(z => Math.min(5, z * 1.25))} variant="ghost" size="sm" className="text-white/60 hover:text-white" />
          <div className="h-px bg-white/5 mx-1.5" />
          <IconBtn icon={ZoomOut} label="Zoom Out" onClick={() => setZoom(z => Math.max(1, z / 1.25))} variant="ghost" size="sm" className="text-white/60 hover:text-white" />
          <div className="h-px bg-white/5 mx-1.5" />
          <button
            type="button"
            onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }}
            className="flex h-8 w-8 items-center justify-center text-[9px] font-bold text-white/40 hover:text-white transition-colors"
          >
            FIT
          </button>
        </div>
      </div>

      {/* Bottom help bar */}
      <div className="absolute bottom-0 inset-x-0 p-3 translate-y-full group-hover/viewer:translate-y-0 transition-transform duration-400">
        <div className="flex items-center justify-between gap-4 p-3.5 rounded-2xl bg-black/85 backdrop-blur-xl border border-white/10 shadow-2xl">
          <div className="flex items-center gap-3">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/20 text-primary">
              <Move className="h-3.5 w-3.5" />
            </div>
            <p className="text-xs text-white/70 font-medium">
              Drag points to refine. <kbd className="bg-white/10 px-1.5 py-0.5 rounded text-[10px]">Alt+Drag</kbd> or <kbd className="bg-white/10 px-1.5 py-0.5 rounded text-[10px]">Scroll</kbd> to zoom/pan.
            </p>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            {landmarks.length > 0 && (
              <span className="text-[10px] text-white/40 font-bold">{landmarks.length} pts</span>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}
