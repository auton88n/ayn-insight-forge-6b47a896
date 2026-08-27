import _compat_shim  # noqa: F401 -- must run before scrapegraphai.graphs import
import base64
import os
import re
import tempfile
import urllib.request
from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel
from typing import Optional, Dict
from scrapegraphai.graphs import SmartScraperGraph
from playwright.sync_api import sync_playwright

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


class FillFormRequest(BaseModel):
    url: str
    values: Dict[str, str] = {}          # fieldId -> value. Caller doesn't
                                          # need to know which of these are
                                          # plain text vs a click-driven
                                          # combobox -- /fill_form figures
                                          # that out per field, since even
                                          # visually-identical text inputs on
                                          # the same real form turned out to
                                          # be one or the other (observed
                                          # live on Greenhouse).
    identityFieldIds: Dict[str, str] = {}  # role ("first_name"/"last_name"/"email"/"phone"/"location") -> fieldId, re-applied after file attach
    resumeFieldId: Optional[str] = None
    resumeFileUrl: Optional[str] = None
    coverLetterFieldId: Optional[str] = None
    coverLetterFileUrl: Optional[str] = None
    submit: bool = False
    submitButtonText: str = "Submit application"


APPLY_BUTTON_PATTERN = re.compile(
    r"^\s*(apply( now| for this job| for this position)?|i'?m interested|start application|get started)\s*$",
    re.IGNORECASE,
)


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


def _extract_fields(page):
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
      return fields;
    }
    """)


@app.post('/extract_form')
def extract_form(req: ExtractFormRequest, x_checker_secret: str = Header(default='')):
    if not CHECKER_SECRET or x_checker_secret != CHECKER_SECRET:
        raise HTTPException(status_code=403, detail='forbidden')
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch()
            page = browser.new_page(viewport={"width": 1080, "height": 900})
            page.goto(req.url, wait_until="domcontentloaded", timeout=30000)
            page.wait_for_timeout(1500)

            clicked_apply = False
            if _real_field_count(page) < 3:
                clicked_apply = _click_apply_if_needed(page)

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
            browser.close()
            # De-dupe by id, drop fields with no id (can't be targeted for fill)
            seen = set()
            out = []
            for f in fields:
                if not f["id"] or f["id"] in seen:
                    continue
                seen.add(f["id"])
                out.append(f)
            return {"ok": True, "fields": out, "resolvedUrl": resolved_url, "clickedApply": clicked_apply}
    except Exception as e:
        return {"ok": False, "error": str(e)}


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
        el_type = page.locator(f"#{field_id}").get_attribute("type")
    except Exception:
        el_type = None
    if el_type in ("radio", "checkbox"):
        try:
            page.check(f"#{field_id}", timeout=3000)
            return "radio"
        except Exception:
            return "failed"

    try:
        page.click(f"#{field_id}", timeout=3000)
    except Exception:
        return "failed"
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
    try:
        page.fill(f"#{field_id}", value, timeout=3000)
        return "text"
    except Exception:
        return "failed"


@app.post('/fill_form')
def fill_form(req: FillFormRequest, x_checker_secret: str = Header(default='')):
    if not CHECKER_SECRET or x_checker_secret != CHECKER_SECRET:
        raise HTTPException(status_code=403, detail='forbidden')

    resume_path = None
    cover_path = None
    try:
        if req.resumeFieldId and req.resumeFileUrl:
            resume_path = _download_to_temp(req.resumeFileUrl, ".pdf")
        if req.coverLetterFieldId and req.coverLetterFileUrl:
            cover_path = _download_to_temp(req.coverLetterFileUrl, ".pdf")

        with sync_playwright() as p:
            browser = p.chromium.launch()
            page = browser.new_page(viewport={"width": 1080, "height": 900})
            page.goto(req.url, wait_until="domcontentloaded", timeout=30000)
            page.wait_for_timeout(1500)
            if _real_field_count(page) < 3:
                _click_apply_if_needed(page)
            if _real_field_count(page) < 3:
                browser.close()
                return {"ok": False, "error": "Could not find an application form on this page."}

            filled, failed = [], []
            field_kinds = {}
            for field_id, value in req.values.items():
                kind = _fill_one_field(page, field_id, value)
                field_kinds[field_id] = kind
                if kind == "failed":
                    failed.append({"fieldId": field_id, "error": "field not found or not fillable"})
                else:
                    filled.append(field_id)

            if resume_path and req.resumeFieldId:
                try:
                    page.set_input_files(f"#{req.resumeFieldId}", resume_path)
                except Exception as e:
                    failed.append({"fieldId": req.resumeFieldId, "error": str(e)})
            if cover_path and req.coverLetterFieldId:
                try:
                    page.set_input_files(f"#{req.coverLetterFieldId}", cover_path)
                except Exception as e:
                    failed.append({"fieldId": req.coverLetterFieldId, "error": str(e)})

            # A file attach OR a nearby combobox interaction (both observed
            # live on Greenhouse -- country's own combobox reset the city
            # field even with no file involved) can silently clear an
            # already-filled identity field. Re-applying them as a final
            # pass, always, is cheap and can only help.
            page.wait_for_timeout(600 if not (resume_path or cover_path) else 1200)
            for role, field_id in req.identityFieldIds.items():
                if field_id in req.values:
                    try:
                        page.fill(f"#{field_id}", req.values[field_id], timeout=2000)
                    except Exception:
                        pass

            submitted = False
            submit_error = None
            if req.submit:
                try:
                    btn = page.get_by_role("button", name=req.submitButtonText)
                    btn.wait_for(state="visible", timeout=5000)
                    if btn.is_enabled():
                        btn.click(timeout=5000)
                        page.wait_for_timeout(2500)
                        submitted = page.url != req.url
                        if not submitted:
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
            "finalUrl": final_url,
            "screenshotBase64": base64.b64encode(screenshot).decode(),
        }
    except Exception as e:
        return {"ok": False, "error": str(e)}
    finally:
        for p_ in (resume_path, cover_path):
            if p_ and os.path.exists(p_):
                os.remove(p_)
