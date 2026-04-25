import React from 'react';
import { render, screen, fireEvent, waitFor } from '@/utils/test-utils';
import AnalysisPage from '@/pages/AnalysisPage';
import ResultsPage from '@/pages/ResultsPage';
import { analysisApi, reportsApi, imagesApi } from '@/services/api';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import userEvent from '@testing-library/user-event';

// Mock the API
vi.mock('@/services/api', () => ({
  imagesApi: {
    getByStudy: vi.fn(),
  },
  analysisApi: {
    getLatestSession: vi.fn(),
    getLandmarks: vi.fn(),
    getMeasurements: vi.fn(),
    getDiagnosis: vi.fn(),
    detect: vi.fn(),
  },
  reportsApi: {
    generate: vi.fn(),
  },
  patientsApi: {
    get: vi.fn().mockResolvedValue({ firstName: 'Test', lastName: 'Patient' }),
  },
  studiesApi: {
    get: vi.fn().mockResolvedValue({ title: 'Test Study', studyType: 'Lateral' }),
  },
  authApi: {},
  dashboardApi: {},
}));

const mockImage = {
  id: 'img1',
  studyId: 's1',
  fileName: 'xray.jpg',
  storageUrl: 'http://example.com/xray.jpg',
  isCalibrated: true,
  pixelSpacingMm: 0.1,
};

describe('Workflow Tests (AI & Reports)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('AI Detection Workflow', () => {
    it('shows loading and success states for AI detection', async () => {
      (imagesApi.getByStudy as any).mockResolvedValue([mockImage]);
      (analysisApi.getLatestSession as any).mockResolvedValue(null);
      (analysisApi.detect as any).mockImplementation(() => new Promise(resolve => setTimeout(() => resolve({ id: 'sess1' }), 200)));

      render(
        <MemoryRouter initialEntries={['/analysis/s1']}>
          <Routes>
            <Route path="/analysis/:studyId" element={<AnalysisPage />} />
          </Routes>
        </MemoryRouter>
      );

      const detectBtn = await screen.findByText(/Run Detection/i, {}, { timeout: 3000 });
      fireEvent.click(detectBtn);

      // Loading state
      await expect(screen.findByText(/Running…/i)).resolves.toBeInTheDocument();

      // Success state
      await waitFor(() => {
        expect(screen.queryByText(/Running…/i)).not.toBeInTheDocument();
      }, { timeout: 3000 });
    });

    it('handles AI detection error gracefully', async () => {
      (imagesApi.getByStudy as any).mockResolvedValue([mockImage]);
      (analysisApi.getLatestSession as any).mockResolvedValue(null);
      (analysisApi.detect as any).mockRejectedValue(new Error('API Error'));

      render(
        <MemoryRouter initialEntries={['/analysis/s1']}>
          <Routes>
            <Route path="/analysis/:studyId" element={<AnalysisPage />} />
          </Routes>
        </MemoryRouter>
      );

      const detectBtn = await screen.findByText(/Run Detection/i, {}, { timeout: 3000 });
      fireEvent.click(detectBtn);

      await waitFor(() => {
        // It should stop loading
        expect(screen.queryByText(/Running…/i)).not.toBeInTheDocument();
      }, { timeout: 3000 });
    });
  });

  describe('Report Generation Workflow', () => {
    it('shows loading state during report generation', async () => {
      (analysisApi.getMeasurements as any).mockResolvedValue([]);
      (analysisApi.getDiagnosis as any).mockResolvedValue({ skeletalClass: 'ClassI', warnings: [] });
      (reportsApi.generate as any).mockImplementation(() => new Promise(resolve => setTimeout(() => resolve({ storageUrl: '#' }), 200)));

      render(
        <MemoryRouter initialEntries={['/results/sess1']}>
          <Routes>
            <Route path="/results/:sessionId" element={<ResultsPage />} />
          </Routes>
        </MemoryRouter>
      );

      const reportBtn = await screen.findByText(/Generate Report/i, {}, { timeout: 3000 });
      fireEvent.click(reportBtn);

      const confirmBtn = await screen.findByText('Generate & Download');
      fireEvent.click(confirmBtn);

      await expect(screen.findByText(/Generating…/i)).resolves.toBeInTheDocument();

    await waitFor(() => {
        expect(screen.queryByText(/Generating…/i)).not.toBeInTheDocument();
      }, { timeout: 3000 });
    });
  });

  describe('Landmark Adjustment Workflow', () => {
    it('opens reason modal after dragging a landmark', async () => {
      const user = userEvent.setup();
      const mockLandmarks = [
        { id: 'lm1', landmarkCode: 'S', landmarkName: 'Sella', xPx: 100, yPx: 100, confidenceScore: 0.9, isAiDetected: true }
      ];
      (imagesApi.getByStudy as any).mockResolvedValue([mockImage]);
      (analysisApi.getLatestSession as any).mockResolvedValue({ id: 'sess1' });
      (analysisApi.getLandmarks as any).mockResolvedValue(mockLandmarks);

      render(
        <MemoryRouter initialEntries={['/analysis/s1']}>
          <Routes>
            <Route path="/analysis/:studyId" element={<AnalysisPage />} />
          </Routes>
        </MemoryRouter>
      );

      const canvas = await screen.findByLabelText(/Interactive X-Ray Viewer/i);
      
      // Mock getBoundingClientRect
      canvas.getBoundingClientRect = vi.fn(() => ({
        left: 0, top: 0, width: 800, height: 600, bottom: 600, right: 800,
        x: 0, y: 0, toJSON: () => {}
      } as DOMRect));

      // 1. Drag landmark from (100,100) to (150, 150)
      await user.pointer([
        { target: canvas, coords: { clientX: 100, clientY: 100 }, keys: '[MouseLeft>]' },
        { coords: { clientX: 150, clientY: 150 } },
        { keys: '[/MouseLeft]' }
      ]);

      // Modal should open
      expect(await screen.findByText(/Confirm Landmark Adjustment/i)).toBeInTheDocument();
      expect(screen.getByText(/New coordinates: 150.0, 150.0/i)).toBeInTheDocument();
    });
  });
});
