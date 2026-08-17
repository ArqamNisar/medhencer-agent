import logging
import json
from groq import Groq
from backend import config

logger = logging.getLogger(__name__)

# Initialize Groq client lazily
_groq_client = None

def get_groq_client():
    global _groq_client
    if _groq_client is None:
        if not config.GROQ_API_KEY:
            logger.error("GROQ_API_KEY is not configured in the environment.")
            raise ValueError("GROQ_API_KEY is missing.")
        _groq_client = Groq(api_key=config.GROQ_API_KEY)
    return _groq_client

# In-memory store for ongoing conversation history
# Structure: { call_sid: { "patient_name": str, "medication": str, "history": [messages] } }
ACTIVE_CONVERSATIONS = {}

SYSTEM_PROMPT_TEMPLATE = """You are a warm, professional, and empathetic clinical virtual assistant calling on behalf of MedHerence.
Your goal is to find out if the patient has taken their scheduled medication today, and if not, understand the reason (e.g., forgot, ran out, side effects, refusal, etc.) to log it for their care team.

Patient Name: {patient_name}
Scheduled Medication: {medication}

Guidelines:
1. **Be extremely concise**: Speak in short, natural sentences (1-2 sentences maximum per turn) since this is a voice call. Long responses increase latency and feel unnatural.
2. **Empathetic & Professional**: Be caring and non-judgmental. If they forgot, offer reassurance. If they report side effects or refusal, show empathy and mention that you will note it for the doctor.
3. **Conversational Focus**: Stick strictly to asking about the medication and the reason. Once you get the status (taken vs. missed/refused) and the reason, wrap up the call politely.
4. **Identify Call Termination**: When you are ending the conversation (e.g., saying goodbye, wrapping up), make sure to include "goodbye", "take care", or "have a great day" in your final response.

Conversation Flow:
1. Greet the patient, state you are calling from MedHerence, and ask if they took their medication today.
2. If they took it, thank them and say goodbye.
3. If they did not take it, ask why (did they forget, run out, experience side effects, etc.).
4. Acknowledge their reason, tell them you've logged it, and say goodbye.
"""

def start_conversation(call_sid: str, patient_name: str, medication: str) -> str:
    """Initializes the conversation state and returns the first greeting message."""
    greeting = f"Hi {patient_name}, this is your MedHerence medication reminder. Have you taken your {medication} today?"
    
    system_prompt = SYSTEM_PROMPT_TEMPLATE.format(
        patient_name=patient_name,
        medication=medication
    )
    
    ACTIVE_CONVERSATIONS[call_sid] = {
        "patient_name": patient_name,
        "medication": medication,
        "history": [
            {"role": "system", "content": system_prompt},
            {"role": "assistant", "content": greeting}
        ]
    }
    logger.info(f"Started conversation session for Call SID: {call_sid}")
    return greeting

def get_next_response(call_sid: str, user_speech: str) -> tuple[str, bool]:
    """
    Appends patient speech to the history, runs Llama model via Groq,
    and returns (next_agent_response, should_end_call).
    """
    session = ACTIVE_CONVERSATIONS.get(call_sid)
    if not session:
        logger.warning(f"Session not found for Call SID: {call_sid}. Creating temporary session.")
        return "Hello. Please let me check your details.", True
        
    session["history"].append({"role": "user", "content": user_speech})
    
    try:
        client = get_groq_client()
        # Using Llama 3.1 8B for fast voice response latency
        completion = client.chat.completions.create(
            model="llama-3.1-8b-instant",
            messages=session["history"],
            max_tokens=100,
            temperature=0.3
        )
        
        response_text = completion.choices[0].message.content.strip()
        session["history"].append({"role": "assistant", "content": response_text})
        
        # Check if the AI wrapped up the call (contains goodbye trigger)
        lower_response = response_text.lower()
        should_end = any(word in lower_response for word in ["goodbye", "take care", "have a great day", "have a nice day", "bye"])
        
        return response_text, should_end
        
    except Exception as e:
        logger.error(f"Error calling Groq API: {e}")
        # Standard fallback response
        fallback = "I understand. I've noted that down. Have a wonderful day, goodbye!"
        session["history"].append({"role": "assistant", "content": fallback})
        return fallback, True

def extract_adherence_summary(call_sid: str) -> dict:
    """
    Analyzes the conversation history using Groq to extract structured compliance data.
    Returns: { "status": "taken"|"missed"|"refused", "missed_reason": "forgot"|"ran-out"|"side-effects"|"none"|"other", "notes": str }
    """
    session = ACTIVE_CONVERSATIONS.get(call_sid)
    if not session:
        return {"status": "missed", "missed_reason": "other", "notes": "No active conversation found to extract."}
        
    # Format the conversation transcript for the LLM
    transcript_turns = []
    for msg in session["history"]:
        if msg["role"] == "system":
            continue
        role_label = "Patient" if msg["role"] == "user" else "Agent"
        transcript_turns.append(f"{role_label}: {msg['content']}")
        
    transcript = "\n".join(transcript_turns)
    
    extraction_prompt = f"""
    Analyze the following phone transcript between a medical reminder agent and a patient.
    Extract the patient's medication adherence status, the reason for missing (if applicable), and any clinical notes.

    Medication scheduled: {session['medication']}
    Patient Name: {session['patient_name']}

    Transcript:
    {transcript}

    Provide your response as a valid JSON object matching this schema. Do not output markdown code blocks or extra text, just the raw JSON:
    {{
        "status": "taken" | "missed" | "refused",
        "missed_reason": "forgot" | "ran-out" | "side-effects" | "none" | "other",
        "notes": "Brief context on side effects, specific dates, or patient complaints."
    }}
    """
    
    try:
        client = get_groq_client()
        completion = client.chat.completions.create(
            model="llama-3.1-8b-instant",
            messages=[{"role": "user", "content": extraction_prompt}],
            max_tokens=150,
            temperature=0.0,
            response_format={"type": "json_object"}
        )
        
        result_json = completion.choices[0].message.content.strip()
        data = json.loads(result_json)
        
        # Clean up session
        if call_sid in ACTIVE_CONVERSATIONS:
            del ACTIVE_CONVERSATIONS[call_sid]
            
        return {
            "status": data.get("status", "missed"),
            "missed_reason": data.get("missed_reason", "other"),
            "notes": data.get("notes", ""),
            "full_transcript": transcript
        }
    except Exception as e:
        logger.error(f"Error during structured extraction: {e}")
        # Standard fallback if LLM fails
        return {
            "status": "missed",
            "missed_reason": "other",
            "notes": f"Adherence extraction failed. Error: {str(e)}",
            "full_transcript": transcript
        }
