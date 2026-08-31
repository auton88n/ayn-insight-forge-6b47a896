FROM python:3.12-slim
RUN apt-get update && apt-get install -y --no-install-recommends     wget gnupg curl ca-certificates     && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
RUN playwright install --with-deps chromium
RUN crawl4ai-setup
COPY server.py .
EXPOSE 8000
CMD ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "8000"]
