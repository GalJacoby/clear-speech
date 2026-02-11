CREATE TYPE user_role AS ENUM ('clinician', 'patient');

CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR NOT NULL,
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

CREATE TABLE assignments (
    id SERIAL PRIMARY KEY,
    patient_id UUID REFERENCES patients(user_id),
    clinician_id UUID REFERENCES users(id),
    word_ids INTEGER[],
    due_date DATE,
    status VARCHAR DEFAULT 'active'
);

CREATE TABLE attempts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID REFERENCES patients(user_id),
    word_id INTEGER REFERENCES word_bank(id),
    audio_url VARCHAR,
    accuracy_score FLOAT CHECK (accuracy_score BETWEEN 0.0 AND 100.0),
    phoneme_data JSONB,
    is_correct BOOLEAN,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);