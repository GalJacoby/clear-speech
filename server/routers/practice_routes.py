from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.orm import Session
from typing import List
from datetime import datetime, timezone
import uuid
import os
import shutil
import httpx

# Resolve to server/word_audio/ using __file__ so it matches main.py's StaticFiles mount
# regardless of the CWD when uvicorn is started.
WORD_AUDIO_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "word_audio")
os.makedirs(WORD_AUDIO_DIR, exist_ok=True)
ALLOWED_AUDIO_EXTS = {".mp3", ".wav", ".m4a", ".ogg", ".webm"}


def _remove_old_audio(audio_url: str) -> None:
    """Delete the physical file backing an existing audio_url, if present."""
    if not audio_url:
        return
    filename = audio_url.rsplit("/", 1)[-1]
    path = os.path.join(WORD_AUDIO_DIR, filename)
    if os.path.exists(path):
        try:
            os.remove(path)
        except OSError:
            pass


def get_or_create_cached_audio(text: str, db: Session) -> str:
    """
    Returns the /word-audio URL for `text`.
    Checks the ai_audio_cache table first; runs gTTS and persists on a miss.
    Text is normalised (lowercase + strip) before the lookup.
    """
    key = text.lower().strip()
    cached = db.query(models.AiAudioCache).filter(
        models.AiAudioCache.word_text == key
    ).first()
    if cached:
        print(f"[audio_cache] HIT  '{key}'")
        return cached.audio_url

    print(f"[audio_cache] MISS '{key}' — generating…")
    from gtts import gTTS
    tts = gTTS(text=key, lang="en", slow=False)
    filename = f"{uuid.uuid4()}.mp3"
    tts.save(os.path.join(WORD_AUDIO_DIR, filename))
    audio_url = f"/word-audio/{filename}"

    db.add(models.AiAudioCache(word_text=key, audio_url=audio_url))
    db.commit()
    print(f"[audio_cache] Cached '{key}' → {filename}")
    return audio_url

import database
import models
import schemas
import auth

router = APIRouter(
    prefix="/practice",
    tags=["Practice Area"]
)

# ==========================================
# 1. WORD BANK (For Clinician to choose from)
# ==========================================

# Creates a custom word and auto-fetches an image from Wikipedia
@router.post("/words", response_model=schemas.WordOut)
def create_word(
        data: schemas.WordCreate,
        db: Session = Depends(database.get_db),
        current_user: models.User = Depends(auth.get_current_user)
):
    if current_user.role != "clinician":
        raise HTTPException(status_code=403, detail="Only clinicians can add words.")

    word_text = data.text.strip()
    if not word_text:
        raise HTTPException(status_code=400, detail="Word text cannot be empty.")

    # Return existing word if it already exists (case-insensitive)
    existing = db.query(models.WordBank).filter(
        models.WordBank.text.ilike(word_text)
    ).first()
    if existing:
        return existing

    # Attempt to fetch a representative image from Wikipedia
    image_url = None
    try:
        wiki_url = f"https://en.wikipedia.org/api/rest_v1/page/summary/{word_text}"
        print(f"[create_word] Fetching image for '{word_text}' → {wiki_url}")
        resp = httpx.get(
            wiki_url,
            timeout=5.0,
            follow_redirects=True,
            headers={"User-Agent": "ClearSpeech/1.0 (speech therapy education app; contact@clearspeech.app)"}
        )
        print(f"[create_word] Status: {resp.status_code}")
        if resp.status_code == 200:
            payload = resp.json()
            thumbnail = payload.get("thumbnail", {})
            image_url = thumbnail.get("source")
            print(f"[create_word] Thumbnail: {image_url}")
        else:
            print(f"[create_word] Non-200 body: {resp.text[:300]}")
    except Exception as e:
        print(f"[create_word] Exception: {e}")

    new_word = models.WordBank(
        text=word_text,
        phonetic_trans="",
        image_url=image_url,
        practice_type=data.practice_type,
    )
    db.add(new_word)
    db.flush()  # get the ID before generating audio

    # Auto-generate (or reuse cached) audio for sound-type words
    if data.practice_type == 'sound':
        try:
            new_word.audio_url = get_or_create_cached_audio(word_text, db)
        except Exception as e:
            print(f"[create_word] audio generation failed: {e}")  # non-fatal

    db.commit()
    db.refresh(new_word)
    return new_word


# Uploads or replaces the audio prompt for an existing word
@router.post("/words/{word_id}/audio")
async def upload_word_audio(
        word_id: int,
        file: UploadFile = File(...),
        db: Session = Depends(database.get_db),
        current_user: models.User = Depends(auth.get_current_user)
):
    if current_user.role != "clinician":
        raise HTTPException(status_code=403, detail="Only clinicians can upload audio prompts.")
    word = db.query(models.WordBank).filter(models.WordBank.id == word_id).first()
    if not word:
        raise HTTPException(status_code=404, detail="Word not found.")
    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in ALLOWED_AUDIO_EXTS:
        raise HTTPException(status_code=400, detail=f"Unsupported format. Allowed: {', '.join(ALLOWED_AUDIO_EXTS)}")
    # Delete old audio file if present
    _remove_old_audio(word.audio_url)
    unique_name = f"{uuid.uuid4()}{ext}"
    dest = os.path.join(WORD_AUDIO_DIR, unique_name)
    with open(dest, "wb") as buf:
        shutil.copyfileobj(file.file, buf)
    word.audio_url = f"/word-audio/{unique_name}"
    db.commit()
    return {"audio_url": word.audio_url, "word_id": word_id}


# Generates an AI (gTTS) pronunciation audio and saves it for a word
@router.post("/audio/generate")
def generate_word_audio(
        data: schemas.AudioGenerateRequest,
        db: Session = Depends(database.get_db),
        current_user: models.User = Depends(auth.get_current_user)
):
    if current_user.role != "clinician":
        raise HTTPException(status_code=403, detail="Only clinicians can generate audio prompts.")
    word = db.query(models.WordBank).filter(models.WordBank.id == data.word_id).first()
    if not word:
        raise HTTPException(status_code=404, detail="Word not found.")
    # Only delete the old file if it is NOT a shared cached entry
    if word.audio_url:
        is_cached = db.query(models.AiAudioCache).filter(
            models.AiAudioCache.audio_url == word.audio_url
        ).first() is not None
        if not is_cached:
            _remove_old_audio(word.audio_url)
    try:
        word.audio_url = get_or_create_cached_audio(data.text, db)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Audio generation failed: {str(e)}")
    db.commit()
    return {"audio_url": word.audio_url, "word_id": word.id}


# Updates the practice_type of a single word (clinician only)
@router.patch("/words/{word_id}/type")
def update_word_type(
        word_id: int,
        data: schemas.WordTypeUpdate,
        db: Session = Depends(database.get_db),
        current_user: models.User = Depends(auth.get_current_user)
):
    if current_user.role != "clinician":
        raise HTTPException(status_code=403, detail="Only clinicians can update word types.")
    if data.practice_type not in ("text", "sound"):
        raise HTTPException(status_code=400, detail="practice_type must be 'text' or 'sound'.")
    word = db.query(models.WordBank).filter(models.WordBank.id == word_id).first()
    if not word:
        raise HTTPException(status_code=404, detail="Word not found.")
    word.practice_type = data.practice_type
    db.commit()
    return {"word_id": word_id, "practice_type": data.practice_type}


# Fetches all words from the word bank to populate the clinician's selection screen.
@router.get("/words")
def get_all_words(db: Session = Depends(database.get_db)):
    words = db.query(models.WordBank).all()
    if not words:
        raise HTTPException(status_code=404, detail="No words found in the database.")
    return words


# ==========================================
# 2. TEMPLATE MANAGEMENT (The Library)
# ==========================================

# Creates a new generic practice template and links the chosen words to it
@router.post("/templates", response_model=schemas.ExerciseTemplateOut)
def create_exercise_template(
        template_data: schemas.ExerciseTemplateCreate,
        db: Session = Depends(database.get_db),
        current_user: models.User = Depends(auth.get_current_user)
):
    if current_user.role != "clinician":
        raise HTTPException(status_code=403, detail="Only clinicians can create templates.")

    # 1. Create the template shell
    new_template = models.ExerciseTemplate(
        title=template_data.title,
        target_sound=template_data.target_sound,
        created_by_clinician_id=current_user.id
    )
    db.add(new_template)
    db.flush()  # Flush to get the new_template.id before committing

    # 2. Create the links in the junction table (template_words)
    for w_id in template_data.word_ids:
        # Check if word exists (optional but good practice)
        word_exists = db.query(models.WordBank).filter(models.WordBank.id == w_id).first()
        if word_exists:
            template_link = models.TemplateWord(template_id=new_template.id, word_id=w_id)
            db.add(template_link)

    db.commit()
    db.refresh(new_template)
    return new_template


# Soft-deletes a template by setting is_archived = True
@router.delete("/templates/{template_id}", status_code=204)
def archive_template(
        template_id: uuid.UUID,
        db: Session = Depends(database.get_db),
        current_user: models.User = Depends(auth.get_current_user)
):
    if current_user.role != "clinician":
        raise HTTPException(status_code=403, detail="Only clinicians can delete templates.")
    template = db.query(models.ExerciseTemplate).filter(
        models.ExerciseTemplate.id == str(template_id),
        models.ExerciseTemplate.created_by_clinician_id == current_user.id,
        models.ExerciseTemplate.is_archived == False
    ).first()
    if not template:
        raise HTTPException(status_code=404, detail="Template not found.")
    # Remove all pending assignments for this template before archiving
    db.query(models.PatientAssignment).filter(
        models.PatientAssignment.template_id == str(template_id),
        models.PatientAssignment.status == "pending"
    ).delete()
    template.is_archived = True
    db.commit()


# Gets a single template with its word IDs (for the Edit page)
@router.get("/templates/{template_id}", response_model=schemas.ExerciseTemplateDetailOut)
def get_template_detail(
        template_id: uuid.UUID,
        db: Session = Depends(database.get_db),
        current_user: models.User = Depends(auth.get_current_user)
):
    template = db.query(models.ExerciseTemplate).filter(
        models.ExerciseTemplate.id == str(template_id),
        models.ExerciseTemplate.created_by_clinician_id == current_user.id,
        models.ExerciseTemplate.is_archived == False
    ).first()
    if not template:
        raise HTTPException(status_code=404, detail="Template not found.")
    word_ids = [tw.word_id for tw in db.query(models.TemplateWord).filter(
        models.TemplateWord.template_id == str(template_id)
    ).all()]
    return {
        "id": template.id,
        "title": template.title,
        "target_sound": template.target_sound,
        "created_by_clinician_id": template.created_by_clinician_id,
        "created_at": template.created_at,
        "word_ids": word_ids
    }


# Updates an existing template (title, target_sound, and/or words)
@router.put("/templates/{template_id}", response_model=schemas.ExerciseTemplateOut)
def update_template(
        template_id: uuid.UUID,
        template_data: schemas.ExerciseTemplateUpdate,
        db: Session = Depends(database.get_db),
        current_user: models.User = Depends(auth.get_current_user)
):
    if current_user.role != "clinician":
        raise HTTPException(status_code=403, detail="Only clinicians can edit templates.")
    template = db.query(models.ExerciseTemplate).filter(
        models.ExerciseTemplate.id == str(template_id),
        models.ExerciseTemplate.created_by_clinician_id == current_user.id,
        models.ExerciseTemplate.is_archived == False
    ).first()
    if not template:
        raise HTTPException(status_code=404, detail="Template not found or not owned by you.")
    if template_data.title is not None:
        template.title = template_data.title
    if template_data.target_sound is not None:
        template.target_sound = template_data.target_sound
    if template_data.word_ids is not None:
        db.query(models.TemplateWord).filter(
            models.TemplateWord.template_id == str(template_id)
        ).delete()
        for w_id in template_data.word_ids:
            word_exists = db.query(models.WordBank).filter(models.WordBank.id == w_id).first()
            if word_exists:
                db.add(models.TemplateWord(template_id=template.id, word_id=w_id))
    db.commit()
    db.refresh(template)
    return template


# Gets all templates created by this clinician
@router.get("/templates", response_model=List[schemas.ExerciseTemplateOut])
def get_clinician_templates(
        db: Session = Depends(database.get_db),
        current_user: models.User = Depends(auth.get_current_user)
):
    if current_user.role != "clinician":
        raise HTTPException(status_code=403, detail="Only clinicians can view their template library.")

    templates = db.query(models.ExerciseTemplate).filter(
        models.ExerciseTemplate.created_by_clinician_id == current_user.id,
        models.ExerciseTemplate.is_archived == False
    ).all()
    return templates


# ==========================================
# 3. PATIENT ASSIGNMENTS (Assigning to Patient)
# ==========================================

# Assigns an existing template to a specific patient
@router.post("/assignments", response_model=schemas.PatientAssignmentOut)
def assign_template_to_patient(
        assignment_data: schemas.PatientAssignmentCreate,
        db: Session = Depends(database.get_db),
        current_user: models.User = Depends(auth.get_current_user)
):
    if current_user.role != "clinician":
        raise HTTPException(status_code=403, detail="Only clinicians can assign practices.")

    # 1. Verify patient belongs to this clinician
    patient = db.query(models.Patient).filter(
        models.Patient.user_id == assignment_data.patient_id,
        models.Patient.clinician_id == current_user.id
    ).first()

    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found or not linked to you.")

    # 2. Verify template exists and is not archived
    template = db.query(models.ExerciseTemplate).filter(
        models.ExerciseTemplate.id == assignment_data.template_id,
        models.ExerciseTemplate.is_archived == False
    ).first()
    if not template:
        raise HTTPException(status_code=404, detail="Exercise template not found.")

    # 2.5 Prevent Duplicate Active Assignments
    # Using str() ensures exact matching regardless of how DB driver parses the UUID object
    existing_assignment = db.query(models.PatientAssignment).filter(
        models.PatientAssignment.patient_id == str(assignment_data.patient_id),
        models.PatientAssignment.template_id == str(assignment_data.template_id),
        models.PatientAssignment.status == "pending"  # Only block if it's currently pending
    ).first()

    if existing_assignment:
        return existing_assignment  # idempotent — already assigned, nothing to do

    # 3. Create Assignment
    new_assignment = models.PatientAssignment(
        patient_id=assignment_data.patient_id,
        clinician_id=current_user.id,
        template_id=assignment_data.template_id
    )

    db.add(new_assignment)
    db.commit()
    db.refresh(new_assignment)
    return new_assignment


# For Patients: see all tasks assigned to them
@router.get("/patient/assignments", response_model=List[schemas.PatientAssignmentOut])
def get_my_assignments(
        db: Session = Depends(database.get_db),
        current_user: models.User = Depends(auth.get_current_user)
):
    if current_user.role != "patient":
        raise HTTPException(status_code=403, detail="Only patients can view their assigned tasks.")

    assignments = db.query(models.PatientAssignment).filter(
        models.PatientAssignment.patient_id == current_user.id
    ).all()

    return assignments


# --- Mark assignment as completed ---
@router.patch("/assignments/{assignment_id}/complete", response_model=schemas.PatientAssignmentOut)
def complete_assignment(
        assignment_id: uuid.UUID,
        data: schemas.AssignmentComplete,
        db: Session = Depends(database.get_db),
        current_user: models.User = Depends(auth.get_current_user)
):
    """Marks a patient's assignment as completed and saves the session score."""
    # 1. Fetch the assignment
    assignment = db.query(models.PatientAssignment).filter(models.PatientAssignment.id == str(assignment_id)).first()

    if not assignment:
        raise HTTPException(status_code=404, detail="Assignment not found.")

    # 2. Security Check (Only the assigned patient can complete it)
    if current_user.id != assignment.patient_id:
        raise HTTPException(status_code=403, detail="Not authorized to complete this assignment.")

    # 3. Update status, score, and completion timestamp
    assignment.status = "completed"
    assignment.completed_at = datetime.now(timezone.utc)
    if data.score is not None:
        assignment.score = data.score
    db.commit()
    db.refresh(assignment)

    return assignment


# Removes a pending assignment (clinician only)
@router.delete("/assignments/{assignment_id}", status_code=204)
def unassign_template(
        assignment_id: uuid.UUID,
        db: Session = Depends(database.get_db),
        current_user: models.User = Depends(auth.get_current_user)
):
    if current_user.role != "clinician":
        raise HTTPException(status_code=403, detail="Only clinicians can unassign practices.")
    assignment = db.query(models.PatientAssignment).filter(
        models.PatientAssignment.id == str(assignment_id),
        models.PatientAssignment.clinician_id == current_user.id
    ).first()
    if not assignment:
        raise HTTPException(status_code=404, detail="Assignment not found.")
    if assignment.status != "pending":
        raise HTTPException(status_code=400, detail="Cannot remove a completed assignment.")
    db.delete(assignment)
    db.commit()


# ==========================================
# 4. PRACTICE ROOM DATA (Fetching words for an assignment)
# ==========================================

#     When a patient clicks on an assignment, this endpoint goes through the assignment,
#     finds the template, and returns the exact words selected by the clinician
@router.get("/assignments/{assignment_id}/words")
def get_words_for_assignment(
        assignment_id: uuid.UUID,
        db: Session = Depends(database.get_db),
        current_user: models.User = Depends(auth.get_current_user)
):
    # 1. Fetch the assignment
    assignment = db.query(models.PatientAssignment).filter(models.PatientAssignment.id == str(assignment_id)).first()

    if not assignment:
        raise HTTPException(status_code=404, detail="Assignment not found.")

    # 2. Security Check (Only the assigned patient or the assigning clinician can see this)
    if current_user.id != assignment.patient_id and current_user.id != assignment.clinician_id:
        raise HTTPException(status_code=403, detail="Not authorized to access this assignment.")

    # 3. Return the exact words linked to the template!
    words = assignment.template.words

    return words