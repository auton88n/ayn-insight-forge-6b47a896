import asyncio
import json
import os
import re
import unicodedata
import urllib.request
from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel
from typing import Optional
from crawl4ai import AsyncWebCrawler

SERVICE_ROLE_KEY = os.environ.get('SERVICE_ROLE_KEY', '')
CHECKER_SECRET = os.environ.get('CHECKER_SECRET', '')
BRIDGE_BASE = 'https://ayn.careers/functions/v1/ai-openai-bridge'

# v3.318.0 -- ScrapeGraphAI bundled its own headless-browser fetch and its
# own LLM call into one opaque step (SmartScraperGraph.run()), with no way
# to see or bound what it actually sent the model -- confirmed via real
# 2026 pricing research to be the highest-priced of the real crawler
# options checked (Crawl4AI, Firecrawl, ScrapeGraphAI), very likely because
# an oversized page silently chunks into MULTIPLE billed LLM calls rather
# than one. Crawl4AI's fetch step is free and decoupled from the one capped
# AI judgment this file controls directly through ai-openai-bridge.
MAX_PAGE_CHARS = 12000  # real job_postings.description median is ~5,572 chars (job-board-sync); this stays a generous, fixed ceiling on ONE call's cost regardless of how large a real page's markdown turns out

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


def _strip_json_fence(text: str) -> str:
    """A gateway completion can wrap strict JSON in a ```json ... ``` fence
    even when told not to -- stripped defensively before parsing, never
    assumed absent."""
    t = (text or "").strip()
    if t.startswith("```"):
        t = re.sub(r"^```[a-zA-Z]*\n?", "", t)
        t = re.sub(r"\n?```\s*$", "", t)
    return t.strip()


def _ai_judge(page_content: str) -> dict:
    """
    Exactly one LLM call, page content capped at MAX_PAGE_CHARS, same
    PROMPT and same strict-JSON contract the old ScrapeGraphAI call used to
    produce -- through the same internal bridge _classify_candidates
    already trusts (the real service-role key as a Bearer token, the one
    credential this container is actually given, never the real AI
    credential itself). Plain urllib, same as _classify_candidates, so it
    runs off the event loop via asyncio.to_thread rather than blocking it.
    """
    body = json.dumps({
        'model': 'google/gemini-2.5-flash',
        'temperature': 0,
        'messages': [
            {'role': 'user', 'content': PROMPT + '\n\n--- PAGE CONTENT ---\n\n' + page_content[:MAX_PAGE_CHARS]},
        ],
    }).encode('utf-8')
    req = urllib.request.Request(
        BRIDGE_BASE, data=body, method='POST',
        headers={'Authorization': f'Bearer {SERVICE_ROLE_KEY}', 'Content-Type': 'application/json'},
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        data = json.loads(resp.read().decode('utf-8'))
    content = data['choices'][0]['message']['content']
    return json.loads(_strip_json_fence(content))


# v3.319.0 -- honest reliability pass, tested live rather than assumed. A
# real CAPTCHA hit this session, mid-fill, on a real Ashby application --
# not a fingerprinting problem specifically, a live interactive challenge.
# Two separate, deliberately narrow things, neither of them evasion:
# (1) navigator.webdriver -- a raw CDP automation flag Playwright sets on
# every driven page regardless of intent, not something a real installed
# browser ever exposes; stripping it removes a false-tell, it doesn't make
# this look like a DIFFERENT real person. (2) a real CAPTCHA/challenge
# widget, once actually presented, is never solved here -- detected,
# reported honestly, and handed back to a human, the same way this
# session's own auto-browser test already did by necessity.
_REAL_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
)
_STEALTH_INIT_SCRIPT = "Object.defineProperty(navigator, 'webdriver', { get: () => undefined });"

_CAPTCHA_SELECTORS = [
    "iframe[src*='recaptcha']", "iframe[src*='hcaptcha']", "iframe[title*='challenge']",
    "[class*='cf-turnstile']", "#cf-challenge-stage", "div[class*='captcha']",
]
_CAPTCHA_TEXT_RE = re.compile(
    r"verify you are human|are you a robot|complete the security check|checking your browser",
    re.IGNORECASE,
)


def _real_captcha_selectors_present(page) -> bool:
    """
    reCAPTCHA v3 (invisible, score-based) is standard, silent anti-spam
    infrastructure on most real Greenhouse/Lever forms -- present on
    essentially every visit, real human or not, and never rendered as
    anything a person interacts with. A bare DOM presence check
    (`_CAPTCHA_SELECTORS` alone) fires on that just as readily as on a real
    challenge -- confirmed live on every one of five real postings tested.
    v3's required "protected by reCAPTCHA" corner badge is a real, visible
    element too (confirmed live via screenshot on a genuine SpaceX
    posting, a plain 256x60px badge in the bottom-right corner, nothing a
    person ever acts on) -- gating on visibility alone wasn't enough.
    Two attempts at excluding it by attribute both proved fragile, live:
    the iframe's own title read "reCAPTCHA" on one real posting and
    "recaptcha badge" on another, and the badge is matched by two
    different selectors in _CAPTCHA_SELECTORS at once (the iframe, and
    its containing div, class=grecaptcha-badge) -- excluding by one
    attribute on one candidate left the other candidate, matched by a
    different selector, still triggering. Fixed geometrically instead:
    grecaptcha-badge's own real position is looked up once, directly, and
    anything at that same real screen position is the badge no matter
    which selector matched it or what it's labeled. Only a real challenge
    sitting somewhere ELSE on the page ever counts.
    """
    badge_box = None
    try:
        badge = page.locator(".grecaptcha-badge").first
        if badge.count() > 0 and badge.is_visible():
            badge_box = badge.bounding_box()
    except Exception:
        pass

    def _is_the_badge(box) -> bool:
        if not badge_box or not box:
            return False
        return abs(box["x"] - badge_box["x"]) < 5 and abs(box["y"] - badge_box["y"]) < 5

    for sel in _CAPTCHA_SELECTORS:
        try:
            loc = page.locator(sel).first
            if loc.count() == 0 or not loc.is_visible():
                continue
            box = loc.bounding_box()
            if not box or box["width"] <= 10 or box["height"] <= 10:
                continue
            if _is_the_badge(box):
                continue
            return True
        except Exception:
            continue
    return False


def _new_stealth_page(browser):
    """Every real caller creates its page through here -- one place to keep
    the webdriver mask and the real UA consistent, rather than duplicated
    per route."""
    page = browser.new_page(viewport={"width": 1280, "height": 900}, user_agent=_REAL_UA)
    page.add_init_script(_STEALTH_INIT_SCRIPT)
    return page


def _captcha_present(page) -> bool:
    """A real, currently-VISIBLE challenge -- checked by selector first
    (cheap, precise, visibility-gated so it doesn't fire on invisible
    reCAPTCHA v3 infrastructure), text second (catches a widget shape not
    on the fixed selector list, or a real Cloudflare interstitial that
    replaced the page's own content entirely). Never true for an ordinary
    field-validation error, and never true just because a site happens to
    run reCAPTCHA v3 in the background like most real ATS forms do."""
    if _real_captcha_selectors_present(page):
        return True
    try:
        body_text = page.inner_text("body", timeout=1500) or ""
        if _CAPTCHA_TEXT_RE.search(body_text):
            return True
    except Exception:
        pass
    return False



# v3.358.0 -- a free, deterministic pre-filter checked before the paid
# _ai_judge() call above runs at all. Ported (not copied verbatim -- this
# codebase has no DOM/applyControls list to read, only Crawl4AI's own
# markdown text) from career-ops (an unrelated open-source job-search
# toolkit)'s own liveness classifier. Two things it catches that a plain
# "ask the AI" approach can't:
#
# 1. A REAL closure banner ("no longer accepting applications", "this
#    job has expired", the equivalent in French/German) is completely
#    unambiguous from the text alone -- there is nothing an AI call adds
#    over a direct pattern match, and every one skipped is a real AI
#    call this container never has to make, inside the same tight
#    wall-clock budget job-board-sync's own verifyClosureBatch runs
#    under (see docs/map/deployment.md's own note on that budget).
# 2. A BOT/ANTI-SCRAPING CHALLENGE PAGE (Cloudflare "Just a moment...",
#    an hCaptcha wall) is NOT closure evidence, but handing its own
#    short, contentless text to _ai_judge risks the model reading "an
#    empty page with no real job content" -- its own documented "closed"
#    signal in PROMPT above -- and misjudging a genuinely OPEN posting as
#    closed purely because the real page was never actually shown to it.
#    Caught here and reported as inconclusive (is_open: None, which
#    job-board-sync's own caller already treats as "uncertain, retry
#    later" -- the identical branch an outright fetch failure takes, no
#    change needed on that side) instead of ever reaching the model.
#
# Deliberately conservative in the other direction: this NEVER returns a
# definite is_open=True from pattern-absence alone. A page with no
# closure banner and no bot-challenge text still goes to _ai_judge,
# since "nothing looked closed" is real, but weaker, evidence than a
# banner that explicitly says so -- and _ai_judge is also this
# function's only source of the scam_suspected/scam_reason signal for a
# genuinely open posting, so skipping it entirely on the open path would
# quietly drop that check too, not just save a call.
def _normalize_liveness_text(text: str) -> str:
    if not text:
        return ""
    t = (text
         .replace("‘", "'").replace("’", "'").replace("ʼ", "'").replace("′", "'").replace("´", "'").replace("`", "'")
         .replace("“", '"').replace("”", '"').replace("″", '"'))
    t = unicodedata.normalize("NFD", t)
    t = "".join(c for c in t if unicodedata.category(c) != "Mn")
    return re.sub(r"\s+", " ", t)


_LIVENESS_HARD_EXPIRED_PATTERNS = [re.compile(p, re.IGNORECASE) for p in [
    r"job (is )?no longer available",
    r"job.*no longer open",
    # v3.358.0 -- the source pattern's single lookbehind alternated
    # "application" (11 chars) with "form" (4 chars); Python's `re`
    # requires every lookbehind to be fixed-width, unlike the JS engine
    # this was ported from -- confirmed by a real compile failure, not
    # assumed. Two separate fixed-width negative lookbehinds chained
    # here express the identical "not preceded by either" condition.
    r"\b(?:job|jobs|position|role|posting|opening|vacancy|requisition|req|listing)\b[\s\S]{0,60}?(?<!\bapplication\s)(?<!\bform\s)has been filled\b(?!\s+out)",
    r"this job has expired",
    r"job posting has expired",
    r"no longer accepting applications",
    r"this (position|role|job) (is )?no longer",
    r"this job (listing )?is closed",
    r"job (listing )?not found",
    r"the page you are looking for doesn.t exist",
    r"applications?\s+(?:(?:have|are|is)\s+)?closed",
    r"diese stelle (ist )?(nicht mehr|bereits) besetzt",
    r"offre (expiree|n'est plus disponible)",
    r"(cette )?offre n'est plus (disponible|en ligne|active)",
    r"(offre|poste|annonce) (deja )?pourvu(e)?",
    r"offre (cloturee|desactivee|terminee)",
    r"ce poste n'est plus (disponible|a pourvoir|ouvert)",
    r"recrutement (termine|cloture)",
    r"candidatures (closes|cloturees)",
]]

_LIVENESS_BOT_CHALLENGE_PATTERNS = [re.compile(p, re.IGNORECASE) for p in [
    r"just a moment",
    r"performing security verification",
    r"checking your browser before",
    r"verify you are (a |not a )?human",
    r"enable javascript and cookies to continue",
    r"attention required.*cloudflare",
    r"\bray id\b",
    r"\bcf-ray\b",
    r"please complete the security check",
]]


def _first_liveness_match(patterns, text: str):
    for p in patterns:
        if p.search(text):
            return p.pattern
    return None


def _classify_liveness_deterministic(page_text: str) -> Optional[dict]:
    """Returns a definite result dict when the text is unambiguous, or
    None to fall through to the real AI judge below."""
    text = _normalize_liveness_text(page_text)

    if _first_liveness_match(_LIVENESS_BOT_CHALLENGE_PATTERNS, text):
        return {"is_open": None, "reason": "Automated check: an anti-bot/access-verification page was returned instead of the real posting."}

    expired_pattern = _first_liveness_match(_LIVENESS_HARD_EXPIRED_PATTERNS, text)
    if expired_pattern:
        return {"is_open": False, "reason": "Automated check: a closure banner was detected on the page.", "scam_suspected": False, "scam_reason": ""}

    return None


@app.post('/check')
async def check(req: CheckRequest, x_checker_secret: str = Header(default='')):
    if not CHECKER_SECRET or x_checker_secret != CHECKER_SECRET:
        raise HTTPException(status_code=403, detail='forbidden')
    try:
        async with AsyncWebCrawler() as crawler:
            crawl_result = await crawler.arun(url=req.url)
        page_text = str(crawl_result.markdown or '') if crawl_result.success else ''
        if not page_text.strip():
            status = getattr(crawl_result, 'status_code', 'unknown')
            return {'ok': False, 'error': f'could not load the page (status {status})'}
        deterministic = _classify_liveness_deterministic(page_text)
        if deterministic is not None:
            return {'ok': True, 'result': deterministic}
        result = await asyncio.to_thread(_ai_judge, page_text)
        return {'ok': True, 'result': result}
    except Exception as e:
        return {'ok': False, 'error': str(e)}
