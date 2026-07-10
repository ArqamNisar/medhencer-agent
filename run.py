import uvicorn
from backend import config

if __name__ == "__main__":
    print(f"Starting MedHencer Backend Server on {config.HOST}:{config.PORT}...")
    uvicorn.run("backend.main:app", host=config.HOST, port=config.PORT, reload=True)
