from fastapi import FastAPI, Depends, HTTPException, status
from sqlalchemy.orm import Session
from fastapi.security import OAuth2PasswordRequestForm
from datetime import timedelta
from typing import List

# Import our local modules
from database import engine, get_db
import models
import schemas
import auth

# Initialize database tables based on our SQLAlchemy models
models.Base.metadata.create_all(bind=engine)

app = FastAPI(title="ClearSpeech API")


@app.get("/")
async def root():
    return {"message": "ClearSpeech API is running"}


# --- AUTHENTICATION ENDPOINTS ---

@app.post("/register/clinician", response_model=schemas.UserOut)
def register_clinician(user_data: schemas.UserCreate, db: Session = Depends(get_db)):
    """
    Registers a new clinician. Hashes the password before saving to the database.
    """
    # Check if the email already exists in the system
    existing_user = db.query(models.User).filter(models.User.email == user_data.email).first()
    if existing_user:
        raise HTTPException(status_code=400, detail="Email already registered")

    # Create the user object with a hashed password
    hashed_pwd = auth.hash_password(user_data.password)
    new_user = models.User(
        email=user_data.email,
        password_hash=hashed_pwd,
        role="clinician"  # Force role to clinician for this endpoint
    )

    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return new_user


@app.post("/login")
def login(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    """
    Verifies credentials and returns a JWT access token.
    Using OAuth2PasswordRequestForm means the client sends 'username' and 'password'.
    """
    # Find user by email (OAuth2PasswordRequestForm uses 'username' field for the email)
    user = db.query(models.User).filter(models.User.email == form_data.username).first()

    # Verify password
    if not user or not auth.verify_password(form_data.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Generate the access token
    access_token_expires = timedelta(minutes=auth.ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = auth.create_access_token(
        data={"sub": user.email, "role": user.role},
        expires_delta=access_token_expires
    )

    return {"access_token": access_token, "token_type": "bearer"}


# --- PATIENT MANAGEMENT (PROTECTED ROUTES) ---

@app.post("/patients/", response_model=schemas.UserOut)
def create_patient(
        patient_data: schemas.PatientCreate,
        db: Session = Depends(get_db),
        current_user: models.User = Depends(auth.get_current_user)  # This acts as the security guard
):
    """
    Allows an authenticated clinician to create a new patient profile.
    This route requires a valid JWT token in the header.
    """
    # 1. Verify that the current user is actually a clinician
    if current_user.role != "clinician":
        raise HTTPException(status_code=403, detail="Not authorized. Only clinicians can create patients.")

    # 2. Check if patient email already exists
    existing_user = db.query(models.User).filter(models.User.email == patient_data.email).first()
    if existing_user:
        raise HTTPException(status_code=400, detail="Patient email already registered")

    # 3. Create the base User record for the patient
    hashed_pwd = auth.hash_password(patient_data.password)
    new_patient_user = models.User(
        email=patient_data.email,
        password_hash=hashed_pwd,
        role="patient"
    )
    db.add(new_patient_user)
    db.commit()
    db.refresh(new_patient_user)

    # 4. Create the specific Patient clinical profile
    # We link the patient to the clinician who is currently logged in (current_user.id)
    new_patient_profile = models.Patient(
        user_id=new_patient_user.id,
        clinician_id=current_user.id,
        full_name=patient_data.full_name,
        date_of_birth=patient_data.date_of_birth,
        target_sounds=patient_data.target_sounds
    )
    db.add(new_patient_profile)
    db.commit()

    return new_patient_user


from typing import List  # Don't forget to import List if it's missing!


@app.get("/clinician/patients", response_model=List[schemas.PatientOut])
def get_my_patients(
        db: Session = Depends(get_db),
        current_user: models.User = Depends(auth.get_current_user)
):
    """
    Returns a list of all patients linked to the currently logged-in clinician.
    """
    # 1. Verify role
    if current_user.role != "clinician":
        raise HTTPException(status_code=403, detail="Only clinicians can access this list.")

    # 2. Query the database: Find patients where clinician_id matches MY id
    # This is the line that proves the connection!
    my_patients = db.query(models.Patient).filter(models.Patient.clinician_id == current_user.id).all()

    return my_patients


@app.get("/patient/me", response_model=schemas.PatientOut)
def get_my_patient_profile(
        db: Session = Depends(get_db),
        current_user: models.User = Depends(auth.get_current_user)
):
    """
    Allows a logged-in patient to see their own profile and target sounds.
    """
    # 1. Verify role
    if current_user.role != "patient":
        raise HTTPException(status_code=403, detail="Only patients can access this profile.")

    # 2. Find the patient record linked to this user
    patient_record = db.query(models.Patient).filter(models.Patient.user_id == current_user.id).first()

    if not patient_record:
        raise HTTPException(status_code=404, detail="Patient profile not found")

    return patient_record