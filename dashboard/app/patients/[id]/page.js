"use client";

import { useState, useEffect, use } from "react";
import Link from "next/link";
import WebVoiceCallModal from "@/components/WebVoiceCallModal";

export default function PatientDetailPage({ params }) {
  const resolvedParams = use(params);
  const patientId = resolvedParams.id;

  const [patient, setPatient] = useState(null);
  const [medications, setMedications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // In-Browser Live AI Voice Call state
  const [activeWebCallMed, setActiveWebCallMed] = useState(null);

  // Add Medication Form State
  const [isAddMedOpen, setIsAddMedOpen] = useState(false);
  const [medSubmitting, setMedSubmitting] = useState(false);
  const [medForm, setMedForm] = useState({
    medication_name: "",
    dosage_instruction: "",
    scheduled_time: "", // HTML input gives HH:MM
    fhir_id: "",
  });

  // Edit Medication Form State
  const [editingMedId, setEditingMedId] = useState(null);
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editForm, setEditForm] = useState({
    medication_name: "",
    dosage_instruction: "",
    scheduled_time: "",
    fhir_id: "",
  });

  // Call & WhatsApp reminder trigger state & Notification banner
  const [triggeringId, setTriggeringId] = useState(null);
  const [whatsappTriggeringId, setWhatsappTriggeringId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [callNotification, setCallNotification] = useState(null);
  const [actionSuccess, setActionSuccess] = useState(null);

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

  // Add Medication Handlers
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
      showTemporarySuccess("New medication schedule added successfully!");
    } catch (err) {
      alert(err.message);
    } finally {
      setMedSubmitting(false);
    }
  };

  // Edit Medication Handlers
  const startEditing = (med) => {
    setEditingMedId(med.id);
    setEditForm({
      medication_name: med.medication_name || "",
      dosage_instruction: med.dosage_instruction || "",
      scheduled_time: (med.scheduled_time || "").slice(0, 5),
      fhir_id: med.fhir_id || "",
    });
  };

  const cancelEditing = () => {
    setEditingMedId(null);
  };

  const handleEditInputChange = (e) => {
    const { name, value } = e.target;
    setEditForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleEditMedSubmit = async (e, medId) => {
    e.preventDefault();
    if (!editForm.medication_name || !editForm.dosage_instruction || !editForm.scheduled_time) {
      alert("Please fill out all required fields.");
      return;
    }

    try {
      setEditSubmitting(true);

      const formattedTime = editForm.scheduled_time.length === 5 
        ? `${editForm.scheduled_time}:00` 
        : editForm.scheduled_time;

      const payload = {
        ...editForm,
        scheduled_time: formattedTime,
      };

      const res = await fetch(`/api/patients/${patientId}/medications/${medId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.detail || "Failed to update medication details");
      }

      // Reload meds list
      const medsRes = await fetch(`/api/patients/${patientId}/medications`);
      if (medsRes.ok) {
        const medsData = await medsRes.json();
        setMedications(medsData);
      }

      setEditingMedId(null);
      showTemporarySuccess("Medication schedule updated successfully!");
    } catch (err) {
      alert(err.message);
    } finally {
      setEditSubmitting(false);
    }
  };

  // Delete Medication Handler
  const handleDeleteMed = async (medId, medName) => {
    if (!confirm(`Are you sure you want to remove '${medName}' from the active schedule?`)) {
      return;
    }

    try {
      setDeletingId(medId);
      const res = await fetch(`/api/patients/${patientId}/medications/${medId}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.detail || "Failed to delete medication");
      }

      // Reload meds list
      const medsRes = await fetch(`/api/patients/${patientId}/medications`);
      if (medsRes.ok) {
        const medsData = await medsRes.json();
        setMedications(medsData);
      }

      showTemporarySuccess(`'${medName}' was removed from the schedule.`);
    } catch (err) {
      alert(err.message);
    } finally {
      setDeletingId(null);
    }
  };

  // Real-Time Call Reminder Trigger Handler
  const handleTriggerReminder = async (medId, medName) => {
    try {
      setTriggeringId(medId);
      setCallNotification(null);

      const res = await fetch("/api/reminders/trigger", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ medication_request_id: String(medId) }),
      });

      let data = {};
      try {
        data = await res.json();
      } catch (parseErr) {
        throw new Error(`Server returned error (${res.status}). Please check backend logs.`);
      }

      if (!res.ok) {
        throw new Error(data.detail || "Outbound call trigger failed");
      }

      setCallNotification({
        type: "success",
        medName: medName,
        isWhatsApp: false,
        callSid: data.call_sid,
        time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
      });
    } catch (err) {
      setCallNotification({
        type: "error",
        medName: medName,
        isWhatsApp: false,
        message: err.message,
      });
    } finally {
      setTriggeringId(null);
    }
  };

  // WhatsApp Interactive Reminder Trigger Handler
  const handleTriggerWhatsApp = async (medId, medName) => {
    try {
      setWhatsappTriggeringId(medId);
      setCallNotification(null);

      const res = await fetch("/api/whatsapp/trigger", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ medication_request_id: String(medId) }),
      });

      let data = {};
      try {
        data = await res.json();
      } catch (parseErr) {
        throw new Error(`Server returned error (${res.status}). Please check backend logs.`);
      }

      if (!res.ok) {
        throw new Error(data.detail || "Failed to send WhatsApp message");
      }

      setCallNotification({
        type: "success",
        medName: medName,
        isWhatsApp: true,
        callSid: data.message_id,
        recipient: data.recipient,
        time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
      });
      showTemporarySuccess(`WhatsApp interactive reminder dispatched to ${patient?.phone_number}!`);
    } catch (err) {
      setCallNotification({
        type: "error",
        medName: medName,
        isWhatsApp: true,
        message: err.message,
      });
    } finally {
      setWhatsappTriggeringId(null);
    }
  };

  const showTemporarySuccess = (msg) => {
    setActionSuccess(msg);
    setTimeout(() => {
      setActionSuccess(null);
    }, 4000);
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

  const formatScheduledTimeDisplay = (timeStr) => {
    if (!timeStr) return "N/A";
    try {
      const parts = timeStr.split(":");
      const h = parseInt(parts[0], 10);
      const m = parts[1] || "00";
      const ampm = h >= 12 ? "PM" : "AM";
      const h12 = h % 12 || 12;
      return `${h12}:${m} ${ampm}`;
    } catch (e) {
      return timeStr;
    }
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

      {/* Action Success Toast Banner */}
      {actionSuccess && (
        <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-sm flex items-center justify-between animate-fade-in shadow-lg shadow-emerald-500/5">
          <div className="flex items-center gap-2.5">
            <svg className="w-5 h-5 text-emerald-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            <span className="font-medium">{actionSuccess}</span>
          </div>
          <button onClick={() => setActionSuccess(null)} className="text-emerald-400/70 hover:text-emerald-400">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      {/* Real-time Call / WhatsApp Trigger Feedback Notification Banner */}
      {callNotification && (
        <div className={`p-5 rounded-2xl border animate-fade-in ${
          callNotification.type === "success" 
            ? "bg-[#0b1b1e] border-teal-500/40 shadow-xl shadow-teal-500/10 text-slate-200" 
            : "bg-[#1f1013] border-red-500/40 shadow-xl shadow-red-500/10 text-slate-200"
        }`}>
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3.5">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                callNotification.type === "success" ? (callNotification.isWhatsApp ? "bg-emerald-500/20 text-emerald-400" : "bg-teal-500/20 text-teal-400") : "bg-red-500/20 text-red-400"
              }`}>
                {callNotification.type === "success" ? (
                  callNotification.isWhatsApp ? (
                    <svg className="w-5 h-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                    </svg>
                  ) : (
                    <svg className="w-5 h-5 animate-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.94.725l.548 2.2a1 1 0 01-.321.988l-1.305.98a10.582 10.582 0 004.872 4.872l.98-1.305a1 1 0 01.988-.321l2.2.548a1 1 0 01.725.94V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                    </svg>
                  )
                ) : (
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                )}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h4 className={`font-bold text-sm ${callNotification.type === "success" ? (callNotification.isWhatsApp ? "text-emerald-300" : "text-teal-300") : "text-red-400"}`}>
                    {callNotification.type === "success" 
                      ? (callNotification.isWhatsApp ? "WhatsApp Interactive Reminder Dispatched" : "Live Reminder Call Initiated") 
                      : "Reminder Trigger Failed"}
                  </h4>
                  {callNotification.time && (
                    <span className="text-[11px] text-slate-500 font-mono">[{callNotification.time}]</span>
                  )}
                </div>

                {callNotification.type === "success" ? (
                  <div className="mt-1 space-y-1.5 text-xs text-slate-300">
                    <p>
                      {callNotification.isWhatsApp ? (
                        <>Interactive WhatsApp message sent to <strong className="text-white font-mono">{patient?.phone_number}</strong> with Quick-Reply buttons.</>
                      ) : (
                        <>The AI Voice Assistant is dialing <strong className="text-white font-mono">{patient?.phone_number}</strong> for <strong className="text-cyan-300">{callNotification.medName}</strong>.</>
                      )}
                    </p>
                    <div className="flex flex-wrap items-center gap-3 pt-1">
                      <span className="font-mono text-[11px] text-slate-400 bg-slate-900/80 px-2 py-1 rounded border border-slate-800">
                        ID: {callNotification.callSid}
                      </span>
                      <Link
                        href="/calls"
                        className="text-cyan-400 hover:text-cyan-300 font-semibold inline-flex items-center gap-1 transition"
                      >
                        Audit Real-time Interaction Logs & Transcript
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                        </svg>
                      </Link>
                    </div>
                  </div>
                ) : (
                  <p className="mt-1 text-xs text-slate-300">{callNotification.message}</p>
                )}
              </div>
            </div>
            <button
              onClick={() => setCallNotification(null)}
              className="text-slate-400 hover:text-white transition p-1"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}

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
                <p className="text-xs text-slate-400 mt-0.5">Active medication schedules, edit times, and real-time reminders.</p>
              </div>
              <button
                onClick={() => {
                  setIsAddMedOpen(!isAddMedOpen);
                  setEditingMedId(null);
                }}
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
              <div className="p-5 bg-slate-900/60 rounded-xl border border-cyan-500/30 mb-6 animate-fade-in shadow-lg shadow-cyan-500/5">
                <div className="flex items-center justify-between mb-4">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-cyan-400">Add Medication Schedule</h4>
                  <span className="text-[10px] text-slate-500 font-mono">Daily Auto-Reminder</span>
                </div>
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
                        className="glass-input px-3 py-2 w-full text-sm font-mono text-slate-100"
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
                      type="button"
                      onClick={() => setIsAddMedOpen(false)}
                      className="px-4 py-2 text-xs font-semibold rounded-lg border border-slate-700 text-slate-400 hover:text-white transition"
                    >
                      Cancel
                    </button>
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
                {medications.map((med) => {
                  const isEditingThis = editingMedId === med.id;

                  if (isEditingThis) {
                    // Inline Edit Mode for this Medication
                    return (
                      <div key={med.id} className="p-5 bg-slate-900/80 border border-teal-500/40 rounded-xl shadow-xl shadow-teal-500/5 animate-fade-in">
                        <div className="flex items-center justify-between mb-3 border-b border-slate-800 pb-2">
                          <h4 className="text-xs font-bold uppercase tracking-wider text-teal-400 flex items-center gap-1.5">
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                            Edit Medication & Schedule
                          </h4>
                          <span className="text-[10px] text-slate-400 font-mono">Med ID: {med.id}</span>
                        </div>

                        <form onSubmit={(e) => handleEditMedSubmit(e, med.id)} className="space-y-3">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <div>
                              <label className="block text-xs text-slate-400 uppercase tracking-wider font-semibold mb-1">Medication Name *</label>
                              <input
                                type="text"
                                name="medication_name"
                                required
                                value={editForm.medication_name}
                                onChange={handleEditInputChange}
                                className="glass-input px-3 py-2 w-full text-sm"
                              />
                            </div>
                            <div>
                              <label className="block text-xs text-slate-400 uppercase tracking-wider font-semibold mb-1">Dosage Instruction *</label>
                              <input
                                type="text"
                                name="dosage_instruction"
                                required
                                value={editForm.dosage_instruction}
                                onChange={handleEditInputChange}
                                className="glass-input px-3 py-2 w-full text-sm"
                              />
                            </div>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <div>
                              <label className="block text-xs text-slate-400 uppercase tracking-wider font-semibold mb-1">Daily Scheduled Reminder Time *</label>
                              <input
                                type="time"
                                name="scheduled_time"
                                required
                                value={editForm.scheduled_time}
                                onChange={handleEditInputChange}
                                className="glass-input px-3 py-2 w-full text-sm font-mono text-slate-100"
                              />
                              <span className="text-[10px] text-slate-500 mt-1 block">Triggered automatically by APScheduler every day.</span>
                            </div>
                            <div>
                              <label className="block text-xs text-slate-400 uppercase tracking-wider font-semibold mb-1">FHIR ID (Optional)</label>
                              <input
                                type="text"
                                name="fhir_id"
                                value={editForm.fhir_id}
                                onChange={handleEditInputChange}
                                className="glass-input px-3 py-2 w-full text-sm font-mono"
                              />
                            </div>
                          </div>

                          <div className="flex justify-end items-center gap-2 pt-2 border-t border-slate-800/60 mt-3">
                            <button
                              type="button"
                              onClick={cancelEditing}
                              className="px-3.5 py-1.5 text-xs font-semibold rounded-lg border border-slate-700 text-slate-400 hover:text-slate-200 transition"
                            >
                              Cancel
                            </button>
                            <button
                              type="submit"
                              disabled={editSubmitting}
                              className="glow-btn-teal px-4 py-1.5 rounded-lg font-bold text-xs transition"
                            >
                              {editSubmitting ? "Saving..." : "Save Changes"}
                            </button>
                          </div>
                        </form>
                      </div>
                    );
                  }

                  // Normal View Card for this Medication
                  return (
                    <div key={med.id} className="p-4 bg-slate-900/40 hover:bg-slate-900/60 border border-slate-800 hover:border-slate-700/80 rounded-xl transition flex flex-col md:flex-row md:items-center justify-between gap-4">
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-2">
                          <h4 className="font-bold text-slate-200 text-base">{med.medication_name}</h4>
                          {med.fhir_id && (
                            <span className="text-[9px] font-mono bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded border border-slate-700/50">
                              FHIR: {med.fhir_id}
                            </span>
                          )}
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-teal-500/10 text-teal-400 border border-teal-500/20">
                            Active
                          </span>
                        </div>
                        <p className="text-xs text-slate-300">{med.dosage_instruction}</p>
                        <div className="flex items-center gap-3 text-xs text-slate-400 mt-1">
                          <div className="flex items-center gap-1.5 bg-slate-800/50 px-2.5 py-1 rounded-md border border-slate-700/40">
                            <svg className="w-3.5 h-3.5 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            <span>Scheduled: <strong className="text-cyan-300 font-mono">{formatScheduledTimeDisplay(med.scheduled_time)}</strong></span>
                            <span className="text-slate-500 font-mono text-[10px]">({(med.scheduled_time || "").slice(0, 5)})</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 self-end md:self-auto flex-wrap">
                        {/* 1. In-Browser Live AI Voice Call Button */}
                        <button
                          onClick={() => setActiveWebCallMed(med)}
                          className="px-3.5 py-1.5 text-xs font-bold rounded-lg bg-gradient-to-r from-teal-500/20 to-cyan-500/20 text-cyan-300 hover:from-teal-500/30 hover:to-cyan-500/30 border border-cyan-400/40 hover:border-cyan-400 shadow-md shadow-cyan-500/10 transition flex items-center gap-1.5"
                          title="Talk directly with MedHerence AI Voice Assistant using your computer microphone and speakers"
                        >
                          <svg className="w-3.5 h-3.5 text-teal-400 animate-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 100-6 3 3 0 000 6z" />
                          </svg>
                          <span>Start AI Voice Call (Web Mic)</span>
                        </button>

                        {/* 2. WhatsApp Interactive Reminder Button */}
                        <button
                          onClick={() => handleTriggerWhatsApp(med.id, med.medication_name)}
                          disabled={whatsappTriggeringId === med.id}
                          className="px-3.5 py-1.5 text-xs font-bold rounded-lg bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 border border-emerald-500/40 hover:border-emerald-400 shadow-md shadow-emerald-500/10 transition flex items-center gap-1.5 disabled:opacity-50"
                          title="Send WhatsApp interactive reminder with one-tap compliance buttons directly to patient's phone"
                        >
                          {whatsappTriggeringId === med.id ? (
                            <>
                              <svg className="w-3.5 h-3.5 animate-spin text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 1121.21 8H18.2" />
                              </svg>
                              Sending WhatsApp...
                            </>
                          ) : (
                            <>
                              <svg className="w-3.5 h-3.5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                              </svg>
                              <span>WhatsApp Reminder</span>
                            </>
                          )}
                        </button>

                        {/* 3. Edit Medication & Schedule Button */}
                        <button
                          onClick={() => startEditing(med)}
                          className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-700 bg-slate-900/60 text-slate-300 hover:text-white hover:bg-slate-800 hover:border-slate-600 transition flex items-center gap-1.5"
                          title="Edit scheduled time or medicine details"
                        >
                          <svg className="w-3.5 h-3.5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                          Edit
                        </button>

                        {/* 4. Delete Medication Button */}
                        <button
                          onClick={() => handleDeleteMed(med.id, med.medication_name)}
                          disabled={deletingId === med.id}
                          className="p-1.5 text-xs font-semibold rounded-lg border border-slate-800 text-slate-500 hover:text-red-400 hover:bg-red-500/10 hover:border-red-500/20 transition"
                          title="Delete medication schedule"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>

                        {/* 5. Twilio Outbound Phone Call Button */}
                        <button
                          onClick={() => handleTriggerReminder(med.id, med.medication_name)}
                          disabled={triggeringId === med.id}
                          className="px-2.5 py-1.5 text-xs font-medium rounded-lg border border-slate-800 bg-slate-950/40 text-slate-400 hover:text-slate-200 hover:border-slate-700 transition flex items-center gap-1.5 disabled:opacity-50"
                          title="Dial patient's physical phone via Twilio"
                        >
                          {triggeringId === med.id ? (
                            <>
                              <svg className="w-3 h-3 animate-spin text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 1121.21 8H18.2" />
                              </svg>
                              Dialing Phone...
                            </>
                          ) : (
                            <>
                              <svg className="w-3 h-3 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.94.725l.548 2.2a1 1 0 01-.321.988l-1.305.98a10.582 10.582 0 004.872 4.872l.98-1.305a1 1 0 01.988-.321l2.2.548a1 1 0 01.725.94V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                              </svg>
                              Phone Call (Twilio)
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* In-Browser Live AI Voice Call Modal */}
      {activeWebCallMed && patient && (
        <WebVoiceCallModal
          isOpen={Boolean(activeWebCallMed)}
          onClose={() => setActiveWebCallMed(null)}
          patient={patient}
          medication={activeWebCallMed}
          onCallCompleted={() => {
            fetchPatientDetails();
          }}
        />
      )}
    </div>
  );
}
