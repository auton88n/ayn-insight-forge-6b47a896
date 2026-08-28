/**
 * AutoApplyPanel.tsx — v3.266.0
 *
 * Reads a real employer application form and fills it from the person's own
 * stored facts (identity, work_auth, screening_answers) via
 * auto_apply_extract/auto_apply_fill. Two things this deliberately never
 * does: it never submits without an explicit, separate click on the actual
 * filled state (the preview fill shows a real screenshot of what job-checker
 * put into the real page before Submit is ever offered), and it never
 * touches a platform that needs the person's own account. That second case
 * — confirmed live across every ATS in AYN's own catalog to be roughly 1 in
 * 10 postings (Workday, Taleo, UKG/UltiPro's own signin walls; SmartRecruiters'
 * bot-blocking reads the same way from here since extraction can't complete
 * either way) — gets a plain, honest fallback: open the real page in a real
 * window (the same top-level-window pattern "Sign in with Google" popups
 * use, not an iframe — Workday and Taleo both send a real, standards-based
 * X-Frame-Options: DENY on their own signin pages, confirmed live with curl
 * before building this, so an embedded overlay was never actually possible
 * for these). The person signs into their own real account there, on the
 * employer's own site, the same as they would without AYN at all — AYN
 * never creates or holds that account.
 */
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Loader2, ExternalLink, CheckCircle2, AlertTriangle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { autoApplyExtract, autoApplyFill, type AutoApplyExtractResult } from "@/lib/resumeHub";
import { buildResumePdfBlob, buildTextPdfBlob, downloadBlob, fileBase, type ResumeContent } from "@/lib/resumeDocs";

interface Props {
  userId: string;
  jobId: string;
  jobTitle: string;
  company: string;
  sourceUrl: string | null;
  resumeContent: ResumeContent | null;
  coverLetterBody: string | null;
  alreadyCharged: boolean;
  onMarkApplied: () => void;
  /** True only when Browse jobs' own "Auto-apply" button is what brought
   * the person here — skips the idle state and reads the real form
   * immediately, so the flow is genuinely one click, not a click plus a
   * second click after landing. onAutoStartConsumed lets the parent clear
   * its own flag the moment this actually fires, so it can never re-fire
   * on a later re-render or a different job. */
  autoStart?: boolean;
  onAutoStartConsumed?: () => void;
}

type Phase = "idle" | "extracting" | "signinFallback" | "extractionFailed" | "review" | "filling" | "previewed" | "submitting" | "submitted";

const AUTO_APPLY_COST = 5;

/** A small window, not an iframe — see this file's own header comment for
 * why: the employer's own signin page refuses to be embedded at all. */
function openApplyWindow(url: string) {
  window.open(url, "ayn_apply", "width=560,height=820,noopener,noreferrer");
}

export default function AutoApplyPanel({
  userId, jobId, jobTitle, company, sourceUrl, resumeContent, coverLetterBody, alreadyCharged, onMarkApplied,
  autoStart, onAutoStartConsumed,
}: Props) {
  const { toast } = useToast();
  const [phase, setPhase] = useState<Phase>("idle");
  const [result, setResult] = useState<AutoApplyExtractResult | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [screenshot, setScreenshot] = useState<string | null>(null);
  const [fillSummary, setFillSummary] = useState<{ filled: number; failed: string[] } | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const start = async () => {
    if (!resumeContent) return;
    setPhase("extracting");
    try {
      const r = await autoApplyExtract(jobId);
      setResult(r);
      if (r.signinRequired) { setPhase("signinFallback"); return; }
      if (r.extractionFailed) { setPhase("extractionFailed"); return; }
      const seeded: Record<string, string> = {};
      for (const m of Object.values(r.identityMatches ?? {})) seeded[m.fieldId] = m.value ?? "";
      for (const m of r.answerMatches ?? []) seeded[m.fieldId] = m.answer ?? "";
      setValues(seeded);
      setPhase("review");
    } catch (e) {
      toast({ title: "Couldn't read this application", description: e instanceof Error ? e.message : "Error", variant: "destructive" });
      setPhase("idle");
    }
  };

  // v3.271.0 — fires once, only when Browse jobs' own Auto-apply button is
  // what brought us here. Waits on resumeContent specifically because it's
  // loaded async in the parent (the tailored/primary resume fetch) and can
  // genuinely still be null on the very first render of a freshly-landed
  // job. The ref (not just checking phase === "idle") is what actually
  // prevents a second fire: phase flips to "extracting" inside the same
  // tick start() is called, but effects can still re-run before that state
  // update is visible here, and calling autoApplyExtract twice would be a
  // real, avoidable second free call.
  const autoStartedRef = useRef(false);
  useEffect(() => {
    if (autoStart && resumeContent && !autoStartedRef.current) {
      autoStartedRef.current = true;
      onAutoStartConsumed?.();
      start();
    }
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [autoStart, resumeContent]);

  /** The one file every real application needs a real, servable URL for —
   * uploaded fresh per attempt to the person's own private storage folder,
   * a signed link handed to job-checker only for as long as this one fill
   * call needs it. Prefers a resume field's label to tell resume apart from
   * an (occasionally present) separate cover-letter upload; falls back to
   * the only file field on the form when there's just one. */
  const uploadResume = async (): Promise<string> => {
    const blob = buildResumePdfBlob(resumeContent!);
    const path = `${userId}/auto-apply-${jobId}.pdf`;
    const { error } = await supabase.storage.from("resumes").upload(path, blob, { upsert: true, contentType: "application/pdf" });
    if (error) throw new Error(`Couldn't attach your resume: ${error.message}`);
    const { data, error: signErr } = await supabase.storage.from("resumes").createSignedUrl(path, 600);
    if (signErr || !data?.signedUrl) throw new Error("Couldn't prepare your resume for upload.");
    return data.signedUrl;
  };

  const runFill = async (submit: boolean) => {
    if (!result) return;
    setPhase(submit ? "submitting" : "filling");
    setSubmitError(null);
    try {
      const resumeFileUrl = await uploadResume();
      const fileFields = result.fileFields ?? [];
      const resumeField = fileFields.find((f) => /resum|\bcv\b/i.test(f.label)) ?? fileFields[0];
      const coverField = coverLetterBody
        ? fileFields.find((f) => /cover/i.test(f.label) && f.id !== resumeField?.id)
        : undefined;

      const textValues = [
        ...Object.values(result.identityMatches ?? {}).map((m) => ({ label: m.label, value: (values[m.fieldId] ?? "").trim(), isIdentity: true })),
        ...(result.answerMatches ?? []).map((m) => ({ label: m.label, value: (values[m.fieldId] ?? "").trim() })),
      ].filter((tv) => tv.value.length > 0);

      const radioSelections = (result.radioMatches ?? [])
        .filter((rm) => rm.chosenOptionLabel)
        .map((rm) => ({ groupLabel: rm.groupLabel, optionLabel: rm.chosenOptionLabel! }));

      const r = await autoApplyFill({
        jobId,
        applyUrl: result.applyUrl,
        textValues,
        radioSelections,
        resumeLabel: resumeField?.label,
        resumeFileUrl,
        coverLetterLabel: coverField?.label,
        coverLetterFileUrl: coverField ? await uploadCoverLetter() : undefined,
        submit,
      });

      if (r.screenshotBase64) setScreenshot(`data:image/png;base64,${r.screenshotBase64}`);
      setFillSummary({ filled: r.filled ?? 0, failed: r.failed ?? [] });

      if (submit) {
        if (r.submitted) {
          setPhase("submitted");
          onMarkApplied();
        } else {
          setSubmitError(r.submitError || "The form filled correctly, but the final submit click didn't go through.");
          setPhase("previewed");
        }
      } else {
        setPhase("previewed");
      }
    } catch (e) {
      toast({ title: submit ? "Submit failed" : "Fill failed", description: e instanceof Error ? e.message : "Error", variant: "destructive" });
      setPhase("review");
    }
  };

  // job-checker's own file download always saves to a .pdf path regardless
  // of what's actually at the URL (see /fill_form's _download_to_temp calls)
  // — a plain-text upload here would get handed to the employer's form as a
  // ".pdf" that isn't really one, so this builds a real PDF the same way
  // the Jobs tab's own cover-letter download already does.
  const uploadCoverLetter = async (): Promise<string> => {
    const blob = buildTextPdfBlob(coverLetterBody ?? "");
    const path = `${userId}/auto-apply-cover-${jobId}.pdf`;
    await supabase.storage.from("resumes").upload(path, blob, { upsert: true, contentType: "application/pdf" });
    const { data } = await supabase.storage.from("resumes").createSignedUrl(path, 600);
    return data?.signedUrl ?? "";
  };

  const downloadResumeForManualApply = () => {
    downloadBlob(buildResumePdfBlob(resumeContent!), `${fileBase(company, jobTitle, "Resume")}.pdf`);
  };

  if (!resumeContent) return null;

  return (
    <Card className="p-5 rounded-xl space-y-3" style={{ borderColor: "var(--rh-hair)", boxShadow: "var(--rh-shadow-card)" }}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="rh-display text-sm">Auto-apply</h3>
          <p className="text-xs mt-0.5" style={{ color: "var(--rh-faint)" }}>
            AYN reads this employer's real application form and fills it from your profile. You review before anything is submitted.
          </p>
        </div>
        {phase === "idle" && (
          <Button
            onClick={start}
            style={{ background: "var(--rh-gradient)", borderColor: "transparent", color: "#fff", boxShadow: "var(--rh-glow)" }}
            className="hover:opacity-90 shrink-0"
          >
            Auto-apply{!alreadyCharged && ` (${AUTO_APPLY_COST} credits)`}
          </Button>
        )}
      </div>

      {phase === "extracting" && (
        <p className="text-sm flex items-center gap-2" style={{ color: "var(--rh-muted)" }}>
          <Loader2 className="w-4 h-4 animate-spin" />Reading this employer's application form…
        </p>
      )}

      {(phase === "signinFallback" || phase === "extractionFailed") && (
        <div className="rounded-lg border p-3 space-y-2" style={{ borderColor: "var(--rh-hair)", background: "var(--rh-raised)" }}>
          <p className="text-sm flex items-start gap-2" style={{ color: "var(--rh-ink)" }}>
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" style={{ color: "var(--rh-gold)" }} />
            {phase === "signinFallback"
              ? "This employer's application needs its own account to continue. AYN never creates or holds an account for you. Sign in there yourself, or create a real account of your own, then apply directly in the window below."
              : "AYN couldn't read this employer's form automatically. Download your resume below and apply directly in the window."}
          </p>
          <div className="flex items-center gap-2 flex-wrap">
            <Button size="sm" variant="outline" onClick={() => openApplyWindow(result?.applyUrl || sourceUrl || "")}>
              Open application <ExternalLink className="w-3.5 h-3.5 ml-1.5" />
            </Button>
            <Button size="sm" variant="outline" onClick={downloadResumeForManualApply}>Download my resume</Button>
            <Button size="sm" variant="ghost" onClick={onMarkApplied}>I already applied</Button>
          </div>
        </div>
      )}

      {phase === "review" && result && (
        <div className="space-y-3">
          {Object.values(result.identityMatches ?? {}).map((m) => (
            <FieldRow key={m.fieldId} label={m.label} value={values[m.fieldId] ?? ""} onChange={(v) => setValues((p) => ({ ...p, [m.fieldId]: v }))} />
          ))}
          {(result.answerMatches ?? []).map((m) => (
            <FieldRow
              key={m.fieldId}
              label={m.label}
              value={values[m.fieldId] ?? ""}
              onChange={(v) => setValues((p) => ({ ...p, [m.fieldId]: v }))}
              needsInput={!m.answer}
            />
          ))}
          {(result.radioMatches ?? []).map((rm) => (
            <div key={rm.groupName} className="text-sm">
              <span style={{ color: "var(--rh-muted)" }}>{rm.groupLabel}: </span>
              {rm.chosenOptionLabel
                ? <span className="font-medium">{rm.chosenOptionLabel}</span>
                : <span style={{ color: "var(--rh-gold)" }}>couldn't be answered from your profile. Fill this one in yourself before submitting.</span>}
            </div>
          ))}
          <p className="text-xs" style={{ color: "var(--rh-faint)" }}>
            Your resume{coverLetterBody ? " and cover letter" : ""} will be attached automatically.
          </p>
          <Button onClick={() => runFill(false)} variant="outline">Fill this application</Button>
        </div>
      )}

      {phase === "filling" && (
        <p className="text-sm flex items-center gap-2" style={{ color: "var(--rh-muted)" }}>
          <Loader2 className="w-4 h-4 animate-spin" />Filling the real form…
        </p>
      )}

      {(phase === "previewed" || phase === "submitting") && (
        <div className="space-y-3">
          {fillSummary && (
            <p className="text-xs" style={{ color: "var(--rh-muted)" }}>
              {fillSummary.filled} field{fillSummary.filled === 1 ? "" : "s"} filled
              {fillSummary.failed.length > 0 && `, ${fillSummary.failed.length} couldn't be matched`}.
            </p>
          )}
          {screenshot && (
            <img src={screenshot} alt="The filled application form" className="w-full rounded-lg border" style={{ borderColor: "var(--rh-hair)" }} />
          )}
          {submitError && (
            <p className="text-sm" style={{ color: "#9a5348" }}>{submitError}</p>
          )}
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              onClick={() => runFill(true)}
              disabled={phase === "submitting"}
              style={{ background: "var(--rh-gradient)", borderColor: "transparent", color: "#fff", boxShadow: "var(--rh-glow)" }}
              className="hover:opacity-90"
            >
              {phase === "submitting" ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Submitting…</> : "This looks right, submit"}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => openApplyWindow(result?.applyUrl || sourceUrl || "")}>
              Finish it myself instead <ExternalLink className="w-3.5 h-3.5 ml-1.5" />
            </Button>
          </div>
        </div>
      )}

      {phase === "submitted" && (
        <p className="text-sm flex items-center gap-2" style={{ color: "var(--rh-trust)" }}>
          <CheckCircle2 className="w-4 h-4" />Submitted to {company}. Marked as applied.
        </p>
      )}
    </Card>
  );
}

function FieldRow({ label, value, onChange, needsInput }: { label: string; value: string; onChange: (v: string) => void; needsInput?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs w-2/5 shrink-0 truncate" style={{ color: "var(--rh-muted)" }} title={label}>{label}</span>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={needsInput ? "Not on file, type your answer" : undefined}
        className="h-8 text-sm"
        style={needsInput && !value ? { borderColor: "var(--rh-gold)" } : undefined}
      />
    </div>
  );
}
