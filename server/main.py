from fastapi import FastAPI
from database import engine
import models
import os
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

# Import routers
from routers import auth_routes, clinician_routes, patient_routes, recording_routes, practice_routes, appointment_routes

# Initialize DB
models.Base.metadata.create_all(bind=engine)

app = FastAPI(title="ClearSpeech API")

# Serve clinician-uploaded word audio prompts as public static files.
# Use __file__ so the path is always relative to this file (server/),
# regardless of the working directory uvicorn was launched from.
_word_audio_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "word_audio")
os.makedirs(_word_audio_dir, exist_ok=True)
app.mount("/word-audio", StaticFiles(directory=_word_audio_dir), name="word-audio")

#allows React sends requests to the server
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"], # React app's address
    allow_credentials=True,
    allow_methods=["*"], # Allow GET, POST, etc.
    allow_headers=["*"], # Allow all headers (like Authorization)
)
@app.get("/")
async def root():
    return {"message": "ClearSpeech API is running"}

# Connect the routers to the main app
app.include_router(auth_routes.router)
app.include_router(clinician_routes.router)
app.include_router(patient_routes.router)
app.include_router(recording_routes.router)
app.include_router(practice_routes.router)
app.include_router(appointment_routes.router)