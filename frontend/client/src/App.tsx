import {
  useEffect,
  useMemo,
  useState,
} from "react";
import { Toaster, toast } from "sonner";
import { Route, Switch, useLocation } from "wouter";
import { ShieldCheck } from "lucide-react";

import ErrorBoundary from "@/components/ErrorBoundary";
import { ThemeProvider } from "@/contexts/ThemeContext";
import {
  Card,
  PrimaryBtn,
} from "@/components/_core/ClinicalComponents";
import AppShell from "@/components/_core/AppShell";
import CommandPalette from "@/components/_core/CommandPalette";
import { PatientDialog, CaseDialog } from "@/components/ClinicalDialogs";

import DashboardPage from "@/pages/DashboardPage";
import PatientsPage from "@/pages/PatientsPage";
import CasesPage from "@/pages/CasesPage";
import AnalysisPage from "@/pages/AnalysisPage";
import ViewerPage from "@/pages/ViewerPage";
import CalibrationPage from "@/pages/CalibrationPage";
import ResultsPage from "@/pages/ResultsPage";
import HistoryPage from "@/pages/HistoryPage";
import ReportsPage from "@/pages/ReportsPage";
import AuthPage from "@/pages/AuthPage";
import SettingsPage from "@/pages/SettingsPage";
import GuidePage from "@/pages/GuidePage";

import {
  cephApi,
  type BackendAuthUser,
  type ServiceHealth,
} from "@/lib/ceph-api";
import {
  type Patient,
  type CaseRecord,
  type Landmark,
  type ClinicalArtifacts,
  type OverlayArtifact,
  type Report,
  type TimelineItem,
  type ApiMode,
  type Point,
  type PatientFormState,
  type CaseFormState,
  type ReportFormat,
  type CaseStatus,
  type Notification,
  DEFAULT_ARTIFACTS,
  isGuid,
  displayUserName,
  mapWorkspace,
  mapPatient,
  mapLandmarks,
  mapMeasurements,
  mapDiagnosis,
  mapTreatments,
  mapPipelineArtifacts,
  mapOverlay,
  mapReport,
  mergePipelineIntoLandmarks,
  birthDateFromAge,
  toStudyType,
  todayIso,
} from "@/lib/mappers";
import { 
  nowReadable,
  uid
} from "@/lib/clinical-utils";

// ─── Routing Guards ──────────────────────────────────────────────────────────

function AuthRedirectScreen() {
  return (
    <div className="flex h-[60vh] flex-col items-center justify-center gap-4 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-primary/20 bg-primary/10">
        <ShieldCheck className="h-5 w-5 text-primary animate-pulse" />
      </div>
      <div>
        <p className="text-sm font-medium text-foreground">Redirecting to sign in…</p>
        <p className="mt-1 text-xs text-muted-foreground">Your session is not active.</p>
      </div>
    </div>
  );
}

function ProtectedRoute({ 
  authUser, 
  children,
}: { 
  authUser: BackendAuthUser | null; 
  children: React.ReactNode;
}) {
  const [, navigate] = useLocation();
  
  useEffect(() => {
    if (!authUser) {
      navigate("/auth");
    }
  }, [authUser, navigate]);

  if (!authUser) return <AuthRedirectScreen />;
  return <>{children}</>;
}

const DEFAULT_SERVICE_HEALTH: ServiceHealth = {
  backend: { ok: false, status: "checking", detail: "Backend health not checked yet" },
  ai: { ok: false, status: "checking", detail: "AI service is reached through the backend pipeline", directProbe: false },
};

// ─── 404 Page ────────────────────────────────────────────────────────────────

function NotFoundPage() {
  return (
    <div className="flex h-[60vh] flex-col items-center justify-center text-center">
      <h2 className="text-4xl font-bold tracking-tight text-foreground">404</h2>
      <p className="mt-2 text-muted-foreground">The clinical module you are looking for does not exist.</p>
      <PrimaryBtn onClick={() => window.location.href = "/"} className="mt-8">
        Back to Dashboard
      </PrimaryBtn>
    </div>
  );
}

// ─── App Routes ───────────────────────────────────────────────────────────────

interface AppRoutesProps {
  patients: Patient[];
  cases: CaseRecord[];
  reports: Report[];
  history: TimelineItem[];
  landmarks: Landmark[];
  setLandmarks: (l: Landmark[]) => void;
  clinicalArtifacts: ClinicalArtifacts;
  overlayArtifacts: OverlayArtifact[];
  apiMode: ApiMode;
  authUser: BackendAuthUser | null;
  serviceHealth: ServiceHealth;
  workspaceLoading: boolean;
  workspaceError: string | null;
  lastSyncedAt: string | null;
  activePatientId: string;
  activeCaseId: string;
  setActivePatientId: (id: string) => void;
  setActiveCaseId: (id: string) => void;
  openPatientCreate: () => void;
  openPatientEdit: (p: Patient) => void;
  deletePatient: (id: string) => void;
  openCaseCreate: () => void;
  uploadImage: (caseId: string, file: File) => void | Promise<void>;
  runAi: (caseId: string, isCbct: boolean, analysisType?: string) => void | Promise<void>;
  calibrateActiveCase: (pts: Point[], mm: number) => void | Promise<void>;
  saveAndSend: () => void | Promise<void>;
  refreshOverlays: () => void | Promise<void>;
  requestReport: (f: ReportFormat) => void | Promise<void>;
  onRefreshHealth: () => void | Promise<void>;
  onAuth: () => void;
}

function AppRoutes({
  patients, cases, reports, history, landmarks, setLandmarks, clinicalArtifacts, overlayArtifacts,
  apiMode, authUser, serviceHealth, workspaceLoading, workspaceError, lastSyncedAt,
  activePatientId, activeCaseId, setActivePatientId, setActiveCaseId,
  openPatientCreate, openPatientEdit, deletePatient, openCaseCreate,
  uploadImage, runAi, calibrateActiveCase, saveAndSend, refreshOverlays, requestReport,
  onRefreshHealth, onAuth,
}: AppRoutesProps) {
  const activeCase = cases.find(c => c.id === activeCaseId);

  return (
    <Switch>
      <Route path="/">
        <ProtectedRoute authUser={authUser}>
          <DashboardPage
            patients={patients} cases={cases} reports={reports} history={history}
            workspaceLoading={workspaceLoading} workspaceError={workspaceError} lastSyncedAt={lastSyncedAt}
            authUser={authUser} activeCaseId={activeCaseId}
            onRefresh={onRefreshHealth} onAuth={onAuth} onCreateCase={openCaseCreate}
          />
        </ProtectedRoute>
      </Route>
      <Route path="/patients">
        <ProtectedRoute authUser={authUser}>
          <PatientsPage patients={patients} cases={cases} activePatientId={activePatientId} onCreate={openPatientCreate} onEdit={openPatientEdit} onDelete={deletePatient} setActivePatientId={setActivePatientId} />
        </ProtectedRoute>
      </Route>
      <Route path="/cases">
        <ProtectedRoute authUser={authUser}>
          <CasesPage patients={patients} cases={cases} activeCaseId={activeCaseId} setActiveCaseId={setActiveCaseId} onCreateCase={openCaseCreate} />
        </ProtectedRoute>
      </Route>
      <Route path="/analysis">
        <ProtectedRoute authUser={authUser}>
          <AnalysisPage
            patients={patients} cases={cases} apiMode={apiMode} activeCaseId={activeCaseId} activePatientId={activePatientId}
            setActiveCaseId={setActiveCaseId} setActivePatientId={setActivePatientId}
            onCreatePatient={openPatientCreate} onCreateCase={openCaseCreate} onUpload={uploadImage} onRunAi={runAi}
          />
        </ProtectedRoute>
      </Route>
      <Route path="/viewer">
        <ProtectedRoute authUser={authUser}>
          <ViewerPage
            activeCase={activeCase} landmarks={landmarks} setLandmarks={setLandmarks}
            overlays={overlayArtifacts} onSaveAndSend={saveAndSend} onRefreshOverlays={refreshOverlays}
          />
        </ProtectedRoute>
      </Route>
      <Route path="/calibrate">
        <ProtectedRoute authUser={authUser}>
          <CalibrationPage
            activeCase={activeCase} landmarks={landmarks} onCalibrate={calibrateActiveCase}
          />
        </ProtectedRoute>
      </Route>
      <Route path="/results">
        <ProtectedRoute authUser={authUser}>
          <ResultsPage activeCase={activeCase} reports={reports} artifacts={clinicalArtifacts} overlays={overlayArtifacts} onRequestReport={requestReport} />
        </ProtectedRoute>
      </Route>
      <Route path="/history">
        <ProtectedRoute authUser={authUser}>
          <HistoryPage history={history} cases={cases} patients={patients} />
        </ProtectedRoute>
      </Route>
      <Route path="/reports">
        <ProtectedRoute authUser={authUser}>
          <ReportsPage reports={reports} cases={cases} activeCase={activeCase} onRequestReport={requestReport} />
        </ProtectedRoute>
      </Route>
      <Route path="/settings">
        <ProtectedRoute authUser={authUser}>
          <SettingsPage />
        </ProtectedRoute>
      </Route>
      <Route path="/guide">
        <GuidePage />
      </Route>
      <Route path="/auth">
         {/* AuthPage is accessible without ProtectedRoute via direct rendering in App root */}
         <NotFoundPage /> 
      </Route>
      <Route><NotFoundPage /></Route>
    </Switch>
  );
}

// ─── App State & Root ─────────────────────────────────────────────────────────

export default function App() {
  const [location, navigate] = useLocation();
  const [patients, setPatients] = useState<Patient[]>([]);
  const [cases, setCases] = useState<CaseRecord[]>([]);
  const [landmarks, setLandmarks] = useState<Landmark[]>([]);
  const [clinicalArtifacts, setClinicalArtifacts] = useState<ClinicalArtifacts>(DEFAULT_ARTIFACTS);
  const [overlayArtifacts, setOverlayArtifacts] = useState<OverlayArtifact[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [history, setHistory] = useState<TimelineItem[]>([]);
  const [activePatientId, setActivePatientId] = useState("");
  const [activeCaseId, setActiveCaseId] = useState("");
  const [apiMode, setApiMode] = useState<ApiMode>("checking");
  const [authUser, setAuthUser] = useState<BackendAuthUser | null>(() => cephApi.getStoredUser());
  const [authChecked, setAuthChecked] = useState(false);
  const [serviceHealth, setServiceHealth] = useState<ServiceHealth>(DEFAULT_SERVICE_HEALTH);
  const [workspaceLoading, setWorkspaceLoading] = useState(true);
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [patientDialogOpen, setPatientDialogOpen] = useState(false);
  const [caseDialogOpen, setCaseDialogOpen] = useState(false);
  const [editingPatient, setEditingPatient] = useState<Patient | null>(null);
  const [cmdPaletteOpen, setCmdPaletteOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);

  // ── Notification helpers ──────────────────────────────────────────────────────
  function addNotification(type: Notification["type"], title: string, detail: string) {
    const id = `notif-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const now = new Date();
    const timestamp = now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
    setNotifications(prev => [
      { id, type, title, detail, timestamp, read: false },
      ...prev,
    ]);
    // Auto-dismiss after 6 seconds (except errors)
    if (type !== "error") {
      setTimeout(() => dismissNotification(id), 6000);
    }
  }

  function markNotificationAsRead(id: string) {
    setNotifications(prev =>
      prev.map(n => (n.id === id ? { ...n, read: true } : n))
    );
  }

  function dismissNotification(id: string) {
    setNotifications(prev => prev.filter(n => n.id !== id));
  }

  function clearAllNotifications() {
    setNotifications([]);
  }

  // ── Session expiry guard ─────────────────────────────────────────────────────
  useEffect(() => {
    cephApi.setOnAuthExpired(() => {
      addNotification("error", "Session Expired", "Please sign in again to continue.");
      setAuthUser(null);
      setPatients([]); setCases([]); setReports([]); setHistory([]);
      setLandmarks([]); setClinicalArtifacts(DEFAULT_ARTIFACTS); setOverlayArtifacts([]);
      setActivePatientId(""); setActiveCaseId("");
      setApiMode("checking");
    });
    return () => cephApi.clearOnAuthExpired();
  }, []);

  // ── Cmd+K handler ─────────────────────────────────────────────────────────────
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setCmdPaletteOpen(true);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const activeCase = useMemo(() => cases.find(c => c.id === activeCaseId), [activeCaseId, cases]);

  async function hydrateWorkspace(options?: { silent?: boolean }) {
    setWorkspaceLoading(true);
    setWorkspaceError(null);
    const workspace = await cephApi.loadWorkspace();
    if (!workspace.ok) {
      setApiMode("offline");
      setPatients([]); setCases([]); setReports([]); setHistory([]);
      setLandmarks([]); setClinicalArtifacts(DEFAULT_ARTIFACTS); setOverlayArtifacts([]);
      setActivePatientId(""); setActiveCaseId("");
      setWorkspaceError(workspace.error); setLastSyncedAt(null); setWorkspaceLoading(false);
      if (!options?.silent) toast.error(`Could not load workspace: ${workspace.error}`);
      return;
    }
    const mapped = mapWorkspace(workspace.data);
    setPatients(mapped.patients); setCases(mapped.cases); setReports(mapped.reports); setHistory(mapped.history);
    if (!activePatientId && mapped.patients.length > 0) setActivePatientId(mapped.patients[0].id);
    if (!activeCaseId && mapped.cases.length > 0) setActiveCaseId(mapped.cases[0].id);
    setLastSyncedAt(nowReadable()); setWorkspaceLoading(false); setApiMode("live");
    if (!options?.silent) toast.success("Workspace loaded");
  }

  useEffect(() => {
    let cancelled = false;
    async function boot() {
      const health = await cephApi.getServiceHealth();
      if (!cancelled) setServiceHealth(health);
      if (!cephApi.hasAccessToken()) {
        if (!cancelled) { setAuthUser(null); setApiMode(health.backend.ok ? "checking" : "offline"); setWorkspaceLoading(false); setAuthChecked(true); }
        return;
      }
      const me = await cephApi.me();
      if (!cancelled && me.ok) { setAuthUser(me.data); }
      else if (!cancelled) { await cephApi.logout(); setAuthUser(null); setApiMode("offline"); setWorkspaceLoading(false); setAuthChecked(true); return; }
      if (!cancelled) { await hydrateWorkspace(); setAuthChecked(true); }
    }
    void boot();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (apiMode !== "live" || !isGuid(activeCase?.sessionId)) {
      setLandmarks([]); setClinicalArtifacts(DEFAULT_ARTIFACTS); setOverlayArtifacts([]); return;
    }
    let cancelled = false;
    async function loadSession() {
      const sid = activeCase!.sessionId!;
      const [lmR, msR, dxR, txR, ovR] = await Promise.all([
        cephApi.getLandmarks(sid), cephApi.getMeasurements(sid), cephApi.getDiagnosis(sid), cephApi.getTreatment(sid), cephApi.getOverlays(sid),
      ]);
      if (cancelled) return;
      if (lmR.ok && lmR.data.length) setLandmarks(mapLandmarks(lmR.data));
      setClinicalArtifacts({
        measurements: msR.ok && msR.data.length ? mapMeasurements(msR.data) : [],
        diagnosis: dxR.ok ? mapDiagnosis(dxR.data) : DEFAULT_ARTIFACTS.diagnosis,
        treatments: txR.ok && txR.data.length ? mapTreatments(txR.data) : [],
      });
      setOverlayArtifacts(ovR.ok ? ovR.data.map(mapOverlay).filter(o => !o.url.startsWith("error:")) : []);
    }
    void loadSession();
    return () => { cancelled = true; };
  }, [activeCase?.sessionId, apiMode]);

  function addHistory(item: Omit<TimelineItem, "id" | "at">) {
    setHistory(prev => [
      {
        id: uid("hist"),
        at: nowReadable(),
        userId: authUser?.id,
        userName: authUser ? displayUserName(authUser) : "System",
        severity: "info" as const,
        ...item,
      },
      ...prev,
    ]);
  }

  async function handleAuthenticated(user: BackendAuthUser) {
    setAuthChecked(false); setAuthUser(user); setApiMode("checking");
    const health = await cephApi.getServiceHealth(); setServiceHealth(health);
    await hydrateWorkspace({ silent: true }); setAuthChecked(true);
  }

  async function handleLogout() {
    await cephApi.logout();
    setAuthChecked(true); setAuthUser(null);
    setPatients([]); setCases([]); setReports([]); setHistory([]);
    setLandmarks([]); setClinicalArtifacts(DEFAULT_ARTIFACTS); setOverlayArtifacts([]);
    setActivePatientId(""); setActiveCaseId("");
    setWorkspaceError(null); setLastSyncedAt(null); setWorkspaceLoading(false); setApiMode(serviceHealth.backend.ok ? "checking" : "offline");
    toast.success("Signed out");
    navigate("/auth");
  }

  async function refreshServiceHealth() {
    setApiMode(p => p === "live" ? p : "checking");
    const health = await cephApi.getServiceHealth(); setServiceHealth(health);
    if (!health.backend.ok) { setApiMode("offline"); setWorkspaceLoading(false); setWorkspaceError("Backend health probe failed."); toast.warning("Backend unavailable."); return; }
    if (!authUser && !cephApi.hasAccessToken()) { setApiMode("checking"); setWorkspaceError(null); setWorkspaceLoading(false); toast.success("Backend is available"); return; }
    await hydrateWorkspace({ silent: true }); toast.success("Status refreshed");
  }

  function openPatientCreate() { setEditingPatient(null); setPatientDialogOpen(true); }
  function openPatientEdit(p: Patient) { setEditingPatient(p); setPatientDialogOpen(true); }

  async function savePatient(data: PatientFormState, patientId?: string) {
    if (apiMode !== "live") { toast.error("Connect to backend first."); return; }
    const payload = { firstName: data.firstName, lastName: data.lastName, dateOfBirth: birthDateFromAge(data.age), gender: data.gender, phone: data.phone || undefined, email: data.email || undefined, medicalRecordNo: data.mrn || undefined };
    if (patientId) {
      if (!isGuid(patientId)) { toast.error("Not a backend record."); return; }
      const res = await cephApi.updatePatient(patientId, payload);
      if (!res.ok) { toast.error(`Update failed: ${res.error}`); return; }
      const mapped = mapPatient(res.data);
      setPatients(prev => prev.map(p => p.id === patientId ? mapped : p));
      addHistory({ type: "Patient", title: "Patient updated", detail: `${mapped.firstName} ${mapped.lastName} updated.`, patientId });
      toast.success("Patient updated"); return;
    }
    const res = await cephApi.createPatient(payload);
    if (!res.ok) { toast.error(`Create failed: ${res.error}`); return; }
    const created = mapPatient(res.data);
    setPatients(prev => [created, ...prev]); setActivePatientId(created.id);
    addHistory({ type: "Patient", title: "Patient created", detail: `${created.firstName} added.`, patientId: created.id });
    addNotification("success", "Patient Created", `${created.firstName} ${created.lastName} added to workspace.`);
    toast.success("Patient created");
  }

  async function deletePatient(patientId: string) {
    if (apiMode !== "live" || !isGuid(patientId)) { toast.error("Connect to backend first."); return; }
    const p = patients.find(x => x.id === patientId);
    const res = await cephApi.deletePatient(patientId);
    if (!res.ok) { toast.error(`Delete failed: ${res.error}`); return; }
    setPatients(prev => prev.filter(x => x.id !== patientId));
    setCases(prev => prev.filter(x => x.patientId !== patientId));
    if (activePatientId === patientId) { const fb = patients.find(x => x.id !== patientId); if (fb) setActivePatientId(fb.id); }
    addHistory({ type: "Patient", title: "Patient deleted", detail: `${p?.firstName} removed.`, patientId });
    toast.success("Patient deleted");
  }

  async function saveCase(data: CaseFormState) {
    if (apiMode !== "live" || !isGuid(data.patientId)) { toast.error("Connect to backend first."); return; }
    const res = await cephApi.createStudy({ patientId: data.patientId, studyType: data.type, title: data.title, studyDate: data.date });
    if (!res.ok) { toast.error(`Create failed: ${res.error}`); return; }
    const created: CaseRecord = { id: res.data.id, patientId: res.data.patientId, title: res.data.title || data.title, type: toStudyType(res.data.studyType), date: res.data.studyDate, status: "Draft", calibrated: false, aiStatus: "not_started", reportStatus: "pending", updatedAt: res.data.createdAt.slice(0, 10) };
    setCases(prev => [created, ...prev]); setActivePatientId(data.patientId); setActiveCaseId(created.id);
    addHistory({ type: "Case", title: "Case created", detail: `${created.title} added.`, caseId: created.id, patientId: created.patientId });
    addNotification("success", "Case Created", `${created.title} case ready for analysis.`);
    toast.success("Case added"); navigate("/analysis");
  }

  function patchCase(caseId: string, patch: Partial<CaseRecord>) {
    setCases(prev => prev.map(c => c.id === caseId ? { ...c, ...patch, updatedAt: todayIso() } : c));
  }

  async function resolveLiveSession(targetCase: CaseRecord | undefined, actionLabel = "This action") {
    if (!targetCase) { toast.error("Select a case first."); return null; }
    if (apiMode !== "live") { toast.error("Connect to backend first."); return null; }
    if (isGuid(targetCase.sessionId)) return targetCase.sessionId!;
    if (!isGuid(targetCase.imageId)) { toast.error(`${actionLabel} needs an AI session.`); return null; }

    const res = await cephApi.getLatestSession(targetCase.imageId!);
    if (!res.ok) { toast.error(`Session lookup failed: ${res.error}`); return null; }
    if (!res.data?.id || !isGuid(res.data.id)) { toast.error(`${actionLabel} needs an AI session.`); return null; }

    const recoveredStatus: CaseStatus = targetCase.status === "Reviewed" || targetCase.status === "Report ready"
      ? targetCase.status
      : "Reviewing";
    patchCase(targetCase.id, {
      status: recoveredStatus,
      aiStatus: "completed",
      sessionId: res.data.id,
      imageUrl: res.data.resultImageUrl ?? targetCase.imageUrl,
    });
    return res.data.id;
  }

  async function uploadImage(caseId: string, file: File) {
    if (apiMode !== "live" || !isGuid(caseId)) { toast.error("Connect to backend first."); return; }
    const res = await cephApi.uploadImage(caseId, file);
    if (!res.ok) { toast.error(`Upload failed: ${res.error}`); return; }
    patchCase(caseId, { imageId: res.data.id, imageName: res.data.fileName, imageUrl: res.data.storageUrl, calibrated: res.data.isCalibrated, status: res.data.isCalibrated ? "Calibrated" : "Image uploaded", aiStatus: "not_started" });
    const c = cases.find(x => x.id === caseId);
    addHistory({ type: "Upload", title: "Image uploaded", detail: `${res.data.fileName} attached.`, caseId, patientId: c?.patientId });
    addNotification("success", "Image Uploaded", `${res.data.fileName} ready for analysis.`);
    toast.success("Image uploaded");
  }

  async function runAi(caseId: string, isCbct = false, analysisType = "Steiner") {
    const c = cases.find(x => x.id === caseId);
    if (!c?.imageName || !c.calibrated || apiMode !== "live" || !isGuid(c.imageId)) { toast.error("Ready analysis required."); return; }
    patchCase(caseId, { aiStatus: "processing" });
    addNotification("info", "Analysis Started", "Processing cephalometric data...");
    const res = await cephApi.fullPipeline(c.imageId!, analysisType, isCbct);
    if (!res.ok) { patchCase(caseId, { aiStatus: "not_started" }); addNotification("error", "Analysis Failed", res.error); toast.error(`AI failed: ${res.error}`); return; }
    patchCase(caseId, { status: "AI completed", aiStatus: "completed", sessionId: res.data.session.id, imageUrl: res.data.session.resultImageUrl ?? c.imageUrl });
    setLandmarks(mergePipelineIntoLandmarks(res.data)); setClinicalArtifacts(mapPipelineArtifacts(res.data));
    void refreshOverlays(res.data.session.id, c);
    addHistory({ type: "AI", title: "AI completed", detail: `${isCbct ? "CBCT" : "Lateral"} data generated.`, caseId, patientId: c.patientId });
    addNotification("success", "Analysis Complete", `${res.data.landmarks?.length || 0} landmarks detected, ${res.data.measurements?.length || 0} measurements computed.`);
    toast.success("AI pipeline completed"); navigate("/viewer");
  }

  async function calibrateActiveCase(pts: Point[], mm: number) {
    if (!activeCase || pts.length !== 2 || !isGuid(activeCase.imageId)) { toast.error("Active case with image required."); return; }
    const res = await cephApi.calibrateImage(activeCase.imageId!, pts[0], pts[1], mm);
    if (!res.ok) { toast.error(`Calibration failed: ${res.error}`); return; }
    patchCase(activeCase.id, { calibrated: res.data.isCalibrated, calibrationDistanceMm: mm, calibrationPoints: pts, status: res.data.isCalibrated ? "Calibrated" : activeCase.status });
    addHistory({ type: "Calibration", title: "Calibration saved", detail: `${mm} mm reference.`, caseId: activeCase.id, patientId: activeCase.patientId });
    toast.success("Calibration saved");
  }

  async function saveAndSend(isCbct = false) {
    const sessionId = await resolveLiveSession(activeCase, "Finalization");
    if (!sessionId || !activeCase) return;
    const res = await cephApi.finalize(sessionId, landmarks.map(l => ({ landmarkCode: l.code, x: l.x, y: l.y })), isCbct);
    if (!res.ok) { toast.error(`Finalize failed: ${res.error}`); return; }
    setLandmarks(mergePipelineIntoLandmarks(res.data)); setClinicalArtifacts(mapPipelineArtifacts(res.data));
    patchCase(activeCase.id, { status: "Reviewed", aiStatus: "completed", sessionId: res.data.session.id || sessionId, imageUrl: res.data.session.resultImageUrl ?? activeCase.imageUrl });
    void refreshOverlays(res.data.session.id, activeCase);
    addHistory({ type: "Review", title: "Landmarks finalized", detail: "Review cycle complete.", caseId: activeCase.id, patientId: activeCase.patientId });
    toast.success("Landmarks finalized"); navigate("/results");
  }

  async function refreshOverlays(sessionIdOverride?: string, targetCase = activeCase) {
    const sid = isGuid(sessionIdOverride) ? sessionIdOverride! : await resolveLiveSession(targetCase, "Overlay refresh");
    if (!sid) return;
    const res = await cephApi.generateOverlays(sid);
    if (res.ok) {
      const next = res.data.images.map(mapOverlay).filter(o => o.url && !o.url.startsWith("error:"));
      setOverlayArtifacts(next);
      return;
    }
    const existing = await cephApi.getOverlays(sid);
    if (existing.ok) { setOverlayArtifacts(existing.data.map(mapOverlay).filter(o => !o.url.startsWith("error:"))); }
  }

  async function requestReport(format: ReportFormat) {
    const sessionId = await resolveLiveSession(activeCase, "Report generation");
    if (!sessionId || !activeCase) return;
    addNotification("info", "Report Generation", `Generating ${format} report…`);
    const res = await cephApi.generateReport(sessionId, format);
    if (!res.ok) { addNotification("error", "Report Failed", res.error); toast.error(`Report failed: ${res.error}`); return; }
    setReports(prev => [{ ...mapReport(res.data, activeCase.id), format }, ...prev]);
    patchCase(activeCase.id, { reportStatus: "generated", status: "Report ready" });
    addHistory({ type: "Report", title: "Report generated", detail: `${format} export ready.`, caseId: activeCase.id, patientId: activeCase.patientId });
    addNotification("success", "Report Ready", `${format} report generated and ready for download.`);
    toast.success(`${format} report ready`);
  }

  const authRoute   = location.startsWith("/auth");
  const publicRoute = location.startsWith("/guide");  // no login required
  const routeBlocked = !authRoute && !publicRoute && authChecked && !authUser;

  useEffect(() => { if (routeBlocked) navigate("/auth"); }, [navigate, routeBlocked]);

  if (!authRoute && !publicRoute && (!authChecked || routeBlocked)) {
    return (
      <ThemeProvider defaultTheme="dark" switchable>
        <div className="flex h-screen items-center justify-center bg-background p-4">
          <div className="flex flex-col items-center gap-5 text-center">
            {/* Animated logo mark */}
            <div className="relative flex h-16 w-16 items-center justify-center">
              <div className="absolute inset-0 rounded-2xl border border-primary/20 bg-primary/8 animate-pulse" />
              <ShieldCheck className="h-7 w-7 text-primary relative z-10" />
            </div>
            {/* Spinner */}
            <div className="flex items-center gap-2">
              <div className="h-1 w-1 rounded-full bg-primary animate-bounce [animation-delay:-0.3s]" />
              <div className="h-1 w-1 rounded-full bg-primary animate-bounce [animation-delay:-0.15s]" />
              <div className="h-1 w-1 rounded-full bg-primary animate-bounce" />
            </div>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.25em] text-primary/50 mb-1">CephAI</p>
              <p className="text-sm font-medium text-foreground">
                {routeBlocked ? "Redirecting to sign in…" : "Verifying session"}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {routeBlocked
                  ? "Authentication required to access this page."
                  : "Loading your clinical workspace."}
              </p>
            </div>
          </div>
        </div>
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider defaultTheme="dark" switchable>
      <ErrorBoundary>
        <Toaster position="top-right" richColors closeButton />
        {authRoute ? (
          <main className="mx-auto max-w-[1400px] px-4 py-8 sm:px-6 lg:px-10">
            <AuthPage
              authUser={authUser} apiMode={apiMode} serviceHealth={serviceHealth}
              onAuthenticated={handleAuthenticated} onLogout={handleLogout} onRefreshHealth={refreshServiceHealth}
            />
          </main>
        ) : (
          <>
            <AppShell
              apiMode={apiMode} authUser={authUser} serviceHealth={serviceHealth}
              notifications={notifications}
              onAuth={() => navigate("/auth")} onLogout={handleLogout} onRefreshHealth={refreshServiceHealth}
              onOpenCommandPalette={() => setCmdPaletteOpen(true)}
              onMarkNotificationAsRead={markNotificationAsRead}
              onDismissNotification={dismissNotification}
              onClearAllNotifications={clearAllNotifications}
            >
              <AppRoutes
                patients={patients} cases={cases} reports={reports} history={history}
                landmarks={landmarks} setLandmarks={setLandmarks}
                clinicalArtifacts={clinicalArtifacts} overlayArtifacts={overlayArtifacts}
                apiMode={apiMode} authUser={authUser} serviceHealth={serviceHealth}
                workspaceLoading={workspaceLoading} workspaceError={workspaceError} lastSyncedAt={lastSyncedAt}
                activePatientId={activePatientId} activeCaseId={activeCaseId}
                setActivePatientId={setActivePatientId} setActiveCaseId={setActiveCaseId}
                openPatientCreate={openPatientCreate} openPatientEdit={openPatientEdit} deletePatient={deletePatient}
                openCaseCreate={() => setCaseDialogOpen(true)} uploadImage={uploadImage} runAi={runAi}
                calibrateActiveCase={calibrateActiveCase} saveAndSend={saveAndSend}
                refreshOverlays={refreshOverlays} requestReport={requestReport}
                onRefreshHealth={refreshServiceHealth} onAuth={() => navigate("/auth")}
              />
            </AppShell>
            <CommandPalette
              open={cmdPaletteOpen}
              onClose={() => setCmdPaletteOpen(false)}
              patients={patients}
              cases={cases}
              onCreatePatient={openPatientCreate}
              onCreateCase={() => setCaseDialogOpen(true)}
            />
            <PatientDialog open={patientDialogOpen} onClose={() => setPatientDialogOpen(false)} onSave={savePatient} patient={editingPatient} />
            <CaseDialog open={caseDialogOpen} onClose={() => setCaseDialogOpen(false)} onSave={saveCase} patients={patients} activePatientId={activePatientId} />
          </>
        )}
      </ErrorBoundary>
    </ThemeProvider>
  );
}
