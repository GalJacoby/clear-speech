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


class WordCreate(BaseModel):
    text: str
    practice_type: str = 'text'   # 'text' | 'voice'


class WordOut(BaseModel):
    id: int
    text: str
    phonetic_trans: str
    image_url: Optional[str] = None
    audio_url: Optional[str] = None
    practice_type: str = 'text'
    is_active: bool = True
    category: Optional[str] = None
    difficulty: Optional[int] = None

    class Config:
        from_attributes = True


class WordTypeUpdate(BaseModel):
    practice_type: str   # 'text' | 'sound'


class AudioGenerateRequest(BaseModel):
    word_id: int
    text: str


class PatientDetailOut(BaseModel):
    user_id: uuid.UUID
    full_name: str
    date_of_birth: Optional[date] = None
    target_sounds: List[str] = []
    parent_email: Optional[str] = None
    clinician_id: uuid.UUID
    next_appointment: Optional['AppointmentOut'] = None

    class Config:
        from_attributes = True


# --- Exercise Template Schemas (The Library) ---
class ExerciseTemplateCreate(BaseModel):
    title: str
    target_sound: str
    word_ids: List[int] = []
    practice_type: str = 'words'
    syllable_prompts: Optional[List[str]] = None
    repetition_count: Optional[int] = None


class ExerciseTemplateOut(BaseModel):
    id: uuid.UUID
    title: str
    target_sound: str
    created_by_clinician_id: uuid.UUID
    created_at: datetime
    practice_type: str = 'words'
    syllable_prompts: Optional[List[str]] = None
    repetition_count: Optional[int] = None

    class Config:
        from_attributes = True


class ExerciseTemplateUpdate(BaseModel):
    title: Optional[str] = None
    target_sound: Optional[str] = None
    word_ids: Optional[List[int]] = None


class ExerciseTemplateDetailOut(BaseModel):
    id: uuid.UUID
    title: str
    target_sound: str
    created_by_clinician_id: uuid.UUID
    created_at: datetime
    word_ids: List[int]
    practice_type: str = 'words'
    syllable_prompts: Optional[List[str]] = None
    repetition_count: Optional[int] = None

    class Config:
        from_attributes = True


# --- Patient Assignment Schemas (Linking patient to template) ---
class PatientAssignmentCreate(BaseModel):
    patient_id: uuid.UUID
    template_id: uuid.UUID


class AssignmentComplete(BaseModel):
    score: Optional[int] = None  # average AI grade for the session (0-100)


class AssignmentNotesUpdate(BaseModel):
    clinician_notes: Optional[str] = None


class PatientAssignmentOut(BaseModel):
    id: uuid.UUID
    patient_id: uuid.UUID
    clinician_id: uuid.UUID
    template_id: uuid.UUID
    status: str
    score: Optional[int] = None
    completed_at: Optional[datetime] = None
    is_archived: bool = False
    created_at: datetime
    clinician_notes: Optional[str] = None

    # Virtual fields fetched from the template via @property in models.py
    template_title: Optional[str] = None
    target_sound: Optional[str] = None
    practice_type: str = 'words'
    syllable_prompts: Optional[List[str]] = None
    repetition_count: Optional[int] = None

    class Config:
        from_attributes = True


# --- Appointment Schemas ---
class AppointmentCreate(BaseModel):
    patient_id: uuid.UUID
    title: str
    start_time: datetime
    end_time: datetime
    recurrence_type: str = "one-time"  # one-time | weekly | bi-weekly


class AppointmentOut(BaseModel):
    id: uuid.UUID
    clinician_id: uuid.UUID
    patient_id: uuid.UUID
    title: str
    start_time: datetime
    end_time: datetime
    recurrence_type: str
    recurrence_group_id: Optional[uuid.UUID] = None
    created_at: datetime
    patient_name: Optional[str] = None

    class Config:
        from_attributes = True


class RecordingOut(BaseModel):
    id: uuid.UUID
    patient_id: uuid.UUID
    clinician_id: uuid.UUID
    assignment_id: uuid.UUID
    target_sound: str
    file_path: str
    created_at: datetime
    is_reviewed: bool
    word_text: str
    score: Optional[int] = None
    feedback: Optional[str] = None
    marked_by_clinician: bool = False
    marked_by_patient: bool = False
    syllable_text: Optional[str] = None

    class Config:
        from_attributes = True


class RecordingFlagToggle(BaseModel):
    flag: str  # "clinician" or "patient"