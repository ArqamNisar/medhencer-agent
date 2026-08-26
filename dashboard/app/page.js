"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

export default function DashboardPage() {
  const [summary, setSummary] = useState(null);
  const [escalations, setEscalations] = useState([]);
  const [calls, setCalls] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = async () => {
    try {
      setRefreshing(true);
      const [summaryRes, escalationsRes, callsRes] = await Promise.all([
        fetch("/api/dashboard/summary"),
        fetch("/api/dashboard/escalations"),
        fetch("/api/dashboard/calls"),
      ]);

      if (!summaryRes.ok || !escalationsRes.ok || !callsRes.ok) {
        throw new Error("Failed to fetch dashboard data");
      }

      const summaryData = await summaryRes.json();
      const escalationsData = await escalationsRes.json();
      const callsData = await callsRes.json();

      setSummary(summaryData);
      setEscalations(escalationsData);
      setCalls(callsData);
      setError(null);
    } catch (err) {
      console.error(err);
      setError(err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div className="h-8 w-48 shimmer-bg rounded-lg"></div>
          <div className="h-10 w-24 shimmer-bg rounded-lg"></div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-32 shimmer-bg rounded-2xl glass-panel"></div>
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div className="h-96 shimmer-bg rounded-2xl glass-panel"></div>
          <div className="h-96 shimmer-bg rounded-2xl glass-panel"></div>
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
        <h2 className="text-xl font-semibold mb-2">Connection Failure</h2>
        <p className="text-slate-400 max-w-md mb-6">{error}</p>
        <button
          onClick={fetchData}
          className="glow-btn-teal px-5 py-2.5 rounded-xl font-medium text-sm transition-all"
        >
          Try Again
        </button>
      </div>
    );
  }

  // Format date helper
  const formatTime = (isoString) => {
    if (!isoString) return "N/A";
    const date = new Date(isoString);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const formatDate = (isoString) => {
    if (!isoString) return "N/A";
    const date = new Date(isoString);
    return date.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
  };

  return (
    <div className="space-y-8 pb-12">
      {/* Header section */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-white">System Adherence Metrics</h2>
          <p className="text-sm text-slate-400">Real-time status of medication compliance and active voice logs.</p>
        </div>
        <button
          onClick={fetchData}
          disabled={refreshing}
          className="flex items-center gap-2 px-4 py-2 text-sm rounded-xl border border-slate-700 bg-slate-900/60 text-slate-300 hover:text-white hover:bg-slate-800/80 transition disabled:opacity-50"
        >
          <svg
            className={`w-4 h-4 ${refreshing ? "animate-spin text-cyan-400" : ""}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 1121.21 8H18.2" />
          </svg>
          {refreshing ? "Syncing..." : "Sync Dashboard"}
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* Adherence Rate Card */}
        <div className="glass-panel p-6 rounded-2xl flex flex-col justify-between">
          <div className="flex justify-between items-start">
            <span className="text-sm font-semibold text-slate-400">Adherence Rate</span>
            <span className="p-2 rounded-lg bg-teal-500/10 text-teal-400">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </span>
          </div>
          <div className="mt-4">
            <h3 className="text-3xl font-bold bg-gradient-to-r from-teal-400 to-emerald-400 bg-clip-text text-transparent">
              {summary?.adherence_rate}%
            </h3>
            <p className="text-xs text-slate-500 mt-1">Average patient medication compliance</p>
          </div>
        </div>

        {/* Total Patients Card */}
        <div className="glass-panel p-6 rounded-2xl flex flex-col justify-between">
          <div className="flex justify-between items-start">
            <span className="text-sm font-semibold text-slate-400">Total Patients</span>
            <span className="p-2 rounded-lg bg-cyan-500/10 text-cyan-400">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            </span>
          </div>
          <div className="mt-4">
            <h3 className="text-3xl font-bold text-slate-100">{summary?.total_patients}</h3>
            <p className="text-xs text-slate-500 mt-1">Active patients under care</p>
          </div>
        </div>

        {/* Total Calls Card */}
        <div className="glass-panel p-6 rounded-2xl flex flex-col justify-between">
          <div className="flex justify-between items-start">
            <span className="text-sm font-semibold text-slate-400">Reminder Calls</span>
            <span className="p-2 rounded-lg bg-indigo-500/10 text-indigo-400">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.94.725l.548 2.2a1 1 0 01-.321.988l-1.305.98a10.582 10.582 0 004.872 4.872l.98-1.305a1 1 0 01.988-.321l2.2.548a1 1 0 01.725.94V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
              </svg>
            </span>
          </div>
          <div className="mt-4">
            <h3 className="text-3xl font-bold text-slate-100">{summary?.total_calls}</h3>
            <p className="text-xs text-slate-500 mt-1">Completed reminder operations</p>
          </div>
        </div>

        {/* Active Escalations Card */}
        <div className={`glass-panel p-6 rounded-2xl flex flex-col justify-between ${summary?.active_escalations > 0 ? "animate-pulse-glow-danger" : ""}`}>
          <div className="flex justify-between items-start">
            <span className="text-sm font-semibold text-slate-400">Escalations</span>
            <span className={`p-2 rounded-lg ${summary?.active_escalations > 0 ? "bg-red-500/20 text-red-400" : "bg-slate-800 text-slate-500"}`}>
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </span>
          </div>
          <div className="mt-4">
            <h3 className={`text-3xl font-bold ${summary?.active_escalations > 0 ? "text-red-400 text-glow-red" : "text-slate-400"}`}>
              {summary?.active_escalations}
            </h3>
            <p className="text-xs text-slate-500 mt-1">Patients missing 3+ consecutive doses</p>
          </div>
        </div>
      </div>

      {/* Main Grid: Escalations & Calls */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Escalations List */}
        <div className="glass-panel p-6 rounded-2xl lg:col-span-5 flex flex-col h-[500px]">
          <div className="flex justify-between items-center pb-4 border-b border-slate-800/40">
            <div>
              <h3 className="font-bold text-lg text-slate-100 flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-red-500 inline-block animate-ping"></span>
                Active Escalations
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">Critical care interventions required.</p>
            </div>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-red-500/10 text-red-400 border border-red-500/20">
              {escalations.length} unresolved
            </span>
          </div>

          <div className="flex-1 overflow-y-auto mt-4 pr-1 space-y-4 custom-scrollbar">
            {escalations.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center text-slate-500 py-12">
                <svg className="w-12 h-12 text-slate-700 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="font-medium text-slate-400">All Clear</p>
                <p className="text-xs text-slate-500 max-w-xs mt-1">No patients are currently flagged for escalation.</p>
              </div>
            ) : (
              escalations.map((esc) => (
                <div key={esc.id} className="p-4 bg-slate-900/50 rounded-xl border border-red-500/20 hover:border-red-500/40 transition">
                  <div className="flex justify-between items-start mb-2">
                    <Link
                      href={`/patients/${esc.patient_id}`}
                      className="font-bold text-slate-200 hover:text-cyan-400 transition"
                    >
                      {esc.first_name} {esc.last_name}
                    </Link>
                    <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-red-500/10 text-red-400 border border-red-500/25">
                      {esc.status}
                    </span>
                  </div>
                  <div className="space-y-1.5 text-xs text-slate-400">
                    <p className="flex justify-between">
                      <span>Medication:</span>
                      <span className="text-slate-300 font-medium">{esc.medication_name}</span>
                    </p>
                    <p className="flex justify-between">
                      <span>Date Missed:</span>
                      <span className="text-slate-300 font-mono">{formatDate(esc.scheduled_date)}</span>
                    </p>
                    {esc.missed_reason && (
                      <p className="bg-slate-950/60 p-2 rounded text-[11px] border border-slate-800 text-slate-300 mt-2">
                        <strong className="text-red-400">Reason: </strong> {esc.missed_reason}
                      </p>
                    )}
                  </div>
                  <div className="mt-3 pt-3 border-t border-slate-800/40 flex justify-end">
                    <Link
                      href={`/patients/${esc.patient_id}`}
                      className="text-xs text-cyan-400 hover:text-cyan-300 flex items-center gap-1 font-semibold"
                    >
                      Intervene
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </Link>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Recent Call Logs */}
        <div className="glass-panel p-6 rounded-2xl lg:col-span-7 flex flex-col h-[500px]">
          <div className="flex justify-between items-center pb-4 border-b border-slate-800/40">
            <div>
              <h3 className="font-bold text-lg text-slate-100">Recent WhatsApp Reminders</h3>
              <p className="text-xs text-slate-400 mt-0.5">Automated WhatsApp medication reminders.</p>
            </div>
            <Link
              href="/calls"
              className="text-xs text-cyan-400 hover:text-cyan-300 flex items-center gap-1 font-semibold"
            >
              All logs
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          </div>

          <div className="flex-1 overflow-y-auto mt-4 pr-1 custom-scrollbar">
            {calls.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center text-slate-500 py-12">
                <svg className="w-12 h-12 text-slate-700 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
                <p className="font-medium text-slate-400">No Reminders Found</p>
                <p className="text-xs text-slate-500 max-w-xs mt-1">When WhatsApp medication reminders are sent, they will appear here.</p>
              </div>
            ) : (
              <div className="overflow-x-auto w-full">
                <table className="glass-table w-full">
                  <thead>
                    <tr>
                      <th className="py-2.5 px-3">Patient</th>
                      <th className="py-2.5 px-3">Status</th>
                      <th className="py-2.5 px-3">Time</th>
                      <th className="py-2.5 px-3 text-right">Details</th>
                    </tr>
                  </thead>
                  <tbody>
                    {calls.slice(0, 7).map((call) => (
                      <tr key={call.id} className="transition group">
                        <td className="py-3 px-3">
                          <Link href={`/patients/${call.patient_id}`} className="font-semibold text-slate-200 hover:text-cyan-400 transition block">
                            {call.first_name} {call.last_name}
                          </Link>
                          <span className="text-[10px] text-slate-500 font-mono">{call.phone_number}</span>
                        </td>
                        <td className="py-3 px-3">
                          <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                            call.status === "completed"
                              ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                              : call.status === "failed"
                              ? "bg-red-500/10 text-red-400 border border-red-500/20"
                              : "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                          }`}>
                            {call.status}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-xs text-slate-400">
                          <div>{formatTime(call.created_at)}</div>
                          <div className="text-[10px] text-slate-600 font-mono">{formatDate(call.created_at)}</div>
                        </td>
                        <td className="py-3 px-3 text-right">
                          <Link
                            href={`/patients/${call.patient_id}`}
                            className="text-xs font-semibold text-slate-400 hover:text-white inline-flex items-center gap-0.5"
                          >
                            Profile
                            <svg className="w-3.5 h-3.5 transform group-hover:translate-x-0.5 transition" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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
        </div>
      </div>
    </div>
  );
}
