"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

export default function PatientsPage() {
  const [patients, setPatients] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  // Add Patient Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    first_name: "",
    last_name: "",
    phone_number: "",
    gender: "Other",
    birth_date: "",
    fhir_id: "",
  });

  const fetchPatients = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/patients");
      if (!res.ok) throw new Error("Failed to load patients database");
      const data = await res.json();
      setPatients(data);
      setError(null);
    } catch (err) {
      console.error(err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPatients();
  }, []);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleFormSubmit = async (e) => {
    e.preventDefault();
    if (!formData.first_name || !formData.last_name || !formData.phone_number) {
      alert("First name, last name, and phone number are required.");
      return;
    }

    try {
      setSubmitting(true);
      const res = await fetch("/api/patients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.detail || "Failed to create patient record");
      }

      await fetchPatients(); // Reload list
      setIsModalOpen(false); // Close modal
      setFormData({
        first_name: "",
        last_name: "",
        phone_number: "",
        gender: "Other",
        birth_date: "",
        fhir_id: "",
      }); // Reset form
    } catch (err) {
      alert(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  // Filter patients based on query
  const filteredPatients = patients.filter((patient) => {
    const fullName = `${patient.first_name} ${patient.last_name}`.toLowerCase();
    const phone = patient.phone_number.toLowerCase();
    const query = searchQuery.toLowerCase();
    return fullName.includes(query) || phone.includes(query);
  });

  const formatDate = (dateStr) => {
    if (!dateStr) return "N/A";
    const date = new Date(dateStr);
    return date.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-white">Patients Directory</h2>
          <p className="text-sm text-slate-400">View and manage clinical patients, contact numbers, and EHR details.</p>
        </div>
        <button
          onClick={() => setIsModalOpen(true)}
          className="glow-btn-teal px-4 py-2.5 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 self-start sm:self-auto"
        >
          <svg className="w-5 h-5 text-[#0b0f19]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
          </svg>
          Add Patient
        </button>
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-4 max-w-md">
        <div className="relative flex-1">
          <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </span>
          <input
            type="text"
            placeholder="Search by name or phone number..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="glass-input pl-10 pr-4 py-2.5 w-full text-sm"
          />
        </div>
      </div>

      {/* Main Container */}
      <div className="glass-panel rounded-2xl overflow-hidden min-h-[300px]">
        {loading ? (
          <div className="space-y-4 p-6">
            <div className="h-10 shimmer-bg rounded"></div>
            <div className="h-12 shimmer-bg rounded"></div>
            <div className="h-12 shimmer-bg rounded"></div>
            <div className="h-12 shimmer-bg rounded"></div>
            <div className="h-12 shimmer-bg rounded"></div>
          </div>
        ) : error ? (
          <div className="text-center py-20 text-red-400">
            <p className="font-semibold text-lg">Error Loading Patients</p>
            <p className="text-sm text-slate-500 mt-1">{error}</p>
            <button onClick={fetchPatients} className="mt-4 px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-xs hover:text-white transition">
              Retry Sync
            </button>
          </div>
        ) : filteredPatients.length === 0 ? (
          <div className="text-center py-20 text-slate-500">
            <svg className="w-16 h-16 text-slate-700 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
            <p className="font-semibold text-slate-400">No Patients Found</p>
            <p className="text-sm text-slate-500 max-w-sm mx-auto mt-1">
              {searchQuery ? "No matches for your search filter." : "Get started by adding your first patient database entry."}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="glass-table w-full">
              <thead>
                <tr>
                  <th className="py-3.5 px-6">Name</th>
                  <th className="py-3.5 px-6">Gender</th>
                  <th className="py-3.5 px-6">Birth Date</th>
                  <th className="py-3.5 px-6">Phone Number</th>
                  <th className="py-3.5 px-6">EHR/FHIR ID</th>
                  <th className="py-3.5 px-6 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredPatients.map((patient) => (
                  <tr key={patient.id} className="transition hover:bg-slate-800/10">
                    <td className="py-4 px-6 font-bold text-slate-200">
                      <Link href={`/patients/${patient.id}`} className="hover:text-cyan-400 transition">
                        {patient.first_name} {patient.last_name}
                      </Link>
                    </td>
                    <td className="py-4 px-6 text-sm text-slate-300">
                      <span className={`inline-block px-2.5 py-0.5 rounded text-xs font-medium uppercase ${
                        patient.gender === "Male"
                          ? "bg-blue-500/10 text-blue-400 border border-blue-500/20"
                          : patient.gender === "Female"
                          ? "bg-pink-500/10 text-pink-400 border border-pink-500/20"
                          : "bg-slate-800 text-slate-400 border border-slate-700/50"
                      }`}>
                        {patient.gender || "Other"}
                      </span>
                    </td>
                    <td className="py-4 px-6 text-sm text-slate-300 font-mono">
                      {formatDate(patient.birth_date)}
                    </td>
                    <td className="py-4 px-6 text-sm font-mono text-slate-300">
                      {patient.phone_number}
                    </td>
                    <td className="py-4 px-6 text-sm font-mono text-slate-400">
                      {patient.fhir_id || <span className="text-slate-600">Unlinked</span>}
                    </td>
                    <td className="py-4 px-6 text-right">
                      <Link
                        href={`/patients/${patient.id}`}
                        className="inline-flex items-center gap-1 text-sm font-semibold text-cyan-400 hover:text-cyan-300 transition"
                      >
                        Manage
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add Patient Modal Overlay */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="glass-panel w-full max-w-lg rounded-2xl border border-slate-700/50 overflow-hidden shadow-2xl shadow-cyan-500/5 animate-fade-in">
            <div className="px-6 py-5 bg-[#0e1322] border-b border-slate-800 flex justify-between items-center">
              <h3 className="text-lg font-bold text-slate-100">Register New Patient</h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:bg-slate-800 hover:text-slate-200 transition"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleFormSubmit} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">First Name *</label>
                  <input
                    type="text"
                    name="first_name"
                    required
                    value={formData.first_name}
                    onChange={handleInputChange}
                    placeholder="e.g. John"
                    className="glass-input px-3.5 py-2 w-full text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Last Name *</label>
                  <input
                    type="text"
                    name="last_name"
                    required
                    value={formData.last_name}
                    onChange={handleInputChange}
                    placeholder="e.g. Doe"
                    className="glass-input px-3.5 py-2 w-full text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Phone Number *</label>
                <input
                  type="tel"
                  name="phone_number"
                  required
                  value={formData.phone_number}
                  onChange={handleInputChange}
                  placeholder="e.g. +14155552671"
                  className="glass-input px-3.5 py-2 w-full text-sm font-mono"
                />
                <span className="text-[10px] text-slate-500 mt-1 block">Include country code (e.g. +1 for USA) for outbound Twilio calls.</span>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Gender</label>
                  <select
                    name="gender"
                    value={formData.gender}
                    onChange={handleInputChange}
                    className="glass-input px-3.5 py-2 w-full text-sm"
                  >
                    <option value="Male" className="bg-[#0b0f19]">Male</option>
                    <option value="Female" className="bg-[#0b0f19]">Female</option>
                    <option value="Other" className="bg-[#0b0f19]">Other</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Birth Date</label>
                  <input
                    type="date"
                    name="birth_date"
                    value={formData.birth_date}
                    onChange={handleInputChange}
                    className="glass-input px-3.5 py-2 w-full text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">FHIR ID (Optional)</label>
                <input
                  type="text"
                  name="fhir_id"
                  value={formData.fhir_id}
                  onChange={handleInputChange}
                  placeholder="e.g. fhir-patient-9821"
                  className="glass-input px-3.5 py-2 w-full text-sm font-mono"
                />
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-800/60 mt-6">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-sm font-medium rounded-xl border border-slate-700 bg-transparent text-slate-300 hover:bg-slate-800 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="glow-btn-teal px-5 py-2 rounded-xl font-bold text-sm transition"
                >
                  {submitting ? "Registering..." : "Register Patient"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
