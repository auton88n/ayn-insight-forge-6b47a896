import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { OUT_OF_CREDITS_EVENT } from "@/lib/outOfCredits";

/** Shown whenever a paid action is refused for lack of credits. Offers the way forward instead of a dead end. */
export function OutOfCreditsDialog({ onSeePlans }: { onSeePlans: () => void }) {
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const handler = (e: Event) => setMessage((e as CustomEvent<{ message?: string }>).detail?.message || "You do not have enough credits for that.");
    window.addEventListener(OUT_OF_CREDITS_EVENT, handler);
    return () => window.removeEventListener(OUT_OF_CREDITS_EVENT, handler);
  }, []);

  return (
    <Dialog open={message !== null} onOpenChange={(open) => { if (!open) setMessage(null); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>You are out of credits</DialogTitle>
          <DialogDescription>{message}</DialogDescription>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Credits pay for tailored resumes and cover letters. Browsing jobs, checking your fit and checking your resume stay free.
        </p>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setMessage(null)}>Not now</Button>
          <Button onClick={() => { setMessage(null); onSeePlans(); }}>See plans and get more credits</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
