import os
import psycopg2
from psycopg2 import pool
from psycopg2.extras import RealDictCursor
import logging
from backend import config

logger = logging.getLogger(__name__)

# Initialize connection pool
db_pool = None

def init_db_pool():
    global db_pool
    if db_pool is None:
        try:
            logger.info("Initializing PostgreSQL Connection Pool...")
            db_pool = psycopg2.pool.SimpleConnectionPool(
                1, 20, 
                config.DATABASE_URL
            )
            logger.info("PostgreSQL Connection Pool initialized successfully.")
        except Exception as e:
            logger.error(f"Error initializing connection pool: {e}")
            raise e

def get_connection():
    if db_pool is None:
        init_db_pool()
    return db_pool.getconn()

def release_connection(conn):
    if db_pool and conn:
        db_pool.putconn(conn)

def execute_query(query, params=None, fetch=False):
    """Execute a query and optionally return results as list of dicts."""
    conn = None
    cursor = None
    try:
        conn = get_connection()
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        cursor.execute(query, params or ())
        
        results = None
        if fetch:
            results = cursor.fetchall()
            
        conn.commit()
        return results
    except Exception as e:
        if conn:
            conn.rollback()
        logger.error(f"Database error executing query: {query}. Error: {e}")
        raise e
    finally:
        if cursor:
            cursor.close()
        if conn:
            release_connection(conn)

def initialize_database():
    """Reads schema.sql and creates tables if they do not exist."""
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    schema_path = os.path.join(base_dir, "schema.sql")
    
    if not os.path.exists(schema_path):
        logger.error(f"schema.sql not found at {schema_path}")
        return
        
    logger.info("Executing schema.sql...")
    with open(schema_path, 'r') as f:
        schema_sql = f.read()
        
    try:
        # We run this outside execute_query because it might contain multiple SQL commands
        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute(schema_sql)
        conn.commit()
        cursor.close()
        release_connection(conn)
        logger.info("Database schema initialized successfully.")
    except Exception as e:
        logger.error(f"Failed to initialize database: {e}")
        raise e

# --- Query Functions ---

# Patients
def get_all_patients():
    return execute_query("SELECT * FROM patients ORDER BY last_name, first_name", fetch=True)

def get_patient_by_phone(phone_number):
    # Standardize or format if needed, but exact matches for simplicity
    res = execute_query("SELECT * FROM patients WHERE phone_number = %s", (phone_number,), fetch=True)
    return res[0] if res else None

def get_patient_by_id(patient_id):
    res = execute_query("SELECT * FROM patients WHERE id = %s", (patient_id,), fetch=True)
    return res[0] if res else None

def create_patient(first_name, last_name, phone_number, gender=None, birth_date=None, fhir_id=None):
    if fhir_id == "" or (isinstance(fhir_id, str) and not fhir_id.strip()):
        fhir_id = None
    query = """
    INSERT INTO patients (first_name, last_name, phone_number, gender, birth_date, fhir_id)
    VALUES (%s, %s, %s, %s, %s, %s)
    RETURNING *;
    """
    res = execute_query(query, (first_name, last_name, phone_number, gender, birth_date, fhir_id), fetch=True)
    return res[0] if res else None

# Medications
def get_medication_requests_for_patient(patient_id):
    return execute_query(
        "SELECT * FROM medication_requests WHERE patient_id = %s AND status = 'active'", 
        (patient_id,), fetch=True
    )

def create_medication_request(patient_id, medication_name, dosage_instruction, scheduled_time, fhir_id=None):
    if fhir_id == "" or (isinstance(fhir_id, str) and not fhir_id.strip()):
        fhir_id = None
    query = """
    INSERT INTO medication_requests (patient_id, medication_name, dosage_instruction, scheduled_time, fhir_id)
    VALUES (%s, %s, %s, %s, %s)
    RETURNING *;
    """
    res = execute_query(query, (patient_id, medication_name, dosage_instruction, scheduled_time, fhir_id), fetch=True)
    return res[0] if res else None

def get_medication_request_by_id(medication_id):
    res = execute_query("SELECT * FROM medication_requests WHERE id = %s", (medication_id,), fetch=True)
    return res[0] if res else None

def update_medication_request(medication_id, medication_name=None, dosage_instruction=None, scheduled_time=None, status=None, fhir_id=None):
    updates = []
    params = []
    if medication_name is not None:
        updates.append("medication_name = %s")
        params.append(medication_name)
    if dosage_instruction is not None:
        updates.append("dosage_instruction = %s")
        params.append(dosage_instruction)
    if scheduled_time is not None:
        updates.append("scheduled_time = %s")
        params.append(scheduled_time)
    if status is not None:
        updates.append("status = %s")
        params.append(status)
    if fhir_id is not None:
        fhir_val = None if (fhir_id == "" or (isinstance(fhir_id, str) and not fhir_id.strip())) else fhir_id
        updates.append("fhir_id = %s")
        params.append(fhir_val)
        
    if not updates:
        return get_medication_request_by_id(medication_id)
        
    params.append(medication_id)
    query = f"""
    UPDATE medication_requests
    SET {", ".join(updates)}
    WHERE id = %s
    RETURNING *;
    """
    res = execute_query(query, tuple(params), fetch=True)
    return res[0] if res else None

def delete_medication_request(medication_id):
    query = "DELETE FROM medication_requests WHERE id = %s RETURNING *;"
    res = execute_query(query, (medication_id,), fetch=True)
    return res[0] if res else None

# Call Logs
def create_call_log(patient_id, twilio_call_sid, status="queued", direction="outbound"):
    query = """
    INSERT INTO call_logs (patient_id, twilio_call_sid, status, direction)
    VALUES (%s, %s, %s, %s)
    RETURNING *;
    """
    res = execute_query(query, (patient_id, twilio_call_sid, status, direction), fetch=True)
    return res[0] if res else None

def update_call_log(twilio_call_sid, status=None, transcript=None, end_time=None, recording_url=None):
    updates = []
    params = []
    if status is not None:
        updates.append("status = %s")
        params.append(status)
    if transcript is not None:
        updates.append("transcript = %s")
        params.append(transcript)
    if end_time is not None:
        updates.append("end_time = %s")
        params.append(end_time)
    if recording_url is not None:
        updates.append("recording_url = %s")
        params.append(recording_url)
        
    if not updates:
        return None
        
    params.append(twilio_call_sid)
    query = f"""
    UPDATE call_logs
    SET {", ".join(updates)}
    WHERE twilio_call_sid = %s
    RETURNING *;
    """
    res = execute_query(query, tuple(params), fetch=True)
    return res[0] if res else None

def get_call_log_by_sid(twilio_call_sid):
    res = execute_query("SELECT * FROM call_logs WHERE twilio_call_sid = %s", (twilio_call_sid,), fetch=True)
    return res[0] if res else None

def get_all_call_logs_with_patient():
    query = """
    SELECT cl.*, p.first_name, p.last_name, p.phone_number
    FROM call_logs cl
    JOIN patients p ON cl.patient_id = p.id
    ORDER BY cl.created_at DESC;
    """
    return execute_query(query, fetch=True)

# Adherence
def log_adherence_record(patient_id, medication_request_id, call_log_id, status, missed_reason=None, notes=None, scheduled_date=None, flagged_for_escalation=False):
    import datetime
    if scheduled_date is None:
        scheduled_date = datetime.date.today()
        
    taken_time = datetime.datetime.now() if status == 'taken' else None
    
    query = """
    INSERT INTO adherence_records 
    (patient_id, medication_request_id, call_log_id, status, missed_reason, notes, scheduled_date, flagged_for_escalation, taken_time)
    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
    ON CONFLICT (medication_request_id, scheduled_date) 
    DO UPDATE SET 
        status = EXCLUDED.status,
        missed_reason = EXCLUDED.missed_reason,
        notes = EXCLUDED.notes,
        call_log_id = EXCLUDED.call_log_id,
        flagged_for_escalation = EXCLUDED.flagged_for_escalation,
        taken_time = EXCLUDED.taken_time
    RETURNING *;
    """
    res = execute_query(query, (
        patient_id, medication_request_id, call_log_id, status, 
        missed_reason, notes, scheduled_date, flagged_for_escalation, taken_time
    ), fetch=True)
    return res[0] if res else None

def get_consecutive_missed_doses(patient_id, limit=3):
    """
    Returns the last 'limit' adherence records for a patient.
    Can be used to determine if they missed 3+ doses in a row.
    """
    query = """
    SELECT * FROM adherence_records
    WHERE patient_id = %s
    ORDER BY scheduled_date DESC
    LIMIT %s;
    """
    return execute_query(query, (patient_id, limit), fetch=True)

def check_and_set_escalation(patient_id):
    """
    Checks if patient missed 3 consecutive medication requests.
    If so, flags the latest one as escalation.
    """
    records = get_consecutive_missed_doses(patient_id, limit=3)
    if len(records) >= 3 and all(r['status'] in ('missed', 'refused') for r in records):
        latest_record_id = records[0]['id']
        execute_query(
            "UPDATE adherence_records SET flagged_for_escalation = TRUE WHERE id = %s",
            (latest_record_id,)
        )
        return True
    return False

# Dashboard Stats
def get_dashboard_summary():
    """
    Aggregates stats for Next.js dashboard:
    - Adherence rate (taken / total)
    - Total patients
    - Total calls
    - Active escalations count
    """
    total_patients = execute_query("SELECT COUNT(*) as count FROM patients", fetch=True)[0]['count']
    total_calls = execute_query("SELECT COUNT(*) as count FROM call_logs", fetch=True)[0]['count']
    
    adherence_stats = execute_query("""
        SELECT 
            COUNT(*) FILTER (WHERE status = 'taken') as taken_count,
            COUNT(*) as total_count
        FROM adherence_records;
    """, fetch=True)[0]
    
    taken = adherence_stats['taken_count'] or 0
    total = adherence_stats['total_count'] or 0
    adherence_rate = round((taken / total * 100), 1) if total > 0 else 100.0
    
    active_escalations = execute_query("""
        SELECT COUNT(*) as count 
        FROM adherence_records 
        WHERE flagged_for_escalation = TRUE;
    """, fetch=True)[0]['count']
    
    return {
        "total_patients": total_patients,
        "total_calls": total_calls,
        "adherence_rate": adherence_rate,
        "active_escalations": active_escalations
    }

def get_escalations_list():
    query = """
    SELECT ar.*, p.first_name, p.last_name, p.phone_number, mr.medication_name
    FROM adherence_records ar
    JOIN patients p ON ar.patient_id = p.id
    JOIN medication_requests mr ON ar.medication_request_id = mr.id
    WHERE ar.flagged_for_escalation = TRUE
    ORDER BY ar.created_at DESC;
    """
    return execute_query(query, fetch=True)
