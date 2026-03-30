// Thin wrapper that embeds AdminCustomOrders into the admin panel tab
// Strips the standalone page's back button/navigation
import { ContractAI } from './ContractAI';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { adminSupabase as supabase } from '@/admin-app/adminSupabase';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '@/config';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import {
  Plus, Send, FileText, Trash2, Eye, Edit2,
  DollarSign, Building2, Clock, CheckCircle, XCircle,
  Loader2, Download, PenTool, Search, X, Minus, RefreshCw, Sparkles,
  ChevronUp, ChevronDown
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
  warranty: string | null; termination_clause: string | null;
  additional_services: string | null; system_plan: string | null;
  governing_law: string | null; payment_terms: string | null;
  scope_of_work: string | null; client_responsibilities: string | null;
  out_of_scope: string | null; payment_split: string | null;
  loyalty_discount: string | null;
  admin_signature_url: string | null; client_signature_url: string | null;
  admin_signed_at: string | null; client_signed_at: string | null;
  stripe_payment_link: string | null; contract_pdf_url: string | null;
  status: string; email_sent_at: string | null;
  created_at: string; notes: string | null;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: any }> = {
  draft:    { label: 'Draft',    color: 'bg-white/10 text-white/40 border-white/10', icon: FileText },
  sent:     { label: 'Sent',     color: 'bg-blue-500/15 text-blue-400 border-blue-500/30', icon: Send },
  signed:   { label: 'Signed',   color: 'bg-purple-500/15 text-purple-400 border-purple-500/30', icon: PenTool },
  paid:     { label: 'Paid',     color: 'bg-green-500/15 text-green-400 border-green-500/30', icon: CheckCircle },
  cancelled:{ label: 'Cancelled',color: 'bg-red-500/15 text-red-400 border-red-500/30', icon: XCircle },
};

function emptyForm() {
  return {
    company_name: '', company_email: '', contact_person: '', company_phone: '',
    company_address: '', order_title: '', order_description: '',
    services: [{ name: '', description: '', price: 0, quantity: 1 }] as ServiceItem[],
    discount_percent: 0, tax_percent: 0, currency: 'USD',
    scope_of_work: '',
    client_responsibilities: '',
    out_of_scope: '',
    system_plan: 'Built on proprietary architecture developed exclusively by AYN AI. Technical components and infrastructure are not disclosed. Client receives a fully operational platform. Source code is available upon written request — however, requesting or receiving source code immediately and permanently voids the warranty and all AI systems will be remotely deactivated for security reasons. AYN AI holds no liability for the platform following source code release.',
    payment_terms: '',
    payment_split: '70% due upon contract signing to commence development. Remaining 30% due upon final delivery and client acceptance. All amounts in USD. Non-refundable once development begins.',
    delivery_timeline: '',
    after_sale_services: '1 free month of bug fixes and team training from launch date.\n\nMonthly Maintenance — $1,500/month: Monitoring, fixes, security updates, performance management.\n\nFull IT Service — $5,000/month: All maintenance plus active development, AI updates, and priority support.',
    loyalty_discount: 'Returning clients receive a 15% loyalty discount on all future feature additions.',
    additional_services: '',
    warranty: '12-month warranty from launch covering 2 scheduled system updates for security, performance, and stability.\n\nVoid immediately and permanently if any third party accesses, modifies, or attempts to alter the platform without written authorization from AYN AI. This includes requesting or receiving source code. Upon breach, all AI systems are remotely deactivated. AYN AI holds no liability for failures following unauthorized modifications.',
    termination_clause: 'Either party may terminate this agreement with 14 days written notice. Client is liable for all work completed to date, calculated pro-rata. Deposits are non-refundable once development has commenced.',
    privacy_notes: 'The platform is built in compliance with Saudi Arabia\'s Personal Data Protection Law (PDPL). AYN AI responsibilities include: consent collection at registration, customer data deletion on request, customer data export on request, encrypted storage and transmission, and audit logging of all data access.\n\nThe client is the data controller and is solely responsible for publishing a Privacy Policy in Arabic and English, registering with SDAIA, appointing a Data Protection Officer, and notifying SDAIA within 72 hours of any data breach. No card data stored on platform.',
    governing_law: 'Laws of the Province of Nova Scotia, Canada and the Kingdom of Saudi Arabia. Disputes resolved in courts of Nova Scotia, Canada and the competent courts of Riyadh, Saudi Arabia.',
    terms_and_conditions: 'Payment due within 30 days of invoice.',
    notes: '',
    stripe_payment_link: '',
  };
}


// ── AI Contract Reviewer ──────────────────────────────────────────────
function AIReviewer({ contractData }: { contractData: any }) {
  const [open, setOpen] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [review, setReview] = React.useState('');
  const [asked, setAsked] = React.useState(false);

  const runReview = async () => {
    setLoading(true); setAsked(true);
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1000,
          messages: [{ role: 'user', content: `You are a legal contract AI reviewer. Review this service agreement for completeness, fairness, and legal protection of both parties.

CONTRACT DETAILS:
- Client: ${contractData.company_name}
- Project: ${contractData.order_title}
- Description: ${contractData.order_description || 'Not specified'}
- System Plan: ${contractData.system_plan || 'Not specified'}
- Payment Terms: ${contractData.payment_terms || 'Not specified'}
- Delivery Timeline: ${contractData.delivery_timeline || 'Not specified'}
- Warranty: ${contractData.warranty || 'Not specified'}
- Termination: ${contractData.termination_clause || 'Not specified'}
- Terms & Conditions: ${contractData.terms_and_conditions || 'Not specified'}
- After-Sale Services: ${contractData.after_sale_services || 'Not specified'}
- Governing Law: ${contractData.governing_law || 'Not specified'}

Provide a structured review:
1. ✅ What is well-covered
2. ⚠️ Gaps or weaknesses
3. 🔴 Critical issues that could expose either party
4. 💡 Specific suggestions to strengthen it

Be concise but thorough. Format clearly with emoji headers.` }],
        }),
      });
      const data = await res.json();
      setReview(data.content?.find((b: any) => b.type === 'text')?.text || 'No response.');
    } catch (e: any) { setReview('Error: ' + e.message); }
    finally { setLoading(false); }
  };

  return (
    <div className="bg-purple-500/5 border border-purple-500/20 rounded-xl overflow-hidden">
      <button onClick={() => setOpen(!open)} className="w-full flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-purple-400" />
          <span className="text-purple-300 font-semibold text-sm">AI Contract Reviewer</span>
          <span className="text-[10px] bg-purple-500/20 text-purple-400 px-2 py-0.5 rounded-full">Beta</span>
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-purple-400" /> : <ChevronDown className="w-4 h-4 text-purple-400" />}
      </button>
      {open && (
        <div className="border-t border-purple-500/20 p-4 space-y-3">
          <p className="text-xs text-zinc-400 leading-relaxed">AI will read your contract and flag missing clauses, weak protections, or anything that could be a risk — before you send it.</p>
          {!asked ? (
            <Button onClick={runReview} disabled={loading} size="sm" className="bg-purple-600 hover:bg-purple-500 text-white text-xs h-8 gap-2">
              {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
              Review this contract
            </Button>
          ) : loading ? (
            <div className="flex items-center gap-2 text-xs text-purple-400"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Analyzing...</div>
          ) : (
            <div className="space-y-2">
              <div className="bg-zinc-900 rounded-lg p-4 text-xs text-zinc-300 leading-relaxed whitespace-pre-wrap max-h-64 overflow-y-auto">{review}</div>
              <Button onClick={() => { setReview(''); setAsked(false); }} size="sm" variant="outline" className="border-white/10 text-white/50 text-xs h-7">Run again</Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export const CustomOrders = () => {
  const { toast } = useToast();
  const [orders, setOrders] = useState<CustomOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [panel, setPanel] = useState<'none' | 'form' | 'view'>('none');
  const [editingOrder, setEditingOrder] = useState<CustomOrder | null>(null);
  const [viewingOrder, setViewingOrder] = useState<CustomOrder | null>(null);
  const [saving, setSaving] = useState(false);
  const [sendingEmail, setSendingEmail] = useState<string | null>(null);
  const [markingPaid, setMarkingPaid] = useState<string | null>(null);
  const [sendingPdf, setSendingPdf] = useState<string | null>(null);
  const [showAI, setShowAI] = useState(false);
  const [generatingPdf, setGeneratingPdf] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [form, setForm] = useState(emptyForm());

  const fetchOrders = useCallback(async () => {
    try {
      const { data, error } = await supabase.from('custom_orders').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      setOrders((data || []) as unknown as CustomOrder[]);
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { fetchOrders(); }, [fetchOrders]);

  const calcTotals = (services: ServiceItem[], discount: number, tax: number) => {
    const subtotal = services.reduce((s, i) => s + (i.price * i.quantity), 0);
    const discounted = subtotal * (1 - discount / 100);
    const total = discounted;
    return { subtotal, total };
  };

  const openNew = () => { setForm(emptyForm()); setEditingOrder(null); setPanel('form'); };
  const openEdit = (o: CustomOrder) => {
    setForm({ ...o, services: o.services || [{ name: '', description: '', price: 0, quantity: 1 }], stripe_payment_link: o.stripe_payment_link || '' } as any);
    setEditingOrder(o);
    setPanel('form');
  };

  const handleSave = async () => {
    if (!form.company_name || !form.company_email || !form.order_title) {
      toast({ title: 'Missing fields', description: 'Company name, email, and order title are required.', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const { subtotal, total } = calcTotals(form.services, form.discount_percent, form.tax_percent);
      const payload = { ...form, subtotal, total_amount: total, status: editingOrder?.status || 'draft', services: form.services as any };
      if (editingOrder) {
        await supabase.from('custom_orders').update(payload as any).eq('id', editingOrder.id);
        toast({ title: 'Order updated' });
      } else {
        await supabase.from('custom_orders').insert(payload as any);
        toast({ title: 'Order created' });
      }
      setPanel('none');
      fetchOrders();
    } catch (e: any) {
      toast({ title: 'Save failed', description: e.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this order?')) return;
    await supabase.from('custom_orders').delete().eq('id', id);
    toast({ title: 'Deleted' });
    fetchOrders();
  };

  const handleSendEmail = async (order: CustomOrder) => {
    setSendingEmail(order.id);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token || SUPABASE_ANON_KEY;
      const res = await fetch(`${SUPABASE_URL}/functions/v1/send-contract-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ orderId: order.id }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || 'Send failed');
      await supabase.from('custom_orders').update({ status: 'sent', email_sent_at: new Date().toISOString() }).eq('id', order.id);
      toast({ title: '✅ Contract sent', description: `Sent to ${order.company_email}` });
      fetchOrders();
    } catch (e: any) {
      toast({ title: 'Send failed', description: e.message, variant: 'destructive' });
    } finally {
      setSendingEmail(null);
    }
  };

  const handleGeneratePdf = async (order: CustomOrder) => {
    setGeneratingPdf(order.id);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token || SUPABASE_ANON_KEY;
      const res = await fetch(`${SUPABASE_URL}/functions/v1/generate-contract-pdf`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ orderId: order.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'PDF generation failed');
      if (data?.html) {
        // Use Blob URL — renders as a proper HTML page, not a download
        const blob = new Blob([data.html], { type: 'text/html;charset=utf-8' });
        const blobUrl = URL.createObjectURL(blob);
        const tab = window.open(blobUrl, '_blank');
        setTimeout(() => URL.revokeObjectURL(blobUrl), 15000);
        if (!tab) toast({ title: 'Allow popups', description: 'Enable popups to view the contract', variant: 'destructive' });
        else toast({ title: '📄 Contract opened', description: 'Use Ctrl+P / Cmd+P to save as PDF' });
      }
    } catch (e: any) {
      toast({ title: 'PDF failed', description: e.message, variant: 'destructive' });
    } finally {
      setGeneratingPdf(null);
    }
  };

  const handleMarkPaid = async (id: string) => {
    setMarkingPaid(id);
    await supabase.from('custom_orders').update({ status: 'paid' }).eq('id', id);
    toast({ title: '✅ Marked as paid' });
    fetchOrders();
    setMarkingPaid(null);
  };

  const handleSendPdf = async (order: CustomOrder) => {
    setSendingPdf(order.id);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token || SUPABASE_ANON_KEY;
      const res = await fetch(`${SUPABASE_URL}/functions/v1/send-contract-pdf`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ orderId: order.id }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || 'Failed to send PDF');
      toast({ title: '📄 Contract PDF sent', description: `Sent to ${order.company_email}` });
    } catch (e: any) {
      toast({ title: 'Send PDF failed', description: e.message, variant: 'destructive' });
    } finally {
      setSendingPdf(null);
    }
  };

  const filtered = orders.filter(o => {
    const q = search.toLowerCase();
    const matchSearch = !q || o.company_name.toLowerCase().includes(q) || o.company_email.toLowerCase().includes(q) || o.order_title.toLowerCase().includes(q) || o.contact_person.toLowerCase().includes(q);
    return matchSearch && (statusFilter === 'all' || o.status === statusFilter);
  });

  const totalRevenue = orders.filter(o => o.status === 'paid').reduce((s, o) => s + o.total_amount, 0);
  const pendingRevenue = orders.filter(o => ['sent','signed'].includes(o.status)).reduce((s, o) => s + o.total_amount, 0);

  return (
    <div className="flex h-full">
      {/* Main list */}
      <div className={cn("flex flex-col flex-1 min-w-0 transition-all", panel !== 'none' ? 'w-1/2' : 'w-full')}>
        <div className="p-6 space-y-4">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-white font-semibold text-lg flex items-center gap-2">
                <FileText className="w-5 h-5 text-blue-400" />Custom Orders
              </h2>
              <p className="text-white/30 text-sm">{orders.length} total orders</p>
            </div>
            <div className="flex gap-2">
              <button onClick={fetchOrders} disabled={loading}
                className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-white/50">
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              </button>
              <Button onClick={() => { setForm(emptyForm()); setEditingOrder(null); setShowAI(true); setPanel('form'); }}
                className="bg-purple-600/80 hover:bg-purple-500 text-white gap-1.5 h-9">
                <Sparkles className="w-4 h-4" />AI Draft
              </Button>
              <Button onClick={openNew} className="bg-blue-600 hover:bg-blue-500 text-white gap-1.5 h-9">
                <Plus className="w-4 h-4" />New Order
              </Button>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-4 gap-3">
            {[
              { label: 'Total Orders', value: orders.length, color: 'text-white' },
              { label: 'Paid Revenue', value: `$${totalRevenue.toLocaleString()}`, color: 'text-green-400' },
              { label: 'Pending', value: `$${pendingRevenue.toLocaleString()}`, color: 'text-amber-400' },
              { label: 'Drafts', value: orders.filter(o => o.status === 'draft').length, color: 'text-white/40' },
            ].map(({ label, value, color }) => (
              <div key={label} className="bg-white/3 border border-white/8 rounded-xl p-3">
                <div className={`text-xl font-bold ${color}`}>{value}</div>
                <div className="text-white/30 text-xs mt-0.5">{label}</div>
              </div>
            ))}
          </div>

          {/* Filters */}
          <div className="flex gap-2">
            <div className="relative flex-1 max-w-xs">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
              <Input value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search orders..." className="pl-8 bg-white/5 border-white/10 text-white placeholder:text-white/30 h-8 text-sm" />
            </div>
            <div className="flex gap-1.5">
              {['all', 'draft', 'sent', 'signed', 'paid', 'cancelled'].map(s => (
                <button key={s} onClick={() => setStatusFilter(s)}
                  className={cn('px-2.5 py-1 rounded-lg text-xs capitalize transition-colors',
                    statusFilter === s ? 'bg-white text-black' : 'bg-white/5 text-white/40 hover:bg-white/10'
                  )}>{s}</button>
              ))}
            </div>
          </div>

          {/* Orders list */}
          {loading ? (
            <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-white/30" /></div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 text-white/30 text-sm">
              {orders.length === 0 ? 'No orders yet — click "New Order" to create one' : 'No orders match your search'}
            </div>
          ) : (
            <div className="space-y-2">
              {filtered.map(order => {
                const cfg = STATUS_CONFIG[order.status] || STATUS_CONFIG.draft;
                const Icon = cfg.icon;
                return (
                  <div key={order.id} className="bg-white/3 border border-white/8 rounded-xl p-4 hover:bg-white/5 transition-colors">
                    <div className="flex items-start gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-white font-medium text-sm truncate">{order.order_title}</span>
                          <span className={cn('text-xs px-2 py-0.5 rounded-full border flex items-center gap-1 flex-shrink-0', cfg.color)}>
                            <Icon className="w-3 h-3" />{cfg.label}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-white/40">
                          <span className="flex items-center gap-1"><Building2 className="w-3 h-3" />{order.company_name}</span>
                          <span>{order.company_email}</span>
                          <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{new Date(order.created_at).toLocaleDateString()}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 flex-shrink-0">
                        <span className="text-white font-semibold text-sm">${order.total_amount.toLocaleString()} {order.currency}</span>
                        <div className="flex gap-1">
                          <button onClick={() => { setViewingOrder(order); setPanel('view'); }}
                            className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-white/50" title="View">
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => openEdit(order)}
                            className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-white/50" title="Edit">
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => handleGeneratePdf(order)} disabled={generatingPdf === order.id}
                            className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-white/50" title="Generate PDF">
                            {generatingPdf === order.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                          </button>
                          {['draft', 'signed'].includes(order.status) && (
                            <button onClick={() => handleSendEmail(order)} disabled={sendingEmail === order.id}
                              className="p-1.5 rounded-lg bg-blue-500/15 hover:bg-blue-500/25 text-blue-400" title="Send contract">
                              {sendingEmail === order.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                            </button>
                          )}
                          {order.status === 'sent' && (
                            <button onClick={() => handleMarkPaid(order.id)} disabled={markingPaid === order.id}
                              className="p-1.5 rounded-lg bg-green-500/15 hover:bg-green-500/25 text-green-400" title="Mark paid">
                              {markingPaid === order.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle className="w-3.5 h-3.5" />}
                            </button>
                          )}
                          <button onClick={() => handleSendPdf(order)} disabled={sendingPdf === order.id}
                            className="p-1.5 rounded-lg bg-purple-500/15 hover:bg-purple-500/25 text-purple-400" title="Send contract PDF to client">
                            {sendingPdf === order.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileText className="w-3.5 h-3.5" />}
                          </button>
                          <button onClick={() => handleDelete(order.id)}
                            className="p-1.5 rounded-lg bg-white/5 hover:bg-red-500/20 text-white/30 hover:text-red-400" title="Delete">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                    {order.stripe_payment_link && (
                      <div className="mt-2 pt-2 border-t border-white/5 flex items-center gap-2">
                        <DollarSign className="w-3 h-3 text-green-400" />
                        <a href={order.stripe_payment_link} target="_blank" rel="noopener noreferrer"
                          className="text-green-400/70 hover:text-green-400 text-xs truncate underline">
                          {order.stripe_payment_link}
                        </a>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Side panel - Form or View */}
      {panel !== 'none' && (
        <div className="w-1/2 border-l border-white/8 flex flex-col h-full overflow-y-auto">
          <div className="flex items-center justify-between p-4 border-b border-white/8">
            <h3 className="text-white font-medium text-sm">
              {panel === 'form' ? (editingOrder ? 'Edit Order' : 'New Order') : 'Order Details'}
            </h3>
            <button onClick={() => setPanel('none')} className="text-white/30 hover:text-white">
              <X className="w-4 h-4" />
            </button>
          </div>

          {panel === 'view' && viewingOrder && (
            <div className="p-5 space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-3">
                {[
                  ['Company', viewingOrder.company_name],
                  ['Email', viewingOrder.company_email],
                  ['Contact', viewingOrder.contact_person],
                  ['Phone', viewingOrder.company_phone || '—'],
                  ['Status', viewingOrder.status],
                  ['Currency', viewingOrder.currency],
                  ['Subtotal', `$${Number(viewingOrder.subtotal || 0).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`],
                  ...(viewingOrder.discount_percent > 0 ? [['Discount', `${viewingOrder.discount_percent}%  (-$${(Number(viewingOrder.subtotal || 0) * viewingOrder.discount_percent / 100).toFixed(2)})`]] : []),
                  ['Total', `$${Number(viewingOrder.total_amount || 0).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`],
                ].map(([k, v]) => (
                  <div key={k} className="bg-white/3 rounded-lg p-3">
                    <div className="text-white/30 text-xs mb-0.5">{k}</div>
                    <div className="text-white/80 font-medium">{v}</div>
                  </div>
                ))}
              </div>
              <div className="bg-white/3 rounded-lg p-3">
                <div className="text-white/30 text-xs mb-1">Order Title</div>
                <div className="text-white/80">{viewingOrder.order_title}</div>
              </div>
              {viewingOrder.order_description && (
                <div className="bg-white/3 rounded-lg p-3">
                  <div className="text-white/30 text-xs mb-1">Description</div>
                  <div className="text-white/60 text-xs">{viewingOrder.order_description}</div>
                </div>
              )}
              <div>
                <div className="text-white/30 text-xs mb-2">Services</div>
                <div className="space-y-1.5">
                  {(viewingOrder.services || []).map((s, i) => (
                    <div key={i} className="flex items-center justify-between bg-white/3 rounded-lg px-3 py-2">
                      <div>
                        <div className="text-white/80 text-xs font-medium">{s.name}</div>
                        {s.description && <div className="text-white/30 text-xs">{s.description}</div>}
                      </div>
                      <div className="text-white/60 text-xs">${s.price} × {s.quantity}</div>
                    </div>
                  ))}
                </div>
              </div>
              {viewingOrder.stripe_payment_link && (
                <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-3">
                  <div className="text-green-400 text-xs font-medium mb-1">Stripe Payment Link</div>
                  <a href={viewingOrder.stripe_payment_link} target="_blank" rel="noopener noreferrer"
                    className="text-green-400/80 hover:text-green-400 text-xs break-all underline">
                    {viewingOrder.stripe_payment_link}
                  </a>
                </div>
              )}
              {viewingOrder.contract_pdf_url && (
                <a href={viewingOrder.contract_pdf_url} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-2 bg-blue-500/10 border border-blue-500/20 rounded-lg p-3 text-blue-400 hover:bg-blue-500/15 transition-colors">
                  <Download className="w-4 h-4" />
                  <span className="text-sm">Download Contract PDF</span>
                </a>
              )}
              {/* Signing links */}
               {(viewingOrder as any).signing_token && (
                <div className="bg-white/3 border border-white/8 rounded-lg p-3 space-y-2">
                  <div className="text-white/30 text-xs mb-2 uppercase tracking-widest font-bold">Signing Links</div>
                  <div>
                    <div className="text-white/30 text-[10px] mb-0.5">Client link (sent via email)</div>
                    <div className="text-blue-400 text-xs break-all">{`https://aynn.io/sign/${(viewingOrder as any).signing_token}`}</div>
                  </div>
                  <div>
                    <div className="text-white/30 text-[10px] mb-1">Your admin signing link</div>
                    <a href={`https://aynn.io/sign/${(viewingOrder as any).signing_token}?role=admin`} target="_blank" rel="noreferrer"
                      className="inline-flex items-center gap-1.5 text-xs bg-purple-600 hover:bg-purple-500 text-white px-3 py-1.5 rounded-lg font-medium">
                      Open &amp; Sign as AYN AI →
                    </a>
                  </div>
                </div>
              )}
              <div className="flex gap-2 pt-2">
                <Button onClick={() => openEdit(viewingOrder)} variant="outline" size="sm" className="flex-1 border-white/10 text-white/60">
                  <Edit2 className="w-3.5 h-3.5 mr-1.5" />Edit
                </Button>
                <Button onClick={() => handleGeneratePdf(viewingOrder)} disabled={generatingPdf === viewingOrder.id} variant="outline" size="sm" className="flex-1 border-white/10 text-white/60">
                  {generatingPdf === viewingOrder.id ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Download className="w-3.5 h-3.5 mr-1.5" />}Preview
                </Button>
                <Button onClick={() => handleSendPdf(viewingOrder)} disabled={sendingPdf === viewingOrder.id} variant="outline" size="sm" className="flex-1 border-white/10 text-purple-400">
                  {sendingPdf === viewingOrder.id ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Send className="w-3.5 h-3.5 mr-1.5" />}Send PDF
                </Button>
                {['draft','signed'].includes(viewingOrder.status) && (
                  <Button onClick={() => handleSendEmail(viewingOrder)} disabled={sendingEmail === viewingOrder.id} size="sm" className="flex-1 bg-blue-600 hover:bg-blue-500">
                    {sendingEmail === viewingOrder.id ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Send className="w-3.5 h-3.5 mr-1.5" />}Send
                  </Button>
                )}
              </div>
            </div>
          )}

          {panel === 'form' && (
            <div className="flex-1 overflow-y-auto">
              {/* Form header */}
              <div className="sticky top-0 z-10 bg-zinc-900/95 backdrop-blur border-b border-white/10 px-6 py-3 flex items-center justify-between">
                <span className="text-white font-semibold text-sm">{editingOrder ? 'Edit Order' : 'New Custom Order'}</span>
                <div className="flex gap-2">
                  <Button onClick={() => setShowAI(v => !v)} size="sm"
                    className={showAI ? "bg-purple-600 hover:bg-purple-500 h-7 text-xs gap-1.5 px-3" : "bg-purple-500/15 text-purple-400 hover:bg-purple-500/25 border border-purple-500/30 h-7 text-xs gap-1.5 px-3"}>
                    <Sparkles className="w-3 h-3" />{showAI ? 'Hide AI' : 'AI Assistant'}
                  </Button>
                  <Button onClick={handleSave} disabled={saving} size="sm" className="bg-blue-600 hover:bg-blue-500 h-7 text-xs px-4">
                    {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : editingOrder ? 'Save Changes' : 'Create Order'}
                  </Button>
                  <Button onClick={() => setPanel('none')} variant="outline" size="sm" className="border-white/10 text-white/50 h-7 text-xs px-3">Cancel</Button>
                </div>
              </div>

              <div className="flex flex-1 overflow-hidden">
                {showAI && (
                  <div className="w-80 flex-shrink-0 border-r border-white/10">
                    <ContractAI type="contract"
                      onClose={() => setShowAI(false)}
                      onFill={fields => setForm(f => {
                        const updated = { ...f, ...fields };
                        // Handle services array from AI
                        if (fields.services && Array.isArray(fields.services)) {
                          updated.services = fields.services.map((s: any) => ({
                            name: s.name || '',
                            description: s.description || '',
                            price: Number(s.price) || 0,
                            quantity: Number(s.quantity) || 1,
                          }));
                        }
                        return updated;
                      })} />
                  </div>
                )}
                <div className="flex-1 overflow-y-auto">
              <div className="p-6 space-y-6 pb-10">

                {/* ── SECTION: Client Info ── */}
                <div className="bg-white/[0.03] border border-white/10 rounded-xl p-5 space-y-3">
                  <div className="flex items-center gap-2 mb-1">
                    <div className="w-1 h-4 bg-blue-500 rounded-full" />
                    <span className="text-white/60 text-xs font-semibold uppercase tracking-widest">Client Information</span>
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
                  <div>
                    <label className="text-white/40 text-xs mb-1.5 block">Company Address</label>
                    <Input value={form.company_address || ''} onChange={e => setForm(f => ({ ...f, company_address: e.target.value }))}
                      placeholder="123 Main St, City, Country" className="bg-white/5 border-white/10 text-white text-sm h-9 placeholder:text-white/15" />
                  </div>
                </div>

                {/* ── SECTION: Project Overview ── */}
                <div className="bg-white/[0.03] border border-white/10 rounded-xl p-5 space-y-3">
                  <div className="flex items-center gap-2 mb-1">
                    <div className="w-1 h-4 bg-purple-500 rounded-full" />
                    <span className="text-white/60 text-xs font-semibold uppercase tracking-widest">Project Overview</span>
                  </div>
                  <div>
                    <label className="text-white/40 text-xs mb-1.5 block">Project Title *</label>
                    <Input value={form.order_title} onChange={e => setForm(f => ({ ...f, order_title: e.target.value }))}
                      placeholder="e.g. AI-Powered CRM Integration" className="bg-white/5 border-white/10 text-white text-sm h-9 placeholder:text-white/15" />
                  </div>
                  <div>
                    <label className="text-white/40 text-xs mb-1.5 block">Project Description</label>
                    <textarea value={form.order_description || ''} onChange={e => setForm(f => ({ ...f, order_description: e.target.value }))}
                      rows={4} placeholder="Describe the project goals, requirements, and expected outcomes..." className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-white text-sm leading-relaxed focus:outline-none focus:border-white/30 placeholder:text-white/15" />
                  </div>
                  <div>
                    <label className="text-white/40 text-xs mb-1.5 block">System Plan & Technical Approach</label>
                    <textarea value={form.system_plan || ''} onChange={e => setForm(f => ({ ...f, system_plan: e.target.value }))}
                      rows={4} placeholder="Architecture, tech stack, integrations, methodology..." className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-white text-sm leading-relaxed focus:outline-none focus:border-white/30 placeholder:text-white/15" />
                  </div>
                  <div>
                    <label className="text-white/40 text-xs mb-1.5 block">Scope of Work</label>
                    <textarea value={form.scope_of_work || ''} onChange={e => setForm(f => ({ ...f, scope_of_work: e.target.value }))}
                      rows={8} placeholder="List all deliverables phase by phase. Use bullet points or numbered list..." className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-white text-sm leading-relaxed focus:outline-none focus:border-white/30 placeholder:text-white/15" />
                  </div>
                  <div>
                    <label className="text-white/40 text-xs mb-1.5 block">Client Responsibilities</label>
                    <textarea value={form.client_responsibilities || ''} onChange={e => setForm(f => ({ ...f, client_responsibilities: e.target.value }))}
                      rows={5} placeholder="What the client must provide before development begins: API keys, accounts, content, approvals..." className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-white text-sm leading-relaxed focus:outline-none focus:border-white/30 placeholder:text-white/15" />
                  </div>
                  <div>
                    <label className="text-white/40 text-xs mb-1.5 block">Out of Scope</label>
                    <textarea value={form.out_of_scope || ''} onChange={e => setForm(f => ({ ...f, out_of_scope: e.target.value }))}
                      rows={3} placeholder="Features and services explicitly excluded from this contract..." className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-white text-sm leading-relaxed focus:outline-none focus:border-white/30 placeholder:text-white/15" />
                  </div>
                </div>

                {/* ── SECTION: Services & Pricing ── */}
                <div className="bg-white/[0.03] border border-white/10 rounded-xl p-5 space-y-3">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <div className="w-1 h-4 bg-amber-500 rounded-full" />
                      <span className="text-white/60 text-xs font-semibold uppercase tracking-widest">Services & Pricing</span>
                    </div>
                    <button onClick={() => setForm(f => ({ ...f, services: [...f.services, { name: '', description: '', price: 0, quantity: 1 }] }))}
                      className="text-blue-400 text-xs flex items-center gap-1 hover:text-blue-300 bg-blue-500/10 px-2.5 py-1 rounded-lg">
                      <Plus className="w-3 h-3" /> Add Service
                    </button>
                  </div>
                  {form.services.map((svc, i) => (
                    <div key={i} className="bg-black/20 border border-white/8 rounded-lg p-3 space-y-2">
                      <div className="flex gap-2 items-start">
                        <div className="flex-1 space-y-2">
                          <div className="flex gap-2">
                            <Input value={svc.name} onChange={e => { const s = [...form.services]; s[i].name = e.target.value; setForm(f => ({ ...f, services: s })); }}
                              placeholder="Service name *" className="flex-1 bg-white/5 border-white/10 text-white text-sm h-8 placeholder:text-white/15" />
                            <Input type="number" value={svc.price} onChange={e => { const s = [...form.services]; s[i].price = Number(e.target.value); setForm(f => ({ ...f, services: s })); }}
                              placeholder="Price" className="w-24 bg-white/5 border-white/10 text-white text-sm h-8 placeholder:text-white/15" />
                            <Input type="number" value={svc.quantity} onChange={e => { const s = [...form.services]; s[i].quantity = Number(e.target.value); setForm(f => ({ ...f, services: s })); }}
                              placeholder="Qty" className="w-16 bg-white/5 border-white/10 text-white text-sm h-8 placeholder:text-white/15" />
                          </div>
                          <textarea value={svc.description} onChange={e => { const s = [...form.services]; s[i].description = e.target.value; setForm(f => ({ ...f, services: s })); }}
                            rows={2} placeholder="Service description (will appear in contract)" className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white/70 text-xs leading-relaxed focus:outline-none focus:border-white/30 placeholder:text-white/15" />
                        </div>
                        {form.services.length > 1 && (
                          <button onClick={() => { const s = form.services.filter((_, j) => j !== i); setForm(f => ({ ...f, services: s })); }}
                            className="text-red-400/50 hover:text-red-400 mt-1 flex-shrink-0"><Minus className="w-4 h-4" /></button>
                        )}
                      </div>
                    </div>
                  ))}
                  <div className="grid grid-cols-2 gap-3 pt-1">
                    {[
                      { key: 'discount_percent', label: 'Discount %' },
                      { key: 'currency', label: 'Currency', type: 'select', opts: ['USD','SAR','AED','EUR','GBP','CAD'] },
                    ].map(({ key, label, type, opts }) => (
                      <div key={key}>
                        <label className="text-white/40 text-xs mb-1.5 block">{label}</label>
                        {type === 'select' ? (
                          <Select value={(form as any)[key]} onValueChange={v => setForm(f => ({ ...f, [key]: v }))}>
                            <SelectTrigger className="bg-white/5 border-white/10 text-white text-sm h-9"><SelectValue /></SelectTrigger>
                            <SelectContent>{(opts || []).map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
                          </Select>
                        ) : (
                          <Input type="number" value={(form as any)[key]} onChange={e => setForm(f => ({ ...f, [key]: Number(e.target.value) }))}
                            className="bg-white/5 border-white/10 text-white text-sm h-9" />
                        )}
                      </div>
                    ))}
                  </div>
                  {(() => {
                    const subtotal = form.services.reduce((s, i) => s + (i.price * i.quantity), 0);
                    const discountAmt = subtotal * (form.discount_percent / 100);
                    const afterDiscount = subtotal - discountAmt;
                    const total = afterDiscount;
                    return (
                      <div className="bg-white/5 border border-white/10 rounded-lg px-4 py-3 mt-1 space-y-1.5">
                        <div className="flex justify-between text-sm">
                          <span className="text-white/40">Subtotal</span>
                          <span className="text-white/70">${subtotal.toFixed(2)} {form.currency}</span>
                        </div>
                        {discountAmt > 0 && (
                          <div className="flex justify-between text-sm">
                            <span className="text-white/40">Discount ({form.discount_percent}%)</span>
                            <span className="text-green-400">-${discountAmt.toFixed(2)}</span>
                          </div>
                        )}
                        <div className="flex justify-between items-center border-t border-white/10 pt-1.5 mt-1">
                          <span className="text-white/60 text-sm font-medium">Total</span>
                          <span className="text-white font-bold text-base">${total.toFixed(2)} {form.currency}</span>
                        </div>
                      </div>
                    );
                  })()}
                </div>

                {/* ── SECTION: Payment ── */}
                <div className="bg-white/[0.03] border border-white/10 rounded-xl p-5 space-y-3">
                  <div className="flex items-center gap-2 mb-1">
                    <div className="w-1 h-4 bg-green-500 rounded-full" />
                    <span className="text-white/60 text-xs font-semibold uppercase tracking-widest">Payment</span>
                  </div>
                  <div>
                    <label className="text-white/40 text-xs mb-1.5 block">Stripe Payment Link</label>
                    <Input value={form.stripe_payment_link || ''} onChange={e => setForm(f => ({ ...f, stripe_payment_link: e.target.value }))}
                      placeholder="https://buy.stripe.com/..." className="bg-white/5 border-white/10 text-white text-sm h-9 placeholder:text-white/15" />
                  </div>
                  <div>
                    <label className="text-white/40 text-xs mb-1.5 block">Payment Terms</label>
                    <textarea value={form.payment_terms || ''} onChange={e => setForm(f => ({ ...f, payment_terms: e.target.value }))}
                      rows={3} placeholder="e.g. 50% upfront, 50% on delivery. Payment due within 30 days of invoice..." className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-white text-sm leading-relaxed focus:outline-none focus:border-white/30 placeholder:text-white/15" />
                  </div>
                  <div>
                    <label className="text-white/40 text-xs mb-1.5 block">Payment Split Structure</label>
                    <textarea value={form.payment_split || ''} onChange={e => setForm(f => ({ ...f, payment_split: e.target.value }))}
                      rows={3} placeholder="e.g. 70% on signing ($X) to commence Phase 1. 30% on Phase 2 delivery ($X)..." className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-white text-sm leading-relaxed focus:outline-none focus:border-white/30 placeholder:text-white/15" />
                  </div>
                </div>

                {/* ── SECTION: Delivery & Timeline ── */}
                <div className="bg-white/[0.03] border border-white/10 rounded-xl p-5 space-y-3">
                  <div className="flex items-center gap-2 mb-1">
                    <div className="w-1 h-4 bg-cyan-500 rounded-full" />
                    <span className="text-white/60 text-xs font-semibold uppercase tracking-widest">Delivery & Timeline</span>
                  </div>
                  <div>
                    <label className="text-white/40 text-xs mb-1.5 block">Estimated Delivery Timeline</label>
                    <Input value={form.delivery_timeline || ''} onChange={e => setForm(f => ({ ...f, delivery_timeline: e.target.value }))}
                      placeholder="e.g. 4–6 weeks from contract signing" className="bg-white/5 border-white/10 text-white text-sm h-9 placeholder:text-white/15" />
                  </div>
                </div>

                {/* ── SECTION: After-Sale & Add-ons ── */}
                <div className="bg-white/[0.03] border border-white/10 rounded-xl p-5 space-y-3">
                  <div className="flex items-center gap-2 mb-1">
                    <div className="w-1 h-4 bg-indigo-500 rounded-full" />
                    <span className="text-white/60 text-xs font-semibold uppercase tracking-widest">After-Sale Services & Add-ons</span>
                  </div>
                  <div>
                    <label className="text-white/40 text-xs mb-1.5 block">After-Sale Support & Maintenance</label>
                    <textarea value={form.after_sale_services || ''} onChange={e => setForm(f => ({ ...f, after_sale_services: e.target.value }))}
                      rows={4} placeholder="e.g. 1 free month of bug fixes from launch. Monthly Maintenance $1,500/month. Full IT $5,000/month..." className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-white text-sm leading-relaxed focus:outline-none focus:border-white/30 placeholder:text-white/15" />
                  </div>
                  <div>
                    <label className="text-white/40 text-xs mb-1.5 block">Loyalty Discount</label>
                    <textarea value={form.loyalty_discount || ''} onChange={e => setForm(f => ({ ...f, loyalty_discount: e.target.value }))}
                      rows={2} placeholder="e.g. Returning clients receive 15% loyalty discount on future feature additions..." className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-white text-sm leading-relaxed focus:outline-none focus:border-white/30 placeholder:text-white/15" />
                  </div>
                  <div>
                    <label className="text-white/40 text-xs mb-1.5 block">Additional Services & Add-ons Available</label>
                    <textarea value={form.additional_services || ''} onChange={e => setForm(f => ({ ...f, additional_services: e.target.value }))}
                      rows={3} placeholder="Optional services the client can add at extra cost..." className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-white text-sm leading-relaxed focus:outline-none focus:border-white/30 placeholder:text-white/15" />
                  </div>
                </div>

                {/* ── SECTION: Legal Terms ── */}
                <div className="bg-white/[0.03] border border-white/10 rounded-xl p-5 space-y-3">
                  <div className="flex items-center gap-2 mb-1">
                    <div className="w-1 h-4 bg-rose-500 rounded-full" />
                    <span className="text-white/60 text-xs font-semibold uppercase tracking-widest">Legal Terms</span>
                  </div>
                  <div>
                    <label className="text-white/40 text-xs mb-1.5 block">Warranty & Guarantee</label>
                    <textarea value={form.warranty || ''} onChange={e => setForm(f => ({ ...f, warranty: e.target.value }))}
                      rows={3} placeholder="e.g. 30-day warranty covering bug fixes and minor adjustments..." className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-white text-sm leading-relaxed focus:outline-none focus:border-white/30 placeholder:text-white/15" />
                  </div>
                  <div>
                    <label className="text-white/40 text-xs mb-1.5 block">Termination Clause</label>
                    <textarea value={form.termination_clause || ''} onChange={e => setForm(f => ({ ...f, termination_clause: e.target.value }))}
                      rows={3} placeholder="e.g. Either party may terminate with 14 days written notice. Client is liable for work completed to date..." className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-white text-sm leading-relaxed focus:outline-none focus:border-white/30 placeholder:text-white/15" />
                  </div>
                  <div>
                    <label className="text-white/40 text-xs mb-1.5 block">Terms & Conditions</label>
                    <textarea value={form.terms_and_conditions || ''} onChange={e => setForm(f => ({ ...f, terms_and_conditions: e.target.value }))}
                      rows={4} placeholder="General terms governing this agreement..." className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-white text-sm leading-relaxed focus:outline-none focus:border-white/30 placeholder:text-white/15" />
                  </div>
                  <div>
                    <label className="text-white/40 text-xs mb-1.5 block">Privacy & Data Protection</label>
                    <textarea value={form.privacy_notes || ''} onChange={e => setForm(f => ({ ...f, privacy_notes: e.target.value }))}
                      rows={3} placeholder="How client data is collected, stored, and protected..." className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-white text-sm leading-relaxed focus:outline-none focus:border-white/30 placeholder:text-white/15" />
                  </div>
                  <div>
                    <label className="text-white/40 text-xs mb-1.5 block">Governing Law & Jurisdiction</label>
                    <Input value={form.governing_law || ''} onChange={e => setForm(f => ({ ...f, governing_law: e.target.value }))}
                      placeholder="e.g. Province of Ontario, Canada" className="bg-white/5 border-white/10 text-white text-sm h-9 placeholder:text-white/15" />
                  </div>
                </div>

                {/* ── SECTION: Internal Notes ── */}
                <div className="bg-white/[0.03] border border-white/10 rounded-xl p-5">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-1 h-4 bg-white/20 rounded-full" />
                    <span className="text-white/60 text-xs font-semibold uppercase tracking-widest">Internal Notes</span>
                  </div>
                  <textarea value={form.notes || ''} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                    rows={3} placeholder="Private notes — not visible to client or included in contract..." className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-white text-sm leading-relaxed focus:outline-none focus:border-white/30 placeholder:text-white/15" />
                </div>

                <div className="flex gap-3 pb-6">
                  <Button onClick={handleSave} disabled={saving} className="flex-1 bg-blue-600 hover:bg-blue-500 h-10">
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : editingOrder ? 'Save Changes' : 'Create Order'}
                  </Button>
                  <Button onClick={() => setPanel('none')} variant="outline" className="border-white/10 text-white/50 h-10 px-6">Cancel</Button>
                </div>

              </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
