import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';
import AppLayout from './layouts/AppLayout';
import RequireAuth from './components/RequireAuth';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import DashboardPage from './pages/DashboardPage';
import PatientsPage from './pages/PatientsPage';
import PatientDetailPage from './pages/PatientDetailPage';
import StudyPage from './pages/StudyPage';
import CalibrationPage from './pages/CalibrationPage';
import AnalysisPage from './pages/AnalysisPage';
import ResultsPage from './pages/ResultsPage';
import ReportsPage from './pages/ReportsPage';
import CaseHistoryPage from './pages/CaseHistoryPage';
import ProfilePage from './pages/ProfilePage';
import SettingsPage from './pages/SettingsPage';
import DocsPage from './pages/DocsPage';
import SupportPage from './pages/SupportPage';
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
    },
  },
});

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Toaster
          position="top-right"
          toastOptions={{
            style: {
              background: '#141828',
              color: '#e8ecff',
              border: '1px solid rgba(99,120,255,0.2)',

            },
          }}
        />
        <Routes>
          {/* Public routes */}
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />

          {/* Protected routes */}
          <Route path="/" element={
            <RequireAuth>
              <AppLayout />
            </RequireAuth>
          }>
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="dashboard" element={<DashboardPage />} />
            <Route path="patients" element={<PatientsPage />} />
            <Route path="patients/:id" element={<PatientDetailPage />} />
            <Route path="studies/:studyId" element={<StudyPage />} />
            <Route path="studies/:studyId/calibrate/:imageId" element={
              <RequireAuth allowedRoles={['Admin', 'Doctor']}>
                <CalibrationPage />
              </RequireAuth>
            } />
            <Route path="analysis/:imageId" element={<AnalysisPage />} />
            <Route path="results/:sessionId" element={<ResultsPage />} />
            <Route path="history" element={<CaseHistoryPage />} />
            <Route path="reports" element={<ReportsPage />} />
            <Route path="profile" element={<ProfilePage />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="docs" element={<DocsPage />} />
            <Route path="support" element={<SupportPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}

export default App;
