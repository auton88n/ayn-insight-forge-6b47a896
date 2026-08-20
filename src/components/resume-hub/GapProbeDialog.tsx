/**
 * GapProbeDialog.tsx — v3.133.0
 *
 * One targeted question about one specific flagged weak point in the
 * resume — not a chat. The same "structure only what they actually said,
 * never invent" discipline as GuidedIntake, scoped to fixing one thing.
 * Nothing here decides whether the answer is honest enough to use — that
 * check runs server-side, in code, after the AI call (resume_gap_probe in
 * resume-hub/index.ts), so a vague answer just comes back applicable:false
 * rather than the model guessing to fill the gap.
 */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, ArrowRight } from "lucide-react";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { resumeHubApi, type GapProbeResult } from "@/lib/resumeHub";
import { useToast } from "@/hooks/use-toast";

interface GapProbeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  issue: string;
  question: string;
  onApplied: (result: GapProbeResult) => void;
}

export default function GapProbeDialog({ open, onOpenChange, issue, question, onApplied }: GapProbeDialogProps) {
  const { toast } = useToast();
  const [answer, setAnswer] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const close = (next: boolean) => {
    if (!next) setAnswer("");
    onOpenChange(next);
  };

  const submit = async () => {
    const trimmed = answer.trim();
    if (!trimmed) return;
    setSubmitting(true);
    try {
      const result = await resumeHubApi.gapProbe(issue, question, trimmed);
      if (!result.applicable) {
        toast({
          title: "Didn't have enough to work with",
          description: "That's alright, nothing was changed. AYN only adds what you tell it directly.",
        });
        close(false);
      } else {
        onApplied(result);
      }
    } catch (e) {
      toast({ title: "Couldn't process that", description: (e as Error).message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Tell AYN more</DialogTitle>
          <DialogDescription>{issue}</DialogDescription>
        </DialogHeader>

        {submitting ? (
          <div className="flex flex-col items-center gap-3 py-10">
            <Loader2 className="w-6 h-6 animate-spin" style={{ color: "var(--rh-accent)" }} />
            <p className="text-sm text-muted-foreground">Reading your answer…</p>
          </div>
        ) : (
          <div className="space-y-3 py-2">
            <p className="text-sm font-medium leading-relaxed">{question}</p>
            <Textarea
              value={answer}
              onChange={e => setAnswer(e.target.value)}
              rows={5}
              autoFocus
              placeholder="Answer in your own words. Nothing you don't say here gets added."
            />
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="ghost" size="sm" onClick={() => close(false)}>Cancel</Button>
              <Button size="sm" onClick={submit} disabled={!answer.trim()}>
                Add this <ArrowRight className="w-3.5 h-3.5 ml-1" />
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
