import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Loader2, PenTool, CheckCircle, X, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ServiceItem { name: string; description: string; price: number; quantity: number; }
interface Order {
  id: string; order_title: string; order_description: string | null;
  company_name: string; contact_person: string; company_email: string;
  services: ServiceItem[]; subtotal: number; discount_percent: number;
  tax_percent: number; total_amount: number; currency: string;
  terms_and_conditions: string | null; delivery_timeline: string | null;
  after_sale_services: string | null; privacy_notes: string | null;
  admin_signature_url: string | null; admin_signed_at: string | null;
  client_signature_url: string | null; client_signed_at: string | null;
  stripe_payment_link: string | null; status: string; signing_token: string;
}

export default function ClientSign() {
  const { token } = useParams<{ token: string }>();
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [signing, setSigning] = useState(false);
  const [signed, setSigned] = useState(false);
  const [showPad, setShowPad] = useState(false);
  const [hasDrawn, setHasDrawn] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDrawing = useRef(false);

  const fetchOrder = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('custom_orders')
        .select('*')
        .eq('signing_token', token)
        .single();
      if (error || !data) throw new Error('Contract not found');
      setOrder(data as unknown as Order);
      if (data.client_signature_url) setSigned(true);
      // Mark as viewed
      if (!data.client_viewed_at) {
        await supabase.from('custom_orders')
          .update({ client_viewed_at: new Date().toISOString(), status: data.status === 'sent' ? 'viewed' : data.status })
          .eq('signing_token', token);
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { fetchOrder(); }, [fetchOrder]);

  const fmt = (n: number) => new Intl.NumberFormat('en-SA', {
    style: 'currency', currency: order?.currency || 'SAR'
  }).format(n);

  // Canvas setup
  const initCanvas = () => {
    const c = canvasRef.current; if (!c) return;
    const ctx = c.getContext('2d'); if (!ctx) return;
    c.width = c.offsetWidth * 2;
    c.height = c.offsetHeight * 2;
    ctx.scale(2, 2);
    ctx.strokeStyle = '#0a0a0a'; ctx.lineWidth = 2.5; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  };

  const getPos = (e: React.MouseEvent | React.TouchEvent, canvas: HTMLCanvasElement) => {
    const rect = canvas.getBoundingClientRect();
    if ('touches' in e) {
      return { x: e.touches[0].clientX - rect.left, y: e.touches[0].clientY - rect.top };
    }
    return { x: (e as React.MouseEvent).clientX - rect.left, y: (e as React.MouseEvent).clientY - rect.top };
  };

  const startDraw = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    isDrawing.current = true; setHasDrawn(true);
    const c = canvasRef.current; if (!c) return;
    const ctx = c.getContext('2d'); if (!ctx) return;
    const pos = getPos(e, c);
    ctx.beginPath(); ctx.moveTo(pos.x, pos.y);
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    if (!isDrawing.current) return;
    const c = canvasRef.current; if (!c) return;
    const ctx = c.getContext('2d'); if (!ctx) return;
    const pos = getPos(e, c);
    ctx.lineTo(pos.x, pos.y); ctx.stroke();
  };

  const stopDraw = () => { isDrawing.current = false; };

  const clearCanvas = () => {
    const c = canvasRef.current; if (!c) return;
    const ctx = c.getContext('2d'); if (!ctx) return;
    ctx.clearRect(0, 0, c.width, c.height);
    setHasDrawn(false);
  };

  const handleSign = async () => {
    if (!canvasRef.current || !order || !hasDrawn) return;
    setSigning(true);
    try {
      const dataUrl = canvasRef.current.toDataURL('image/png');
      const blob = await fetch(dataUrl).then(r => r.blob());
      const path = `signatures/client_${order.id}_${Date.now()}.png`;
      const { error: upErr } = await supabase.storage
        .from('generated-files')
        .upload(path, blob, { contentType: 'image/png' });
      if (upErr) throw upErr;
      const { data: urlData } = supabase.storage.from('generated-files').getPublicUrl(path);
      const { error: updateErr } = await supabase
        .from('custom_orders')
        .update({
          client_signature_url: urlData.publicUrl,
          client_signed_at: new Date().toISOString(),
          status: 'signed',
        })
        .eq('signing_token', token);
      if (updateErr) throw updateErr;
      setOrder(o => o ? { ...o, client_signature_url: urlData.publicUrl, client_signed_at: new Date().toISOString() } : o);
      setSigned(true); setShowPad(false);
    } catch (e: any) {
      alert('Failed to save signature: ' + e.message);
    } finally { setSigning(false); }
  };

  if (loading) return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
    </div>
  );

  if (error) return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="text-center">
        <div className="text-4xl mb-4">⚠️</div>
        <h1 className="text-lg font-bold text-foreground mb-2">Contract Not Found</h1>
        <p className="text-sm text-muted-foreground">This signing link may be invalid or expired.</p>
      </div>
    </div>
  );

  if (!order) return null;

  const subtotal = Number(order.subtotal) || 0;
  const discAmt = subtotal * (Number(order.discount_percent) || 0) / 100;
  const taxAmt  = (subtotal - discAmt) * (Number(order.tax_percent) || 0) / 100;
  const total   = Number(order.total_amount) || 0;
  const alreadySigned = signed || !!order.client_signature_url;

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      {/* Header */}
      <div className="bg-zinc-900 text-white px-6 py-4 flex items-center justify-between sticky top-0 z-20">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M15 13a4.5 4.5 0 0 1-3-4 4.5 4.5 0 0 1-3 4" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M17.599 6.5a3 3 0 0 0 .399-1.375" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M6.003 5.125A3 3 0 0 0 6.401 6.5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <div>
            <div className="font-black text-base leading-tight tracking-tight">AYN</div>
            <div className="text-[9px] uppercase tracking-widest opacity-40">Service Agreement</div>
          </div>
        </div>
        {alreadySigned ? (
          <span className="flex items-center gap-1.5 bg-emerald-500/20 text-emerald-400 text-xs font-semibold px-3 py-1.5 rounded-full border border-emerald-500/30">
            <CheckCircle className="w-3 h-3" /> Signed
          </span>
        ) : (
          <button
            onClick={() => { setShowPad(true); setTimeout(initCanvas, 100); }}
            className="flex items-center gap-1.5 bg-white text-zinc-900 text-xs font-bold px-4 py-2 rounded-full hover:bg-zinc-100 transition-colors"
          >
            <PenTool className="w-3 h-3" /> Sign Now
          </button>
        )}
      </div>

      <div className="max-w-2xl mx-auto px-4 py-8 space-y-5">

        {/* Already signed banner */}
        {alreadySigned && (
          <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-2xl p-5 text-center">
            <div className="text-3xl mb-2">✅</div>
            <div className="font-bold text-emerald-800 dark:text-emerald-300 text-base">You've signed this contract</div>
            <div className="text-sm text-emerald-600 dark:text-emerald-400 mt-1">
              Signed on {order.client_signed_at ? new Date(order.client_signed_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : 'recently'}
            </div>
            {order.stripe_payment_link && (
              <a href={order.stripe_payment_link} target="_blank" rel="noreferrer"
                className="inline-block mt-4 bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 font-bold px-6 py-2.5 rounded-full text-sm hover:opacity-90 transition-opacity">
                Complete Payment →
              </a>
            )}
          </div>
        )}

        {/* Parties */}
        <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden">
          <div className="px-5 py-3.5 border-b border-zinc-100 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/50">
            <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">Agreement Between</span>
          </div>
          <div className="grid grid-cols-2 gap-px bg-zinc-100 dark:bg-zinc-800">
            <div className="bg-white dark:bg-zinc-900 p-4">
              <div className="text-[9px] font-bold uppercase tracking-widest text-zinc-400 mb-2">Service Provider</div>
              <div className="font-bold text-zinc-900 dark:text-zinc-100">AYN AI</div>
            </div>
            <div className="bg-white dark:bg-zinc-900 p-4">
              <div className="text-[9px] font-bold uppercase tracking-widest text-zinc-400 mb-2">Client</div>
              <div className="font-bold text-zinc-900 dark:text-zinc-100">{order.company_name}</div>
              <div className="text-xs text-zinc-500 mt-1">{order.contact_person}</div>
            </div>
          </div>
        </div>

        {/* Project + Services */}
        <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden">
          {order.order_description ? (
            <details className="border-b border-zinc-100 dark:border-zinc-800 group">
              <summary className="px-5 py-3.5 flex items-center justify-between cursor-pointer list-none">
                <div className="font-bold text-zinc-900 dark:text-zinc-100">{order.order_title}</div>
                <ChevronDown className="w-4 h-4 text-zinc-400 group-open:rotate-180 transition-transform flex-shrink-0 ml-2" />
              </summary>
              <div className="px-5 pb-4 text-xs text-zinc-500 dark:text-zinc-400 whitespace-pre-wrap leading-relaxed border-t border-zinc-100 dark:border-zinc-800 pt-3">
                {(() => {
                  const raw = order.order_description || '';
                  // Remove markdown table rows (lines that are mostly pipes and dashes)
                  const cleaned = raw
                    .split('\n')
                    .filter(line => !line.match(/^\s*[|\-]+\s*$/))
                    .map(line => line.replace(/#{1,6}\s/g, '').replace(/\*\*/g, '').replace(/`/g, '').replace(/\|/g, ' · ').trim())
                    .filter(line => line.length > 0)
                    .join('\n');
                  return cleaned;
                })()}
              </div>
            </details>
          ) : (
            <div className="px-5 py-3.5 border-b border-zinc-100 dark:border-zinc-800">
              <div className="font-bold text-zinc-900 dark:text-zinc-100">{order.order_title}</div>
            </div>
          )}
          <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {(order.services || []).map((s, i) => s.description && s.description.length > 80 ? (
                <details key={i} className="group">
                  <summary className="flex justify-between items-center px-5 py-3.5 cursor-pointer list-none">
                    <div className="flex items-center gap-1.5 flex-1 min-w-0">
                      <ChevronDown className="w-3.5 h-3.5 text-zinc-400 group-open:rotate-180 transition-transform flex-shrink-0" />
                      <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 truncate">{s.name}</div>
                    </div>
                    <div className="text-sm font-bold text-zinc-900 dark:text-zinc-100 ml-4 shrink-0">{fmt(s.price * (s.quantity || 1))}</div>
                  </summary>
                  <div className="px-5 pb-3.5 text-xs text-zinc-500 dark:text-zinc-400 whitespace-pre-wrap leading-relaxed border-t border-zinc-50 dark:border-zinc-800/50 pt-2 ml-5">
                    {(() => {
                    const raw = s.description || '';
                    return raw
                      .split('\n')
                      .filter(line => !line.match(/^\s*[|\-]+\s*$/))
                      .map(line => line.replace(/#{1,6}\s/g, '').replace(/\*\*/g, '').replace(/`/g, '').replace(/\|/g, ' · ').trim())
                      .filter(line => line.length > 0)
                      .join('\n');
                  })()}
                  </div>
                </details>
              ) : (
                <div key={i} className="flex justify-between items-start px-5 py-3.5">
                  <div>
                    <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{s.name}</div>
                    {s.description && <div className="text-xs text-zinc-500 mt-0.5">{(() => {
                    const raw = s.description || '';
                    return raw
                      .split('\n')
                      .filter(line => !line.match(/^\s*[|\-]+\s*$/))
                      .map(line => line.replace(/#{1,6}\s/g, '').replace(/\*\*/g, '').replace(/`/g, '').replace(/\|/g, ' · ').trim())
                      .filter(line => line.length > 0)
                      .join('\n');
                  })()}</div>}
                  </div>
                  <div className="text-sm font-bold text-zinc-900 dark:text-zinc-100 ml-4 shrink-0">{fmt(s.price * (s.quantity || 1))}</div>
                </div>
              )}
            ))}
          </div>
          <div className="bg-zinc-900 dark:bg-zinc-800 px-5 py-4 flex justify-between items-center">
            <span className="text-xs font-bold uppercase tracking-wider text-zinc-400">Total Due</span>
            <span className="text-xl font-black text-white">{fmt(total)}</span>
          </div>
        </div>

        {/* Terms */}
        {order.terms_and_conditions && (
          <details className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden group">
            <summary className="px-5 py-3.5 flex items-center justify-between cursor-pointer list-none">
              <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Terms & Conditions</span>
              <ChevronDown className="w-4 h-4 text-zinc-400 group-open:rotate-180 transition-transform" />
            </summary>
            <div className="px-5 pb-5 text-xs text-zinc-500 dark:text-zinc-400 whitespace-pre-wrap leading-relaxed border-t border-zinc-100 dark:border-zinc-800 pt-4">{order.terms_and_conditions}</div>
          </details>
        )}

        {/* Signatures */}
        <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden">
          <div className="px-5 py-3.5 border-b border-zinc-100 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/50">
            <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">Signatures</span>
          </div>
          {/* Client Signature — full width, AYN signs internally */}
          <div className="bg-zinc-100 dark:bg-zinc-800">
            <div className="bg-white dark:bg-zinc-900 p-4">
              <div className="text-[9px] font-bold uppercase tracking-widest text-zinc-400 mb-3">{order.contact_person} · Client</div>
              <div className={cn('rounded-xl border-2 h-20 flex items-center justify-center mb-3 overflow-hidden', alreadySigned ? 'border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-900/20' : 'border-dashed border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/10')}>
                {alreadySigned && order.client_signature_url
                  ? <img src={order.client_signature_url} alt="Client Signature" className="max-h-16 max-w-full object-contain" />
                  : <span className="text-xs text-amber-600 dark:text-amber-400 font-medium italic">Your signature here</span>}
              </div>
              <div className={cn('text-[10px] font-semibold', alreadySigned ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400')}>
                {alreadySigned ? `✓ Signed ${order.client_signed_at ? new Date(order.client_signed_at).toLocaleDateString() : ''}` : '⚠ Awaiting your signature'}
              </div>
            </div>
          </div>
        </div>

        {/* Payment CTA */}
        {order.stripe_payment_link && (
          <div className="bg-zinc-900 rounded-2xl p-6 text-center">
            <div className="text-xs uppercase tracking-widest text-zinc-500 mb-2">Total Amount Due</div>
            <div className="text-4xl font-black text-white mb-1">{fmt(total)}</div>
            <div className="text-xs text-zinc-600 mb-5">{order.currency || 'SAR'}</div>
            <a href={order.stripe_payment_link} target="_blank" rel="noreferrer"
              className="inline-block bg-white text-zinc-900 font-bold px-8 py-3 rounded-full text-sm hover:bg-zinc-100 transition-colors">
              Pay Securely →
            </a>
          </div>
        )}

        {/* Sign CTA if not signed */}
        {!alreadySigned && (
          <button
            onClick={() => { setShowPad(true); setTimeout(initCanvas, 100); }}
            className="w-full bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 font-bold py-4 rounded-2xl text-sm flex items-center justify-center gap-2 hover:opacity-90 transition-opacity"
          >
            <PenTool className="w-4 h-4" /> Sign This Contract
          </button>
        )}

        <div className="text-center text-xs text-zinc-400 pb-4">
          © {new Date().getFullYear()} AYN AI · aynn.io
        </div>
      </div>

      {/* Signature Modal */}
      {showPad && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowPad(false)} />
          <div className="relative w-full sm:max-w-md bg-white dark:bg-zinc-900 rounded-t-3xl sm:rounded-2xl shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-100 dark:border-zinc-800">
              <div>
                <div className="font-bold text-zinc-900 dark:text-zinc-100">Sign Contract</div>
                <div className="text-xs text-zinc-500 mt-0.5">Draw your signature in the box below</div>
              </div>
              <button onClick={() => setShowPad(false)} className="p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors">
                <X className="w-4 h-4 text-zinc-500" />
              </button>
            </div>
            <div className="p-5">
              {/* Canvas */}
              <div className="relative rounded-xl border-2 border-dashed border-zinc-300 dark:border-zinc-700 bg-white overflow-hidden cursor-crosshair" style={{ height: 180 }}>
                <canvas
                  ref={canvasRef}
                  className="w-full h-full touch-none"
                  onMouseDown={startDraw} onMouseMove={draw} onMouseUp={stopDraw} onMouseLeave={stopDraw}
                  onTouchStart={startDraw} onTouchMove={draw} onTouchEnd={stopDraw}
                />
                {!hasDrawn && (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <span className="text-sm text-zinc-300 italic">Sign here</span>
                  </div>
                )}
              </div>
              <div className="flex gap-3 mt-4">
                <button onClick={clearCanvas} className="flex-none px-4 py-2.5 rounded-xl border border-zinc-200 dark:border-zinc-700 text-sm font-medium text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors">
                  Clear
                </button>
                <button
                  onClick={handleSign}
                  disabled={!hasDrawn || signing}
                  className="flex-1 py-2.5 rounded-xl bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 text-sm font-bold flex items-center justify-center gap-2 hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
                >
                  {signing ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                  {signing ? 'Saving…' : 'Confirm Signature'}
                </button>
              </div>
              <p className="text-[10px] text-zinc-400 text-center mt-3 leading-relaxed">
                By signing, you agree to the terms and conditions of this agreement.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
