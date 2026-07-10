import sys
import os
import datetime

# Add the workspace root to Python path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backend import database, brain, tts, scheduler

def simulate_pipeline():
    print("=" * 60)
    print("MEDHENCER E2E PIPELINE SIMULATION")
    print("=" * 60)
    
    # 1. Initialize DB and Create tables if needed
    print("\n1. Initializing Database connection and schema...")
    try:
        database.init_db_pool()
        database.initialize_database()
    except Exception as e:
        print(f"[-] Database connection failed: {e}")
        print("Please ensure your local PostgreSQL is running and DATABASE_URL in .env is correct.")
        return

    # 2. Setup mock patient and medication
    print("\n2. Setting up mock patient and medication scheduled...")
    phone = "+15550199" # Mock number
    
    # Clean up existing to prevent key violation
    database.execute_query("DELETE FROM patients WHERE phone_number = %s", (phone,))
    
    patient = database.create_patient(
        first_name="Jane",
        last_name="Doe",
        phone_number=phone,
        gender="female",
        birth_date="1985-05-15",
        fhir_id="patient-jane-doe"
    )
    print(f"[+] Patient created: {patient['first_name']} {patient['last_name']} (ID: {patient['id']})")
    
    med = database.create_medication_request(
        patient_id=patient['id'],
        medication_name="Lisinopril 10mg",
        dosage_instruction="Take 1 tablet daily by mouth",
        scheduled_time="08:00:00",
        fhir_id="medrequest-lisinopril"
    )
    print(f"[+] Medication Scheduled: {med['medication_name']} at {med['scheduled_time']} (ID: {med['id']})")

    # 3. Simulate call flow
    print("\n3. Starting simulated phone call...")
    call_sid = "mock_call_sid_123456"
    
    # Create call log in DB
    database.create_call_log(patient['id'], call_sid, status="in-progress")
    
    # Initial greeting from brain
    greeting = brain.start_conversation(call_sid, patient['first_name'], med['medication_name'])
    print(f"\n[Agent]: {greeting}")
    
    # Verify Kokoro/Fallback TTS for greeting
    print("[TTS] Generating audio payload for greeting...")
    tts_payload = tts.generate_tts_audio_base64(greeting)
    print(f"[TTS] Generated base64 payload size: {len(tts_payload)} characters.")

    # Dialogue steps
    dialogue = [
        "No, I haven't taken it today.",
        "I just forgot because I was busy in the morning.",
        "Okay, I will take it now. Goodbye!"
    ]
    
    for turn in dialogue:
        print(f"\n[Patient]: {turn}")
        response, should_end = brain.get_next_response(call_sid, turn)
        print(f"[Agent]: {response}")
        
        # Test TTS generation for response
        tts.generate_tts_audio_base64(response)
        
        if should_end:
            print("\n[System]: Conversation reached goodbye terminal state.")
            break

    # 4. End Call & Extract Adherence
    print("\n4. Finalizing call logs and extracting adherence details...")
    summary = brain.extract_adherence_summary(call_sid)
    print(f"Extracted JSON Summary:\n{summary}")
    
    # Update Call Log
    database.update_call_log(
        twilio_call_sid=call_sid,
        status="completed",
        transcript=summary.get("full_transcript", "")
    )
    print("[+] Database: Call logs updated with transcript.")
    
    # Log Adherence record
    adherence = database.log_adherence_record(
        patient_id=patient['id'],
        medication_request_id=med['id'],
        call_log_id=None,
        status=summary['status'],
        missed_reason=summary['missed_reason'],
        notes=summary['notes']
    )
    print(f"[+] Database: Adherence recorded (Status: {adherence['status']}, Reason: {adherence['missed_reason']}, Escalated: {adherence['flagged_for_escalation']})")

    # 5. Check escalation system (simulate consecutive misses)
    print("\n5. Testing clinical escalation engine...")
    print("Simulating 2 more consecutive missed doses...")
    
    # Log 2 previous missed records for yesterday and day before
    yesterday = datetime.date.today() - datetime.timedelta(days=1)
    day_before = datetime.date.today() - datetime.timedelta(days=2)
    
    # Insert yesterday's miss
    database.execute_query(
        """
        INSERT INTO adherence_records (patient_id, medication_request_id, status, missed_reason, scheduled_date)
        VALUES (%s, %s, 'missed', 'forgot', %s)
        ON CONFLICT (medication_request_id, scheduled_date) DO NOTHING;
        """,
        (patient['id'], med['id'], yesterday)
    )
    # Insert day before's miss
    database.execute_query(
        """
        INSERT INTO adherence_records (patient_id, medication_request_id, status, missed_reason, scheduled_date)
        VALUES (%s, %s, 'missed', 'forgot', %s)
        ON CONFLICT (medication_request_id, scheduled_date) DO NOTHING;
        """,
        (patient['id'], med['id'], day_before)
    )
    
    # Trigger escalation check
    has_escalated = database.check_and_set_escalation(patient['id'])
    print(f"Escalation status check for {patient['first_name']}: {'[FLAGGED]' if has_escalated else '[OK]'}")
    
    # Fetch coordinator view stats
    summary_stats = database.get_dashboard_summary()
    print(f"\nDashboard Stats Aggregation: {summary_stats}")
    
    active_escalated = database.get_escalations_list()
    print(f"Active Escalations Queue: {len(active_escalated)} patient(s)")
    
    print("\n" + "=" * 60)
    print("SIMULATION COMPLETED SUCCESSFULLY!")
    print("=" * 60)

if __name__ == "__main__":
    simulate_pipeline()
