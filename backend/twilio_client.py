import logging
from twilio.rest import Client
from backend import config

logger = logging.getLogger(__name__)

# Lazy load Twilio client
_twilio_client = None

def get_twilio_client():
    global _twilio_client
    if _twilio_client is None:
        if not config.TWILIO_ACCOUNT_SID or not config.TWILIO_AUTH_TOKEN:
            logger.error("Twilio credentials are not configured in settings.")
            raise ValueError("Twilio credentials missing.")
        _twilio_client = Client(config.TWILIO_ACCOUNT_SID, config.TWILIO_AUTH_TOKEN)
    return _twilio_client

def trigger_outbound_call(to_phone: str, patient_id: str, medication_request_id: str) -> str:
    """
    Triggers an outbound call using Twilio.
    Returns the Twilio Call SID if successful, or None.
    """
    try:
        client = get_twilio_client()
        
        # Ensure we have a valid backend URL for the webhook
        backend_url = config.BACKEND_URL.rstrip('/')
        
        # Webhook URL Twilio will request when the call is answered
        twiml_url = f"{backend_url}/twilio/twiml?patient_id={patient_id}&medication_request_id={medication_request_id}"
        
        logger.info(f"Triggering outbound call to {to_phone} with TwiML Webhook: {twiml_url}")
        
        call = client.calls.create(
            to=to_phone,
            from_=config.TWILIO_PHONE_NUMBER,
            url=twiml_url
        )
        
        logger.info(f"Outbound call successfully initiated. Call SID: {call.sid}")
        return call.sid
        
    except Exception as e:
        logger.error(f"Failed to initiate Twilio outbound call to {to_phone}: {e}")
        return None
