import uuid
import os
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List

import database
import models
import schemas
import auth

router = APIRouter(
    prefix="/clinician",  # All routes here will start with /clinician
    tags=["Clinician Dashboard"]
)


@router.post("/patients", response_model=schemas.UserOut)
def create_patient(
        patient_data: schemas.PatientCreate,
        db: Session = Depends(database.get_db),
        current_user: models.User = Depends(auth.get_current_user)
):
    if current_user.role != "clinician":
        raise HTTPException(status_code=403, detail="Not authorized.")

    existing_user = db.query(models.User).filter(models.User.email == patient_data.email).first()
    if existing_user:
        raise HTTPException(status_code=400, detail="Patient email already registered")

    hashed_pwd = auth.hash_password(patient_data.password)
    new_patient_user = models.User(
        email=patient_data.email,
        password_hash=hashed_pwd,
        full_name=patient_data.full_name,
        role="patient"
    )
    db.add(new_patient_user)
    db.commit()
    db.refresh(new_patient_user)

    new_patient_profile = models.Patient(
        user_id=new_patient_user.id,
        clinician_id=current_user.id,
        full_name=patient_data.full_name,
        date_of_birth=patient_data.date_of_birth,
        target_sounds=patient_data.target_sounds
    )
    db.add(new_patient_profile)
    db.commit()

    return new_patient_user

@router.get("/my-patients", response_model=List[schemas.PatientOut])
def get_my_patients(
        db: Session = Depends(database.get_db),
        current_user: models.User = Depends(auth.get_current_user)
):
    if current_user.role != "clinician":
        raise HTTPException(status_code=403, detail="Not authorized.")

    my_patients = db.query(models.Patient).filter(models.Patient.clinician_id == current_user.id).all()
    return my_patients

@router.get("/patients/{patient_id}", response_model=schemas.PatientDetailOut)
def get_patient_detail(
        patient_id: uuid.UUID,
        db: Session = Depends(database.get_db),
        current_user: models.User = Depends(auth.get_current_user)
):
    if current_user.role != "clinician":
        raise HTTPException(status_code=403, detail="Not authorized.")
    patient = db.query(models.Patient).filter(
        models.Patient.user_id == patient_id,
        models.Patient.clinician_id == current_user.id
    ).first()
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found.")

    next_apt = db.query(models.Appointment).filter(
        models.Appointment.patient_id == patient_id,
        models.Appointment.clinician_id == current_user.id,
        models.Appointment.start_time >= datetime.now(timezone.utc)
    ).order_by(models.Appointment.start_time.asc()).first()

    return {
        "user_id": patient.user_id,
        "full_name": patient.full_name,
        "date_of_birth": patient.date_of_birth,
        "target_sounds": patient.target_sounds or [],
        "parent_email": patient.parent_email,
        "clinician_id": patient.clinician_id,
        "next_appointment": next_apt
    }


@router.get("/patients/{patient_id}/assignments", response_model=List[schemas.PatientAssignmentOut])
def get_patient_assignments(
        patient_id: uuid.UUID,
        db: Session = Depends(database.get_db),
        current_user: models.User = Depends(auth.get_current_user)
):
    """Fetches all exercise assignments for a specific patient."""
    # 1. Verify user is a clinician
    if current_user.role != "clinician":
        raise HTTPException(status_code=403, detail="Only clinicians can view patient assignments.")

    # 2. Verify the patient belongs to this clinician
    patient = db.query(models.Patient).filter(
        models.Patient.user_id == patient_id,
        models.Patient.clinician_id == current_user.id
    ).first()

    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found or not linked to you.")

    # 3. Return only non-archived assignments (active queue)
    assignments = db.query(models.PatientAssignment).filter(
        models.PatientAssignment.patient_id == patient_id,
        models.PatientAssignment.is_archived == False
    ).all()

    return assignments


@router.get("/patients/{patient_id}/archived-assignments", response_model=List[schemas.PatientAssignmentOut])
def get_archived_assignments(
        patient_id: uuid.UUID,
        db: Session = Depends(database.get_db),
        current_user: models.User = Depends(auth.get_current_user)
):
    """Returns all archived (reviewed) assignments for a patient."""
    if current_user.role != "clinician":
        raise HTTPException(status_code=403, detail="Only clinicians can view archived assignments.")
    patient = db.query(models.Patient).filter(
        models.Patient.user_id == patient_id,
        models.Patient.clinician_id == current_user.id
    ).first()
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found or not linked to you.")
    return (
        db.query(models.PatientAssignment)
        .filter(
            models.PatientAssignment.patient_id == patient_id,
            models.PatientAssignment.is_archived == True
        )
        .order_by(models.PatientAssignment.completed_at.desc())
        .all()
    )


@router.delete("/patients/{patient_id}", status_code=204)
def delete_patient(
        patient_id: uuid.UUID,
        db: Session = Depends(database.get_db),
        current_user: models.User = Depends(auth.get_current_user)
):
    """
    Permanently deletes a patient and all associated data.
    Deletion order respects FK constraints: recordings → assignments →
    appointments → patient profile → user account.
    """
    if current_user.role != "clinician":
        raise HTTPException(status_code=403, detail="Not authorized.")

    patient = db.query(models.Patient).filter(
        models.Patient.user_id == patient_id,
        models.Patient.clinician_id == current_user.id
    ).first()
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found or not linked to you.")

    # 1. Recordings — remove physical files from disk, then delete DB rows
    recordings = db.query(models.Recording).filter(
        models.Recording.patient_id == patient_id
    ).all()
    for rec in recordings:
        if rec.file_path and os.path.exists(rec.file_path):
            try:
                os.remove(rec.file_path)
            except OSError:
                pass
        db.delete(rec)
    db.flush()

    # 2. Practice assignments (includes archived)
    db.query(models.PatientAssignment).filter(
        models.PatientAssignment.patient_id == patient_id
    ).delete()

    # 3. Appointments
    db.query(models.Appointment).filter(
        models.Appointment.patient_id == patient_id
    ).delete()

    # 4. Patient profile
    db.delete(patient)
    db.flush()

    # 5. User account
    user = db.query(models.User).filter(models.User.id == patient_id).first()
    if user:
        db.delete(user)

    db.commit()