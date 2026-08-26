import json
import logging
import asyncio
import uuid
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request, HTTPException
from fastapi.responses import Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from backend import config, database, scheduler, brain, whatsapp_client

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

                    # 2. Text Message Reply (including numbered quick-replies from text-based reminders)
                    elif msg_type == "text":
                        text_body = msg.get("text", {}).get("body", "").strip()
                        text_lower = text_body.lower()
                        logger.info(f"WhatsApp text received from {patient_name}: '{text_body}'")

                        # Check for quick-reply keywords that match our text-based reminder options
                        quick_reply_action = None
                        if text_lower in ("1", "taken", "i took it", "yes", "took it"):
                            quick_reply_action = "taken"
                        elif text_lower in ("2", "missed", "missed dose", "no", "didn't take", "didnt take"):
                            quick_reply_action = "missed"
                        elif text_lower in ("3", "side effects", "side effect", "sideeffects", "side-effects"):
                            quick_reply_action = "sideeffects"

                        if quick_reply_action and patient_id:
                            # Handle as a quick-reply — same logic as interactive button clicks
                            meds = database.get_medication_requests_for_patient(patient_id)
                            first_med_id = str(meds[0]["id"]) if meds else None

                            if quick_reply_action == "taken":
                                if first_med_id:
                                    database.log_adherence_record(
                                        patient_id=patient_id,
                                        medication_request_id=first_med_id,
                                        call_log_id=None,
                                        status="taken",
                                        notes="Confirmed taken via WhatsApp text reply"
                                    )
                                whatsapp_client.send_whatsapp_text(
                                    to_phone=from_number,
                                    text=f"Thank you, {patient_name}! Your dose has been recorded as taken. Stay healthy! 🌟"
                                )
                            elif quick_reply_action == "missed":
                                if first_med_id:
                                    database.log_adherence_record(
                                        patient_id=patient_id,
                                        medication_request_id=first_med_id,
                                        call_log_id=None,
                                        status="missed",
                                        missed_reason="forgot",
                                        notes="Reported missed dose via WhatsApp text reply"
                                    )
                                    database.check_and_set_escalation(patient_id)
                                whatsapp_client.send_whatsapp_text(
                                    to_phone=from_number,
                                    text=f"Thank you for letting us know, {patient_name}. Did you forget, run out of medication, or have side effects? Please reply with a message so we can log it for your doctor."
                                )
                            elif quick_reply_action == "sideeffects":
                                if first_med_id:
                                    database.log_adherence_record(
                                        patient_id=patient_id,
                                        medication_request_id=first_med_id,
                                        call_log_id=None,
                                        status="refused",
                                        missed_reason="side-effects",
                                        notes="Reported side effects via WhatsApp text reply"
                                    )
                                    database.check_and_set_escalation(patient_id)
                                whatsapp_client.send_whatsapp_text(
                                    to_phone=from_number,
                                    text=f"We have noted your side effect alert for your care team, {patient_name}. Please reply with details about any symptoms you are experiencing so we can document them."
                                )

                            log_sid = f"wa_{uuid.uuid4().hex[:10]}"
                            database.create_call_log(patient_id, log_sid, status="completed", direction="whatsapp")
                            database.update_call_log(log_sid, transcript=f"Patient quick-reply: {text_body} (action: {quick_reply_action})")

                        else:
                            # Free-form text — route to AI brain
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
async def api_trigger_whatsapp_reminder(req: WhatsAppTriggerRequest):
    """
    Triggers an interactive WhatsApp medication reminder for a specific medication schedule.
    First sends a template message to open the 24-hour conversation window (required by Meta),
    then sends the interactive button reminder.
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

    # Step 1: Send a template message to open the 24-hour conversation window.
    # Meta requires an approved template to initiate conversations outside the window.
    logger.info(f"Opening WhatsApp conversation window for {patient_phone} via template message...")
    tmpl_id, tmpl_err = whatsapp_client.send_whatsapp_template(
        to_phone=patient_phone,
        template_name="hello_world"
    )
    if not tmpl_id:
        logger.warning(f"Template message failed: {tmpl_err}. Attempting text reminder anyway...")
    else:
        logger.info(f"Template message sent (ID: {tmpl_id}). Waiting before sending reminder text...")
        await asyncio.sleep(3)

    # Step 2: Send the medication reminder as a plain text message.
    # Interactive button messages are silently dropped in Meta's sandbox/test tier,
    # so we use a text message with numbered reply options instead.
    reminder_text = (
        f"💊 *MedHerence Medication Reminder*\n"
        f"━━━━━━━━━━━━━━━━━━━━\n\n"
        f"Hi {mr['first_name']}, it's time for your medication!\n\n"
        f"*Medication:* {med_name}\n"
        f"*Instructions:* {dosage}\n\n"
        f"Have you taken your scheduled dose?\n\n"
        f"Please reply with:\n"
        f"  *1* ✅ I took it\n"
        f"  *2* ❌ Missed dose\n"
        f"  *3* ⚠️ Side effects\n\n"
        f"Or reply with any message to talk to our AI assistant."
    )

    msg_id, err = whatsapp_client.send_whatsapp_text(
        to_phone=patient_phone,
        text=reminder_text
    )

    if not msg_id:
        raise HTTPException(status_code=400, detail=err or "Failed to send WhatsApp reminder.")

    unique_log_sid = f"wa_{uuid.uuid4().hex[:16]}"
    database.create_call_log(
        patient_id=mr['patient_id'],
        twilio_call_sid=unique_log_sid,
        status="completed",
        direction="whatsapp"
    )
    database.update_call_log(
        unique_log_sid, 
        transcript=f"WhatsApp Text Reminder Dispatched for {med_name} ({dosage}). Template ID: {tmpl_id}, Message ID: {msg_id}"
    )

    return {
        "status": "sent",
        "message_id": msg_id,
        "template_id": tmpl_id,
        "recipient": patient_phone,
        "patient": patient_name
    }

