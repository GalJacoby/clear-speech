FROM python:3.11-slim

# libsndfile1 — required by soundfile/librosa for audio decoding.
# libgomp1   — OpenMP runtime required by torch at import time.
# curl       — used by the HEALTHCHECK below.
RUN apt-get update && apt-get install -y --no-install-recommends \
    libsndfile1 \
    libgomp1 \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install the CPU-only torch build first. The default PyPI "torch" wheel bundles multi-GB
# CUDA dependencies that are useless on a CPU-only cloud VM. requirements.txt lists "torch"
# with no version pin, so once this is installed, `pip install -r requirements.txt` sees the
# requirement as already satisfied and won't pull the CUDA build over it.
RUN pip install --no-cache-dir torch --index-url https://download.pytorch.org/whl/cpu

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Hugging Face model cache (Whisper is downloaded lazily on first grading request) and the
# app's own data directories. These are mount points for named volumes in docker-compose —
# created here too so the app works even if someone runs the image without volumes.
RUN mkdir -p uploads word_audio .cache/huggingface \
    && useradd --create-home --uid 1000 appuser \
    && chown -R appuser:appuser /app

ENV HF_HOME=/app/.cache/huggingface \
    PYTHONUNBUFFERED=1

USER appuser

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
    CMD curl -f http://localhost:8000/ || exit 1

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
