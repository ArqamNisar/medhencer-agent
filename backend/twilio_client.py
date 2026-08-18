import logging
from twilio.rest import Client
from twilio.base.exceptions import TwilioRestException
from backend import config

logger = logging.getLogger(__name__)

# Lazy load Twilio client
_twilio_client = None

def get_twilio_client():
    global _twilio_client
    if _twilio_client is None:
        sid = config.TWILIO_ACCOUNT_SID or ""
        token = config.TWILIO_AUTH_TOKEN or ""
        
        if not sid or sid.startswith("your_") or not token or token.startswith("your_"):
            err = "Twilio credentials are not configured or are still set to placeholders in .env (TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN)."
            logger.error(err)
            raise ValueError(err)
            
        _twilio_client = Client(sid, token)
    return _twilio_client

def trigger_outbound_call(to_phone: str, patient_id: str, medication_request_id: str) -> tuple[str | None, str | None]:
    """
    Triggers an outbound call using Twilio.
    Returns: (call_sid, error_message)
    """
    # 1. Validate phone number and credentials
    from_phone = config.TWILIO_PHONE_NUMBER or ""
    if not from_phone or from_phone.startswith("+1234567890") or from_phone.startswith("your_"):
        err = "TWILIO_PHONE_NUMBER in .env is not configured with your active Twilio phone number."
        logger.error(err)
        return None, err

    if not to_phone or not to_phone.startswith("+"):
        err = f"Patient phone number '{to_phone}' is invalid. It must be in E.164 international format starting with '+' (e.g. +14155552671)."
        logger.error(err)
        return None, err

    try:
        client = get_twilio_client()
        
        # Ensure we have a valid backend URL for the webhook
        backend_url = (config.BACKEND_URL or "").rstrip('/')
        if not backend_url or "xxxx" in backend_url or "localhost" in backend_url:
            logger.warning(
                f"BACKEND_URL '{backend_url}' may not be reachable by Twilio. "
                "For real-time voice streaming, use a public HTTPS URL (e.g. from ngrok: https://your-id.ngrok-free.app)."
            )
        
        # Webhook URL Twilio will request when the call is answered
        twiml_url = f"{backend_url}/twilio/twiml?patient_id={patient_id}&medication_request_id={medication_request_id}"
        
        logger.info(f"Triggering outbound call to {to_phone} from {from_phone} with TwiML Webhook: {twiml_url}")
        
        call = client.calls.create(
            to=to_phone,
            from_=from_phone,
            url=twiml_url
        )
        
        logger.info(f"Outbound call successfully initiated. Call SID: {call.sid}")
        return call.sid, None
        
    except ValueError as ve:
        return None, str(ve)
    except TwilioRestException as tre:
        msg = f"Twilio API Error [{tre.code}]: {tre.msg}"
        logger.error(f"Failed to initiate Twilio outbound call to {to_phone}: {msg}")
        return None, msg
    except Exception as e:
        msg = f"Outbound call error: {str(e)}"
        logger.error(f"Failed to initiate Twilio outbound call to {to_phone}: {msg}")
        return None, msg
