from fastapi import FastAPI, Depends
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from database import engine, get_db
import models
import os
from fastapi.middleware.cors import CORSMiddleware

# Import routers
from routers import auth_routes, clinician_routes, patient_routes, recording_routes, practice_routes, appointment_routes

# Initialize DB
models.Base.metadata.create_all(bind=engine)

app = FastAPI(title="ClearSpeech API")

# Word audio directory — __file__-relative so it is consistent regardless of CWD
WORD_AUDIO_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "word_audio")
os.makedirs(WORD_AUDIO_DIR, exist_ok=True)
print(f"[main] WORD_AUDIO_DIR = {WORD_AUDIO_DIR}")


# CORS_ORIGINS: comma-separated allowlist for production (e.g. "https://app.example.com").
# Falls back to "*" so local dev is unaffected when the env var is unset.
_cors_origins_env = os.environ.get("CORS_ORIGINS", "*")
_cors_origins = ["*"] if _cors_origins_env == "*" else [o.strip() for o in _cors_origins_env.split(",")]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)
@app.get("/")
async def root():
    return {"message": "ClearSpeech API is running"}


@app.get("/word-audio/{filename}")
def serve_word_audio(filename: str, db: Session = Depends(get_db)):
    """
    Self-healing audio endpoint.
    1. If the file exists on disk → serve it directly.
    2. If the file is missing but the ai_audio_cache knows the word text →
       regenerate via gTTS, save the file, then serve it.
    3. If the cache has no record → 404.
    """
    dest = os.path.join(WORD_AUDIO_DIR, filename)

    # Fast path — file already exists
    if os.path.exists(dest):
        return FileResponse(dest, media_type="audio/mpeg")

    # Self-healing path — look up the word text from the cache
    audio_url  = f"/word-audio/{filename}"
    cache_row  = db.query(models.AiAudioCache).filter(
        models.AiAudioCache.audio_url == audio_url
    ).first()

    if not cache_row:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail=f"Audio file not found: {filename}")

    # Regenerate
    try:
        from gtts import gTTS
        print(f"[self-heal] Regenerating '{filename}' for word '{cache_row.word_text}'")
        tts = gTTS(text=cache_row.word_text, lang="en", slow=False)
        tts.save(dest)
        if not os.path.exists(dest):
            raise RuntimeError("gTTS save failed silently")
        print(f"[self-heal] ✓ Regenerated {filename}")
        return FileResponse(dest, media_type="audio/mpeg")
    except Exception as e:
        from fastapi import HTTPException
        print(f"[self-heal] ✗ Failed to regenerate {filename}: {e}")
        raise HTTPException(status_code=503, detail=f"Could not regenerate audio: {str(e)}")


# Connect the routers to the main app
app.include_router(auth_routes.router)
app.include_router(clinician_routes.router)
app.include_router(patient_routes.router)
app.include_router(recording_routes.router)
app.include_router(practice_routes.router)
app.include_router(appointment_routes.router)
