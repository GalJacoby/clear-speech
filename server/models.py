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
    full_name = Column(String, nullable=False)
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


class PracticeSession(Base):
    __tablename__ = "practice_sessions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    patient_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    clinician_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    target_sound = Column(String, nullable=False)
    title = Column(String, nullable=True)
    status = Column(String, default="pending")  # pending, completed, reviewed
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class Recording(Base):
    __tablename__ = "recordings"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    patient_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    clinician_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    session_id = Column(UUID(as_uuid=True), ForeignKey("practice_sessions.id"), nullable=False)
    target_sound = Column(String, nullable=False)
    file_path = Column(String, nullable=False, unique=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    is_reviewed = Column(Boolean, default=False)