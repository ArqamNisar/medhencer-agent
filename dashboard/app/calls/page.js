"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

export default function CallLogsPage() {
  const [calls, setCalls] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expandedCallId, setExpandedCallId] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");

  const fetchCalls = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/dashboard/calls");
      if (!res.ok) throw new Error("Failed to fetch call logs");
      const data = await res.json();
      setCalls(data);
      setError(null);
    } catch (err) {
      console.error(err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCalls();
  }, []);

  const toggleExpand = (callId) => {
    setExpandedCallId(expandedCallId === callId ? null : callId);
  };

  const formatTime = (isoString) => {
    if (!isoString) return "N/A";
    const date = new Date(isoString);
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  };

  const formatDate = (isoString) => {
    if (!isoString) return "N/A";
    const date = new Date(isoString);
    return date.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
  };

  const calculateDuration = (startStr, endStr) => {
    if (!startStr || !endStr) return "N/A";
    const start = new Date(startStr);
    const end = new Date(endStr);
    const diffMs = end - start;
    if (diffMs < 0) return "0s";
    const diffSecs = Math.round(diffMs / 1000);
    const mins = Math.floor(diffSecs / 60);
    const secs = diffSecs % 60;
    return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
  };

  // Filter calls
  const filteredCalls = calls.filter((call) => {
    const fullName = `${call.first_name} ${call.last_name}`.toLowerCase();
    const phone = call.phone_number.toLowerCase();
    const transcript = (call.transcript || "").toLowerCase();
    const status = call.status.toLowerCase();
    const query = searchQuery.toLowerCase();
    return (
      fullName.includes(query) ||
      phone.includes(query) ||
      transcript.includes(query) ||
      status.includes(query)
    );
  });

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-white">Reminder Logs</h2>
          <p className="text-sm text-slate-400">Review WhatsApp reminder logs, patient responses, and interaction details.</p>
        </div>
        <button
          onClick={fetchCalls}
          className="flex items-center gap-2 px-4 py-2 text-sm rounded-xl border border-slate-700 bg-slate-900/60 text-slate-300 hover:text-white hover:bg-slate-800/80 transition"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 1121.21 8H18.2" />
          </svg>
          Sync Logs
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
            placeholder="Search by name, status, or transcript keywords..."
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
            <p className="font-semibold text-lg">Error Loading Call Logs</p>
            <p className="text-sm text-slate-500 mt-1">{error}</p>
            <button onClick={fetchCalls} className="mt-4 px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-xs hover:text-white transition">
              Retry Sync
            </button>
          </div>
        ) : filteredCalls.length === 0 ? (
          <div className="text-center py-20 text-slate-500">
            <svg className="w-16 h-16 text-slate-700 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.94.725l.548 2.2a1 1 0 01-.321.988l-1.305.98a10.582 10.582 0 004.872 4.872l.98-1.305a1 1 0 01.988-.321l2.2.548a1 1 0 01.725.94V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
            </svg>
            <p className="font-semibold text-slate-400">No Reminders Logged</p>
            <p className="text-sm text-slate-500 max-w-sm mx-auto mt-1">
              {searchQuery ? "No logs match your filter." : "WhatsApp reminders will be logged here when sent."}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="glass-table w-full">
              <thead>
                <tr>
                  <th className="py-3.5 px-6">Patient Name</th>
                  <th className="py-3.5 px-6">Phone Number</th>
                  <th className="py-3.5 px-6">Status</th>
                  <th className="py-3.5 px-6">Call Direction</th>
                  <th className="py-3.5 px-6">Date & Time</th>
                  <th className="py-3.5 px-6">Duration</th>
                  <th className="py-3.5 px-6 text-right">Transcript</th>
                </tr>
              </thead>
              <tbody>
                {filteredCalls.map((call) => (
                  <>
                    <tr key={call.id} className="transition hover:bg-slate-800/10">
                      <td className="py-4 px-6 font-bold text-slate-200">
                        <Link href={`/patients/${call.patient_id}`} className="hover:text-cyan-400 transition">
                          {call.first_name} {call.last_name}
                        </Link>
                      </td>
                      <td className="py-4 px-6 text-sm font-mono text-slate-300">
                        {call.phone_number}
                      </td>
                      <td className="py-4 px-6 text-sm">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold uppercase ${
                          call.status === "completed"
                            ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                            : call.status === "failed"
                            ? "bg-red-500/10 text-red-400 border border-red-500/20"
                            : call.status === "in-progress"
                            ? "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                            : "bg-blue-500/10 text-blue-400 border border-blue-500/20"
                        }`}>
                          <span className={`w-1.5 h-1.5 rounded-full inline-block ${
                            call.status === "completed" ? "bg-emerald-450" : call.status === "failed" ? "bg-red-450" : "bg-amber-450"
                          }`}></span>
                          {call.status}
                        </span>
                      </td>
                      <td className="py-4 px-6 text-sm text-slate-400 capitalize">
                        {call.direction}
                      </td>
                      <td className="py-4 px-6 text-xs text-slate-300">
                        <div className="font-semibold">{formatDate(call.created_at)}</div>
                        <div className="font-mono text-slate-500 mt-0.5">{formatTime(call.created_at)}</div>
                      </td>
                      <td className="py-4 px-6 text-sm font-mono text-slate-300">
                        {calculateDuration(call.created_at, call.end_time)}
                      </td>
                      <td className="py-4 px-6 text-right">
                        {call.transcript ? (
                          <button
                            onClick={() => toggleExpand(call.id)}
                            className="px-3 py-1.5 text-xs font-bold rounded-lg border border-slate-700 bg-slate-900/40 text-slate-300 hover:text-white hover:bg-slate-800 transition inline-flex items-center gap-1"
                          >
                            <span>{expandedCallId === call.id ? "Hide" : "Audit"}</span>
                            <svg className={`w-3.5 h-3.5 transform transition ${expandedCallId === call.id ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                          </button>
                        ) : (
                          <span className="text-xs text-slate-600 font-mono">No transcript</span>
                        )}
                      </td>
                    </tr>
                    
                    {/* Collapsible Transcript Sub-Row */}
                    {expandedCallId === call.id && call.transcript && (
                      <tr className="bg-slate-950/30">
                        <td colSpan="7" className="py-5 px-8 border-b border-slate-800/80">
                          <div className="bg-[#0e1322]/80 border border-slate-800 rounded-xl p-5 space-y-4 max-w-4xl animate-fade-in shadow-inner">
                            <div className="flex justify-between items-center text-xs text-slate-500 border-b border-slate-800/60 pb-2">
                              <span className="font-semibold uppercase tracking-wider text-cyan-400">AI Agent Transcript Audit</span>
                              <span className="font-mono text-slate-500">Reminder ID: {call.twilio_call_sid}</span>
                            </div>
                            <div className="text-sm leading-relaxed text-slate-300 whitespace-pre-wrap font-sans max-h-80 overflow-y-auto pr-2 custom-scrollbar">
                              {call.transcript}
                            </div>
                            {call.recording_url && (
                              <div className="pt-2 border-t border-slate-800/60 flex items-center gap-3">
                                <span className="text-xs text-slate-500 font-semibold">Call Recording:</span>
                                <audio src={call.recording_url} controls className="h-8 max-w-xs outline-none bg-transparent" />
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
