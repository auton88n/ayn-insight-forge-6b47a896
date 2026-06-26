import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { SUPABASE_URL } from "@/config";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Check, ShieldCheck, X, Chrome } from "lucide-react";

type State = "loading" | "needs_auth" | "ready" | "approving" | "done" | "error";

export default function ExtensionApprove() {
  const [params] = useSearchParams();
  const code = params.get("code") || "";
  const deviceLabel = params.get("name") || "Chrome";

  const [state, setState] = useState<State>("loading");
  const [email, setEmail] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    if (!code) { setState("error"); setErrorMsg("Missing approval code."); return; }
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) { setState("needs_auth"); return; }
      setEmail(data.session.user.email || null);
      setState("ready");
    })();
  }, [code]);

  async function signInAndReturn() {
    const here = window.location.href;
    sessionStorage.setItem("post_login_redirect", here);
    window.location.href = "/?signin=1";
  }

  async function approve() {
    setState("approving");
    try {
      const { data: s } = await supabase.auth.getSession();
      if (!s.session) { setState("needs_auth"); return; }
      const r = await fetch(`${SUPABASE_URL}/functions/v1/resume-hub`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string,
          Authorization: `Bearer ${s.session.access_token}`,
        },
        body: JSON.stringify({ action: "link_approve", code, device_label: deviceLabel }),
      });
      const j = await r.json();
      if (!r.ok || j.error) throw new Error(j.error || `HTTP ${r.status}`);
      setState("done");
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "Approval failed");
      setState("error");
    }
  }

  function cancel() {
    window.close();
    setTimeout(() => { window.location.href = "/"; }, 200);
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="max-w-md w-full p-8 space-y-6">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-orange-500/10 flex items-center justify-center">
            <Chrome className="w-6 h-6 text-orange-500" />
          </div>
          <div>
            <h1 className="text-lg font-semibold">Connect AYN Resume Tailor</h1>
            <p className="text-xs text-muted-foreground font-mono">{deviceLabel}</p>
          </div>
        </div>

        {state === "loading" && (
          <p className="text-sm text-muted-foreground">Loading…</p>
        )}

        {state === "needs_auth" && (
          <div className="space-y-4">
            <p className="text-sm">Sign in to AYN to connect this browser to your account.</p>
            <Button onClick={signInAndReturn} className="w-full">Sign in to continue</Button>
          </div>
        )}

        {(state === "ready" || state === "approving") && (
          <div className="space-y-4">
            {email && (
              <div className="rounded-lg border border-orange-500/30 bg-orange-500/5 p-3 space-y-1">
                <p className="text-xs text-muted-foreground">This browser will be linked to:</p>
                <p className="text-sm font-semibold font-mono break-all">{email}</p>
              </div>
            )}
            <div className="rounded-lg border border-border p-4 space-y-3 bg-muted/30">
              <div className="flex items-start gap-2 text-sm">
                <ShieldCheck className="w-4 h-4 text-green-600 shrink-0 mt-0.5" />
                <span>This browser will be allowed to fill job applications, score jobs, and tailor your resume on your behalf.</span>
              </div>
              <div className="flex items-start gap-2 text-sm">
                <ShieldCheck className="w-4 h-4 text-green-600 shrink-0 mt-0.5" />
                <span>It cannot access your password, billing, or chat history.</span>
              </div>
              <div className="flex items-start gap-2 text-sm">
                <ShieldCheck className="w-4 h-4 text-green-600 shrink-0 mt-0.5" />
                <span>You can revoke this browser anytime in Resume Hub &rarr; Extension.</span>
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={cancel} className="flex-1" disabled={state === "approving"}>
                <X className="w-4 h-4 mr-1.5" /> Cancel
              </Button>
              <Button onClick={approve} className="flex-1 bg-orange-500 hover:bg-orange-600 text-white" disabled={state === "approving"}>
                {state === "approving" ? "Approving…" : (<><Check className="w-4 h-4 mr-1.5" /> Approve</>)}
              </Button>
            </div>
          </div>
        )}

        {state === "done" && (
          <div className="space-y-3 text-center py-4">
            <div className="w-14 h-14 rounded-full bg-green-500/10 flex items-center justify-center mx-auto">
              <Check className="w-7 h-7 text-green-600" />
            </div>
            <h2 className="font-semibold">Browser connected</h2>
            <p className="text-sm text-muted-foreground">You can close this tab and return to the extension.</p>
            <Button variant="outline" onClick={() => window.close()} className="mt-2">Close tab</Button>
          </div>
        )}

        {state === "error" && (
          <div className="space-y-3">
            <p className="text-sm text-destructive">{errorMsg}</p>
            <Button variant="outline" onClick={() => window.location.reload()} className="w-full">Try again</Button>
          </div>
        )}
      </Card>
    </div>
  );
}
