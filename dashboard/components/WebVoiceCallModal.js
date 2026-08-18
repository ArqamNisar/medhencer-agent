"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";

export default function WebVoiceCallModal({
  isOpen,
  onClose,
  patient,
  medication,
  onCallCompleted,
}) {
  const [callState, setCallState] = useState("connecting"); // connecting, active, ending, completed, error
  const [agentSpeaking, setAgentSpeaking] = useState(false);
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState([]);
  const [currentSpeech, setCurrentSpeech] = useState("");
  const [manualInput, setManualInput] = useState("");
  const [errorMessage, setErrorMessage] = useState(null);
  const [callSummary, setCallSummary] = useState(null);
  const [isEscalated, setIsEscalated] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [callDuration, setCallDuration] = useState(0);

  const wsRef = useRef(null);
  const recognitionRef = useRef(null);
  const currentAudioRef = useRef(null);
  const durationTimerRef = useRef(null);
  const transcriptEndRef = useRef(null);

  // Auto-scroll transcript
  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [transcript, currentSpeech]);

  // Duration timer
  useEffect(() => {
    if (callState === "active") {
      durationTimerRef.current = setInterval(() => {
        setCallDuration((prev) => prev + 1);
      }, 1000);
    } else {
      if (durationTimerRef.current) clearInterval(durationTimerRef.current);
    }
    return () => {
      if (durationTimerRef.current) clearInterval(durationTimerRef.current);
    };
  }, [callState]);

  // Initialize Web Speech Recognition
  const initSpeechRecognition = () => {
    if (typeof window === "undefined") return null;

    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      console.warn("SpeechRecognition not supported in this browser.");
      return null;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.lang = "en-US";

      recognition.onstart = () => {
        setListening(true);
      };

      recognition.onresult = (event) => {
        let interimText = "";
        let finalText = "";

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            finalText += event.results[i][0].transcript;
          } else {
            interimText += event.results[i][0].transcript;
          }
        }

        if (interimText) {
          setCurrentSpeech(interimText);
        }

        if (finalText) {
          setCurrentSpeech("");
          sendUserMessage(finalText.trim());
        }
      };

      recognition.onerror = (event) => {
        console.warn("SpeechRecognition error:", event.error);
        setListening(false);
      };

      recognition.onend = () => {
        setListening(false);
      };

      return recognition;
    } catch (e) {
      console.error("Failed to init SpeechRecognition:", e);
      return null;
    }
  };

  const startListening = () => {
    if (isMuted) return;
    if (recognitionRef.current) {
      try {
        recognitionRef.current.start();
      } catch (e) {
        // Recognition might already be running
      }
    }
  };

  const stopListening = () => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch (e) {}
    }
    setListening(false);
  };

  // Play audio response from agent
  const playAgentAudio = (wavBase64, fallbackText, onFinishCallback) => {
    stopListening();
    setAgentSpeaking(true);

    if (wavBase64) {
      try {
        if (currentAudioRef.current) {
          currentAudioRef.current.pause();
        }
        const audio = new Audio("data:audio/wav;base64," + wavBase64);
        currentAudioRef.current = audio;
        
        audio.onended = () => {
          setAgentSpeaking(false);
          if (onFinishCallback) onFinishCallback();
        };

        audio.onerror = () => {
          fallbackSpeechSynthesis(fallbackText, onFinishCallback);
        };

        audio.play().catch(() => {
          fallbackSpeechSynthesis(fallbackText, onFinishCallback);
        });
        return;
      } catch (e) {
        console.warn("Error playing backend WAV audio, falling back to Web Speech:", e);
      }
    }

    // Fallback using Browser SpeechSynthesis
    fallbackSpeechSynthesis(fallbackText, onFinishCallback);
  };

  const fallbackSpeechSynthesis = (text, onFinishCallback) => {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1.0;
      utterance.pitch = 1.0;
      utterance.lang = "en-US";

      utterance.onend = () => {
        setAgentSpeaking(false);
        if (onFinishCallback) onFinishCallback();
      };
      utterance.onerror = () => {
        setAgentSpeaking(false);
        if (onFinishCallback) onFinishCallback();
      };

      window.speechSynthesis.speak(utterance);
    } else {
      setAgentSpeaking(false);
      if (onFinishCallback) onFinishCallback();
    }
  };

  // Start Call WebSocket connection
  const startCall = () => {
    setCallState("connecting");
    setTranscript([]);
    setErrorMessage(null);
    setCallSummary(null);
    setCallDuration(0);

    // Determine WebSocket host URL
    const host = window.location.hostname || "localhost";
    const wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${wsProtocol}//${host}:8000/ws/web-call?patient_id=${patient.id}&med_id=${medication.id}`;

    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setCallState("active");
        recognitionRef.current = initSpeechRecognition();
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);

          if (msg.type === "agent_message") {
            setTranscript((prev) => [
              ...prev,
              { sender: "agent", text: msg.text, time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) },
            ]);

            playAgentAudio(msg.audio_wav_base64, msg.text, () => {
              if (msg.should_end) {
                setCallState("ending");
              } else {
                startListening();
              }
            });
          } else if (msg.type === "call_completed") {
            setCallState("completed");
            setCallSummary(msg.summary);
            setIsEscalated(msg.escalated || false);
            if (onCallCompleted) onCallCompleted();
          } else if (msg.type === "error") {
            setErrorMessage(msg.message);
            setCallState("error");
          }
        } catch (err) {
          console.error("Error parsing WS message:", err);
        }
      };

      ws.onerror = (e) => {
        console.error("WebSocket error:", e);
        setErrorMessage("Could not connect to backend server on port 8000.");
        setCallState("error");
      };

      ws.onclose = () => {
        if (callState === "active") {
          setCallState("completed");
        }
      };
    } catch (e) {
      setErrorMessage(e.message);
      setCallState("error");
    }
  };

  const sendUserMessage = (text) => {
    if (!text || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;

    // Add to transcript view
    setTranscript((prev) => [
      ...prev,
      { sender: "user", text: text, time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) },
    ]);

    stopListening();
    wsRef.current.send(
      JSON.stringify({
        type: "user_message",
        text: text,
      })
    );
  };

  const handleManualSubmit = (e) => {
    e.preventDefault();
    if (!manualInput.trim()) return;
    sendUserMessage(manualInput.trim());
    setManualInput("");
  };

  const endCall = () => {
    stopListening();
    if (currentAudioRef.current) {
      currentAudioRef.current.pause();
    }
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "hangup" }));
    }
    setCallState("ending");
  };

  // Trigger call on open
  useEffect(() => {
    if (isOpen && patient && medication) {
      startCall();
    }

    return () => {
      stopListening();
      if (currentAudioRef.current) {
        currentAudioRef.current.pause();
      }
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [isOpen, patient?.id, medication?.id]);

  if (!isOpen) return null;

  const formatDuration = (secs) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
      <div className="glass-panel w-full max-w-2xl rounded-3xl border border-cyan-500/30 overflow-hidden shadow-2xl shadow-cyan-500/10 flex flex-col max-h-[90vh] animate-fade-in bg-[#0b101d]">
        
        {/* Top Header */}
        <div className="px-6 py-4 bg-[#0e1526] border-b border-slate-800/80 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-teal-500 to-cyan-500 flex items-center justify-center shadow-lg shadow-cyan-500/20">
              <svg className="w-5 h-5 text-slate-900" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 100-6 3 3 0 000 6z" />
              </svg>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-slate-100 text-sm">MedHerence AI Voice Agent</h3>
                <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                  Live Web Call
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Calling <strong className="text-slate-200">{patient?.first_name} {patient?.last_name}</strong> for <span className="text-cyan-300 font-medium">{medication?.medication_name}</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {callState === "active" && (
              <span className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block animate-pulse"></span>
                {formatDuration(callDuration)}
              </span>
            )}
            <button
              onClick={onClose}
              className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition"
              title="Close"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Call Animation / Visualizer Hub */}
        <div className="p-6 bg-gradient-to-b from-[#0e1526] to-[#0b101d] border-b border-slate-800/60 flex flex-col items-center justify-center text-center relative overflow-hidden">
          
          {/* Pulsing Visualizer Circle */}
          <div className="relative my-2">
            {agentSpeaking ? (
              <div className="w-24 h-24 rounded-full bg-cyan-500/20 border-2 border-cyan-400 flex items-center justify-center animate-pulse shadow-lg shadow-cyan-500/30">
                <div className="flex items-center gap-1">
                  <span className="w-1.5 h-6 bg-cyan-400 rounded-full animate-bounce"></span>
                  <span className="w-1.5 h-10 bg-teal-400 rounded-full animate-bounce [animation-delay:0.2s]"></span>
                  <span className="w-1.5 h-8 bg-cyan-300 rounded-full animate-bounce [animation-delay:0.4s]"></span>
                  <span className="w-1.5 h-4 bg-teal-300 rounded-full animate-bounce [animation-delay:0.1s]"></span>
                </div>
              </div>
            ) : listening ? (
              <div className="w-24 h-24 rounded-full bg-emerald-500/20 border-2 border-emerald-400 flex items-center justify-center animate-pulse shadow-lg shadow-emerald-500/30">
                <svg className="w-10 h-10 text-emerald-400 animate-bounce" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 100-6 3 3 0 000 6z" />
                </svg>
              </div>
            ) : callState === "connecting" ? (
              <div className="w-24 h-24 rounded-full bg-slate-800/80 border border-slate-700 flex items-center justify-center">
                <svg className="w-8 h-8 text-cyan-400 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 1121.21 8H18.2" />
                </svg>
              </div>
            ) : (
              <div className="w-24 h-24 rounded-full bg-slate-800/80 border border-slate-700 flex items-center justify-center">
                <svg className="w-10 h-10 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
            )}
          </div>

          {/* Status Text Banner */}
          <div className="mt-2">
            {callState === "connecting" && (
              <p className="text-sm font-semibold text-cyan-400 animate-pulse">Connecting to AI Voice Core...</p>
            )}
            {callState === "active" && agentSpeaking && (
              <p className="text-sm font-bold text-cyan-300 flex items-center justify-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-cyan-400 inline-block animate-ping"></span>
                AI Agent is Speaking...
              </p>
            )}
            {callState === "active" && !agentSpeaking && listening && (
              <p className="text-sm font-bold text-emerald-400 flex items-center justify-center gap-1.5 animate-pulse">
                <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block"></span>
                Listening to your microphone (Speak now)...
              </p>
            )}
            {callState === "active" && !agentSpeaking && !listening && (
              <p className="text-sm font-medium text-slate-400">Processing response...</p>
            )}
            {callState === "ending" && (
              <p className="text-sm font-semibold text-amber-400">Wrapping up clinical conversation & adherence audit...</p>
            )}
            {callState === "completed" && (
              <p className="text-sm font-bold text-emerald-400 flex items-center justify-center gap-1">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Call Successfully Logged
              </p>
            )}
          </div>
        </div>

        {/* Live Conversation Transcript Feed */}
        <div className="flex-1 p-6 overflow-y-auto space-y-3.5 custom-scrollbar min-h-[220px] max-h-[300px] bg-[#0b101d]">
          {transcript.length === 0 && callState === "connecting" && (
            <div className="text-center py-10 text-slate-500 text-xs">
              Initializing Groq clinical assistant session...
            </div>
          )}

          {transcript.map((msg, idx) => (
            <div
              key={idx}
              className={`flex flex-col ${msg.sender === "agent" ? "items-start" : "items-end"} animate-fade-in`}
            >
              <div className="flex items-center gap-2 mb-1">
                <span className={`text-[10px] font-bold uppercase tracking-wider ${msg.sender === "agent" ? "text-cyan-400" : "text-emerald-400"}`}>
                  {msg.sender === "agent" ? "MedHerence Agent" : patient?.first_name || "Patient"}
                </span>
                <span className="text-[9px] text-slate-600 font-mono">{msg.time}</span>
              </div>
              <div
                className={`p-3.5 rounded-2xl text-sm leading-relaxed max-w-[85%] ${
                  msg.sender === "agent"
                    ? "bg-[#131b2e] border border-cyan-500/20 text-slate-200 rounded-tl-sm shadow-md"
                    : "bg-teal-600/20 border border-teal-500/30 text-teal-100 rounded-tr-sm shadow-md"
                }`}
              >
                {msg.text}
              </div>
            </div>
          ))}

          {/* Current interim speech transcription */}
          {currentSpeech && (
            <div className="flex flex-col items-end animate-fade-in">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Speaking...</span>
              <div className="p-3.5 rounded-2xl text-sm italic bg-slate-900/60 border border-dashed border-emerald-500/40 text-emerald-300 rounded-tr-sm">
                "{currentSpeech}..."
              </div>
            </div>
          )}

          <div ref={transcriptEndRef} />
        </div>

        {/* Call Summary Card (Shown when call finishes) */}
        {callSummary && (
          <div className="p-5 bg-[#0e1628] border-t border-slate-800 space-y-3 animate-fade-in">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold uppercase tracking-wider text-cyan-400 flex items-center gap-1.5">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                Extracted Adherence Result
              </h4>
              <span
                className={`text-[11px] font-bold uppercase px-2.5 py-0.5 rounded-full ${
                  callSummary.status === "taken"
                    ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                    : "bg-red-500/15 text-red-400 border border-red-500/30"
                }`}
              >
                Status: {callSummary.status}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs bg-[#090d18] p-3 rounded-xl border border-slate-800">
              <div>
                <span className="text-slate-500">Missed Reason:</span>
                <p className="font-semibold text-slate-200 capitalize mt-0.5">{callSummary.missed_reason || "None"}</p>
              </div>
              <div>
                <span className="text-slate-500">Clinical Escalation:</span>
                <p className="font-semibold mt-0.5">
                  {isEscalated ? (
                    <span className="text-red-400 font-bold animate-pulse">FLAGGED (3+ Missed Doses)</span>
                  ) : (
                    <span className="text-slate-400">Normal</span>
                  )}
                </p>
              </div>
              {callSummary.notes && (
                <div className="col-span-2 pt-1 border-t border-slate-800/60">
                  <span className="text-slate-500">Clinical Notes:</span>
                  <p className="text-slate-300 mt-0.5">{callSummary.notes}</p>
                </div>
              )}
            </div>

            <div className="flex justify-between items-center pt-2">
              <Link
                href="/calls"
                onClick={onClose}
                className="text-xs text-cyan-400 hover:text-cyan-300 font-semibold inline-flex items-center gap-1 transition"
              >
                Audit in Call Logs
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                </svg>
              </Link>
              <button
                onClick={onClose}
                className="glow-btn-teal px-5 py-1.5 rounded-xl font-bold text-xs"
              >
                Done
              </button>
            </div>
          </div>
        )}

        {/* Bottom Call Controls & Keyboard Input Fallback */}
        {callState !== "completed" && (
          <div className="p-4 bg-[#0e1526] border-t border-slate-800/80 space-y-3">
            {/* Manual text input fallback */}
            <form onSubmit={handleManualSubmit} className="flex gap-2">
              <input
                type="text"
                placeholder="Reply with voice above, or type answer here (e.g. 'Yes, I took it' or 'No, I forgot')..."
                value={manualInput}
                onChange={(e) => setManualInput(e.target.value)}
                disabled={callState !== "active"}
                className="glass-input px-3.5 py-2 text-xs flex-1"
              />
              <button
                type="submit"
                disabled={!manualInput.trim() || callState !== "active"}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-xl border border-slate-700 disabled:opacity-40 transition"
              >
                Send
              </button>
            </form>

            {/* Bottom buttons: Mic Mute, Manual Listen trigger, Hangup */}
            <div className="flex items-center justify-between pt-1">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    if (listening) {
                      stopListening();
                    } else {
                      startListening();
                    }
                  }}
                  disabled={callState !== "active" || agentSpeaking}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition flex items-center gap-1.5 ${
                    listening
                      ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
                      : "bg-slate-800 text-slate-400 border-slate-700 hover:text-white"
                  }`}
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 100-6 3 3 0 000 6z" />
                  </svg>
                  {listening ? "Mic Active (Listening)" : "Tap to Speak"}
                </button>
              </div>

              {/* End Call Button */}
              <button
                type="button"
                onClick={endCall}
                disabled={callState === "ending"}
                className="px-5 py-2 rounded-xl bg-red-500/20 hover:bg-red-500/30 text-red-400 border border-red-500/30 font-bold text-xs transition flex items-center gap-1.5 shadow-lg shadow-red-500/5"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M16 8l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M5 3a2 2 0 00-2 2v1c0 8.284 6.716 15 15 15h1a2 2 0 002-2v-3.28a1 1 0 00-.684-.948l-4.493-1.498a1 1 0 00-1.21.502l-1.13 2.257a11.042 11.042 0 01-5.516-5.517l2.257-1.128a1 1 0 00.502-1.21L9.228 3.684A1 1 0 008.28 3H5z" />
                </svg>
                {callState === "ending" ? "Ending Call..." : "Hang Up"}
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
