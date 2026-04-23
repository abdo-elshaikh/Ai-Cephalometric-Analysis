import { useLocation, useRoute } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { 
  ArrowLeft, 
  FileText, 
  Download, 
  CheckCircle2, 
  AlertCircle, 
  ChevronRight,
  TrendingUp,
  Stethoscope,
  ClipboardList,
  Copy,
  User
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Search, ArrowUpDown } from "lucide-react";

export default function ResultsPage() {
  const [, navigate] = useLocation();
  const [match, params] = useRoute("/results/:sessionId");
  const sessionId = params?.sessionId as string;
  const [filter, setFilter] = useState("");
  const [sortField, setSortField] = useState("name");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");

  // Queries
  const { data: measurements, isLoading: isMeasurementsLoading } = trpc.analysis.getMeasurements.useQuery(sessionId, {
    enabled: !!sessionId,
  });

  const { data: diagnosis, isLoading: isDiagnosisLoading } = trpc.analysis.getDiagnosis.useQuery(sessionId, {
    enabled: !!sessionId,
  });

  const { data: treatment, isLoading: isTreatmentLoading } = trpc.analysis.getTreatment.useQuery(sessionId, {
    enabled: !!sessionId,
  });

  const generateReport = trpc.report.generate.useMutation({
    onSuccess: (data: any) => {
      if (data.downloadUrl) {
        window.open(data.downloadUrl, "_blank");
        toast.success("Report generated successfully");
      } else {
        toast.error("Report generation failed: No download URL provided");
      }
    },
    onError: (error) => {
      toast.error(error.message || "Failed to generate report");
    },
  });

  const handleDownloadPDF = () => {
    generateReport.mutate({ sessionId, format: "pdf" });
  };

  const handleDownloadWord = () => {
    generateReport.mutate({ sessionId, format: "docx" });
  };

  const filteredMeasurements = measurements?.filter((m: any) => 
    m.name.toLowerCase().includes(filter.toLowerCase()) ||
    m.category.toLowerCase().includes(filter.toLowerCase())
  ).sort((a: any, b: any) => {
    const aValue = a[sortField];
    const bValue = b[sortField];
    if (aValue < bValue) return sortOrder === "asc" ? -1 : 1;
    if (aValue > bValue) return sortOrder === "asc" ? 1 : -1;
    return 0;
  });

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortOrder("asc");
    }
  };

  if (isMeasurementsLoading || isDiagnosisLoading || isTreatmentLoading) {
    return (
      <div className="space-y-8 max-w-7xl mx-auto">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Skeleton className="h-10 w-10 rounded-md" />
            <div className="space-y-2">
              <Skeleton className="h-8 w-64" />
              <Skeleton className="h-4 w-48" />
            </div>
          </div>
          <div className="flex gap-3">
            <Skeleton className="h-10 w-32" />
            <Skeleton className="h-10 w-40" />
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-24 rounded-xl" />)}
        </div>
        <div className="space-y-4">
          <Skeleton className="h-10 w-96 rounded-md" />
          <Card className="p-4"><Skeleton className="h-[400px] w-full" /></Card>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-7xl mx-auto pb-12">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => window.history.back()}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Analysis Results</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Clinical diagnostic summary and treatment recommendations
            </p>
          </div>
        </div>
        <div className="flex gap-3">
          <Button 
            variant="outline" 
            className="gap-2" 
            onClick={handleDownloadWord}
            disabled={generateReport.isPending}
          >
            <Download className="h-4 w-4" />
            Word
          </Button>
          <Button 
            className="gap-2" 
            onClick={handleDownloadPDF}
            disabled={generateReport.isPending}
          >
            <FileText className="h-4 w-4" />
            {generateReport.isPending ? "Generating..." : "Download Report"}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="p-6 flex items-center gap-4 border-l-4 border-l-primary shadow-sm hover:shadow-md transition-shadow">
          <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
            <CheckCircle2 className="h-6 w-6 text-primary" />
          </div>
          <div>
            <p className="text-sm text-muted-foreground font-medium">Analysis Status</p>
            <p className="text-xl font-bold">Completed</p>
          </div>
        </Card>
        <Card className="p-6 flex items-center gap-4 border-l-4 border-l-blue-500 shadow-sm hover:shadow-md transition-shadow">
          <div className="h-12 w-12 rounded-full bg-blue-500/10 flex items-center justify-center">
            <TrendingUp className="h-6 w-6 text-blue-500" />
          </div>
          <div>
            <p className="text-sm text-muted-foreground font-medium">Measurements</p>
            <p className="text-xl font-bold">{measurements?.length || 0} Points</p>
          </div>
        </Card>
        <Card className="p-6 flex items-center gap-4 border-l-4 border-l-amber-500 shadow-sm hover:shadow-md transition-shadow">
          <div className="h-12 w-12 rounded-full bg-amber-500/10 flex items-center justify-center">
            <AlertCircle className="h-6 w-6 text-amber-500" />
          </div>
          <div>
            <p className="text-sm text-muted-foreground font-medium">Clinical Rationale</p>
            <p className="text-xl font-bold">Standardized</p>
          </div>
        </Card>
      </div>

      <Tabs defaultValue="diagnosis" className="w-full">
        <TabsList className="bg-slate-100 dark:bg-slate-800 p-1 rounded-xl mb-6">
          <TabsTrigger value="diagnosis" className="gap-2 px-6 rounded-lg data-[state=active]:bg-white dark:data-[state=active]:bg-slate-700 data-[state=active]:shadow-sm">
            <Stethoscope className="h-4 w-4" />
            Diagnosis
          </TabsTrigger>
          <TabsTrigger value="measurements" className="gap-2 px-6 rounded-lg data-[state=active]:bg-white dark:data-[state=active]:bg-slate-700 data-[state=active]:shadow-sm">
            <TrendingUp className="h-4 w-4" />
            Measurements
          </TabsTrigger>
          <TabsTrigger value="treatment" className="gap-2 px-6 rounded-lg data-[state=active]:bg-white dark:data-[state=active]:bg-slate-700 data-[state=active]:shadow-sm">
            <ClipboardList className="h-4 w-4" />
            Treatment Plan
          </TabsTrigger>
          <TabsTrigger value="overlay" className="gap-2 px-6 rounded-lg data-[state=active]:bg-white dark:data-[state=active]:bg-slate-700 data-[state=active]:shadow-sm">
            <User className="h-4 w-4" />
            Overlay
          </TabsTrigger>
        </TabsList>

        <TabsContent value="diagnosis" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="p-6 space-y-4">
              <h3 className="text-lg font-bold flex items-center gap-2">
                <FileText className="h-5 w-5 text-primary" />
                Skeletal & Vertical Diagnosis
              </h3>
              <div className="space-y-3">
                <div className="flex justify-between items-start border-b border-border pb-3">
                  <span className="text-sm text-muted-foreground">Skeletal Class</span>
                  <Badge variant="outline" className="bg-primary/5 text-primary border-primary/20">{diagnosis?.skeletalClass}</Badge>
                </div>
                <div className="flex justify-between items-start border-b border-border pb-3">
                  <span className="text-sm text-muted-foreground">Vertical Pattern</span>
                  <span className="text-sm font-medium">{diagnosis?.verticalPattern}</span>
                </div>
                <div className="flex justify-between items-start border-b border-border pb-3">
                  <span className="text-sm text-muted-foreground">Maxillary Position</span>
                  <span className="text-sm font-medium">{diagnosis?.maxillaryPosition}</span>
                </div>
                <div className="flex justify-between items-start border-b border-border pb-3">
                  <span className="text-sm text-muted-foreground">Mandibular Position</span>
                  <span className="text-sm font-medium">{diagnosis?.mandibularPosition}</span>
                </div>
                <div className="flex justify-between items-start border-b border-border pb-3">
                  <span className="text-sm text-muted-foreground">Incisor Inclinations</span>
                  <span className="text-sm font-medium">{diagnosis?.incisorInclinations}</span>
                </div>
                <div className="flex justify-between items-start border-b border-border pb-3">
                  <span className="text-sm text-muted-foreground">Soft Tissue Profile</span>
                  <span className="text-sm font-medium">{diagnosis?.softTissueProfile}</span>
                </div>
              </div>
            </Card>

            <Card className="p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold flex items-center gap-2">
                  <Stethoscope className="h-5 w-5 text-primary" />
                  Clinical Impressions
                </h3>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="h-8 gap-2 text-xs"
                  onClick={() => {
                    navigator.clipboard.writeText(diagnosis?.summary || "");
                    toast.success("Summary copied to clipboard");
                  }}
                >
                  <Copy className="h-3.5 w-3.5" />
                  Copy
                </Button>
              </div>
              <div className="space-y-4 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
                <p>
                  The analysis indicates a <span className="text-foreground font-semibold">{diagnosis?.skeletalClass}</span> relationship 
                  with a <span className="text-foreground font-semibold">{diagnosis?.verticalPattern}</span> growth pattern.
                </p>
                <div className="p-4 bg-slate-50 dark:bg-slate-900 rounded-lg border border-border">
                  <p className="italic">
                    {diagnosis?.summary}
                  </p>
                </div>
                {diagnosis?.warnings && diagnosis.warnings.length > 0 && (
                  <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-900/50 flex gap-3">
                    <AlertCircle className="h-5 w-5 text-amber-500 shrink-0" />
                    <div>
                      <p className="text-xs font-bold text-amber-600 uppercase tracking-wider">Clinical Warnings</p>
                      <ul className="list-disc list-inside mt-1 text-xs space-y-1">
                        {diagnosis.warnings.map((w: string, i: number) => (
                          <li key={i}>{w}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                )}
              </div>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="measurements" className="space-y-4">
          <Card className="p-4">
            <div className="flex flex-col md:flex-row gap-4 mb-6">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input 
                  placeholder="Filter measurements by name or category..." 
                  className="pl-9"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground whitespace-nowrap">Sort by:</span>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => handleSort("name")}
                  className="gap-2"
                >
                  Name
                  <ArrowUpDown className="h-3 w-3" />
                </Button>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => handleSort("status")}
                  className="gap-2"
                >
                  Status
                  <ArrowUpDown className="h-3 w-3" />
                </Button>
              </div>
            </div>

            <div className="rounded-md border border-border overflow-hidden">
              <Table>
                <TableHeader className="bg-slate-50 dark:bg-slate-900/50">
                  <TableRow>
                    <TableHead className="font-bold">Measurement</TableHead>
                    <TableHead className="font-bold">Category</TableHead>
                    <TableHead className="font-bold">Value</TableHead>
                    <TableHead className="font-bold">Normal Range</TableHead>
                    <TableHead className="font-bold">Status</TableHead>
                    <TableHead className="text-right font-bold">Deviation</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredMeasurements?.map((m: any) => (
                    <TableRow key={m.code} className="hover:bg-slate-50 dark:hover:bg-slate-900/50 transition-colors">
                      <TableCell className="font-medium">{m.name}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-[10px] uppercase tracking-tighter">{m.category}</Badge>
                      </TableCell>
                      <TableCell className="font-mono text-sm">{m.value}{m.unit}</TableCell>
                      <TableCell className="text-muted-foreground text-sm font-mono">{m.normalRange}</TableCell>
                      <TableCell>
                        <Badge variant={m.status === "Normal" ? "default" : "destructive"} className="h-5 px-2">
                          {m.status}
                        </Badge>
                      </TableCell>
                      <TableCell className={`text-right font-mono text-sm ${m.status === "Abnormal" ? "text-destructive font-bold" : "text-muted-foreground"}`}>
                        {m.deviation > 0 ? `+${m.deviation}` : m.deviation}{m.unit}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="treatment" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {treatment?.plans.map((plan: any, i: number) => (
              <Card key={i} className="p-6 space-y-4 hover:border-primary/50 transition-colors border-2 border-transparent">
                <div className="flex items-center justify-between">
                  <Badge className="bg-blue-500/10 text-blue-500 hover:bg-blue-500/20 border-blue-500/20 uppercase tracking-widest text-[10px]">
                    {plan.type}
                  </Badge>
                  <span className="text-xs text-muted-foreground flex items-center gap-1.5">
                    <TrendingUp className="h-3 w-3" />
                    {plan.duration}
                  </span>
                </div>
                <div>
                  <h4 className="text-lg font-bold">{plan.name}</h4>
                  <p className="text-sm text-slate-500 mt-2 line-clamp-3">
                    {plan.description}
                  </p>
                </div>
                <div className="pt-4 border-t border-border space-y-3">
                  <div>
                    <p className="text-[10px] font-bold text-slate-400 uppercase">Rationale</p>
                    <p className="text-xs mt-1 italic leading-relaxed">{plan.rationale}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-slate-400 uppercase">Primary Risks</p>
                    <p className="text-xs mt-1 text-destructive/80">{plan.risks}</p>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="overlay" className="space-y-4">
          <Card className="p-6 overflow-hidden flex flex-col items-center justify-center min-h-[500px] bg-slate-950 text-white relative">
            <div className="absolute top-4 left-4 z-10 flex flex-col gap-2">
              <Badge variant="outline" className="bg-black/60 border-white/10 backdrop-blur-sm text-white gap-2">
                <div className="h-2 w-2 rounded-full bg-green-500" />
                Diagnostic Overlay
              </Badge>
              <p className="text-[10px] text-slate-400 uppercase tracking-widest font-bold px-1">Final Radiological Review</p>
            </div>
            <div className="flex flex-col items-center gap-6">
              <User className="h-24 w-24 text-slate-800" />
              <p className="text-slate-500 text-sm italic">Radiographic overlay visualization is generated on report export</p>
              <Button onClick={handleDownloadPDF} variant="outline" className="border-slate-800 text-slate-300 gap-2">
                <FileText className="h-4 w-4" />
                Generate Overlay Report
              </Button>
            </div>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
