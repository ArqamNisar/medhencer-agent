import os
import json
import base64
import logging
import asyncio
import uuid
from contextlib import asynccontextmanager
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Form, Request, HTTPException
from fastapi.responses import Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from backend import config, database, scheduler, brain, tts, twilio_client, whatsapp_client
from backend.deepgram_client import DeepgramStreamClient

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger(__name__)

# FastAPI Lifespan management
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup actions
    logger.info("Initializing application startup...")
    database.init_db_pool()
    database.initialize_database()
    scheduler.start_scheduler()
    yield
    # Shutdown actions
    logger.info("Shutting down application...")
    scheduler.shutdown_scheduler()

app = FastAPI(
    title="MedHerence Medical Adherence Agent API",
    lifespan=lifespan
)

# Enable CORS for the Next.js Dashboard
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # In production, restrict this to the dashboard URL
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Request/Response Models ---
class PatientCreate(BaseModel):
    first_name: str
    last_name: str
    phone_number: str
    gender: str = None
    birth_date: str = None # format YYYY-MM-DD
    fhir_id: str = None

class MedicationCreate(BaseModel):
    medication_name: str
    dosage_instruction: str
    scheduled_time: str # format HH:MM:SS
    fhir_id: str = None

class MedicationUpdate(BaseModel):
    medication_name: str = None
    dosage_instruction: str = None
    scheduled_time: str = None # format HH:MM:SS
    status: str = None
    fhir_id: str = None

class TriggerReminderRequest(BaseModel):
    medication_request_id: str

# --- Twilio Voice Webhook & WebSockets Media Stream ---

@app.post("/twilio/twiml")
@app.get("/twilio/twiml")
async def twilio_twiml(
    request: Request,
    patient_id: str,
    medication_request_id: str,
    CallSid: str = Form(None)
):
    """
    Called by Twilio when an outbound call is answered.
    Initializes the conversation state, creates/updates the call log,
    and returns TwiML instructions to connect the call to our WebSocket Media Stream.
    """
    logger.info(f"Twilio Webhook hit. Call SID: {CallSid}, Patient ID: {patient_id}")
    
    if not CallSid:
        # Fallback to query parameters if Form isn't populated (e.g. testing)
        params = dict(request.query_params)
        CallSid = params.get("CallSid", "test_call_sid")

    # Retrieve patient & medication details
    patient = database.get_patient_by_id(patient_id)
    if not patient:
        logger.error(f"Patient {patient_id} not found during TwiML generation.")
        twiml_error = (
            '<?xml version="1.0" encoding="UTF-8"?>'
            '<Response><Say>An error occurred. Patient not found. Goodbye.</Say><Hangup/></Response>'
        )
        return Response(content=twiml_error, media_type="application/xml")

    # Get medication details
    # We can fetch the specific request
    med_requests = database.get_medication_requests_for_patient(patient_id)
    medication_name = "your medication"
    for mr in med_requests:
        if str(mr['id']) == medication_request_id:
            medication_name = mr['medication_name']
            break

    # 1. Update/Create the Call Log in DB as 'in-progress'
    database.update_call_log(CallSid, status="in-progress")
    
    # 2. Initialize Groq Brain conversation and generate greeting
    patient_name = f"{patient['first_name']}"
    brain.start_conversation(CallSid, patient_name, medication_name)

    # 3. Build WebSockets stream URL
    # Replace http with ws or https with wss
    backend_url = config.BACKEND_URL
    if backend_url.startswith("http://"):
        ws_url = backend_url.replace("http://", "ws://")
    elif backend_url.startswith("https://"):
        ws_url = backend_url.replace("https://", "wss://")
    else:
        ws_url = "wss://" + backend_url

    ws_stream_url = f"{ws_url}/media-stream/{CallSid}?patient_id={patient_id}&med_id={medication_request_id}"
    logger.info(f"Exposing stream connection to: {ws_stream_url}")

    # Return TwiML to connect the voice stream
    twiml_response = f"""<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say>Connecting to MedHerence medication reminder assistant.</Say>
    <Connect>
        <Stream url="{ws_stream_url}" />
    </Connect>
</Response>"""

    return Response(content=twiml_response, media_type="application/xml")


@app.websocket("/media-stream/{call_sid}")
async def media_stream_endpoint(
    websocket: WebSocket,
    call_sid: str,
    patient_id: str,
    med_id: str
):
    """
    Accepts the bidirectional WebSocket from Twilio Media Streams.
    Pipes audio packets to Deepgram, handles transcribed responses,
    passes text to Groq LLM, generates speech via local Kokoro,
    and streams audio packets back to Twilio.
    """
    await websocket.accept()
    logger.info(f"WebSocket connected for Call SID: {call_sid}")
    
    stream_sid = None
    dg_client = None

    # Callback when Deepgram yields a finalized transcription
    async def on_transcript(transcript_text: str):
        nonlocal stream_sid
        if not stream_sid:
            logger.warning("Transcript received before Twilio stream SID was set.")
            return

        logger.info(f"[USER TRANSCRIBED] {transcript_text}")
        
        # Get response from Groq LLM brain
        response_text, should_end = brain.get_next_response(call_sid, transcript_text)
        logger.info(f"[AGENT RESPONSE] {response_text}")

        # Synthesize audio with Kokoro TTS
        audio_payload_base64 = tts.generate_tts_audio_base64(response_text)

        # Send the audio packet back to Twilio
        media_message = {
            "event": "media",
            "streamSid": stream_sid,
            "media": {
                "payload": audio_payload_base64
            }
        }
        await websocket.send_text(json.dumps(media_message))

        # If LLM triggered call termination
        if should_end:
            logger.info("LLM requested call termination. Hanging up.")
            # Send clear/stop message or close WebSocket
            # Wait 1.5 seconds for audio buffer to drain on Twilio before hanging up
            await asyncio.sleep(1.5)
            await websocket.close()

    try:
        # Initialize and connect Deepgram streaming STT
        dg_client = DeepgramStreamClient(on_transcript_callback=on_transcript)
        dg_connected = await dg_client.connect()
        
        if not dg_connected:
            logger.error("Could not connect to Deepgram. Closing WebSocket.")
            await websocket.close()
            return

        # Start conversation: Send the initial greeting TTS immediately
        session = brain.ACTIVE_CONVERSATIONS.get(call_sid)
        if session:
            # First assistant message (greeting) is already in session history
            greeting = session["history"][1]["content"]
            logger.info(f"Sending greeting TTS to patient: '{greeting}'")
            greeting_audio = tts.generate_tts_audio_base64(greeting)
            
            # We wait a moment for the call stream connection to fully stabilize before speaking
            await asyncio.sleep(1.0)
            
            # Send greeting to Twilio once streamSid is available (we'll look it up or send it as soon as we get it)

        # Loop to process incoming media frames from Twilio
        async for message in websocket.iter_text():
            packet = json.loads(message)
            event = packet.get("event")
            
            if event == "connected":
                logger.info(f"Twilio Media Stream connected. Protocol details: {packet}")
                
            elif event == "start":
                stream_sid = packet.get("streamSid")
                logger.info(f"Twilio Media Stream started. Stream SID: {stream_sid}")
                
                # Send the initial greeting TTS we generated
                if session and stream_sid:
                    media_message = {
                        "event": "media",
                        "streamSid": stream_sid,
                        "media": {
                            "payload": greeting_audio
                        }
                    }
                    await websocket.send_text(json.dumps(media_message))

            elif event == "media":
                # Raw audio chunk (G.711 mu-law, 8000Hz)
                media = packet.get("media", {})
                payload = media.get("payload")
                
                if payload and dg_client:
                    # Decode base64 packet and forward binary to Deepgram
                    audio_chunk = base64.b64decode(payload)
                    await dg_client.send_audio(audio_chunk)

            elif event == "stop":
                logger.info("Twilio Media Stream stopped.")
                break

    except WebSocketDisconnect:
        logger.info(f"WebSocket disconnected for Call SID: {call_sid}")
    except Exception as e:
        logger.error(f"Error in media stream loop: {e}")
    finally:
        # Close Deepgram stream client
        if dg_client:
            await dg_client.close()
            
        logger.info(f"Closing websocket and logging adherence details for {call_sid}")
        
        # 4. Extract conversation summary & log adherence to Postgres
        summary = brain.extract_adherence_summary(call_sid)
        
        # Update Call log in Database
        database.update_call_log(
            twilio_call_sid=call_sid,
            status="completed",
            transcript=summary.get("full_transcript", "")
        )
        
        # Log patient compliance record
        database.log_adherence_record(
            patient_id=patient_id,
            medication_request_id=med_id,
            call_log_id=None, # will link call details via patient_id or look up sid
            status=summary["status"],
            missed_reason=summary["missed_reason"],
            notes=summary["notes"]
        )
        
        # Check and flag active escalations (3 missed doses in a row)
        has_escalated = database.check_and_set_escalation(patient_id)
        if has_escalated:
            logger.warning(f"PATIENT ESCALATION TRIGGERED for patient {patient_id}!")


# --- In-Browser Live AI Voice Call WebSocket ---

@app.websocket("/ws/web-call")
async def web_call_websocket(
    websocket: WebSocket,
    patient_id: str,
    med_id: str
):
    """
    Direct in-browser AI Voice Call WebSocket.
    Allows talking live with the MedHerence AI Voice Agent directly
    through your computer microphone & speakers without requiring Twilio or phone lines.
    """
    await websocket.accept()
    call_sid = f"web_{uuid.uuid4().hex[:12]}"
    logger.info(f"In-Browser AI Voice Call connected. Session SID: {call_sid}, Patient: {patient_id}")
    
    # 1. Retrieve patient & medication details
    patient = database.get_patient_by_id(patient_id)
    if not patient:
        await websocket.send_json({"type": "error", "message": "Patient not found."})
        await websocket.close()
        return

    med_requests = database.get_medication_requests_for_patient(patient_id)
    medication_name = "your medication"
    for mr in med_requests:
        if str(mr['id']) == med_id:
            medication_name = mr['medication_name']
            break

    # 2. Create initial call log in database
    database.create_call_log(
        patient_id=patient_id,
        twilio_call_sid=call_sid,
        status="in-progress",
        direction="in-browser"
    )

    # 3. Start LLM Conversation session
    patient_name = patient['first_name']
    greeting_text = brain.start_conversation(call_sid, patient_name, medication_name)
    logger.info(f"Web Call greeting generated: '{greeting_text}'")

    # Synthesize initial greeting WAV audio
    greeting_wav = tts.generate_tts_wav_base64(greeting_text)

    # Send initial greeting to browser
    await websocket.send_json({
        "type": "agent_message",
        "call_sid": call_sid,
        "text": greeting_text,
        "audio_wav_base64": greeting_wav,
        "is_greeting": True,
        "should_end": False
    })

    try:
        while True:
            raw_msg = await websocket.receive_text()
            data = json.loads(raw_msg)
            event_type = data.get("type")

            if event_type == "user_message":
                user_text = data.get("text", "").strip()
                if not user_text:
                    continue

                logger.info(f"[IN-BROWSER CALL USER] {user_text}")
                
                # Get next response from Groq Brain
                response_text, should_end = brain.get_next_response(call_sid, user_text)
                logger.info(f"[IN-BROWSER CALL AGENT] {response_text} (should_end: {should_end})")

                # Synthesize TTS WAV
                wav_base64 = tts.generate_tts_wav_base64(response_text)

                await websocket.send_json({
                    "type": "agent_message",
                    "call_sid": call_sid,
                    "text": response_text,
                    "audio_wav_base64": wav_base64,
                    "is_greeting": False,
                    "should_end": should_end
                })

            elif event_type == "hangup":
                logger.info(f"User hung up in-browser call {call_sid}")
                break

    except WebSocketDisconnect:
        logger.info(f"In-browser call WebSocket disconnected for {call_sid}")
    except Exception as e:
        logger.error(f"Error in web call session: {e}")
    finally:
        logger.info(f"Wrapping up adherence logging for in-browser call {call_sid}")
        # Extract structured compliance data
        summary = brain.extract_adherence_summary(call_sid)
        
        # Update Call log in Database
        database.update_call_log(
            twilio_call_sid=call_sid,
            status="completed",
            transcript=summary.get("full_transcript", "")
        )
        
        # Log patient adherence record
        database.log_adherence_record(
            patient_id=patient_id,
            medication_request_id=med_id,
            call_log_id=None,
            status=summary["status"],
            missed_reason=summary["missed_reason"],
            notes=summary["notes"]
        )
        
        # Check and flag active escalations
        has_escalated = database.check_and_set_escalation(patient_id)
        if has_escalated:
            logger.warning(f"PATIENT ESCALATION TRIGGERED for patient {patient_id}!")

        # Notify browser of completion details
        try:
            await websocket.send_json({
                "type": "call_completed",
                "call_sid": call_sid,
                "summary": summary,
                "escalated": has_escalated
            })
            await websocket.close()
        except Exception:
            pass


# --- REST API Endpoints for Dashboard ---

@app.get("/api/patients")
def api_get_patients():
    return database.get_all_patients()

@app.post("/api/patients")
def api_create_patient(patient: PatientCreate):
    res = database.create_patient(
        first_name=patient.first_name,
        last_name=patient.last_name,
        phone_number=patient.phone_number,
        gender=patient.gender,
        birth_date=patient.birth_date,
        fhir_id=patient.fhir_id
    )
    if not res:
        raise HTTPException(status_code=400, detail="Failed to create patient.")
    return res

@app.get("/api/patients/{patient_id}/medications")
def api_get_patient_medications(patient_id: str):
    return database.get_medication_requests_for_patient(patient_id)

@app.post("/api/patients/{patient_id}/medications")
def api_create_patient_medication(patient_id: str, med: MedicationCreate):
    res = database.create_medication_request(
        patient_id=patient_id,
        medication_name=med.medication_name,
        dosage_instruction=med.dosage_instruction,
        scheduled_time=med.scheduled_time,
        fhir_id=med.fhir_id
    )
    if not res:
        raise HTTPException(status_code=400, detail="Failed to create medication.")
    return res

@app.put("/api/patients/{patient_id}/medications/{medication_id}")
@app.put("/api/medications/{medication_id}")
def api_update_patient_medication(medication_id: str, med: MedicationUpdate, patient_id: str = None):
    res = database.update_medication_request(
        medication_id=medication_id,
        medication_name=med.medication_name,
        dosage_instruction=med.dosage_instruction,
        scheduled_time=med.scheduled_time,
        status=med.status,
        fhir_id=med.fhir_id
    )
    if not res:
        raise HTTPException(status_code=404, detail="Medication record not found or update failed.")
    return res

@app.delete("/api/patients/{patient_id}/medications/{medication_id}")
@app.delete("/api/medications/{medication_id}")
def api_delete_patient_medication(medication_id: str, patient_id: str = None):
    res = database.delete_medication_request(medication_id)
    if not res:
        raise HTTPException(status_code=404, detail="Medication not found or delete failed.")
    return {"status": "deleted", "id": medication_id}

@app.get("/api/dashboard/summary")
def api_dashboard_summary():
    return database.get_dashboard_summary()

@app.get("/api/dashboard/escalations")
def api_dashboard_escalations():
    return database.get_escalations_list()

@app.get("/api/dashboard/calls")
def api_dashboard_calls():
    return database.get_all_call_logs_with_patient()

@app.post("/api/reminders/trigger")
def api_trigger_reminder(req: TriggerReminderRequest):
    call_sid, error_msg = scheduler.trigger_single_reminder_manually(req.medication_request_id)
    if not call_sid:
        raise HTTPException(status_code=400, detail=error_msg or "Failed to trigger outbound call.")
    return {"status": "queued", "call_sid": call_sid}


# --- WhatsApp Cloud API Webhook & Triggers ---

class WhatsAppTriggerRequest(BaseModel):
    medication_request_id: str

@app.get("/api/whatsapp/webhook")
def whatsapp_verify_webhook(request: Request):
    """
    Verification handshake endpoint for Meta WhatsApp Cloud API Webhook.
    """
    params = request.query_params
    mode = params.get("hub.mode")
    token = params.get("hub.verify_token")
    challenge = params.get("hub.challenge")

    _, _, verify_token = config.get_whatsapp_config()
    if mode == "subscribe" and token == verify_token:
        logger.info("WhatsApp webhook verified successfully.")
        return Response(content=challenge, media_type="text/plain")
    else:
        logger.warning(f"WhatsApp webhook verification failed. Received token: {token}")
        raise HTTPException(status_code=403, detail="Verification token mismatch.")

@app.post("/api/whatsapp/webhook")
async def whatsapp_incoming_webhook(request: Request):
    """
    Receives incoming WhatsApp button clicks and text replies from patients.
    """
    try:
        body = await request.json()
        logger.info(f"Incoming WhatsApp payload: {json.dumps(body)}")

        entries = body.get("entry", [])
        for entry in entries:
            changes = entry.get("changes", [])
            for change in changes:
                val = change.get("value", {})
                messages = val.get("messages", [])
                
                for msg in messages:
                    from_number = msg.get("from") # E.g. "14155552671"
                    msg_type = msg.get("type")
                    
                    # Look up patient by phone number
                    all_patients = database.get_all_patients()
                    patient = None
                    for p in all_patients:
                        clean_db_phone = "".join(c for c in p["phone_number"] if c.isdigit())
                        if clean_db_phone == from_number or from_number.endswith(clean_db_phone) or clean_db_phone.endswith(from_number):
                            patient = p
                            break

                    patient_id = patient["id"] if patient else None
                    patient_name = patient["first_name"] if patient else "Patient"

                    # 1. Interactive Button Reply
                    if msg_type == "interactive":
                        interactive_data = msg.get("interactive", {})
                        button_reply = interactive_data.get("button_reply", {})
                        btn_id = button_reply.get("id", "")
                        btn_title = button_reply.get("title", "")
                        logger.info(f"WhatsApp button clicked by {patient_name} ({from_number}): {btn_id} - '{btn_title}'")

                        parts = btn_id.split("_", 1)
                        action = parts[0]
                        med_id = parts[1] if len(parts) > 1 else None

                        if action == "taken":
                            if patient_id and med_id:
                                database.log_adherence_record(
                                    patient_id=patient_id,
                                    medication_request_id=med_id,
                                    call_log_id=None,
                                    status="taken",
                                    notes="Confirmed taken via WhatsApp button"
                                )
                            log_sid = f"wa_{uuid.uuid4().hex[:10]}"
                            if patient_id:
                                database.create_call_log(patient_id, log_sid, status="completed", direction="whatsapp")
                                database.update_call_log(log_sid, transcript=f"Patient clicked button: {btn_title}")

                            whatsapp_client.send_whatsapp_text(
                                to_phone=from_number,
                                text=f"Thank you, {patient_name}! Your dose has been recorded as taken. Stay healthy! 🌟"
                            )

                        elif action == "missed":
                            if patient_id and med_id:
                                database.log_adherence_record(
                                    patient_id=patient_id,
                                    medication_request_id=med_id,
                                    call_log_id=None,
                                    status="missed",
                                    missed_reason="forgot",
                                    notes="Reported missed dose via WhatsApp"
                                )
                                database.check_and_set_escalation(patient_id)

                            log_sid = f"wa_{uuid.uuid4().hex[:10]}"
                            if patient_id:
                                database.create_call_log(patient_id, log_sid, status="completed", direction="whatsapp")
                                database.update_call_log(log_sid, transcript=f"Patient clicked button: {btn_title}")

                            whatsapp_client.send_whatsapp_text(
                                to_phone=from_number,
                                text=f"Thank you for letting us know, {patient_name}. Did you forget, run out of medication, or have side effects? Please reply with a message so we can log it for your doctor."
                            )

                        elif action == "sideeffects":
                            if patient_id and med_id:
                                database.log_adherence_record(
                                    patient_id=patient_id,
                                    medication_request_id=med_id,
                                    call_log_id=None,
                                    status="refused",
                                    missed_reason="side-effects",
                                    notes="Reported side effects via WhatsApp"
                                )
                                database.check_and_set_escalation(patient_id)

                            log_sid = f"wa_{uuid.uuid4().hex[:10]}"
                            if patient_id:
                                database.create_call_log(patient_id, log_sid, status="completed", direction="whatsapp")
                                database.update_call_log(log_sid, transcript=f"Patient clicked button: {btn_title}")

                            whatsapp_client.send_whatsapp_text(
                                to_phone=from_number,
                                text=f"We have noted your side effect alert for your care team, {patient_name}. Please reply with details about any symptoms you are experiencing so we can document them."
                            )

                    # 2. Text Message Reply
                    elif msg_type == "text":
                        text_body = msg.get("text", {}).get("body", "").strip()
                        logger.info(f"WhatsApp text received from {patient_name}: '{text_body}'")

                        session_id = f"wa_{from_number}"
                        ai_response, _ = brain.get_next_response(session_id, text_body)
                        
                        whatsapp_client.send_whatsapp_text(to_phone=from_number, text=ai_response)

                        if patient_id:
                            summary = brain.extract_adherence_summary(session_id)
                            meds = database.get_medication_requests_for_patient(patient_id)
                            first_med_id = str(meds[0]["id"]) if meds else None

                            if first_med_id:
                                database.log_adherence_record(
                                    patient_id=patient_id,
                                    medication_request_id=first_med_id,
                                    call_log_id=None,
                                    status=summary["status"],
                                    missed_reason=summary["missed_reason"],
                                    notes=summary["notes"]
                                )
                                database.check_and_set_escalation(patient_id)

                            log_sid = f"wa_{uuid.uuid4().hex[:10]}"
                            database.create_call_log(patient_id, log_sid, status="completed", direction="whatsapp")
                            database.update_call_log(log_sid, transcript=f"Patient: {text_body}\nMedHerence Agent: {ai_response}")

        return {"status": "ok"}
    except Exception as e:
        logger.error(f"Error in WhatsApp webhook processing: {e}")
        return {"status": "error", "detail": str(e)}

@app.post("/api/whatsapp/trigger")
def api_trigger_whatsapp_reminder(req: WhatsAppTriggerRequest):
    """
    Triggers an interactive WhatsApp medication reminder for a specific medication schedule.
    """
    query = """
        SELECT mr.*, p.phone_number, p.first_name, p.last_name
        FROM medication_requests mr
        JOIN patients p ON mr.patient_id = p.id
        WHERE mr.id = %s;
    """
    res = database.execute_query(query, (req.medication_request_id,), fetch=True)
    if not res:
        raise HTTPException(status_code=404, detail="Medication request not found.")
        
    mr = res[0]
    patient_name = f"{mr['first_name']} {mr['last_name']}"
    patient_phone = mr['phone_number']
    med_name = mr['medication_name']
    dosage = mr['dosage_instruction']
    med_id = str(mr['id'])

    msg_id, err = whatsapp_client.send_whatsapp_interactive_reminder(
        to_phone=patient_phone,
        patient_name=mr['first_name'],
        medication_name=med_name,
        dosage=dosage,
        medication_request_id=med_id
    )

    if not msg_id:
        raise HTTPException(status_code=400, detail=err or "Failed to send WhatsApp message.")

    unique_log_sid = f"wa_{uuid.uuid4().hex[:16]}"
    database.create_call_log(
        patient_id=mr['patient_id'],
        twilio_call_sid=unique_log_sid,
        status="completed",
        direction="whatsapp"
    )
    database.update_call_log(
        unique_log_sid, 
        transcript=f"WhatsApp Interactive Reminder Dispatched for {med_name} ({dosage}). Message ID: {msg_id}"
    )

    return {
        "status": "sent",
        "message_id": msg_id,
        "recipient": patient_phone,
        "patient": patient_name
    }

