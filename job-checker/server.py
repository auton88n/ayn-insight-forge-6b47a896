import _compat_shim  # noqa: F401 -- must run before scrapegraphai.graphs import
import os
from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel
from scrapegraphai.graphs import SmartScraperGraph

SERVICE_ROLE_KEY = os.environ.get('SERVICE_ROLE_KEY', '')
CHECKER_SECRET = os.environ.get('CHECKER_SECRET', '')
BRIDGE_BASE = 'https://ayn.careers/functions/v1/ai-openai-bridge'

PROMPT = (
    'Look at this job posting page and answer two separate questions about it.\n\n'
    '1. Is it currently open and accepting applications, or has it been closed, filled, '
    'expired, or removed? Signs of closed: "no longer accepting applications", "position '
    'has been filled", a 404/error page, an empty page with no real job content, or an '
    'explicit closed/expired notice. If the page shows a real job title, a real description, '
    'and a working way to apply, it is open.\n\n'
    '2. Separately, does the page itself show classic job-scam patterns? Only flag this for '
    'real, explicit red flags actually present on the page -- being vague or generic is not '
    'itself a scam signal. Real red flags: asking the applicant to pay any fee, asking for a '
    'bank account, SSN, or other sensitive personal/financial information before or instead of '
    'a real interview, promising unrealistic pay for minimal/no real work, or requiring the '
    'applicant to buy their own equipment/starter kit up front. Do not flag a page just for '
    'being brief, unpolished, or for genuinely paying well.\n\n'
    'Respond with strict JSON only: {"is_open": true or false, "reason": a one-sentence reason '
    'for is_open citing what you actually saw, "scam_suspected": true or false, "scam_reason": '
    'a one-sentence reason for scam_suspected citing what you actually saw, or an empty string '
    'if false}.'
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
