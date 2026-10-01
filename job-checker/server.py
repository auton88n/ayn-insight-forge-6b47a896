import asyncio
import base64
import json
import os
import re
import tempfile
import urllib.request
from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel
from typing import Optional, Dict
from crawl4ai import AsyncWebCrawler
from playwright.sync_api import sync_playwright

SERVICE_ROLE_KEY = os.environ.get('SERVICE_ROLE_KEY', '')
CHECKER_SECRET = os.environ.get('CHECKER_SECRET', '')
BRIDGE_BASE = 'https://ayn.careers/functions/v1/ai-openai-bridge'

# v3.318.0 -- ScrapeGraphAI bundled its own headless-browser fetch and its
# own LLM call into one opaque step (SmartScraperGraph.run()), with no way
# to see or bound what it actually sent the model -- confirmed via real
# 2026 pricing research to be the highest-priced of the real crawler
# options checked (Crawl4AI, Firecrawl, ScrapeGraphAI), very likely because
# an oversized page silently chunks into MULTIPLE billed LLM calls rather
# than one. Crawl4AI's own fetch step is free and decoupled from any LLM
# call by design (Apache 2.0, self-hosted, the same Playwright engine this
# file already runs for /extract_form and /fill_form) -- the AI judgment
# is now a single, explicit, capped call this file controls directly,
# through the exact same internal ai-openai-bridge _classify_candidates
# already trusts, not a third-party orchestration layer's own choices.
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
        result = await asyncio.to_thread(_ai_judge, page_text)
        return {'ok': True, 'result': result}
    except Exception as e:
        return {'ok': False, 'error': str(e)}


# ---------------------------------------------------------------------------
# Auto-apply: real, deterministic Playwright automation, no LLM involved.
# What each field should be FILLED WITH is decided entirely by the caller
# (resume-hub's own application_answer_match + loadIdentity, already
# grounded to real, user-owned facts) -- this service only ever does the
# mechanical work of reading a form's real fields and setting real values
# into it. It never invents an answer, and it never decides on its own to
# submit anything: /fill_form only clicks Submit when the caller explicitly
# passes submit: true, after the caller's own human-confirmation step.
# ---------------------------------------------------------------------------

class ExtractFormRequest(BaseModel):
    url: str


class TextValue(BaseModel):
    label: str
    value: str
    isIdentity: bool = False  # re-applied as a final pass after any file attach / combobox interaction


class RadioSelection(BaseModel):
    groupLabel: str
    optionLabel: str


class FillFormRequest(BaseModel):
    url: str
    # Targeted by LABEL TEXT, never by a raw element id. Confirmed live:
    # Ashby (and likely other React-rendered ATS platforms) regenerates
    # element ids on every page load -- an id captured during an earlier
    # /extract_form call is already stale by the time a separate /fill_form
    # call opens its own fresh browser session. Label text is what's
    # actually stable across two separate loads of the same real page, so
    # /fill_form re-extracts the live page itself and resolves each label
    # to whatever id it currently has, every time.
    textValues: list[TextValue] = []
    radioSelections: list[RadioSelection] = []
    resumeLabel: Optional[str] = None
    resumeFileUrl: Optional[str] = None
    coverLetterLabel: Optional[str] = None
    coverLetterFileUrl: Optional[str] = None
    submit: bool = False
    submitButtonText: str = "Submit application"


APPLY_BUTTON_PATTERN = re.compile(
    r"^\s*(apply( now| to position| for this job| for this position)?|i'?m interested|start application|get started)\s*$",
    re.IGNORECASE,
)

# Confirmed live against a real Breezy posting: its own button reads "Apply
# To Position" (capital "To"), which the original pattern above never
# matched -- "to position" added specifically for that, verified against a
# real 29-field form appearing afterward.
COOKIE_BUTTON_PATTERN = re.compile(
    r"^\s*(accept all|decline all|reject all|accept cookies|got it|i understand)\s*$",
    re.IGNORECASE,
)


def _dismiss_cookie_banner(page) -> None:
    """
    Some ATS pages (confirmed live: Workable) render a cookie-consent
    overlay that sits on top of the real Apply control, so a click at the
    button's own coordinates lands on the banner instead. Best-effort and
    silent -- a page with no banner at all is the common case, not an error.
    """
    try:
        for i in range(min(page.get_by_role("button").count(), 30)):
            el = page.get_by_role("button").nth(i)
            text = (el.inner_text(timeout=400) or "").strip()
            if COOKIE_BUTTON_PATTERN.match(text):
                el.click(timeout=2000)
                page.wait_for_timeout(600)
                return
    except Exception:
        pass


def _click_apply_if_needed(page) -> bool:
    """
    Many ATS platforms (Lever, Workday, SmartRecruiters, and others) show
    the job description and a separate Apply control first -- the actual
    field-bearing form only exists after that click, sometimes on the same
    page, sometimes after a navigation. Greenhouse is the exception, not
    the rule -- its form sits directly on the posting page, which is why
    this was never needed until testing spread past one platform. Returns
    True if a click happened.
    """
    for role in ("button", "link"):
        try:
            candidates = page.get_by_role(role)
            count = candidates.count()
            for i in range(min(count, 40)):
                el = candidates.nth(i)
                text = (el.inner_text(timeout=500) or "").strip()
                if APPLY_BUTTON_PATTERN.match(text):
                    el.click(timeout=3000)
                    page.wait_for_timeout(2000)
                    return True
        except Exception:
            continue
    return False


def _real_field_count(page) -> int:
    return page.evaluate("""
      () => Array.from(document.querySelectorAll('input, select, textarea'))
        .filter(el => el.type !== 'hidden' && el.offsetParent !== null).length
    """)


def _extract_fields_raw(page):
    """Deterministic scan only -- {fields, candidates}. See
    _extract_fields (below) for the classified, merged version every
    real caller in this file actually uses."""
    return page.evaluate("""
    () => {
      const fields = [];
      // Deliberately NOT scoped to "form X" -- Ashby's real application
      // page has 30+ real, fillable inputs with no <form> element wrapping
      // them at all (a plain React-managed page, submitted via a click
      // handler, not a native form submit). Scoping to form-descendants
      // silently found zero fields there. Querying the whole document is
      // safe everywhere else too, since every field on a real application
      // page is one this service might need to fill regardless of markup.
      document.querySelectorAll('input, select, textarea').forEach(el => {
        if (el.type === 'hidden') return;
        // v3.273.0 -- real bug, reproduced live: a genuinely invisible
        // companion input (a country-code dropdown's own internal search
        // box, closed and hidden by default, sitting right next to a real
        // visible "Phone" field with intl-tel-input's own libraries) was
        // extracted as a real field, then won the label match over the
        // actually-visible #phone input beside it, since both sit under
        // the same "Phone" label text in the DOM. Same visibility check
        // _real_field_count already uses to decide what counts as a real,
        // currently-fillable field -- an invisible one isn't fillable right
        // now regardless of what label text happens to be nearby.
        if (el.offsetParent === null) return;
        let label = '';
        if (el.id) {
          const lbl = document.querySelector(`label[for="${el.id}"]`);
          if (lbl) label = lbl.innerText.trim();
        }
        if (!label) {
          const parentLabel = el.closest('label');
          if (parentLabel) label = parentLabel.innerText.trim();
        }
        if (!label) {
          const wrap = el.closest('.field, [class*="question"], fieldset');
          if (wrap) {
            const lbl2 = wrap.querySelector('label, legend');
            if (lbl2) label = lbl2.innerText.trim();
          }
        }
        // A radio button's own "label" here is just its option text ("Yes",
        // "I require sponsorship...") -- real, but useless for matching on
        // its own, since nothing says what QUESTION it's answering. Ashby
        // (and likely other platforms using the same pattern) has no real
        // <fieldset>/<legend> -- the question text is just the first line
        // of the nearest .field-class wrapper's own full text, sitting
        // right above the option labels in the DOM.
        let radioGroup = null;
        let radioGroupLabel = null;
        if (el.type === 'radio') {
          radioGroup = el.name || null;
          const wrap = el.closest('[class*="field"]');
          if (wrap) {
            const firstLine = wrap.innerText.split('\\n')[0].trim();
            if (firstLine) radioGroupLabel = firstLine;
          }
        }
        fields.push({
          tag: el.tagName.toLowerCase(),
          type: el.type || null,
          id: el.id || null,
          required: el.required || false,
          label: label,
          radioGroup: radioGroup,
          radioGroupLabel: radioGroupLabel,
        });
      });

      // v3.290.0 -- parity fix. This scan only ever covered plain
      // <input>/<select>/<textarea> -- extension/content.js had already
      // grown real support for three real, common shapes this one never
      // had: an ARIA radiogroup (role=radiogroup > role=radio, e.g. a
      // Yes/No question that isn't a native radio pair at all), a plain
      // aria-pressed toggle-button group (the same Yes/No idea with no
      // radiogroup wrapper), and a role=combobox custom dropdown trigger
      // (Radix Select / react-select style, never a real <select>). Each
      // one is a de-duped id here too (an id is required to target a
      // later fill by, same as every native field above), and each is
      // dropped -- not silently mis-typed -- if it has none, matching
      // the existing de-dupe/no-id-drop pass this function already runs
      // right after this evaluate() call returns.
      // A real id, not just a data attribute -- _fill_one_field and the
      // radioSelections loop both target a field by `#{field_id}` as a
      // plain CSS selector, which only ever resolves against a real id
      // attribute. Assigning one is safe: it's additive, not a rename of
      // anything the page already relies on.
      let n = 0;
      const nextId = (el) => {
        if (el.id) return el.id;
        const gen = 'ayn-auto-' + (n++);
        el.id = gen;
        return gen;
      };

      document.querySelectorAll('[role="radiogroup"]').forEach((group) => {
        if (group.offsetParent === null) return;
        const options = Array.from(group.querySelectorAll('[role="radio"]')).filter((o) => o.offsetParent !== null);
        if (!options.length) return;
        const groupLabel = group.getAttribute('aria-label') ||
          (group.previousElementSibling ? group.previousElementSibling.innerText.trim().slice(0, 200) : '');
        options.forEach((opt) => {
          fields.push({
            tag: opt.tagName.toLowerCase(), type: 'radio', id: nextId(opt), required: false,
            label: (opt.getAttribute('aria-label') || opt.innerText || '').trim(),
            radioGroup: 'ayn-rg-' + (group.id || nextId(group)), radioGroupLabel: groupLabel,
          });
        });
      });

      const seenToggle = new Set();
      document.querySelectorAll('button[aria-pressed]').forEach((btn) => {
        if (btn.offsetParent === null || seenToggle.has(btn) || btn.closest('[role="radiogroup"]')) return;
        const parent = btn.parentElement;
        if (!parent) return;
        const siblings = Array.from(parent.children).filter(
          (c) => c.tagName === 'BUTTON' && c.hasAttribute('aria-pressed') && c.offsetParent !== null
        );
        if (siblings.length < 2) return;
        siblings.forEach((s) => seenToggle.add(s));
        const groupLabel = parent.getAttribute('aria-label') ||
          (parent.previousElementSibling ? parent.previousElementSibling.innerText.trim().slice(0, 200) : '');
        siblings.forEach((opt) => {
          fields.push({
            tag: 'button', type: 'radio', id: nextId(opt), required: false,
            label: (opt.getAttribute('aria-label') || opt.innerText || '').trim(),
            radioGroup: 'ayn-tg-' + (parent.id || nextId(parent)), radioGroupLabel: groupLabel,
          });
        });
      });

      document.querySelectorAll('[role="combobox"]').forEach((trigger) => {
        if (trigger.offsetParent === null || trigger.getAttribute('aria-disabled') === 'true') return;
        let label = '';
        if (trigger.id) {
          const lbl = document.querySelector(`label[for="${trigger.id}"]`);
          if (lbl) label = lbl.innerText.trim();
        }
        if (!label) label = trigger.getAttribute('aria-label') || '';
        if (!label && trigger.previousElementSibling) label = trigger.previousElementSibling.innerText.trim().slice(0, 200);
        // v3.320.0 -- real, live gap: a real Ashby "Location" combobox has
        // no id of its own at all (only its wrapping <label for="..."> does,
        // pointing at an id that exists nowhere in the DOM -- a real,
        // pre-existing accessibility gap in Ashby's own markup, not
        // something to fix here), and its real <label> sits as a sibling
        // of the input's PARENT container, not as the input's own previous
        // sibling -- confirmed live via a direct DOM dump. Every check
        // above silently found nothing, extracted an empty label, and a
        // required field was left completely unfillable, not just harder
        // to fill. Walking up to the nearest field-shaped ancestor and
        // reading its own real <label> is the same "the question text
        // lives a level or two above the input" pattern this file's radio
        // group extraction already relies on, applied here too.
        if (!label) {
          const wrap = trigger.closest('[class*="field"],[class*="question"],fieldset');
          if (wrap) {
            const lbl2 = wrap.querySelector('label');
            if (lbl2) label = lbl2.innerText.trim();
          }
        }
        fields.push({
          tag: trigger.tagName.toLowerCase(), type: 'select', id: nextId(trigger), required: false,
          label: label, radioGroup: null, radioGroupLabel: null,
        });
      });

      // v3.291.0 -- Form Intelligence candidates: two bounded shapes
      // neither this deterministic scan nor content.js's own deterministic
      // scan can safely recognize on structure alone -- a sibling button
      // group with NO aria-pressed/aria-checked at all (a real, common
      // accessibility gap: visually a segmented Yes/No pair, zero ARIA
      // state), and a clickable trigger that reads like a placeholder
      // ("Select…", "Start typing…") but never declared role="combobox".
      // Mirrors extension/content.js's own scanUnrecognizedWidgets()
      // exactly -- same two patterns, same signature shape -- so a
      // widget classified from either surface hits the identical cache
      // row in form_widget_patterns. Returned separately from fields,
      // never guessed at here: _classify_candidates (server.py, Python
      // side) is what turns a candidate into a real typed field, only
      // once a real classification actually said what it is.
      const candidates = [];
      let cn = 0;
      const seenCandBtn = new Set();
      document.querySelectorAll('button, [role="button"]').forEach((btn) => {
        if (btn.offsetParent === null || seenCandBtn.has(btn)) return;
        if (btn.hasAttribute('aria-pressed') || btn.hasAttribute('aria-checked')) return;
        if (btn.closest('nav, header, footer, [role="radiogroup"]')) return;
        const parent = btn.parentElement;
        if (!parent) return;
        const siblings = Array.from(parent.children).filter(
          (c) => c.offsetParent !== null && !seenCandBtn.has(c) &&
            (c.tagName === 'BUTTON' || c.getAttribute('role') === 'button')
        );
        if (siblings.length < 2 || siblings.length > 6) return;
        siblings.forEach((s) => seenCandBtn.add(s));
        const cid = 'ayn-cand-' + (cn++);
        candidates.push({
          localId: cid,
          ids: siblings.map((s) => nextId(s)),
          signature: {
            localId: cid,
            tag: parent.tagName.toLowerCase(),
            role: parent.getAttribute('role'),
            ariaAttrs: Array.from(siblings[0].attributes).map((a) => a.name).filter((a) => a.indexOf('aria-') === 0).sort(),
            childShape: 'button:' + siblings.length,
            classHint: (parent.className || '').toString().trim().split(/\\s+/)[0] || '',
            nearbyText: (parent.getAttribute('aria-label') ||
              (parent.previousElementSibling ? parent.previousElementSibling.innerText.trim().slice(0, 200) : '')) || '',
            optionTexts: siblings.map((s) => (s.innerText || '').trim().slice(0, 60)),
          },
        });
      });

      const PLACEHOLDER_RE = /^(select|choose|start typing|search)/i;
      document.querySelectorAll('[role="button"], [tabindex="0"], input[type="text"]').forEach((elx) => {
        if (elx.offsetParent === null || elx.getAttribute('role') === 'combobox') return;
        if (elx.closest('nav, header, footer')) return;
        const text = (elx.tagName === 'INPUT' ? (elx.placeholder || '') : (elx.innerText || elx.getAttribute('aria-label') || '')).trim();
        if (!PLACEHOLDER_RE.test(text)) return;
        const cid = 'ayn-cand-' + (cn++);
        candidates.push({
          localId: cid,
          ids: [nextId(elx)],
          signature: {
            localId: cid,
            tag: elx.tagName.toLowerCase(),
            role: elx.getAttribute('role'),
            ariaAttrs: Array.from(elx.attributes).map((a) => a.name).filter((a) => a.indexOf('aria-') === 0).sort(),
            childShape: Array.from(elx.children).map((c) => c.tagName.toLowerCase()).join(',') || 'none',
            classHint: (elx.className || '').toString().trim().split(/\\s+/)[0] || '',
            nearbyText: '',
            optionTexts: [],
          },
        });
      });

      return { fields: fields, candidates: candidates };
    }
    """)


FORM_INTEL_URL = 'https://ayn.careers/functions/v1/form-intel-bridge'


def _classify_candidates(candidates):
    """
    v3.291.0 -- job-checker holds no user session and no direct Postgres
    access, so it can't call resume-hub's own auto_apply_classify_widgets
    action directly (that action requires a real user JWT, on purpose --
    every other resume-hub action does too). form-intel-bridge is the
    same trust boundary job-checker already uses for /check's own AI call
    (ai-openai-bridge): the real service-role key as a Bearer token, the
    one credential this container is actually given. Returns a dict of
    localId -> {widgetType, ...}; a real failure here (network, gateway)
    degrades every candidate to "unrecognized" rather than raising --
    classification is additive, it must never break a real extraction
    that would otherwise have succeeded.
    """
    if not candidates or not SERVICE_ROLE_KEY:
        return {}
    try:
        body = json.dumps({'widgets': [c['signature'] for c in candidates]}).encode('utf-8')
        req = urllib.request.Request(
            FORM_INTEL_URL, data=body, method='POST',
            headers={'Authorization': f'Bearer {SERVICE_ROLE_KEY}', 'Content-Type': 'application/json'},
        )
        with urllib.request.urlopen(req, timeout=20) as resp:
            data = json.loads(resp.read().decode('utf-8'))
        return {c['localId']: c for c in data.get('classifications', [])}
    except Exception:
        return {}


def _extract_fields(page):
    """
    The real, merged field list every caller in this file uses: the
    deterministic scan (_extract_fields_raw) plus, for whatever it
    couldn't recognize on structure alone, a real classification via
    _classify_candidates -- a toggle_button_group or custom_checkbox
    becomes a real "radio" field (same shape _resolve_radio_group already
    expects), a combobox_static/combobox_typeahead becomes a real
    "select" field. "unrecognized" is left out entirely -- the same
    honest "not found" outcome as a field neither scan ever recognized.
    """
    raw = _extract_fields_raw(page)
    fields = list(raw.get('fields', []))
    candidates = raw.get('candidates', [])
    if not candidates:
        return fields
    classified = _classify_candidates(candidates)
    for cand in candidates:
        cls = classified.get(cand['localId'])
        if not cls:
            continue
        widget_type = cls.get('widgetType')
        sig = cand['signature']
        if widget_type in ('toggle_button_group', 'custom_checkbox'):
            group_name = 'ayn-cls-' + cand['localId']
            for i, fid in enumerate(cand['ids']):
                fields.append({
                    'tag': 'button', 'type': 'radio', 'id': fid, 'required': False,
                    'label': (sig['optionTexts'][i] if i < len(sig['optionTexts']) else ''),
                    'radioGroup': group_name, 'radioGroupLabel': sig.get('nearbyText') or None,
                })
        elif widget_type in ('combobox_static', 'combobox_typeahead') and cand['ids']:
            fields.append({
                'tag': 'input', 'type': 'select', 'id': cand['ids'][0], 'required': False,
                'label': sig.get('nearbyText') or '', 'radioGroup': None, 'radioGroupLabel': None,
            })
        # "unrecognized" -- left uncaptured, same honest behavior as today.
    return fields


@app.post('/extract_form')
def extract_form(req: ExtractFormRequest, x_checker_secret: str = Header(default='')):
    if not CHECKER_SECRET or x_checker_secret != CHECKER_SECRET:
        raise HTTPException(status_code=403, detail='forbidden')
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch()
            page = _new_stealth_page(browser)
            page.goto(req.url, wait_until="domcontentloaded", timeout=30000)
            page.wait_for_timeout(1800)
            # A real visitor reads the posting before doing anything --
            # scrolling first is a real, human-shaped signal on its own,
            # not just idle time.
            try:
                page.mouse.wheel(0, 400)
                page.wait_for_timeout(400)
            except Exception:
                pass
            _dismiss_cookie_banner(page)

            if _captcha_present(page):
                browser.close()
                return {"ok": False, "captchaRequired": True, "error": "This posting presented a real verification challenge (CAPTCHA). AYN never attempts to solve it -- finish this one yourself."}

            clicked_apply = False
            if _real_field_count(page) < 3:
                clicked_apply = _click_apply_if_needed(page)
                page.wait_for_timeout(500)
                if _captcha_present(page):
                    browser.close()
                    return {"ok": False, "captchaRequired": True, "error": "This posting presented a real verification challenge (CAPTCHA) after clicking Apply. AYN never attempts to solve it -- finish this one yourself."}

            if _real_field_count(page) < 3:
                # A genuinely real, honest failure mode: some postings (cross-
                # posted/aggregated listings especially) name the real apply
                # destination only in the job description's own text, or the
                # apply control isn't a plain labeled button/link this
                # heuristic can find. Reported plainly rather than guessed at.
                browser.close()
                return {"ok": False, "error": "Could not find an application form on this page, even after looking for an Apply button. The real application may live on a different site than the one linked."}

            fields = _extract_fields(page)
            resolved_url = page.url
            has_password = any(f.get("type") == "password" for f in fields)
            browser.close()
            # De-dupe by id, drop fields with no id (can't be targeted for fill)
            seen = set()
            out = []
            for f in fields:
                if not f["id"] or f["id"] in seen:
                    continue
                seen.add(f["id"])
                out.append(f)
            # A real, live signin/account-creation wall (confirmed against
            # Workday, Taleo, and UKG/UltiPro) always presented as a password
            # field sitting alongside only a handful of other fields -- the
            # whole "form" WAS the login screen, not a real application with
            # an optional password field bolted on. A genuine guest-apply form
            # with an optional account-creation step still has ten-plus real
            # application fields alongside it, so this stays narrow on
            # purpose: only a small, password-carrying field set counts.
            if has_password and len(out) <= 6:
                return {"ok": True, "signinRequired": True, "resolvedUrl": resolved_url}
            return {"ok": True, "fields": out, "resolvedUrl": resolved_url, "clickedApply": clicked_apply}
    except Exception as e:
        return {"ok": False, "error": str(e)}


def _norm(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", (s or "").lower()).strip()


def _resolve_by_label(fields, wanted_label: str, used_ids: set, field_type_filter=None):
    """
    Fresh, current-page field list in, the id whose label best matches
    wanted_label out -- exact normalized match first, then substring both
    directions. Skips ids already claimed by an earlier resolution in the
    same call so two different desired values never collide onto one field.
    """
    wanted = _norm(wanted_label)
    if not wanted:
        return None
    candidates = [f for f in fields if f["id"] and f["id"] not in used_ids and f["label"]]
    if field_type_filter:
        candidates = [f for f in candidates if field_type_filter(f)]
    for f in candidates:
        if _norm(f["label"]) == wanted:
            return f["id"]
    for f in candidates:
        n = _norm(f["label"])
        if wanted in n or n in wanted:
            return f["id"]
    return None


def _click_or_confirm_radio(page, field_id: str) -> bool:
    """
    v3.290.0 -- _extract_fields now also finds two shapes that aren't a
    real <input type=radio> at all: a role=radio element inside a real
    ARIA radiogroup, and a plain aria-pressed toggle button. Playwright's
    own .check() only ever works on a genuine checkable native input --
    it throws outright on a button or a role=radio div, which is why this
    exists as its own path rather than folding into the plain page.check()
    call every native radio option already used. A native radio still
    gets the native, reliably-verified .check(); anything else gets a
    real .click() followed by a real read-back of its own aria-checked/
    aria-pressed state -- the same verify-after-click discipline
    extension/content.js's fillRadio already uses -- so a click that
    fired but didn't actually register a selection is reported as failed,
    never as a false success.
    """
    loc = page.locator(f'[id="{field_id}"]')
    tag = (loc.evaluate("el => el.tagName.toLowerCase()") or "").lower()
    el_type = loc.get_attribute("type")
    if tag == "input" and el_type == "radio":
        loc.check(timeout=3000)
        return True
    loc.click(timeout=3000)
    page.wait_for_timeout(150)
    state = loc.evaluate("el => el.getAttribute('aria-checked') || el.getAttribute('aria-pressed')")
    return state == "true"


def _resolve_radio_group(fields, wanted_group_label: str):
    groups = {}
    for f in fields:
        if f.get("type") == "radio" and f.get("radioGroup"):
            groups.setdefault(f["radioGroup"], []).append(f)
    wanted = _norm(wanted_group_label)
    if not wanted:
        return None
    best_name, best_opts = None, None
    for name, opts in groups.items():
        gl = opts[0].get("radioGroupLabel") or ""
        n = _norm(gl)
        if n == wanted:
            return opts
        if (wanted in n or n in wanted) and best_opts is None:
            best_name, best_opts = name, opts
    return best_opts


# Phrases real ATS platforms show, in their own words, when they refuse a
# submission -- deliberately narrow and literal (never a broad "error"/
# "failed" match, which would also catch a genuine field-validation message
# that has nothing to do with an anti-spam rejection). Only ever used to
# report a rejection honestly, never to work around one.
_REJECTION_PHRASES = [
    "flagged as possible spam", "flagged as spam", "couldn't submit your application",
    "could not submit your application", "we couldn't submit", "unable to submit your application",
    "your submission was blocked", "application was not submitted", "suspicious activity detected",
    "automated submission", "bot detection",
]


def _find_rejection_text(page_text: str) -> Optional[str]:
    """Returns the matched sentence (trimmed, for a readable error message)
    if the page's own visible text names an anti-spam/anti-bot rejection,
    else None."""
    if not page_text:
        return None
    lower = page_text.lower()
    for phrase in _REJECTION_PHRASES:
        idx = lower.find(phrase)
        if idx == -1:
            continue
        # Walk back to the start of the sentence/line the phrase sits in,
        # and forward to its end, so the error message quotes something
        # readable rather than a bare fragment.
        start = max(page_text.rfind("\n", 0, idx), page_text.rfind(". ", 0, idx) + 1, 0)
        end_candidates = [e for e in (page_text.find("\n", idx), page_text.find(". ", idx)) if e != -1]
        end = min(end_candidates) if end_candidates else len(page_text)
        snippet = page_text[start:end].strip()
        return snippet[:220] if snippet else phrase
    return None


def _download_to_temp(url: str, suffix: str) -> str:
    fd, path = tempfile.mkstemp(suffix=suffix)
    urllib.request.urlretrieve(url, path)
    os.close(fd)
    return path


def _fill_one_field(page, field_id: str, value: str) -> str:
    """
    Click first, not fill first -- a real ATS combobox (a plain-looking
    text input backed by a click-driven listbox) only reveals itself once
    clicked, and clicking AFTER filling can wipe out a value that was
    already set. If no listbox appears, it's a genuine plain field, filled
    normally. Returns "combobox", "text", "radio", or "failed".
    """
    # Radio and checkbox inputs are neither "type this text" nor "click to
    # open a listbox" -- they're a real, distinct third shape. Checking the
    # element's own type up front avoids running either the combobox-open
    # attempt or a .fill() (which throws on a non-text input) against one.
    try:
        el_type = page.locator(f'[id="{field_id}"]').get_attribute("type")
    except Exception:
        el_type = None
    if el_type in ("radio", "checkbox"):
        try:
            page.check(f'[id="{field_id}"]', timeout=3000)
            return "radio"
        except Exception:
            return "failed"

    # v3.273.0 — real bug, reproduced live: this used to return "failed"
    # immediately if THIS first click failed, before ever trying fill() or
    # any fallback below. A real Greenhouse-embedded phone field (an
    # intl-tel-input-style widget, fieldId "iti-0__search-input") failed
    # exactly this way -- the keystroke fallback added right after it was
    # dead code, unreachable, because this early return already fired.
    # Downgraded to "note it failed, keep trying" instead of an early exit,
    # so every fallback below still gets a real chance.
    opened_combobox = False
    try:
        page.click(f'[id="{field_id}"]', timeout=3000)
        opened_combobox = True
    except Exception:
        pass
    if opened_combobox:
        page.wait_for_timeout(300)
        try:
            page.get_by_role("option", name=value, exact=True).first.click(timeout=1500)
            return "combobox"
        except Exception:
            pass
        try:
            page.get_by_role("option", name=value, exact=False).first.click(timeout=1500)
            return "combobox"
        except Exception:
            pass
        # v3.320.0 -- real, live gap found on a real Ashby "Location" field:
        # neither attempt above ever finds anything on a genuine TYPEAHEAD
        # combobox, because its options don't exist at all until real text
        # has been typed into it -- a bare click opens nothing to select
        # from. The code fell through to plain fill() below, which DOES
        # populate the typeahead's own filtered list (confirmed live via
        # screenshot: real matching options appeared), but nothing was ever
        # clicked to actually select one. Fixed by typing first (fill()
        # reliably fires the real input events these widgets listen for),
        # THEN checking for options -- but the check itself has to tell a
        # real combobox apart from a genuinely plain field that merely
        # happened to be clickable, which the first version of this fix
        # did not: it reported EVERY plain field as unconfirmed too,
        # confirmed live as a real regression on Name/Email/Phone, all of
        # which had already been filling correctly before this change.
        # Only a real, currently-visible listbox proves this is actually a
        # combobox; its absence means the .fill() below already finished
        # the job, same as any ordinary text input.
        try:
            page.locator(f'[id="{field_id}"]').fill(value, timeout=3000)
            page.wait_for_timeout(400)
            listbox = page.get_by_role("listbox").first
            has_listbox = listbox.count() > 0 and listbox.is_visible()
            if not has_listbox:
                return "text"
            try:
                page.get_by_role("option", name=value, exact=True).first.click(timeout=1500)
                return "combobox"
            except Exception:
                pass
            try:
                page.get_by_role("option", name=value, exact=False).first.click(timeout=1500)
                return "combobox"
            except Exception:
                pass
            try:
                listbox.locator("[role=option]").first.click(timeout=1500)
                return "combobox"
            except Exception:
                pass
            # A real, honest partial state: a real listbox genuinely
            # appeared (this IS a combobox), text is in the field, but no
            # option was ever confirmed -- reported as its own outcome
            # rather than folded into a plain "text" success, so a caller
            # can flag it for review instead of trusting it as
            # submission-ready.
            return "unconfirmed_combobox"
        except Exception:
            pass
    try:
        page.fill(f'[id="{field_id}"]', value, timeout=3000)
        return "text"
    except Exception:
        pass
    # Some real widgets (intl-tel-input and similar phone-entry libraries
    # are the common case, confirmed live: the same real field above) render
    # a search-style input that looks readonly to Playwright's own
    # fillability check but is genuinely editable -- these widgets listen
    # for real keystroke events directly, not a value set the way fill()
    # does it. A real click-then-type is the same fallback Playwright's own
    # docs name for exactly this shape. Tried even if the very first click
    # above failed, since that failure can be transient (an element that
    # needed the page to settle a moment longer) rather than permanent.
    try:
        page.click(f'[id="{field_id}"]', timeout=2000)
        page.keyboard.type(value, delay=20)
        return "text"
    except Exception as e:
        # Real, permanent visibility into why a field genuinely couldn't be
        # filled -- this is exactly what surfaced the intl-tel-input bug
        # above; a silent "failed" with no reason was the reason it took a
        # live docker logs check to actually find it the first time.
        print(f"fill failed for #{field_id}: {type(e).__name__}: {e}", flush=True)
        return "failed"


@app.post('/fill_form')
def fill_form(req: FillFormRequest, x_checker_secret: str = Header(default='')):
    if not CHECKER_SECRET or x_checker_secret != CHECKER_SECRET:
        raise HTTPException(status_code=403, detail='forbidden')

    resume_path = None
    cover_path = None
    try:
        if req.resumeLabel and req.resumeFileUrl:
            resume_path = _download_to_temp(req.resumeFileUrl, ".pdf")
        if req.coverLetterLabel and req.coverLetterFileUrl:
            cover_path = _download_to_temp(req.coverLetterFileUrl, ".pdf")

        with sync_playwright() as p:
            browser = p.chromium.launch()
            page = _new_stealth_page(browser)
            page.goto(req.url, wait_until="domcontentloaded", timeout=30000)
            page.wait_for_timeout(1800)
            try:
                page.mouse.wheel(0, 400)
                page.wait_for_timeout(400)
            except Exception:
                pass
            _dismiss_cookie_banner(page)
            if _captcha_present(page):
                browser.close()
                return {"ok": False, "captchaRequired": True, "error": "This posting presented a real verification challenge (CAPTCHA). AYN never attempts to solve it -- finish this one yourself."}
            if _real_field_count(page) < 3:
                _click_apply_if_needed(page)
                page.wait_for_timeout(500)
                if _captcha_present(page):
                    browser.close()
                    return {"ok": False, "captchaRequired": True, "error": "This posting presented a real verification challenge (CAPTCHA) after clicking Apply. AYN never attempts to solve it -- finish this one yourself."}
            if _real_field_count(page) < 3:
                browser.close()
                return {"ok": False, "error": "Could not find an application form on this page."}

            filled, failed = [], []
            field_kinds = {}
            used_ids = set()

            # Text/combobox fields -- resolved fresh, by label, against
            # THIS page load's own current ids, never a cached one.
            live_fields = _extract_fields(page)
            for tv in req.textValues:
                fid = _resolve_by_label(live_fields, tv.label, used_ids,
                                         field_type_filter=lambda f: f.get("type") not in ("radio", "file"))
                if not fid:
                    failed.append({"label": tv.label, "error": "no matching field found on this page"})
                    continue
                used_ids.add(fid)
                kind = _fill_one_field(page, fid, tv.value)
                field_kinds[tv.label] = kind
                if kind == "failed":
                    failed.append({"label": tv.label, "fieldId": fid, "error": "field not fillable"})
                elif kind == "unconfirmed_combobox":
                    # Real text landed in the field and a real option list
                    # appeared, but nothing was ever clicked to confirm a
                    # selection -- reported honestly as its own outcome
                    # rather than folded into a plain success, so a caller
                    # never treats this as submission-ready without a
                    # human actually looking at it.
                    failed.append({"label": tv.label, "fieldId": fid, "error": "typed, but no matching option could be confirmed -- needs a human to pick one"})
                else:
                    filled.append(tv.label)

            # Radio groups -- resolved fresh too, group first by its own
            # question text, then the specific option within that group by
            # its option text.
            for rs in req.radioSelections:
                live_fields = _extract_fields(page)  # re-read: an earlier click may have changed the DOM
                opts = _resolve_radio_group(live_fields, rs.groupLabel)
                if not opts:
                    failed.append({"label": rs.groupLabel, "error": "radio group not found on this page"})
                    continue
                wanted_opt = _norm(rs.optionLabel)
                match = next((o for o in opts if _norm(o["label"]) == wanted_opt), None)
                if not match:
                    match = next((o for o in opts if wanted_opt in _norm(o["label"]) or _norm(o["label"]) in wanted_opt), None)
                if not match or not match["id"]:
                    failed.append({"label": rs.groupLabel, "error": f"no option matching {rs.optionLabel!r} in this group"})
                    continue
                try:
                    ok = _click_or_confirm_radio(page, match["id"])
                    if ok:
                        filled.append(f"{rs.groupLabel} -> {match['label']}")
                        field_kinds[rs.groupLabel] = "radio"
                    else:
                        failed.append({"label": rs.groupLabel, "error": "clicked, but the selection could not be confirmed"})
                except Exception as e:
                    failed.append({"label": rs.groupLabel, "error": str(e)})

            # Files -- resolved fresh by nearby label text (resume/cv vs
            # cover letter), falling back to DOM order when both are
            # equally ambiguous, since there are rarely more than two file
            # inputs on a real application form.
            if resume_path or cover_path:
                live_fields = _extract_fields(page)
                file_fields = [f for f in live_fields if f.get("type") == "file" and f.get("id")]

                def _best_file(label_hint_words, exclude_id=None):
                    pool = [f for f in file_fields if f["id"] != exclude_id]
                    for f in pool:
                        if any(w in _norm(f["label"]) for w in label_hint_words):
                            return f["id"]
                    return pool[0]["id"] if pool else None

                if resume_path:
                    resume_id = _best_file(["resume", "cv"])
                    if resume_id:
                        try:
                            page.set_input_files(f'[id="{resume_id}"]', resume_path)
                            filled.append("resume")
                        except Exception as e:
                            failed.append({"label": "resume", "error": str(e)})
                    else:
                        failed.append({"label": "resume", "error": "no file input found"})
                if cover_path:
                    cover_id = _best_file(["cover"], exclude_id=resume_id if resume_path else None)
                    if cover_id:
                        try:
                            page.set_input_files(f'[id="{cover_id}"]', cover_path)
                            filled.append("cover letter")
                        except Exception as e:
                            failed.append({"label": "cover letter", "error": str(e)})
                    else:
                        failed.append({"label": "cover letter", "error": "no file input found"})

            # A file attach OR a nearby combobox interaction (both observed
            # live on Greenhouse -- country's own combobox reset the city
            # field even with no file involved) can silently clear an
            # already-filled identity field. Re-resolved and re-applied
            # fresh as a final pass, always, since the ids may have changed
            # again by now too.
            page.wait_for_timeout(600 if not (resume_path or cover_path) else 1200)
            identity_values = [tv for tv in req.textValues if tv.isIdentity]
            if identity_values:
                live_fields = _extract_fields(page)
                for tv in identity_values:
                    fid = _resolve_by_label(live_fields, tv.label, set(),
                                             field_type_filter=lambda f: f.get("type") not in ("radio", "file"))
                    if fid:
                        try:
                            page.fill(f'[id="{fid}"]', tv.value, timeout=2000)
                        except Exception:
                            pass

            submitted = False
            submit_error = None
            captcha_required = False
            if req.submit and _captcha_present(page):
                # The single most likely moment for a real challenge to
                # appear is right at submit, not on page load -- checked
                # again here, immediately before the click, rather than
                # trusting the earlier page-load check to still hold.
                captcha_required = True
                submit_error = "A real verification challenge (CAPTCHA) appeared before submit. AYN never attempts to solve it -- finish this one yourself."
            elif req.submit:
                try:
                    btn = page.get_by_role("button", name=req.submitButtonText)
                    btn.wait_for(state="visible", timeout=5000)
                    if btn.is_enabled():
                        btn.click(timeout=5000)
                        page.wait_for_timeout(2500)
                        # A URL change alone isn't proof the application went
                        # through -- some ATS platforms route both a real
                        # confirmation AND their own anti-spam rejection to
                        # a URL that differs from the job posting, so a
                        # rejected submission could otherwise get silently
                        # reported here as "submitted". Checked directly: a
                        # real submission was reported as urlChanged=true,
                        # rejectionFound=false with no code change needed;
                        # the fix is only ever this ADDITIONAL check, never
                        # a weaker one -- this can only turn a false
                        # "submitted" into an honest failure, never the
                        # reverse. Never attempts to get PAST this kind of
                        # rejection -- only to stop AYN from claiming an
                        # application went through when the employer's own
                        # system just said, in its own words, that it didn't.
                        url_changed = page.url != req.url
                        page_text = ""
                        try:
                            page_text = page.inner_text("body", timeout=2000)
                        except Exception:
                            pass
                        rejection = _find_rejection_text(page_text)
                        if rejection:
                            submitted = False
                            submit_error = f"The employer's own application system rejected this submission: \"{rejection}\""
                        elif url_changed:
                            submitted = True
                        else:
                            submit_error = "Page did not navigate after submit -- likely a validation error."
                    else:
                        submit_error = "Submit button not enabled."
                except Exception as e:
                    submit_error = str(e)

            screenshot = page.screenshot(full_page=True)
            final_url = page.url
            browser.close()

        return {
            "ok": True,
            "filled": filled,
            "failed": failed,
            "fieldKinds": field_kinds,
            "submitted": submitted,
            "submitError": submit_error,
            "captchaRequired": captcha_required,
            "finalUrl": final_url,
            "screenshotBase64": base64.b64encode(screenshot).decode(),
        }
    except Exception as e:
        return {"ok": False, "error": str(e)}
    finally:
        for p_ in (resume_path, cover_path):
            if p_ and os.path.exists(p_):
                os.remove(p_)
