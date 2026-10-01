from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="AYN API")

# This is a plain health-check stub with one unauthenticated GET endpoint --
# no cookies, no session state, nothing credentialed for a wildcard origin
# to actually steal. Still, allow_origins=["*"] combined with
# allow_credentials=True is a real misconfiguration in general (most
# browsers reject the combination outright, but it's the wrong pattern to
# leave sitting in source regardless of today's low blast radius, and it
# sets a bad precedent for whatever gets added to this file next).
# Restricted to the real, known origins; credentials off since nothing here
# needs them.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://ayn.careers", "http://localhost:3000"],
    allow_credentials=False,
    allow_methods=["GET"],
    allow_headers=["*"],
)

@app.get("/api/health")
def health():
    return {"status": "ok", "service": "ayn-backend"}
