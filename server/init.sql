CREATE TYPE user_role AS ENUM ('clinician', 'patient');

CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR NOT NULL,
    full_name VARCHAR(100) NOT NULL,
    role user_role NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE patients (
    user_id UUID PRIMARY KEY REFERENCES users(id),
    clinician_id UUID REFERENCES users(id),
    full_name VARCHAR NOT NULL,
    parent_email VARCHAR,
    date_of_birth DATE,
    target_sounds TEXT[]
);

CREATE TABLE word_bank (
    id SERIAL PRIMARY KEY,
    text VARCHAR NOT NULL,
    phonetic_trans VARCHAR NOT NULL,
    image_url VARCHAR,
    category VARCHAR,
    difficulty INTEGER CHECK (difficulty BETWEEN 1 AND 5)
);

-- AI Audio Cache (normalized word text → gTTS-generated audio URL)
CREATE TABLE ai_audio_cache (
    word_text VARCHAR PRIMARY KEY,
    audio_url VARCHAR NOT NULL
);

-- 1. Exercise Templates (The generic practice created by a clinician)
CREATE TABLE exercise_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR NOT NULL,
    target_sound VARCHAR NOT NULL,
    created_by_clinician_id UUID REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    is_archived BOOLEAN NOT NULL DEFAULT false
);

-- 2. Template Words (Many-to-Many junction table linking templates to words)
CREATE TABLE template_words (
    template_id UUID REFERENCES exercise_templates(id) ON DELETE CASCADE,
    word_id INTEGER REFERENCES word_bank(id) ON DELETE CASCADE,
    PRIMARY KEY (template_id, word_id)
);

-- 3. Patient Assignments (Assigning a template to a specific patient)
CREATE TABLE patient_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID REFERENCES users(id) NOT NULL,
    clinician_id UUID REFERENCES users(id) NOT NULL,
    template_id UUID REFERENCES exercise_templates(id) NOT NULL,
    status VARCHAR DEFAULT 'pending',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. Appointments (Scheduled sessions between clinician and patient)
CREATE TABLE appointments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clinician_id UUID REFERENCES users(id) NOT NULL,
    patient_id UUID REFERENCES users(id) NOT NULL,
    title VARCHAR NOT NULL,
    start_time TIMESTAMP WITH TIME ZONE NOT NULL,
    end_time TIMESTAMP WITH TIME ZONE NOT NULL,
    recurrence_type VARCHAR NOT NULL DEFAULT 'one-time',
    recurrence_group_id UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 5. Recordings (The patient's actual audio submissions)
CREATE TABLE recordings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID REFERENCES users(id) NOT NULL,
    clinician_id UUID REFERENCES users(id) NOT NULL,
    assignment_id UUID REFERENCES patient_assignments(id) NOT NULL,
    target_sound VARCHAR NOT NULL,
    file_path VARCHAR UNIQUE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    is_reviewed BOOLEAN DEFAULT FALSE,
    word_id INTEGER REFERENCES word_bank(id) NOT NULL
);