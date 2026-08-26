import os
from dotenv import load_dotenv

# Find .env in the parent directory
base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
env_path = os.path.join(base_dir, ".env")
load_dotenv(dotenv_path=env_path)

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/medhencer")
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

PORT = int(os.getenv("PORT", "8000"))
HOST = os.getenv("HOST", "0.0.0.0")

# Check required keys for system alerts
def check_required_keys():
    missing = []
    if not GROQ_API_KEY: missing.append("GROQ_API_KEY")
    if not WHATSAPP_PHONE_NUMBER_ID: missing.append("WHATSAPP_PHONE_NUMBER_ID")
    if not WHATSAPP_ACCESS_TOKEN: missing.append("WHATSAPP_ACCESS_TOKEN")
    return missing
