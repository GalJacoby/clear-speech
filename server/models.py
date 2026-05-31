from sqlalchemy import Column, String, ForeignKey, DateTime, Integer, Boolean, ARRAY, Date, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
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

class AiAudioCache(Base):
    """Persistent cache: normalized word text → gTTS-generated audio URL."""
    __tablename__ = "ai_audio_cache"
    word_text = Column(String, primary_key=True)  # lowercase + stripped
    audio_url = Column(String, nullable=False)


class WordBank(Base):
    __tablename__ = "word_bank"

    id = Column(Integer, primary_key=True, index=True)
    text = Column(String, nullable=False)
    phonetic_trans = Column(String, nullable=False)
    image_url = Column(String)
    audio_url = Column(String, nullable=True)
    practice_type = Column(String, default='text', server_default='text', nullable=False)
    is_active = Column(Boolean, default=True, server_default='true', nullable=False)  # soft-delete flag
    category = Column(String)
    difficulty = Column(Integer)


class TemplateWord(Base):
    """Junction table mapping templates to their selected words (Many-to-Many)"""
    __tablename__ = "template_words"

    template_id = Column(UUID(as_uuid=True), ForeignKey("exercise_templates.id", ondelete="CASCADE"), primary_key=True)
    word_id = Column(Integer, ForeignKey("word_bank.id", ondelete="CASCADE"), primary_key=True)


class ExerciseTemplate(Base):
    """The generic practice created by a clinician"""
    __tablename__ = "exercise_templates"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    title = Column(String, nullable=False)
    target_sound = Column(String, nullable=False)
    created_by_clinician_id = Column(UUID(as_uuid=True), ForeignKey("users.id"))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    is_archived = Column(Boolean, default=False, server_default='false', nullable=False)

    # Many-to-Many relationship: Fetches all WordBank objects linked to this template
    words = relationship("WordBank", secondary="template_words")


class PatientAssignment(Base):
    """Assigning a template to a specific patient"""
    __tablename__ = "patient_assignments"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    patient_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    clinician_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    template_id = Column(UUID(as_uuid=True), ForeignKey("exercise_templates.id"), nullable=False)
    status = Column(String, default="pending")  # pending, completed, reviewed
    score = Column(Integer, nullable=True)       # average AI grade for the session (0-100)
    completed_at = Column(DateTime(timezone=True), nullable=True)
    is_archived = Column(Boolean, default=False, server_default='false', nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationship to access the template details easily
    template = relationship("ExerciseTemplate")

    # Properties to expose template data directly to the assignment (helpful for APIs)
    @property
    def template_title(self):
        return self.template.title if self.template else None

    @property
    def target_sound(self):
        return self.template.target_sound if self.template else None


class Appointment(Base):
    """A scheduled session between a clinician and patient"""
    __tablename__ = "appointments"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    clinician_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    patient_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    title = Column(String, nullable=False)
    start_time = Column(DateTime(timezone=True), nullable=False)
    end_time = Column(DateTime(timezone=True), nullable=False)
    recurrence_type = Column(String, nullable=False, default="one-time")
    recurrence_group_id = Column(UUID(as_uuid=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    patient = relationship("User", foreign_keys=[patient_id])

    @property
    def patient_name(self):
        return self.patient.full_name if self.patient else None


class Recording(Base):
    """The patient's actual audio submissions"""
    __tablename__ = "recordings"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    patient_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    clinician_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)

    # CHANGED: Now points to the specific assignment
    assignment_id = Column(UUID(as_uuid=True), ForeignKey("patient_assignments.id"), nullable=False)

    target_sound = Column(String, nullable=False)
    file_path = Column(String, nullable=False, unique=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    is_reviewed = Column(Boolean, default=False)
    word_id = Column(Integer, ForeignKey("word_bank.id"), nullable=False)
    score = Column(Integer, nullable=True)            # AI score for this specific word (0-100)
    feedback = Column(String, nullable=True)          # AI phonetic feedback for this word
    marked_by_clinician = Column(Boolean, default=False, server_default='false', nullable=False)
    marked_by_patient   = Column(Boolean, default=False, server_default='false', nullable=False)

    # Relationships
    word = relationship("WordBank")
    assignment = relationship("PatientAssignment")

    # Property: Extracts just the text string for easier API response
    @property
    def word_text(self):
        return self.word.text if self.word else "Unknown"