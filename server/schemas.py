from pydantic import BaseModel, EmailStr
from typing import Optional, List
from uuid import UUID
from datetime import date, datetime
import uuid


class UserCreate(BaseModel):
    email: EmailStr
    password: str
    full_name: str


class UserOut(BaseModel):
    id: UUID
    email: EmailStr
    full_name: str
    role: str

    class Config:
        from_attributes = True


class PatientCreate(BaseModel):
    email: EmailStr
    password: str
    full_name: str
    date_of_birth: Optional[date] = None
    target_sounds: List[str] = []


class PatientOut(BaseModel):
    user_id: uuid.UUID  # The patient's User ID (for login)
    full_name: str
    target_sounds: List[str]
    clinician_id: uuid.UUID  # This is the proof!

    class Config:
        from_attributes = True


# --- NEW: Exercise Template Schemas (The Library) ---
class ExerciseTemplateCreate(BaseModel):
    title: str
    target_sound: str
    word_ids: List[int]  # The frontend will send the selected words' IDs here


class ExerciseTemplateOut(BaseModel):
    id: uuid.UUID
    title: str
    target_sound: str
    created_by_clinician_id: uuid.UUID
    created_at: datetime

    class Config:
        from_attributes = True


# --- NEW: Patient Assignment Schemas (Linking patient to template) ---
class PatientAssignmentCreate(BaseModel):
    patient_id: uuid.UUID
    template_id: uuid.UUID


class PatientAssignmentOut(BaseModel):
    id: uuid.UUID
    patient_id: uuid.UUID
    clinician_id: uuid.UUID
    template_id: uuid.UUID
    status: str
    created_at: datetime

    # Virtual fields fetched from the template via @property in models.py
    template_title: Optional[str] = None
    target_sound: Optional[str] = None

    class Config:
        from_attributes = True


# --- UPDATED: Recording Schema ---
class RecordingOut(BaseModel):
    id: uuid.UUID
    patient_id: uuid.UUID
    clinician_id: uuid.UUID
    assignment_id: uuid.UUID  # CHANGED: Replaced session_id with assignment_id
    target_sound: str
    file_path: str
    created_at: datetime
    is_reviewed: bool
    word_text: str

    class Config:
        from_attributes = True