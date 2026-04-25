import React from 'react';
import { render, screen, fireEvent, waitFor } from '@/utils/test-utils';
import AnalysisPage from '@/pages/AnalysisPage';
import { analysisApi, imagesApi } from '@/services/api';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

const mockImage = {
  id: 'img1',
  studyId: 's1',
  fileName: 'xray.jpg',
  storageUrl: 'http://example.com/xray.jpg',
  isCalibrated: true,
  pixelSpacingMm: 0.1,
  widthPx: 1000,
  heightPx: 1000,
};

const mockLandmarks = [
  { id: 'lm1', landmarkCode: 'S', landmarkName: 'Sella', xPx: 100, yPx: 100, confidenceScore: 0.9, isAiDetected: true }
];

const mockSession = {
  id: 'sess-12345678',
  xRayImageId: 'img1',
  status: 'Completed' as const,
  analysisType: 'Steiner' as const,
  triggeredBy: 'admin',
  modelVersion: '1.0',
  queuedAt: new Date().toISOString(),
};

// Mock the API
vi.mock('@/services/api', () => ({
  imagesApi: {
    getByStudy: vi.fn(),
  },
  analysisApi: {
    getLatestSession: vi.fn(),
    getLandmarks: vi.fn(),
    adjustLandmark: vi.fn(),
    getMeasurements: vi.fn().mockResolvedValue([]),
    getDiagnosis: vi.fn().mockResolvedValue({ skeletalClass: 'ClassI', warnings: [] }),
  },
  patientsApi: {
    get: vi.fn().mockResolvedValue({ firstName: 'Test', lastName: 'Patient' }),
  },
  studiesApi: {
    get: vi.fn().mockResolvedValue({ title: 'Test Study', studyType: 'Lateral' }),
  },
  authApi: {
    me: vi.fn().mockResolvedValue({ email: 'admin@ceph.local', role: 'Admin' }),
  },
  reportsApi: {
    generate: vi.fn(),
  },
  dashboardApi: {},
}));

describe('Landmark Audit Workflow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('enforces mandatory adjustment reason after dragging', async () => {
    (imagesApi.getByStudy as any).mockResolvedValue([mockImage]);
    (analysisApi.getLatestSession as any).mockResolvedValue(mockSession);
    (analysisApi.getLandmarks as any).mockResolvedValue(mockLandmarks);

    render(
      <MemoryRouter initialEntries={['/analysis/s1']}>
        <Routes>
          <Route path="/analysis/:studyId" element={<AnalysisPage />} />
        </Routes>
      </MemoryRouter>
    );

    // Check if the component rendered the header
    await screen.findByText(/Analysis/i, {}, { timeout: 15000 });
    
    // Wait for basic info to appear (ensures imagesApi call finished)
    await screen.findByText(/Dimensions/i, {}, { timeout: 15000 });

    // Verify mocks called
    await waitFor(() => expect(analysisApi.getLatestSession).toHaveBeenCalledWith('img1'), { timeout: 10000 });
    
    // Wait for landmarks to load
    try {
      await screen.findByText(/Sella/i, {}, { timeout: 15000 });
    } catch (e) {
      console.log('--- SESSION STATE ---', !!mockSession);
      screen.debug(undefined, 100000);
      throw e;
    }

    const canvas = screen.getByLabelText(/Interactive X-Ray Viewer/i);

    // Mock getBoundingClientRect
    canvas.getBoundingClientRect = vi.fn(() => ({
      left: 0, top: 0, width: 800, height: 600, bottom: 600, right: 800,
      x: 0, y: 0, toJSON: () => {}
    } as DOMRect));

    // 1. Drag landmark manually with fireEvent
    fireEvent.mouseDown(canvas, { clientX: 100, clientY: 100 });
    fireEvent.mouseMove(canvas, { clientX: 150, clientY: 150 });
    fireEvent.mouseUp(canvas, { clientX: 150, clientY: 150 });

    // 2. Expect modal
    expect(await screen.findByText(/Landmark Adjustment/i, {}, { timeout: 8000 })).toBeInTheDocument();

    // 3. Try to submit without reason
    const confirmBtn = screen.getByRole('button', { name: /Confirm Change/i });
    fireEvent.click(confirmBtn);

    // Should still be in the modal (reason is required)
    expect(screen.getByText(/Landmark Adjustment/i)).toBeInTheDocument();

    // 4. Provide reason and submit
    const textarea = screen.getByPlaceholderText(/e.g. AI misidentified the anatomy/i);
    fireEvent.change(textarea, { target: { value: 'Better clinical view' } });
    
    (analysisApi.adjustLandmark as any).mockResolvedValue({
      ...mockLandmarks[0],
      xPx: 150,
      yPx: 150,
      isAiDetected: false,
      isManuallyAdjusted: true,
      adjustmentReason: 'Better clinical view'
    });

    fireEvent.click(confirmBtn);

    // 5. Verify API call
    await waitFor(() => {
      expect(analysisApi.adjustLandmark).toHaveBeenCalledWith(
        'sess-12345678',
        'S',
        expect.objectContaining({
          xPx: 150,
          yPx: 150,
          reason: 'Better clinical view'
        })
      );
    }, { timeout: 8000 });

    // 6. Modal should be closed
    await waitFor(() => {
      expect(screen.queryByText(/Landmark Adjustment/i)).not.toBeInTheDocument();
    }, { timeout: 8000 });
  }, 30000);
});
