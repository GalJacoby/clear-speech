from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
import database
import models
import schemas
import auth

router = APIRouter(
    prefix="/practice",
    tags=["Practice Sessions"]
)


@router.post("/sessions", response_model=schemas.PracticeSessionOut)
def create_practice_session(
        session_data: schemas.PracticeSessionCreate,
        db: Session = Depends(database.get_db),
        current_user: models.User = Depends(auth.get_current_user)
):
    # 1. Verify user is a clinician
    if current_user.role != "clinician":
        raise HTTPException(status_code=403, detail="Only clinicians can create sessions.")

    # 2. Verify the patient exists and belongs to this clinician
    patient = db.query(models.Patient).filter(
        models.Patient.user_id == session_data.patient_id,
        models.Patient.clinician_id == current_user.id
    ).first()

    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found or not linked to you.")

    # 3. Create the session
    new_session = models.PracticeSession(
        patient_id=session_data.patient_id,
        clinician_id=current_user.id,
        target_sound=session_data.target_sound,
        title=session_data.title
    )

    db.add(new_session)
    db.commit()
    db.refresh(new_session)
    return new_session


@router.get("/patient/sessions", response_model=List[schemas.PracticeSessionOut])
def get_my_sessions(
        db: Session = Depends(database.get_db),
        current_user: models.User = Depends(auth.get_current_user)
):
    # Allows a patient to see their assigned tasks
    if current_user.role != "patient":
        raise HTTPException(status_code=403, detail="Only patients can view their assigned sessions.")

    sessions = db.query(models.PracticeSession).filter(
        models.PracticeSession.patient_id == current_user.id
    ).all()

    return sessions


@router.get("/words/{target_sound}")
def get_words_for_session(target_sound: str, db: Session = Depends(database.get_db)):
    # Currently fetching all words.
    # TODO: In the future, filter by target_sound (e.g., words containing 'ch')
    words = db.query(models.WordBank).all()

    if not words:
        raise HTTPException(status_code=404, detail="No words found")

    return words