"use client";

import { useState, useEffect, use } from "react";
import Link from "next/link";

export default function PatientDetailPage({ params }) {
  const resolvedParams = use(params);
  const patientId = resolvedParams.id;

  const [patient, setPatient] = useState(null);
  const [medications, setMedications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Add Medication Form State
  const [isAddMedOpen, setIsAddMedOpen] = useState(false);
  const [medSubmitting, setMedSubmitting] = useState(false);
  const [medForm, setMedForm] = useState({
    medication_name: "",
    dosage_instruction: "",
    scheduled_time: "", // HTML input gives HH:MM
    fhir_id: "",
  });

  // Call reminder trigger state
  const [triggeringId, setTriggeringId] = useState(null);

  const fetchPatientDetails = async () => {
    try {
      setLoading(true);
      
      // Fetch all patients and find this patient
      const patientsRes = await fetch("/api/patients");
      const medsRes = await fetch(`/api/patients/${patientId}/medications`);

      if (!patientsRes.ok || !medsRes.ok) {
        throw new Error("Failed to load patient detail records");
      }

      const allPatients = await patientsRes.json();
      // Find patient by ID (id can be integer or string, convert both to string for comparison)
      const foundPatient = allPatients.find(p => String(p.id) === String(patientId));
      
      if (!foundPatient) {
        throw new Error("Patient record not found in database");
      }

      const medicationsData = await medsRes.json();

      setPatient(foundPatient);
      setMedications(medicationsData);
      setError(null);
    } catch (err) {
      console.error(err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (patientId) {
      fetchPatientDetails();
    }
  }, [patientId]);

  const handleMedInputChange = (e) => {
    const { name, value } = e.target;
    setMedForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleAddMedSubmit = async (e) => {
    e.preventDefault();
    if (!medForm.medication_name || !medForm.dosage_instruction || !medForm.scheduled_time) {
      alert("Please fill out all required fields.");
      return;
    }

    try {
      setMedSubmitting(true);
      
      // Format scheduled_time from HH:MM to HH:MM:00
      const formattedTime = medForm.scheduled_time.length === 5 
        ? `${medForm.scheduled_time}:00` 
        : medForm.scheduled_time;

      const payload = {
        ...medForm,
        scheduled_time: formattedTime
      };

      const res = await fetch(`/api/patients/${patientId}/medications`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.detail || "Failed to save medication entry");
      }

      // Reload meds list
      const medsRes = await fetch(`/api/patients/${patientId}/medications`);
      if (medsRes.ok) {
        const medsData = await medsRes.json();
        setMedications(medsData);
      }

      setIsAddMedOpen(false);
      setMedForm({
        medication_name: "",
        dosage_instruction: "",
        scheduled_time: "",
        fhir_id: "",
      });
    } catch (err) {
      alert(err.message);
    } finally {
      setMedSubmitting(false);
    }
  };

  const handleTriggerReminder = async (medId) => {
    try {
      setTriggeringId(medId);
      const res = await fetch("/api/reminders/trigger", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ medication_request_id: String(medId) }),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.detail || "Outbound call trigger failed");
      }

      const data = await res.json();
      alert(`Success! Manual call queued. Twilio SID: ${data.call_sid}`);
    } catch (err) {
      alert(err.message);
    } finally {
      setTriggeringId(null);
    }
  };

  const calculateAge = (birthDateStr) => {
    if (!birthDateStr) return "N/A";
    const birthDate = new Date(birthDateStr);
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    return age;
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return "N/A";
    const date = new Date(dateStr);
    return date.toLocaleDateString([], { month: "long", day: "numeric", year: "numeric" });
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-6 w-32 shimmer-bg rounded"></div>
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          <div className="lg:col-span-4 h-96 shimmer-bg rounded-2xl"></div>
          <div className="lg:col-span-8 h-96 shimmer-bg rounded-2xl"></div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center text-red-500 border border-red-500/20 mb-4 animate-bounce">
          <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <h2 className="text-xl font-semibold mb-2">Record Error</h2>
        <p className="text-slate-400 max-w-md mb-6">{error}</p>
        <Link href="/patients" className="glow-btn-teal px-5 py-2.5 rounded-xl font-medium text-sm transition-all">
          Back to Directory
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-12">
      {/* Breadcrumb Navigation */}
      <nav className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
        <Link href="/patients" className="hover:text-cyan-400 transition">Patients</Link>
        <svg className="w-3 h-3 text-slate-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
        <span className="text-slate-300">{patient?.first_name} {patient?.last_name}</span>
      </nav>

      {/* Grid details */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Side: Demographics Card */}
        <div className="lg:col-span-4 space-y-6">
          <div className="glass-panel p-6 rounded-2xl text-center">
            {/* Avatar Circle */}
            <div className="w-20 h-20 rounded-full bg-gradient-to-tr from-teal-500/20 to-cyan-500/20 border border-cyan-500/40 flex items-center justify-center mx-auto text-cyan-400 font-bold text-3xl shadow-lg shadow-cyan-500/5 mb-4">
              {patient?.first_name?.[0]}{patient?.last_name?.[0]}
            </div>
            
            <h3 className="text-xl font-bold text-white mb-0.5">{patient?.first_name} {patient?.last_name}</h3>
            <span className="text-xs font-mono text-slate-500">ID: {patient?.id}</span>

            <div className="mt-6 border-t border-slate-800/60 pt-6 space-y-4 text-left text-sm">
              <div className="flex justify-between">
                <span className="text-slate-400">Gender:</span>
                <span className="text-slate-200 font-semibold">{patient?.gender || "Other"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Birth Date:</span>
                <span className="text-slate-200 font-semibold">{formatDate(patient?.birth_date)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Age:</span>
                <span className="text-slate-200 font-semibold">{calculateAge(patient?.birth_date)} yrs</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Phone:</span>
                <span className="text-slate-200 font-mono font-semibold">{patient?.phone_number}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">FHIR Resource:</span>
                <span className="text-slate-400 font-mono text-xs">{patient?.fhir_id || "None Linked"}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Right Side: Medications & Call Reminder Controls */}
        <div className="lg:col-span-8 space-y-6">
          {/* Medications Header Card */}
          <div className="glass-panel p-6 rounded-2xl">
            <div className="flex justify-between items-center pb-4 border-b border-slate-800/40 mb-6">
              <div>
                <h3 className="font-bold text-lg text-slate-100">Prescribed Medications</h3>
                <p className="text-xs text-slate-400 mt-0.5">Active medication schedules and manual reminders.</p>
              </div>
              <button
                onClick={() => setIsAddMedOpen(!isAddMedOpen)}
                className="px-3.5 py-2 text-xs font-bold rounded-xl border border-slate-700 bg-slate-900/60 text-slate-200 hover:text-white hover:bg-slate-800 transition flex items-center gap-1.5"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  {isAddMedOpen ? (
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  ) : (
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  )}
                </svg>
                {isAddMedOpen ? "Cancel" : "Add Medication"}
              </button>
            </div>

            {/* Add Medication form (inline dropdown) */}
            {isAddMedOpen && (
              <div className="p-5 bg-slate-900/50 rounded-xl border border-slate-800 mb-6 animate-fade-in">
                <h4 className="text-xs font-bold uppercase tracking-wider text-cyan-400 mb-4">Add Medication Schedule</h4>
                <form onSubmit={handleAddMedSubmit} className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs text-slate-400 uppercase tracking-wider font-semibold mb-1">Medication Name *</label>
                      <input
                        type="text"
                        name="medication_name"
                        required
                        placeholder="e.g. Metformin 500mg"
                        value={medForm.medication_name}
                        onChange={handleMedInputChange}
                        className="glass-input px-3 py-2 w-full text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-slate-400 uppercase tracking-wider font-semibold mb-1">Dosage Instruction *</label>
                      <input
                        type="text"
                        name="dosage_instruction"
                        required
                        placeholder="e.g. Take 1 tablet after dinner"
                        value={medForm.dosage_instruction}
                        onChange={handleMedInputChange}
                        className="glass-input px-3 py-2 w-full text-sm"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs text-slate-400 uppercase tracking-wider font-semibold mb-1">Scheduled Reminder Time *</label>
                      <input
                        type="time"
                        name="scheduled_time"
                        required
                        value={medForm.scheduled_time}
                        onChange={handleMedInputChange}
                        className="glass-input px-3 py-2 w-full text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-slate-400 uppercase tracking-wider font-semibold mb-1">FHIR Resource ID</label>
                      <input
                        type="text"
                        name="fhir_id"
                        placeholder="e.g. fhir-med-103a"
                        value={medForm.fhir_id}
                        onChange={handleMedInputChange}
                        className="glass-input px-3 py-2 w-full text-sm font-mono"
                      />
                    </div>
                  </div>

                  <div className="flex justify-end gap-3 pt-3">
                    <button
                      type="submit"
                      disabled={medSubmitting}
                      className="glow-btn-teal px-5 py-2 rounded-lg font-bold text-sm"
                    >
                      {medSubmitting ? "Adding..." : "Add to Schedule"}
                    </button>
                  </div>
                </form>
              </div>
            )}

            {/* Medications List */}
            {medications.length === 0 ? (
              <div className="text-center py-12 text-slate-500">
                <svg className="w-12 h-12 text-slate-700 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
                <p className="font-semibold text-slate-400">No Medications Scheduled</p>
                <p className="text-xs text-slate-500 mt-1">This patient has no active medications set up for reminders.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {medications.map((med) => (
                  <div key={med.id} className="p-4 bg-slate-900/40 border border-slate-800 rounded-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <h4 className="font-bold text-slate-200">{med.medication_name}</h4>
                        {med.fhir_id && (
                          <span className="text-[9px] font-mono bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded">
                            FHIR: {med.fhir_id}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-400">{med.dosage_instruction}</p>
                      <div className="flex items-center gap-1.5 text-xs text-slate-500 mt-1.5">
                        <svg className="w-3.5 h-3.5 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <span>Scheduled: <strong className="text-slate-300 font-mono">{med.scheduled_time}</strong> daily</span>
                      </div>
                    </div>

                    <div className="self-end md:self-auto">
                      <button
                        onClick={() => handleTriggerReminder(med.id)}
                        disabled={triggeringId === med.id}
                        className="px-4 py-2 text-xs font-bold rounded-lg bg-cyan-500/10 text-cyan-400 hover:bg-cyan-500/20 border border-cyan-500/20 transition flex items-center gap-1.5 disabled:opacity-50"
                      >
                        {triggeringId === med.id ? (
                          <>
                            <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 1121.21 8H18.2" />
                            </svg>
                            Calling...
                          </>
                        ) : (
                          <>
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.94.725l.548 2.2a1 1 0 01-.321.988l-1.305.98a10.582 10.582 0 004.872 4.872l.98-1.305a1 1 0 01.988-.321l2.2.548a1 1 0 01.725.94V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                            </svg>
                            Trigger Call
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
