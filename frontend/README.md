# CephAI Frontend

React + TypeScript + Vite frontend for the AI Cephalometric Analysis platform.

## Quick Start

```bash
cd frontend
npm install
npm run dev   # http://localhost:3000
```

Backend must be running on `http://localhost:5000` (Vite proxies `/api/*` automatically).

## Tech Stack

| Concern | Library |
|---|---|
| Framework | React 19 + TypeScript (strict) |
| Build | Vite 8 |
| Routing | React Router v7 |
| Server state | TanStack Query v5 |
| Forms | React Hook Form + Zod |
| HTTP | Axios (auto JWT refresh) |
| Toasts | Sonner |
| Icons | Lucide React |
| Styling | Vanilla CSS (custom design system) |

## Pages

| Route | Page | Backend Endpoints |
|---|---|---|
| `/login` | LoginPage | POST /auth/login |
| `/register` | RegisterPage | POST /auth/register |
| `/dashboard` | DashboardPage | GET /dashboard/stats |
| `/patients` | PatientsPage | CRUD /patients |
| `/patients/:id` | PatientDetailPage | GET /patients/:id + studies |
| `/analysis/:studyId` | AnalysisPage | images, detect, landmarks, finalize |
| `/results/:sessionId` | ResultsPage | measurements, diagnosis, treatment, overlays, reports |
| `/history` | HistoryPage | GET /analysis/history |
| `/reports` | ReportsPage | GET /reports |
