import { useEffect, useState } from "react";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Chrome, Download, RefreshCw, ShieldCheck, Trash2, AlertCircle, CheckCircle2 } from "lucide-react";
import { resumeHubApi } from "@/lib/resumeHub";
import { getInstalledVersion } from "@/lib/extension";
import { useToast } from "@/hooks/use-toast";
import manifest from "../../../extension/manifest.json";


interface Props { userId: string }

interface TokenRow {
  id: string;
  token_prefix: string;
  device_label: string;
  last_used_at: string | null;
  revoked_at: string | null;
  created_at: string;
}

export default function ExtensionTab({ userId: _userId }: Props) {
  const { toast } = useToast();
  const [tokens, setTokens] = useState<TokenRow[]>([]);
  const [loadingTokens, setLoadingTokens] = useState(false);
  const [installedVersion, setInstalledVersion] = useState<string | null>(null);

  useEffect(() => {
    void loadTokens();
    void getInstalledVersion().then(setInstalledVersion);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  async function revokeToken(id: string) {
    try {
      await resumeHubApi.revokeToken(id);
      await loadTokens();
      toast({ title: "Device disconnected" });
    } catch (e) {
      toast({ title: "Revoke failed", description: e instanceof Error ? e.message : "Unknown error", variant: "destructive" });
    }
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
            <div className="flex items-center gap-2 flex-wrap mt-0.5">
              <p className="text-xs font-mono text-muted-foreground">Latest v{manifest.version} · MV3</p>
              {installedVersion && installedVersion === manifest.version && (
                <Badge variant="secondary" className="text-[10px] gap-1"><CheckCircle2 className="w-3 h-3" /> Installed v{installedVersion}</Badge>
              )}
              {installedVersion && installedVersion !== manifest.version && (
                <Badge variant="destructive" className="text-[10px] gap-1"><AlertCircle className="w-3 h-3" /> Update available (installed v{installedVersion})</Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground mt-2">
              Score and tailor without leaving the page. AYN only reads it.
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
            "Click Load unpacked and pick the unzipped folder",
            "Open the side panel and click Sign in with AYN",
          ].map((step, i) => (
            <li key={i} className="flex gap-2">
              <span className="font-mono text-foreground shrink-0 w-4">{i + 1}.</span>
              <span>{step}</span>
            </li>
          ))}
        </ol>
      </Card>

      {/* Security note */}
      <Card className="p-4 flex items-start gap-3 border border-border bg-muted/20">
        <ShieldCheck className="w-5 h-5 text-green-600 shrink-0 mt-0.5" />
        <div className="text-sm">
          <div className="font-medium">Your password never leaves AYN.</div>
          <p className="text-xs text-muted-foreground mt-1">
            Each browser gets its own scoped key, limited to resume features. Revoke any browser anytime below.
          </p>
        </div>
      </Card>

      {/* Connected devices */}
      <Card className="p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold flex items-center gap-2">
            <Chrome className="w-5 h-5" /> Connected browsers
          </h3>
          <Button size="sm" variant="ghost" onClick={loadTokens} disabled={loadingTokens}>
            <RefreshCw className={`w-3.5 h-3.5 ${loadingTokens ? "animate-spin" : ""}`} />
          </Button>
        </div>

        {activeTokens.length > 0 ? (
          <div className="space-y-1.5">
            {activeTokens.map(t => (
              <div key={t.id} className="flex items-center justify-between text-xs border border-border rounded-md px-3 py-2">
                <div>
                  <div className="font-medium text-foreground">{t.device_label}</div>
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
        ) : (
          <p className="text-xs text-muted-foreground">No browsers connected yet. Install the extension and click "Sign in with AYN" inside it.</p>
        )}
      </Card>



    </div>
  );
}
