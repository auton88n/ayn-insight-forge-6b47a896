/**
 * AYN Auto-Apply — frame agent.
 *
 * v3.294.0 -- pulled out of content.js so the exact same extraction/fill
 * core can run in EVERY frame of a page, not just the top one. A real,
 * confirmed gap, found by a heavy synthetic stress pass: an application
 * form embedded in an <iframe> (same-origin or cross-origin -- this
 * extension's own host_permissions already cover essentially any https origin
 * enough for either) was completely invisible before this, since
 * background.js only ever injected content.js into the top frame.
 *
 * Injected into EVERY frame via allFrames:true (see background.js).
 * A sub-frame (window !== window.top) runs its own local extraction
 * immediately and reports the result up through the background script
 * (chrome.runtime.sendMessage has no cross-frame targeting of its own --
 * the background script is what relays a sub-frame's report to the top
 * frame, and a fill instruction back down to the right sub-frame, since
 * only the background script has chrome.tabs.sendMessage's own
 * frameId-targeting available at all). The top frame (content.js, a
 * SEPARATE script injected only into frame 0, sharing this same
 * execution context since both are ISOLATED-world content scripts in
 * the same frame) calls the functions this file exposes on window
 * directly for its own local extraction, and additionally listens for
 * AYN_FRAME_REPORT messages arriving from other frames to merge in.
 *
 * Deliberately v1-scoped: only the DETERMINISTIC layer (native inputs,
 * ARIA radiogroups, aria-pressed toggle groups, role=combobox triggers)
 * runs across frames. The AI-classified "unrecognized widget" layer
 * (Form Intelligence) stays top-frame-only for now -- confirmed by the
 * same stress pass that found this gap, the deterministic layer alone
 * already accounts for the overwhelming majority of real fields (54 of
 * 58 in that pass), and relaying a full classify-then-fill round trip
 * through a sub-frame is real, separate follow-up work, not silently
 * skipped without saying so.
 */
(() => {
  let fieldRegistry = new Map();

  // v3.293.0 -- a heavy synthetic stress pass across ~15 form/DOM
  // categories found this real, confirmed gap: offsetParent/getClientRects
  // both stay non-empty for a plain visibility:hidden element (it still
  // takes up real layout space, just isn't painted) -- the exact same
  // "don't touch this" signal display:none already gives correctly.
  // Genuinely different from opacity:0 or an off-screen position (both
  // deliberately still left findable -- a common, legitimate real-world
  // pattern where a real native input sits under a styled visual
  // replacement, and the native input IS the one that actually submits),
  // since visibility:hidden has no such legitimate "still functionally
  // present" use on a real application field.
  function visible(el) {
    if (el.offsetParent === null && el.getClientRects().length === 0) return false;
    return getComputedStyle(el).visibility !== "hidden";
  }

  // v3.298.0 -- a real, live bug found on a real Lever application form
  // (Mytos): a resume-upload widget's own `<label>` wraps not just its
  // real, always-shown caption ("ATTACH RESUME/CV") but also three
  // mutually-exclusive status spans for other states ("Couldn't
  // auto-read resume.", "Analyzing resume...", "Success!"), each hidden
  // via CSS until its own state is active. Reading the label with plain
  // `.textContent` -- what labelFor and siblingText both did -- ignores
  // visibility entirely and concatenates all of them into one garbled
  // string. A location-autocomplete widget on the same real page showed
  // the identical failure shape, its dropdown's own hidden "No results"/
  // "Loading" messages folded into the field's caption. visibleText()
  // walks a subtree and skips any element (and everything inside it)
  // that visible() says isn't currently shown, so only the text a real
  // person would actually see survives.
  function visibleText(el) {
    let out = "";
    for (const node of el.childNodes) {
      if (node.nodeType === 3) { out += node.textContent; continue; }
      if (node.nodeType !== 1 || !visible(node)) continue;
      // v3.298.0 -- a real, live bug found on a real Workable application
      // form: a decorative SVG upload icon carried a real, valid
      // accessibility fallback (<desc><p>SVGs not supported by this
      // browser.</p></desc>) and the svg element itself was explicitly
      // marked aria-hidden="true" -- correctly telling assistive tech,
      // and by the same logic anything computing a real label, to skip
      // it entirely. It still passes visible() (it has a real, visually
      // rendered box), so without this check its fallback text bled
      // straight into the file field's own label ("Resume") the same
      // way a CSS-hidden status span did on the Mytos bug above. Any
      // subtree explicitly marked aria-hidden is exactly as invisible to
      // a real person's understanding of the page as a CSS-hidden one.
      if (node.getAttribute("aria-hidden") === "true") continue;
      out += visibleText(node);
    }
    return out;
  }

  // v3.299.0 -- a real, live bug found on Personio's own bespoke
  // application form: a real, genuine third-party bug, not anything AYN
  // did wrong reading it -- their own React component shipped a literal,
  // untranslated i18n placeholder key, aria-label="label", instead of a
  // real accessible name. aria-label is normally the single most
  // authoritative signal a field can carry (a developer's own deliberate,
  // explicit choice), which is exactly why blindly trusting it here
  // returned the literal word "label" as the field's question --
  // meaningless, and it also meant this never got a real chance to fall
  // through to the field's own <fieldset><legend> (confirmed live, holds
  // the real "Current Location" text) sitting right there. Deliberately
  // narrow: only the EXACT literal string "label" is treated as a
  // non-answer, the one concrete value this was actually seen shipping --
  // a real, legitimate aria-label that happens to contain other words is
  // never second-guessed. Shared by labelFor and candidateNearbyText,
  // both of which trust a raw aria-label as their own first, strongest
  // signal.
  function isPlaceholderAriaLabel(s) {
    return /^label$/i.test(s);
  }

  // v3.301.0 -- a real, live bug found on careers.hireology.com: a select
  // wired with technically-correct <label for="..."> semantics whose own
  // text is just the UI's floating-placeholder chrome ("Select"), not any
  // real question -- the actual caption ("Do you have a legal right to
  // work for any employer in the United States?") sits two levels up as
  // a sibling <p class="...fieldset__component-title">, which labelFor's
  // own ancestor-climb fallback would have found correctly if the
  // label[for] branch hadn't already returned first and stopped looking.
  // Unlike GENERIC_PLACEHOLDER (used for el.placeholder, a startsWith
  // check -- correct there, since a real caption legitimately CAN open
  // with "Select..."), this has to anchor both ends: a label[[for]]
  // element exists specifically to BE the caption, so only reject it
  // when its entire text is nothing but the bare placeholder word itself.
  const BARE_GENERIC_LABEL = /^(select|choose|search|type here|start typing)[.:…]*$/i;
  function isBareGenericLabel(s) {
    return BARE_GENERIC_LABEL.test(s.trim());
  }

  // v3.298.0 -- shared by labelFor's aria-labelledby check and, below, the
  // native-radio group-label lookup's own aria-labelledby check on an
  // ancestor fieldset -- resolves an aria-labelledby id list to the real,
  // visible text of whatever it references, joined in order.
  function resolveLabelledBy(idList) {
    const parts = idList.split(/\s+/).map((id) => {
      const target = document.getElementById(id);
      return target ? visibleText(target).trim() : "";
    }).filter(Boolean);
    return parts.join(" ");
  }

  // Generic UI copy that occasionally ends up as a placeholder -- never a
  // real question, and showing it as one is actively misleading (worse
  // than showing nothing). Reported directly, a real screenshot: "Start
  // typing…" appeared in AYN's own summary as if it were the field's
  // actual question.
  const GENERIC_PLACEHOLDER = /^(start typing|select|choose|search|type here)/i;

  // v3.296.0 -- shared by siblingText and candidateNearbyText: a previous
  // sibling that is ITSELF a real interactive control (or a container
  // built entirely around one, e.g. an ARIA-role widget) is never a real
  // label, it's a DIFFERENT field's own trigger/value -- confirmed live,
  // a real bug: a phone number input sitting right after a country-code
  // combobox trigger ("+1 US") picked up that button's own displayed
  // text as its label instead of the real "Phone number" label two
  // levels further out, a confidently-wrong result the "unlabeled beats
  // wrong" principle already documented on labelFor's own ancestor-climb
  // removal says is worse than staying honestly unlabeled.
  const NEARBY_TEXT_EXCLUDED_SELECTOR = "button, input, select, textarea, a, nav";
  const NEARBY_TEXT_EXCLUDED_ROLES = '[role="option"], [role="listbox"], [role="menu"], [role="menuitem"], [role="dialog"], [role="tooltip"], [role="combobox"], [role="radiogroup"], [role="radio"]';
  function isInteractiveNonLabelNode(n) {
    if (n.nodeType !== 1) return false;
    if (n.matches(NEARBY_TEXT_EXCLUDED_SELECTOR) || n.querySelector(NEARBY_TEXT_EXCLUDED_SELECTOR)) return true;
    if (n.matches(NEARBY_TEXT_EXCLUDED_ROLES) || n.querySelector(NEARBY_TEXT_EXCLUDED_ROLES)) return true;
    return false;
  }

  // v3.293.0 -- widened from previousElementSibling to previousSibling: a
  // real, common markup shape ("<div>Question text <input></div>", the
  // question as a bare text node with no wrapping span at all) was
  // confirmed invisible to this walk, since it only ever stepped between
  // ELEMENT siblings and a bare text node isn't one. A purely-whitespace
  // text node (extremely common between elements in real, indented
  // markup) doesn't spend a hop, so this reaches exactly as far as before
  // through ordinary formatting whitespace, just no longer blind to real
  // text that was never wrapped in anything.
  function siblingText(node, hops) {
    let n = node, h = 0;
    while (n && h < hops) {
      const t = ((n.nodeType === 3 ? n.textContent : visibleText(n)) || "").trim();
      // v3.296.0 -- an interactive sibling's own text (a button's label,
      // a link) is never a real question label, it's that OTHER control's
      // own displayed value/text -- skip using it, but still spend the
      // hop and keep walking, the same as any other non-text sibling.
      // v3.298.0 -- 200 to 600: found live on the same real Lever
      // application as the two fixes above, sitting right next to them --
      // a genuine, real behavioral-interview question ("We're skeptical
      // when people say 'it's impossible!'...", 434 characters) came back
      // honestly unlabeled because its own real caption was longer than
      // the old 200-char cap, even though every other real caption on the
      // same page (some over 100 chars themselves) correctly resolved.
      // Real custom application questions routinely run this long; 600
      // still guards against absorbing an unrelated full paragraph of
      // page body text as a false label.
      if (t && t.length < 600 && !isInteractiveNonLabelNode(n)) return t;
      if (n.nodeType !== 3 || t) h++;
      n = n.previousSibling;
    }
    return "";
  }

  // v3.301.0 -- deliberately NOT siblingText(): a real consent-checkbox
  // caption almost always contains one or two inline document links
  // ("...terms and conditions & privacy policy", both real <a> tags) as
  // a completely normal part of the real caption text, not a sign this
  // sibling is actually some OTHER control's own label. siblingText's
  // own isInteractiveNonLabelNode check disqualifies any node with an
  // anchor anywhere inside it (a querySelector, not a self-only match),
  // which is exactly right for its other callers but wrong for this one
  // -- it would reject essentially every real consent checkbox's real
  // caption. This only rejects a sibling that IS ITSELF an interactive
  // element (a button, a second input, an actual link used as the whole
  // sibling), not one that merely contains an interactive descendant.
  function consentCaptionAfter(node, hops) {
    let n = node, h = 0;
    while (n && h < hops) {
      if (n.nodeType === 1 && ["BUTTON", "INPUT", "SELECT", "TEXTAREA", "NAV"].includes(n.tagName)) {
        h++; n = n.nextSibling; continue;
      }
      const t = ((n.nodeType === 3 ? n.textContent : visibleText(n)) || "").trim();
      if (t && t.length < 600) return t;
      if (n.nodeType !== 3 || t) h++;
      n = n.nextSibling;
    }
    return "";
  }

  function labelFor(el) {
    if (el.id) {
      const byFor = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
      // v3.298.0 -- visibleText(), not raw textContent -- see its own
      // comment; a label[for] can wrap the same kind of hidden
      // multi-state status text a wrapping <label> can.
      const byForText = byFor ? visibleText(byFor).trim() : "";
      if (byForText && !isBareGenericLabel(byForText)) return byForText;
    }
    const aria = el.getAttribute("aria-label");
    if (aria && aria.trim() && !isPlaceholderAriaLabel(aria.trim())) return aria.trim();
    const labelledBy = el.getAttribute("aria-labelledby");
    if (labelledBy) {
      // v3.298.0 -- resolveLabelledBy(), not a bare textContent read: the
      // referenced element can carry the exact same hidden-text problem
      // visibleText() exists to solve.
      const resolved = resolveLabelledBy(labelledBy);
      if (resolved) return resolved;
    }
    const wrappingLabel = el.closest("label");
    // v3.298.0 -- a real, live bug found on a real Lever application
    // (Mytos): a resume-upload widget's own wrapping <label> held three
    // hidden, mutually-exclusive status spans ("Couldn't auto-read
    // resume.", "Analyzing resume...", "Success!") alongside its real,
    // always-visible caption ("ATTACH RESUME/CV") -- plain textContent
    // concatenated all four into one garbled label. visibleText() only
    // includes what a real person actually sees right now.
    const wrappingLabelText = wrappingLabel ? visibleText(wrappingLabel).trim() : "";
    if (wrappingLabelText) return wrappingLabelText;
    const direct = siblingText(el.previousSibling, 3);
    if (direct) return direct;
    // v3.301.0 -- a checkbox/radio's own real caption commonly FOLLOWS
    // it in the markup, not precedes it -- found live on a genuinely new
    // ATS platform (careers-page.com): "<input type=checkbox> <span>I
    // agree to the terms and conditions & privacy policy</span>", no id,
    // no for, no wrapping label, no aria-label at all. A text input's
    // trailing sibling is almost never its own label (far more likely
    // to be help text or an unrelated adjacent element), which is why
    // this stays scoped to checkbox/radio specifically -- the one
    // control shape where "caption comes after" is itself the common,
    // expected pattern, not an edge case.
    if (el.type === "checkbox" || el.type === "radio") {
      const after = consentCaptionAfter(el.nextSibling, 3);
      if (after) return after;
    }
    // v3.280.0 -- an ancestor-climbing fallback was tried here for deeply
    // nested combobox widgets (react-select and similar, common on
    // Ashby), and caught by testing it directly against a real DOM before
    // shipping: it can walk past the actual field's own container and
    // pick up a DIFFERENT, nearby field's question instead -- confidently
    // wrong, which is worse than this field honestly coming back
    // unlabeled. Removed rather than shipped; a genuinely unlabeled field
    // now stays unlabeled (see extractFields' own fallback text) instead
    // of risking a mismatched label.
    // v3.298.0 -- a narrower, real ancestor climb added back, grounded in
    // a real, confirmed shape found on the same Lever form: a genuine
    // "<div><div class=question-label>...</div><div
    // class=question-field><textarea></div></div>" pattern, four custom
    // questions on one real application, every one honestly unlabeled
    // before this because the field's own direct previous sibling is
    // nothing (it's the sole child of its own wrapper). This reuses the
    // exact safety condition candidateNearbyText already proved out for
    // this same shape: only ever climb past a wrapper while el is
    // genuinely that wrapper's one and only child, so this can never
    // reach past the field's own container into a DIFFERENT field's
    // territory the way the removed v3.280.0 attempt could -- a shared
    // container with more than one child stops the climb immediately.
    // v3.299.0 -- "one and only child" turned out to be too strict for a
    // real, extremely common shape, found live on Personio's own
    // application form: a styled <select>'s own wrapper div almost
    // always has a second child too, a purely decorative dropdown-arrow
    // <svg> sitting right next to it -- meaning the climb stopped at hop
    // 0 for essentially any custom-styled select, never even reaching
    // one level up, let alone the real <fieldset><legend> two levels up
    // that was sitting right there. isDecorativeChild lets a sibling
    // that carries no real text AND isn't itself a real control (an
    // icon, an empty spacer span) not count against the "only child"
    // check, while a sibling that DOES carry real text or IS itself a
    // control still stops the climb exactly as before -- the original
    // safety guarantee (never climb past a container holding a
    // different field's own real content) is unchanged, only decoration
    // is now correctly ignored.
    function isDecorativeChild(node) {
      if (node.nodeType !== 1) return true;
      if (node.tagName === "SVG") return true;
      if (isInteractiveNonLabelNode(node)) return false;
      // v3.301.0 -- a real, live bug found on careers.hireology.com,
      // the other half of the same fix as isBareGenericLabel(): a
      // floating <label for="..."> sibling whose entire text is just
      // the select's own UI-chrome placeholder ("Select") is real,
      // non-decorative DOM content by every other measure here (it has
      // real, visible text) -- but it isn't meaningful CONTENT for the
      // purposes of "does this container already hold a different
      // field's real caption," which is the one question this climb is
      // actually trying to answer. Left uncaught, this exact sibling
      // stopped the climb one hop before it ever reached the real
      // caption ("Do you have a legal right to work...") sitting as a
      // sibling of this container's own parent.
      if (node.tagName === "LABEL" && isBareGenericLabel(visibleText(node))) return true;
      return !visibleText(node).trim();
    }
    let anc = el;
    for (let hop = 0; hop < 2; hop++) {
      const parent = anc.parentElement;
      if (!parent) break;
      const meaningfulSiblings = Array.from(parent.children).filter((c) => c !== anc && !isDecorativeChild(c));
      if (meaningfulSiblings.length > 0) break;
      const climbed = siblingText(parent.previousSibling, 3);
      if (climbed) return climbed;
      anc = parent;
    }
    if (el.placeholder && el.placeholder.trim() && !GENERIC_PLACEHOLDER.test(el.placeholder.trim())) {
      return el.placeholder.trim();
    }
    return "";
  }

  // v3.283.0 -- reported directly: a slider-style distance/radius filter
  // (unit toggle, live value label, step ticks, min/max bounds, a
  // custom-number override) doesn't belong on an application form to
  // begin with -- it's a SEARCH preference, the same category as "how
  // far are you willing to commute," not a fact AYN has a single right
  // answer for. The real, general point underneath it stands though:
  // a range/slider input is its own distinct control type, and AYN
  // should never try to write an arbitrary matched string into one --
  // unlike a text box, a slider's value is only ever meaningful as a
  // specific number within its own min/max, and there is no fact in a
  // profile that translates to "the correct point on this scale."
  // Recognized explicitly and always left for the person to set
  // themselves, the same honest treatment as a file attachment.
  // v3.285.0 -- a real, adoptable improvement: some ATS platforms build
  // their form widgets as real web components with a closed-off shadow
  // DOM, and a plain document.querySelectorAll never sees inside one --
  // that part of the form was silently invisible before this, the same
  // failure shape as the ARIA-radiogroup gap fixed earlier this session,
  // just for a different reason. Recurses into every OPEN shadow root
  // found anywhere in the tree (a genuinely closed shadow root -- mode:
  // "closed" -- is deliberately unreachable from outside its own
  // component by the platform itself; no page script, this extension
  // included, can see into one, which is a real, disclosed limit, not a
  // bug to chase).
  function queryDeep(root, selector) {
    const found = Array.from(root.querySelectorAll(selector));
    for (const el of root.querySelectorAll("*")) {
      if (el.shadowRoot) found.push(...queryDeep(el.shadowRoot, selector));
    }
    return found;
  }

  // v3.294.0 -- reported directly, a real gap a heavy stress pass
  // confirmed live: extraction has never scoped to a single <form>,
  // since a real, common shape (Ashby and others) has NO <form> element
  // wrapping the actual application at all -- a plain document-wide scan
  // was the only way to find those fields at all. The accepted cost of
  // that: a genuinely unrelated widget elsewhere on the SAME page (a
  // newsletter signup in a sidebar, say) gets swept into extraction too,
  // and if its own label happens to resemble a real identity field, it
  // could get filled along with the real application. A real, safe
  // middle ground: when the page DOES have more than one real <form>,
  // and at least one of them looks like a genuine application (3+ real
  // fillable-looking descendants), scope to the LARGEST one instead of
  // the whole document -- closes the demonstrated risk for the common
  // "one real form plus one small unrelated widget" shape. A genuinely
  // form-less page (zero or exactly one form -- the actual Ashby-style
  // case this was built for) keeps the original whole-document behavior
  // completely untouched, so that case is never affected by this at all.
  function pickScanRoot() {
    const forms = Array.from(document.querySelectorAll("form"));
    if (forms.length < 2) return document;
    const candidates = forms
      .map((f) => ({ f, count: f.querySelectorAll("input, textarea, select, button").length }))
      .filter((x) => x.count >= 3)
      .sort((a, b) => b.count - a.count);
    return candidates.length ? candidates[0].f : document;
  }

  // v3.297.0 -- see the file-input branch below for the real, live gap
  // this closes. Deliberately narrow: only the input's own parent and
  // grandparent are searched (a real file-upload widget's trigger button
  // is essentially always a close sibling, never further away), and only
  // a button whose own text/aria-label actually reads like an upload
  // action counts -- an unrelated visible button that happens to sit
  // nearby (a "Remove"/"Cancel" button in the same row, say) is never
  // mistaken for the trigger.
  const UPLOAD_TRIGGER_TEXT_RE = /upload|select file|choose file|browse|attach|add (a )?file|add resume/i;
  function nearbyUploadTrigger(el) {
    let container = el.parentElement;
    for (let hop = 0; hop < 2 && container; hop++) {
      const btn = Array.from(container.querySelectorAll("button, [role='button']")).find(
        (b) => visible(b) && UPLOAD_TRIGGER_TEXT_RE.test((b.textContent || b.getAttribute("aria-label") || "").trim())
      );
      if (btn) return btn;
      container = container.parentElement;
    }
    return null;
  }

  function extractFields() {
    fieldRegistry = new Map();
    const out = [];
    const skipped = [];
    let n = 0;
    const seenRadioGroups = new Set();
    const root = pickScanRoot();
    for (const el of queryDeep(root, "input, textarea, select")) {
      if (el.disabled) continue;
      const type = (el.getAttribute("type") || el.tagName.toLowerCase()).toLowerCase();
      // v3.293.0 -- password added: never a fact anything in a real AYN
      // profile could answer, the same reasoning hidden/submit/button/
      // reset/image were already excluded for -- previously relied on
      // nothing in a profile happening to match "Create a password"
      // rather than being excluded on purpose, the one input type here
      // that wasn't.
      if (["hidden", "submit", "button", "reset", "image", "password"].includes(type)) continue;

      if (type === "file") {
        // v3.293.0 -- a real, extremely common upload pattern, found by a
        // heavy synthetic stress pass: the native file input itself is
        // display:none, with a styled <label> (wrapping it, or linked via
        // for=) as the actual visible "Upload" trigger -- native
        // file-input styling is notoriously hard to control directly, so
        // most real forms hide the raw input and style its label instead.
        // The input's own invisibility was never a real reason to skip
        // attaching to it -- DataTransfer-based file injection doesn't
        // need the input to be visually rendered at all -- only a reason
        // the blanket visibility filter below (built for every other
        // input type, where invisible genuinely does mean "don't touch")
        // wrongly caught this one too. Still requires a genuinely visible
        // trigger somewhere, so a truly, fully hidden file input (no
        // visible label anywhere) stays correctly excluded.
        // v3.297.0 -- a second, equally common real trigger shape, found
        // live on real Ashby and Workday application forms during a
        // direct training pass: a plain <button>Upload file</button> or
        // <button>Select file</button> with NO <label> relationship to
        // the input at all -- it forwards a click to the hidden input via
        // a JS ref/onClick handler instead of semantic markup, so the
        // <label>-only check above never finds it and the input was
        // silently skipped, even with a real, visible, unambiguous
        // "Upload" button sitting right next to it. nearbyUploadTrigger
        // covers this second shape -- scoped to the input's own immediate
        // container (never a page-wide search), so it can't attach to an
        // unrelated upload button elsewhere on the page.
        const trigger = (el.id && document.querySelector(`label[for="${CSS.escape(el.id)}"]`)) || el.closest("label") || nearbyUploadTrigger(el);
        if (!visible(el) && !(trigger && visible(trigger))) continue;
        const fid = `ayn-f-${n++}`;
        fieldRegistry.set(fid, el);
        out.push({ id: fid, tag: "input", type: "file", required: !!el.required, label: labelFor(el) || "Attachment" });
        continue;
      }
      if (!visible(el)) continue;

      if (type === "range") {
        skipped.push(labelFor(el) || "A slider or range control on this page");
        continue;
      }
      if (type === "radio") {
        const name = el.name || "";
        if (!name) continue;
        const groupLabel = seenRadioGroups.has(name) ? undefined : (() => {
          const fieldset = el.closest("fieldset");
          // v3.298.0 -- a real, live bug found on a real Workable
          // application form: a genuine role="radiogroup" fieldset, with
          // a real, standard aria-labelledby pointing at the actual
          // question text elsewhere on the page, was never reaching this
          // function at all -- confirmed the fieldset's own visible()
          // check was failing (its visual styling lives entirely on the
          // inner option elements, common when a design system reskins a
          // native radiogroup), so extraction fell through from the
          // dedicated ARIA-radiogroup scan to this native <input>-level
          // path, which never once checked the ancestor fieldset's own
          // aria-labelledby/aria-label at all -- only its legend. This is
          // exactly the same real, standard signal the ARIA-radiogroup
          // scan already trusts (group.getAttribute("aria-label") ||
          // labelFor(group)), just added to the one path that could reach
          // this fieldset when that scan's own visibility check couldn't.
          if (fieldset) {
            const flAria = fieldset.getAttribute("aria-label");
            if (flAria && flAria.trim()) return flAria.trim();
            const flLabelledBy = fieldset.getAttribute("aria-labelledby");
            if (flLabelledBy) {
              const resolved = resolveLabelledBy(flLabelledBy);
              if (resolved) return resolved;
            }
          }
          const legend = fieldset?.querySelector("legend")?.textContent?.trim();
          if (legend) return legend;
          // v3.299.0 -- a real, live shape found on a real Ashby EEO
          // question: no <legend> at all -- the group's own real
          // question ("What's the largest number of engineers under
          // your management hierarchy?") is a plain <label> that is a
          // DIRECT CHILD of the fieldset itself, a sibling of each real
          // option's own wrapper div, not nested inside any of them.
          // Scoped deliberately to fieldset.children (not
          // fieldset.querySelector("label"), which would also match a
          // label buried inside one specific option's own div) so this
          // can only ever find a genuine group-level caption, never one
          // option's own per-answer label.
          const directChildLabel = fieldset
            ? Array.from(fieldset.children).find((c) => c.tagName === "LABEL")
            : null;
          if (directChildLabel) {
            const t = visibleText(directChildLabel).trim();
            if (t) return t;
          }
          const own = labelFor(el);
          // v3.293.0 -- a real, confirmed bug: with no <fieldset>/
          // <legend>, a radio wrapped in its own per-option <label>
          // ("<label><input type=radio> Yes</label>") makes labelFor(el)
          // correctly find that wrapping label -- but its text is just
          // this ONE option's own answer ("Yes"), not the group's real
          // question, and labelFor has no way to tell "a label wrapping
          // only this option" apart from a genuine group label on its
          // own. Reporting a wrong question with high confidence is
          // worse than reporting none -- degrade to genuinely unlabeled
          // here instead, the same "confidently wrong beats honestly
          // unlabeled, except backwards" principle already governs
          // labelFor's own ancestor-climbing removal above.
          // v3.299.0 -- a real, live, second version of the exact same
          // failure found on a real Ashby EEO/demographic question
          // ("How many years have you managed a team?"): each option's
          // own native <input> carried a real, legitimate aria-label set
          // to its own option text ("I haven't managed before (e.g.,
          // Tech Lead)") -- perfectly good, self-describing markup for
          // that ONE option, but labelFor(el) returns aria-label before
          // it ever reaches the ownWrap check above, so this exact same
          // "just my own answer, not the group's real question" mistake
          // slipped past the v3.293.0 guard, which only ever checked a
          // wrapping <label>, never a direct aria-label. Checked here
          // too, so either shape degrades to honestly unlabeled instead
          // of confidently repeating one option's own text as if it were
          // the whole group's question.
          if (ownWrapOrAriaMatches(el, own)) {
            // v3.299.0 -- a real, live shape found on a real Breezy HR
            // (AngularJS) application form: no <fieldset> anywhere, just
            // a bare "<h3>Question<span class=required>*</span></h3><ul
            // class=options><li><label><input/><span>Answer</span>
            // </label></li>...</ul>" -- every fieldset-based attempt
            // above correctly finds nothing to search, since there is no
            // fieldset. The one real, reliable structural fact left: the
            // <ul> is the smallest real element containing EVERY radio
            // that shares this name, and its own previous sibling is the
            // real question. Deliberately the last resort, tried only
            // once every earlier, more specific signal has already
            // failed -- this can't mistake one option's own answer for
            // the group question the way the removed v3.280.0 label For
            // climb could, since it never looks at anything narrower
            // than the group's own true common container.
            return groupCommonAncestorCaption(name) || undefined;
          }
          return own;

          function groupCommonAncestorCaption(radioName) {
            const all = Array.from(document.getElementsByName(radioName)).filter((r) => r.tagName === "INPUT" && r.type === "radio" && visible(r));
            if (all.length < 2) return null;
            let anc = all[0];
            while (anc && !all.every((r) => anc.contains(r))) anc = anc.parentElement;
            if (!anc) return null;
            return siblingText(anc.previousSibling, 3) || null;
          }

          function ownWrapOrAriaMatches(el, own) {
            const ownWrap = el.closest("label");
            if (ownWrap && own === ownWrap.textContent.trim()) return true;
            const ariaLabel = el.getAttribute("aria-label");
            if (ariaLabel && own === ariaLabel.trim()) return true;
            // v3.299.0 -- the real mechanism behind the Ashby EEO bug
            // above: labelFor(el)'s own byFor lookup (label[for=el.id])
            // finds a real, valid per-option label ("I haven't managed
            // before...") that is a genuine sibling of el, not a
            // wrapper -- el.closest("label") never catches this shape at
            // all. Re-checked directly here the same way.
            if (el.id) {
              const byFor = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
              if (byFor && own === visibleText(byFor).trim()) return true;
            }
            return false;
          }
        })();
        seenRadioGroups.add(name);
        const fid = `ayn-f-${n++}`;
        fieldRegistry.set(fid, el);
        out.push({ id: fid, tag: "input", type: "radio", required: !!el.required, label: labelFor(el), radioGroup: name, radioGroupLabel: groupLabel });
        continue;
      }
      const fid = el.id && !fieldRegistry.has(el.id) ? el.id : `ayn-f-${n++}`;
      fieldRegistry.set(fid, el);
      const tag = el.tagName.toLowerCase();
      // A genuinely unlabeled field still needs a real, honest name in
      // the summary rather than a blank line -- never a guessed question.
      out.push({ id: fid, tag, type: tag === "select" ? "select" : tag === "textarea" ? "textarea" : type, required: !!el.required, label: labelFor(el) || "An unlabeled field on this page" });
    }

    // v3.282.0 -- reported directly, a real screenshot: a "Yes/No" legal
    // question (work authorization) rendered as a segmented button pair,
    // not a native <input type=radio>, so the scan above never saw it at
    // all -- silently invisible to the whole matching/fill pipeline, no
    // fill attempted, nothing reported either way. Custom toggle-button
    // widgets almost always carry the ARIA role= a real radio group needs
    // for accessibility even when they skip the native <input> element --
    // recognized here the same way a screen reader would.
    // v3.298.0 -- a real, live duplicate found on a real Workable
    // application form: a genuine role="radiogroup" whose visible()
    // check on the fieldset itself is timing-dependent (its own visual
    // styling lives entirely on the inner option elements, not the
    // fieldset's own box) meant this scan sometimes missed the group
    // entirely, other times caught it -- and on a run where it DID
    // catch it, the earlier native-<input type=radio> loop above had
    // ALREADY registered the exact same two options (matched by their
    // real "name" attribute, its own group-label logic just fixed above
    // to reach the same real aria-labelledby text) -- so the person saw
    // the identical question listed twice, under two different group
    // ids, either of which could receive the fill. Registered elements
    // already claimed by the native scan are skipped here rather than
    // registered a second time, the same dedup discipline the combobox
    // scan below already uses for its own, different duplicate risk.
    const registeredBeforeRadiogroups = new Set(fieldRegistry.values());
    for (const group of queryDeep(root, '[role="radiogroup"]')) {
      if (!visible(group)) continue;
      const options = Array.from(group.querySelectorAll('[role="radio"]')).filter(
        (o) => visible(o) && !Array.from(o.querySelectorAll("input[type=radio]")).some((i) => registeredBeforeRadiogroups.has(i))
      );
      if (!options.length) continue;
      const groupName = `ayn-rg-${n++}`;
      const groupLabel = group.getAttribute("aria-label") || labelFor(group) || undefined;
      for (const opt of options) {
        const fid = `ayn-f-${n++}`;
        fieldRegistry.set(fid, opt);
        out.push({
          id: fid, tag: opt.tagName.toLowerCase(), type: "radio", required: false,
          label: (opt.getAttribute("aria-label") || opt.textContent || "").trim(),
          radioGroup: groupName, radioGroupLabel: groupLabel,
        });
      }
    }

    // v3.289.0 -- reported directly, a real screenshot: a Yes/No legal
    // question rendered as a plain pair of buttons, each carrying
    // aria-pressed, but with NO wrapping role="radiogroup" at all -- a
    // real, common accessible pattern (a plain "toggle button group")
    // the v3.282.0 radiogroup scan never covered, since it specifically
    // only looked inside a real radiogroup. Grouped by shared parent so
    // two independent Yes/No pairs on the same page never get merged
    // into one four-option group; a lone toggle (no sibling also
    // carrying aria-pressed) is skipped, since a single button isn't a
    // mutually exclusive choice to fill one way or the other.
    const seenToggleButtons = new Set();
    for (const btn of queryDeep(root, "button[aria-pressed]")) {
      if (!visible(btn) || seenToggleButtons.has(btn) || btn.closest('[role="radiogroup"]')) continue;
      const parent = btn.parentElement;
      if (!parent) continue;
      const siblings = Array.from(parent.children).filter(
        (c) => c.tagName === "BUTTON" && c.hasAttribute("aria-pressed") && visible(c)
      );
      if (siblings.length < 2) continue;
      siblings.forEach((s) => seenToggleButtons.add(s));
      const groupName = `ayn-tg-${n++}`;
      const groupLabel = parent.getAttribute("aria-label") || labelFor(parent) || undefined;
      for (const opt of siblings) {
        const fid = `ayn-f-${n++}`;
        fieldRegistry.set(fid, opt);
        out.push({
          id: fid, tag: "button", type: "radio", required: false,
          label: (opt.getAttribute("aria-label") || opt.textContent || "").trim(),
          radioGroup: groupName, radioGroupLabel: groupLabel,
        });
      }
    }

    // v3.286.0 -- Radix Select / react-select-style custom dropdowns:
    // never a real <select>, so the native scan above never sees them --
    // a button/div carrying role="combobox" (the real, standard ARIA
    // pattern this kind of widget needs regardless of styling) is the
    // trigger. Its own listbox doesn't exist yet at extraction time
    // (comboboxes render their options lazily, on open), so only the
    // trigger is registered here -- fillCombobox does the actual open/
    // search/select/verify sequence at fill time.
    // v3.296.0 -- a real, confirmed duplicate: role="combobox" placed
    // directly on a real <input> (a documented, increasingly common
    // accessible-combobox pattern, e.g. Downshift/react-select) means
    // the generic input/textarea/select loop above already registered
    // this exact element once, as a plain text field -- this loop used
    // to register it again here as a second, separate "select" field,
    // so a real fill pass could try to fill the same DOM node twice,
    // with two different strategies, and the person's own after-fill
    // summary would list the same question twice. registeredEls is the
    // full set of elements any earlier pass already claimed.
    const registeredEls = new Set(fieldRegistry.values());
    for (const trigger of queryDeep(root, '[role="combobox"]')) {
      if (!visible(trigger) || trigger.getAttribute("aria-disabled") === "true") continue;
      if (registeredEls.has(trigger)) continue;
      const fid = `ayn-f-${n++}`;
      fieldRegistry.set(fid, trigger);
      out.push({ id: fid, tag: trigger.tagName.toLowerCase(), type: "select", required: false, label: labelFor(trigger) || "An unlabeled field on this page" });
    }

    // v3.296.0 -- a real, live gap found by an expanded stress pass: the
    // range-input skip above only ever matches a native <input
    // type=range>, but a real salary/compensation range (arguably the
    // single highest-value field on an application) is almost always
    // built as a custom, non-native ARIA slider instead -- two separate
    // role="slider" thumb elements, min and max, since a native range
    // input can't represent a dual-handle range at all. That shape was
    // completely invisible before this: not filled (correctly -- the
    // same "never guess a point on a scale" reasoning the native-range
    // skip already documents applies here even more, since salary is
    // exactly this app's own "never invent a number" rule too), but
    // also never disclosed, which is the real problem -- a person
    // reading the after-fill summary would have no idea this field
    // exists at all, let alone that it needs their own attention.
    // Multiple thumbs sharing one real question (a min/max pair) are
    // deduped to one disclosed line, not two, by their resolved label.
    const seenSliderLabels = new Set();
    for (const sliderEl of queryDeep(root, '[role="slider"]')) {
      if (!visible(sliderEl) || registeredEls.has(sliderEl)) continue;
      let label = labelFor(sliderEl);
      if (!label) {
        // a bare thumb rarely carries its own label -- the real question
        // is almost always on the shared container one or two levels up
        // (aria-labelledby on the slider TRACK, not each individual
        // thumb), the same "climb past a wrapper" reasoning already used
        // for candidateNearbyText and the button-group candidate scan.
        let anc = sliderEl.parentElement;
        for (let hop = 0; hop < 3 && anc && !label; hop++) {
          label = labelFor(anc);
          anc = anc.parentElement;
        }
      }
      const key = label || "A slider or range control on this page";
      if (seenSliderLabels.has(key)) continue;
      seenSliderLabels.add(key);
      skipped.push(key);
    }

    // v3.296.0 -- a real, confirmed risk found grounding a test directly
    // in a real, published Workday automation script's own DOM shape: a
    // split start/end date section (two separate real text inputs,
    // month and year, the actual pattern Workday uses instead of a
    // single native date input) can resolve to the exact same label on
    // BOTH fields -- "Start date" -- since only their own placeholder
    // ("MM" vs "YYYY") tells them apart, and labelFor's own placeholder
    // fallback only ever runs when nothing else was found, so it never
    // gets a chance here. Left alone, whatever fills this field has no
    // way to tell month from year apart, and could write the identical
    // matched value into both. When 2+ fields share both a parent
    // element and a resolved label, and each has its own genuinely
    // distinct placeholder, that placeholder is appended as a
    // disambiguating suffix -- never invented, always real text already
    // on the page.
    const byParentLabel = new Map();
    for (const f of out) {
      const el = fieldRegistry.get(f.id);
      if (!el || !el.parentElement || !f.label) continue;
      let m = byParentLabel.get(el.parentElement);
      if (!m) byParentLabel.set(el.parentElement, (m = new Map()));
      let group = m.get(f.label);
      if (!group) m.set(f.label, (group = []));
      group.push(f);
    }
    for (const labelMap of byParentLabel.values()) {
      for (const group of labelMap.values()) {
        if (group.length < 2) continue;
        const placeholders = group.map((f) => {
          const el = fieldRegistry.get(f.id);
          return el && el.placeholder ? el.placeholder.trim() : "";
        });
        if (placeholders.every(Boolean) && new Set(placeholders).size === group.length) {
          group.forEach((f, i) => { f.label = `${f.label} (${placeholders[i]})`; });
        }
      }
    }

    return { fields: out, skipped };
  }

  // v3.290.0 -- Form Intelligence: everything above this point is the
  // deterministic, free, instant layer -- native inputs, ARIA radiogroups,
  // aria-pressed toggle pairs, role=combobox triggers. It's still not
  // every real shape a real ATS builds (a Yes/No pair with NO aria state
  // at all, or a custom dropdown trigger that never declares
  // role="combobox"), and hand-coding one more heuristic every time a new
  // shape gets reported is exactly the "go back and forth" this exists to
  // end. This scans for two narrow, bounded CANDIDATE shapes the
  // deterministic pass didn't already claim, and sends only their real
  // structure (never a value, never anything about the person) to
  // auto_apply_classify_widgets for a real classification -- cached
  // server-side by structural shape, so the same widget on the same ATS
  // platform is only ever classified once, for every AYN user, not once
  // per page view. See docs/map/extension.md for the full design.
  // v3.293.0 -- a narrower, purpose-built label lookup for a CANDIDATE
  // widget specifically -- found by a heavy synthetic stress pass: reusing
  // labelFor()'s own 3-hop sibling walk on an arbitrary container element
  // (not a real form control, which is what labelFor was actually built
  // for) let it reach past the candidate's own immediate neighbor and pick
  // up a completely unrelated sibling's text -- confirmed live, a "Sort
  // results by: Newest/Relevance" filter bar sitting DIRECTLY after a
  // pagination nav had its own nearbyText come back as "1 2 3", the
  // pagination's own numbers. Cutting the walk to one hop alone didn't
  // fully close this -- confirmed live a second time -- since the wrong
  // element can BE the immediate previous sibling, not just something
  // reached by walking further into it. The real, reliable signal a
  // genuine caption has that a stray unrelated widget doesn't: a real
  // question/caption is plain text, never itself containing another
  // interactive control -- a sibling that contains a button, input, link,
  // or nav is almost certainly a different, unrelated widget entirely,
  // not this candidate's own label, so it's rejected outright rather than
  // quoted. A candidate is already a speculative, AI-classified guess;
  // feeding it a coherent-looking but wrong question makes a wrong
  // classification more likely, not less -- an honestly empty nearbyText
  // gives the classifier real signal to answer "unrecognized" instead.
  // v3.295.0 -- an ultimate stress + training pass across many more
  // real-world shapes (portal-rendered widgets especially) found this
  // one still slips past the v3.293.0 fix: two elements BOTH appended
  // directly to document.body (a real, common portal pattern -- a real
  // React app can genuinely render several different portaled widgets as
  // literal body-level siblings) means one portal's own previousElement
  // Sibling can BE a completely different portal, not a stray fragment
  // reached by walking into one. Confirmed live: a portal-detached
  // toggle group's own nearbyText came back as another, unrelated
  // portal's full option list text ("Eastern TimeCentral TimePacific
  // Time"), since that sibling's own content is <div role="listbox">/
  // role="option"> elements -- none of which are the literal HTML tags
  // (button/input/select/textarea/a/nav) the existing exclusion check
  // was written against. Widened to also reject a sibling containing any
  // of the same ARIA-interactive container roles this whole layer
  // already treats as "a real separate widget," not just specific tags.
  function candidateNearbyText(el) {
    const aria = el.getAttribute("aria-label");
    if (aria && aria.trim() && !isPlaceholderAriaLabel(aria.trim())) return aria.trim();
    // v3.295.0 -- when el itself has no useful previous sibling AND is the
    // sole child of its own parent, the real label often sits one level
    // further out (a real, live example: Ant Design's Segmented wraps
    // .ant-segmented-group, the container the option-buttons were found
    // under, inside .ant-segmented, and the question label is a sibling
    // of THAT outer wrapper, not of the inner group). Walk up at most two
    // levels looking for a container with a real previous sibling, rather
    // than only ever checking el's own immediate one.
    let node = el;
    for (let hop = 0; hop < 3; hop++) {
      const prev = node.previousElementSibling;
      if (prev) {
        // v3.296.0 -- now shares isInteractiveNonLabelNode with
        // siblingText, which also checks whether prev ITSELF (not just a
        // descendant) is the interactive element -- the original version
        // here only ever checked descendants via querySelector, so a
        // previous sibling that IS directly a <button>/etc, with no
        // wrapper around it, slipped through uncaught.
        if (isInteractiveNonLabelNode(prev)) return "";
        // v3.298.0 -- visibleText(), the same fix as labelFor/siblingText:
        // a candidate's own nearby caption can carry the identical hidden
        // multi-state text a real label can.
        const t = visibleText(prev).trim();
        // v3.298.0 -- 200 to 600, same real evidence as siblingText's
        // identical cap above: a genuine custom question can legitimately
        // run several hundred characters.
        return t && t.length < 600 ? t : "";
      }
      const parent = node.parentElement;
      // only keep climbing while node is genuinely the parent's one and
      // only real child -- otherwise a sibling label belongs to a
      // DIFFERENT child, not to el, and must not be attributed to it.
      if (!parent || parent.children.length !== 1) return "";
      node = parent;
    }
    return "";
  }

  function scanUnrecognizedWidgets(alreadyKnownEls) {
    const candidates = [];
    let n = 0;
    const root = pickScanRoot();

    // (a) sibling button groups with NO aria-pressed/aria-checked at all
    // -- a real, common accessibility gap (visually a segmented Yes/No
    // pair, zero ARIA state), never covered by the aria-pressed scan
    // above since that scan specifically requires the attribute to exist.
    // v3.295.0 -- an ultimate stress + training pass found a real,
    // significant gap here: this only ever looked for buttons as DIRECT
    // siblings of one shared parent, and a real, common real-world shape
    // -- confirmed against Ant Design's actual Segmented component
    // markup, one <div class="...-item"> wrapper around each individual
    // option's own <button> -- has no direct sibling buttons at all, so
    // it was completely invisible to this scan, never even reaching
    // "unrecognized." unwrapToButton lets a container's own child count
    // as "a button" when that child wraps EXACTLY one visible button and
    // nothing else ambiguous -- so both the bare-sibling-button shape
    // (P3/Bootstrap-style, unwrapToButton just returns the button itself)
    // and the one-wrapper-per-option shape now resolve to the same real,
    // clickable button either way. Tries the button's own direct parent
    // first (the original, still-correct case), then its grandparent
    // (the wrapped-per-option case) -- never both for the same button,
    // so a group is never registered twice.
    function unwrapToButton(child) {
      if (!visible(child)) return null;
      if (child.tagName === "BUTTON" || child.getAttribute("role") === "button") return child;
      const inner = Array.from(child.querySelectorAll("button, [role='button']")).filter(visible);
      return inner.length === 1 ? inner[0] : null;
    }
    const seenGroupParents = new Set();
    for (const btn of queryDeep(root, "button, [role='button']")) {
      if (!visible(btn) || alreadyKnownEls.has(btn)) continue;
      if (btn.hasAttribute("aria-pressed") || btn.hasAttribute("aria-checked")) continue;
      if (btn.closest("nav, header, footer")) continue;
      const levels = [btn.parentElement, btn.parentElement && btn.parentElement.parentElement];
      for (const container of levels) {
        if (!container || seenGroupParents.has(container)) continue;
        const siblings = Array.from(container.children)
          .map(unwrapToButton)
          .filter((b) => b && !b.hasAttribute("aria-pressed") && !b.hasAttribute("aria-checked") && !alreadyKnownEls.has(b));
        // 2 to 6: a real toggle pair or small choice group, not a button
        // toolbar (which would falsely look like a huge "radio group").
        if (siblings.length < 2 || siblings.length > 6) continue;
        seenGroupParents.add(container);
        const cid = `ayn-cand-${n++}`;
        candidates.push({
          localId: cid,
          els: siblings,
          signature: {
            localId: cid,
            tag: container.tagName.toLowerCase(),
            role: container.getAttribute("role"),
            ariaAttrs: Array.from(siblings[0].attributes).map((a) => a.name).filter((a) => a.startsWith("aria-")).sort(),
            childShape: `button:${siblings.length}`,
            classHint: (container.className || "").toString().trim().split(/\s+/)[0]?.slice(0, 40) || "",
            nearbyText: candidateNearbyText(container).slice(0, 200),
            optionTexts: siblings.map((s) => (s.textContent || "").trim().slice(0, 60)),
          },
        });
        break;
      }
    }

    // (b) a clickable trigger that reads like a custom-select placeholder
    // ("Select...", "Choose...", "Start typing...") but never declared
    // role="combobox" -- a real, common deviation from the ARIA spec.
    const PLACEHOLDER_RE = /^(select|choose|start typing|search)/i;
    // v3.293.0 -- "button" added: a plain native <button> with no explicit
    // role/tabindex attribute at all (it needs neither to already be a
    // real, valid button) was confirmed invisible to this scan -- a
    // genuinely common, perfectly valid native-HTML custom-select trigger
    // ("<button>Select your school</button>", no ARIA anywhere) never
    // reached AI classification at all, silently absent rather than
    // "not on file" or "unrecognized."
    // v3.297.0 -- a real, confirmed gap found live on a real Workday
    // application form: a "Country" dropdown trigger that already has a
    // real default value selected ("United States of America", not
    // placeholder text) matches neither role="combobox" above nor the
    // placeholder-text regex here, so it was invisible to both the
    // deterministic pass and this candidate scan -- not "not on file",
    // silently absent, worse. Workday's own custom dropdown triggers
    // reliably carry aria-haspopup="listbox" (or plain "true") even when
    // they skip role="combobox" entirely, a real, documented pattern of
    // that platform's own component library, not guessed at -- a trigger
    // carrying it is now a candidate regardless of what its own text
    // currently reads, pre-filled default value included.
    for (const el of queryDeep(root, "button, [role='button'], [tabindex='0'], input[type='text']")) {
      if (!visible(el) || alreadyKnownEls.has(el)) continue;
      if (el.getAttribute("role") === "combobox") continue;
      if (el.closest("nav, header, footer")) continue;
      const text = (el.tagName === "INPUT" ? el.placeholder : el.textContent || el.getAttribute("aria-label") || "").trim();
      const hasPopup = el.getAttribute("aria-haspopup");
      const looksLikeDropdownTrigger = hasPopup === "listbox" || hasPopup === "true";
      if (!PLACEHOLDER_RE.test(text) && !looksLikeDropdownTrigger) continue;
      const cid = `ayn-cand-${n++}`;
      candidates.push({
        localId: cid,
        els: [el],
        signature: {
          localId: cid,
          tag: el.tagName.toLowerCase(),
          role: el.getAttribute("role"),
          ariaAttrs: Array.from(el.attributes).map((a) => a.name).filter((a) => a.startsWith("aria-")).sort(),
          childShape: Array.from(el.children).map((c) => c.tagName.toLowerCase()).join(",") || "none",
          classHint: (el.className || "").toString().trim().split(/\s+/)[0]?.slice(0, 40) || "",
          nearbyText: candidateNearbyText(el).slice(0, 200),
          optionTexts: [],
        },
      });
    }

    return candidates;
  }

  // ---------------------------------------------------------------
  // Filling -- native-setter trick for React/Vue-controlled inputs,
  // read-back verified after every write.
  // ---------------------------------------------------------------
  function setNativeValue(el, value) {
    const proto = el.tagName === "TEXTAREA" ? window.HTMLTextAreaElement.prototype
      : el.tagName === "SELECT" ? window.HTMLSelectElement.prototype
      : window.HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
    if (setter) setter.call(el, value); else el.value = value;
    // v3.285.0 -- a real, adoptable improvement: some React versions track
    // an input's "last known value" on a private _valueTracker property
    // and compare against IT (not just the DOM value) to decide whether a
    // change is real -- the native-setter trick above can still get
    // silently reverted on next render if this isn't also updated to
    // match, since React sees its own tracked value as already current.
    if (el._valueTracker) el._valueTracker.setValue(value);
    // v3.286.0 -- a real, adoptable improvement: some forms only run
    // their own field-level validation (the check that decides whether
    // a "Next"/"Continue" button is enabled) on blur, not on input --
    // dispatching focus first and blur after mirrors what actually
    // happens during a real click-into-then-tab-out-of interaction.
    el.dispatchEvent(new Event("focus", { bubbles: true }));
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    el.dispatchEvent(new Event("blur", { bubbles: true }));
  }

  // v3.281.0 -- reported directly, a real screenshot: "Please list your
  // highest level of education achieved?" (a real <select> dropdown)
  // showed as "not on file" even with the resolver fixed to actually
  // answer it (see the backend's own applicationAnswers.ts). Root cause
  // here: a <select>'s real, valid values are its own <option> values,
  // which almost never match a plain resolved string exactly ("Bachelor's"
  // vs an option literally reading "Bachelor's Degree") -- setting
  // el.value to a non-matching string is a silent no-op in every browser.
  // Fields registered as a real <select> now match against that select's
  // own actual option text (exact, then substring) and select the real
  // matching option -- never an invented one, and correctly reported as
  // failed if genuinely no option matches.
  // A boolean-shaped stored answer ("Yes"/"No"/"true"/"false") -- the
  // resolver has never had a reason to write anything else for a
  // checkbox-shaped question.
  function isAffirmative(value) {
    return /^(yes|true|1|on|checked)$/i.test(value.trim());
  }

  // v3.286.0 -- Radix Select / react-select-style widgets: not a real
  // <select>, a button/div with role="combobox" that opens a real
  // role="listbox" popup on click. Scoped correctly on purpose -- via
  // the trigger's own aria-controls, the standard ARIA link to ITS
  // listbox -- never a bare, page-wide search for "any [role=option] or
  // <li>", which could click something on the page that has nothing to
  // do with this field at all. Waits for the popup by actually checking
  // for it (polled, short interval) rather than a fixed guessed delay,
  // which is exactly the kind of timing assumption that silently breaks
  // on a slower render. Verified afterward by re-reading the trigger's
  // own displayed text, not just trusted because a click happened.
  async function fillCombobox(el, value) {
    const wanted = value.trim().toLowerCase();
    el.click();
    const listboxId = el.getAttribute("aria-controls");
    let listbox = null;
    for (let i = 0; i < 15 && !listbox; i++) {
      listbox = listboxId ? document.getElementById(listboxId) : document.querySelector('[role="listbox"]');
      if (!listbox) await new Promise((r) => setTimeout(r, 100));
    }
    if (!listbox) return { ok: false };
    const options = Array.from(listbox.querySelectorAll('[role="option"]'));
    const match = options.find((o) => o.textContent.trim().toLowerCase() === wanted)
      || options.find((o) => o.textContent.trim().toLowerCase().includes(wanted) || wanted.includes(o.textContent.trim().toLowerCase()));
    if (!match) {
      el.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      return { ok: false };
    }
    match.click();
    await new Promise((r) => setTimeout(r, 100));
    const landed = match.getAttribute("aria-selected") === "true"
      || (el.textContent || "").trim().toLowerCase().includes(match.textContent.trim().toLowerCase());
    return { ok: landed };
  }

  // v3.289.0 -- reported directly: a "Location" field showing
  // "Start typing…" stayed empty after autofill. A location/city/
  // school/employer field is very often a plain <input> wired to a
  // Google-Places-style typeahead with NO role="combobox" on the input
  // itself (a real, common gap in how these widgets are built, not
  // something AYN's own role="combobox" scan above can catch) -- typing
  // is what makes its suggestion list exist at all, and many of these
  // widgets discard a value that was never chosen from that list rather
  // than keep it as free text. Scoped by diffing which role="listbox"
  // elements exist before vs. after typing (never a bare, page-wide
  // "any listbox anywhere" search, the same scoping discipline
  // fillCombobox already uses via aria-controls) -- and gated to only
  // the label shapes where a typeahead widget is actually common, so a
  // plain name/email/phone field never pays this extra wait.
  const TYPEAHEAD_LABEL_RE = /location|city|address|country(?!\s*code)|state|province|county|school|university|college|employer|company/i;
  async function tryAutocompleteSelect(el, value, before) {
    const wanted = value.trim().toLowerCase();
    let listbox = null;
    for (let i = 0; i < 8 && !listbox; i++) {
      const boxes = queryDeep(document, '[role="listbox"]').filter(
        (b) => visible(b) && !before.has(b) && b.querySelectorAll('[role="option"]').length
      );
      listbox = boxes[0] || null;
      if (!listbox) await new Promise((r) => setTimeout(r, 150));
    }
    if (!listbox) return false;
    const options = Array.from(listbox.querySelectorAll('[role="option"]')).filter(visible);
    const match = options.find((o) => o.textContent.trim().toLowerCase() === wanted)
      || options.find((o) => o.textContent.trim().toLowerCase().includes(wanted) || wanted.includes(o.textContent.trim().toLowerCase()));
    if (!match) return false;
    match.click();
    await new Promise((r) => setTimeout(r, 100));
    return true;
  }

  async function fillTextLike(fid, value, label) {
    const el = fieldRegistry.get(fid);
    if (!el) return { ok: false };
    // v3.290.0 -- an AI-classified widget (see scanUnrecognizedWidgets /
    // autofill's own merge step) is tagged on the real element itself,
    // not looked up by fid, so it survives being read back here exactly
    // like any other field. The interpreter, never the model, decides
    // which already-audited mechanism actually runs: a trigger that
    // isn't a real text-editable input can never "type," regardless of
    // what it was classified as, so it always falls through to the
    // click-then-search path instead (see the merge step's own comment).
    if (el.getAttribute("role") === "combobox" || el.dataset?.aynClsMode === "combobox_static") return fillCombobox(el, value);
    if (el.dataset?.aynClsMode === "combobox_typeahead") {
      const before = new Set(queryDeep(document, '[role="listbox"]'));
      setNativeValue(el, value);
      const landed = await tryAutocompleteSelect(el, value, before);
      return { ok: landed || el.value === value };
    }
    // v3.286.0 -- checked against a real DOM before shipping, not assumed:
    // setNativeValue's HTMLInputElement setter writes to a checkbox's own
    // .value attribute, which browsers keep and read back as a real
    // string ("Yes") completely independent of .checked -- meaning the
    // old code's read-back check (el.value === value) could report a
    // checkbox as successfully filled while it stayed genuinely unchecked
    // on the real page the whole time. Checkboxes were never actually
    // matched by the backend before this (a disclosed limit), but nothing
    // stopped a caller from reaching this path, and it would have lied
    // about the outcome if one had.
    if (el.type === "checkbox") {
      const want = isAffirmative(value);
      if (el.checked !== want) el.click();
      return { ok: el.checked === want };
    }
    if (el.tagName === "SELECT") {
      const wanted = value.trim().toLowerCase();
      const opts = Array.from(el.options);
      const match = opts.find((o) => o.textContent.trim().toLowerCase() === wanted)
        || opts.find((o) => o.textContent.trim().toLowerCase().includes(wanted) || wanted.includes(o.textContent.trim().toLowerCase()));
      if (!match) return { ok: false };
      setNativeValue(el, match.value);
      return { ok: el.value === match.value };
    }
    if (label && TYPEAHEAD_LABEL_RE.test(label) && el.tagName === "INPUT") {
      const before = new Set(queryDeep(document, '[role="listbox"]'));
      setNativeValue(el, value);
      const landed = await tryAutocompleteSelect(el, value, before);
      return { ok: landed || el.value === value };
    }
    setNativeValue(el, value);
    return { ok: el.value === value };
  }
  function fillRadio(fid) {
    const el = fieldRegistry.get(fid);
    if (!el) return { ok: false };
    // A real <input type=radio> has a checked property to verify against;
    // a custom [role="radio"] button (see extractFields' own ARIA scan)
    // does not -- a real .click() (not a synthetic dispatched event,
    // which many custom components' own onClick handlers don't reliably
    // react to) is both how it's activated and, via aria-checked/
    // aria-pressed, how a real selection is confirmed afterward.
    if (el.tagName === "INPUT") {
      el.checked = true;
      el.dispatchEvent(new Event("click", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
      return { ok: el.checked };
    }
    el.click();
    const state = el.getAttribute("aria-checked") || el.getAttribute("aria-pressed");
    return { ok: state === "true" };
  }

  window.__aynExtractFields = extractFields;
  window.__aynScanUnrecognizedWidgets = scanUnrecognizedWidgets;
  window.__aynFieldRegistry = () => fieldRegistry;
  window.__aynFillTextLike = fillTextLike;
  window.__aynFillRadio = fillRadio;

  // v3.294.0 -- sub-frame self-report + fill-request listener. The top
  // frame never runs any of this -- content.js drives its own local
  // extraction directly via the window.__ayn* functions above instead,
  // and is the only thing that ever builds a UI or talks to the backend.
  // chrome.runtime.sendMessage (no tabId) always reaches this extension's
  // own background script, never a sibling frame directly, and a
  // frameId-targeted chrome.tabs.sendMessage from the background script
  // is delivered only to that one frame -- no risk of cross-frame
  // message cross-talk on either hop.
  if (window !== window.top) {
    try {
      const { fields, skipped } = extractFields();
      if (fields.length || skipped.length) {
        chrome.runtime.sendMessage({ type: "AYN_FRAME_REPORT", fields, skipped }).catch(() => {});
      }
    } catch (e) {
      // A sub-frame's own extraction failing must never break the top
      // frame's -- it just means this one frame contributes nothing.
    }

    chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
      if (!msg || typeof msg !== "object") return false;
      if (msg.type === "AYN_FRAME_FILL_TEXT") {
        fillTextLike(msg.fid, msg.value, msg.label).then(sendResponse);
        return true;
      }
      if (msg.type === "AYN_FRAME_FILL_RADIO") {
        sendResponse(fillRadio(msg.fid));
        return false;
      }
      return false;
    });
  }
})();
