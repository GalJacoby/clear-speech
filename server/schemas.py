from pydantic import BaseModel, EmailStr
from typing import Optional, List
from uuid import UUID
from datetime import date
import uuid

class UserCreate(BaseModel):
    email: EmailStr
    password: str

class UserOut(BaseModel):
    id: UUID
    email: EmailStr
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