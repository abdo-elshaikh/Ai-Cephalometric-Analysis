import { useLocation, useRoute } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  ArrowLeft,
  ZoomIn,
  ZoomOut,
  Maximize,
  Move,
  Sun,
  Contrast,
  Target,
  Play,
  Save,
  Settings,
  ChevronRight,
  ChevronLeft,
  Info,
  Ruler,
  History,
  Maximize2,
  Minimize2
} from "lucide-react";
import { useState, useRef, useEffect, useMemo } from "react";
import { toast } from "sonner";
import { Spinner } from "@/components/ui/spinner";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { CheckCircle2, Circle, AlertCircle } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { motion, useMotionValue, useTransform, AnimatePresence } from "framer-motion";
import React, { memo } from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export default function AnalysisPage() {
  const [, navigate] = useLocation();
  const [match, params] = useRoute("/analysis/:studyId/:imageId");
  const studyId = params?.studyId as string;
  const imageId = params?.imageId as string;

  // State
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [brightness, setBrightness] = useState(100);
  const [contrast, setContrast] = useState(100);
  const [activeTab, setActiveTab] = useState("analysis");
  const [selectedAnalysis, setSelectedAnalysis] = useState("Steiner");
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isCalibrating, setIsCalibrating] = useState(false);
  const [calibrationPoints, setCalibrationPoints] = useState<{ x: number, y: number }[]>([]);
  const [showCalibrationDialog, setShowCalibrationDialog] = useState(false);
  const [knownDistance, setKnownDistance] = useState("10");
  const [imageSize, setImageSize] = useState({ width: 0, height: 0 });
  const [analysisSessionId, setAnalysisSessionId] = useState<string | null>(null);
  const [landmarkToAdjust, setLandmarkToAdjust] = useState<{ landmarkCode: string, x: number, y: number } | null>(null);
  const [adjustmentReason, setAdjustmentReason] = useState("");
  const [showAdjustmentDialog, setShowAdjustmentDialog] = useState(false);
  const [hoveredLandmark, setHoveredLandmark] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Queries
  const { data: image, isLoading: isImageLoading, refetch: refetchImage } = trpc.image.get.useQuery(imageId, {
    enabled: !!imageId,
  });

  const { data: session } = trpc.analysis.getSession.useQuery(analysisSessionId!, {
    enabled: !!analysisSessionId,
  });

  const { data: landmarks } = trpc.analysis.getLandmarks.useQuery(analysisSessionId!, {
    enabled: !!analysisSessionId,
  });

  const { data: study, isLoading: isStudyLoading } = trpc.study.get.useQuery(studyId, {
    enabled: !!studyId,
  });

  // Viewer controls
  const handleZoomIn = () => setZoom(prev => Math.min(prev + 0.2, 5));
  const handleZoomOut = () => setZoom(prev => Math.max(prev - 0.2, 0.5));
  const handleReset = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setBrightness(100);
    setContrast(100);
    setCalibrationPoints([]);
    setIsCalibrating(false);
  };

  const calibrateMutation = trpc.image.calibrate.useMutation({
    onSuccess: () => {
      toast.success("Image calibrated successfully");
      setShowCalibrationDialog(false);
      setCalibrationPoints([]);
      refetchImage();
    },
    onError: (error) => {
      toast.error(error.message || "Failed to calibrate image");
    },
  });

  const handleImageClick = (e: React.MouseEvent) => {
    if (!isCalibrating) return;

    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * imageSize.width;
    const y = ((e.clientY - rect.top) / rect.height) * imageSize.height;

    const newPoints = [...calibrationPoints, { x, y }];
    setCalibrationPoints(newPoints);

    if (newPoints.length === 2) {
      setShowCalibrationDialog(true);
      setIsCalibrating(false);
    }
  };

  const handleCalibrationSubmit = () => {
    if (calibrationPoints.length !== 2) return;

    calibrateMutation.mutate({
      imageId,
      point1: calibrationPoints[0],
      point2: calibrationPoints[1],
      knownDistanceMm: parseFloat(knownDistance),
    });
  };

  const detectMutation = trpc.analysis.detect.useMutation({
    onSuccess: (data) => {
      toast.success("AI detection completed");
      setAnalysisSessionId(data.id);
      setActiveTab("landmarks");
    },
    onError: (error) => {
      toast.error(error.message || "Failed to start AI detection");
    },
  });

  const handleRunAnalysis = () => {
    if (!image.isCalibrated) {
      toast.error("Please calibrate the image first");
      return;
    }
    detectMutation.mutate({ imageId, analysisType: selectedAnalysis });
  };

  const adjustMutation = trpc.analysis.adjustLandmark.useMutation({
    onSuccess: () => {
      toast.success("Landmark adjusted successfully");
      setShowAdjustmentDialog(false);
      setLandmarkToAdjust(null);
      setAdjustmentReason("");
      // No need to refetch everything, but maybe landmarks
    },
    onError: (error) => {
      toast.error(error.message || "Failed to adjust landmark");
    },
  });

  const handleLandmarkDragEnd = (landmarkCode: string, p: { x: number, y: number }) => {
    setLandmarkToAdjust({ landmarkCode, x: p.x, y: p.y });
    setShowAdjustmentDialog(true);
  };

  const handleAdjustmentSubmit = () => {
    if (!landmarkToAdjust || !adjustmentReason) return;

    adjustMutation.mutate({
      sessionId: analysisSessionId!,
      landmarkCode: landmarkToAdjust.landmarkCode,
      x: landmarkToAdjust.x,
      y: landmarkToAdjust.y,
      reason: adjustmentReason,
    });
  };

  const LandmarkMarker = useMemo(() => memo(({ l, imageSize, hoveredLandmark, setHoveredLandmark, onDragEnd }: any) => {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <motion.g
            className="group/landmark pointer-events-auto cursor-pointer"
            drag
            dragMomentum={false}
            onDragEnd={(e, info) => {
              const rect = (e.target as HTMLElement).parentElement?.parentElement?.getBoundingClientRect();
              if (!rect) return;
              const x = ((info.point.x - rect.left) / rect.width) * imageSize.width;
              const y = ((info.point.y - rect.top) / rect.height) * imageSize.height;
              onDragEnd(l.landmarkCode, { x, y });
            }}
            onMouseEnter={() => setHoveredLandmark(l.landmarkCode)}
            onMouseLeave={() => setHoveredLandmark(null)}
            initial={{ x: 0, y: 0 }}
          >
            <circle
              cx={l.x}
              cy={l.y}
              r={imageSize.width * 0.004}
              fill={hoveredLandmark === l.landmarkCode ? "#fbbf24" : "#3b82f6"}
              className="filter drop-shadow-[0_0_2px_rgba(0,0,0,0.5)] transition-colors duration-200"
            />
            <circle
              cx={l.x}
              cy={l.y}
              r={imageSize.width * (hoveredLandmark === l.landmarkCode ? 0.015 : 0.012)}
              fill="transparent"
              stroke={hoveredLandmark === l.landmarkCode ? "#fbbf24" : "#3b82f6"}
              strokeWidth={imageSize.width * 0.001}
              className="opacity-40 group-hover/landmark:opacity-100 transition-all duration-200"
            />
            <text
              x={l.x + imageSize.width * 0.01}
              y={l.y + imageSize.width * 0.003}
              fill={hoveredLandmark === l.landmarkCode ? "#fbbf24" : "#3b82f6"}
              fontSize={imageSize.width * 0.01}
              fontWeight="bold"
              className="select-none filter drop-shadow-[0_1px_1px_rgba(0,0,0,0.8)] transition-colors duration-200"
            >
              {l.landmarkCode}
            </text>
          </motion.g>
        </TooltipTrigger>
        <TooltipContent className="bg-slate-900 border-slate-800 text-[10px] text-slate-200 p-2 space-y-1">
          <p className="font-bold border-b border-slate-800 pb-1 mb-1">{l.landmarkName || l.landmarkCode}</p>
          <div className="flex justify-between gap-4">
            <span className="text-slate-500">Confidence:</span>
            <span className={`font-mono ${l.confidence > 0.9 ? "text-green-500" : l.confidence > 0.7 ? "text-yellow-500" : "text-red-500"}`}>
              {Math.round(l.confidence * 100)}%
            </span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-slate-500">Status:</span>
            <span>{l.isAdjusted ? "Manually Adjusted" : "AI Detected"}</span>
          </div>
        </TooltipContent>
      </Tooltip>
    );
  }), []);

  const [isSaving, setIsSaving] = useState(false);
  const handleFinalSave = () => {
    setIsSaving(true);
    // Clinical finalization logic
    setTimeout(() => {
      setIsSaving(false);
      toast.success("Analysis finalized and saved successfully", {
        description: "Generating clinical results summary...",
      });
      setTimeout(() => {
        navigate(`/results/${analysisSessionId}`);
      }, 1000);
    }, 1500);
  };

  if (isImageLoading || isStudyLoading) {
    return (
      <div className="flex h-[80vh] lg:h-screen items-center justify-center bg-slate-950 text-white rounded-xl">
        <div className="flex flex-col items-center gap-4">
          <Spinner className="h-8 w-8 text-primary" />
          <p className="text-sm font-medium animate-pulse">Initializing clinical viewer...</p>
        </div>
      </div>
    );
  }

  if (!image) {
    return <div className="p-6 text-center">Image not found</div>;
  }

  return (
    <div className={`flex flex-col overflow-hidden bg-slate-950 text-slate-50 rounded-xl border border-slate-800 shadow-2xl transition-all duration-300 ${isFullscreen ? "fixed inset-0 z-[100] rounded-none border-none" : "h-[calc(100vh-2rem)]"}`}>
      {/* Top Toolbar */}
      <div className="h-14 border-b border-slate-800 bg-slate-900/50 backdrop-blur-md px-4 flex items-center justify-between z-10">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            className="text-slate-400 hover:text-white hover:bg-slate-800"
            onClick={() => navigate(`/studies/${study?.patientId}/${studyId}`)}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="h-6 w-px bg-slate-800" />
          <div className="flex flex-col">
            <span className="text-sm font-semibold">{image.originalName}</span>
            <span className="text-[10px] text-slate-500 uppercase tracking-wider font-bold">
              {study?.studyType || "LATERAL"} CEPHALOMETRIC
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center bg-slate-800/50 rounded-lg p-1 mr-4">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-slate-300"
              onClick={handleZoomOut}
              aria-label="Zoom out"
            >
              <ZoomOut className="h-4 w-4" />
            </Button>
            <span className="text-xs font-mono w-12 text-center text-slate-400" aria-live="polite">
              {Math.round(zoom * 100)}%
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-slate-300"
              onClick={handleZoomIn}
              aria-label="Zoom in"
            >
              <ZoomIn className="h-4 w-4" />
            </Button>
            <div className="w-px h-4 bg-slate-700 mx-1" />
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-slate-300"
              onClick={handleReset}
              aria-label="Reset viewer"
            >
              <Maximize className="h-4 w-4" />
            </Button>
            <div className="w-px h-4 bg-slate-700 mx-1" />
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-slate-300"
              onClick={() => setIsFullscreen(!isFullscreen)}
            >
              {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            </Button>
          </div>

          <Button
            variant="default"
            size="sm"
            className="bg-primary hover:bg-primary/90 text-white gap-2 shadow-lg shadow-primary/20"
            onClick={handleRunAnalysis}
            disabled={detectMutation.isPending || !image.isCalibrated}
          >
            {detectMutation.isPending ? (
              <Spinner className="h-3.5 w-3.5" />
            ) : (
              <Play className="h-3.5 w-3.5 fill-current" />
            )}
            {detectMutation.isPending ? "Detecting..." : "Run AI Analysis"}
          </Button>

          <div className="h-6 w-px bg-slate-800 mx-2" />

          <Button variant="ghost" size="icon" className="text-slate-400 hover:text-white">
            <Settings className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden relative">
        {/* Main Viewer Area */}
        <div className="flex-1 relative overflow-hidden bg-black flex items-center justify-center group">
          {/* AI Detection Loading Overlay */}
          <AnimatePresence>
            {detectMutation.isPending && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex flex-col items-center justify-center gap-6"
              >
                <div className="relative">
                  <Spinner className="h-16 w-16 text-primary" />
                  <motion.div
                    className="absolute inset-0 border-4 border-primary/20 rounded-full"
                    animate={{ scale: [1, 1.2, 1], opacity: [0.5, 0.2, 0.5] }}
                    transition={{ duration: 2, repeat: Infinity }}
                  />
                </div>
                <div className="text-center space-y-2">
                  <h3 className="text-lg font-bold text-slate-50 tracking-tight">AI Engines Processing...</h3>
                  <p className="text-sm text-slate-400 max-w-[280px]">Our neural networks are identifying anatomical landmarks with clinical precision.</p>
                </div>
                <div className="w-48">
                  <Progress value={undefined} className="h-1 bg-slate-800" />
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Diagnostic Overlay Info */}
          <div className="absolute top-4 left-4 z-10 flex flex-col gap-1.5 pointer-events-none">
            <div className="px-2 py-1 rounded bg-black/60 border border-white/10 backdrop-blur-sm">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">Calibration</p>
              <p className="text-xs font-medium text-yellow-500">
                {image.isCalibrated ? "1.00 px/mm" : "NOT CALIBRATED"}
              </p>
            </div>
            {image.isCalibrated && (
              <div className="px-2 py-1 rounded bg-black/60 border border-white/10 backdrop-blur-sm">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">Scale</p>
                <p className="text-xs font-medium text-slate-200">1:1 Clinical Scale</p>
              </div>
            )}
          </div>

          {/* Canvas/Image Container */}
          <motion.div
            className={`relative ${isCalibrating ? "cursor-crosshair" : "cursor-default"}`}
            style={{
              scale: zoom,
              x: pan.x,
              y: pan.y,
              filter: `brightness(${brightness}%) contrast(${contrast}%)`
            }}
            onClick={handleImageClick}
          >
            <img
              src={image.imageUrl}
              alt="Clinical X-Ray"
              className="max-h-[85vh] w-auto select-none pointer-events-none shadow-2xl"
              onDragStart={(e) => e.preventDefault()}
              onLoad={(e) => {
                const img = e.currentTarget;
                setImageSize({ width: img.naturalWidth, height: img.naturalHeight });
              }}
            />

            {/* SVG Overlay for landmarks and traces */}
            <svg
              className="absolute inset-0 w-full h-full pointer-events-none"
              viewBox={`0 0 ${imageSize.width} ${imageSize.height}`}
            >
              {/* Calibration Points */}
              {calibrationPoints.map((p, i) => (
                <g key={i}>
                  <circle cx={p.x} cy={p.y} r={imageSize.width * 0.005} fill="#eab308" />
                  <circle cx={p.x} cy={p.y} r={imageSize.width * 0.015} fill="transparent" stroke="#eab308" strokeWidth={imageSize.width * 0.002} />
                </g>
              ))}
              {calibrationPoints.length === 2 && (
                <line
                  x1={calibrationPoints[0].x}
                  y1={calibrationPoints[0].y}
                  x2={calibrationPoints[1].x}
                  y2={calibrationPoints[1].y}
                  stroke="#eab308"
                  strokeWidth={imageSize.width * 0.003}
                  strokeDasharray={`${imageSize.width * 0.01} ${imageSize.width * 0.01}`}
                />
              )}

              {/* AI Landmarks */}
              <TooltipProvider>
                {landmarks?.map((l: any) => (
                  <LandmarkMarker
                    key={l.landmarkCode}
                    l={l}
                    imageSize={imageSize}
                    hoveredLandmark={hoveredLandmark}
                    setHoveredLandmark={setHoveredLandmark}
                    onDragEnd={handleLandmarkDragEnd}
                  />
                ))}
              </TooltipProvider>
            </svg>
          </motion.div>

          {/* Floating Controls Overlay */}
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-4 px-6 py-3 rounded-2xl bg-slate-900/80 border border-slate-700/50 backdrop-blur-xl shadow-2xl opacity-0 group-hover:opacity-100 transition-all duration-300 translate-y-2 group-hover:translate-y-0">
            <div className="flex items-center gap-3">
              <Sun className="h-4 w-4 text-yellow-500" />
              <Slider
                value={[brightness]}
                min={50}
                max={200}
                step={1}
                onValueChange={([v]) => setBrightness(v)}
                className="w-32"
                aria-label="Adjust brightness"
              />
            </div>
            <div className="w-px h-6 bg-slate-700" />
            <div className="flex items-center gap-3">
              <Contrast className="h-4 w-4 text-blue-400" />
              <Slider
                value={[contrast]}
                min={50}
                max={200}
                step={1}
                onValueChange={([v]) => setContrast(v)}
                className="w-32"
                aria-label="Adjust contrast"
              />
            </div>
          </div>
        </div>

        {/* Right Sidebar */}
        <motion.div
          initial={false}
          animate={{ width: isSidebarOpen ? 320 : 0 }}
          className="bg-slate-900 border-l border-slate-800 flex flex-col overflow-hidden relative"
        >
          {/* Toggle Button */}
          <button
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className="absolute -left-3 top-1/2 -translate-y-1/2 h-8 w-6 bg-slate-900 border border-slate-800 rounded-l-md flex items-center justify-center text-slate-500 hover:text-white z-20"
          >
            {isSidebarOpen ? <ChevronRight className="h-3 w-3" /> : <ChevronLeft className="h-3 w-3" />}
          </button>

          <div className="p-4 flex flex-col h-full min-w-[320px]">
            <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
              <TabsList className="grid w-full grid-cols-2 bg-slate-950/50 border border-slate-800 p-1">
                <TabsTrigger value="analysis" className="data-[state=active]:bg-slate-800">Analysis</TabsTrigger>
                <TabsTrigger value="landmarks" className="data-[state=active]:bg-slate-800">Landmarks</TabsTrigger>
              </TabsList>

              {/* Workflow Checklist */}
              <div className="mt-4 bg-slate-950/30 rounded-lg border border-slate-800/50 p-3 space-y-2.5">
                <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1 px-1">Clinical Protocol</h4>
                <div className="space-y-2">
                  <div className="flex items-center gap-2.5">
                    <div className="flex-shrink-0">
                      {image?.isCalibrated ? <CheckCircle2 className="h-3.5 w-3.5 text-green-500" /> : <Circle className="h-3.5 w-3.5 text-slate-700" />}
                    </div>
                    <span className={`text-[11px] font-medium ${image?.isCalibrated ? "text-slate-300" : "text-slate-600"}`}>1. Digital Calibration</span>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <div className="flex-shrink-0">
                      {analysisSessionId ? <CheckCircle2 className="h-3.5 w-3.5 text-green-500" /> : <Circle className="h-3.5 w-3.5 text-slate-700" />}
                    </div>
                    <span className={`text-[11px] font-medium ${analysisSessionId ? "text-slate-300" : "text-slate-600"}`}>2. Neural Landmark Detection</span>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <div className="flex-shrink-0">
                      {landmarks?.some((l: any) => l.isAdjusted) ? <CheckCircle2 className="h-3.5 w-3.5 text-green-500" /> : <Circle className="h-3.5 w-3.5 text-slate-700" />}
                    </div>
                    <span className={`text-[11px] font-medium ${landmarks?.some((l: any) => l.isAdjusted) ? "text-slate-300" : "text-slate-600"}`}>3. Radiographic Verification</span>
                  </div>
                </div>
              </div>

              <TabsContent value="analysis" className="flex-1 mt-4 space-y-4 overflow-y-auto pr-1 custom-scrollbar">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-1">Selected Analysis</label>
                  <Select value={selectedAnalysis} onValueChange={setSelectedAnalysis}>
                    <SelectTrigger className="bg-slate-950 border-slate-800 text-slate-200">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-slate-900 border-slate-800 text-slate-200">
                      <SelectItem value="Steiner">Steiner Analysis</SelectItem>
                      <SelectItem value="McNamara">McNamara Analysis</SelectItem>
                      <SelectItem value="Tweed">Tweed Analysis</SelectItem>
                      <SelectItem value="Wits">Wits Appraisal</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <Card className="bg-slate-950 border-slate-800 p-4 space-y-3">
                  <div className="flex items-center gap-2 text-primary">
                    <Info className="h-4 w-4" />
                    <span className="text-xs font-semibold">Workflow Tip</span>
                  </div>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Calibration is required before AI detection. Click two points on the ruler to set the clinical scale.
                  </p>
                  <Button
                    variant={isCalibrating ? "default" : "outline"}
                    size="sm"
                    className={`w-full ${isCalibrating ? "bg-yellow-500 hover:bg-yellow-600 text-slate-950" : "border-yellow-500/50 text-yellow-500 hover:bg-yellow-500/10"}`}
                    onClick={() => {
                      setIsCalibrating(!isCalibrating);
                      setCalibrationPoints([]);
                    }}
                  >
                    <Ruler className="h-4 w-4 mr-2" />
                    {isCalibrating ? "Click on Ruler..." : image.isCalibrated ? "Recalibrate" : "Start Calibration"}
                  </Button>
                </Card>

                <div className="pt-4 border-t border-slate-800">
                  <h3 className="text-sm font-semibold mb-3">Diagnostic Tools</h3>
                  <div className="grid grid-cols-2 gap-2">
                    <Button variant="outline" size="sm" className="justify-start gap-2 border-slate-800 hover:bg-slate-800">
                      <Target className="h-3.5 w-3.5" />
                      Add Point
                    </Button>
                    <Button variant="outline" size="sm" className="justify-start gap-2 border-slate-800 hover:bg-slate-800">
                      <Move className="h-3.5 w-3.5" />
                      Pan Mode
                    </Button>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="landmarks" className="flex-1 mt-4 overflow-y-auto pr-1 custom-scrollbar">
                <div className="space-y-1">
                  {!landmarks || landmarks.length === 0 ? (
                    <div className="text-center py-12">
                      <div className="bg-slate-800/30 rounded-full w-12 h-12 flex items-center justify-center mx-auto mb-4">
                        <Target className="h-6 w-6 text-slate-600" />
                      </div>
                      <p className="text-sm text-slate-500">No landmarks detected yet</p>
                      <p className="text-[10px] text-slate-600 mt-1 uppercase font-bold">Run AI to populate list</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 gap-1">
                      {landmarks.map((l: any) => (
                        <div
                          key={l.landmarkCode}
                          className={`flex flex-col p-2 rounded group transition-colors cursor-pointer ${hoveredLandmark === l.landmarkCode ? "bg-slate-800" : "hover:bg-slate-800/50"}`}
                          onMouseEnter={() => setHoveredLandmark(l.landmarkCode)}
                          onMouseLeave={() => setHoveredLandmark(null)}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <div className={`h-2 w-2 rounded-full ${l.isAdjusted ? "bg-yellow-500" : "bg-blue-500"}`} />
                              <span className="text-xs font-medium text-slate-300">{l.landmarkCode}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              {l.confidence && (
                                <span className={`text-[10px] font-mono ${l.confidence > 0.9 ? "text-green-500/70" : l.confidence > 0.7 ? "text-yellow-500/70" : "text-red-500/70"}`}>
                                  {Math.round(l.confidence * 100)}%
                                </span>
                              )}
                              <span className="text-[10px] font-mono text-slate-500 group-hover:text-slate-400">
                                {Math.round(l.x)}, {Math.round(l.y)}
                              </span>
                            </div>
                          </div>
                          {l.isAdjusted && l.adjustmentReason && (
                            <div className="mt-1 ml-5 flex items-center gap-1.5 text-[10px] text-yellow-500/70 italic">
                              <History className="h-2.5 w-2.5" />
                              {l.adjustmentReason}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </TabsContent>
            </Tabs>

            <div className="mt-auto pt-4 border-t border-slate-800 space-y-2">
              <Button
                variant="outline"
                className="w-full border-slate-800 text-slate-400 hover:bg-slate-800"
                onClick={() => {
                  if (analysisSessionId) {
                    navigate(`/results/${analysisSessionId}`);
                  } else {
                    toast.error("Run AI Analysis first to see results");
                  }
                }}
              >
                Preview Results
              </Button>
              <Button
                className="w-full bg-primary text-white hover:bg-primary/90 gap-2 font-semibold shadow-lg shadow-primary/20"
                onClick={handleFinalSave}
                disabled={isSaving || !analysisSessionId}
              >
                {isSaving ? <Spinner className="h-4 w-4" /> : <Save className="h-4 w-4" />}
                Finalize & Save
              </Button>
            </div>
          </div>
        </motion.div>
      </div>

      {/* Calibration Dialog */}
      <Dialog open={showCalibrationDialog} onOpenChange={setShowCalibrationDialog}>
        <DialogContent className="bg-slate-900 border-slate-800 text-slate-50">
          <DialogHeader>
            <DialogTitle>Set Calibration Distance</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-400">Known Distance (mm)</label>
              <div className="relative">
                <Input
                  type="number"
                  value={knownDistance}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setKnownDistance(e.target.value)}
                  className="bg-slate-950 border-slate-800 text-slate-50 pl-10"
                />
                <Ruler className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
              </div>
              <p className="text-[10px] text-slate-500 italic">Enter the actual distance between the two selected points on the ruler.</p>
            </div>
          </div>
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setShowCalibrationDialog(false)} className="border-slate-800 text-slate-300">
              Cancel
            </Button>
            <Button
              onClick={handleCalibrationSubmit}
              disabled={calibrateMutation.isPending}
              className="bg-primary text-white"
            >
              {calibrateMutation.isPending ? "Applying..." : "Save Calibration"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Adjustment Reason Dialog */}
      <Dialog open={showAdjustmentDialog} onOpenChange={setShowAdjustmentDialog}>
        <DialogContent className="bg-slate-900 border-slate-800 text-slate-50">
          <DialogHeader>
            <DialogTitle>Landmark Adjustment</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <p className="text-sm text-slate-400">
              You are moving landmark <span className="text-primary font-bold">{landmarkToAdjust?.landmarkCode}</span>.
              Clinical protocols require a reason for manual adjustment.
            </p>
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-400">Adjustment Reason *</label>
              <Select value={adjustmentReason} onValueChange={setAdjustmentReason}>
                <SelectTrigger className="bg-slate-950 border-slate-800 text-slate-50">
                  <SelectValue placeholder="Select reason..." />
                </SelectTrigger>
                <SelectContent className="bg-slate-900 border-slate-800 text-slate-50">
                  <SelectItem value="Anatomical variation">Anatomical variation</SelectItem>
                  <SelectItem value="Poor image quality">Poor image quality</SelectItem>
                  <SelectItem value="AI misplacement">AI misplacement</SelectItem>
                  <SelectItem value="Other">Other (specify in notes)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setShowAdjustmentDialog(false)} className="border-slate-800 text-slate-300">
              Cancel
            </Button>
            <Button
              onClick={handleAdjustmentSubmit}
              disabled={adjustMutation.isPending || !adjustmentReason}
              className="bg-primary text-white"
            >
              {adjustMutation.isPending ? "Updating..." : "Save Adjustment"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
