from pydantic import BaseModel, EmailStr
from typing import Optional, List
from uuid import UUID
from datetime import date

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