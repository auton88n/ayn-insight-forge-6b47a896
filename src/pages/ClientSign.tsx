import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '@/config';

interface ServiceItem { name: string; description: string; price: number; quantity: number; }
interface Order {
  id: string; order_title: string; order_description: string | null;
  company_name: string; contact_person: string; company_email: string;
  company_phone: string | null; company_address: string | null;
  services: ServiceItem[]; subtotal: number; discount_percent: number;
  tax_percent: number; total_amount: number; currency: string;
  system_plan: string | null; payment_terms: string | null;
  terms_and_conditions: string | null; delivery_timeline: string | null;
  after_sale_services: string | null; additional_services: string | null;
  privacy_notes: string | null; warranty: string | null;
  termination_clause: string | null; governing_law: string | null;
  admin_signature_url: string | null; admin_signed_at: string | null;
  client_signature_url: string | null; client_signed_at: string | null;
  stripe_payment_link: string | null; status: string; signing_token: string;
}

function SignaturePad({ onSave, existingUrl, signedAt, locked }: {
  onSave: (dataUrl: string) => Promise<void>;
  existingUrl?: string | null; signedAt?: string | null; locked?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [showPad, setShowPad] = useState(false);
  const [saving, setSaving] = useState(false);

  const initCanvas = () => {
    const c = canvasRef.current; if (!c) return;
    const ctx = c.getContext('2d'); if (!ctx) return;
    c.width = c.offsetWidth * 2; c.height = c.offsetHeight * 2;
    ctx.scale(2, 2); ctx.strokeStyle = '#1a1a1a'; ctx.lineWidth = 1.8; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  };

  const getPos = (e: React.MouseEvent | React.TouchEvent, canvas: HTMLCanvasElement) => {
    const rect = canvas.getBoundingClientRect();
    if ('touches' in e) return { x: e.touches[0].clientX - rect.left, y: e.touches[0].clientY - rect.top };
    return { x: (e as React.MouseEvent).clientX - rect.left, y: (e as React.MouseEvent).clientY - rect.top };
  };

  const startDraw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!canvasRef.current) return; drawing.current = true;
    const ctx = canvasRef.current.getContext('2d'); if (!ctx) return;
    const pos = getPos(e, canvasRef.current); ctx.beginPath(); ctx.moveTo(pos.x, pos.y); e.preventDefault();
  };
  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!drawing.current || !canvasRef.current) return;
    const ctx = canvasRef.current.getContext('2d'); if (!ctx) return;
    const pos = getPos(e, canvasRef.current); ctx.lineTo(pos.x, pos.y); ctx.stroke(); e.preventDefault();
  };
  const stopDraw = () => { drawing.current = false; };

  const handleSave = async () => {
    if (!canvasRef.current) return; setSaving(true);
    try { await onSave(canvasRef.current.toDataURL('image/png')); setShowPad(false); }
    catch (e: any) { alert('Failed: ' + e.message); } finally { setSaving(false); }
  };

  if (existingUrl) return (
    <div>
      <img src={existingUrl} alt="Signature" style={{ maxHeight: 52, maxWidth: 180, objectFit: 'contain' }} />
      {signedAt && <div style={{ fontSize: 10, color: '#888', marginTop: 3, fontFamily: '"Times New Roman",serif', fontStyle: 'italic' }}>
        Signed {new Date(signedAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
      </div>}
    </div>
  );

  if (locked) return <div style={{ fontSize: 11, color: '#aaa', fontStyle: 'italic', fontFamily: '"Times New Roman",serif', padding: '8px 0' }}>Awaiting AYN AI signature first</div>;

  return (
    <div>
      {!showPad ? (
        <div style={{ border: '1px dashed #bbb', borderRadius: 3, padding: '10px 14px', textAlign: 'center', cursor: 'pointer', minHeight: 56, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => { setShowPad(true); setTimeout(initCanvas, 50); }}>
          <span style={{ fontSize: 12, color: '#aaa', fontFamily: '"Times New Roman",serif', fontStyle: 'italic' }}>Click to sign</span>
        </div>
      ) : (
        <div>
          <canvas ref={canvasRef} style={{ width: '100%', height: 88, border: '1px solid #ddd', borderRadius: 3, background: '#fafafa', display: 'block', touchAction: 'none', cursor: 'crosshair' }}
            onMouseDown={startDraw} onMouseMove={draw} onMouseUp={stopDraw} onMouseLeave={stopDraw}
            onTouchStart={startDraw} onTouchMove={draw} onTouchEnd={stopDraw} />
          <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
            <button onClick={() => { const ctx = canvasRef.current?.getContext('2d'); if (ctx && canvasRef.current) ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height); }}
              style={{ flex: 1, padding: '5px', border: '1px solid #ddd', background: 'white', borderRadius: 3, fontFamily: '"Times New Roman",serif', fontSize: 11, cursor: 'pointer' }}>Clear</button>
            <button onClick={handleSave} disabled={saving}
              style={{ flex: 2, padding: '5px', background: '#1a1a1a', color: 'white', border: 'none', borderRadius: 3, fontFamily: '"Times New Roman",serif', fontSize: 11, cursor: 'pointer', opacity: saving ? 0.6 : 1 }}>
              {saving ? 'Saving...' : 'Confirm Signature'}
            </button>
          </div>
          <p style={{ fontSize: 10, color: '#aaa', textAlign: 'center', marginTop: 4, fontFamily: '"Times New Roman",serif', fontStyle: 'italic' }}>By signing, you agree to the terms of this agreement.</p>
        </div>
      )}
    </div>
  );
}

export default function ClientSign() {
  const { token } = useParams<{ token: string }>();
  const [searchParams] = useSearchParams();
  const isAdmin = searchParams.get('role') === 'admin';
  const isClient = !isAdmin;
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [completing, setCompleting] = useState(false);
  const [completed, setCompleted] = useState(false);

  const fetchOrder = useCallback(async () => {
    if (!token || token.length < 10) return;
    try {
      const { data, error } = await supabase.from('custom_orders').select('*').eq('signing_token', token).single();
      if (error || !data) throw new Error('Contract not found');
      setOrder(data as unknown as Order);
      if (data.admin_signature_url && data.client_signature_url) setCompleted(true);
      if (!data.client_viewed_at) {
        await supabase.from('custom_orders').update({ client_viewed_at: new Date().toISOString(), status: data.status === 'sent' ? 'viewed' : data.status }).eq('signing_token', token);
      }
    } catch (e: any) { setError(e.message); } finally { setLoading(false); }
  }, [token]);

  useEffect(() => { fetchOrder(); }, [fetchOrder]);

  const saveSignature = async (dataUrl: string, party: 'admin' | 'client') => {
    if (!order) return;
    const blob = await fetch(dataUrl).then(r => r.blob());
    const path = `signatures/order_${order.id}_${party}_${Date.now()}.png`;
    const { error: upErr } = await supabase.storage.from('generated-files').upload(path, blob, { contentType: 'image/png' });
    if (upErr) throw upErr;
    const { data: urlData } = supabase.storage.from('generated-files').getPublicUrl(path);
    const sigUrl = urlData.publicUrl;
    const now = new Date().toISOString();
    const updates: any = party === 'admin'
      ? { admin_signature_url: sigUrl, admin_signed_at: now }
      : { client_signature_url: sigUrl, client_signed_at: now, status: 'signed' };
    await supabase.from('custom_orders').update(updates).eq('signing_token', token);
    const updated = { ...order, ...updates };
    setOrder(updated);
    if (updated.admin_signature_url && updated.client_signature_url) {
      setCompleting(true);
      try {
        await fetch(`${SUPABASE_URL}/functions/v1/send-contract-completion`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` },
          body: JSON.stringify({ orderId: order.id }),
        });
        setCompleted(true);
      } finally { setCompleting(false); }
    }
  };

  const fmt = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: order?.currency || 'USD' }).format(n);

  const F: React.CSSProperties = { fontFamily: '"Times New Roman", Times, serif' };

  if (loading) return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f0ede8', ...F }}><p style={{ color: '#999' }}>Loading agreement...</p></div>;
  if (error) return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f0ede8', ...F }}><p style={{ color: '#999' }}>Contract not found or link has expired.</p></div>;
  if (!order) return null;

  const bothSigned = !!(order.admin_signature_url && order.client_signature_url);
  const contractRef = `AGR-${order.id.substring(0, 8).toUpperCase()}`;
  const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const subtotal = Number(order.subtotal) || 0;
  const discAmt = subtotal * (Number(order.discount_percent) || 0) / 100;
  const taxAmt = (subtotal - discAmt) * (Number(order.tax_percent) || 0) / 100;
  const total = Number(order.total_amount) || subtotal - discAmt + taxAmt;

  return (
    <div style={{ background: '#f0ede8', minHeight: '100vh', padding: '16px 12px 48px' }}>
      {/* Header */}
      <div style={{ position: 'sticky', top: 0, zIndex: 50, background: '#1a1a1a', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', marginBottom: 20, borderRadius: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', fontFamily: 'Arial,sans-serif' }}>Secure Legal Gateway</span>
        </div>
        <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', background: bothSigned ? '#2d6a4f' : '#c9a84c', color: 'white', padding: '4px 10px', borderRadius: 20, fontFamily: 'Arial,sans-serif' }}>
          {bothSigned ? '✓ Executed' : 'Action Required'}
        </span>
      </div>

      {/* Document */}
      <div style={{ maxWidth: 720, margin: '0 auto', background: 'white', boxShadow: '0 4px 24px rgba(0,0,0,0.12)', color: '#1a1a1a', lineHeight: 1.75, ...F }}>
        <div style={{ padding: '52px 52px 40px' }}>

          {/* Header */}
          <div style={{ textAlign: 'center', marginBottom: 36, borderBottom: '3px double #1a1a1a', paddingBottom: 28 }}>
            <div style={{ fontSize: 52, fontWeight: 900, letterSpacing: -2, lineHeight: 1, fontFamily: "'Helvetica Neue',Arial,sans-serif", color: '#000' }}>AYN AI</div>
            <div style={{ marginTop: 20, fontSize: 18, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', ...F }}>Service Agreement &amp; Price Quote</div>
            <div style={{ fontSize: 11, color: '#888', marginTop: 6 }}>{contractRef} &nbsp;·&nbsp; {today}</div>
          </div>

          {/* Article 1 — Parties */}
          <div style={{ marginBottom: 28 }}>
            <div style={{ fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1, borderBottom: '1px solid #e0e0e0', paddingBottom: 6, marginBottom: 14, fontFamily: "'Helvetica Neue',Arial,sans-serif" }}>Article 1 — Parties</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
              <div style={{ fontSize: 12 }}>
                <div style={{ fontWeight: 700, marginBottom: 4, fontSize: 10, textTransform: 'uppercase', letterSpacing: 1.5, color: '#888' }}>Service Provider</div>
                <div style={{ fontWeight: 600 }}>AYN AI</div>
                <div style={{ color: '#666' }}>Ghazi ALDhyaei</div>
                <div style={{ color: '#666' }}>ghazi@aynn.io</div>
              </div>
              <div style={{ fontSize: 12 }}>
                <div style={{ fontWeight: 700, marginBottom: 4, fontSize: 10, textTransform: 'uppercase', letterSpacing: 1.5, color: '#888' }}>Client</div>
                <div style={{ fontWeight: 600 }}>{order.company_name}</div>
                <div style={{ color: '#666' }}>{order.contact_person}</div>
                {order.company_email && <div style={{ color: '#666' }}>{order.company_email}</div>}
                {order.company_phone && <div style={{ color: '#666' }}>{order.company_phone}</div>}
                {order.company_address && <div style={{ color: '#666' }}>{order.company_address}</div>}
              </div>
            </div>
          </div>

          {/* Article 2 — Project Scope */}
          <div style={{ marginBottom: 28 }}>
            <div style={{ fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1, borderBottom: '1px solid #e0e0e0', paddingBottom: 6, marginBottom: 14, fontFamily: "'Helvetica Neue',Arial,sans-serif" }}>Article 2 — Project Scope</div>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>{order.order_title}</div>
            {order.order_description && <div style={{ fontSize: 12, color: '#333', lineHeight: 1.85 }}>{order.order_description.replace(/#{1,6}\s/g, '').replace(/\*\*/g, '').replace(/`/g, '').replace(/\|/g, ' · ')}</div>}
            {order.system_plan && (
              <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid #f0f0f0' }}>
                <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: '#888', marginBottom: 4 }}>Technical Approach</div>
                <div style={{ fontSize: 12, color: '#333', lineHeight: 1.85 }}>{order.system_plan}</div>
              </div>
            )}
          </div>

          {/* Article 3 — Deliverables & Pricing */}
          <div style={{ marginBottom: 28 }}>
            <div style={{ fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1, borderBottom: '1px solid #e0e0e0', paddingBottom: 6, marginBottom: 14, fontFamily: "'Helvetica Neue',Arial,sans-serif" }}>Article 3 — Deliverables &amp; Pricing</div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #e0e0e0' }}>
                  <th style={{ textAlign: 'left', padding: '6px 0', fontWeight: 700, color: '#555', fontSize: 10, textTransform: 'uppercase', letterSpacing: 1 }}>Service</th>
                  <th style={{ textAlign: 'right', padding: '6px 0', fontWeight: 700, color: '#555', fontSize: 10, textTransform: 'uppercase', letterSpacing: 1, width: 80 }}>Qty</th>
                  <th style={{ textAlign: 'right', padding: '6px 0', fontWeight: 700, color: '#555', fontSize: 10, textTransform: 'uppercase', letterSpacing: 1, width: 100 }}>Price</th>
                  <th style={{ textAlign: 'right', padding: '6px 0', fontWeight: 700, color: '#555', fontSize: 10, textTransform: 'uppercase', letterSpacing: 1, width: 110 }}>Total</th>
                </tr>
              </thead>
              <tbody>
                {(order.services || []).map((s, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid #f5f5f5' }}>
                    <td style={{ padding: '8px 0' }}>
                      <div style={{ fontWeight: 600 }}>{s.name}</div>
                      {s.description && <div style={{ fontSize: 11, color: '#888', marginTop: 2, lineHeight: 1.5 }}>{s.description.substring(0, 100)}{s.description.length > 100 ? '...' : ''}</div>}
                    </td>
                    <td style={{ textAlign: 'right', padding: '8px 0', color: '#555' }}>{s.quantity || 1}</td>
                    <td style={{ textAlign: 'right', padding: '8px 0', color: '#555' }}>{fmt(s.price)}</td>
                    <td style={{ textAlign: 'right', padding: '8px 0', fontWeight: 600 }}>{fmt(s.price * (s.quantity || 1))}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                {discAmt > 0 && <tr><td colSpan={3} style={{ textAlign: 'right', padding: '6px 0', fontSize: 11, color: '#888' }}>Subtotal</td><td style={{ textAlign: 'right', padding: '6px 0', fontSize: 11 }}>{fmt(subtotal)}</td></tr>}
                {discAmt > 0 && <tr><td colSpan={3} style={{ textAlign: 'right', padding: '6px 0', fontSize: 11, color: '#888' }}>Discount ({order.discount_percent}%)</td><td style={{ textAlign: 'right', padding: '6px 0', fontSize: 11, color: '#c00' }}>−{fmt(discAmt)}</td></tr>}
                {taxAmt > 0 && <tr><td colSpan={4} style={{ textAlign: 'right', padding: '4px 0', fontSize: 10, color: '#aaa' }}>Tax Included</td></tr>}
                <tr style={{ borderTop: '2px solid #1a1a1a' }}>
                  <td colSpan={3} style={{ textAlign: 'right', padding: '10px 0', fontWeight: 800, fontSize: 13 }}>TOTAL DUE</td>
                  <td style={{ textAlign: 'right', padding: '10px 0', fontWeight: 900, fontSize: 15 }}>{fmt(total)}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Article 4 — Payment Terms */}
          {order.payment_terms && (
            <div style={{ marginBottom: 28 }}>
              <div style={{ fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1, borderBottom: '1px solid #e0e0e0', paddingBottom: 6, marginBottom: 10, fontFamily: "'Helvetica Neue',Arial,sans-serif" }}>Article 4 — Payment Terms</div>
              <div style={{ fontSize: 12, color: '#333', lineHeight: 1.85 }}>{order.payment_terms}</div>
              {order.stripe_payment_link && (
                <div style={{ marginTop: 10 }}>
                  <a href={order.stripe_payment_link} target="_blank" rel="noreferrer"
                    style={{ display: 'inline-block', background: '#1a1a1a', color: 'white', padding: '8px 18px', borderRadius: 4, fontSize: 12, fontFamily: "'Helvetica Neue',Arial,sans-serif", fontWeight: 600, textDecoration: 'none' }}>
                    Pay Securely →
                  </a>
                </div>
              )}
            </div>
          )}

          {/* Article 5 — Delivery */}
          {order.delivery_timeline && (
            <div style={{ marginBottom: 28 }}>
              <div style={{ fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1, borderBottom: '1px solid #e0e0e0', paddingBottom: 6, marginBottom: 10, fontFamily: "'Helvetica Neue',Arial,sans-serif" }}>Article 5 — Delivery &amp; Timeline</div>
              <div style={{ fontSize: 12, color: '#333', lineHeight: 1.85 }}>{order.delivery_timeline}</div>
            </div>
          )}

          {/* Article 6 — Warranty */}
          {order.warranty && (
            <div style={{ marginBottom: 28 }}>
              <div style={{ fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1, borderBottom: '1px solid #e0e0e0', paddingBottom: 6, marginBottom: 10, fontFamily: "'Helvetica Neue',Arial,sans-serif" }}>Article 6 — Warranty</div>
              <div style={{ fontSize: 12, color: '#333', lineHeight: 1.85 }}>{order.warranty}</div>
            </div>
          )}

          {/* Article 7 — After-Sale Services */}
          {order.after_sale_services && (
            <div style={{ marginBottom: 28 }}>
              <div style={{ fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1, borderBottom: '1px solid #e0e0e0', paddingBottom: 6, marginBottom: 10, fontFamily: "'Helvetica Neue',Arial,sans-serif" }}>Article 7 — After-Sale Services</div>
              <div style={{ fontSize: 12, color: '#333', lineHeight: 1.85 }}>{order.after_sale_services}</div>
            </div>
          )}

          {/* Article 8 — Terms & Conditions */}
          {order.terms_and_conditions && (
            <div style={{ marginBottom: 28 }}>
              <div style={{ fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1, borderBottom: '1px solid #e0e0e0', paddingBottom: 6, marginBottom: 10, fontFamily: "'Helvetica Neue',Arial,sans-serif" }}>Article 8 — Terms &amp; Conditions</div>
              <div style={{ fontSize: 12, color: '#333', lineHeight: 1.85 }}>{order.terms_and_conditions}</div>
            </div>
          )}

          {/* Article 9 — Termination */}
          {order.termination_clause && (
            <div style={{ marginBottom: 28 }}>
              <div style={{ fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1, borderBottom: '1px solid #e0e0e0', paddingBottom: 6, marginBottom: 10, fontFamily: "'Helvetica Neue',Arial,sans-serif" }}>Article 9 — Termination</div>
              <div style={{ fontSize: 12, color: '#333', lineHeight: 1.85 }}>{order.termination_clause}</div>
            </div>
          )}

          {/* Article 10 — Privacy */}
          {order.privacy_notes && (
            <div style={{ marginBottom: 28 }}>
              <div style={{ fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1, borderBottom: '1px solid #e0e0e0', paddingBottom: 6, marginBottom: 10, fontFamily: "'Helvetica Neue',Arial,sans-serif" }}>Article 10 — Privacy &amp; Confidentiality</div>
              <div style={{ fontSize: 12, color: '#333', lineHeight: 1.85 }}>{order.privacy_notes}</div>
            </div>
          )}

          {/* Governing Law */}
          {order.governing_law && (
            <div style={{ marginBottom: 28 }}>
              <div style={{ fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1, borderBottom: '1px solid #e0e0e0', paddingBottom: 6, marginBottom: 10, fontFamily: "'Helvetica Neue',Arial,sans-serif" }}>Governing Law</div>
              <div style={{ fontSize: 12, color: '#333', lineHeight: 1.85 }}>{order.governing_law}</div>
            </div>
          )}

          {/* IN WITNESS WHEREOF */}
          <div style={{ borderTop: '1px solid #ccc', paddingTop: 20, marginTop: 32, marginBottom: 32 }}>
            <p style={{ fontSize: 12, fontStyle: 'italic', lineHeight: 1.8, ...F }}>
              <strong>IN WITNESS WHEREOF</strong>, the parties hereto have agreed to the terms of this Service Agreement and Price Quote as of the date first written above. By digitally signing below, both parties confirm their acceptance and agreement to be legally bound by these terms.
            </p>
          </div>

          {/* Signatures */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 28 }}>
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', color: '#888', marginBottom: 10 }}>Service Provider</div>
              <div style={{ borderBottom: '1px solid #1a1a1a', minHeight: 72, paddingBottom: 8, marginBottom: 8 }}>
                <SignaturePad key={`admin-${order.id}`} existingUrl={order.admin_signature_url} signedAt={order.admin_signed_at}
                  locked={isClient}
                  onSave={async (d) => await saveSignature(d, 'admin')} />
              </div>
              <div style={{ fontSize: 12, fontWeight: 700, ...F }}>AYN AI</div>
              <div style={{ fontSize: 11, ...F }}>Name: Ghazi ALDhyaei</div>
              <div style={{ fontSize: 11, ...F }}>Title: Founder &amp; CEO</div>
              <div style={{ fontSize: 10, color: '#aaa', fontStyle: 'italic', marginTop: 3, ...F }}>
                {order.admin_signed_at ? `Signed: ${new Date(order.admin_signed_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}` : 'Pending Execution'}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', color: '#888', marginBottom: 10 }}>Client</div>
              <div style={{ borderBottom: '1px solid #1a1a1a', minHeight: 72, paddingBottom: 8, marginBottom: 8 }}>
                <SignaturePad key={`client-${order.id}`} existingUrl={order.client_signature_url} signedAt={order.client_signed_at}
                  locked={isAdmin || !order.admin_signature_url}
                  onSave={async (d) => await saveSignature(d, 'client')} />
              </div>
              <div style={{ fontSize: 12, fontWeight: 700, ...F }}>{order.company_name}</div>
              <div style={{ fontSize: 11, ...F }}>Name: {order.contact_person}</div>
              <div style={{ fontSize: 11, ...F }}>Title: Authorized Representative</div>
              <div style={{ fontSize: 10, color: '#aaa', fontStyle: 'italic', marginTop: 3, ...F }}>
                {order.client_signed_at ? `Signed: ${new Date(order.client_signed_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}` : 'Pending Execution'}
              </div>
            </div>
          </div>

          {/* Download button */}
          {bothSigned && (
            <div style={{ textAlign: 'center', margin: '32px 0' }}>
              <button
                onClick={async () => {
                  const toBase64 = async (url: string | null) => {
                    if (!url) return null;
                    try {
                      const res = await fetch(url);
                      const blob = await res.blob();
                      return await new Promise<string>((resolve) => {
                        const reader = new FileReader();
                        reader.onload = () => resolve(reader.result as string);
                        reader.readAsDataURL(blob);
                      });
                    } catch { return null; }
                  };
                  const [adminB64, clientB64] = await Promise.all([toBase64(order.admin_signature_url), toBase64(order.client_signature_url)]);
                  const adminSigHtml = adminB64 ? `<img src="${adminB64}" style="max-height:56px;max-width:180px;object-fit:contain;display:block;">` : '<div style="height:56px;"></div>';
                  const clientSigHtml = clientB64 ? `<img src="${clientB64}" style="max-height:56px;max-width:180px;object-fit:contain;display:block;">` : '<div style="height:56px;"></div>';
                  const adminDate = order.admin_signed_at ? new Date(order.admin_signed_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : '';
                  const clientDate = order.client_signed_at ? new Date(order.client_signed_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : '';
                  // Strip markdown helper
                  const cleanDesc = (t: string) => t
                    .split('\n')
                    .filter(l => !l.match(/^\s*[-|]+\s*$/))
                    .map(l => l.replace(/#{1,6}\s/g,'').replace(/\*\*/g,'').replace(/[`]/g,'').replace(/\|/g,' · ').trim())
                    .filter(l => l.length > 0)
                    .join('<br>');
                  const rows = (order.services || []).map(s =>
                    `<tr><td>${s.name}${s.description ? `<div class="sdesc">${cleanDesc(s.description)}</div>` : ''}</td><td class="r">${s.quantity || 1}</td><td class="r">${fmt(s.price)}</td><td class="r b">${fmt(s.price * (s.quantity || 1))}</td></tr>`
                  ).join('');

                  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8">
<title> </title>
<style>
  @page{size:A4;margin:0}
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:'Times New Roman',Times,serif;color:#000;background:#fff;font-size:12pt;line-height:1.75;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  .wrap{max-width:760px;margin:0 auto;padding:18mm 18mm 18mm 18mm}
  .hd{text-align:center;padding-bottom:22px;margin-bottom:26px;border-bottom:2.5pt double #000;page-break-inside:avoid}
  .brand{font-size:42pt;font-weight:900;letter-spacing:-2pt;font-family:'Helvetica Neue',Arial,sans-serif;color:#000;line-height:1}
  .doc-title{font-size:13pt;font-weight:700;text-transform:uppercase;letter-spacing:1.5pt;margin-top:14px;color:#000}
  .ref{font-size:9pt;color:#333;margin-top:5px;letter-spacing:.5px}
  .parties{display:grid;grid-template-columns:1fr 1fr;gap:28px;margin-bottom:26px;padding:14px 0;border-top:1pt solid #bbb;border-bottom:1pt solid #bbb;page-break-inside:avoid}
  .plabel{font-size:8pt;font-weight:700;text-transform:uppercase;letter-spacing:2px;color:#000;margin-bottom:5px;font-family:'Helvetica Neue',Arial,sans-serif}
  .pname{font-size:12pt;font-weight:700;color:#000}
  .pinfo{font-size:10pt;color:#000;margin-top:2px}
  .art{margin-bottom:20px;page-break-inside:avoid}
  .art h3{font-size:9pt;font-weight:700;text-transform:uppercase;letter-spacing:2px;border-bottom:1pt solid #ccc;padding-bottom:5px;margin-bottom:9px;font-family:'Helvetica Neue',Arial,sans-serif;color:#000;page-break-after:avoid}
  .art p{font-size:11pt;line-height:1.8;text-align:justify;color:#000}
  table{width:100%;border-collapse:collapse;page-break-inside:avoid}
  th{font-size:8pt;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#000;text-align:left;padding:6px 4px;border-bottom:1.5pt solid #000}
  th.r,td.r{text-align:right}
  td{padding:7px 4px;font-size:10.5pt;border-bottom:0.5pt solid #ddd;vertical-align:top;color:#000}
  td.b{font-weight:700;color:#000}
  .sdesc{font-size:9pt;color:#333;margin-top:3px}
  .total-row td{border-top:2pt solid #000;border-bottom:none;padding-top:9px;font-weight:900;font-size:13pt;color:#000}
  .disc-note{font-size:9pt;color:#333;text-align:right;padding:4px 0}
  .tax-note{font-size:8.5pt;color:#555;text-align:right;padding:3px 0}
  .witness{border-top:1pt solid #aaa;padding-top:16px;margin:24px 0;font-style:italic;font-size:11pt;color:#000;line-height:1.8;page-break-inside:avoid}
  .sig-grid{display:grid;grid-template-columns:1fr 1fr;gap:36px;margin-top:22px;page-break-inside:avoid}
  .sig-label{font-size:8pt;font-weight:700;text-transform:uppercase;letter-spacing:2px;color:#000;margin-bottom:10px;font-family:'Helvetica Neue',Arial,sans-serif}
  .sig-img{min-height:56px;border-bottom:1pt solid #000;margin-bottom:7px;padding-bottom:3px}
  .sig-name{font-size:11pt;font-weight:700;color:#000}
  .sig-title{font-size:10pt;color:#000}
  .sig-date{font-size:9pt;color:#333;font-style:italic;margin-top:3px}
  .footer{margin-top:32px;padding-top:10px;border-top:1pt solid #000;text-align:center;font-size:8.5pt;color:#000;letter-spacing:.5px;font-weight:600;page-break-inside:avoid}
  @media print{.no-print{display:none!important}}
</style>
</head><body>
<div class="wrap">
<div class="hd">
  <div class="brand">AYN AI</div>
  <div class="doc-title">Service Agreement &amp; Price Quote</div>
  <div class="ref">${contractRef} &nbsp;&middot;&nbsp; ${today}</div>
</div>
<div class="parties">
  <div>
    <div class="plabel">Service Provider</div>
    <div class="pname">AYN AI</div>
    <div class="pinfo">Ghazi ALDhyaei</div>
    <div class="pinfo">ghazi&#64;aynn.io</div>
  </div>
  <div>
    <div class="plabel">Client</div>
    <div class="pname">${order.company_name}</div>
    <div class="pinfo">${order.contact_person}</div>
    ${order.company_email ? `<div class="pinfo">${order.company_email.replace('@', '&#64;')}</div>` : ''}
  </div>
</div>
<div class="art">
  <h3>Project Scope</h3>
  <p><strong>${order.order_title}</strong>${order.order_description ? '<br><br>' + cleanDesc(order.order_description) : ''}</p>
  ${order.system_plan ? `<p style="margin-top:10px"><strong>Technical Approach:</strong> ${order.system_plan}</p>` : ''}
</div>
<div class="art">
  <h3>Deliverables &amp; Pricing</h3>
  <table>
    <thead><tr><th>Service</th><th class="r" style="width:48px">Qty</th><th class="r" style="width:88px">Unit Price</th><th class="r" style="width:96px">Total</th></tr></thead>
    <tbody>${rows}</tbody>
    <tfoot>
      ${discAmt > 0 ? `<tr><td colspan="3" class="disc-note">Subtotal</td><td class="r disc-note">${fmt(subtotal)}</td></tr><tr><td colspan="3" class="disc-note">Discount (${order.discount_percent}%)</td><td class="r disc-note" style="color:#c00">−${fmt(discAmt)}</td></tr>` : ''}
      ${taxAmt > 0 ? `<tr><td colspan="4" class="tax-note">Tax Included</td></tr>` : ''}
      <tr class="total-row"><td colspan="3" style="text-align:right">TOTAL DUE</td><td class="r">${fmt(total)}</td></tr>
    </tfoot>
  </table>
</div>
${order.payment_terms ? `<div class="art"><h3>Payment Terms</h3><p>${order.payment_terms}</p></div>` : ''}
${order.delivery_timeline ? `<div class="art"><h3>Delivery &amp; Timeline</h3><p>${order.delivery_timeline}</p></div>` : ''}
${order.warranty ? `<div class="art"><h3>Warranty</h3><p>${order.warranty}</p></div>` : ''}
${order.after_sale_services ? `<div class="art"><h3>After-Sale Services</h3><p>${order.after_sale_services}</p></div>` : ''}
${order.terms_and_conditions ? `<div class="art"><h3>Terms &amp; Conditions</h3><p>${order.terms_and_conditions}</p></div>` : ''}
${order.termination_clause ? `<div class="art"><h3>Termination</h3><p>${order.termination_clause}</p></div>` : ''}
${order.privacy_notes ? `<div class="art"><h3>Privacy &amp; Confidentiality</h3><p>${order.privacy_notes}</p></div>` : ''}
${order.governing_law ? `<div class="art"><h3>Governing Law</h3><p>${order.governing_law}</p></div>` : ''}
<div class="witness"><strong>IN WITNESS WHEREOF</strong>, the parties have agreed to the terms of this Service Agreement and Price Quote. By digitally signing, both parties confirm their acceptance and agreement to be legally bound.</div>
<div class="sig-grid">
  <div>
    <div class="sig-label">Service Provider — AYN AI</div>
    <div class="sig-img">${adminSigHtml}</div>
    <div class="sig-name">Ghazi ALDhyaei</div>
    <div class="sig-title">Founder &amp; CEO, AYN AI</div>
    <div class="sig-date">${adminDate ? 'Signed: ' + adminDate : ''}</div>
  </div>
  <div>
    <div class="sig-label">Client — ${order.company_name}</div>
    <div class="sig-img">${clientSigHtml}</div>
    <div class="sig-name">${order.contact_person}</div>
    <div class="sig-title">Authorized Representative</div>
    <div class="sig-date">${clientDate ? 'Signed: ' + clientDate : ''}</div>
  </div>
</div>
<div class="footer">${contractRef} &nbsp;&middot;&nbsp; &copy; ${new Date().getFullYear()} AYN AI &nbsp;&middot;&nbsp; aynn.io &nbsp;&middot;&nbsp; This document is confidential</div>
</div>
</body></html>`;
                  // Open in new window and trigger print dialog (Save as PDF)
                  const win = window.open('', '_blank');
                  if (win) {
                    win.document.write(html);
                    win.document.close();
                    win.document.title = '';
                    setTimeout(() => {
                      win.focus();
                      win.onbeforeprint = () => { win.document.title = ''; };
                      win.onafterprint = () => { win.close(); };
                      win.print();
                    }, 600);
                  }
                }}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: '#16a34a', color: 'white', border: 'none', borderRadius: 6, padding: '10px 22px', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: "'Helvetica Neue',Arial,sans-serif" }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
                Download Signed Agreement
              </button>
              {completing && <div style={{ fontSize: 11, color: '#16a34a', marginTop: 8, ...F }}>Sending to both parties...</div>}
            </div>
          )}

          {/* Footer */}
          <div style={{ borderTop: '1px solid #eee', marginTop: 36, paddingTop: 12, textAlign: 'center' }}>
            <div style={{ fontSize: 10, color: '#ccc', letterSpacing: 0.5 }}>{contractRef} · © {new Date().getFullYear()} AYN AI · aynn.io · This document is confidential</div>
          </div>
        </div>
      </div>
    </div>
  );
}
