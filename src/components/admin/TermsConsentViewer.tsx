import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { FileCheck, CheckCircle2, XCircle, Search, Users } from 'lucide-react';
import { adminSupabase as supabase } from '@/admin-app/adminSupabase';
import { format } from 'date-fns';

interface ConsentRecord {
  id: string;
  user_id: string;
  terms_version: string;
  privacy_accepted: boolean;
  terms_accepted: boolean;
  ai_disclaimer_accepted: boolean;
  accepted_at: string;
  user_agent: string | null;
}

interface ProfileInfo {
  user_id: string;
  company_name: string | null;
  contact_person: string | null;
}

export const TermsConsentViewer = () => {
  const [records, setRecords] = useState<ConsentRecord[]>([]);
  const [profiles, setProfiles] = useState<Map<string, ProfileInfo>>(new Map());
  const [search, setSearch] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const { data, error } = await supabase.rpc('get_admin_terms_consent');
      if (error) throw error;
      const rows = data || [];
      setRecords(rows.map((r: any) => ({
        id: r.id, user_id: r.user_id, terms_version: r.terms_version,
        privacy_accepted: r.privacy_accepted, terms_accepted: r.terms_accepted,
        ai_disclaimer_accepted: r.ai_disclaimer_accepted,
        accepted_at: r.accepted_at, user_agent: r.user_agent,
      })));
      const map = new Map<string, ProfileInfo>();
      rows.forEach((r: any) => map.set(r.user_id, {
        user_id: r.user_id,
        contact_person: r.display_name || null,
        company_name: r.email || null,
      }));
      setProfiles(map);
    } catch (err) {
      console.error('Failed to fetch consent logs:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const filtered = records.filter(r => {
    if (!search) return true;
    const q = search.toLowerCase();
    const profile = profiles.get(r.user_id);
    const name = profile?.contact_person?.toLowerCase() || '';
    const company = profile?.company_name?.toLowerCase() || '';
    return name.includes(q) || company.includes(q) || r.user_id.toLowerCase().includes(q) || r.terms_version.includes(q);
  });

  const BoolIcon = ({ value }: { value: boolean }) =>
    value ? <CheckCircle2 className="w-4 h-4 text-green-500" /> : <XCircle className="w-4 h-4 text-destructive" />;

  const getUserLabel = (userId: string) => {
    const p = profiles.get(userId);
    return p?.contact_person || p?.company_name || userId.slice(0, 8) + '…';
  };

  if (isLoading) {
    return <div className="flex items-center justify-center py-20 text-muted-foreground">Loading consent logs…</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br from-teal-500 to-emerald-500 text-white shadow-lg">
          <FileCheck className="w-5 h-5" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-foreground">Terms Consent Log</h2>
          <p className="text-sm text-muted-foreground">Immutable audit trail of user consent</p>
        </div>
      </div>

      {/* Summary */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center gap-3">
            <Users className="w-5 h-5 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">Total Acceptances</span>
            <Badge variant="secondary" className="ml-auto text-lg px-3">{records.length}</Badge>
          </div>
        </CardContent>
      </Card>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Search by user or version…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Consent Records ({filtered.length})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th className="px-4 py-3 font-medium">User</th>
                  <th className="px-4 py-3 font-medium">Version</th>
                  <th className="px-4 py-3 font-medium text-center">Privacy</th>
                  <th className="px-4 py-3 font-medium text-center">Terms</th>
                  <th className="px-4 py-3 font-medium text-center">AI Disclaimer</th>
                  <th className="px-4 py-3 font-medium">Accepted At</th>
                  <th className="px-4 py-3 font-medium">User Agent</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                      No consent records found
                    </td>
                  </tr>
                ) : (
                  filtered.map(r => (
                    <tr key={r.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3 font-medium text-foreground">{getUserLabel(r.user_id)}</td>
                      <td className="px-4 py-3"><Badge variant="outline">{r.terms_version}</Badge></td>
                      <td className="px-4 py-3 text-center"><BoolIcon value={r.privacy_accepted} /></td>
                      <td className="px-4 py-3 text-center"><BoolIcon value={r.terms_accepted} /></td>
                      <td className="px-4 py-3 text-center"><BoolIcon value={r.ai_disclaimer_accepted} /></td>
                      <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                        {format(new Date(r.accepted_at), 'yyyy-MM-dd HH:mm')}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground max-w-[200px] truncate" title={r.user_agent || ''}>
                        {r.user_agent ? r.user_agent.slice(0, 50) + (r.user_agent.length > 50 ? '…' : '') : '—'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
