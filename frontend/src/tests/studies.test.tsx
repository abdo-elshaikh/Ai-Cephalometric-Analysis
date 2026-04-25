import React from 'react';
import { render, screen, fireEvent, waitFor } from '@/utils/test-utils';
import PatientDetailPage from '@/pages/PatientDetailPage';
import { studiesApi, patientsApi } from '@/services/api';
import { vi, describe, it, expect, beforeEach } from 'vitest';

// Mock the API
vi.mock('@/services/api', () => ({
  patientsApi: {
    get: vi.fn(),
  },
  studiesApi: {
    getByPatient: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  authApi: {},
  imagesApi: {},
  analysisApi: {},
  reportsApi: {},
  dashboardApi: {},
}));

const mockPatient = {
  id: '1',
  firstName: 'John',
  lastName: 'Doe',
  fullName: 'John Doe',
  dateOfBirth: '1990-01-01',
  gender: 'Male',
  age: 34,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const mockStudies = [
  {
    id: 's1',
    patientId: '1',
    studyDate: '2024-04-20',
    studyType: 'Lateral',
    title: 'Initial Scan',
    status: 'Completed',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

import { MemoryRouter, Route, Routes } from 'react-router-dom';

describe('PatientDetailPage (Study Management)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders patient info and study list', async () => {
    (patientsApi.get as any).mockResolvedValue(mockPatient);
    (studiesApi.getByPatient as any).mockResolvedValue(mockStudies);

    render(
      <MemoryRouter initialEntries={['/patients/1']}>
        <Routes>
          <Route path="/patients/:id" element={<PatientDetailPage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument();
      expect(screen.getByText('Initial Scan')).toBeInTheDocument();
    });
    
    expect(screen.getByText('Completed')).toBeInTheDocument();
  });

  it('opens create study modal', async () => {
    (patientsApi.get as any).mockResolvedValue(mockPatient);
    (studiesApi.getByPatient as any).mockResolvedValue(mockStudies);

    render(
      <MemoryRouter initialEntries={['/patients/1']}>
        <Routes>
          <Route path="/patients/:id" element={<PatientDetailPage />} />
        </Routes>
      </MemoryRouter>
    );

    const createBtn = await screen.findByText('New Study');
    fireEvent.click(createBtn);

    expect(screen.getByText('New Cephalometric Study')).toBeInTheDocument();
  });

  it('deletes a study with confirmation', async () => {
    (patientsApi.get as any).mockResolvedValue(mockPatient);
    (studiesApi.getByPatient as any).mockResolvedValue(mockStudies);
    (studiesApi.delete as any).mockResolvedValue({});

    render(
      <MemoryRouter initialEntries={['/patients/1']}>
        <Routes>
          <Route path="/patients/:id" element={<PatientDetailPage />} />
        </Routes>
      </MemoryRouter>
    );

    const deleteBtn = await screen.findByTitle('Delete');
    fireEvent.click(deleteBtn);

    expect(screen.getByRole('heading', { name: /Delete Study/i })).toBeInTheDocument();
    
    const confirmBtn = screen.getByRole('button', { name: 'Delete Study' });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(studiesApi.delete).toHaveBeenCalledWith('s1');
    });
  });
});
