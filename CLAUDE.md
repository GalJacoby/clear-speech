# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

ClearSpeech is an AI-driven speech therapy platform. Clinicians create exercise templates and assign them to patients; patients record themselves practicing words and receive feedback.

## Commands

### Client (React/Vite)
```bash
cd client
npm run dev       # Dev server on http://localhost:5173
npm run build     # Production build to dist/
npm run lint      # ESLint
npm run preview   # Preview production build
```

### Server (FastAPI/Python)
```bash
# Start PostgreSQL (required first)
docker-compose up -d

# Activate virtualenv (Windows)
cd server
venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Run API server on http://127.0.0.1:8000
uvicorn main:app --reload
```

There are no automated tests in this project.

## Architecture

**Frontend** (`client/src/`): React 19 SPA with React Router DOM. All API calls use Axios pointed at `http://127.0.0.1:8000`. Auth tokens are stored in `localStorage` and attached via Axios request interceptors. Routes are protected by a wrapper that checks for a stored token.

- `App.jsx` — router setup and protected route logic
- `pages/` — one file per screen: Login, Dashboard, PatientManagement, PatientDetails, PracticeRoom, CreateTemplate

**Backend** (`server/`): FastAPI app with SQLAlchemy ORM over PostgreSQL.

- `main.py` — app init, CORS (`http://localhost:5173` allowed), router registration
- `database.py` — SQLAlchemy engine/session; DB URL is hardcoded (`postgresql://user:password@localhost:5432/clearspeech`)
- `models.py` — ORM models: User, Patient, WordBank, ExerciseTemplate, TemplateWord, PatientAssignment, Recording
- `schemas.py` — Pydantic request/response models
- `auth.py` — JWT creation/validation (hardcoded `SECRET_KEY`), bcrypt password hashing
- `routers/` — split by domain: `auth_routes`, `clinician_routes`, `patient_routes`, `practice_routes`, `recording_routes`
- `uploads/` — audio files saved here on the filesystem

**Database**: PostgreSQL 15 via Docker (`docker-compose.yml`). Schema is initialized via `server/init.sql`.

**AI/ML**: Recordings are processed using HuggingFace Transformers + PyTorch + Librosa for speech analysis (in `recording_routes.py`).

## Key Conventions

- Two user roles: `clinician` and `patient`. Role is stored on the `User` model and drives which routes/pages are accessible.
- JWT is the only auth mechanism; no refresh tokens.
- Audio files are stored on disk in `server/uploads/`, not in the database.
- The client never talks to the DB directly — all data flows through the FastAPI REST API.
- No TypeScript; client is plain JSX, server is Python.
