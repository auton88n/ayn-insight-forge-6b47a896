// Thin wrapper that embeds AdminCustomOrders into the admin panel tab
// Strips the standalone page's back button/navigation
import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '@/config';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import {
  Plus, Send, FileText, Trash2, Eye, Edit2,
  DollarSign, Building2, Clock, CheckCircle, XCircle,
  Loader2, Download, PenTool, Search, X, Minus, RefreshCw
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
    discount_percent: 0, tax_percent: 15, currency: 'USD',
    terms_and_conditions: 'Payment due within 30 days of invoice.',
    privacy_notes: '', after_sale_services: '', delivery_timeline: '',
    warranty: 'All services include a 30-day warranty period for bug fixes and adjustments.',
    termination_clause: 'Either party may terminate this agreement with 14 days written notice. Client is liable for work completed to date.',
    additional_services: '', system_plan: '', governing_law: 'This agreement is governed by the laws of the applicable jurisdiction.',
    payment_terms: 'Payment is due within 30 days of invoice. Late payments incur 1.5% monthly interest.', notes: '',
    stripe_payment_link: '',
  };
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
    const total = discounted * (1 + tax / 100);
    return { subtotal, total };
  };

  const openNew = () => { setForm(emptyForm()); setEditingOrder(null); setPanel('form'); };
  const openEdit = (o: CustomOrder) => {
    setForm({ ...o, services: o.services || [{ name: '', description: '', price: 0, quantity: 1 }], stripe_payment_link: o.stripe_payment_link || '' });
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
      const payload = { ...form, subtotal, total_amount: total, status: editingOrder?.status || 'draft' };
      if (editingOrder) {
        await supabase.from('custom_orders').update(payload).eq('id', editingOrder.id);
        toast({ title: 'Order updated' });
      } else {
        await supabase.from('custom_orders').insert(payload);
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
                  ['Subtotal', `$${viewingOrder.subtotal?.toLocaleString()}`],
                  ['Total', `$${viewingOrder.total_amount?.toLocaleString()}`],
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
            <div className="p-5 space-y-4 flex-1 overflow-y-auto">
              {/* Client info */}
              <div className="space-y-2">
                <div className="text-white/40 text-xs font-medium uppercase tracking-wide">Client Info</div>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { key: 'company_name', label: 'Company Name *' },
                    { key: 'contact_person', label: 'Contact Person *' },
                    { key: 'company_email', label: 'Email *' },
                    { key: 'company_phone', label: 'Phone' },
                  ].map(({ key, label }) => (
                    <div key={key}>
                      <label className="text-white/30 text-xs mb-1 block">{label}</label>
                      <Input value={(form as any)[key] || ''} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                        className="bg-white/5 border-white/10 text-white text-sm h-8 placeholder:text-white/20" />
                    </div>
                  ))}
                </div>
                <div>
                  <label className="text-white/30 text-xs mb-1 block">Address</label>
                  <Input value={form.company_address || ''} onChange={e => setForm(f => ({ ...f, company_address: e.target.value }))}
                    className="bg-white/5 border-white/10 text-white text-sm h-8" />
                </div>
              </div>

              {/* Order info */}
              <div className="space-y-2">
                <div className="text-white/40 text-xs font-medium uppercase tracking-wide">Order Info</div>
                <div>
                  <label className="text-white/30 text-xs mb-1 block">Order Title *</label>
                  <Input value={form.order_title} onChange={e => setForm(f => ({ ...f, order_title: e.target.value }))}
                    className="bg-white/5 border-white/10 text-white text-sm h-8" />
                </div>
                <div>
                  <label className="text-white/30 text-xs mb-1 block">Description</label>
                  <textarea value={form.order_description || ''} onChange={e => setForm(f => ({ ...f, order_description: e.target.value }))}
                    rows={2} className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm resize-none focus:outline-none focus:border-white/30 placeholder:text-white/20" />
                </div>
              </div>

              {/* Services */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="text-white/40 text-xs font-medium uppercase tracking-wide">Services</div>
                  <button onClick={() => setForm(f => ({ ...f, services: [...f.services, { name: '', description: '', price: 0, quantity: 1 }] }))}
                    className="text-blue-400 text-xs flex items-center gap-1 hover:text-blue-300">
                    <Plus className="w-3 h-3" />Add
                  </button>
                </div>
                {form.services.map((svc, i) => (
                  <div key={i} className="bg-white/3 border border-white/8 rounded-lg p-3 space-y-2">
                    <div className="flex gap-2">
                      <Input value={svc.name} onChange={e => { const s = [...form.services]; s[i].name = e.target.value; setForm(f => ({ ...f, services: s })); }}
                        placeholder="Service name" className="flex-1 bg-white/5 border-white/10 text-white text-xs h-7" />
                      <Input type="number" value={svc.price} onChange={e => { const s = [...form.services]; s[i].price = Number(e.target.value); setForm(f => ({ ...f, services: s })); }}
                        placeholder="Price" className="w-20 bg-white/5 border-white/10 text-white text-xs h-7" />
                      <Input type="number" value={svc.quantity} onChange={e => { const s = [...form.services]; s[i].quantity = Number(e.target.value); setForm(f => ({ ...f, services: s })); }}
                        placeholder="Qty" className="w-14 bg-white/5 border-white/10 text-white text-xs h-7" />
                      {form.services.length > 1 && (
                        <button onClick={() => { const s = form.services.filter((_, j) => j !== i); setForm(f => ({ ...f, services: s })); }}
                          className="text-red-400/50 hover:text-red-400"><Minus className="w-3.5 h-3.5" /></button>
                      )}
                    </div>
                    <Input value={svc.description} onChange={e => { const s = [...form.services]; s[i].description = e.target.value; setForm(f => ({ ...f, services: s })); }}
                      placeholder="Description (optional)" className="bg-white/5 border-white/10 text-white/60 text-xs h-7" />
                  </div>
                ))}
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { key: 'discount_percent', label: 'Discount %' },
                    { key: 'tax_percent', label: 'Tax %' },
                    { key: 'currency', label: 'Currency', type: 'select', opts: ['USD','SAR','AED','EUR','GBP'] },
                  ].map(({ key, label, type, opts }) => (
                    <div key={key}>
                      <label className="text-white/30 text-xs mb-1 block">{label}</label>
                      {type === 'select' ? (
                        <Select value={(form as any)[key]} onValueChange={v => setForm(f => ({ ...f, [key]: v }))}>
                          <SelectTrigger className="bg-white/5 border-white/10 text-white text-xs h-8"><SelectValue /></SelectTrigger>
                          <SelectContent>{(opts || []).map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
                        </Select>
                      ) : (
                        <Input type="number" value={(form as any)[key]} onChange={e => setForm(f => ({ ...f, [key]: Number(e.target.value) }))}
                          className="bg-white/5 border-white/10 text-white text-xs h-8" />
                      )}
                    </div>
                  ))}
                </div>
                {(() => { const { subtotal, total } = calcTotals(form.services, form.discount_percent, form.tax_percent); return (
                  <div className="flex justify-between items-center bg-white/3 rounded-lg px-3 py-2">
                    <span className="text-white/40 text-xs">Subtotal: ${subtotal.toFixed(2)}</span>
                    <span className="text-white font-semibold text-sm">Total: ${total.toFixed(2)} {form.currency}</span>
                  </div>
                ); })()}
              </div>

              {/* Payment */}
              <div className="space-y-2">
                <div className="text-white/40 text-xs font-medium uppercase tracking-wide">Payment</div>
                <div>
                  <label className="text-white/30 text-xs mb-1 block">Stripe Payment Link</label>
                  <Input value={form.stripe_payment_link || ''} onChange={e => setForm(f => ({ ...f, stripe_payment_link: e.target.value }))}
                    placeholder="https://buy.stripe.com/..." className="bg-white/5 border-white/10 text-white text-sm h-8 placeholder:text-white/20" />
                </div>
                <div>
                  <label className="text-white/30 text-xs mb-1 block">Payment Terms</label>
                  <textarea value={form.payment_terms || ''} onChange={e => setForm(f => ({ ...f, payment_terms: e.target.value }))}
                    rows={2} className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-xs resize-none focus:outline-none focus:border-white/30" />
                </div>
              </div>

              {/* Contract Sections */}
              <div className="space-y-2">
                <div className="text-white/40 text-xs font-medium uppercase tracking-wide">Contract Details</div>
                <div>
                  <label className="text-white/30 text-xs mb-1 block">Delivery Timeline</label>
                  <Input value={form.delivery_timeline || ''} onChange={e => setForm(f => ({ ...f, delivery_timeline: e.target.value }))}
                    placeholder="e.g. 4-6 weeks" className="bg-white/5 border-white/10 text-white text-sm h-8 placeholder:text-white/20" />
                </div>
                <div>
                  <label className="text-white/30 text-xs mb-1 block">System Plan <span className="text-white/20">(technical overview, architecture)</span></label>
                  <textarea value={form.system_plan || ''} onChange={e => setForm(f => ({ ...f, system_plan: e.target.value }))}
                    rows={3} placeholder="Describe the technical approach, architecture, tools..." className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-xs resize-none focus:outline-none focus:border-white/30 placeholder:text-white/20" />
                </div>
                <div>
                  <label className="text-white/30 text-xs mb-1 block">After-Sale Services</label>
                  <textarea value={form.after_sale_services || ''} onChange={e => setForm(f => ({ ...f, after_sale_services: e.target.value }))}
                    rows={2} placeholder="Support, maintenance, SLA details..." className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-xs resize-none focus:outline-none focus:border-white/30 placeholder:text-white/20" />
                </div>
                <div>
                  <label className="text-white/30 text-xs mb-1 block">Additional Services / Add-ons</label>
                  <textarea value={form.additional_services || ''} onChange={e => setForm(f => ({ ...f, additional_services: e.target.value }))}
                    rows={2} placeholder="Optional services available for additional cost..." className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-xs resize-none focus:outline-none focus:border-white/30 placeholder:text-white/20" />
                </div>
                <div>
                  <label className="text-white/30 text-xs mb-1 block">Warranty</label>
                  <textarea value={form.warranty || ''} onChange={e => setForm(f => ({ ...f, warranty: e.target.value }))}
                    rows={2} className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-xs resize-none focus:outline-none focus:border-white/30" />
                </div>
                <div>
                  <label className="text-white/30 text-xs mb-1 block">Termination Clause</label>
                  <textarea value={form.termination_clause || ''} onChange={e => setForm(f => ({ ...f, termination_clause: e.target.value }))}
                    rows={2} className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-xs resize-none focus:outline-none focus:border-white/30" />
                </div>
                <div>
                  <label className="text-white/30 text-xs mb-1 block">Terms & Conditions</label>
                  <textarea value={form.terms_and_conditions || ''} onChange={e => setForm(f => ({ ...f, terms_and_conditions: e.target.value }))}
                    rows={3} className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-xs resize-none focus:outline-none focus:border-white/30" />
                </div>
                <div>
                  <label className="text-white/30 text-xs mb-1 block">Privacy & Data Protection</label>
                  <textarea value={form.privacy_notes || ''} onChange={e => setForm(f => ({ ...f, privacy_notes: e.target.value }))}
                    rows={2} placeholder="How client data is handled and protected..." className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-xs resize-none focus:outline-none focus:border-white/30 placeholder:text-white/20" />
                </div>
                <div>
                  <label className="text-white/30 text-xs mb-1 block">Governing Law</label>
                  <Input value={form.governing_law || ''} onChange={e => setForm(f => ({ ...f, governing_law: e.target.value }))}
                    placeholder="e.g. Laws of Canada" className="bg-white/5 border-white/10 text-white text-sm h-8 placeholder:text-white/20" />
                </div>
                <div>
                  <label className="text-white/30 text-xs mb-1 block">Internal Notes</label>
                  <textarea value={form.notes || ''} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                    rows={2} className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-xs resize-none focus:outline-none focus:border-white/30" />
                </div>
              </div>

              <div className="flex gap-2 pt-2 pb-6">
                <Button onClick={handleSave} disabled={saving} className="flex-1 bg-blue-600 hover:bg-blue-500">
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : editingOrder ? 'Save Changes' : 'Create Order'}
                </Button>
                <Button onClick={() => setPanel('none')} variant="outline" className="border-white/10 text-white/50">Cancel</Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
