from sqlalchemy import Column, String, ForeignKey, DateTime, Integer, Float, Boolean, ARRAY, Date
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.sql import func
import uuid
from database import Base

class User(Base):
    __tablename__ = "users"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email = Column(String, unique=True, index=True, nullable=False)
    password_hash = Column(String, nullable=False)
    role = Column(String, nullable=False)
    created_at = Column(DateTime, server_default=func.now())

class Patient(Base):
    __tablename__ = "patients"
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), primary_key=True)
    clinician_id = Column(UUID(as_uuid=True), ForeignKey("users.id"))
    full_name = Column(String, nullable=False)
    parent_email = Column(String)
    date_of_birth = Column(Date)
    target_sounds = Column(ARRAY(String))

class WordBank(Base):
    __tablename__ = "word_bank"
    id = Column(Integer, primary_key=True, index=True)
    text = Column(String, nullable=False)
    phonetic_trans = Column(String, nullable=False)
    image_url = Column(String)
    category = Column(String)
    difficulty = Column(Integer)

class Attempt(Base):
    __tablename__ = "attempts"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    patient_id = Column(UUID(as_uuid=True), ForeignKey("patients.user_id"))
    word_id = Column(Integer, ForeignKey("word_bank.id"))
    accuracy_score = Column(Float)
    phoneme_data = Column(JSONB)
    is_correct = Column(Boolean)
    created_at = Column(DateTime, server_default=func.now())

class Recording(Base):
    __tablename__ = "recordings"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    # Links to the User table (the patient who made the recording)
    patient_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)

    # Links to the User table (the clinician who manages this patient)
    clinician_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)

    # Information about the practice
    target_sound = Column(String, nullable=False)

    # Where the actual file is stored on the server's disk
    file_path = Column(String, nullable=False, unique=True)

    # Metadata
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Optional: You can add an 'is_reviewed' flag if the clinician checked it
    is_reviewed = Column(Boolean, default="false")