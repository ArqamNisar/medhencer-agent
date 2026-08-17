import datetime
import logging
from apscheduler.schedulers.background import BackgroundScheduler
from backend import database, twilio_client

logger = logging.getLogger(__name__)
scheduler = BackgroundScheduler()

def check_and_trigger_reminders():
    """
    Query database for active medication schedules matching the current time
    that have not yet been logged as taken/missed today, and trigger outbound calls.
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
                mr_id = mr['id']
                
                logger.info(f"Triggering outbound call for patient {patient_name} ({patient_phone}) for medication: {mr['medication_name']}")
                
                # Initiate Twilio outbound call
                call_sid = twilio_client.trigger_outbound_call(
                    to_phone=patient_phone,
                    patient_id=patient_id,
                    medication_request_id=mr_id
                )
                
                if call_sid:
                    # Log call in database as queued
                    database.create_call_log(
                        patient_id=patient_id,
                        twilio_call_sid=call_sid,
                        status="queued"
                    )
        else:
            logger.info(f"No reminders scheduled for {current_time_str}")
            
    except Exception as e:
        logger.error(f"Error checking or triggering reminders: {e}")

def trigger_single_reminder_manually(medication_request_id: str) -> str:
    """
    Manually triggers an outbound call for a specific medication schedule.
    Used for on-demand calls from the Care Coordinator Dashboard.
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
            logger.warning(f"Medication request ID {medication_request_id} not found.")
            return None
            
        mr = res[0]
        patient_name = f"{mr['first_name']} {mr['last_name']}"
        patient_phone = mr['phone_number']
        patient_id = mr['patient_id']
        
        logger.info(f"Manual trigger for patient {patient_name} ({patient_phone}) for {mr['medication_name']}")
        
        call_sid = twilio_client.trigger_outbound_call(
            to_phone=patient_phone,
            patient_id=patient_id,
            medication_request_id=str(mr['id'])
        )
        
        if call_sid:
            # Create a log entry for the call
            database.create_call_log(
                patient_id=patient_id,
                twilio_call_sid=call_sid,
                status="queued"
            )
            return call_sid
            
    except Exception as e:
        logger.error(f"Error triggering manual reminder: {e}")
        
    return None

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
