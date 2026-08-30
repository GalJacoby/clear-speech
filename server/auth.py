import os
from passlib.context import CryptContext
from datetime import datetime, timedelta
from typing import Optional
from jose import JWTError, jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

# Import local modules
import models
from database import get_db

# --- CONFIGURATION ---
# SECRET_KEY: This key signs the JWT tokens. Injected via environment in production;
# falls back to a dev-only value so local `uvicorn --reload` keeps working unconfigured.
SECRET_KEY = os.environ.get("SECRET_KEY", "super_secret_key_for_clearspeech_dev_only")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60  # Token is valid for 1 hour

# Context for password hashing (using bcrypt)
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# OAuth2 scheme: Tells FastAPI that the token comes in the Authorization header
# 'tokenUrl' tells Swagger UI where to send the username/password to get a token
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="login")

# --- UTILITY FUNCTIONS ---
def hash_password(password: str) -> str:
    """
    Hashes a plain password using bcrypt.
    Used before saving a new user to the database.
    """
    return pwd_context.hash(password)

def verify_password(plain_password: str, hashed_password: str) -> bool:
    """
    Verifies a plain password against the stored hash.
    It re-hashes the plain password and compares the result.
    """
    return pwd_context.verify(plain_password, hashed_password)

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    """
    Generates a JWT access token.
    'data': A dictionary containing user info (like email) to encode in the token.
    """
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=15)

    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

# --- DEPENDENCY (The Guard) ---
def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    """
    This function validates the token sent in the request header.
    It decodes the token, extracts the email, and fetches the user from the DB.
    Used as a dependency in protected routes (like creating a patient).
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )

    try:
        # Decode the token using the SECRET_KEY
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])

        # Extract the email (subject) from the payload
        email: str = payload.get("sub")
        if email is None:
            raise credentials_exception

    except JWTError:
        # Token is invalid (e.g., expired or tampered with)
        raise credentials_exception

    # Check if the user actually exists in the database
    user = db.query(models.User).filter(models.User.email == email).first()
    if user is None:
        raise credentials_exception

    return user