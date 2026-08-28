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
            _dismiss_cookie_banner(page)

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
        pass
    # Some real widgets (intl-tel-input and similar phone-entry libraries
    # are the common case, confirmed live: a real Greenhouse-embedded phone
    # field resolved to id "iti-0__search-input" and refused fill() outright
    # with "field not fillable") render a search-style input that looks
    # readonly to Playwright's own fillability check but is genuinely
    # editable -- these widgets listen for real keystroke events directly,
    # not a value set the way fill() does it. A real click-then-type is the
    # same fallback Playwright's own docs name for exactly this shape.
    try:
        page.click(f"#{field_id}", timeout=2000)
        page.keyboard.type(value, delay=20)
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
        if req.resumeLabel and req.resumeFileUrl:
            resume_path = _download_to_temp(req.resumeFileUrl, ".pdf")
        if req.coverLetterLabel and req.coverLetterFileUrl:
            cover_path = _download_to_temp(req.coverLetterFileUrl, ".pdf")

        with sync_playwright() as p:
            browser = p.chromium.launch()
            page = browser.new_page(viewport={"width": 1080, "height": 900})
            page.goto(req.url, wait_until="domcontentloaded", timeout=30000)
            page.wait_for_timeout(1500)
            _dismiss_cookie_banner(page)
            if _real_field_count(page) < 3:
                _click_apply_if_needed(page)
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
                    page.check(f"#{match['id']}", timeout=3000)
                    filled.append(f"{rs.groupLabel} -> {match['label']}")
                    field_kinds[rs.groupLabel] = "radio"
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
                            page.set_input_files(f"#{resume_id}", resume_path)
                            filled.append("resume")
                        except Exception as e:
                            failed.append({"label": "resume", "error": str(e)})
                    else:
                        failed.append({"label": "resume", "error": "no file input found"})
                if cover_path:
                    cover_id = _best_file(["cover"], exclude_id=resume_id if resume_path else None)
                    if cover_id:
                        try:
                            page.set_input_files(f"#{cover_id}", cover_path)
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
                            page.fill(f"#{fid}", tv.value, timeout=2000)
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
