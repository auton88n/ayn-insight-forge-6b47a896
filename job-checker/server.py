import _compat_shim  # noqa: F401 -- must run before scrapegraphai.graphs import
import os
from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel
from scrapegraphai.graphs import SmartScraperGraph

SERVICE_ROLE_KEY = os.environ.get('SERVICE_ROLE_KEY', '')
CHECKER_SECRET = os.environ.get('CHECKER_SECRET', '')
BRIDGE_BASE = 'https://ayn.careers/functions/v1/ai-openai-bridge'

PROMPT = (
    'Look at this job posting page. Is it currently open and accepting applications, '
    'or has it been closed, filled, expired, or removed? '
    'Signs of closed: "no longer accepting applications", "position has been filled", '
    'a 404/error page, an empty page with no real job content, or an explicit closed/expired notice. '
    'If the page shows a real job title, a real description, and a working way to apply, it is open. '
    'Respond with strict JSON only: {"is_open": true or false, "reason": a one-sentence reason citing what you actually saw on the page}.'
)

app = FastAPI()

class CheckRequest(BaseModel):
    url: str

@app.get('/health')
def health():
    return {'ok': True}

@app.post('/check')
def check(req: CheckRequest, x_checker_secret: str = Header(default='')):
    if not CHECKER_SECRET or x_checker_secret != CHECKER_SECRET:
        raise HTTPException(status_code=403, detail='forbidden')
    config = {
        'llm': {
            'api_key': SERVICE_ROLE_KEY,
            'model': 'openai/google/gemini-2.5-flash',
            'base_url': BRIDGE_BASE,
            'model_tokens': 8192,
        },
        'verbose': False,
        'headless': True,
        'timeout': 30,
    }
    try:
        graph = SmartScraperGraph(prompt=PROMPT, source=req.url, config=config)
        result = graph.run()
        return {'ok': True, 'result': result}
    except Exception as e:
        return {'ok': False, 'error': str(e)}
