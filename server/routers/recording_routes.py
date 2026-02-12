from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.orm import Session
import shutil
import os
import uuid
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
        target_sound: str = Form(...),
        file: UploadFile = File(...),
        db: Session = Depends(database.get_db),
        current_user: models.User = Depends(auth.get_current_user)
):
    """
    Uploads an audio file, saves it to the disk, and creates a database record.
    Only patients can upload recordings.
    """
    # 1. Check if the user is a patient
    if current_user.role != "patient":
        raise HTTPException(status_code=403, detail="Only patients can upload recordings.")

    # 2. Get the patient's profile to find their clinician_id
    patient_profile = db.query(models.Patient).filter(models.Patient.user_id == current_user.id).first()
    if not patient_profile:
        raise HTTPException(status_code=404, detail="Patient profile not found.")

    # 3. Create a unique filename to avoid overwriting
    # Format: uploads/patient_id_timestamp_filename.wav
    file_extension = os.path.splitext(file.filename)[1]
    unique_filename = f"{current_user.id}_{uuid.uuid4()}{file_extension}"
    file_path = os.path.join(UPLOAD_DIR, unique_filename)

    # 4. Save the file to the local disk
    try:
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Could not save file: {str(e)}")
    finally:
        file.file.close()

    # 5. Create the database record
    new_recording = models.Recording(
        patient_id=current_user.id,
        clinician_id=patient_profile.clinician_id,
        target_sound=target_sound,
        file_path=file_path,
        is_reviewed=False
    )

    db.add(new_recording)
    db.commit()
    db.refresh(new_recording)

    return new_recording