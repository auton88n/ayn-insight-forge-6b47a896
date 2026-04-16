FROM python:3.11-slim

WORKDIR /app

# Install system deps for bcrypt and asyncpg
RUN apt-get update && apt-get install -y \
    gcc \
    libffi-dev \
    libssl-dev \
    && rm -rf /var/lib/apt/lists/*

# Install Python deps
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy app
COPY . .

# Start
CMD python -m uvicorn main:app --host 0.0.0.0 --port ${PORT:-8080}
