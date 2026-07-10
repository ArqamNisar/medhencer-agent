-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Patients table (FHIR Patient Resource subset)
CREATE TABLE IF NOT EXISTS patients (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    fhir_id VARCHAR(64) UNIQUE,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    phone_number VARCHAR(20) NOT NULL UNIQUE,
    gender VARCHAR(20),
    birth_date DATE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_patients_phone ON patients(phone_number);

-- 2. Medication Requests table (FHIR MedicationRequest Resource subset)
CREATE TABLE IF NOT EXISTS medication_requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    fhir_id VARCHAR(64) UNIQUE,
    patient_id UUID REFERENCES patients(id) ON DELETE CASCADE,
    medication_name VARCHAR(250) NOT NULL,
    dosage_instruction TEXT NOT NULL,
    scheduled_time TIME NOT NULL, -- Daily time to prompt patient, e.g. '09:00:00'
    status VARCHAR(50) DEFAULT 'active', -- active, completed, stopped
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_medication_requests_patient ON medication_requests(patient_id);

-- 3. Call Logs table (FHIR Communication Resource subset)
CREATE TABLE IF NOT EXISTS call_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    patient_id UUID REFERENCES patients(id) ON DELETE CASCADE,
    twilio_call_sid VARCHAR(64) UNIQUE,
    status VARCHAR(50) NOT NULL, -- queued, in-progress, completed, failed, busy, no-answer
    direction VARCHAR(20) DEFAULT 'outbound',
    start_time TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    end_time TIMESTAMP WITH TIME ZONE,
    transcript TEXT DEFAULT '',
    recording_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_call_logs_patient ON call_logs(patient_id);
CREATE INDEX IF NOT EXISTS idx_call_logs_sid ON call_logs(twilio_call_sid);

-- 4. Adherence Records (FHIR MedicationAdministration Resource subset)
CREATE TABLE IF NOT EXISTS adherence_records (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    patient_id UUID REFERENCES patients(id) ON DELETE CASCADE,
    medication_request_id UUID REFERENCES medication_requests(id) ON DELETE CASCADE,
    call_log_id UUID REFERENCES call_logs(id) ON DELETE SET NULL,
    status VARCHAR(50) NOT NULL, -- taken, missed, refused
    missed_reason VARCHAR(250), -- forgot, ran-out, side-effects, none, etc.
    notes TEXT,
    flagged_for_escalation BOOLEAN DEFAULT FALSE,
    scheduled_date DATE NOT NULL,
    taken_time TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(medication_request_id, scheduled_date)
);

CREATE INDEX IF NOT EXISTS idx_adherence_patient ON adherence_records(patient_id);
CREATE INDEX IF NOT EXISTS idx_adherence_date ON adherence_records(scheduled_date);
CREATE INDEX IF NOT EXISTS idx_adherence_escalated ON adherence_records(flagged_for_escalation) WHERE flagged_for_escalation = TRUE;
