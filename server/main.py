from fastapi import FastAPI, Depends, HTTPException, status
from sqlalchemy.orm import Session
from fastapi.security import OAuth2PasswordRequestForm
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
    """
    # Find user by email (OAuth2PasswordRequestForm uses 'username' field for the email)
    user = db.query(models.User).filter(models.User.email == form_data.username).first()

    if not user or not auth.verify_password(form_data.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Generate the token
    access_token = auth.create_access_token(data={"sub": user.email, "role": user.role})
    return {"access_token": access_token, "token_type": "bearer"}