"use strict";
(() => {
  // extension/question-engine/question.ts
  function freezeQuestion(q) {
    Object.freeze(q.confidence);
    Object.freeze(q.options);
    Object.freeze(q.evidence);
    Object.freeze(q.controls);
    if (q.history) Object.freeze(q.history);
    return Object.freeze(q);
  }

  // extension/question-engine/refs.ts
  var ID_PREFIX = Object.freeze({
    text: "__textfield__",
    structradio: "__structradio__",
    customRadio: "__radio__:custom",
    buttongroup: "__buttongroup__",
    labelgroup: "__labelgroup__",
    multiCheckbox: "__checkbox__:multi",
    richedit: "__richedit__",
    opentext: "__opentext__"
  });
  var FID_ATTR = "data-ayn-fid";
  var fidCounter = 0;
  var currentGeneration = 0;
  function nextGeneration() {
    return ++currentGeneration;
  }
  function ensureFid(el) {
    const existing = el.getAttribute(FID_ATTR);
    if (existing) return existing;
    const fid = `f${fidCounter++}`;
    try {
      el.setAttribute(FID_ATTR, fid);
    } catch {
    }
    return fid;
  }
  function buildSelector(el) {
    if (el.id) return `#${cssEscape(el.id)}`;
    const parts = [];
    let node = el;
    let depth = 0;
    while (node && node.nodeType === 1 && depth < 5) {
      const current = node;
      let part = current.tagName.toLowerCase();
      const parent = current.parentElement;
      if (parent) {
        const sibs = Array.from(parent.children).filter(
          (c) => c.tagName === current.tagName
        );
        if (sibs.length > 1) part += `:nth-of-type(${sibs.indexOf(current) + 1})`;
      }
      parts.unshift(part);
      if (node.id) {
        parts[0] = `#${cssEscape(node.id)}`;
        break;
      }
      node = parent;
      depth++;
    }
    return parts.join(" > ");
  }
  function buildXpath(el) {
    const parts = [];
    let node = el;
    while (node && node.nodeType === 1) {
      let idx = 1;
      let sib = node.previousElementSibling;
      while (sib) {
        if (sib.tagName === node.tagName) idx++;
        sib = sib.previousElementSibling;
      }
      parts.unshift(`${node.tagName.toLowerCase()}[${idx}]`);
      node = node.parentElement;
    }
    return "/" + parts.join("/");
  }
  function makeRef(el) {
    return {
      fid: ensureFid(el),
      selector: buildSelector(el),
      xpath: buildXpath(el),
      generation: currentGeneration
    };
  }
  function mintId(kind, anchorFid, frame = "") {
    const prefix = ID_PREFIX[kind];
    const framePart = frame ? `${frame}:` : "";
    return `${framePart}${prefix}:g${anchorFid}`;
  }
  function idKindFor(control, grouped, isCustom) {
    if (control === "radio") return grouped ? isCustom ? "customRadio" : "structradio" : "structradio";
    if (control === "checkbox") return grouped ? "multiCheckbox" : "buttongroup";
    if (control === "custom") return "buttongroup";
    if (control === "textarea") return "text";
    return "text";
  }
  function cssEscape(s) {
    if (typeof CSS !== "undefined" && CSS.escape) return CSS.escape(s);
    return s.replace(/[^a-zA-Z0-9_-]/g, (c) => `\\${c}`);
  }

  // extension/question-engine/evidence.ts
  var WEIGHTS = Object.freeze({
    accessibility: {
      label: 0.9,
      role: 0.95,
      name: 0.9,
      required: 0.9,
      description: 0.85
    },
    dom: {
      label: 0.7,
      name: 0.6,
      required: 0.8,
      options: 0.9,
      section: 0.7,
      validation: 0.9,
      placeholder: 0.8,
      bbox: 0.9
    },
    adapter: {
      grouping: 0.95,
      label: 0.85,
      options: 0.9,
      section: 0.85,
      required: 0.85
    },
    mutation: {
      label: 0.7,
      options: 0.9,
      grouping: 0.6
    },
    vision: {
      label: 0.4,
      options: 0.4,
      grouping: 0.35
    }
  });
  function defaultWeight(source, kind) {
    return WEIGHTS[source]?.[kind] ?? 0;
  }
  function makeEvidence(source, kind, value, confidence, metadata) {
    return Object.freeze({
      source,
      kind,
      value,
      confidence,
      weight: defaultWeight(source, kind),
      timestamp: Date.now(),
      metadata
    });
  }

  // extension/question-engine/evidence/dom.ts
  function collect(el, root) {
    const out = [];
    const doc = root instanceof Document ? root : el.ownerDocument;
    const labelText = readNativeLabel(el, doc);
    if (labelText) {
      out.push(makeEvidence("dom", "label", labelText, 0.9, { via: "native-label" }));
    }
    const placeholder = el.placeholder;
    if (placeholder) {
      out.push(makeEvidence("dom", "placeholder", placeholder, 1));
    }
    if (el.required || el.hasAttribute("required") || el.getAttribute("aria-required") === "true") {
      out.push(makeEvidence("dom", "required", true, 1));
    } else if (labelText && /[*✱﹡＊]\s*$/.test(labelText.trim())) {
      out.push(makeEvidence("dom", "required", true, 0.6, { via: "asterisk-heuristic" }));
    }
    const options = readOptions(el, doc);
    if (options && options.length) {
      out.push(makeEvidence("dom", "options", options, 1));
    }
    const v = readValidation(el);
    if (v) out.push(makeEvidence("dom", "validation", v, 1));
    const section = nearestHeadingText(el);
    if (section) out.push(makeEvidence("dom", "section", section, 0.8));
    try {
      const r = el.getBoundingClientRect?.();
      if (r && (r.width || r.height)) {
        out.push(
          makeEvidence(
            "dom",
            "bbox",
            { x: r.left, y: r.top, w: r.width, h: r.height },
            1
          )
        );
      }
    } catch {
    }
    return out;
  }
  function readNativeLabel(el, doc) {
    const id = el.getAttribute("id");
    const GENERATED_ID_RE = /^:[a-z0-9]+:$|^[0-9a-f]{8}-[0-9a-f]{4}-|--[a-f0-9]{6,}$|^(mui|rc|rdk|headlessui|radix)-[a-z0-9-]+$|^r[0-9]+$/i;
    if (id && !GENERATED_ID_RE.test(id) && doc) {
      const forLabel = doc.querySelector(`label[for="${cssEscape2(id)}"]`);
      const t = textOf(forLabel);
      if (t) return t;
    }
    const wrap = el.closest("label");
    if (wrap) {
      const clone = wrap.cloneNode(true);
      clone.querySelectorAll("input,textarea,select,button").forEach((n) => n.remove());
      const t = normalize(clone.textContent || "");
      if (t) return t;
    }
    const fs = el.closest("fieldset");
    if (fs) {
      const legend = fs.querySelector(":scope > legend");
      const t = textOf(legend);
      if (t) return t;
    }
    return null;
  }
  function readOptions(el, doc) {
    const tag = el.tagName.toLowerCase();
    if (tag === "select") {
      const opts = Array.from(el.options);
      return opts.filter((o) => o.value !== "" || o.textContent?.trim()).map((o) => ({ value: o.value, label: normalize(o.textContent || "") }));
    }
    const type = (el.type || "").toLowerCase();
    const name = el.name;
    if ((type === "radio" || type === "checkbox") && name && doc) {
      const form = el.form ?? doc;
      const nodes = Array.from(
        form.querySelectorAll(
          `input[type="${type}"][name="${cssEscape2(name)}"]`
        )
      );
      if (nodes.length > 1) {
        return nodes.map((n) => ({
          value: n.value,
          label: labelForRadio(n) || n.value
        }));
      }
    }
    const role = el.getAttribute("role");
    if (role === "listbox" || role === "combobox") {
      const ctrl = el.getAttribute("aria-controls") || el.getAttribute("aria-owns");
      const portal = ctrl && doc ? doc.getElementById(ctrl) : null;
      let optNodes = portal ? portal.querySelectorAll('[role="option"]') : el.querySelectorAll('[role="option"]');
      if (!optNodes.length && doc) {
        optNodes = Array.from(doc.querySelectorAll('[role="option"]')).filter((o) => !o.closest('[aria-hidden="true"]'));
      }
      if (optNodes.length) {
        return Array.from(optNodes).map((o) => ({
          value: o.getAttribute("data-value") || normalize(o.textContent || ""),
          label: normalize(o.textContent || "")
        }));
      }
    }
    return null;
  }
  function labelForRadio(input) {
    if (input.id) {
      const doc = input.ownerDocument;
      const l = doc?.querySelector(`label[for="${cssEscape2(input.id)}"]`);
      const t = textOf(l);
      if (t) return t;
    }
    const wrap = input.closest("label");
    if (wrap) {
      const clone = wrap.cloneNode(true);
      clone.querySelectorAll("input").forEach((n) => n.remove());
      const t = normalize(clone.textContent || "");
      if (t) return t;
    }
    return "";
  }
  function readValidation(el) {
    const input = el;
    const v = {};
    if (input.pattern) v.pattern = input.pattern;
    if (input.min && !Number.isNaN(Number(input.min))) v.min = Number(input.min);
    if (input.max && !Number.isNaN(Number(input.max))) v.max = Number(input.max);
    if (input.maxLength && input.maxLength > 0) v.maxLength = input.maxLength;
    const t = (input.type || "").toLowerCase();
    if (t === "email" || t === "url" || t === "tel" || t === "date" || t === "number") {
      v.format = t;
    }
    return Object.keys(v).length ? v : null;
  }
  function nearestHeadingText(el) {
    let node = el;
    while (node) {
      let sib = node.previousElementSibling;
      while (sib) {
        if (/^H[1-6]$/.test(sib.tagName) || sib.getAttribute("role") === "heading") {
          const t = textOf(sib);
          if (t) return t;
        }
        sib = sib.previousElementSibling;
      }
      node = node.parentElement;
    }
    return null;
  }
  function textOf(n) {
    if (!n) return "";
    return normalize(n.textContent || "");
  }
  function normalize(s) {
    return s.replace(/\s+/g, " ").trim();
  }
  function cssEscape2(s) {
    if (typeof CSS !== "undefined" && CSS.escape) return CSS.escape(s);
    return s.replace(/[^a-zA-Z0-9_-]/g, (c) => `\\${c}`);
  }

  // extension/question-engine/evidence/accessibility.ts
  var IMPLICIT_ROLES = {
    input: "textbox",
    textarea: "textbox",
    select: "combobox",
    button: "button",
    a: "link",
    form: "form",
    fieldset: "group"
  };
  function collect2(el, root) {
    const out = [];
    const doc = root instanceof Document ? root : el.ownerDocument;
    const name = computeAccessibleName(el, doc, 0);
    if (name) {
      out.push(makeEvidence("accessibility", "name", name, 0.95));
      out.push(makeEvidence("accessibility", "label", name, 0.9, { from: "accname" }));
    }
    const role = el.getAttribute("role") || implicitRoleOf(el);
    if (role) {
      out.push(makeEvidence("accessibility", "role", role, role === el.getAttribute("role") ? 1 : 0.7));
    }
    if (el.getAttribute("aria-required") === "true") {
      out.push(makeEvidence("accessibility", "required", true, 1));
    }
    const describedBy = el.getAttribute("aria-describedby");
    if (describedBy && doc) {
      const desc = idListText(describedBy, doc);
      if (desc) out.push(makeEvidence("accessibility", "description", desc, 0.95));
    }
    const invalid = el.getAttribute("aria-invalid");
    const errMsgId = el.getAttribute("aria-errormessage");
    if (invalid === "true" || errMsgId) {
      const msg = errMsgId && doc ? idListText(errMsgId, doc) : null;
      out.push(
        makeEvidence("accessibility", "validation", { invalid: invalid === "true", message: msg }, 0.9)
      );
    }
    return out;
  }
  function computeAccessibleName(el, doc, depth) {
    if (depth > 2) return "";
    const labelledBy = el.getAttribute("aria-labelledby");
    if (labelledBy && doc) {
      const t = idListText(labelledBy, doc, depth + 1);
      if (t) return t;
    }
    const ariaLabel = el.getAttribute("aria-label");
    if (ariaLabel && ariaLabel.trim()) return normalize2(ariaLabel);
    const id = el.getAttribute("id");
    const GENERATED_ID_RE = /^:[a-z0-9]+:$|^[0-9a-f]{8}-[0-9a-f]{4}-|--[a-f0-9]{6,}$|^(mui|rc|rdk|headlessui|radix)-[a-z0-9-]+$|^r[0-9]+$/i;
    if (id && !GENERATED_ID_RE.test(id) && doc) {
      const forLabel = doc.querySelector(`label[for="${cssEscape3(id)}"]`);
      if (forLabel) {
        const t = normalize2(forLabel.textContent || "");
        if (t) return t;
      }
    }
    const wrap = el.closest("label");
    if (wrap) {
      const clone = wrap.cloneNode(true);
      clone.querySelectorAll("input,textarea,select,button").forEach((n) => n.remove());
      const t = normalize2(clone.textContent || "");
      if (t) return t;
    }
    const title = el.getAttribute("title");
    if (title && title.trim()) return normalize2(title);
    return "";
  }
  function idListText(idList, doc, depth = 0) {
    const parts = [];
    for (const id of idList.split(/\s+/).filter(Boolean)) {
      const n = doc.getElementById(id);
      if (!n) continue;
      const nested = depth > 0 ? normalize2(n.textContent || "") : computeAccessibleName(n, doc, depth);
      parts.push(nested || normalize2(n.textContent || ""));
    }
    return normalize2(parts.join(" "));
  }
  function implicitRoleOf(el) {
    const tag = el.tagName.toLowerCase();
    if (tag === "input") {
      const t = (el.type || "text").toLowerCase();
      if (t === "radio") return "radio";
      if (t === "checkbox") return "checkbox";
      if (t === "email" || t === "tel" || t === "url" || t === "text" || t === "search")
        return "textbox";
      if (t === "number") return "spinbutton";
      if (t === "file") return "button";
      return "textbox";
    }
    return IMPLICIT_ROLES[tag] ?? null;
  }
  function normalize2(s) {
    return s.replace(/\s+/g, " ").trim();
  }
  function cssEscape3(s) {
    if (typeof CSS !== "undefined" && CSS.escape) return CSS.escape(s);
    return s.replace(/[^a-zA-Z0-9_-]/g, (c) => `\\${c}`);
  }

  // extension/question-engine/evidence/adapter.ts
  function collect3(field, root, adapter) {
    if (!adapter) return [];
    const doc = root instanceof Document ? root : root.ownerDocument ?? document;
    try {
      return adapter.collectEvidence(field, doc) ?? [];
    } catch {
      return [];
    }
  }

  // extension/question-engine/field-detector.ts
  var CONTROL_ROLES = /* @__PURE__ */ new Set([
    "radio",
    "checkbox",
    "combobox",
    "listbox",
    "switch",
    "textbox",
    "spinbutton"
  ]);
  function detect(root, opts = {}) {
    const pierceShadow = opts.pierceShadow !== false;
    const descendFrames = opts.descendFrames !== false;
    const out = [];
    const seen = /* @__PURE__ */ new Set();
    walk(root, "", out, seen, pierceShadow, descendFrames);
    return out;
  }
  function walk(node, frame, out, seen, pierceShadow, descendFrames) {
    const elements = node.querySelectorAll("*");
    elements.forEach((el) => {
      if (seen.has(el)) return;
      const kind = controlKindOf(el);
      if (kind) {
        seen.add(el);
        out.push({ node: el, kind, ref: makeRef(el), frame });
      }
      if (pierceShadow) {
        const sr = el.shadowRoot;
        if (sr) walk(sr, frame, out, seen, pierceShadow, descendFrames);
      }
      if (descendFrames && el.tagName === "IFRAME") {
        try {
          const doc = el.contentDocument;
          if (doc) {
            const childFrame = frame ? `${frame}.f` : "f";
            walk(doc, childFrame, out, seen, pierceShadow, descendFrames);
          }
        } catch {
        }
      }
    });
  }
  function controlKindOf(el) {
    const tag = el.tagName.toLowerCase();
    if (tag === "textarea") return "textarea";
    if (tag === "select") {
      return el.multiple ? "listbox" : "select";
    }
    if (tag === "input") {
      const type = (el.type || "text").toLowerCase();
      if (type === "hidden" || type === "submit" || type === "reset" || type === "button" || type === "image") {
        return null;
      }
      if (type === "radio") return "radio";
      if (type === "checkbox") return "checkbox";
      if (type === "file") return "file";
      return "text";
    }
    if (el.isContentEditable) return "text";
    const role = el.getAttribute("role");
    if (role && CONTROL_ROLES.has(role)) {
      if (role === "radio") return "radio";
      if (role === "checkbox" || role === "switch") return "checkbox";
      if (role === "combobox") return "combobox";
      if (role === "listbox") return "listbox";
      if (role === "textbox" || role === "spinbutton") return "text";
      return "custom";
    }
    return null;
  }
  function enrich(raw, root, adapter = null) {
    return raw.map((d) => {
      const base = {
        ...d,
        evidence: [...collect(d.node, root), ...collect2(d.node, root)],
        visible: isVisible(d.node),
        container: nearestContainer(d.node)
      };
      const adapterEv = collect3(base, root, adapter);
      return { ...base, evidence: [...base.evidence, ...adapterEv] };
    });
  }
  var CONTAINER_SELECTOR = "fieldset,[role=group],[role=radiogroup],[data-field-path],[class*=fieldEntry],[class*=field-entry],[class*=field],[class*=question]";
  function nearestContainer(el) {
    const c = el.closest(CONTAINER_SELECTOR);
    if (c && c !== el) return c;
    return el.parentElement ?? el;
  }
  function isVisible(el) {
    const he = el;
    if (!(he.offsetWidth || he.offsetHeight || he.getClientRects().length)) {
      const laidOutAncestor = el.closest("label,[class*=field],fieldset");
      if (!laidOutAncestor) return false;
    }
    try {
      const cs = (el.ownerDocument?.defaultView ?? window).getComputedStyle(he);
      if (cs.display === "none" || cs.visibility === "hidden") return false;
    } catch {
    }
    return true;
  }

  // extension/question-engine/grouping.ts
  function cluster(fields, hints = []) {
    const clusters = [];
    const claimed = /* @__PURE__ */ new Set();
    if (hints.length) {
      const byFid = /* @__PURE__ */ new Map();
      for (const f of fields) byFid.set(f.ref.fid, f);
      for (const h of hints) {
        const members = h.memberFids.map((fid) => byFid.get(fid)).filter((f) => !!f && !claimed.has(f));
        if (members.length > 1) {
          members.forEach((m) => claimed.add(m));
          clusters.push({ members, reason: "adapter-hint", confidence: h.confidence });
        }
      }
    }
    const radiosByName = /* @__PURE__ */ new Map();
    for (const f of fields) {
      if (f.kind !== "radio" || claimed.has(f)) continue;
      const name = f.node.name;
      if (!name) continue;
      const arr = radiosByName.get(name) ?? [];
      arr.push(f);
      radiosByName.set(name, arr);
    }
    for (const [, arr] of radiosByName) {
      if (arr.length > 1) {
        arr.forEach((f) => claimed.add(f));
        clusters.push({ members: arr, reason: "shared-name", confidence: 0.98 });
      }
    }
    for (const f of fields) {
      if (f.kind !== "radio" || claimed.has(f)) continue;
      const container = f.node.closest('[role="radiogroup"],fieldset');
      if (!container) continue;
      const siblings = fields.filter(
        (o) => o.kind === "radio" && !claimed.has(o) && container.contains(o.node)
      );
      if (siblings.length > 1) {
        siblings.forEach((s) => claimed.add(s));
        clusters.push({
          members: siblings,
          reason: container.getAttribute("role") === "radiogroup" ? "aria-radiogroup" : "fieldset",
          confidence: 0.95
        });
      }
    }
    const checkboxContainers = /* @__PURE__ */ new Map();
    for (const f of fields) {
      if (f.kind !== "checkbox" || claimed.has(f)) continue;
      const container = f.node.closest('fieldset,[role="group"]');
      if (!container) continue;
      if (!hasGroupLabel(container)) continue;
      const arr = checkboxContainers.get(container) ?? [];
      arr.push(f);
      checkboxContainers.set(container, arr);
    }
    for (const [, arr] of checkboxContainers) {
      if (arr.length > 1) {
        arr.forEach((f) => claimed.add(f));
        clusters.push({
          members: arr,
          reason: "container+shared-label",
          confidence: 0.9
        });
      }
    }
    for (const f of fields) {
      if (claimed.has(f)) continue;
      clusters.push({ members: [f], reason: "singleton", confidence: 1 });
    }
    return clusters;
  }
  function hasGroupLabel(container) {
    if (container.tagName.toLowerCase() === "fieldset") {
      if (container.querySelector(":scope > legend")) return true;
    }
    if (container.getAttribute("aria-labelledby") || container.getAttribute("aria-label")) return true;
    return false;
  }

  // extension/question-engine/question-reconstructor.ts
  function reconstruct(fields, root, adapter = null) {
    const doc = root instanceof Document ? root : root.ownerDocument ?? document;
    const hints = adapter && adapter.groupingHints ? adapter.groupingHints(fields, doc) : [];
    const clusters = cluster(fields, hints);
    return clusters.map((c) => {
      const groupingEvidence = [
        makeEvidence("dom", "grouping", { reason: c.reason, size: c.members.length }, c.confidence)
      ];
      const groupLabel = groupLevelLabel(c.members);
      if (groupLabel) {
        groupingEvidence.push(
          makeEvidence("dom", "label", groupLabel, 0.95, { via: "group-container" })
        );
      } else if (c.members.length > 1) {
        const scored = scoreCandidateLabel(c.members);
        if (scored) {
          groupingEvidence.push(
            makeEvidence("dom", "label", scored.text, scored.confidence, {
              via: "proximity-decay"
            })
          );
        }
      }
      return Object.freeze({
        controls: Object.freeze(c.members.slice()),
        groupingEvidence: Object.freeze(groupingEvidence),
        groupConfidence: c.confidence
      });
    });
  }
  function groupLevelLabel(members) {
    if (members.length === 0) return null;
    const first = members[0].node;
    const container = first.closest('fieldset,[role="group"],[role="radiogroup"]');
    if (!container) return null;
    if (!members.every((m) => container.contains(m.node))) return null;
    const legend = container.querySelector(":scope > legend");
    if (legend) {
      const t = normalize3(legend.textContent || "");
      if (t) return t;
    }
    const labelledBy = container.getAttribute("aria-labelledby");
    if (labelledBy) {
      const doc = container.ownerDocument;
      const parts = [];
      for (const id of labelledBy.split(/\s+/).filter(Boolean)) {
        const n = doc?.getElementById(id);
        if (n) parts.push(normalize3(n.textContent || ""));
      }
      const t = normalize3(parts.join(" "));
      if (t) return t;
    }
    const ariaLabel = container.getAttribute("aria-label");
    if (ariaLabel) return normalize3(ariaLabel);
    return null;
  }
  function scoreCandidateLabel(members) {
    const anchor = members[0].node;
    const memberSet = new Set(members.map((m) => m.node));
    const optionLabelTexts = new Set(
      members.map((m) => textOfLabel(m.node)).filter(Boolean).map((t) => t.toLowerCase())
    );
    const anchorBox = safeRect(anchor);
    const candidates = [];
    let depth = 0;
    let node = anchor.parentElement;
    while (node && depth < 6) {
      let sib = node.previousElementSibling;
      while (sib) {
        collectFromNode(sib, memberSet, optionLabelTexts, anchorBox, depth, candidates);
        sib = sib.previousElementSibling;
      }
      collectFromNode(node, memberSet, optionLabelTexts, anchorBox, depth, candidates);
      node = node.parentElement;
      depth++;
    }
    if (!candidates.length) return null;
    candidates.sort((a, b) => b.score - a.score);
    const best = candidates[0];
    return { text: best.text, confidence: Math.max(0.4, Math.min(0.9, best.score)) };
  }
  function collectFromNode(n, memberSet, optionTexts, anchorBox, depth, out) {
    if (isFormControl(n)) return;
    if (memberSet.has(n)) return;
    const tag = n.tagName.toLowerCase();
    if (!/^(h[1-6]|label|span|p|div|legend|strong|b|em)$/.test(tag)) return;
    const t = normalize3(n.textContent || "");
    if (!t || t.length > 300) return;
    if (optionTexts.has(t.toLowerCase())) return;
    const box = safeRect(n);
    const vDist = box && anchorBox ? Math.max(0, anchorBox.top - box.top) : 100;
    const depthPenalty = 1 / (1 + depth);
    const distPenalty = 1 / (1 + vDist / 100);
    const headingBoost = /^h[1-6]$/.test(tag) ? 1.2 : 1;
    const score = depthPenalty * distPenalty * headingBoost;
    out.push({ text: t, score });
  }
  function textOfLabel(el) {
    const id = el.getAttribute("id");
    const doc = el.ownerDocument;
    if (id && doc) {
      const l = doc.querySelector(`label[for="${cssEscape4(id)}"]`);
      if (l) return normalize3(l.textContent || "");
    }
    const wrap = el.closest("label");
    if (wrap) {
      const clone = wrap.cloneNode(true);
      clone.querySelectorAll("input,textarea,select,button").forEach((x) => x.remove());
      return normalize3(clone.textContent || "");
    }
    return null;
  }
  function isFormControl(el) {
    return /^(input|textarea|select|button)$/i.test(el.tagName);
  }
  function safeRect(el) {
    try {
      return el.getBoundingClientRect();
    } catch {
      return null;
    }
  }
  function normalize3(s) {
    return s.replace(/\s+/g, " ").trim();
  }
  function cssEscape4(s) {
    if (typeof CSS !== "undefined" && CSS.escape) return CSS.escape(s);
    return s.replace(/[^a-zA-Z0-9_-]/g, (c) => `\\${c}`);
  }

  // extension/question-engine/evidence/merge.ts
  function fuse(evidence) {
    if (evidence.length === 0) {
      return { value: void 0, agreement: 0, winner: null, losers: [] };
    }
    if (evidence.length === 1) {
      const e = evidence[0];
      return {
        value: e.value,
        agreement: clamp01(e.confidence),
        winner: e,
        losers: []
      };
    }
    const buckets = /* @__PURE__ */ new Map();
    for (const e of evidence) {
      const key = keyOf(e.value);
      const mass = e.weight * e.confidence;
      const b = buckets.get(key);
      if (b) {
        b.mass += mass;
        b.items.push(e);
      } else {
        buckets.set(key, { mass, items: [e] });
      }
    }
    const sorted = Array.from(buckets.values()).sort((a, b) => b.mass - a.mass);
    const top = sorted[0];
    const next = sorted[1];
    const total = sorted.reduce((s, b) => s + b.mass, 0);
    const winner = top.items.reduce(
      (best, cur) => cur.weight * cur.confidence > best.weight * best.confidence ? cur : best
    );
    let agreement = total > 0 ? top.mass / total : 0;
    if (next && top.mass < 2 * next.mass) {
      agreement *= 0.8;
    }
    const losers = [];
    for (let i = 1; i < sorted.length; i++) losers.push(...sorted[i].items);
    return { value: winner.value, agreement: clamp01(agreement), winner, losers };
  }
  function keyOf(v) {
    if (v == null) return "null";
    if (typeof v === "string") return `s:${v.toLowerCase().replace(/\s+/g, " ").trim()}`;
    if (typeof v === "number" || typeof v === "boolean") return `p:${String(v)}`;
    try {
      return `o:${JSON.stringify(v)}`;
    } catch {
      return "o:?";
    }
  }
  function clamp01(n) {
    return Math.max(0, Math.min(1, n));
  }

  // extension/question-engine/semantic-types.ts
  var RULES = [
    // ---- contact
    { type: "contact.email", patterns: [/\be-?mail\b/i], confidence: 0.98 },
    { type: "contact.phone", patterns: [/\b(phone|mobile|cell|telephone)\b/i], confidence: 0.98 },
    { type: "contact.first_name", patterns: [/\b(first[\s_-]*name|given[\s_-]*name)\b/i], confidence: 0.98 },
    { type: "contact.last_name", patterns: [/\b(last[\s_-]*name|family[\s_-]*name|surname)\b/i], confidence: 0.98 },
    { type: "contact.full_name", patterns: [/\bfull[\s_-]*name\b/i, /^name$/i], confidence: 0.9 },
    { type: "contact.address", patterns: [/\b(address|street)\b/i], confidence: 0.85 },
    { type: "contact.city", patterns: [/\bcity\b/i], confidence: 0.95 },
    { type: "contact.state", patterns: [/\b(state|province|region)\b/i], confidence: 0.85 },
    { type: "contact.zip", patterns: [/\b(zip|postal[\s_-]*code|postcode)\b/i], confidence: 0.95 },
    { type: "contact.country", patterns: [/\bcountry\b/i], confidence: 0.95 },
    // ---- links
    { type: "link.linkedin", patterns: [/linkedin/i], confidence: 0.98 },
    { type: "link.github", patterns: [/github/i], confidence: 0.98 },
    { type: "link.portfolio", patterns: [/\b(portfolio|personal\s+site)\b/i], confidence: 0.9 },
    { type: "link.website", patterns: [/\b(website|url|homepage)\b/i], confidence: 0.85 },
    // ---- resume
    { type: "resume.file", patterns: [/\b(resume|cv|curriculum)\b/i], requireKind: ["file"], confidence: 0.98 },
    // ---- auth / logistics
    {
      type: "auth.work_authorization",
      patterns: [/\b(authoriz(ed|ation)|legally\s+(able|allowed))\b.*\b(work|employ)/i, /\bright\s+to\s+work\b/i],
      confidence: 0.95
    },
    {
      type: "auth.sponsorship",
      patterns: [/\bsponsor(ship)?\b/i, /\bvisa\b/i, /\bh-?1b\b/i],
      confidence: 0.95
    },
    { type: "logistics.relocation", patterns: [/\brelocat/i], confidence: 0.9 },
    { type: "logistics.start_date", patterns: [/\b(start\s+date|available.*start|when.*start)\b/i], confidence: 0.9 },
    {
      type: "logistics.salary",
      patterns: [/\b(salary|compensation|expected\s+pay|desired\s+pay)\b/i],
      confidence: 0.9
    },
    { type: "logistics.notice_period", patterns: [/\bnotice\s+period\b/i], confidence: 0.95 },
    // ---- EEO
    { type: "eeo.gender", patterns: [/\bgender\b/i, /\bsex\b/i], confidence: 0.95 },
    { type: "eeo.race", patterns: [/\brace\b/i], confidence: 0.95 },
    { type: "eeo.ethnicity", patterns: [/\bethnicit/i, /\bhispanic\b/i, /\blatino\b/i], confidence: 0.95 },
    { type: "eeo.veteran", patterns: [/\bveteran\b/i, /\bprotected\s+veteran\b/i], confidence: 0.98 },
    { type: "eeo.disability", patterns: [/\bdisabilit/i], confidence: 0.98 },
    // ---- consent
    { type: "consent.terms", patterns: [/\b(terms|conditions|agreement)\b/i], confidence: 0.9 },
    { type: "consent.privacy", patterns: [/\bprivacy\s+policy\b/i, /\bdata\s+processing\b/i], confidence: 0.9 },
    { type: "consent.marketing", patterns: [/\b(marketing|newsletter|updates|subscribe)\b/i], confidence: 0.85 },
    // ---- open-ended (last resort)
    { type: "open.why_company", patterns: [/\bwhy\s+(do\s+you\s+want\s+to\s+)?(work|join)\b/i], confidence: 0.85 },
    { type: "open.motivation", patterns: [/\bwhy\s+are\s+you\s+interested\b/i, /\bmotivat/i], confidence: 0.8 },
    { type: "open.cover_letter", patterns: [/\bcover\s+letter\b/i], confidence: 0.95 }
  ];
  function classify(input) {
    const haystack = [
      input.label,
      input.placeholder ?? "",
      input.section ?? "",
      input.optionLabels.join(" ")
    ].join(" \n ").toLowerCase();
    if (!haystack.trim()) return { semanticType: "unknown", confidence: 0 };
    for (const r of RULES) {
      if (r.requireKind && !r.requireKind.includes(input.kind)) continue;
      for (const p of r.patterns) {
        if (p.test(haystack)) {
          return { semanticType: r.type, confidence: r.confidence ?? 0.85 };
        }
      }
    }
    return { semanticType: "unknown", confidence: 0 };
  }

  // extension/question-engine/confidence-engine.ts
  function computeConfidence(input) {
    const labeling = clamp012(fuse(input.labelEvidence).agreement);
    const grouping = clamp012(input.groupConfidence);
    const typing = clamp012(input.typingConfidence);
    const overall = Math.min(grouping, labeling, typing);
    return { grouping, labeling, typing, overall };
  }
  function clamp012(n) {
    return Math.max(0, Math.min(1, n));
  }
  var THRESHOLDS = Object.freeze({
    deterministic: 0.9,
    memoryThenAi: 0.7,
    aiRequired: 0.4,
    visionGate: 0.7
  });

  // extension/question-engine/question-builder.ts
  function build(groups) {
    const out = [];
    const seenIds = /* @__PURE__ */ new Set();
    for (const g of groups) {
      if (g.controls.length === 0) continue;
      const allEvidence = [
        ...g.groupingEvidence,
        ...g.controls.flatMap((c) => c.evidence)
      ];
      const byKind = bucketByKind(allEvidence);
      const labelFused = fuse(byKind.get("label") ?? []);
      const requiredFused = fuse(byKind.get("required") ?? []);
      const optionsFused = fuse(byKind.get("options") ?? []);
      const sectionFused = fuse(byKind.get("section") ?? []);
      const descFused = fuse(byKind.get("description") ?? []);
      const placeholderFused = fuse(byKind.get("placeholder") ?? []);
      const validationFused = fuse(byKind.get("validation") ?? []);
      const anchor = g.controls[0];
      const controlKind = anchor.kind;
      const grouped = g.controls.length > 1;
      const label = typeof labelFused.value === "string" ? labelFused.value : "";
      const kind = questionKindFor(controlKind, grouped, optionsFused.value);
      const options = resolveOptions(g, optionsFused.value);
      const classification = classify({
        label,
        section: sectionFused.value ?? null,
        optionLabels: options.map((o) => o.label),
        placeholder: placeholderFused.value ?? null,
        kind
      });
      const confidence = computeConfidence({
        labelEvidence: byKind.get("label") ?? [],
        groupConfidence: g.groupConfidence,
        typingConfidence: classification.confidence
      });
      const isCustom = controlKind === "custom" || controlKind === "combobox";
      const anchorFid = ensureFid(anchor.node);
      const id = mintId(idKindFor(controlKind, grouped, isCustom), anchorFid, anchor.frame);
      if (seenIds.has(id)) continue;
      seenIds.add(id);
      const q = {
        id,
        frame: anchor.frame,
        label,
        semanticType: classification.semanticType,
        kind,
        required: requiredFused.value === true,
        options,
        section: sectionFused.value ?? null,
        description: descFused.value ?? null,
        placeholder: placeholderFused.value ?? null,
        helpText: null,
        validation: validationFused.value ?? null,
        confidence,
        evidence: Object.freeze(allEvidence),
        controls: Object.freeze(g.controls.map((c) => c.ref))
      };
      out.push(freezeQuestion(q));
    }
    return out;
  }
  function bucketByKind(evidence) {
    const m = /* @__PURE__ */ new Map();
    for (const e of evidence) {
      const a = m.get(e.kind) ?? [];
      a.push(e);
      m.set(e.kind, a);
    }
    return m;
  }
  function questionKindFor(control, grouped, optionsValue) {
    if (control === "file") return "file";
    if (control === "textarea") return "text";
    if (control === "radio") return "single_choice";
    if (control === "checkbox") return grouped ? "multi_choice" : "boolean";
    if (control === "select") return "single_choice";
    if (control === "listbox") return "multi_choice";
    if (control === "combobox") return "single_choice";
    if (Array.isArray(optionsValue) && optionsValue.length > 0) return "single_choice";
    return "text";
  }
  function resolveOptions(g, fusedOptions) {
    if (g.controls.length > 1) {
      return g.controls.map((c) => {
        const input = c.node;
        const label = optionLabelFromControl(c.node) || input.value || "";
        return { value: input.value ?? label, label, ref: c.ref };
      });
    }
    if (Array.isArray(fusedOptions)) {
      const anchor = g.controls[0];
      return fusedOptions.map((o) => ({
        value: o.value,
        label: o.label,
        // For <option> nodes we don't have per-option refs here; reuse anchor ref.
        ref: makeRef(anchor.node)
      }));
    }
    return [];
  }
  function optionLabelFromControl(el) {
    const id = el.getAttribute("id");
    const doc = el.ownerDocument;
    if (id && doc) {
      const l = doc.querySelector(`label[for="${cssEscape5(id)}"]`);
      if (l) return normalize4(l.textContent || "");
    }
    const wrap = el.closest("label");
    if (wrap) {
      const clone = wrap.cloneNode(true);
      clone.querySelectorAll("input,textarea,select,button").forEach((n) => n.remove());
      return normalize4(clone.textContent || "");
    }
    const aria = el.getAttribute("aria-label");
    return aria ? normalize4(aria) : "";
  }
  function normalize4(s) {
    return s.replace(/\s+/g, " ").trim();
  }
  function cssEscape5(s) {
    if (typeof CSS !== "undefined" && CSS.escape) return CSS.escape(s);
    return s.replace(/[^a-zA-Z0-9_-]/g, (c) => `\\${c}`);
  }

  // extension/question-engine/adapters/index.ts
  var registry = [];
  function registerAdapter(plugin) {
    registry.push(plugin);
  }
  function selectAdapter(doc, url) {
    for (const p of registry) {
      if (p.id !== "generic" && p.detect(doc, url)) return p;
    }
    return registry.find((p) => p.id === "generic") ?? null;
  }

  // extension/question-engine/adapters/generic.ts
  var genericAdapter = {
    id: "generic",
    detect() {
      return true;
    },
    collectEvidence(field) {
      const out = [];
      const section = nearestHeading(field.node);
      if (section) out.push(makeEvidence("adapter", "section", section, 0.7));
      return out;
    },
    groupingHints(fields) {
      const buckets = /* @__PURE__ */ new Map();
      for (const f of fields) {
        if (f.kind !== "radio" && f.kind !== "checkbox") continue;
        const c = f.container;
        if (!c || c.tagName.toLowerCase() === "fieldset") continue;
        const arr = buckets.get(c) ?? [];
        arr.push(f);
        buckets.set(c, arr);
      }
      const hints = [];
      for (const [, arr] of buckets) {
        if (arr.length > 1) {
          hints.push({
            memberFids: arr.map((f) => ensureFid(f.node)),
            confidence: 0.75,
            reason: "generic:shared-container"
          });
        }
      }
      return hints;
    }
  };
  function nearestHeading(el) {
    let node = el;
    let depth = 0;
    while (node && depth < 8) {
      let sib = node.previousElementSibling;
      while (sib) {
        if (/^H[1-6]$/.test(sib.tagName) || sib.getAttribute("role") === "heading") {
          const t = (sib.textContent || "").replace(/\s+/g, " ").trim();
          if (t) return t;
        }
        sib = sib.previousElementSibling;
      }
      node = node.parentElement;
      depth++;
    }
    return null;
  }

  // extension/question-engine/adapters/workday.ts
  var WORKDAY_HOST_RE = /myworkday(?:jobs|site)?\.com$|\.wd\d+\.myworkday(?:jobs)?\.com$/i;
  var workdayAdapter = {
    id: "workday",
    detect(doc, url) {
      try {
        const u = new URL(url);
        if (WORKDAY_HOST_RE.test(u.hostname)) return true;
      } catch {
      }
      return !!doc.querySelector("[data-automation-id]");
    },
    collectEvidence(field, doc) {
      const out = [];
      const el = field.node;
      const aid = el.getAttribute("data-automation-id");
      if (aid) {
        const humanized = humanize(aid);
        if (humanized) {
          out.push(
            makeEvidence("adapter", "label", humanized, 0.9, { via: "data-automation-id", aid })
          );
        }
      }
      const parent = el.closest("[data-automation-id]");
      if (parent && parent !== el) {
        const paid = parent.getAttribute("data-automation-id");
        if (paid) out.push(makeEvidence("adapter", "section", humanize(paid), 0.8));
      }
      const req = el.closest("[data-automation-id-prompt]")?.getAttribute("data-required");
      if (req === "true") out.push(makeEvidence("adapter", "required", true, 0.95));
      return out;
    },
    groupingHints(fields) {
      const rows = /* @__PURE__ */ new Map();
      for (const f of fields) {
        const row = f.node.closest('[data-automation-id*="row" i],[data-automation-id*="Row"]');
        if (!row) continue;
        const arr = rows.get(row) ?? [];
        arr.push(f);
        rows.set(row, arr);
      }
      const hints = [];
      for (const [, arr] of rows) {
        if (arr.length > 1) {
          hints.push({
            memberFids: arr.map((f) => ensureFid(f.node)),
            confidence: 0.9,
            reason: "workday:row"
          });
        }
      }
      return hints;
    }
  };
  function humanize(aid) {
    return aid.replace(/^formField-/, "").replace(/[-_]/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2").replace(/\s+/g, " ").trim();
  }

  // extension/question-engine/adapters/ashby.ts
  var ASHBY_HOST_RE = /ashbyhq\.com$|jobs\.ashbyhq\.com$/i;
  var ashbyAdapter = {
    id: "ashby",
    detect(doc, url) {
      try {
        if (ASHBY_HOST_RE.test(new URL(url).hostname)) return true;
      } catch {
      }
      return !!doc.querySelector('[class*="ashby-application" i], [data-testid^="ashby"]');
    },
    collectEvidence(field) {
      const out = [];
      if (field.kind === "checkbox" || field.kind === "radio") {
        const proxy = proxyLabelFor(field.node);
        if (proxy) {
          out.push(makeEvidence("adapter", "label", proxy, 0.9, { via: "ashby-proxy" }));
        }
      }
      const q = field.node.closest('[class*="_fieldEntry_" i], [class*="fieldEntry" i]');
      if (q) {
        const legend = q.querySelector('[class*="_label_" i], label');
        const t = legend?.textContent?.replace(/\s+/g, " ").trim();
        if (t) out.push(makeEvidence("adapter", "label", t, 0.85, { via: "ashby-fieldentry" }));
      }
      return out;
    },
    groupingHints(fields) {
      const buckets = /* @__PURE__ */ new Map();
      for (const f of fields) {
        const c = f.node.closest('[class*="_fieldEntry_" i], [class*="fieldEntry" i]');
        if (!c) continue;
        const arr = buckets.get(c) ?? [];
        arr.push(f);
        buckets.set(c, arr);
      }
      const hints = [];
      for (const [, arr] of buckets) {
        if (arr.length > 1) {
          hints.push({
            memberFids: arr.map((f) => ensureFid(f.node)),
            confidence: 0.95,
            reason: "ashby:fieldEntry"
          });
        }
      }
      return hints;
    }
  };
  function proxyLabelFor(el) {
    const parent = el.parentElement;
    if (!parent) return null;
    const clone = parent.cloneNode(true);
    clone.querySelectorAll("input,textarea,select,button").forEach((n) => n.remove());
    const t = (clone.textContent || "").replace(/\s+/g, " ").trim();
    return t || null;
  }

  // extension/question-engine/adapters/greenhouse.ts
  var GH_HOST_RE = /(?:^|\.)greenhouse\.io$|boards\.greenhouse\.io$|job-boards\.greenhouse\.io$/i;
  var greenhouseAdapter = {
    id: "greenhouse",
    detect(doc, url) {
      try {
        if (GH_HOST_RE.test(new URL(url).hostname)) return true;
      } catch {
      }
      return !!doc.querySelector('form[id="application_form"], [id^="job_application_"]');
    },
    collectEvidence(field) {
      const out = [];
      const id = field.node.getAttribute("id") || "";
      if (id.startsWith("job_application_")) {
        const label = id.replace(/^job_application_(answers_attributes_\d+_)?/, "").replace(/_/g, " ").trim();
        if (label) out.push(makeEvidence("adapter", "label", label, 0.75, { via: "gh-id" }));
      }
      const wrap = field.node.closest(".field, .application-question, li");
      if (wrap?.querySelector(".required, .asterisk")) {
        out.push(makeEvidence("adapter", "required", true, 0.9));
      }
      return out;
    },
    groupingHints(fields) {
      const buckets = /* @__PURE__ */ new Map();
      for (const f of fields) {
        const c = f.node.closest(".application-question, .field");
        if (!c) continue;
        const arr = buckets.get(c) ?? [];
        arr.push(f);
        buckets.set(c, arr);
      }
      const hints = [];
      for (const [, arr] of buckets) {
        if (arr.length > 1) {
          hints.push({
            memberFids: arr.map((f) => ensureFid(f.node)),
            confidence: 0.9,
            reason: "greenhouse:application-question"
          });
        }
      }
      return hints;
    }
  };

  // extension/question-engine/adapters/lever.ts
  var LEVER_HOST_RE = /(?:^|\.)lever\.co$|jobs\.lever\.co$/i;
  var leverAdapter = {
    id: "lever",
    detect(doc, url) {
      try {
        if (LEVER_HOST_RE.test(new URL(url).hostname)) return true;
      } catch {
      }
      return !!doc.querySelector(".application-question, .lever-apply");
    },
    collectEvidence(field) {
      const out = [];
      const q = field.node.closest(".application-question, .application-field");
      if (q) {
        const label = q.querySelector(".application-label, .question-label, label");
        const t = label?.textContent?.replace(/\s+/g, " ").trim();
        if (t) out.push(makeEvidence("adapter", "label", t, 0.9, { via: "lever-app-label" }));
        if (q.querySelector(".required")) out.push(makeEvidence("adapter", "required", true, 0.9));
      }
      return out;
    },
    groupingHints(fields) {
      const buckets = /* @__PURE__ */ new Map();
      for (const f of fields) {
        const c = f.node.closest(".application-question, .application-field");
        if (!c) continue;
        const arr = buckets.get(c) ?? [];
        arr.push(f);
        buckets.set(c, arr);
      }
      const hints = [];
      for (const [, arr] of buckets) {
        if (arr.length > 1) {
          hints.push({
            memberFids: arr.map((f) => ensureFid(f.node)),
            confidence: 0.9,
            reason: "lever:application-question"
          });
        }
      }
      return hints;
    }
  };

  // extension/question-engine/adapters/icims.ts
  var ICIMS_HOST_RE = /icims\.com$|jobs\.icims\.com$/i;
  var icimsAdapter = {
    id: "icims",
    detect(doc, url) {
      try {
        if (ICIMS_HOST_RE.test(new URL(url).hostname)) return true;
      } catch {
      }
      return !!doc.querySelector('[class^="iCIMS_"], [id^="iCIMS_"]');
    },
    collectEvidence(field) {
      const out = [];
      const row = field.node.closest('.iCIMS_TableRow, [class*="iCIMS_InfoField"]');
      if (row) {
        const lbl = row.querySelector(".iCIMS_InfoField_Label, label, .iCIMS_Label");
        const t = lbl?.textContent?.replace(/\s+/g, " ").trim();
        if (t) out.push(makeEvidence("adapter", "label", t, 0.85, { via: "icims-row" }));
        if (row.querySelector('.iCIMS_Required, [class*="Required"]')) {
          out.push(makeEvidence("adapter", "required", true, 0.85));
        }
      }
      return out;
    },
    groupingHints(fields) {
      const buckets = /* @__PURE__ */ new Map();
      for (const f of fields) {
        const c = f.node.closest('.iCIMS_TableRow, [class*="iCIMS_InfoField"]');
        if (!c) continue;
        const arr = buckets.get(c) ?? [];
        arr.push(f);
        buckets.set(c, arr);
      }
      const hints = [];
      for (const [, arr] of buckets) {
        if (arr.length > 1) {
          hints.push({
            memberFids: arr.map((f) => ensureFid(f.node)),
            confidence: 0.85,
            reason: "icims:row"
          });
        }
      }
      return hints;
    }
  };

  // extension/question-engine/legacy.ts
  function projectToLegacy(q) {
    return {
      id: q.id,
      kind: legacyKind(q),
      label: q.label,
      type: legacyType(q),
      name: "",
      options: q.options.map((o) => ({ value: o.value, label: o.label })),
      required: q.required,
      group: q.semanticType,
      accRole: "",
      labelSource: "engine",
      section: q.section ?? "",
      placeholder: q.placeholder ?? "",
      _frame: q.frame,
      confidence: q.confidence.overall
    };
  }
  function legacyKind(q) {
    switch (q.kind) {
      case "single_choice":
        return "structradio";
      case "multi_choice":
        return "checkbox";
      case "boolean":
        return "buttongroup";
      case "text":
        return "text";
      default:
        return q.kind;
    }
  }
  function legacyType(q) {
    switch (q.kind) {
      case "text":
        return "text";
      case "date":
        return "text";
      case "single_choice":
        return "radio";
      case "multi_choice":
        return "checkbox";
      case "boolean":
        return "buttongroup";
      case "file":
        return "file";
      default:
        return "text";
    }
  }

  // extension/question-engine/evidence/mutation.ts
  var OBSERVED_ATTRS = Object.freeze([
    "aria-hidden",
    "hidden",
    "disabled",
    "required",
    "aria-required",
    "aria-label",
    "aria-labelledby",
    "aria-describedby",
    "aria-invalid",
    "value"
  ]);
  function diffQuestions(prev, next) {
    const prevById = new Map(prev.map((q) => [q.id, q]));
    const nextById = new Map(next.map((q) => [q.id, q]));
    const added = [];
    const changed = [];
    const removedIds = [];
    for (const q of next) {
      const before = prevById.get(q.id);
      if (!before) {
        added.push(q);
        continue;
      }
      if (!questionsEquivalent(before, q)) changed.push(q);
    }
    for (const q of prev) {
      if (!nextById.has(q.id)) removedIds.push(q.id);
    }
    return { added, changed, removedIds };
  }
  function questionsEquivalent(a, b) {
    if (a.label !== b.label) return false;
    if (a.kind !== b.kind) return false;
    if (a.semanticType !== b.semanticType) return false;
    if (a.required !== b.required) return false;
    if (a.section !== b.section) return false;
    if (a.options.length !== b.options.length) return false;
    if (Math.abs(a.confidence.overall - b.confidence.overall) > 0.01) return false;
    return true;
  }

  // extension/question-engine/evidence/vision.ts
  var noopProvider = async () => null;
  var activeProvider = noopProvider;
  function setVisionProvider(p) {
    activeProvider = p ?? noopProvider;
  }

  // extension/question-engine/learning/supabase-store.ts
  function questionSignature(q) {
    const label = normalizeLabel(q.label);
    const opts = (q.options ?? []).map((o) => normalizeLabel(o.label)).sort().join("|");
    return simpleHash(`${label}::${q.kind}::${opts}`);
  }
  function normalizeLabel(s) {
    return (s ?? "").toLowerCase().replace(/\s+/g, " ").replace(/[^\p{L}\p{N} ]/gu, "").trim().slice(0, 240);
  }
  function simpleHash(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24)) >>> 0;
    }
    return h.toString(16).padStart(8, "0");
  }
  var activeLearning = null;
  function setLearningEngine(e) {
    activeLearning = e;
  }

  // extension/question-engine/evidence/vision-provider.ts
  var cache = /* @__PURE__ */ new Map();
  var CACHE_TTL_MS = 30 * 60 * 1e3;
  var stamps = /* @__PURE__ */ new Map();
  function createVisionProvider(transport) {
    return async (req) => {
      const key = fingerprint(req.el);
      const now = Date.now();
      const stamp = stamps.get(key) ?? 0;
      if (cache.has(key) && now - stamp < CACHE_TTL_MS) return cache.get(key);
      try {
        const b64 = await transport.screenshot(req.el);
        if (!b64 || b64.length < 200) return null;
        const res = await transport.discover(b64, {
          needed: req.needed,
          url: req.root.location?.href ?? ""
        });
        const first = res.questions?.[0];
        if (!first) {
          cache.set(key, null);
          stamps.set(key, now);
          return null;
        }
        const result = {
          label: first.label,
          options: first.options?.map((label) => ({ value: label, label })),
          confidence: 0.65
        };
        cache.set(key, result);
        stamps.set(key, now);
        return result;
      } catch {
        return null;
      }
    };
  }
  function findVisualDeadZones(root, detectedControlContainers) {
    const doc = root instanceof Document ? root : root.ownerDocument ?? document;
    const candidates = doc.querySelectorAll(
      "form section, form fieldset, form [role='group'], form div[class*='question'], form div[class*='field']"
    );
    const zones = [];
    const promptRe = /\?|(select|choose|how|are you|do you|have you|which|please|what)/i;
    for (const el of Array.from(candidates)) {
      if (detectedControlContainers.has(el)) continue;
      const text = (el.textContent ?? "").trim();
      if (text.length < 4 || text.length > 600) continue;
      if (!promptRe.test(text)) continue;
      const interactive = el.querySelector("input, textarea, select, [role='combobox'], [role='listbox'], [role='radiogroup'], [contenteditable='true']");
      if (interactive) continue;
      const rect = el.getBoundingClientRect();
      if (rect.width < 40 || rect.height < 20) continue;
      zones.push(el);
      if (zones.length >= 8) break;
    }
    return zones;
  }
  function fingerprint(el) {
    const r = el.getBoundingClientRect?.();
    const path = shortPath(el);
    const rectKey = r ? `${Math.round(r.left)}x${Math.round(r.top)}x${Math.round(r.width)}x${Math.round(r.height)}` : "";
    return `${path}#${rectKey}`;
  }
  function shortPath(el) {
    const parts = [];
    let cur = el;
    while (cur && parts.length < 4) {
      const idx = cur.parentElement ? Array.from(cur.parentElement.children).indexOf(cur) : 0;
      parts.unshift(`${cur.tagName.toLowerCase()}[${idx}]`);
      cur = cur.parentElement;
    }
    return parts.join(">");
  }

  // extension/question-engine/decision-loop.ts
  function classifyFailure(q, domOptionsNow, answer, newFieldAppeared) {
    if (newFieldAppeared) return "field_became_visible";
    if (!answer) return "unknown";
    if ((q.kind === "single_choice" || q.kind === "multi_choice") && answer.optionLabel) {
      const want = normalize5(answer.optionLabel);
      const hit = domOptionsNow.some((o) => normalize5(o.label) === want);
      if (!hit) return "option_not_found";
    }
    if (q.validation?.pattern && answer.value) {
      try {
        const re = new RegExp(q.validation.pattern);
        if (!re.test(answer.value)) return "validation_rejected";
      } catch {
      }
    }
    if (answer.value != null || answer.optionLabel != null || answer.optionLabels?.length) {
      return "injection_failed";
    }
    return "unknown";
  }
  function createDecisionLoop(cfg) {
    const maxRounds = Math.max(1, cfg.maxRoundsPerField ?? 2);
    const budget = Math.max(1e3, cfg.totalTimeBudgetMs ?? 8e3);
    return {
      async replan(q, ctx, initialFailure) {
        const start = Date.now();
        const history = [initialFailure];
        let current = q.answer ?? null;
        let round = 0;
        while (round < maxRounds && Date.now() - start < budget) {
          try {
            const { answer } = await cfg.transport.retry({
              field: {
                label: q.label,
                kind: q.kind,
                semanticType: q.semanticType,
                required: q.required,
                placeholder: q.placeholder,
                helpText: q.helpText,
                validation: q.validation
              },
              original_answer: current,
              failure_class: history[history.length - 1] ?? "unknown",
              options: ctx.options,
              siblings: ctx.siblings,
              ats: ctx.ats,
              url: ctx.url
            });
            round += 1;
            current = answer ?? current;
            return { answer: current, rounds: round, failureHistory: history, timedOut: false };
          } catch {
            round += 1;
            history.push("unknown");
          }
        }
        return {
          answer: current,
          rounds: round,
          failureHistory: history,
          timedOut: Date.now() - start >= budget
        };
      },
      pushFailure(prev, f) {
        return { ...prev, failureHistory: [...prev.failureHistory, f] };
      }
    };
  }
  function normalize5(s) {
    return (s ?? "").toLowerCase().replace(/\s+/g, " ").trim();
  }

  // extension/question-engine/index.ts
  registerAdapter(workdayAdapter);
  registerAdapter(ashbyAdapter);
  registerAdapter(greenhouseAdapter);
  registerAdapter(leverAdapter);
  registerAdapter(icimsAdapter);
  registerAdapter(genericAdapter);
  function scanForm(root, opts = {}) {
    const doc = root instanceof Document ? root : root.ownerDocument ?? document;
    const url = doc.location?.href ?? "";
    const adapter = selectAdapter(doc, url);
    const raw = detect(root);
    const detected = enrich(raw, root, adapter);
    const groups = reconstruct(detected, root, adapter);
    const questions = build(groups);
    return questions.map(freezeQuestion);
  }
  function observeForm(root, onUpdate, opts = {}) {
    const doc = root instanceof Document ? root : root.ownerDocument ?? document;
    const win = doc.defaultView;
    if (!win || typeof win.MutationObserver !== "function") return () => {
    };
    const debounceMs = Math.max(0, opts.debounceMs ?? 120);
    let snapshot = scanForm(root, opts);
    onUpdate({ added: [...snapshot], changed: [], removedIds: [] });
    let pending = null;
    const flush = () => {
      pending = null;
      nextGeneration();
      const next = scanForm(root, opts);
      const delta = diffQuestions(snapshot, next);
      snapshot = next;
      if (delta.added.length || delta.changed.length || delta.removedIds.length) {
        onUpdate(delta);
      }
    };
    const mo = new win.MutationObserver(() => {
      if (pending) clearTimeout(pending);
      pending = setTimeout(flush, debounceMs);
    });
    const target = root instanceof Document ? root.documentElement ?? root : root;
    mo.observe(target, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: [...OBSERVED_ATTRS]
    });
    return () => {
      if (pending) clearTimeout(pending);
      mo.disconnect();
    };
  }

  // extension/content.entry.js
  var SUPABASE_URL = "https://dfkoxuokfkttjhfjcecx.supabase.co";
  var SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRma294dW9rZmt0dGpoZmpjZWN4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTYzNTg4NzMsImV4cCI6MjA3MTkzNDg3M30.Th_-ds6dHsxIhRpkzJLREwBIVdgkcdm2SmMNDmjNbxw";
  var PROXY_SECRET = "ayn-proxy-2024";
  var FN_RETRY = `${SUPABASE_URL}/functions/v1/ext-fill-form-retry`;
  var FN_VISION = `${SUPABASE_URL}/functions/v1/ext-vision-discover`;
  var FN_MEMORY = `${SUPABASE_URL}/functions/v1/ext-memory`;
  (function initAynEngineBridge() {
    if (window.__AYN_ENGINE_BRIDGE__) return;
    window.__AYN_ENGINE_BRIDGE__ = true;
    const emit = (questions) => {
      try {
        window.__AYN_QUESTIONS__ = questions;
        window.__AYN_QUESTIONS_LEGACY__ = questions.map(projectToLegacy);
        window.dispatchEvent(
          new CustomEvent("ayn:questions-ready", {
            detail: {
              count: questions.length,
              frame: window.top === window ? "top" : location && location.href || "frame"
            }
          })
        );
      } catch (e) {
        console.warn("[AYN][engine-bridge] emit failed", e);
      }
    };
    const runOnce = () => {
      try {
        emit(scanForm(document));
      } catch (e) {
        console.warn("[AYN][engine-bridge] scan failed", e);
      }
    };
    setTimeout(runOnce, 0);
    try {
      observeForm(
        document,
        (delta) => {
          if (window.__AYN_QUESTIONS__ && !delta.added.length && !delta.changed.length && !delta.removedIds.length) return;
          try {
            emit(scanForm(document));
          } catch (_) {
          }
        },
        { debounceMs: 200 }
      );
    } catch (e) {
      console.warn("[AYN][engine-bridge] observe failed", e);
    }
    const getExtToken = () => new Promise((resolve) => {
      try {
        chrome.storage.local.get(["ayn_token"], (d) => resolve(d && d.ayn_token || null));
      } catch {
        resolve(null);
      }
    });
    let _h2cPromise = null;
    const loadH2C = () => {
      if (_h2cPromise) return _h2cPromise;
      _h2cPromise = (async () => {
        try {
          const url = chrome.runtime.getURL("vendor/html2canvas.esm.js");
          const mod = await import(url);
          return mod.default || mod.html2canvas || null;
        } catch {
          return null;
        }
      })();
      return _h2cPromise;
    };
    const screenshotElement = async (el) => {
      const h2c = await loadH2C();
      if (typeof h2c !== "function") return "";
      try {
        const canvas = await h2c(el, {
          backgroundColor: "#ffffff",
          logging: false,
          scale: 0.75,
          useCORS: true,
          allowTaint: false
        });
        return canvas.toDataURL("image/png").split(",")[1] || "";
      } catch {
        return "";
      }
    };
    try {
      const cache2 = /* @__PURE__ */ new Map();
      const memoryFetch = async (payload) => {
        const token = await getExtToken();
        if (!token) return null;
        try {
          const r = await fetch(FN_MEMORY, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              apikey: SUPABASE_ANON_KEY,
              "x-ayn-ext-token": token
            },
            body: JSON.stringify(payload)
          });
          if (!r.ok) return null;
          return await r.json();
        } catch {
          return null;
        }
      };
      const learning = {
        remember(q) {
          const a = q && q.answer;
          if (!a || a.skip) return;
          const sig = questionSignature(q);
          void memoryFetch({
            action: "remember",
            row: {
              question_signature: sig,
              canonical_label: q.label,
              semantic_type: q.semanticType,
              question_kind: q.kind,
              answer_value: a.value ?? null,
              answer_option_label: a.optionLabel ?? null,
              answer_option_labels: a.optionLabels ?? null
            }
          });
        },
        lookup(q) {
          const sig = questionSignature(q);
          const row = cache2.get(sig);
          if (row === void 0) {
            void memoryFetch({ action: "lookup", signature: sig }).then((res) => {
              cache2.set(sig, res && res.row || null);
            });
            return null;
          }
          if (!row) return null;
          const trust = row.verified_ok_count / Math.max(1, row.verified_ok_count + row.verified_fail_count);
          if (trust < 0.5) return null;
          return {
            answer: {
              value: row.answer_value ?? void 0,
              optionLabel: row.answer_option_label ?? void 0,
              optionLabels: row.answer_option_labels ?? void 0,
              confidence: 0.6 + Math.min(0.3, (row.verified_ok_count || 0) * 0.03),
              reasoning: "learned_from_previous_fills"
            },
            confidence: 0.7,
            source: "memory"
          };
        },
        promote(q) {
          const sig = questionSignature(q);
          void memoryFetch({
            action: "remember",
            row: {
              question_signature: sig,
              canonical_label: q.label,
              semantic_type: q.semanticType,
              question_kind: q.kind,
              verified_ok_count: 1
            }
          });
        },
        forget() {
        },
        async recordVerified(q, verified, atsHint) {
          const a = q && q.answer;
          if (!a) return;
          const sig = questionSignature(q);
          cache2.delete(sig);
          await memoryFetch({
            action: "remember",
            row: {
              question_signature: sig,
              canonical_label: q.label,
              semantic_type: q.semanticType,
              question_kind: q.kind,
              answer_value: a.value ?? null,
              answer_option_label: a.optionLabel ?? null,
              answer_option_labels: a.optionLabels ?? null,
              ats_hint: atsHint || null,
              verified_ok_count: verified ? 1 : 0,
              verified_fail_count: verified ? 0 : 1
            }
          });
        },
        /**
         * Lightweight helper: look up an answer by a raw (label, kind, options)
         * shape. Used by content.js for legacy field descriptors that never
         * materialize into a full Question.
         */
        async lookupByShape(label, kind, options) {
          const sig = questionSignature({ label: label || "", kind: kind || "text", options: options || [] });
          if (cache2.has(sig)) {
            const row2 = cache2.get(sig);
            if (!row2) return null;
            const trust2 = row2.verified_ok_count / Math.max(1, row2.verified_ok_count + row2.verified_fail_count);
            return trust2 >= 0.5 ? row2 : null;
          }
          const res = await memoryFetch({ action: "lookup", signature: sig });
          const row = res && res.row || null;
          cache2.set(sig, row);
          if (!row) return null;
          const trust = row.verified_ok_count / Math.max(1, row.verified_ok_count + row.verified_fail_count);
          return trust >= 0.5 ? row : null;
        }
      };
      setLearningEngine(learning);
      window.__AYN_LEARNING__ = learning;
    } catch (e) {
      console.warn("[AYN][engine-bridge] learning wire failed", e);
    }
    try {
      const loop = createDecisionLoop({
        transport: {
          retry: async (payload) => {
            const r = await fetch(FN_RETRY, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "x-proxy-secret": PROXY_SECRET,
                "x-source": "ext"
              },
              body: JSON.stringify(payload)
            });
            if (!r.ok) throw new Error(`retry_${r.status}`);
            return r.json();
          }
        },
        maxRoundsPerField: 2,
        totalTimeBudgetMs: 8e3
      });
      window.__AYN_DECISION_LOOP__ = { loop, classifyFailure };
    } catch (e) {
      console.warn("[AYN][engine-bridge] decision loop wire failed", e);
    }
    try {
      const discover = async (image_base64, context) => {
        const r = await fetch(FN_VISION, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-proxy-secret": PROXY_SECRET,
            "x-source": "ext"
          },
          body: JSON.stringify({ image_base64, image_mime: "image/png", context })
        });
        if (!r.ok) throw new Error(`vision_${r.status}`);
        return r.json();
      };
      const provider = createVisionProvider({
        screenshot: screenshotElement,
        discover
      });
      setVisionProvider(provider);
      window.__AYN_VISION_DISCOVER__ = {
        async run() {
          try {
            const detectedControls = new Set(
              (window.__AYN_QUESTIONS__ || []).flatMap((q) => (q.controls || []).map((c) => c && c.node).filter(Boolean))
            );
            const zones = findVisualDeadZones(document, detectedControls);
            if (!zones.length) return { zones: 0, questions: [] };
            const all = [];
            for (const zone of zones) {
              const b64 = await screenshotElement(zone);
              if (!b64) continue;
              try {
                const res = await discover(b64, { url: location.href });
                if (Array.isArray(res.questions)) all.push(...res.questions);
              } catch (_) {
              }
            }
            return { zones: zones.length, questions: all };
          } catch (e) {
            return { zones: 0, questions: [], error: String(e) };
          }
        }
      };
    } catch (e) {
      console.warn("[AYN][engine-bridge] vision wire failed", e);
    }
  })();
})();
