import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { resumeHubApi } from "@/lib/resumeHub";
import { Loader2, Copy, Trash2, Download, Chrome } from "lucide-react";

interface Props { userId: string }

interface Token { id: string; token_prefix: string; device_label: string; last_used_at: string | null; revoked_at: string | null; created_at: string }

export default function ExtensionTab({ userId }: Props) {
  const { toast } = useToast();
  const [tokens, setTokens] = useState<Token[]>([]);
  const [label, setLabel] = useState("My Chrome");
  const [newToken, setNewToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [profile, setProfile] = useState({
    legal_first_name: "", legal_last_name: "", preferred_name: "", email: "", phone: "",
    address_line1: "", city: "", state: "", postal_code: "", country: "",
    linkedin: "", github: "", portfolio: "",
    work_auth_status: "", requires_sponsorship: false,
  });

  const loadTokens = async () => {
    try {
      const { tokens } = await resumeHubApi.listTokens();
      setTokens(tokens);
    } catch (e) {
      console.error(e);
    }
  };

  const loadProfile = async () => {
    const { data } = await supabase.from("user_profile_data").select("*").eq("user_id", userId).maybeSingle();
    if (data) {
      setProfile({
        legal_first_name: data.legal_first_name ?? "",
        legal_last_name: data.legal_last_name ?? "",
        preferred_name: data.preferred_name ?? "",
        email: data.email ?? "",
        phone: data.phone ?? "",
        address_line1: (data.address as Record<string, string>)?.line1 ?? "",
        city: (data.address as Record<string, string>)?.city ?? "",
        state: (data.address as Record<string, string>)?.state ?? "",
        postal_code: (data.address as Record<string, string>)?.postal_code ?? "",
        country: (data.address as Record<string, string>)?.country ?? "",
        linkedin: (data.links as Record<string, string>)?.linkedin ?? "",
        github: (data.links as Record<string, string>)?.github ?? "",
        portfolio: (data.links as Record<string, string>)?.portfolio ?? "",
        work_auth_status: (data.work_auth as Record<string, string>)?.status ?? "",
        requires_sponsorship: !!(data.work_auth as Record<string, unknown>)?.requires_sponsorship,
      });
    }
  };

  useEffect(() => { loadTokens(); loadProfile(); /* eslint-disable-next-line */ }, [userId]);

  const mint = async () => {
    setBusy(true);
    try {
      const r = await resumeHubApi.mintToken(label);
      setNewToken(r.token);
      loadTokens();
    } catch (e) {
      toast({ title: "Failed", description: e instanceof Error ? e.message : "Error", variant: "destructive" });
    } finally { setBusy(false); }
  };

  const revoke = async (id: string) => {
    if (!confirm("Revoke this device?")) return;
    await resumeHubApi.revokeToken(id);
    loadTokens();
  };

  const saveProfile = async () => {
    setBusy(true);
    try {
      const { error } = await supabase.from("user_profile_data").upsert({
        user_id: userId,
        legal_first_name: profile.legal_first_name,
        legal_last_name: profile.legal_last_name,
        preferred_name: profile.preferred_name,
        email: profile.email,
        phone: profile.phone,
        address: { line1: profile.address_line1, city: profile.city, state: profile.state, postal_code: profile.postal_code, country: profile.country },
        links: { linkedin: profile.linkedin, github: profile.github, portfolio: profile.portfolio },
        work_auth: { status: profile.work_auth_status, requires_sponsorship: profile.requires_sponsorship },
      });
      if (error) throw error;
      toast({ title: "Profile saved" });
    } catch (e) {
      toast({ title: "Save failed", description: e instanceof Error ? e.message : "Error", variant: "destructive" });
    } finally { setBusy(false); }
  };

  const downloadExtension = () => {
    fetch("/ayn-autofill.zip")
      .then((r) => { if (!r.ok) throw new Error(`${r.status}`); return r.blob(); })
      .then((blob) => {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = "ayn-autofill.zip";
        a.click();
        URL.revokeObjectURL(a.href);
      })
      .catch((e) => toast({ title: "Download failed", description: String(e), variant: "destructive" }));
  };

  return (
    <div className="space-y-6">
      <Card className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="font-semibold flex items-center gap-2"><Chrome className="w-5 h-5" /> AYN Autofill — Chrome Extension</h3>
            <p className="text-sm text-muted-foreground mt-1">Autofill any job application form, save jobs from LinkedIn / Indeed / company sites, and generate tailored resumes & cover letters inline.</p>
          </div>
          <Button onClick={downloadExtension}><Download className="w-4 h-4 mr-2" />Download ZIP</Button>
        </div>
        <ol className="text-sm text-muted-foreground list-decimal list-inside mt-4 space-y-1">
          <li>Unzip the file.</li>
          <li>Open <code>chrome://extensions</code> and enable <strong>Developer mode</strong>.</li>
          <li>Click <strong>Load unpacked</strong> and select the unzipped folder.</li>
          <li>Open the extension, paste the device token from below, and you're connected.</li>
        </ol>
      </Card>

      <Card className="p-5">
        <h3 className="font-semibold mb-3">Device tokens</h3>
        <div className="flex gap-2 mb-3">
          <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Device label" className="max-w-xs" />
          <Button onClick={mint} disabled={busy}>{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Generate token"}</Button>
        </div>

        {newToken && (
          <div className="p-3 rounded-lg bg-primary/5 border border-primary/30 mb-3">
            <p className="text-xs uppercase tracking-wider mb-1">Copy this token now — it won't be shown again.</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-sm break-all bg-background p-2 rounded">{newToken}</code>
              <Button size="sm" variant="outline" onClick={() => { navigator.clipboard.writeText(newToken); toast({ title: "Copied" }); }}><Copy className="w-4 h-4" /></Button>
            </div>
            <Button size="sm" variant="ghost" onClick={() => setNewToken(null)} className="mt-2">I've copied it</Button>
          </div>
        )}

        <div className="space-y-2">
          {tokens.length === 0 && <p className="text-xs text-muted-foreground">No devices connected.</p>}
          {tokens.map((t) => (
            <div key={t.id} className="flex items-center justify-between p-3 rounded-lg border border-border">
              <div>
                <div className="font-medium text-sm">{t.device_label}</div>
                <div className="text-xs text-muted-foreground">
                  {t.token_prefix} • {t.last_used_at ? `Last used ${new Date(t.last_used_at).toLocaleDateString()}` : "Never used"}
                  {t.revoked_at && <Badge variant="destructive" className="ml-2">Revoked</Badge>}
                </div>
              </div>
              {!t.revoked_at && (
                <Button size="sm" variant="ghost" onClick={() => revoke(t.id)}><Trash2 className="w-4 h-4" /></Button>
              )}
            </div>
          ))}
        </div>
      </Card>

      <Card className="p-5 space-y-3">
        <h3 className="font-semibold">Autofill profile</h3>
        <p className="text-xs text-muted-foreground">Powers the Chrome extension's smart autofill. Stored privately, only your account can read it.</p>
        <div className="grid grid-cols-2 gap-2">
          <Input placeholder="Legal first name" value={profile.legal_first_name} onChange={(e) => setProfile({ ...profile, legal_first_name: e.target.value })} />
          <Input placeholder="Legal last name" value={profile.legal_last_name} onChange={(e) => setProfile({ ...profile, legal_last_name: e.target.value })} />
          <Input placeholder="Preferred name" value={profile.preferred_name} onChange={(e) => setProfile({ ...profile, preferred_name: e.target.value })} />
          <Input placeholder="Phone" value={profile.phone} onChange={(e) => setProfile({ ...profile, phone: e.target.value })} />
          <Input placeholder="Email" value={profile.email} onChange={(e) => setProfile({ ...profile, email: e.target.value })} className="col-span-2" />
          <Input placeholder="Address line 1" value={profile.address_line1} onChange={(e) => setProfile({ ...profile, address_line1: e.target.value })} className="col-span-2" />
          <Input placeholder="City" value={profile.city} onChange={(e) => setProfile({ ...profile, city: e.target.value })} />
          <Input placeholder="State/Region" value={profile.state} onChange={(e) => setProfile({ ...profile, state: e.target.value })} />
          <Input placeholder="Postal code" value={profile.postal_code} onChange={(e) => setProfile({ ...profile, postal_code: e.target.value })} />
          <Input placeholder="Country" value={profile.country} onChange={(e) => setProfile({ ...profile, country: e.target.value })} />
          <Input placeholder="LinkedIn URL" value={profile.linkedin} onChange={(e) => setProfile({ ...profile, linkedin: e.target.value })} className="col-span-2" />
          <Input placeholder="GitHub URL" value={profile.github} onChange={(e) => setProfile({ ...profile, github: e.target.value })} />
          <Input placeholder="Portfolio URL" value={profile.portfolio} onChange={(e) => setProfile({ ...profile, portfolio: e.target.value })} />
          <Input placeholder="Work authorization (e.g. US Citizen, H1B)" value={profile.work_auth_status} onChange={(e) => setProfile({ ...profile, work_auth_status: e.target.value })} className="col-span-2" />
        </div>
        <Button onClick={saveProfile} disabled={busy}>{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save profile"}</Button>
      </Card>
    </div>
  );
}
