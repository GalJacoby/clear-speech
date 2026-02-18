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
    user_id: uuid.UUID # The patient's User ID (for login)
    full_name: str
    target_sounds: List[str]
    clinician_id: uuid.UUID # This is the proof!

    class Config:
        from_attributes = True

# --- Practice Session Schemas ---
class PracticeSessionCreate(BaseModel):
    patient_id: uuid.UUID
    target_sound: str
    title: Optional[str] = None

class PracticeSessionOut(BaseModel):
    id: uuid.UUID
    patient_id: uuid.UUID
    clinician_id: uuid.UUID
    target_sound: str
    title: Optional[str]
    status: str
    created_at: datetime

    class Config:
        from_attributes = True



class RecordingOut(BaseModel):
    id: uuid.UUID
    patient_id: uuid.UUID
    clinician_id: uuid.UUID
    session_id: uuid.UUID
    target_sound: str
    file_path: str
    created_at: datetime
    is_reviewed: bool

    class Config:
        from_attributes = True