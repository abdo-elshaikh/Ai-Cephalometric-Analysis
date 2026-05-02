/**
 * CephAI user preferences — persisted to localStorage.
 * Import `useSettings` anywhere in the app.
 */
import { useState, useEffect, useCallback } from "react";

// ─── Schema ───────────────────────────────────────────────────────────────────

export type AnalysisTypeDefault =
  | "Steiner" | "Tweed" | "McNamara" | "Jarabak" | "Ricketts" | "Full";

export type PopulationNorm =
  | "Caucasian" | "Chinese" | "East Asian" | "Japanese"
  | "African-American" | "Hispanic" | "Indian" | "Brazilian";

export type UIDensity = "compact" | "comfortable" | "spacious";

export type RefreshInterval = "off" | "30s" | "1m" | "5m";

export type ReportFormat = "PDF" | "DOCX";

export interface CephSettings {
  /* Appearance */
  density:           UIDensity;
  reduceMotion:      boolean;
  sidebarCollapsed:  boolean;

  /* Clinical */
  defaultAnalysisType: AnalysisTypeDefault;
  populationNorm:      PopulationNorm;
  confidenceThreshold: number;   // 0.50 – 0.95
  cbctDerivedDefault:  boolean;

  /* Workflow */
  autoRefreshInterval: RefreshInterval;
  defaultReportFormat: ReportFormat;
  autoOverlayAfterFinalize: boolean;
  showConfidenceOverlay:    boolean;

  /* Notifications (in-app toasts) */
  notifyAiComplete:    boolean;
  notifyReportReady:   boolean;
  notifyDisconnect:    boolean;
}

export const DEFAULT_SETTINGS: CephSettings = {
  density:              "comfortable",
  reduceMotion:         false,
  sidebarCollapsed:     false,

  defaultAnalysisType:  "Steiner",
  populationNorm:       "Caucasian",
  confidenceThreshold:  0.70,
  cbctDerivedDefault:   false,

  autoRefreshInterval:  "1m",
  defaultReportFormat:  "PDF",
  autoOverlayAfterFinalize: true,
  showConfidenceOverlay:    true,

  notifyAiComplete:  true,
  notifyReportReady: true,
  notifyDisconnect:  true,
};

const STORAGE_KEY = "cephai:settings:v1";

function load(): CephSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function save(s: CephSettings) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); } catch {}
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useSettings() {
  const [settings, setSettings] = useState<CephSettings>(load);

  // Apply density and motion classes to <html>
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.density = settings.density;
    if (settings.reduceMotion) {
      root.classList.add("reduce-motion");
    } else {
      root.classList.remove("reduce-motion");
    }
  }, [settings.density, settings.reduceMotion]);

  const update = useCallback(<K extends keyof CephSettings>(
    key: K,
    value: CephSettings[K]
  ) => {
    setSettings(prev => {
      const next = { ...prev, [key]: value };
      save(next);
      return next;
    });
  }, []);

  const reset = useCallback(() => {
    save(DEFAULT_SETTINGS);
    setSettings(DEFAULT_SETTINGS);
  }, []);

  return { settings, update, reset };
}
