from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
import uuid

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

@router.get("/words")
def get_all_words(db: Session = Depends(database.get_db)):
    """Fetches all words from the word bank to populate the clinician's selection screen."""
    words = db.query(models.WordBank).all()
    if not words:
        raise HTTPException(status_code=404, detail="No words found in the database.")
    return words


# ==========================================
# 2. TEMPLATE MANAGEMENT (The Library)
# ==========================================

@router.post("/templates", response_model=schemas.ExerciseTemplateOut)
def create_exercise_template(
        template_data: schemas.ExerciseTemplateCreate,
        db: Session = Depends(database.get_db),
        current_user: models.User = Depends(auth.get_current_user)
):
    """Creates a new generic practice template and links the chosen words to it."""
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


@router.get("/templates", response_model=List[schemas.ExerciseTemplateOut])
def get_clinician_templates(
        db: Session = Depends(database.get_db),
        current_user: models.User = Depends(auth.get_current_user)
):
    """Gets all templates created by this clinician."""
    if current_user.role != "clinician":
        raise HTTPException(status_code=403, detail="Only clinicians can view their template library.")

    templates = db.query(models.ExerciseTemplate).filter(
        models.ExerciseTemplate.created_by_clinician_id == current_user.id
    ).all()
    return templates


# ==========================================
# 3. PATIENT ASSIGNMENTS (Assigning to Patient)
# ==========================================

@router.post("/assignments", response_model=schemas.PatientAssignmentOut)
def assign_template_to_patient(
        assignment_data: schemas.PatientAssignmentCreate,
        db: Session = Depends(database.get_db),
        current_user: models.User = Depends(auth.get_current_user)
):
    """Assigns an existing template to a specific patient."""
    if current_user.role != "clinician":
        raise HTTPException(status_code=403, detail="Only clinicians can assign practices.")

    # 1. Verify patient belongs to this clinician
    patient = db.query(models.Patient).filter(
        models.Patient.user_id == assignment_data.patient_id,
        models.Patient.clinician_id == current_user.id
    ).first()

    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found or not linked to you.")

    # 2. Verify template exists
    template = db.query(models.ExerciseTemplate).filter(
        models.ExerciseTemplate.id == assignment_data.template_id).first()
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
        raise HTTPException(
            status_code=400,
            detail="This practice is already assigned and waiting for the patient."
        )

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


@router.get("/patient/assignments", response_model=List[schemas.PatientAssignmentOut])
def get_my_assignments(
        db: Session = Depends(database.get_db),
        current_user: models.User = Depends(auth.get_current_user)
):
    """For Patients: see all tasks assigned to them."""
    if current_user.role != "patient":
        raise HTTPException(status_code=403, detail="Only patients can view their assigned tasks.")

    assignments = db.query(models.PatientAssignment).filter(
        models.PatientAssignment.patient_id == current_user.id
    ).all()

    return assignments


# ==========================================
# 4. PRACTICE ROOM DATA (Fetching words for an assignment)
# ==========================================

@router.get("/assignments/{assignment_id}/words")
def get_words_for_assignment(
        assignment_id: uuid.UUID,
        db: Session = Depends(database.get_db),
        current_user: models.User = Depends(auth.get_current_user)
):
    """
    When a patient clicks on an assignment, this endpoint goes through the assignment,
    finds the template, and returns the exact words selected by the clinician.
    """
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