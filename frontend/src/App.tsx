import React, { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import { AuthProvider } from '@/contexts/AuthContext';
import AppShell from '@/components/layout/AppShell';
import { Spinner } from '@/components/ui/Loading';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { NetworkIndicator } from '@/components/NetworkIndicator';

// Lazy load pages
const LoginPage        = lazy(() => import('@/pages/LoginPage'));
const RegisterPage     = lazy(() => import('@/pages/RegisterPage'));
const DashboardPage    = lazy(() => import('@/pages/DashboardPage'));
const PatientsPage     = lazy(() => import('@/pages/PatientsPage'));
const PatientDetailPage= lazy(() => import('@/pages/PatientDetailPage'));
const AnalysisPage     = lazy(() => import('@/pages/AnalysisPage'));
const ResultsPage      = lazy(() => import('@/pages/ResultsPage'));
const HistoryPage      = lazy(() => import('@/pages/HistoryPage'));
const ReportsPage      = lazy(() => import('@/pages/ReportsPage'));

const qc = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
    },
  },
});

function PageLoader() {
  return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'60vh' }}>
      <Spinner size={28} />
    </div>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={qc}>
      <AuthProvider>
        <BrowserRouter>
          <ErrorBoundary>
            <Toaster position="top-right" richColors closeButton />
            <NetworkIndicator />
            <Suspense fallback={<PageLoader />}>
            <Routes>
              {/* Public */}
              <Route path="/login"    element={<LoginPage />} />
              <Route path="/register" element={<RegisterPage />} />

              {/* Protected (AppShell handles auth guard) */}
              <Route element={<AppShell />}>
                <Route index element={<Navigate to="/dashboard" replace />} />
                <Route path="/dashboard" element={<DashboardPage />} />
                <Route path="/patients"  element={<PatientsPage />} />
                <Route path="/patients/:id" element={<PatientDetailPage />} />
                <Route path="/analysis"     element={<AnalysisPage />} />
                <Route path="/analysis/:studyId" element={<AnalysisPage />} />
                <Route path="/results/:sessionId" element={<ResultsPage />} />
                <Route path="/history"   element={<HistoryPage />} />
                <Route path="/reports"   element={<ReportsPage />} />
              </Route>

              {/* Catch-all */}
              <Route path="*" element={<Navigate to="/dashboard" replace />} />
            </Routes>
          </Suspense>
          </ErrorBoundary>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}
