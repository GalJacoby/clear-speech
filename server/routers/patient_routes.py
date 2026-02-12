from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

import database
import models
import schemas
import auth

router = APIRouter(
    prefix="/patient",  # Starts with /patient
    tags=["Patient Area"]
)


@router.get("/me", response_model=schemas.PatientOut)
def get_my_patient_profile(
        db: Session = Depends(database.get_db),
        current_user: models.User = Depends(auth.get_current_user)
):
    if current_user.role != "patient":
        raise HTTPException(status_code=403, detail="Only patients can access this profile.")

    patient_record = db.query(models.Patient).filter(models.Patient.user_id == current_user.id).first()

    if not patient_record:
        raise HTTPException(status_code=404, detail="Patient profile not found")

    return patient_record