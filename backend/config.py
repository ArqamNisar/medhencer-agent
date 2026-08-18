import os
from dotenv import load_dotenv

# Find .env in the parent directory
base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
env_path = os.path.join(base_dir, ".env")
load_dotenv(dotenv_path=env_path)

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/medhencer")
TWILIO_ACCOUNT_SID = os.getenv("TWILIO_ACCOUNT_SID")
TWILIO_AUTH_TOKEN = os.getenv("TWILIO_AUTH_TOKEN")
TWILIO_PHONE_NUMBER = os.getenv("TWILIO_PHONE_NUMBER")
DEEPGRAM_API_KEY = os.getenv("DEEPGRAM_API_KEY")
GROQ_API_KEY = os.getenv("GROQ_API_KEY")

def get_whatsapp_config():
    load_dotenv(dotenv_path=env_path, override=True)
    phone_id = os.getenv("WHATSAPP_PHONE_NUMBER_ID", "").strip().strip('"').strip("'")
    token = os.getenv("WHATSAPP_ACCESS_TOKEN", "").strip().strip('"').strip("'")
    verify_token = os.getenv("WHATSAPP_VERIFY_TOKEN", "medherence_verify_token").strip().strip('"').strip("'")
    return phone_id, token, verify_token

# WhatsApp Cloud API Settings (Meta)
WHATSAPP_PHONE_NUMBER_ID = os.getenv("WHATSAPP_PHONE_NUMBER_ID", "").strip().strip('"').strip("'")
WHATSAPP_ACCESS_TOKEN = os.getenv("WHATSAPP_ACCESS_TOKEN", "").strip().strip('"').strip("'")
WHATSAPP_VERIFY_TOKEN = os.getenv("WHATSAPP_VERIFY_TOKEN", "medherence_verify_token").strip().strip('"').strip("'")

BACKEND_URL = os.getenv("BACKEND_URL", "http://localhost:8000")
PORT = int(os.getenv("PORT", "8000"))
HOST = os.getenv("HOST", "0.0.0.0")

# Check required keys for system alerts
def check_required_keys():
    missing = []
    if not TWILIO_ACCOUNT_SID: missing.append("TWILIO_ACCOUNT_SID")
    if not TWILIO_AUTH_TOKEN: missing.append("TWILIO_AUTH_TOKEN")
    if not TWILIO_PHONE_NUMBER: missing.append("TWILIO_PHONE_NUMBER")
    if not DEEPGRAM_API_KEY: missing.append("DEEPGRAM_API_KEY")
    if not GROQ_API_KEY: missing.append("GROQ_API_KEY")
    return missing
