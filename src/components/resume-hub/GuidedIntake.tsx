/**
 * GuidedIntake.tsx — v3.120.0
 *
 * For someone who has no resume yet. A blank "Title / Company / Start /
 * End" form is intimidating when you've never structured your own
 * experience before — this asks for it in plain language instead, one
 * question at a time, mirroring the employer-side intake wizard that
 * already proved this pattern works better than a bare form for
 * describing something you've never had to write down before.
 *
 * One AI call at the end (guidedIntakeExtract) turns the raw answers into
 * the same career shape ProfileTab already edits. Nothing is saved here —
 * the caller merges the result into its own state and the person reviews
 * it through the normal Profile fields, same as an upload.
 */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, ArrowRight, ArrowLeft } from "lucide-react";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { resumeHubApi, type GuidedIntakeExtraction } from "@/lib/resumeHub";
import { useToast } from "@/hooks/use-toast";

type Answer = { question: string; answer: string };

const ROLE_PROMPT =
  "What's the most recent thing you've done: a paid job, internship, volunteer role, freelance work, or a substantial project? Where was it, roughly when, what did you actually do day to day, and what are you proud of from it?";

const STEPS: Array<{ key: string; question: string; placeholder: string; optional?: boolean }> = [
  { key: "role_1", question: ROLE_PROMPT, placeholder: "e.g. I worked the front desk at a dental clinic from summer 2023 to this spring. I booked appointments, handled insurance paperwork, and trained two new hires." },
  { key: "education", question: "What's your most recent school or program? Include what you studied and roughly when. A degree program only, not a certificate or short course, we'll ask about those next.", placeholder: "e.g. Associate's degree in Business Administration, Riverside Community College, graduated 2023." },
  { key: "skills", question: "What are you good at? List anything, even without a job title for it: software, languages, tools, things people ask you for help with.", placeholder: "e.g. Excel, customer service, Spanish, Canva, scheduling software" },
  { key: "certifications", question: "Any certifications, licenses, or completed courses? A professional certificate, an online specialization, a bootcamp, a license. Optional, skip if none.", placeholder: "e.g. AWS Certified Solutions Architect, PMP, a Coursera specialization, a real estate license", optional: true },
];

interface GuidedIntakeProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onComplete: (extracted: GuidedIntakeExtraction) => void;
}

export default function GuidedIntake({ open, onOpenChange, onComplete }: GuidedIntakeProps) {
  const { toast } = useToast();
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [roleCount, setRoleCount] = useState(1);
  const [stepIndex, setStepIndex] = useState(0);
  const [draft, setDraft] = useState("");
  const [askingMore, setAskingMore] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Role questions repeat ("Anything before that?") before falling through
  // to education, so the step list is built dynamically as roles are added.
  const roleSteps = Array.from({ length: roleCount }, (_, i) => ({
    key: `role_${i + 1}`,
    question: i === 0 ? ROLE_PROMPT : "Anything before that? Same idea: where, roughly when, what you did, what you're proud of.",
    placeholder: STEPS[0].placeholder,
  }));
  const steps = [...roleSteps, ...STEPS.slice(1)];
  const current = steps[stepIndex];
  const isLastRoleStep = stepIndex === roleSteps.length - 1;

  const reset = () => {
    setAnswers([]);
    setRoleCount(1);
    setStepIndex(0);
    setDraft("");
    setAskingMore(false);
    setSubmitting(false);
  };

  const close = (next: boolean) => {
    if (!next) reset();
    onOpenChange(next);
  };

  const commitAndAdvance = (goToMoreRoles: boolean) => {
    const trimmed = draft.trim();
    const next = [...answers];
    if (trimmed) next.push({ question: current.question, answer: trimmed });
    setAnswers(next);
    setDraft("");
    if (goToMoreRoles) {
      setRoleCount(c => c + 1);
      setStepIndex(i => i + 1);
      setAskingMore(false);
      return;
    }
    if (isLastRoleStep && !askingMore) {
      setAskingMore(true);
      return;
    }
    setAskingMore(false);
    if (stepIndex + 1 < steps.length) {
      setStepIndex(i => i + 1);
    } else {
      void submit(next);
    }
  };

  const submit = async (finalAnswers: Answer[]) => {
    setSubmitting(true);
    try {
      const extracted = await resumeHubApi.guidedIntakeExtract(finalAnswers);
      onComplete(extracted);
      close(false);
      toast({ title: "Got it", description: "Review what we understood below, then build your resume." });
    } catch (e) {
      toast({ title: "Couldn't process your answers", description: (e as Error).message, variant: "destructive" });
      setSubmitting(false);
    }
  };

  const progress = `${stepIndex + 1} of ${steps.length}${roleCount > 1 && stepIndex < roleSteps.length ? "" : ""}`;

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Build your resume with AYN</DialogTitle>
          <DialogDescription>
            A few plain-language questions. AYN turns your answers into a real resume, nothing invented,
            only what you tell it.
          </DialogDescription>
        </DialogHeader>

        {submitting ? (
          <div className="flex flex-col items-center gap-3 py-10">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Reading your answers…</p>
          </div>
        ) : askingMore ? (
          <div className="space-y-4 py-2">
            <p className="text-sm font-medium">Anything before that? Another job, role, or project.</p>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => commitAndAdvance(true)}>
                Yes, add another
              </Button>
              <Button className="flex-1" onClick={() => commitAndAdvance(false)}>
                No, that's everything
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3 py-2">
            <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
              Question {progress}
            </p>
            <p className="text-sm font-medium leading-relaxed">{current.question}</p>
            <Textarea
              value={draft}
              onChange={e => setDraft(e.target.value)}
              placeholder={current.placeholder}
              rows={5}
              autoFocus
            />
            <div className="flex items-center justify-between gap-2 pt-1">
              <Button
                variant="ghost"
                size="sm"
                disabled={stepIndex === 0}
                onClick={() => {
                  setAnswers(a => a.slice(0, -1));
                  setStepIndex(i => Math.max(0, i - 1));
                  setDraft("");
                }}
              >
                <ArrowLeft className="w-3.5 h-3.5 mr-1" /> Back
              </Button>
              <Button size="sm" onClick={() => commitAndAdvance(false)} disabled={!draft.trim() && !current.optional}>
                {!draft.trim() && current.optional ? "Skip" : stepIndex + 1 < steps.length || !isLastRoleStep ? "Next" : "Continue"}
                <ArrowRight className="w-3.5 h-3.5 ml-1" />
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
