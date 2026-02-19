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

CREATE TABLE practice_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID REFERENCES users(id),
    clinician_id UUID REFERENCES users(id),
    target_sound VARCHAR,
    title VARCHAR,
    status VARCHAR,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);


CREATE TABLE recordings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID REFERENCES users(id),
    clinician_id UUID REFERENCES users(id),
    session_id UUID REFERENCES practice_sessions(id),
    target_sound VARCHAR,
    file_path VARCHAR UNIQUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    is_reviewed BOOLEAN DEFAULT FALSE,
    word_id INTEGER REFERENCES word_bank(id) NOT NULL

);