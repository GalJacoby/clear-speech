from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from datetime import timedelta, datetime, timezone
import uuid as uuid_lib
import uuid

import database
import models
import schemas
import auth

router = APIRouter(
    prefix="/appointments",
    tags=["Appointments"]
)


@router.get("", response_model=List[schemas.AppointmentOut])
def get_appointments(
        db: Session = Depends(database.get_db),
        current_user: models.User = Depends(auth.get_current_user)
):
    if current_user.role != "clinician":
        raise HTTPException(status_code=403, detail="Only clinicians can view appointments.")
    return db.query(models.Appointment).filter(
        models.Appointment.clinician_id == current_user.id
    ).order_by(models.Appointment.start_time).all()


@router.get("/upcoming", response_model=List[schemas.AppointmentOut])
def get_patient_upcoming_appointments(
        db: Session = Depends(database.get_db),
        current_user: models.User = Depends(auth.get_current_user)
):
    """Returns the next upcoming appointments for the logged-in patient."""
    if current_user.role != "patient":
        raise HTTPException(status_code=403, detail="Only patients can use this endpoint.")
    return (
        db.query(models.Appointment)
        .filter(
            models.Appointment.patient_id == current_user.id,
            models.Appointment.start_time >= datetime.now(timezone.utc)
        )
        .order_by(models.Appointment.start_time.asc())
        .limit(5)
        .all()
    )


@router.post("", response_model=List[schemas.AppointmentOut])
def create_appointment(
        data: schemas.AppointmentCreate,
        db: Session = Depends(database.get_db),
        current_user: models.User = Depends(auth.get_current_user)
):
    if current_user.role != "clinician":
        raise HTTPException(status_code=403, detail="Only clinicians can create appointments.")

    if data.recurrence_type == "weekly":
        delta, count = timedelta(days=7), 12
    elif data.recurrence_type == "bi-weekly":
        delta, count = timedelta(days=14), 12
    else:
        delta, count = timedelta(0), 1

    group_id = uuid_lib.uuid4()
    created = []

    for i in range(count):
        offset = delta * i
        apt = models.Appointment(
            clinician_id=current_user.id,
            patient_id=data.patient_id,
            title=data.title,
            start_time=data.start_time + offset,
            end_time=data.end_time + offset,
            recurrence_type=data.recurrence_type,
            recurrence_group_id=group_id
        )
        db.add(apt)
        created.append(apt)

    db.commit()
    for apt in created:
        db.refresh(apt)
    return created


# Series delete must be defined before /{appointment_id} to avoid route shadowing
@router.delete("/series/{group_id}", status_code=204)
def delete_appointment_series(
        group_id: uuid.UUID,
        db: Session = Depends(database.get_db),
        current_user: models.User = Depends(auth.get_current_user)
):
    deleted = db.query(models.Appointment).filter(
        models.Appointment.recurrence_group_id == str(group_id),
        models.Appointment.clinician_id == current_user.id
    ).delete()
    if deleted == 0:
        raise HTTPException(status_code=404, detail="Series not found.")
    db.commit()


@router.delete("/{appointment_id}", status_code=204)
def delete_appointment(
        appointment_id: uuid.UUID,
        db: Session = Depends(database.get_db),
        current_user: models.User = Depends(auth.get_current_user)
):
    apt = db.query(models.Appointment).filter(
        models.Appointment.id == str(appointment_id),
        models.Appointment.clinician_id == current_user.id
    ).first()
    if not apt:
        raise HTTPException(status_code=404, detail="Appointment not found.")
    db.delete(apt)
    db.commit()
