from fastapi import FastAPI
from database import engine
import models

# Import our new routers
from routers import auth_routes, clinician_routes, patient_routes

# Initialize DB
models.Base.metadata.create_all(bind=engine)

app = FastAPI(title="ClearSpeech API")

@app.get("/")
async def root():
    return {"message": "ClearSpeech API is running"}

# Connect the routers to the main app
app.include_router(auth_routes.router)
app.include_router(clinician_routes.router)
app.include_router(patient_routes.router)