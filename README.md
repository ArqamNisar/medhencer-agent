<img width="1366" height="768" alt="Screenshot (90)" src="https://github.com/user-attachments/assets/c4b47f8e-9192-450f-b03f-c20207120c55" />
# 💊 Medhencer — AI Medication Adherence Agent

> An AI agent that calls your patients to make sure they've taken their medication — on time, every time.

Missed medications are one of the most preventable causes of poor health outcomes. Medhencer is an intelligent medication adherence agent that monitors patient medication schedules and places automated voice calls at specified times to check in and confirm whether the patient has taken their prescribed medicines.

---

## 🧠 How It Works

1. **Medication schedules are registered** for each patient, including the medication name, dosage, and reminder time.
2. **At the scheduled time**, the agent automatically places a phone call to the patient.
3. **During the call**, the AI speaks naturally with the patient, asking whether they've taken their medication.
4. **The response is recorded**, allowing caregivers or healthcare providers to track adherence.

---

## ✨ Features

### 📅 Scheduled Medication Reminders
Automatically triggers outbound voice calls at patient-specified times using a built-in task scheduler — no manual intervention required.

### 📞 AI-Powered Voice Calls
The agent places real phone calls using Twilio and conducts a natural spoken conversation with the patient to confirm medication intake.

### 🎙️ Speech-to-Text Understanding
Uses Deepgram to transcribe the patient's spoken response in real time, enabling the agent to accurately understand and log what the patient said.

### 🔊 Natural Text-to-Speech
Powered by Kokoro, the agent speaks in a natural, human-like voice — avoiding the robotic tone of traditional IVR systems.

### 🤖 Conversational AI Engine
Groq powers the underlying language model, enabling the agent to handle varied patient responses intelligently rather than relying on rigid voice menus.

### 📊 Dashboard
A dedicated dashboard interface gives healthcare providers or caregivers visibility into patient medication schedules and adherence status.

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| Backend API | FastAPI + Uvicorn |
| Voice Calls | Twilio |
| Speech-to-Text | Deepgram SDK |
| Text-to-Speech | Kokoro |
| LLM / Conversation | Groq |
| Task Scheduling | APScheduler |
| Database | PostgreSQL (psycopg2) |
| Real-time Communication | WebSockets |
| Audio Processing | NumPy, SoundFile |
| ML Runtime | PyTorch, ONNX Runtime |
| Environment Config | python-dotenv |

---

## 📁 Project Structure

medhencer-agent/
├── backend/ # FastAPI app, agent logic, scheduling, Twilio & Deepgram integration
├── dashboard/ # Frontend dashboard for managing patients and viewing adherence
├── scratch/ # Prototyping and experimental scripts
├── run.py # Application entry point
├── schema.sql # Database schema
├── requirements.txt
└── .gitignore

---

## 🚀 Getting Started

### Prerequisites
- Python 3.10+
- PostgreSQL database
- [Twilio account](https://www.twilio.com/) (for outbound calls)
- [Deepgram API key](https://deepgram.com/) (for speech-to-text)
- [Groq API key](https://console.groq.com/) (for LLM)

### Installation

```bash
# 1. Clone the repository
git clone https://github.com/ArqamNisar/medhencer-agent.git
cd medhencer-agent

# 2. Create and activate a virtual environment
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# 3. Install dependencies
pip install -r requirements.txt

# 4. Set up your environment variables
cp .env.example .env
# Fill in all required API keys and DB credentials

# 5. Initialize the database
psql -U your_user -d your_database -f schema.sql

# 6. Run the application
python run.py
```

---

## 🔑 Environment Variables

Create a `.env` file in the root directory with the following:

```env
GROQ_API_KEY=your_groq_api_key
TWILIO_ACCOUNT_SID=your_twilio_account_sid
TWILIO_AUTH_TOKEN=your_twilio_auth_token
TWILIO_PHONE_NUMBER=your_twilio_phone_number
DEEPGRAM_API_KEY=your_deepgram_api_key
DATABASE_URL=postgresql://user:password@localhost:5432/medhencer
```

---

## 🤝 Contributing

Contributions, issues, and feature requests are welcome. Feel free to open an issue or submit a pull request.

---

## 📄 License

This project is open source and available under the [MIT License](LICENSE).

---

## 👨‍💻 Author

**Arqam Nisar**
[LinkedIn](https://www.linkedin.com/in/arqamnisar) · [GitHub](https://github.com/ArqamNisar)
