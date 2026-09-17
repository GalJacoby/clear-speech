ClearSpeech - Notes for Reviewers
==================================

ClearSpeech is an AI-driven speech therapy platform. Clinicians build exercise
templates (word or syllable practice) and assign them to patients; patients
record themselves practicing, and each recording is automatically transcribed
and graded by AI, with results feeding into a review workflow for the
clinician.

Code division
-------------
The codebase is a clean client/server split with no direct client-DB access:

- client/ - React 19 SPA (Vite, plain JSX, no TypeScript). One file per screen
  under src/pages/ (Login, Dashboard, PatientManagement, PracticeRoom,
  CreateTemplate, etc.). Axios talks exclusively to the FastAPI backend; JWTs
  are stored in localStorage and attached via a request interceptor. Routes
  are gated by a protected-route wrapper based on the stored token and role.

- server/ - FastAPI + SQLAlchemy over PostgreSQL. main.py wires up the app,
  CORS and router registration; models.py/schemas.py hold the ORM and
  Pydantic layers; routers/ is split strictly by domain (auth, clinician,
  patient, practice, recording, appointment), so each file owns one part of
  the product surface.

Parts worth a closer look
--------------------------
1. AI grading pipeline (server/routers/recording_routes.py, grade_audio /
   grade_with_gemini): a submitted recording is transcribed locally with a
   cached Whisper ASR pipeline (loaded once, reused across requests), then the
   transcription is sent to Gemini with a rubric-driven system prompt tailored
   to the practice type (whole word vs. isolated sound/syllable). Gemini
   returns strict JSON with a score and a specific, constructive phonetic
   note (e.g. "you said 'sh' instead of 's'"). The route is deliberately
   synchronous so FastAPI runs it in a worker thread and keeps the (blocking,
   CPU-bound) Whisper call off the event loop.

2. Self-healing audio delivery (server/main.py, /word-audio/{filename}):
   generated word-prompt audio is served from disk, but if a file is ever
   missing (e.g. a volume was reset), the endpoint looks up the original word
   text in an ai_audio_cache table and regenerates the MP3 on the fly via
   gTTS before serving it - the audio library repairs itself instead of
   producing broken links.

3. Data model (server/models.py): many-to-many templates/words via a
   TemplateWord junction table, cascading deletes, a dual-flag review system
   (marked_by_clinician / marked_by_patient) so either side can star a
   recording for follow-up, and recurring appointments grouped by
   recurrence_group_id.

4. Production deployment (docker-compose.prod.yml, server/Dockerfile,
   client/Dockerfile): a real, isolated deployment target for a single EC2
   instance - Postgres with a healthcheck-gated startup order, a CPU-only
   PyTorch install (avoids pulling multi-GB CUDA wheels on a server with no
   GPU), a multi-stage frontend build served by Nginx, and named volumes so
   uploads, generated word audio, and the Hugging Face model cache all
   survive container restarts.

5. Auth (server/auth.py): JWT-based auth with bcrypt password hashing and
   role checks (clinician vs. patient) enforced on every sensitive route, not
   just hidden in the UI.
