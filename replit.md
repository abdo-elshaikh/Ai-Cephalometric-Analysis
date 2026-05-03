# CephAnalysis

## Overview

CephAnalysis is an AI-powered medical platform designed for automated cephalometric analysis and treatment planning. It enables orthodontists to upload lateral cephalometric X-ray images for automated detection of anatomical landmarks, calculation of clinical measurements, generation of diagnoses, and suggestion of treatment plans. The project aims to revolutionize orthodontic practice by providing efficient, accurate, and data-driven insights for patient care.

## User Preferences

I prefer iterative development with clear, concise communication. Before making significant architectural changes or implementing complex features, please describe your proposed approach and await my approval. I value detailed explanations for non-trivial decisions.

## System Architecture

CephAnalysis is built as a multi-component system adhering to a clean architecture with clear separation of concerns:

**1. Frontend:**
    *   **Technology**: React 19 with Vite, TypeScript.
    *   **UI/UX**: Linear/Vercel aesthetic featuring a violet/indigo primary color scheme, near-black dark mode, 8px border radius, and Inter font. Includes a fixed 240px always-dark sidebar and responsive grid layouts.
    *   **Core Components**:
        *   `AppShell`: Provides consistent navigation with a sidebar, topbar breadcrumbs, command palette trigger, and connection status.
        *   `CommandPalette`: Global `Cmd+K`/`Ctrl+K` shortcut for navigation and quick actions.
        *   `ClinicalComponents.tsx`: A comprehensive design system including `KpiCard` (with animated count-up, sparkbars, trend indicators), `Card`, `Pill`, `SearchInput`, `DeviationBar` (visualizing values against normal ranges), and `ProgressRing`.
        *   `ViewerPage`: SVG-based viewer displaying 80 landmarks color-coded by anatomical group and 11 cephalometric tracing planes. Features zoom, pan, and a minimap.
        *   `ResultsPage`: Tabbed analysis view including Diagnosis, Measurements, Treatment, Growth, and Reports. Incorporates new components like `DiagnosisCard`, `CVMStageCard`, `DentalSkeletalDifferentialPanel`, `LandmarkQualitySummary`, `RiskFactorSummary`, and `NormativeComparisonPanel`.
    *   **Clinical Workflow**: Guides users through patient registration, case creation, X-ray upload, image calibration, AI pipeline execution, results review, and report generation.
    *   **Authentication**: Redesigned AuthPage with Google Sign-In via Firebase, featuring a split layout and clear authentication flow.
    *   **Settings**: Persistent user preferences via `useSettings()` hook for appearance, clinical defaults, workflow, notifications, and data privacy.
    *   **User Guide**: Publicly accessible guide detailing getting started, workflow, measurements, shortcuts, and FAQs.

**2. Backend (API):**
    *   **Technology**: ASP.NET Core .NET 9 using Clean Architecture with CQRS pattern.
    *   **Performance**: Implements Brotli/Gzip response compression, output caching for frequently accessed data (e.g., dashboard stats, norms), and security headers (e.g., `X-Request-ID`, `Cache-Control`).
    *   **Storage System**: Categorized file layout for `xray`, `thumbnail`, `overlay`, `report`, `other` files, managed by `IStorageService` and `IStorageManager`. Features cascade deletion for patient, study, and session assets.
    *   **Image Processing**: `SkiaImageOverlayService` for robust image overlay rendering with defensive error handling, enhanced patient headers, quality score badges, and uncalibrated watermarks. `QuestPdfReportGenerator` for comprehensive report generation with risk signals, landmark quality, and normative references.

**3. AI Microservice:**
    *   **Technology**: Python FastAPI with PyTorch.
    *   **Core Engines**:
        *   `landmark_engine.py`: 80-landmark detection using HRNet-W32, incorporating multi-axis Test-Time Augmentation (TTA), ensemble variance, belief-propagation refiner, entropy-blended confidence, DSNT spatial variance decoder, and adaptive conformal radius refinement.
        *   `measurement_engine.py`: Calculates 95+ cephalometric measurements (e.g., Steiner, Tweed, McNamara), including uncertainty propagation via first-order Taylor expansion. New additions include Beta angle, W angle, Upper/Lower Gonial angles, and Corpus Length.
        *   `diagnosis_engine.py`: Provides probabilistic skeletal class, CVM staging, Bolton discrepancy, airway risk, and facial convexity. Enhanced with multi-metric consensus voting, refined airway classification (0-10 risk score), and comprehensive diagnosis output.
        *   `treatment_engine.py`: Suggests treatment plans based on 22 evidence-based rules, predicts treatment outcomes, and integrates Proffit/Petrovic growth predictions.
    *   **Utilities**: `norms_util.py` supporting 8 population-specific normative offsets.

## External Dependencies

*   **Database**: PostgreSQL 16 (with Entity Framework Core)
*   **Cache**: Redis 7
*   **AI/ML Framework**: PyTorch
*   **Frontend Libraries**: React, Vite, Wouter (routing), TanStack Query, Recharts, Radix UI, Sonner, Lucide React, Tailwind CSS, Zod, date-fns.
*   **Authentication**: Firebase (for Google Sign-In)
*   **Optional**: OpenAI API (for LLM treatment justification)
*   **Storage Providers**: Local filesystem, S3, or Azure (configurable via `STORAGE_PROVIDER`).