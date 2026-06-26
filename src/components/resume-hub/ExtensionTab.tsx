import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Chrome, Copy, Download, KeyRound, RefreshCw, Trash2 } from "lucide-react";
import { resumeHubApi } from "@/lib/resumeHub";
import { useToast } from "@/hooks/use-toast";
import CanadianProfileForm from "./CanadianProfileForm";

interface Props { userId: string }

interface TokenRow {
  id: string;
  token_prefix: string;
  device_label: string;
  last_used_at: string | null;
  revoked_at: string | null;
  created_at: string;
}

export default function ExtensionTab({ userId }: Props) {
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [primaryResume, setPrimaryResume] = useState<Record<string, unknown> | null>(null);
  const [tokens, setTokens] = useState<TokenRow[]>([]);
  const [loadingTokens, setLoadingTokens] = useState(false);
  const [minting, setMinting] = useState(false);
  const [newToken, setNewToken] = useState<string | null>(null);
  const [deviceLabel, setDeviceLabel] = useState("Chrome");

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user?.email) setEmail(data.user.email);
    });
    supabase.from("resumes").select("content").eq("user_id", userId).eq("is_primary", true).maybeSingle().then(({ data }) => {
      if (data?.content) setPrimaryResume(data.content as Record<string, unknown>);
    });
    void loadTokens();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  async function loadTokens() {
    setLoadingTokens(true);
    try {
      const r = await resumeHubApi.listTokens();
      setTokens(r.tokens || []);
    } catch (e) {
      toast({ title: "Could not load devices", description: e instanceof Error ? e.message : "Unknown error", variant: "destructive" });
    } finally {
      setLoadingTokens(false);
    }
  }

  async function mintToken() {
    setMinting(true);
    setNewToken(null);
    try {
      const r = await resumeHubApi.mintToken(deviceLabel || "Chrome");
      setNewToken(r.token);
      await loadTokens();
    } catch (e) {
      toast({ title: "Could not generate token", description: e instanceof Error ? e.message : "Unknown error", variant: "destructive" });
    } finally {
      setMinting(false);
    }
  }

  async function revokeToken(id: string) {
    try {
      await resumeHubApi.revokeToken(id);
      await loadTokens();
      toast({ title: "Device disconnected" });
    } catch (e) {
      toast({ title: "Revoke failed", description: e instanceof Error ? e.message : "Unknown error", variant: "destructive" });
    }
  }

  async function copyToken() {
    if (!newToken) return;
    await navigator.clipboard.writeText(newToken);
    toast({ title: "Token copied" });
  }

  const activeTokens = tokens.filter(t => !t.revoked_at);

  async function downloadExtension() {
    try {
      const res = await fetch("/ayn-extension.zip");
      if (!res.ok) throw new Error(`Download failed: ${res.status}`);
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "ayn-extension.zip";
      a.click();
      URL.revokeObjectURL(a.href);
      toast({ title: "Download started", description: "Unzip, then load it in chrome://extensions" });
    } catch (e) {
      toast({ title: "Download failed", description: e instanceof Error ? e.message : "Unknown error", variant: "destructive" });
    }
  }

  return (
    <div className="space-y-6">

      {/* Download hero */}
      <Card className="p-5 space-y-4 border-2 border-orange-500/30 bg-gradient-to-br from-orange-50/40 to-transparent dark:from-orange-950/10">
        <div className="flex items-start gap-4">
          <div className="w-14 h-14 rounded-xl overflow-hidden shrink-0 bg-black flex items-center justify-center">
            <img src="/ayn-icon-128.png" alt="AYN" className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-base">AYN Resume Tailor for Chrome</h3>
            <p className="text-xs font-mono text-muted-foreground mt-0.5">v1.1.0 · Side panel · MV3</p>
            <p className="text-sm text-muted-foreground mt-2">
              Autofill any job application, score jobs while you browse, find recruiters, generate cover letters, track applications, and tailor your resume — all in one side panel.
            </p>
          </div>
        </div>
        <Button onClick={downloadExtension} className="w-full bg-orange-500 hover:bg-orange-600 text-white rounded-md">
          <Download className="w-4 h-4 mr-2" /> Download AYN Extension (.zip)
        </Button>
        <ol className="space-y-1.5 text-xs text-muted-foreground">
          {[
            "Unzip the downloaded file",
            "Open chrome://extensions in Chrome",
            "Toggle Developer mode (top right)",
            "Click Load unpacked and select the unzipped folder",
            "Pin the AYN icon, then generate a device token below",
          ].map((step, i) => (
            <li key={i} className="flex gap-2">
              <span className="font-mono text-foreground shrink-0 w-4">{i + 1}.</span>
              <span>{step}</span>
            </li>
          ))}
        </ol>
      </Card>

      {/* Chrome extension card */}
      <Card className="p-5 space-y-5">
        <div>
          <h3 className="font-semibold flex items-center gap-2">
            <Chrome className="w-5 h-5" /> Connected devices
          </h3>
          <p className="text-sm text-muted-foreground mt-1">
            Generate a token, paste it into the extension's sign-in screen. Revoke any device anytime.
          </p>
        </div>

        {/* How it works */}

        {/* Generate token */}
        <div className="border border-border p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-mono uppercase tracking-widest text-muted-foreground flex items-center gap-2"><KeyRound className="w-3.5 h-3.5" /> Device tokens</p>
            <Button size="sm" variant="ghost" onClick={loadTokens} disabled={loadingTokens}>
              <RefreshCw className={`w-3.5 h-3.5 ${loadingTokens ? "animate-spin" : ""}`} />
            </Button>
          </div>

          <div className="flex gap-2">
            <input
              value={deviceLabel}
              onChange={(e) => setDeviceLabel(e.target.value)}
              placeholder="Device label (e.g. Chrome — Work Laptop)"
              className="flex-1 px-3 py-2 text-sm bg-background border border-border outline-none focus:border-foreground/40"
            />
            <Button onClick={mintToken} disabled={minting}>
              {minting ? "Generating…" : "Generate token"}
            </Button>
          </div>

          {newToken && (
            <div className="bg-foreground/5 border border-foreground/20 p-3 space-y-2">
              <p className="text-xs text-muted-foreground">Copy this token now — it will not be shown again.</p>
              <div className="flex gap-2 items-center">
                <code className="flex-1 text-xs font-mono break-all text-foreground bg-background px-2 py-2 border border-border">{newToken}</code>
                <Button size="sm" variant="outline" onClick={copyToken}><Copy className="w-3.5 h-3.5" /></Button>
              </div>
            </div>
          )}

          {/* Active tokens list */}
          {activeTokens.length > 0 && (
            <div className="space-y-1.5 pt-2">
              {activeTokens.map(t => (
                <div key={t.id} className="flex items-center justify-between text-xs border border-border px-3 py-2">
                  <div>
                    <div className="font-medium text-foreground">{t.device_label}</div>
                    <div className="text-muted-foreground font-mono">{t.token_prefix}</div>
                    <div className="text-muted-foreground">
                      {t.last_used_at ? `Last used ${new Date(t.last_used_at).toLocaleString()}` : "Never used"}
                    </div>
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => revokeToken(t.id)} title="Revoke">
                    <Trash2 className="w-3.5 h-3.5 text-destructive" />
                  </Button>
                </div>
              ))}
            </div>
          )}
          {!loadingTokens && activeTokens.length === 0 && !newToken && (
            <p className="text-xs text-muted-foreground">No devices connected yet.</p>
          )}
        </div>

        {/* Account info */}
        {email && (
          <div className="text-xs text-muted-foreground border border-border px-3 py-2">
            Signed in as <span className="text-foreground font-mono">{email}</span>
          </div>
        )}
      </Card>

      {/* Canadian profile form */}
      <div>
        <div className="mb-4">
          <h3 className="font-semibold text-base">Canadian Job Application Profile</h3>
          <p className="text-xs text-muted-foreground mt-1">
            Fill in your details once. AYN uses this to autofill Canadian job application forms instantly.
          </p>
        </div>
        <CanadianProfileForm userId={userId} resumeData={primaryResume ?? undefined} />
      </div>

    </div>
  );
}
