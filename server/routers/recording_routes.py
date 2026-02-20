from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.orm import Session, joinedload
import shutil
import os
import uuid
from fastapi.responses import FileResponse
from typing import List

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
        assignment_id: uuid.UUID = Form(...),  # CHANGED: Now expects assignment_id
        word_id: int = Form(...),
        file: UploadFile = File(...),
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

    # 5. Create the database record linked to the assignment
    new_recording = models.Recording(
        patient_id=current_user.id,
        clinician_id=assignment.clinician_id,  # Inherited from the assignment
        assignment_id=assignment.id,           # CHANGED: Using assignment.id
        target_sound=assignment.target_sound,  # Pulled automatically via the @property
        file_path=file_path,
        word_id=word_id,
        is_reviewed=False
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