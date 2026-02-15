from fastapi import FastAPI
from database import engine
import models
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles # Import this at the top
import os

# Import our new routers
from routers import auth_routes, clinician_routes, patient_routes, recording_routes, practice_routes

# Initialize DB
models.Base.metadata.create_all(bind=engine)

app = FastAPI(title="ClearSpeech API")

images_path = os.path.join(os.getcwd(), "images")
app.mount("/images", StaticFiles(directory=images_path), name="images")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"], # The address of your React app
    allow_credentials=True,
    allow_methods=["*"], # Allow GET, POST, etc.
    allow_headers=["*"], # Allow all headers (like Authorization)
)
@app.get("/")
async def root():
    return {"message": "ClearSpeech API is running"}

# Connect the routers to the main app
app.include_router(auth_routes.router)
app.include_router(clinician_routes.router)
app.include_router(patient_routes.router)
app.include_router(recording_routes.router)
app.include_router(practice_routes.router)