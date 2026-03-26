import { useState, useEffect } from 'react';
import { ContractAI } from './ContractAI';
import { supabase } from '@/integrations/supabase/client';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '@/config';
import { useToast } from '@/hooks/use-toast';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Loader2, Plus, Send, Eye, Trash2, FileText, CheckCircle, Clock, Edit, Sparkles, X, ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';

interface NDA {
  id: string; company_name: string; company_email: string;
  contact_person: string; company_phone: string | null;
  nda_purpose: string | null; confidential_info: string | null;
  obligations: string | null; exclusions: string | null;
  duration: string | null; governing_law: string | null;
  additional_clauses: string | null; notes: string | null;
  admin_signature_url: string | null; client_signature_url: string | null;
  admin_signed_at: string | null; client_signed_at: string | null;
  status: string; email_sent_at: string | null;
  signing_token: string; created_at: string;
}

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  draft:  { label: 'Draft',  color: 'bg-white/10 text-white/40' },
  sent:   { label: 'Sent',   color: 'bg-blue-500/15 text-blue-400' },
  viewed: { label: 'Viewed', color: 'bg-amber-500/15 text-amber-400' },
  signed: { label: 'Signed', color: 'bg-green-500/15 text-green-400' },
  expired:{ label: 'Expired',color: 'bg-red-500/15 text-red-400' },
};

function emptyForm() {
  return {
    company_name: '', company_email: '', contact_person: '', company_phone: '',
    nda_purpose: 'To explore a potential business relationship between AYN AI and the Receiving Party.',
    confidential_info: 'All technical, business, financial, strategic, and operational information shared by either party during discussions.',
    obligations: 'The Receiving Party agrees to: (1) keep all confidential information strictly confidential, (2) not disclose it to third parties without written consent, (3) use it solely for evaluation purposes.',
    exclusions: 'Information that is already publicly known, independently developed, or legally obtained from a third party.',
    duration: '2 years from the date of signing.',
    governing_law: '',
    additional_clauses: '',
    notes: '',
  };
}

// ── AI Contract Reviewer ──────────────────────────────────────────────
function AIReviewer({ contractData, type }: { contractData: any; type: 'nda' | 'contract' }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [review, setReview] = useState('');
  const [asked, setAsked] = useState(false);

  const buildContext = () => {
    if (type === 'nda') {
      return `You are a legal contract AI reviewer. Review this NDA for completeness, clarity, and protection of both parties.

NDA DETAILS:
- Company: ${contractData.company_name}
- Purpose: ${contractData.nda_purpose || 'Not specified'}
- Confidential Info: ${contractData.confidential_info || 'Not specified'}
- Obligations: ${contractData.obligations || 'Not specified'}
- Exclusions: ${contractData.exclusions || 'Not specified'}
- Duration: ${contractData.duration || 'Not specified'}
- Governing Law: ${contractData.governing_law || 'Not specified'}
- Additional Clauses: ${contractData.additional_clauses || 'None'}

Provide a structured review covering:
1. ✅ What is well-covered
2. ⚠️ Gaps or weaknesses
3. 🔴 Critical issues that could expose either party
4. 💡 Specific suggestions to improve it

Be concise but thorough. Format clearly with emoji headers.`;
    } else {
      return `You are a legal contract AI reviewer. Review this service agreement for completeness, fairness, and legal protection of both parties.

CONTRACT DETAILS:
- Client: ${contractData.company_name}
- Project: ${contractData.order_title}
- Description: ${contractData.order_description || 'Not specified'}
- System Plan: ${contractData.system_plan || 'Not specified'}
- Payment Terms: ${contractData.payment_terms || 'Not specified'}
- Delivery: ${contractData.delivery_timeline || 'Not specified'}
- Warranty: ${contractData.warranty || 'Not specified'}
- Termination: ${contractData.termination_clause || 'Not specified'}
- Terms & Conditions: ${contractData.terms_and_conditions || 'Not specified'}
- After-Sale: ${contractData.after_sale_services || 'Not specified'}
- Governing Law: ${contractData.governing_law || 'Not specified'}

Provide a structured review covering:
1. ✅ What is well-covered
2. ⚠️ Gaps or weaknesses  
3. 🔴 Critical issues that could expose either party
4. 💡 Specific suggestions to improve it

Be concise but thorough. Format clearly with emoji headers.`;
    }
  };

  const runReview = async () => {
    setLoading(true);
    setAsked(true);
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1000,
          messages: [{ role: 'user', content: buildContext() }],
        }),
      });
      const data = await res.json();
      const text = data.content?.find((b: any) => b.type === 'text')?.text || 'No response.';
      setReview(text);
    } catch (e: any) {
      setReview('Error running review: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-purple-500/5 border border-purple-500/20 rounded-xl overflow-hidden">
      <button onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3 text-left">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-purple-400" />
          <span className="text-purple-300 font-semibold text-sm">AI Contract Reviewer</span>
          <span className="text-[10px] bg-purple-500/20 text-purple-400 px-2 py-0.5 rounded-full">Beta</span>
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-purple-400" /> : <ChevronDown className="w-4 h-4 text-purple-400" />}
      </button>
      {open && (
        <div className="border-t border-purple-500/20 p-4 space-y-3">
          <p className="text-xs text-zinc-400 leading-relaxed">
            AI will read your {type === 'nda' ? 'NDA' : 'contract'} and flag missing clauses, weak protections, or anything that could be a risk — before you send it.
          </p>
          {!asked ? (
            <Button onClick={runReview} disabled={loading} size="sm"
              className="bg-purple-600 hover:bg-purple-500 text-white text-xs h-8 gap-2">
              {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
              Review this {type === 'nda' ? 'NDA' : 'contract'}
            </Button>
          ) : loading ? (
            <div className="flex items-center gap-2 text-xs text-purple-400">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Reading and analyzing...
            </div>
          ) : (
            <div className="space-y-2">
              <div className="bg-zinc-900 rounded-lg p-4 text-xs text-zinc-300 leading-relaxed whitespace-pre-wrap max-h-64 overflow-y-auto">
                {review}
              </div>
              <Button onClick={() => { setReview(''); setAsked(false); }} size="sm" variant="outline"
                className="border-white/10 text-white/50 text-xs h-7">
                Run again
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main NDA Manager ──────────────────────────────────────────────────
export const NDAManager = () => {
  const { toast } = useToast();
  const [ndas, setNdas] = useState<NDA[]>([]);
  const [loading, setLoading] = useState(true);
  const [panel, setPanel] = useState<'none' | 'form' | 'view'>('none');
  const [editingNda, setEditingNda] = useState<NDA | null>(null);
  const [viewingNda, setViewingNda] = useState<NDA | null>(null);
  const [form, setForm] = useState(emptyForm());
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState<string | null>(null);
  const [showAI, setShowAI] = useState(false);

  const fetchNDAs = async () => {
    setLoading(true);
    const { data } = await supabase.from('nda_agreements').select('*').order('created_at', { ascending: false });
    setNdas((data || []) as unknown as NDA[]);
    setLoading(false);
  };

  useEffect(() => { fetchNDAs(); }, []);

  const openForm = (nda?: NDA) => {
    if (nda) {
      setEditingNda(nda);
      setForm({
        company_name: nda.company_name, company_email: nda.company_email,
        contact_person: nda.contact_person, company_phone: nda.company_phone || '',
        nda_purpose: nda.nda_purpose || '', confidential_info: nda.confidential_info || '',
        obligations: nda.obligations || '', exclusions: nda.exclusions || '',
        duration: nda.duration || '', governing_law: nda.governing_law || '',
        additional_clauses: nda.additional_clauses || '', notes: nda.notes || '',
      });
    } else {
      setEditingNda(null);
      setForm(emptyForm());
    }
    setPanel('form');
  };

  const handleSave = async () => {
    if (!form.company_name || !form.company_email || !form.contact_person) {
      toast({ title: 'Missing fields', description: 'Company name, email, and contact person are required.', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      if (editingNda) {
        await supabase.from('nda_agreements').update({ ...form, updated_at: new Date().toISOString() }).eq('id', editingNda.id);
        toast({ title: 'NDA updated' });
      } else {
        const signing_token = crypto.randomUUID();
        await supabase.from('nda_agreements').insert({ ...form, status: 'draft', signing_token });
        toast({ title: 'NDA created' });
      }
      setPanel('none');
      fetchNDAs();
    } catch (e: any) {
      toast({ title: 'Save failed', description: e.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleSend = async (nda: NDA) => {
    setSending(nda.id);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token || SUPABASE_ANON_KEY;
      const res = await fetch(`${SUPABASE_URL}/functions/v1/send-nda-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ ndaId: nda.id }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || 'Failed to send');
      toast({ title: '📨 NDA sent', description: `Sent to ${nda.company_email}` });
      fetchNDAs();
    } catch (e: any) {
      toast({ title: 'Send failed', description: e.message, variant: 'destructive' });
    } finally {
      setSending(null);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this NDA?')) return;
    await supabase.from('nda_agreements').delete().eq('id', id);
    toast({ title: 'Deleted' });
    fetchNDAs();
  };

  const TA = ({ field, rows = 3, placeholder = '' }: { field: keyof typeof form; rows?: number; placeholder?: string }) => (
    <textarea value={(form as any)[field] || ''} onChange={e => setForm(f => ({ ...f, [field]: e.target.value }))}
      rows={rows} placeholder={placeholder}
      className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-white text-sm leading-relaxed focus:outline-none focus:border-white/30 placeholder:text-white/15 resize-none" />
  );

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
        <div>
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-zinc-400" />
            <span className="text-white font-semibold">NDA Agreements</span>
            <span className="text-xs bg-white/10 text-white/40 px-2 py-0.5 rounded-full">{ndas.length}</span>
          </div>
          <p className="text-zinc-500 text-xs mt-0.5">Send and manage non-disclosure agreements</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => { setShowAI(true); openForm(); }} size="sm"
            className="bg-purple-600 hover:bg-purple-500 h-8 text-xs gap-1.5">
            <Sparkles className="w-3.5 h-3.5" /> AI Draft
          </Button>
          <Button onClick={() => { setShowAI(false); openForm(); }} size="sm" className="bg-white text-black hover:bg-zinc-100 h-8 text-xs gap-1">
            <Plus className="w-3.5 h-3.5" /> New NDA
          </Button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* List */}
        <div className={cn('flex-1 overflow-y-auto p-4 space-y-2', panel !== 'none' && 'hidden md:block md:w-80 md:flex-none')}>
          {loading ? (
            <div className="flex justify-center py-10"><Loader2 className="w-5 h-5 animate-spin text-zinc-600" /></div>
          ) : ndas.length === 0 ? (
            <div className="text-center py-16 text-zinc-500">
              <FileText className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">No NDAs yet</p>
              <p className="text-xs mt-1">Create your first NDA to get started</p>
            </div>
          ) : ndas.map(nda => {
            const sc = STATUS_CONFIG[nda.status] || STATUS_CONFIG.draft;
            const ref = `NDA-${nda.id.substring(0,8).toUpperCase()}`;
            return (
              <div key={nda.id} className="bg-white/3 border border-white/8 rounded-xl p-4 hover:border-white/15 transition-colors">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-white font-semibold text-sm truncate">{nda.company_name}</span>
                      <span className={cn('text-[10px] font-semibold px-2 py-0.5 rounded-full', sc.color)}>{sc.label}</span>
                    </div>
                    <div className="text-xs text-zinc-500 mt-0.5">{nda.contact_person} · {nda.company_email}</div>
                    <div className="text-[11px] text-zinc-600 mt-1">{ref} · {new Date(nda.created_at).toLocaleDateString()}</div>
                    {nda.nda_purpose && <div className="text-xs text-zinc-500 mt-1 truncate">{nda.nda_purpose.substring(0,60)}...</div>}
                  </div>
                  <div className="flex gap-1 flex-shrink-0">
                    <button onClick={() => { setViewingNda(nda); setPanel('view'); }}
                      className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-zinc-400" title="View">
                      <Eye className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => openForm(nda)}
                      className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-zinc-400" title="Edit">
                      <Edit className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => handleSend(nda)} disabled={sending === nda.id}
                      className="p-1.5 rounded-lg bg-blue-500/15 hover:bg-blue-500/25 text-blue-400" title="Send NDA">
                      {sending === nda.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                    </button>
                    <button onClick={() => handleDelete(nda.id)}
                      className="p-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400/60 hover:text-red-400" title="Delete">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Form Panel */}
        {panel === 'form' && (
          <div className="flex-1 border-l border-white/10 flex flex-col overflow-hidden">
            <div className="sticky top-0 z-10 bg-zinc-900/95 backdrop-blur border-b border-white/10 px-6 py-3 flex items-center justify-between">
              <span className="text-white font-semibold text-sm">{editingNda ? 'Edit NDA' : 'New NDA Agreement'}</span>
              <div className="flex gap-2">
                <button onClick={() => setShowAI(!showAI)}
                  className={cn("h-7 px-3 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors",
                    showAI ? "bg-purple-600 text-white" : "bg-purple-500/15 text-purple-400 hover:bg-purple-500/25")}>
                  <Sparkles className="w-3 h-3" /> {showAI ? 'Hide AI' : 'AI'}
                </button>
                <Button onClick={handleSave} disabled={saving} size="sm" className="bg-blue-600 hover:bg-blue-500 h-7 text-xs px-4">
                  {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : editingNda ? 'Save' : 'Create'}
                </Button>
                <Button onClick={() => setPanel('none')} variant="outline" size="sm" className="border-white/10 text-white/50 h-7 text-xs px-3">
                  <X className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>

            <div className="flex-1 flex overflow-hidden">
              {showAI && (
                <div className="w-80 flex-shrink-0 border-r border-white/10">
                  <ContractAI type="nda"
                    onClose={() => setShowAI(false)}
                    onFill={fields => setForm(f => ({ ...f, ...fields }))} />
                </div>
              )}
              <div className="flex-1 overflow-y-auto p-6 space-y-5 pb-10">

              {/* AI Reviewer */}
              <AIReviewer contractData={form} type="nda" />

              {/* Client Info */}
              <div className="bg-white/[0.03] border border-white/10 rounded-xl p-5 space-y-3">
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-1 h-4 bg-blue-500 rounded-full" />
                  <span className="text-white/60 text-xs font-semibold uppercase tracking-widest">Receiving Party</span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { key: 'company_name', label: 'Company Name *', placeholder: 'Acme Corp' },
                    { key: 'contact_person', label: 'Contact Person *', placeholder: 'John Smith' },
                    { key: 'company_email', label: 'Email *', placeholder: 'john@acme.com' },
                    { key: 'company_phone', label: 'Phone', placeholder: '+1 555 000 0000' },
                  ].map(({ key, label, placeholder }) => (
                    <div key={key}>
                      <label className="text-white/40 text-xs mb-1.5 block">{label}</label>
                      <Input value={(form as any)[key] || ''} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                        placeholder={placeholder} className="bg-white/5 border-white/10 text-white text-sm h-9 placeholder:text-white/15" />
                    </div>
                  ))}
                </div>
              </div>

              {/* NDA Sections */}
              {[
                { field: 'nda_purpose' as const, label: 'Purpose', color: 'bg-purple-500', rows: 3,
                  placeholder: 'Why this NDA is being entered into...' },
                { field: 'confidential_info' as const, label: 'Confidential Information', color: 'bg-amber-500', rows: 4,
                  placeholder: 'Define what constitutes confidential information...' },
                { field: 'obligations' as const, label: 'Obligations of Receiving Party', color: 'bg-rose-500', rows: 4,
                  placeholder: 'What the receiving party must and must not do...' },
                { field: 'exclusions' as const, label: 'Exclusions from Confidentiality', color: 'bg-zinc-500', rows: 3,
                  placeholder: 'What is NOT considered confidential...' },
                { field: 'duration' as const, label: 'Duration', color: 'bg-cyan-500', rows: 2,
                  placeholder: 'e.g. 2 years from the date of signing' },
                { field: 'governing_law' as const, label: 'Governing Law & Jurisdiction', color: 'bg-green-500', rows: 2,
                  placeholder: 'e.g. Province of Ontario, Canada' },
                { field: 'additional_clauses' as const, label: 'Additional Clauses', color: 'bg-indigo-500', rows: 3,
                  placeholder: 'Non-compete, non-solicitation, IP ownership, etc...' },
                { field: 'notes' as const, label: 'Internal Notes (not sent)', color: 'bg-white/20', rows: 2,
                  placeholder: 'Private notes for your reference only...' },
              ].map(({ field, label, color, rows, placeholder }) => (
                <div key={field} className="bg-white/[0.03] border border-white/10 rounded-xl p-5">
                  <div className="flex items-center gap-2 mb-3">
                    <div className={cn('w-1 h-4 rounded-full', color)} />
                    <span className="text-white/60 text-xs font-semibold uppercase tracking-widest">{label}</span>
                  </div>
                  <TA field={field} rows={rows} placeholder={placeholder} />
                </div>
              ))}
              </div>
            </div>
          </div>
        )}

        {/* View Panel */}
        {panel === 'view' && viewingNda && (() => {
          const sc = STATUS_CONFIG[viewingNda.status] || STATUS_CONFIG.draft;
          const ref = `NDA-${viewingNda.id.substring(0,8).toUpperCase()}`;
          const signingUrl = `https://aynn.io/nda/${viewingNda.signing_token}`;
                  const adminSigningUrl = `https://aynn.io/nda/${viewingNda.signing_token}?role=admin`;
          return (
            <div className="flex-1 border-l border-white/10 flex flex-col overflow-hidden">
              <div className="sticky top-0 z-10 bg-zinc-900/95 backdrop-blur border-b border-white/10 px-5 py-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-white font-semibold text-sm">{viewingNda.company_name}</span>
                  <span className={cn('text-[10px] font-semibold px-2 py-0.5 rounded-full', sc.color)}>{sc.label}</span>
                </div>
                <button onClick={() => setPanel('none')} className="text-zinc-500 hover:text-zinc-300">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-5 space-y-4">
                <div className="text-xs text-zinc-500 space-y-1">
                  <div>{ref}</div>
                  <div>{viewingNda.contact_person} · {viewingNda.company_email}</div>
                  <div>Created {new Date(viewingNda.created_at).toLocaleDateString()}</div>
                </div>

                {/* Signing link */}
                <div className="bg-white/5 border border-white/10 rounded-lg p-3">
                  <div className="text-[10px] text-zinc-500 uppercase tracking-widest mb-1">Client Signing Link (sent in email)</div>
                  <div className="text-xs text-blue-400 break-all mb-3">{signingUrl}</div>
                  <div className="text-[10px] text-zinc-500 uppercase tracking-widest mb-1">Your Admin Signing Link</div>
                  <div className="text-xs text-purple-400 break-all mb-1">{adminSigningUrl}</div>
                  <a href={adminSigningUrl} target="_blank" rel="noreferrer"
                    className="inline-block text-xs bg-purple-600 hover:bg-purple-500 text-white px-3 py-1.5 rounded-lg mt-1 font-medium">
                    Open &amp; Sign as AYN AI →
                  </a>
                </div>

                {/* Signature status */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-white/3 border border-white/8 rounded-lg p-3 text-center">
                    <div className="text-[9px] text-zinc-500 uppercase tracking-widest mb-1">AYN AI</div>
                    {viewingNda.admin_signature_url
                      ? <img src={viewingNda.admin_signature_url} className="max-h-12 mx-auto" alt="AYN sig" />
                      : <div className="text-xs text-zinc-600 italic">Pending</div>}
                  </div>
                  <div className="bg-white/3 border border-white/8 rounded-lg p-3 text-center">
                    <div className="text-[9px] text-zinc-500 uppercase tracking-widest mb-1">{viewingNda.contact_person}</div>
                    {viewingNda.client_signature_url
                      ? <img src={viewingNda.client_signature_url} className="max-h-12 mx-auto" alt="Client sig" />
                      : <div className="text-xs text-zinc-600 italic">{viewingNda.status === 'signed' ? 'Signed' : 'Awaiting'}</div>}
                    {viewingNda.client_signed_at && <div className="text-[10px] text-green-500 mt-1">✓ {new Date(viewingNda.client_signed_at).toLocaleDateString()}</div>}
                  </div>
                </div>

                {/* Content preview */}
                {[
                  { label: 'Purpose', value: viewingNda.nda_purpose },
                  { label: 'Confidential Info', value: viewingNda.confidential_info },
                  { label: 'Obligations', value: viewingNda.obligations },
                  { label: 'Exclusions', value: viewingNda.exclusions },
                  { label: 'Duration', value: viewingNda.duration },
                  { label: 'Governing Law', value: viewingNda.governing_law },
                  { label: 'Additional Clauses', value: viewingNda.additional_clauses },
                ].filter(s => s.value).map(s => (
                  <div key={s.label} className="bg-white/3 border border-white/8 rounded-lg p-3">
                    <div className="text-[10px] text-zinc-500 uppercase tracking-widest mb-1.5">{s.label}</div>
                    <div className="text-xs text-zinc-300 leading-relaxed whitespace-pre-wrap">{s.value}</div>
                  </div>
                ))}

                <div className="flex gap-2 pt-2">
                  <Button onClick={() => handleSend(viewingNda)} disabled={sending === viewingNda.id} size="sm"
                    className="flex-1 bg-blue-600 hover:bg-blue-500 text-xs">
                    {sending === viewingNda.id ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <Send className="w-3.5 h-3.5 mr-1" />}
                    {viewingNda.email_sent_at ? 'Resend NDA' : 'Send NDA'}
                  </Button>
                  {viewingNda.admin_signature_url && viewingNda.client_signature_url && (
                    <Button onClick={async () => {
                      const { data: { session } } = await supabase.auth.getSession();
                      const token = session?.access_token || SUPABASE_ANON_KEY;
                      const res = await fetch(`${SUPABASE_URL}/functions/v1/send-nda-completion`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                        body: JSON.stringify({ ndaId: viewingNda.id }),
                      });
                      const r = await res.json();
                      if (r.success) toast({ title: '📨 Completion emails sent to both parties' });
                      else toast({ title: 'Failed', description: r.error, variant: 'destructive' });
                    }} size="sm" className="bg-green-700 hover:bg-green-600 text-xs gap-1">
                      <CheckCircle className="w-3.5 h-3.5" /> Send Signed Copy
                    </Button>
                  )}
                  <Button onClick={() => openForm(viewingNda)} size="sm" variant="outline"
                    className="border-white/10 text-white/50 text-xs">
                    <Edit className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            </div>
          );
        })()}
      </div>
    </div>
  );
};
