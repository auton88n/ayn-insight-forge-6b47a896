const $ = (s) => document.querySelector(s);

async function setStatus() {
  const r = await chrome.runtime.sendMessage({ type: "ayn_get_token" });
  const el = $("#status");
  if (!r?.token) {
    el.className = "status warn";
    el.innerHTML = 'Not connected. <a href="#" id="open-options-inline">Add device token</a>';
    document.getElementById("open-options-inline")?.addEventListener("click", (e) => { e.preventDefault(); chrome.runtime.openOptionsPage(); });
    return false;
  }
  el.className = "status ok";
  el.textContent = "Connected to AYN";
  return true;
}

async function activeTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function withSpinner(btn, fn) {
  const orig = btn.textContent;
  btn.disabled = true;
  btn.textContent = "Working…";
  try { await fn(); } finally { btn.disabled = false; btn.textContent = orig; }
}

$("#autofill").addEventListener("click", async () => {
  if (!(await setStatus())) return;
  const tab = await activeTab();
  await withSpinner($("#autofill"), async () => {
    await chrome.tabs.sendMessage(tab.id, { type: "ayn_autofill_now" });
    window.close();
  });
});

$("#save").addEventListener("click", async () => {
  if (!(await setStatus())) return;
  const tab = await activeTab();
  await withSpinner($("#save"), async () => {
    await chrome.tabs.sendMessage(tab.id, { type: "ayn_save_job_from_page" });
    window.close();
  });
});

$("#tailor").addEventListener("click", async () => {
  if (!(await setStatus())) return;
  const tab = await activeTab();
  await withSpinner($("#tailor"), async () => {
    // First save (or dedupe) the job
    const save = await chrome.tabs.sendMessage(tab.id, { type: "ayn_save_job_from_page" });
    const jobId = save?.job_id;
    if (!jobId) { alert("Could not save job."); return; }
    const r = await chrome.runtime.sendMessage({ type: "ayn_call", action: "ext_tailor", payload: { job_id: jobId } });
    if (!r?.ok) { alert("Tailor error: " + (r?.error || "unknown")); return; }
    const md = renderMarkdown(r.data.resume);
    download(`${r.data.company || "Resume"} - tailored.md`, md);
  });
});

$("#cover").addEventListener("click", async () => {
  if (!(await setStatus())) return;
  const tab = await activeTab();
  await withSpinner($("#cover"), async () => {
    const save = await chrome.tabs.sendMessage(tab.id, { type: "ayn_save_job_from_page" });
    const jobId = save?.job_id;
    if (!jobId) { alert("Could not save job."); return; }
    const r = await chrome.runtime.sendMessage({ type: "ayn_call", action: "ext_cover_letter", payload: { job_id: jobId } });
    if (!r?.ok) { alert("Cover letter error: " + (r?.error || "unknown")); return; }
    await navigator.clipboard.writeText(r.data.body);
    alert("Cover letter copied to clipboard.");
  });
});

$("#open-options").addEventListener("click", (e) => { e.preventDefault(); chrome.runtime.openOptionsPage(); });

function renderMarkdown(resume) {
  const b = resume.basics || {};
  let out = `# ${b.name || ""}\n`;
  if (b.title) out += `${b.title}\n`;
  out += `${[b.email, b.phone, b.location].filter(Boolean).join(" | ")}\n\n`;
  if (b.summary) out += `## Summary\n${b.summary}\n\n`;
  if (resume.work?.length) {
    out += `## Experience\n`;
    resume.work.forEach((w) => {
      out += `### ${w.title} — ${w.company}\n`;
      out += `${[w.start, w.end].filter(Boolean).join(" – ")}${w.location ? ` | ${w.location}` : ""}\n`;
      (w.bullets || []).forEach((bt) => { out += `- ${bt}\n`; });
      out += "\n";
    });
  }
  if (resume.skills?.length) out += `## Skills\n${resume.skills.join(", ")}\n\n`;
  if (resume.education?.length) {
    out += `## Education\n`;
    resume.education.forEach((e) => { out += `- ${e.degree || ""} ${e.field || ""} — ${e.school} (${e.end || ""})\n`; });
  }
  return out;
}

function download(filename, content) {
  const blob = new Blob([content], { type: "text/markdown" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

setStatus();
