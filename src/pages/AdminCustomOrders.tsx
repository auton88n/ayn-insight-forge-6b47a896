import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import {
  ArrowLeft, Plus, Send, FileText, Trash2, Eye, Edit2,
  DollarSign, Building2, Clock, CheckCircle, XCircle,
  Loader2, Download, PenTool, Search, X, Minus
} from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface ServiceItem { name: string; description: string; price: number; quantity: number; }

interface CustomOrder {
  id: string; company_name: string; company_email: string; contact_person: string;
  company_phone: string | null; company_address: string | null;
  order_title: string; order_description: string | null;
  services: ServiceItem[]; subtotal: number; discount_percent: number;
  tax_percent: number; total_amount: number; currency: string;
  terms_and_conditions: string | null; privacy_notes: string | null;
  after_sale_services: string | null; delivery_timeline: string | null;
  admin_signature_url: string | null; client_signature_url: string | null;
  admin_signed_at: string | null; client_signed_at: string | null;
  stripe_payment_link: string | null; contract_pdf_url: string | null;
  status: string; email_sent_at: string | null;
  created_at: string; notes: string | null;
}

const DEFAULT_TERMS = `1. Payment is due upon receipt of this agreement.
2. Services commence within 5 business days of payment confirmation.
3. This agreement is valid for 30 days from the date of issue.
4. Scope modifications must be agreed upon in writing.
5. AYN reserves the right to assign qualified team members.
6. Client agrees to provide necessary access and feedback in a timely manner.
7. Confidential information is protected per our Privacy Policy.
8. Either party may terminate with 15 days written notice.`;

const DEFAULT_PRIVACY = `Your data is protected under our Privacy Policy. All information shared during this agreement is confidential and will not be disclosed to third parties without explicit consent. Data is processed in accordance with applicable data protection regulations.`;

const DEFAULT_AFTER_SALE = `• 30-day post-delivery support included
• Bug fixes and minor adjustments at no additional cost for 30 days
• Priority support channel via email
• Documentation and training materials provided
• Extended support packages available upon request`;

const STATUS: Record<string, { label: string; color: string; dot: string }> = {
  draft:     { label: 'Draft',     color: 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400',           dot: 'bg-zinc-400' },
  sent:      { label: 'Sent',      color: 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',         dot: 'bg-blue-500' },
  viewed:    { label: 'Viewed',    color: 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',     dot: 'bg-amber-500' },
  signed:    { label: 'Signed',    color: 'bg-purple-50 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400', dot: 'bg-purple-500' },
  paid:      { label: 'Paid',      color: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400', dot: 'bg-emerald-500' },
  completed: { label: 'Completed', color: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400', dot: 'bg-emerald-500' },
  cancelled: { label: 'Cancelled', color: 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-400',            dot: 'bg-red-500' },
};

const CURRENCIES = ['SAR', 'USD', 'AED', 'EUR', 'GBP'];

const emptyForm = () => ({
  company_name: '', company_email: '', contact_person: '',
  company_phone: '', company_address: '', order_title: '',
  order_description: '', services: [{ name: '', description: '', price: 0, quantity: 1 }] as ServiceItem[],
  discount_percent: 0, tax_percent: 15, currency: 'SAR',
  terms_and_conditions: DEFAULT_TERMS, privacy_notes: DEFAULT_PRIVACY,
  after_sale_services: DEFAULT_AFTER_SALE, delivery_timeline: '',
  stripe_payment_link: '', notes: '',
});

export default function AdminCustomOrders() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [orders, setOrders] = useState<CustomOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [panel, setPanel] = useState<'none' | 'form' | 'sign'>('none');
  const [editingOrder, setEditingOrder] = useState<CustomOrder | null>(null);
  const [saving, setSaving] = useState(false);
  const [sendingEmail, setSendingEmail] = useState<string | null>(null);
  const [sendingReceipt, setSendingReceipt] = useState<string | null>(null);
  const [markingPaid, setMarkingPaid] = useState<string | null>(null);
  const [generatingPdf, setGeneratingPdf] = useState<string | null>(null);
  const [signingId, setSigningId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [form, setForm] = useState(emptyForm());
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDrawing = useRef(false);

  const fetchOrders = useCallback(async () => {
    try {
      const { data, error } = await supabase.from('custom_orders').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      setOrders((data || []) as unknown as CustomOrder[]);
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally { setLoading(false); }
  }, [toast]);

  useEffect(() => { fetchOrders(); }, [fetchOrders]);

  const calc = (svcs: ServiceItem[], disc: number, tax: number) => {
    const sub = svcs.reduce((s, i) => s + i.price * (i.quantity || 1), 0);
    const after = sub - sub * disc / 100;
    return { subtotal: sub, total: Math.round((after + after * tax / 100) * 100) / 100 };
  };

  const fmt = (n: number, cur = form.currency) =>
    new Intl.NumberFormat('en-SA', { style: 'currency', currency: cur }).format(n);

  const openNew = () => { setForm(emptyForm()); setEditingOrder(null); setPanel('form'); };
  const openEdit = (o: CustomOrder) => {
    setEditingOrder(o);
    setForm({
      company_name: o.company_name, company_email: o.company_email,
      contact_person: o.contact_person, company_phone: o.company_phone || '',
      company_address: o.company_address || '', order_title: o.order_title,
      order_description: o.order_description || '',
      services: o.services?.length ? o.services : [{ name:'', description:'', price:0, quantity:1 }],
      discount_percent: Number(o.discount_percent) || 0, tax_percent: Number(o.tax_percent) || 15,
      currency: o.currency || 'SAR', terms_and_conditions: o.terms_and_conditions || DEFAULT_TERMS,
      privacy_notes: o.privacy_notes || DEFAULT_PRIVACY, after_sale_services: o.after_sale_services || DEFAULT_AFTER_SALE,
      delivery_timeline: o.delivery_timeline || '', stripe_payment_link: o.stripe_payment_link || '',
      notes: o.notes || '',
    });
    setPanel('form');
  };

  const handleSave = async () => {
    if (!form.company_name || !form.company_email || !form.contact_person || !form.order_title) {
      toast({ title: 'Missing fields', description: 'Fill all required fields', variant: 'destructive' }); return;
    }
    if (!form.services[0]?.name) {
      toast({ title: 'Add at least one service', variant: 'destructive' }); return;
    }
    setSaving(true);
    try {
      const { subtotal, total } = calc(form.services, form.discount_percent, form.tax_percent);
      const { data: { user } } = await supabase.auth.getUser();
      const payload = {
        company_name: form.company_name, company_email: form.company_email,
        contact_person: form.contact_person, company_phone: form.company_phone || null,
        company_address: form.company_address || null, order_title: form.order_title,
        order_description: form.order_description || null,
        services: form.services as unknown as any, subtotal,
        discount_percent: form.discount_percent, tax_percent: form.tax_percent,
        total_amount: total, currency: form.currency,
        terms_and_conditions: form.terms_and_conditions || null,
        privacy_notes: form.privacy_notes || null,
        after_sale_services: form.after_sale_services || null,
        delivery_timeline: form.delivery_timeline || null,
        stripe_payment_link: form.stripe_payment_link || null,
        notes: form.notes || null, created_by: user?.id || null,
      };
      if (editingOrder) {
        const { error } = await supabase.from('custom_orders').update(payload).eq('id', editingOrder.id);
        if (error) throw error;
        toast({ title: '✓ Order updated' });
      } else {
        const { error } = await supabase.from('custom_orders').insert(payload);
        if (error) throw error;
        toast({ title: '✓ Order created' });
      }
      setPanel('none'); setEditingOrder(null); fetchOrders();
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally { setSaving(false); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this order permanently?')) return;
    const { error } = await supabase.from('custom_orders').delete().eq('id', id);
    if (error) toast({ title: 'Error', description: error.message, variant: 'destructive' });
    else { toast({ title: '✓ Deleted' }); fetchOrders(); }
  };

  const handleGeneratePdf = async (orderId: string) => {
    setGeneratingPdf(orderId);
    try {
      const { data, error } = await supabase.functions.invoke('generate-contract-pdf', { body: { orderId } });
      if (error) throw error;
      if (!data?.html) throw new Error('No HTML returned');
      const w = window.open('', '_blank');
      if (w) { w.document.write(data.html); w.document.close(); setTimeout(() => w.print(), 600); }
      toast({ title: '✓ Contract opened', description: 'Use browser Print → Save as PDF' });
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally { setGeneratingPdf(null); }
  };

  const handleSendEmail = async (orderId: string) => {
    setSendingEmail(orderId);
    try {
      const { error } = await supabase.functions.invoke('send-contract-email', { body: { orderId } });
      if (error) throw error;
      toast({ title: '✓ Email sent', description: 'Agreement sent to client' });
      fetchOrders();
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally { setSendingEmail(null); }
  };

  const handleSendReceipt = async (orderId: string) => {
    setSendingReceipt(orderId);
    try {
      const { error } = await supabase.functions.invoke('send-receipt-email', { body: { orderId } });
      if (error) throw error;
      toast({ title: '✓ Receipt sent', description: 'Payment receipt emailed to client' });
      fetchOrders();
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally { setSendingReceipt(null); }
  };

  const handleMarkPaid = async (orderId: string) => {
    setMarkingPaid(orderId);
    try {
      const { error } = await supabase.from('custom_orders').update({
        status: 'paid', paid_at: new Date().toISOString(),
      }).eq('id', orderId);
      if (error) throw error;
      toast({ title: '✓ Marked as paid' });
      fetchOrders();
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally { setMarkingPaid(null); }
  };

  // Signature pad
  const initCanvas = () => {
    const c = canvasRef.current; if (!c) return;
    const ctx = c.getContext('2d'); if (!ctx) return;
    c.width = c.offsetWidth * 2; c.height = c.offsetHeight * 2;
    ctx.scale(2, 2); ctx.strokeStyle = '#000'; ctx.lineWidth = 2; ctx.lineCap = 'round';
  };
  const startDraw = (e: React.MouseEvent<HTMLCanvasElement>) => {
    isDrawing.current = true;
    const c = canvasRef.current; if (!c) return;
    const ctx = c.getContext('2d'); if (!ctx) return;
    const r = c.getBoundingClientRect();
    ctx.beginPath(); ctx.moveTo(e.clientX - r.left, e.clientY - r.top);
  };
  const draw = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing.current) return;
    const c = canvasRef.current; if (!c) return;
    const ctx = c.getContext('2d'); if (!ctx) return;
    const r = c.getBoundingClientRect();
    ctx.lineTo(e.clientX - r.left, e.clientY - r.top); ctx.stroke();
  };
  const stopDraw = () => { isDrawing.current = false; };
  const clearCanvas = () => {
    const c = canvasRef.current; if (!c) return;
    const ctx = c.getContext('2d'); if (!ctx) return;
    ctx.clearRect(0, 0, c.width, c.height);
  };

  const handleAdminSign = async () => {
    if (!canvasRef.current || !signingId) return;
    const dataUrl = canvasRef.current.toDataURL('image/png');
    try {
      const blob = await fetch(dataUrl).then(r => r.blob());
      const path = `signatures/admin_${signingId}_${Date.now()}.png`;
      const { error: upErr } = await supabase.storage.from('generated-files').upload(path, blob, { contentType: 'image/png' });
      if (upErr) throw upErr;
      const { data: urlData } = supabase.storage.from('generated-files').getPublicUrl(path);
      await supabase.from('custom_orders').update({ admin_signature_url: urlData.publicUrl, admin_signed_at: new Date().toISOString() }).eq('id', signingId);
      toast({ title: '✓ Signature applied' });
      setPanel('none'); setSigningId(null); fetchOrders();
    } catch (e: any) { toast({ title: 'Error', description: e.message, variant: 'destructive' }); }
  };

  const filtered = orders.filter(o => {
    const q = search.toLowerCase();
    return (!q || o.company_name.toLowerCase().includes(q) || o.order_title.toLowerCase().includes(q) || o.contact_person.toLowerCase().includes(q))
      && (statusFilter === 'all' || o.status === statusFilter);
  });

  const { subtotal: prevSub, total: prevTotal } = calc(form.services, form.discount_percent, form.tax_percent);

  // ── Field helpers
  const F = (label: string, required = false) => (
    <span className="text-xs font-medium text-foreground/70">{label}{required && <span className="text-red-500 ml-0.5">*</span>}</span>
  );

  return (
    <div className="min-h-screen bg-background flex flex-col">

      {/* ── TOP BAR ── */}
      <div className="sticky top-0 z-30 bg-background/95 backdrop-blur border-b border-border">
        <div className="max-w-6xl mx-auto px-5 py-3.5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate('/')} className="p-1.5 rounded-lg hover:bg-muted transition-colors">
              <ArrowLeft className="w-4 h-4 text-muted-foreground" />
            </button>
            <div>
              <h1 className="text-base font-bold text-foreground leading-tight">Custom Orders</h1>
              <p className="text-[11px] text-muted-foreground">Contracts, signatures & payments</p>
            </div>
          </div>
          <Button onClick={openNew} size="sm" className="gap-1.5 h-8 px-3 text-xs font-semibold">
            <Plus className="w-3.5 h-3.5" /> New Order
          </Button>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-5 py-5 flex-1 w-full">

        {/* ── FILTERS ── */}
        <div className="flex flex-wrap gap-2.5 mb-5">
          <div className="relative flex-1 min-w-[180px] max-w-xs">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search orders…" className="pl-8 h-8 text-xs" />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-32 h-8 text-xs">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              {Object.entries(STATUS).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <span className="text-xs text-muted-foreground self-center">{filtered.length} order{filtered.length !== 1 ? 's' : ''}</span>
        </div>

        {/* ── ORDERS TABLE ── */}
        {loading ? (
          <div className="flex justify-center py-20"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20">
            <FileText className="w-10 h-10 text-muted-foreground/25 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground mb-4">No orders yet</p>
            <Button onClick={openNew} variant="outline" size="sm" className="gap-1.5"><Plus className="w-3.5 h-3.5" /> Create First Order</Button>
          </div>
        ) : (
          <div className="border border-border rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/50 border-b border-border">
                  <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Order</th>
                  <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide hidden md:table-cell">Client</th>
                  <th className="text-right px-4 py-2.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Amount</th>
                  <th className="text-center px-4 py-2.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Status</th>
                  <th className="text-center px-4 py-2.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide hidden lg:table-cell">Email</th>
                  <th className="text-center px-4 py-2.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Signatures</th>
                  <th className="px-4 py-2.5"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map(o => {
                  const s = STATUS[o.status] || STATUS.draft;
                  const openCount = (o as any).email_open_count || 0;
                  return (
                    <tr key={o.id} className="hover:bg-muted/30 transition-colors group">
                      <td className="px-4 py-3">
                        <div className="font-semibold text-foreground text-sm leading-tight">{o.order_title}</div>
                        <div className="text-[11px] text-muted-foreground mt-0.5">{new Date(o.created_at).toLocaleDateString()}</div>
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell">
                        <div className="text-sm font-medium text-foreground">{o.company_name}</div>
                        <div className="text-[11px] text-muted-foreground">{o.contact_person}</div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="font-bold text-foreground">{new Intl.NumberFormat('en-SA',{style:'currency',currency:o.currency||'SAR'}).format(Number(o.total_amount))}</div>
                        {(o as any).paid_at && <div className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold mt-0.5">✓ Paid</div>}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={cn('inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold', s.color)}>
                          <span className={cn('w-1.5 h-1.5 rounded-full', s.dot)} />
                          {s.label}
                        </span>
                      </td>
                      {/* Email tracking column */}
                      <td className="px-4 py-3 text-center hidden lg:table-cell">
                        {o.email_sent_at ? (
                          <div className="space-y-0.5">
                            <div className={cn('text-[10px] font-semibold', openCount > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground')}>
                              {openCount > 0 ? `👁 Opened ${openCount}×` : '📤 Sent'}
                            </div>
                            {(o as any).email_opened_at && (
                              <div className="text-[9px] text-muted-foreground">
                                {new Date((o as any).email_opened_at).toLocaleDateString()}
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-[10px] text-muted-foreground/40">—</span>
                        )}
                      </td>
                      {/* Signatures */}
                      <td className="px-4 py-3 text-center">
                        <div className="flex flex-col items-center gap-1.5">
                          {/* AYN signature */}
                          {o.admin_signature_url ? (
                            <div className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                              <span className="text-[10px] font-semibold">✓ Signed</span>
                            </div>
                          ) : (
                            <button
                              onClick={() => { setSigningId(o.id); setPanel('sign'); setTimeout(initCanvas, 100); }}
                              className="flex items-center gap-1 px-2 py-1 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 text-amber-700 dark:text-amber-400 text-[10px] font-semibold hover:bg-amber-100 dark:hover:bg-amber-900/40 transition-colors"
                            >
                              <PenTool className="w-2.5 h-2.5" />
                              Sign
                            </button>
                          )}
                          {/* Client signature */}
                          <div className={cn('text-[9px] font-medium', o.client_signature_url ? 'text-emerald-500' : 'text-muted-foreground/40')}>
                            {o.client_signature_url ? '✓ Client' : 'Client pending'}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity justify-end">
                          <button onClick={() => openEdit(o)} className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground" title="Edit"><Edit2 className="w-3.5 h-3.5" /></button>
                          <button onClick={() => handleGeneratePdf(o.id)} disabled={generatingPdf === o.id} className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground" title="Generate PDF">
                            {generatingPdf === o.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                          </button>

                          <button onClick={() => handleSendEmail(o.id)} disabled={sendingEmail === o.id} className="p-1.5 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors text-muted-foreground hover:text-blue-600" title="Send Contract Email">
                            {sendingEmail === o.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                          </button>
                          {/* Mark as Paid */}
                          {o.status !== 'paid' && o.status !== 'completed' && (
                            <button onClick={() => handleMarkPaid(o.id)} disabled={markingPaid === o.id} className="p-1.5 rounded-lg hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition-colors text-muted-foreground hover:text-emerald-600" title="Mark as Paid">
                              {markingPaid === o.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle className="w-3.5 h-3.5" />}
                            </button>
                          )}
                          {/* Send Receipt */}
                          {(o.status === 'paid' || o.status === 'completed') && (
                            <button onClick={() => handleSendReceipt(o.id)} disabled={sendingReceipt === o.id} className="p-1.5 rounded-lg hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition-colors text-muted-foreground hover:text-emerald-600" title="Send Receipt & PDF">
                              {sendingReceipt === o.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <DollarSign className="w-3.5 h-3.5" />}
                            </button>
                          )}
                          <button onClick={() => handleDelete(o.id)} className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors text-muted-foreground hover:text-red-600" title="Delete"><Trash2 className="w-3.5 h-3.5" /></button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── FORM PANEL ── */}
      {panel === 'form' && (
        <div className="fixed inset-0 z-50 flex">
          <div className="flex-1 bg-black/40 backdrop-blur-sm" onClick={() => setPanel('none')} />
          <div className="w-full max-w-2xl bg-background border-l border-border flex flex-col h-full shadow-2xl">
            {/* Panel header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
              <div>
                <h2 className="text-base font-bold text-foreground">{editingOrder ? 'Edit Order' : 'New Order'}</h2>
                <p className="text-[11px] text-muted-foreground mt-0.5">Fill in the contract details below</p>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => setPanel('none')} className="h-8 text-xs">Cancel</Button>
                <Button size="sm" onClick={handleSave} disabled={saving} className="h-8 text-xs gap-1.5">
                  {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                  {editingOrder ? 'Update' : 'Create'}
                </Button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">

              {/* CLIENT */}
              <div>
                <h3 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground mb-3">Client Details</h3>
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2 space-y-1">{F('Company Name', true)}<Input value={form.company_name} onChange={e => setForm(f => ({...f, company_name: e.target.value}))} placeholder="Acme Corp" className="h-8 text-sm" /></div>
                  <div className="space-y-1">{F('Contact Person', true)}<Input value={form.contact_person} onChange={e => setForm(f => ({...f, contact_person: e.target.value}))} placeholder="John Smith" className="h-8 text-sm" /></div>
                  <div className="space-y-1">{F('Email', true)}<Input type="email" value={form.company_email} onChange={e => setForm(f => ({...f, company_email: e.target.value}))} placeholder="john@acme.com" className="h-8 text-sm" /></div>
                  <div className="space-y-1">{F('Phone')}<Input value={form.company_phone} onChange={e => setForm(f => ({...f, company_phone: e.target.value}))} placeholder="+966 5X XXX XXXX" className="h-8 text-sm" /></div>
                  <div className="space-y-1">{F('Address')}<Input value={form.company_address} onChange={e => setForm(f => ({...f, company_address: e.target.value}))} placeholder="City, Country" className="h-8 text-sm" /></div>
                </div>
              </div>

              {/* ORDER */}
              <div>
                <h3 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground mb-3">Order Details</h3>
                <div className="space-y-3">
                  <div className="space-y-1">{F('Order / Project Title', true)}<Input value={form.order_title} onChange={e => setForm(f => ({...f, order_title: e.target.value}))} placeholder="AI Integration Package" className="h-8 text-sm" /></div>
                  <div className="space-y-1">{F('Brief Description')}<textarea value={form.order_description} onChange={e => setForm(f => ({...f, order_description: e.target.value}))} placeholder="Short description of the engagement…" rows={2} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-ring" /></div>
                </div>
              </div>

              {/* SERVICES */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Services</h3>
                  <button onClick={() => setForm(f => ({...f, services: [...f.services, {name:'',description:'',price:0,quantity:1}]}))} className="text-[11px] text-primary font-semibold hover:underline flex items-center gap-1">
                    <Plus className="w-3 h-3" /> Add
                  </button>
                </div>
                <div className="space-y-2">
                  {form.services.map((s, i) => (
                    <div key={i} className="border border-border rounded-lg p-3 space-y-2 bg-muted/20">
                      <div className="flex gap-2">
                        <Input value={s.name} onChange={e => setForm(f => ({...f, services: f.services.map((x,j) => j===i ? {...x,name:e.target.value} : x)}))} placeholder="Service name *" className="h-7 text-xs flex-1" />
                        {form.services.length > 1 && (
                          <button onClick={() => setForm(f => ({...f, services: f.services.filter((_,j) => j!==i)}))} className="p-1 text-muted-foreground hover:text-red-500 transition-colors"><Minus className="w-3.5 h-3.5" /></button>
                        )}
                      </div>
                      <Input value={s.description} onChange={e => setForm(f => ({...f, services: f.services.map((x,j) => j===i ? {...x,description:e.target.value} : x)}))} placeholder="Description (shown in contract)" className="h-7 text-xs" />
                      <div className="flex gap-2">
                        <div className="flex-1 space-y-0.5"><span className="text-[10px] text-muted-foreground">Unit Price</span><Input type="number" value={s.price} onChange={e => setForm(f => ({...f, services: f.services.map((x,j) => j===i ? {...x,price:Number(e.target.value)} : x)}))} className="h-7 text-xs" /></div>
                        <div className="w-20 space-y-0.5"><span className="text-[10px] text-muted-foreground">Qty</span><Input type="number" value={s.quantity} onChange={e => setForm(f => ({...f, services: f.services.map((x,j) => j===i ? {...x,quantity:Number(e.target.value)} : x)}))} className="h-7 text-xs" /></div>
                        <div className="w-24 space-y-0.5"><span className="text-[10px] text-muted-foreground">Total</span><div className="h-7 flex items-center px-2 rounded-md bg-muted text-xs font-semibold">{fmt(s.price*(s.quantity||1))}</div></div>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-3 flex gap-3 justify-end items-center flex-wrap">
                  <div className="flex gap-3 items-center">
                    <div className="space-y-0.5 text-right"><span className="text-[10px] text-muted-foreground">Discount %</span><Input type="number" value={form.discount_percent} onChange={e => setForm(f => ({...f, discount_percent: Number(e.target.value)}))} className="h-7 text-xs w-16" /></div>
                    <div className="space-y-0.5 text-right"><span className="text-[10px] text-muted-foreground">VAT %</span><Input type="number" value={form.tax_percent} onChange={e => setForm(f => ({...f, tax_percent: Number(e.target.value)}))} className="h-7 text-xs w-16" /></div>
                    <Select value={form.currency} onValueChange={v => setForm(f => ({...f, currency:v}))}>
                      <SelectTrigger className="h-7 w-20 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>{CURRENCIES.map(c => <SelectItem key={c} value={c} className="text-xs">{c}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="bg-foreground text-background rounded-lg px-4 py-2 text-right">
                    <div className="text-[10px] opacity-60 uppercase tracking-wider">Total</div>
                    <div className="font-bold text-base leading-tight">{fmt(prevTotal)}</div>
                  </div>
                </div>
              </div>

              {/* PAYMENT */}
              <div>
                <h3 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground mb-3">Payment</h3>
                <div className="space-y-1">{F('Stripe Payment Link')}<Input value={form.stripe_payment_link} onChange={e => setForm(f => ({...f, stripe_payment_link: e.target.value}))} placeholder="https://buy.stripe.com/…" className="h-8 text-sm" /></div>
              </div>

              {/* DELIVERY */}
              <div>
                <h3 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground mb-3">Timeline & Support</h3>
                <div className="space-y-3">
                  <div className="space-y-1">{F('Delivery Timeline')}<Input value={form.delivery_timeline} onChange={e => setForm(f => ({...f, delivery_timeline: e.target.value}))} placeholder="e.g. 4–6 weeks from kickoff" className="h-8 text-sm" /></div>
                  <div className="space-y-1">{F('After-Sale Services')}<textarea value={form.after_sale_services} onChange={e => setForm(f => ({...f, after_sale_services: e.target.value}))} rows={3} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-ring" /></div>
                </div>
              </div>

              {/* TERMS */}
              <div>
                <h3 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground mb-3">Legal</h3>
                <div className="space-y-3">
                  <div className="space-y-1">{F('Terms & Conditions')}<textarea value={form.terms_and_conditions} onChange={e => setForm(f => ({...f, terms_and_conditions: e.target.value}))} rows={4} className="w-full rounded-md border border-input bg-background px-3 py-2 text-xs resize-none focus:outline-none focus:ring-1 focus:ring-ring font-mono" /></div>
                  <div className="space-y-1">{F('Privacy & Data Protection')}<textarea value={form.privacy_notes} onChange={e => setForm(f => ({...f, privacy_notes: e.target.value}))} rows={3} className="w-full rounded-md border border-input bg-background px-3 py-2 text-xs resize-none focus:outline-none focus:ring-1 focus:ring-ring font-mono" /></div>
                  <div className="space-y-1">{F('Internal Notes')}<textarea value={form.notes} onChange={e => setForm(f => ({...f, notes: e.target.value}))} placeholder="Notes for internal use only (not shown in contract)" rows={2} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-ring" /></div>
                </div>
              </div>

            </div>
          </div>
        </div>
      )}

      {/* ── SIGN PANEL ── */}
      {panel === 'sign' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => { setPanel('none'); setSigningId(null); }} />
          <div className="relative bg-background rounded-2xl border border-border shadow-2xl w-full max-w-md overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <div>
                <h2 className="text-base font-bold">Admin Signature</h2>
                <p className="text-[11px] text-muted-foreground">Draw your signature below</p>
              </div>
              <button onClick={() => { setPanel('none'); setSigningId(null); }} className="p-1.5 rounded-lg hover:bg-muted"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-6">
              <div className="border-2 border-dashed border-border rounded-xl overflow-hidden bg-white cursor-crosshair" style={{height: 160}}>
                <canvas ref={canvasRef} className="w-full h-full" style={{touchAction:'none'}}
                  onMouseDown={startDraw} onMouseMove={draw} onMouseUp={stopDraw} onMouseLeave={stopDraw} />
              </div>
              <div className="flex gap-2 mt-4">
                <Button variant="outline" size="sm" onClick={clearCanvas} className="text-xs">Clear</Button>
                <Button size="sm" onClick={handleAdminSign} className="flex-1 text-xs">Apply Signature</Button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
