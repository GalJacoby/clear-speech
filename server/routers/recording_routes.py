from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.orm import Session, joinedload
import shutil
import os
import uuid
import tempfile
import json
import numpy as np
import soundfile as sf
from fastapi.responses import FileResponse
from typing import List, Optional
from sqlalchemy import or_
from google import genai
from dotenv import load_dotenv
from transformers import pipeline as hf_pipeline

load_dotenv(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".env"))

# Local imports
import database
import models
import schemas
import auth

# ── Whisper ASR (loaded once, reused for every grading request) ──────────────
_asr_pipeline = None

def get_asr_pipeline():
    global _asr_pipeline
    if _asr_pipeline is None:
        print("[grading] Loading Whisper base model (first call – ~145 MB download)…")
        _asr_pipeline = hf_pipeline("automatic-speech-recognition", model="openai/whisper-base")
        print("[grading] Whisper model ready.")
    return _asr_pipeline


# ── Gemini grading ────────────────────────────────────────────────────────────
def grade_with_gemini(word: str, transcription: str, practice_type: str = 'words') -> dict:
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        raise HTTPException(
            status_code=503,
            detail="Grading unavailable: GEMINI_API_KEY is not configured. Add it to server/.env."
        )

    client = genai.Client(api_key=api_key)

    if practice_type == 'sounds':
        system_instruction = (
            "You are an expert speech-language pathology AI evaluating a child practicing isolated target sounds and syllables. "
            "The child was asked to say the target syllable exactly as presented. "
            "Analyze the phonetic difference between the target syllable and what the patient said (transcribed), and score using this generous pediatric rubric: "
            "90-100: Perfect phoneme match or minor spelling variations. "
            "65-89: Great attempt! A single sound swap or distortion occurred (e.g., saying 'shi' instead of 'si', or 'shu' instead of 'su'). Never give a 0 for a close phonetic attempt. "
            "30-64: Partial match where they got the vowel sound right but missed the target consonant phoneme completely (e.g., saying 'mi' instead of 'si'). "
            "0-29: The response is completely unrelated, blank, or a totally different word/sound structure. "
            "Return a JSON object with exactly two keys: "
            "\"score\" (integer based on the rubric above) and "
            "\"feedback\" (string, a single short, warm sentence explicitly identifying the sound swap constructively, "
            "e.g., 'So close! You made a soft \"sh\" sound instead of an \"s\" sound—let\\'s try to keep it sharp next time!')"
        )
        contents = f'Target syllable: "{word}"\nWhat the patient said (transcribed): "{transcription}"'
    else:
        system_instruction = (
            "You are an expert speech-language pathology AI evaluating a child's pronunciation. "
            "Compare the target word against the child's transcription to find specific sound errors (substitutions, omissions, or distortions). "
            "Return a JSON object with exactly two keys: "
            "\"score\" (integer 0-100, where 100 = perfect match) and "
            "\"feedback\" (string, a single short, warm sentence pinpointing exactly what sound went wrong, e.g., 'Great try! You made a \"sh\" sound instead of an \"s\" sound.')"
        )
        contents = f'Target word: "{word}"\nWhat the patient said (transcribed): "{transcription}"'

    response = client.models.generate_content(
        model="gemini-2.5-flash",
        contents=contents,
        config=genai.types.GenerateContentConfig(
            response_mime_type="application/json",
            temperature=0.2,
            system_instruction=system_instruction,
        ),
    )
    return json.loads(response.text)

router = APIRouter(
    prefix="/recordings",
    tags=["Recordings"]
)

# Ensure the uploads directory exists
UPLOAD_DIR = "uploads"
if not os.path.exists(UPLOAD_DIR):
    os.makedirs(UPLOAD_DIR)

@router.post("/upload", response_model=schemas.RecordingOut)
async def upload_audio(
        assignment_id: uuid.UUID = Form(...),
        word_id: Optional[int] = Form(None),
        syllable_text: Optional[str] = Form(None),
        file: UploadFile = File(...),
        score: Optional[int] = Form(None),
        feedback: Optional[str] = Form(None),
        db: Session = Depends(database.get_db),
        current_user: models.User = Depends(auth.get_current_user)
):
    """
    Uploads an audio file for a specific practice assignment.
    Only the patient assigned to the task can upload recordings.
    """
    # 1. Verify user is a patient
    if current_user.role != "patient":
        raise HTTPException(status_code=403, detail="Only patients can upload recordings.")

    # 2. Verify the practice assignment exists and belongs to this patient
    assignment = db.query(models.PatientAssignment).filter(
        models.PatientAssignment.id == assignment_id,
        models.PatientAssignment.patient_id == current_user.id
    ).first()

    if not assignment:
        raise HTTPException(status_code=404, detail="Practice assignment not found or not assigned to you.")

    # 3. Create a unique filename
    file_extension = os.path.splitext(file.filename)[1]
    unique_filename = f"{current_user.id}_{uuid.uuid4()}{file_extension}"
    file_path = os.path.join(UPLOAD_DIR, unique_filename)

    # 4. Save the file to local disk
    try:
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Could not save file: {str(e)}")
    finally:
        file.file.close()

    # 5. Create the database record; auto-flag for clinician review if score is poor
    new_recording = models.Recording(
        patient_id=current_user.id,
        clinician_id=assignment.clinician_id,
        assignment_id=assignment.id,
        target_sound=assignment.target_sound,
        file_path=file_path,
        word_id=word_id,
        syllable_text=syllable_text,
        is_reviewed=False,
        score=score,
        feedback=feedback,
        marked_by_clinician=(score is not None and score < 50),
        marked_by_patient=False,
    )

    db.add(new_recording)
    db.commit()
    db.refresh(new_recording)

    return new_recording

@router.get("/assignment/{assignment_id}", response_model=List[schemas.RecordingOut])
def get_recordings_by_assignment(
        assignment_id: uuid.UUID,
        db: Session = Depends(database.get_db),
        current_user: models.User = Depends(auth.get_current_user)
):
    """
    Returns all recordings associated with a specific assignment.
    Accessible by the assigned clinician or the patient themselves.
    """
    # 1. Fetch the assignment to check permissions
    assignment = db.query(models.PatientAssignment).filter(models.PatientAssignment.id == assignment_id).first()

    if not assignment:
        raise HTTPException(status_code=404, detail="Practice assignment not found.")

    # 2. Security Check: Only the involved clinician or patient can see the recordings
    if current_user.id != assignment.clinician_id and current_user.id != assignment.patient_id:
        raise HTTPException(status_code=403, detail="You do not have permission to view these recordings.")

    # Eager load the 'word' relationship to access .word_text efficiently
    recordings = db.query(models.Recording).options(joinedload(models.Recording.word)).filter(models.Recording.assignment_id == assignment_id).all()

    return recordings

@router.get("/play/{recording_id}")
def play_recording(
        recording_id: uuid.UUID,
        db: Session = Depends(database.get_db),
        current_user: models.User = Depends(auth.get_current_user)
):
    """
    Serves the actual audio file for playback.
    Verifies that the user has permission to hear this specific recording.
    """
    # 1. Fetch the recording record from DB
    recording = db.query(models.Recording).filter(models.Recording.id == recording_id).first()

    if not recording:
        raise HTTPException(status_code=404, detail="Recording not found.")

    # 2. Security Check: Only the assigned clinician or the patient can hear it
    if current_user.id != recording.clinician_id and current_user.id != recording.patient_id:
        raise HTTPException(status_code=403, detail="Permission denied.")

    # 3. Check if file actually exists on the disk
    if not os.path.exists(recording.file_path):
        raise HTTPException(status_code=404, detail="Audio file missing on server.")

    # 4. Return the file
    return FileResponse(path=recording.file_path, media_type="audio/ogg")


@router.post("/grade")
def grade_audio(
        file: UploadFile = File(...),
        word: str = Form(...),
        practice_type: str = Form('words'),
        current_user: models.User = Depends(auth.get_current_user)
):
    """
    Accepts a WAV audio file and a target word.
    Transcribes with Whisper, grades with Claude, returns {score, feedback}.
    Runs as a sync route so FastAPI executes it in a thread pool (keeps Whisper off the event loop).
    """
    # Save upload to a temp WAV file
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
        shutil.copyfileobj(file.file, tmp)
        tmp_path = tmp.name

    try:
        print(f"[grade] Transcribing audio for target word '{word}'…")
        # Load WAV with soundfile (no ffmpeg needed — handles PCM WAV natively)
        audio_array, sample_rate = sf.read(tmp_path, dtype="float32")
        if audio_array.ndim > 1:           # collapse stereo → mono
            audio_array = audio_array.mean(axis=1)
        pipe = get_asr_pipeline()
        transcription = pipe({"array": audio_array, "sampling_rate": sample_rate})["text"].strip()
        print(f"[grade] Transcription: '{transcription}'")

        result = grade_with_gemini(word, transcription, practice_type)
        print(f"[grade] Score: {result.get('score')} | Feedback: {result.get('feedback', '')[:60]}…")
        return result

    except HTTPException:
        raise
    except json.JSONDecodeError:
        return {"score": 50, "feedback": "The AI response could not be parsed. Please try recording again."}
    except Exception as e:
        print(f"[grade] Unexpected error: {type(e).__name__}: {e}")
        raise HTTPException(status_code=500, detail=f"Grading failed: {type(e).__name__}: {str(e)}")
    finally:
        if os.path.exists(tmp_path):
            os.unlink(tmp_path)


@router.get("/my-flagged", response_model=List[schemas.RecordingOut])
def get_my_flagged_recordings(
        db: Session = Depends(database.get_db),
        current_user: models.User = Depends(auth.get_current_user)
):
    """Returns the patient's own words they have starred for their next appointment."""
    if current_user.role != "patient":
        raise HTTPException(status_code=403, detail="Only patients can use this endpoint.")
    return (
        db.query(models.Recording)
        .options(joinedload(models.Recording.word))
        .filter(
            models.Recording.patient_id == current_user.id,
            models.Recording.marked_by_patient == True
        )
        .all()
    )


@router.patch("/{recording_id}/toggle-flag", response_model=schemas.RecordingOut)
def toggle_attention_flag(
        recording_id: uuid.UUID,
        data: schemas.RecordingFlagToggle,
        db: Session = Depends(database.get_db),
        current_user: models.User = Depends(auth.get_current_user)
):
    """Toggles marked_by_clinician or marked_by_patient on a recording."""
    recording = db.query(models.Recording).filter(
        models.Recording.id == str(recording_id)
    ).first()
    if not recording:
        raise HTTPException(status_code=404, detail="Recording not found.")

    if data.flag == "clinician":
        if current_user.role != "clinician" or current_user.id != recording.clinician_id:
            raise HTTPException(status_code=403, detail="Not authorized.")
        recording.marked_by_clinician = not recording.marked_by_clinician
    elif data.flag == "patient":
        if current_user.role != "patient" or current_user.id != recording.patient_id:
            raise HTTPException(status_code=403, detail="Not authorized.")
        recording.marked_by_patient = not recording.marked_by_patient
    else:
        raise HTTPException(status_code=400, detail="flag must be 'clinician' or 'patient'.")

    db.commit()
    db.refresh(recording)
    return recording


@router.get("/flagged/{patient_id}", response_model=List[schemas.RecordingOut])
def get_flagged_recordings(
        patient_id: uuid.UUID,
        db: Session = Depends(database.get_db),
        current_user: models.User = Depends(auth.get_current_user)
):
    """Returns all recordings flagged by either party for a given patient (clinician-only)."""
    if current_user.role != "clinician":
        raise HTTPException(status_code=403, detail="Only clinicians can view flagged words.")
    return (
        db.query(models.Recording)
        .options(joinedload(models.Recording.word))
        .filter(
            models.Recording.patient_id == patient_id,
            models.Recording.clinician_id == current_user.id,
            or_(
                models.Recording.marked_by_clinician == True,
                models.Recording.marked_by_patient == True,
            )
        )
        .all()
    )