import React, { useState, useEffect, type FormEvent } from "react";
import { 
  Modal, 
  Field, 
  TextInput, 
  Select, 
  PrimaryBtn, 
  SecondaryBtn 
} from "./_core/ClinicalComponents";
import { 
  type Patient, 
  type PatientFormState, 
  type CaseFormState,
  type Gender,
  type CaseRecord,
  todayIso
} from "@/lib/mappers";

interface PatientDialogProps {
  open: boolean;
  onClose: () => void;
  onSave: (data: PatientFormState, patientId?: string) => void | Promise<void>;
  patient?: Patient | null;
}

export function PatientDialog({
  open,
  onClose,
  onSave,
  patient,
}: PatientDialogProps) {
  const [form, setForm] = useState<PatientFormState>({ 
    firstName: "", 
    lastName: "", 
    age: 12, 
    gender: "Female", 
    email: "", 
    phone: "", 
    mrn: "" 
  });

  useEffect(() => {
    if (!open) return;
    setForm(
      patient
        ? { firstName: patient.firstName, lastName: patient.lastName, age: patient.age, gender: patient.gender, email: patient.email, phone: patient.phone, mrn: patient.mrn }
        : { firstName: "", lastName: "", age: 12, gender: "Female", email: "", phone: "", mrn: `MRN-${new Date().getFullYear()}-${Math.floor(Math.random() * 900 + 100)}` }
    );
  }, [open, patient]);

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    onSave(form, patient?.id);
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose} title={patient ? "Edit Patient" : "New Patient"} description="Maintain the clinical patient registry.">
      <form onSubmit={handleSubmit} className="grid gap-4 sm:grid-cols-2">
        <Field label="First name">
          <TextInput value={form.firstName} onChange={v => setForm(p => ({ ...p, firstName: v }))} required />
        </Field>
        <Field label="Last name">
          <TextInput value={form.lastName} onChange={v => setForm(p => ({ ...p, lastName: v }))} required />
        </Field>
        <Field label="Age">
          <TextInput type="number" value={form.age} onChange={v => setForm(p => ({ ...p, age: Number(v) }))} min={1} max={120} required />
        </Field>
        <Field label="Gender">
          <Select value={form.gender} onChange={v => setForm(p => ({ ...p, gender: v as Gender }))}>
            <option>Female</option>
            <option>Male</option>
            <option>Other</option>
          </Select>
        </Field>
        <Field label="Email">
          <TextInput type="email" value={form.email} onChange={v => setForm(p => ({ ...p, email: v }))} />
        </Field>
        <Field label="Phone">
          <TextInput value={form.phone} onChange={v => setForm(p => ({ ...p, phone: v }))} />
        </Field>
        <div className="sm:col-span-2">
          <Field label="Medical record number">
            <TextInput value={form.mrn} onChange={v => setForm(p => ({ ...p, mrn: v }))} required />
          </Field>
        </div>
        <div className="flex justify-end gap-2 sm:col-span-2 pt-4">
          <SecondaryBtn type="button" onClick={onClose}>Cancel</SecondaryBtn>
          <PrimaryBtn type="submit">{patient ? "Update patient" : "Create patient"}</PrimaryBtn>
        </div>
      </form>
    </Modal>
  );
}

interface CaseDialogProps {
  open: boolean;
  onClose: () => void;
  onSave: (data: CaseFormState) => void | Promise<void>;
  patients: Patient[];
  activePatientId: string;
}

export function CaseDialog({
  open,
  onClose,
  onSave,
  patients,
  activePatientId,
}: CaseDialogProps) {
  const [form, setForm] = useState<CaseFormState>({ patientId: activePatientId, title: "New cephalometric analysis", type: "Lateral", date: todayIso() });

  useEffect(() => {
    if (!open) return;
    setForm({ patientId: activePatientId || patients[0]?.id || "", title: "New cephalometric analysis", type: "Lateral", date: todayIso() });
  }, [activePatientId, open, patients]);

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    onSave(form);
    onClose();
  }

  function patientName(p: Patient) {
    return `${p.firstName} ${p.lastName}`;
  }

  return (
    <Modal open={open} onClose={onClose} title="New Case" description="Create a study shell before upload, calibration, and AI analysis.">
      <form onSubmit={handleSubmit} className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Field label="Patient">
            <Select value={form.patientId} onChange={v => setForm(p => ({ ...p, patientId: v }))}>
              {patients.length ? patients.map(pt => (
                <option key={pt.id} value={pt.id}>{patientName(pt)} — {pt.mrn}</option>
              )) : <option value="">No server patients loaded</option>}
            </Select>
          </Field>
        </div>
        <Field label="Case title">
          <TextInput value={form.title} onChange={v => setForm(p => ({ ...p, title: v }))} required />
        </Field>
        <Field label="Study type">
          <Select value={form.type} onChange={v => setForm(p => ({ ...p, type: v as CaseRecord["type"] }))}>
            <option>Lateral</option>
            <option>PA</option>
            <option>CBCT</option>
          </Select>
        </Field>
        <div className="sm:col-span-2">
          <Field label="Date">
            <TextInput type="date" value={form.date} onChange={v => setForm(p => ({ ...p, date: v }))} required />
          </Field>
        </div>
        {!patients.length && (
          <p className="rounded-xl border border-warning/20 bg-warning/8 p-3 text-xs leading-5 text-warning sm:col-span-2">
            Create or load a backend patient before creating a case.
          </p>
        )}
        <div className="flex justify-end gap-2 sm:col-span-2 pt-4">
          <SecondaryBtn type="button" onClick={onClose}>Cancel</SecondaryBtn>
          <PrimaryBtn type="submit" disabled={!patients.length}>Add case</PrimaryBtn>
        </div>
      </form>
    </Modal>
  );
}
