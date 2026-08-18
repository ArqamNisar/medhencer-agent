import logging
import json
import urllib.request
import urllib.error
from backend import config

logger = logging.getLogger(__name__)

GRAPH_API_VERSION = "v20.0"

def clean_phone_number(phone: str) -> str:
    """Strips +, spaces, parentheses, and dashes for WhatsApp Cloud API format."""
    return "".join(c for c in phone if c.isdigit())

def send_whatsapp_interactive_reminder(
    to_phone: str,
    patient_name: str,
    medication_name: str,
    dosage: str,
    medication_request_id: str
) -> tuple[str | None, str | None]:
    """
    Sends an interactive WhatsApp medication reminder with quick reply buttons.
    Uses Python's standard library (urllib) for maximum reliability without external dependencies.
    Returns: (message_id, error_message)
    """
    phone_number_id = config.WHATSAPP_PHONE_NUMBER_ID
    access_token = config.WHATSAPP_ACCESS_TOKEN

    if not phone_number_id or not access_token or phone_number_id.startswith("your_") or access_token.startswith("your_"):
        err = "WhatsApp Cloud API credentials (WHATSAPP_PHONE_NUMBER_ID / WHATSAPP_ACCESS_TOKEN) are not configured in .env."
        logger.error(err)
        return None, err

    clean_to = clean_phone_number(to_phone)
    if not clean_to or len(clean_to) < 7:
        err = f"Invalid destination phone number: '{to_phone}'. Must include country code (e.g. +14155552671)."
        logger.error(err)
        return None, err

    url = f"https://graph.facebook.com/{GRAPH_API_VERSION}/{phone_number_id}/messages"
    headers = {
        "Authorization": f"Bearer {access_token}",
        "Content-Type": "application/json"
    }

    # Interactive Button Payload
    body_text = (
        f"Hi {patient_name}, this is your *MedHerence* clinical medication reminder.\n\n"
        f"💊 *Medication:* {medication_name}\n"
        f"📋 *Instructions:* {dosage}\n\n"
        f"Have you taken your scheduled dose today?"
    )

    payload = {
        "messaging_product": "whatsapp",
        "recipient_type": "individual",
        "to": clean_to,
        "type": "interactive",
        "interactive": {
            "type": "button",
            "header": {
                "type": "text",
                "text": "MedHerence Reminder"
            },
            "body": {
                "text": body_text
            },
            "footer": {
                "text": "Tap a button below or reply with a message"
            },
            "action": {
                "buttons": [
                    {
                        "type": "reply",
                        "reply": {
                            "id": f"taken_{medication_request_id}",
                            "title": "✅ I Took It"
                        }
                    },
                    {
                        "type": "reply",
                        "reply": {
                            "id": f"missed_{medication_request_id}",
                            "title": "❌ Missed Dose"
                        }
                    },
                    {
                        "type": "reply",
                        "reply": {
                            "id": f"sideeffects_{medication_request_id}",
                            "title": "⚠️ Side Effects"
                        }
                    }
                ]
            }
        }
    }

    try:
        logger.info(f"Sending interactive WhatsApp reminder to {clean_to} for {medication_name}...")
        json_data = json.dumps(payload).encode('utf-8')
        req = urllib.request.Request(url, data=json_data, headers=headers, method="POST")

        with urllib.request.urlopen(req, timeout=15) as response:
            resp_body = response.read().decode('utf-8')
            data = json.loads(resp_body)
            messages = data.get("messages", [])
            msg_id = messages[0].get("id") if messages else "sent"
            logger.info(f"WhatsApp reminder sent successfully. Message ID: {msg_id}")
            return msg_id, None

    except urllib.error.HTTPError as e:
        raw_err = e.read().decode('utf-8')
        logger.error(f"WhatsApp HTTP Error ({e.code}): {raw_err}")
        try:
            err_json = json.loads(raw_err)
            err_obj = err_json.get("error", {})
            err_msg = err_obj.get("message", raw_err)
            err_code = err_obj.get("code")
            
            # Helpful guidance for common Meta sandbox errors
            if err_code == 131030 or "recipient phone number not in allowed list" in err_msg.lower():
                return None, (
                    f"Recipient '{clean_to}' is not in your Meta WhatsApp Test Allowed list. "
                    "In Meta Developer Console -> WhatsApp -> API Setup, add your phone number to 'To' recipient list to authorize it."
                )
            elif err_code == 190 or "expired" in err_msg.lower():
                return None, "Meta WhatsApp Access Token has expired. Please copy a new Temporary Access Token from Meta Developer Console into .env."
            
            return None, f"Meta WhatsApp Error [{err_code}]: {err_msg}"
        except Exception:
            return None, f"Meta WhatsApp Error ({e.code}): {raw_err}"

    except Exception as e:
        logger.error(f"Failed to send WhatsApp reminder: {e}")
        return None, str(e)

def send_whatsapp_template(to_phone: str, template_name: str = "hello_world") -> tuple[str | None, str | None]:
    """
    Sends an approved Meta WhatsApp template message (e.g. 'hello_world').
    Template messages can initiate conversations at any time outside the 24-hour service window.
    """
    phone_number_id = config.WHATSAPP_PHONE_NUMBER_ID
    access_token = config.WHATSAPP_ACCESS_TOKEN

    if not phone_number_id or not access_token:
        return None, "WhatsApp credentials not configured in .env."

    clean_to = clean_phone_number(to_phone)
    url = f"https://graph.facebook.com/{GRAPH_API_VERSION}/{phone_number_id}/messages"
    headers = {
        "Authorization": f"Bearer {access_token}",
        "Content-Type": "application/json"
    }

    payload = {
        "messaging_product": "whatsapp",
        "to": clean_to,
        "type": "template",
        "template": {
            "name": template_name,
            "language": {
                "code": "en_US"
            }
        }
    }

    try:
        json_data = json.dumps(payload).encode('utf-8')
        req = urllib.request.Request(url, data=json_data, headers=headers, method="POST")

        with urllib.request.urlopen(req, timeout=15) as response:
            resp_body = response.read().decode('utf-8')
            data = json.loads(resp_body)
            messages = data.get("messages", [])
            return messages[0].get("id") if messages else "sent", None

    except urllib.error.HTTPError as e:
        raw_err = e.read().decode('utf-8')
        return None, f"WhatsApp Error ({e.code}): {raw_err}"
    except Exception as e:
        return None, str(e)

def send_whatsapp_text(to_phone: str, text: str) -> tuple[str | None, str | None]:
    """
    Sends a conversational text message to a WhatsApp user using standard urllib.
    """
    phone_number_id = config.WHATSAPP_PHONE_NUMBER_ID
    access_token = config.WHATSAPP_ACCESS_TOKEN

    if not phone_number_id or not access_token:
        return None, "WhatsApp credentials not configured in .env."

    clean_to = clean_phone_number(to_phone)
    url = f"https://graph.facebook.com/{GRAPH_API_VERSION}/{phone_number_id}/messages"
    headers = {
        "Authorization": f"Bearer {access_token}",
        "Content-Type": "application/json"
    }

    payload = {
        "messaging_product": "whatsapp",
        "recipient_type": "individual",
        "to": clean_to,
        "type": "text",
        "text": {
            "preview_url": False,
            "body": text
        }
    }

    try:
        json_data = json.dumps(payload).encode('utf-8')
        req = urllib.request.Request(url, data=json_data, headers=headers, method="POST")

        with urllib.request.urlopen(req, timeout=15) as response:
            resp_body = response.read().decode('utf-8')
            data = json.loads(resp_body)
            messages = data.get("messages", [])
            return messages[0].get("id") if messages else "sent", None

    except urllib.error.HTTPError as e:
        raw_err = e.read().decode('utf-8')
        return None, f"WhatsApp Error ({e.code}): {raw_err}"
    except Exception as e:
        return None, str(e)


