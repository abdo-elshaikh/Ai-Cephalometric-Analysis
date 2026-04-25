import React from 'react';
import { render, screen, fireEvent, waitFor } from '@/utils/test-utils';
import PatientsPage from '@/pages/PatientsPage';
import { patientsApi } from '@/services/api';
import { vi, describe, it, expect, beforeEach } from 'vitest';

// Mock the API
vi.mock('@/services/api', () => ({
  patientsApi: {
    list: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  authApi: {},
  studiesApi: {},
  imagesApi: {},
  analysisApi: {},
  reportsApi: {},
  dashboardApi: {},
}));

const mockPatients = {
  items: [
    {
      id: '1',
      firstName: 'John',
      lastName: 'Doe',
      fullName: 'John Doe',
      dateOfBirth: '1990-01-01',
      gender: 'Male',
      age: 34,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ],
  totalCount: 1,
  page: 1,
  pageSize: 20,
  totalPages: 1,
};

import { BrowserRouter } from 'react-router-dom';

describe('PatientsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders patient list correctly', async () => {
    (patientsApi.list as any).mockResolvedValue(mockPatients);

    render(
      <BrowserRouter>
        <PatientsPage />
      </BrowserRouter>
    );

    expect(screen.getByText('Patients')).toBeInTheDocument();
    
    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument();
    });
    
    expect(screen.getByText('34 yrs')).toBeInTheDocument();
  });

  it('shows empty state when no patients found', async () => {
    (patientsApi.list as any).mockResolvedValue({ items: [], totalCount: 0, totalPages: 0 });

    render(
      <BrowserRouter>
        <PatientsPage />
      </BrowserRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('No patients found')).toBeInTheDocument();
    });
  });

  it('opens create patient modal on button click', async () => {
    (patientsApi.list as any).mockResolvedValue(mockPatients);

    render(
      <BrowserRouter>
        <PatientsPage />
      </BrowserRouter>
    );

    const createBtn = screen.getByText('New Patient');
    fireEvent.click(createBtn);

    expect(screen.getByText('Register New Patient')).toBeInTheDocument();
    expect(screen.getByLabelText(/First Name/i)).toBeInTheDocument();
  });

  it('validates form fields', async () => {
    (patientsApi.list as any).mockResolvedValue(mockPatients);

    render(
      <BrowserRouter>
        <PatientsPage />
      </BrowserRouter>
    );

    fireEvent.click(screen.getByText('New Patient'));
    
    const saveBtn = screen.getByText('Save Patient');
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(screen.getByText('First name required')).toBeInTheDocument();
      expect(screen.getByText('Last name required')).toBeInTheDocument();
    });
  });

  it('searches for patients', async () => {
    (patientsApi.list as any).mockResolvedValue(mockPatients);

    render(
      <BrowserRouter>
        <PatientsPage />
      </BrowserRouter>
    );

    const searchInput = screen.getByPlaceholderText(/Search by name/i);
    fireEvent.change(searchInput, { target: { value: 'Jane' } });

    await waitFor(() => {
      expect(patientsApi.list).toHaveBeenCalledWith(1, 20, 'Jane');
    });
  });
});
