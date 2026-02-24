from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker

#This code configures SQLAlchemy to connect to a PostgreSQL database, creates a session factory,
# defines a base model class, and provides a safe database session per request in FastAPI.

SQLALCHEMY_DATABASE_URL = "postgresql://user:password@localhost:5432/clearspeech"

engine = create_engine(SQLALCHEMY_DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()