from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.orm import Session
import shutil
import os
import uuid
from fastapi.responses import FileResponse
from datetime import datetime

# Local imports
import database
import models
import schemas
import auth

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
        session_id: uuid.UUID = Form(...),  # Now mandatory to link with a session
        file: UploadFile = File(...),
        db: Session = Depends(database.get_db),
        current_user: models.User = Depends(auth.get_current_user)
):
    """
    Uploads an audio file for a specific practice session.
    Only the patient assigned to the session can upload recordings.
    """
    # 1. Verify user is a patient
    if current_user.role != "patient":
        raise HTTPException(status_code=403, detail="Only patients can upload recordings.")

    # 2. Verify the practice session exists and belongs to this patient
    session = db.query(models.PracticeSession).filter(
        models.PracticeSession.id == session_id,
        models.PracticeSession.patient_id == current_user.id
    ).first()

    if not session:
        raise HTTPException(status_code=404, detail="Practice session not found or not assigned to you.")

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

    # 5. Create the database record linked to the session
    new_recording = models.Recording(
        patient_id=current_user.id,
        clinician_id=session.clinician_id,  # Inherited from the session
        session_id=session.id,
        target_sound=session.target_sound,  # Inherited from the session
        file_path=file_path,
        is_reviewed=False
    )

    db.add(new_recording)
    db.commit()
    db.refresh(new_recording)

    return new_recording


from typing import List


# ... existing imports ...

@router.get("/session/{session_id}", response_model=List[schemas.RecordingOut])
def get_recordings_by_session(
        session_id: uuid.UUID,
        db: Session = Depends(database.get_db),
        current_user: models.User = Depends(auth.get_current_user)
):
    """
    Returns all recordings associated with a specific practice session.
    Accessible by the assigned clinician or the patient themselves.
    """
    # 1. Fetch the session to check permissions
    session = db.query(models.PracticeSession).filter(models.PracticeSession.id == session_id).first()

    if not session:
        raise HTTPException(status_code=404, detail="Practice session not found.")

    # 2. Security Check: Only the involved clinician or patient can see the recordings
    if current_user.id != session.clinician_id and current_user.id != session.patient_id:
        raise HTTPException(status_code=403, detail="You do not have permission to view these recordings.")

    # 3. Fetch and return all recordings for this session
    recordings = db.query(models.Recording).filter(models.Recording.session_id == session_id).all()

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