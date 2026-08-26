import datetime
import logging
import uuid
from apscheduler.schedulers.background import BackgroundScheduler
from backend import database, whatsapp_client

logger = logging.getLogger(__name__)
scheduler = BackgroundScheduler()

def check_and_trigger_reminders():
    """
    Query database for active medication schedules matching the current time
    that have not yet been logged as taken/missed today, and send WhatsApp reminders.
    """
    logger.info("Scheduler running check for due medication reminders...")
    
    now = datetime.datetime.now()
    current_time_str = now.strftime("%H:%M") # e.g. "09:00"
    current_date = now.date()
    
    # Select active medication requests scheduled for this exact HH:MM
    # that do not have an adherence record logged for today.
    query = """
        SELECT mr.*, p.phone_number, p.first_name, p.last_name
        FROM medication_requests mr
        JOIN patients p ON mr.patient_id = p.id
        WHERE mr.status = 'active'
          AND to_char(mr.scheduled_time, 'HH24:MI') = %s
          AND NOT EXISTS (
              SELECT 1 FROM adherence_records ar
              WHERE ar.medication_request_id = mr.id
                AND ar.scheduled_date = %s
          );
    """
    
    try:
        due_reminders = database.execute_query(query, (current_time_str, current_date), fetch=True)
        if due_reminders:
            logger.info(f"Found {len(due_reminders)} reminders scheduled for {current_time_str}")
            
            for mr in due_reminders:
                patient_name = f"{mr['first_name']} {mr['last_name']}"
                patient_phone = mr['phone_number']
                patient_id = mr['patient_id']
                med_name = mr['medication_name']
                dosage = mr['dosage_instruction']
                mr_id = mr['id']
                
                logger.info(f"Sending WhatsApp reminder to {patient_name} ({patient_phone}) for medication: {med_name}")
                
                # Step 1: Send template message to open conversation window
                tmpl_id, tmpl_err = whatsapp_client.send_whatsapp_template(
                    to_phone=patient_phone,
                    template_name="hello_world"
                )
                if tmpl_id:
                    logger.info(f"Template sent to {patient_phone} (ID: {tmpl_id}). Waiting before sending reminder...")
                    import time
                    time.sleep(3)
                else:
                    logger.warning(f"Template failed for {patient_phone}: {tmpl_err}. Sending reminder anyway...")

                # Step 2: Send medication reminder as text message
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
                
                if msg_id:
                    # Log reminder in database
                    unique_log_sid = f"wa_{uuid.uuid4().hex[:16]}"
                    database.create_call_log(
                        patient_id=patient_id,
                        twilio_call_sid=unique_log_sid,
                        status="completed",
                        direction="whatsapp"
                    )
                    database.update_call_log(
                        unique_log_sid,
                        transcript=f"Scheduled WhatsApp Reminder for {med_name} ({dosage}). Message ID: {msg_id}"
                    )
                    logger.info(f"WhatsApp reminder sent to {patient_name}. Message ID: {msg_id}")
                else:
                    logger.error(f"Scheduled WhatsApp reminder failed for {patient_name}: {err}")
        else:
            logger.info(f"No reminders scheduled for {current_time_str}")
            
    except Exception as e:
        logger.error(f"Error checking or triggering reminders: {e}")

def trigger_single_reminder_manually(medication_request_id: str) -> tuple[str | None, str | None]:
    """
    Manually triggers a WhatsApp reminder for a specific medication schedule.
    Used for on-demand reminders from the Care Coordinator Dashboard.
    Returns: (message_id, error_message)
    """
    query = """
        SELECT mr.*, p.phone_number, p.first_name, p.last_name
        FROM medication_requests mr
        JOIN patients p ON mr.patient_id = p.id
        WHERE mr.id = %s;
    """
    
    try:
        res = database.execute_query(query, (medication_request_id,), fetch=True)
        if not res:
            err = f"Medication request ID '{medication_request_id}' not found in database."
            logger.warning(err)
            return None, err
            
        mr = res[0]
        patient_name = f"{mr['first_name']} {mr['last_name']}"
        patient_phone = mr['phone_number']
        med_name = mr['medication_name']
        dosage = mr['dosage_instruction']
        
        logger.info(f"Manual WhatsApp reminder trigger for {patient_name} ({patient_phone}) for {med_name}")
        
        # Send template to open conversation window
        tmpl_id, tmpl_err = whatsapp_client.send_whatsapp_template(
            to_phone=patient_phone,
            template_name="hello_world"
        )
        if tmpl_id:
            import time
            time.sleep(3)

        # Send the reminder text
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
        
        if msg_id:
            # Create a log entry
            unique_log_sid = f"wa_{uuid.uuid4().hex[:16]}"
            database.create_call_log(
                patient_id=mr['patient_id'],
                twilio_call_sid=unique_log_sid,
                status="completed",
                direction="whatsapp"
            )
            database.update_call_log(
                unique_log_sid,
                transcript=f"Manual WhatsApp Reminder for {med_name} ({dosage}). Message ID: {msg_id}"
            )
            return msg_id, None
        else:
            return None, err
            
    except Exception as e:
        err = f"Error triggering manual WhatsApp reminder: {str(e)}"
        logger.error(err)
        return None, err

def start_scheduler():
    """Starts the background scheduler loop."""
    if not scheduler.running:
        logger.info("Starting background scheduler...")
        # Check every 60 seconds
        scheduler.add_job(
            check_and_trigger_reminders,
            'interval',
            minutes=1,
            id='medication_reminder_job',
            replace_existing=True
        )
        scheduler.start()
        logger.info("Background scheduler started.")

def shutdown_scheduler():
    """Stops the background scheduler loop."""
    if scheduler.running:
        logger.info("Shutting down scheduler...")
        scheduler.shutdown()
        logger.info("Scheduler shut down successfully.")
