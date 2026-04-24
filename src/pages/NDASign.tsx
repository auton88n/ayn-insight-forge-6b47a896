import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '@/config';

interface NDA {
  id: string; company_name: string; company_email: string;
  contact_person: string; nda_purpose: string | null;
  confidential_info: string | null; obligations: string | null;
  exclusions: string | null; duration: string | null;
  governing_law: string | null; additional_clauses: string | null;
  admin_signature_url: string | null; admin_signed_at: string | null;
  client_signature_url: string | null; client_signed_at: string | null;
  status: string | null; signing_token: string | null;
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
    ctx.scale(2, 2); ctx.strokeStyle = '#1a1a1a'; ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !showPad) return;
    const prevent = (e: TouchEvent) => { if (drawing.current) e.preventDefault(); };
    canvas.addEventListener('touchstart', prevent, { passive: false });
    canvas.addEventListener('touchmove', prevent, { passive: false });
    return () => {
      canvas.removeEventListener('touchstart', prevent);
      canvas.removeEventListener('touchmove', prevent);
    };
  }, [showPad]);

  const getPos = (e: React.MouseEvent | React.TouchEvent, canvas: HTMLCanvasElement) => {
    const rect = canvas.getBoundingClientRect();
    if ('touches' in e) {
      const t = e.touches[0];
      return { x: t.clientX - rect.left, y: t.clientY - rect.top };
    }
    return { x: (e as React.MouseEvent).clientX - rect.left, y: (e as React.MouseEvent).clientY - rect.top };
  };
  const startDraw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!canvasRef.current) return;
    drawing.current = true;
    const ctx = canvasRef.current.getContext('2d'); if (!ctx) return;
    const pos = getPos(e, canvasRef.current);
    ctx.beginPath(); ctx.moveTo(pos.x, pos.y);
    e.preventDefault();
  };
  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!drawing.current || !canvasRef.current) return;
    const ctx = canvasRef.current.getContext('2d'); if (!ctx) return;
    const pos = getPos(e, canvasRef.current);
    ctx.lineTo(pos.x, pos.y); ctx.stroke();
    e.preventDefault();
  };
  const stopDraw = () => { drawing.current = false; };
  const handleSave = async () => {
    if (!canvasRef.current) return; setSaving(true);
    try { await onSave(canvasRef.current.toDataURL('image/png')); setShowPad(false); }
    catch(e: any) { alert('Failed: ' + e.message); } finally { setSaving(false); }
  };

  if (existingUrl) return (
    <div>
      <img src={existingUrl} alt="Signature" style={{ maxHeight: 56, maxWidth: 200, objectFit: 'contain' }} />
      {signedAt && <div style={{ fontSize: 10, color: '#666', marginTop: 4, fontFamily: '"Times New Roman",serif', fontStyle: 'italic' }}>
        Signed {new Date(signedAt).toLocaleDateString('en-US', { year:'numeric', month:'long', day:'numeric' })}
      </div>}
    </div>
  );
  if (locked) return <div style={{ fontSize: 12, color: '#aaa', fontStyle: 'italic', fontFamily: '"Times New Roman",serif', padding: '12px 0' }}>Awaiting AYN AI signature first</div>;
  return (
    <div>
      {!showPad ? (
        <div style={{ border: '2px dashed #ccc', borderRadius: 8, padding: '24px 16px', textAlign: 'center', cursor: 'pointer', minHeight: 90, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fafafa' }}
          onClick={() => { setShowPad(true); setTimeout(initCanvas, 50); }}>
          <span style={{ fontSize: 14, color: '#aaa', fontFamily: '"Times New Roman",serif', fontStyle: 'italic' }}>Tap to sign</span>
        </div>
      ) : (
        <div>
          <canvas ref={canvasRef}
            style={{ width: '100%', height: 130, border: '1px solid #ddd', borderRadius: 8, background: '#fafafa', display: 'block', touchAction: 'none', cursor: 'crosshair' }}
            onMouseDown={startDraw} onMouseMove={draw} onMouseUp={stopDraw} onMouseLeave={stopDraw}
            onTouchStart={startDraw} onTouchMove={draw} onTouchEnd={stopDraw} />
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button onClick={() => { const ctx = canvasRef.current?.getContext('2d'); if (ctx && canvasRef.current) ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height); }}
              style={{ flex: 1, padding: '12px', border: '1px solid #ccc', background: 'white', borderRadius: 8, fontFamily: '"Times New Roman",serif', fontSize: 13, cursor: 'pointer' }}>Clear</button>
            <button onClick={handleSave} disabled={saving}
              style={{ flex: 2, padding: '12px', background: '#1a1a1a', color: 'white', border: 'none', borderRadius: 8, fontFamily: '"Times New Roman",serif', fontSize: 13, cursor: 'pointer', opacity: saving ? 0.6 : 1 }}>
              {saving ? 'Saving...' : 'Confirm Signature'}
            </button>
          </div>
          <p style={{ fontSize: 10, color: '#aaa', textAlign: 'center', marginTop: 8, fontFamily: '"Times New Roman",serif', fontStyle: 'italic' }}>By signing, you agree to be legally bound by this Agreement.</p>
        </div>
      )}
    </div>
  );
}

function nl2br(text: string | null): string {
  if (!text) return '';
  return text.replace(/\n/g, '<br/>');
}

export default function NDASign() {
  const { token } = useParams<{ token: string }>();
  const [searchParams] = useSearchParams();
  const isAdmin = searchParams.get('role') === 'admin';
  const isClient = !isAdmin;
  const [nda, setNda] = useState<NDA | null>(null);
  const [loading, setLoading] = useState(true);
  const [completed, setCompleted] = useState(false);

  const fetchNDA = useCallback(async () => {
    if (!token || token.length < 10) return; // strict token validation
    const { data, error } = await supabase.from('nda_agreements').select('*').eq('signing_token', token).single();
    if (error || !data) { setLoading(false); return; }
    setNda(data);
    if (data.admin_signature_url && data.client_signature_url) setCompleted(true);
    if (data.status === 'sent') await supabase.from('nda_agreements').update({ client_viewed_at: new Date().toISOString(), status: 'viewed' }).eq('signing_token', token);
    setLoading(false);
  }, [token]);

  useEffect(() => { fetchNDA(); }, [fetchNDA]);

  const saveSignature = async (dataUrl: string, party: 'admin' | 'client') => {
    if (!nda) return;
    const blob = await fetch(dataUrl).then(r => r.blob());
    const path = `signatures/nda_${nda.id}_${party}_${Date.now()}.png`;
    const { error: upErr } = await supabase.storage.from('generated-files').upload(path, blob, { contentType: 'image/png' });
    if (upErr) throw upErr;
    const { data: urlData } = supabase.storage.from('generated-files').getPublicUrl(path);
    const sigUrl = urlData.publicUrl;
    const now = new Date().toISOString();
    const updates: any = party === 'admin' ? { admin_signature_url: sigUrl, admin_signed_at: now } : { client_signature_url: sigUrl, client_signed_at: now, status: 'signed' };
    await supabase.from('nda_agreements').update(updates).eq('signing_token', token!);
    const updated = { ...nda, ...updates };
    setNda(updated);
    if (updated.admin_signature_url && updated.client_signature_url) {
      setCompleted(true);
    }
  };

  const F: React.CSSProperties = { fontFamily: '"Times New Roman", Times, serif' };
  if (loading) return <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'#f0ede8', ...F }}><p style={{ color:'#999' }}>Loading agreement...</p></div>;
  if (!nda) return <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'#f0ede8', ...F }}><p style={{ color:'#999' }}>This link is invalid or has expired.</p></div>;

  const ndaRef = `NDA-${nda.id.substring(0,8).toUpperCase()}`;
  const bothSigned = !!(nda.admin_signature_url && nda.client_signature_url);

  let articleNum = 1;

  return (
    <div style={{ background: '#f0ede8', minHeight: '100vh', padding: '16px 12px 48px' }}>
      <div style={{ position:'sticky', top:0, zIndex:50, background:'#1a1a1a', color:'white', display:'flex', alignItems:'center', justifyContent:'space-between', padding:'12px 16px', marginBottom:20, borderRadius:0 }}>
        <div style={{ display:'flex', alignItems:'center', gap:8, minWidth:0 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink:0 }}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
          <span style={{ fontSize:10, fontWeight:700, letterSpacing:1.5, textTransform:'uppercase', fontFamily:'Arial,sans-serif', whiteSpace:'nowrap' }}>Secure Legal Gateway</span>
        </div>
        <span style={{ fontSize:9, fontWeight:800, letterSpacing:1, textTransform:'uppercase', background: bothSigned ? '#2d6a4f' : '#c9a84c', color:'white', padding:'6px 14px', borderRadius:100, fontFamily:'Arial,sans-serif', flexShrink:0, marginLeft:8, whiteSpace:'nowrap' }}>
          {bothSigned ? '✓ Executed' : 'Action Required'}
        </span>
      </div>

      <div style={{ maxWidth:680, margin:'0 auto', background:'white', boxShadow:'0 4px 24px rgba(0,0,0,0.12)', color:'#1a1a1a', lineHeight:1.75, ...F }}>
        <div style={{ padding:'52px 52px 40px' }}>

          {/* Header - AYN text-based branding */}
          <div style={{ textAlign:'center', marginBottom:36, borderBottom:'3px double #1a1a1a', paddingBottom:28 }}>
            <div style={{ fontSize:52, fontWeight:900, letterSpacing:-2, lineHeight:1, fontFamily:"'Helvetica Neue',Arial,sans-serif", color:'#000', textAlign:'center' }}>
              AYN AI
            </div>
            <div style={{ marginTop:22, fontSize:20, fontWeight:700, letterSpacing:0.8, textTransform:'uppercase' }}>Non-Disclosure Agreement</div>
            <div style={{ fontSize:11, color:'#888', marginTop:4 }}>{ndaRef} · {new Date().toLocaleDateString('en-US', { year:'numeric', month:'long', day:'numeric' })}</div>
          </div>

          {/* Parties */}
          <div style={{ marginBottom:28 }}>
            <div style={{ fontSize:13, fontWeight:800, textTransform:'uppercase', letterSpacing:1, borderBottom:'1px solid #e0e0e0', paddingBottom:6, marginBottom:12, fontFamily:"'Helvetica Neue',Arial,sans-serif" }}>Article {articleNum++} — Parties</div>
            <div style={{ display:'flex', gap:24 }}>
              <div style={{ flex:1, fontSize:12 }}>
                <div style={{ fontWeight:700, marginBottom:2 }}>Disclosing Party</div>
                <div>AYN AI</div>
                <div style={{ color:'#666' }}>info@aynn.io</div>
              </div>
              <div style={{ flex:1, fontSize:12 }}>
                <div style={{ fontWeight:700, marginBottom:2 }}>Receiving Party</div>
                <div>{nda.company_name}</div>
                <div style={{ color:'#666' }}>{nda.contact_person}</div>
                <div style={{ color:'#666' }}>{nda.company_email}</div>
              </div>
            </div>
          </div>

          {/* Purpose */}
          {nda.nda_purpose && (
            <div style={{ marginBottom:28 }}>
              <div style={{ fontSize:13, fontWeight:800, textTransform:'uppercase', letterSpacing:1, borderBottom:'1px solid #e0e0e0', paddingBottom:6, marginBottom:10, fontFamily:"'Helvetica Neue',Arial,sans-serif" }}>Article {articleNum++} — Purpose</div>
              <div style={{ fontSize:12, color:'#333', lineHeight:1.85 }} dangerouslySetInnerHTML={{ __html: nl2br(nda.nda_purpose) }} />
            </div>
          )}

          {/* Confidential Information */}
          {nda.confidential_info && (
            <div style={{ marginBottom:28 }}>
              <div style={{ fontSize:13, fontWeight:800, textTransform:'uppercase', letterSpacing:1, borderBottom:'1px solid #e0e0e0', paddingBottom:6, marginBottom:10, fontFamily:"'Helvetica Neue',Arial,sans-serif" }}>Article {articleNum++} — Confidential Information</div>
              <div style={{ fontSize:12, color:'#333', lineHeight:1.85 }} dangerouslySetInnerHTML={{ __html: nl2br(nda.confidential_info) }} />
            </div>
          )}

          {/* Obligations */}
          {nda.obligations && (
            <div style={{ marginBottom:28 }}>
              <div style={{ fontSize:13, fontWeight:800, textTransform:'uppercase', letterSpacing:1, borderBottom:'1px solid #e0e0e0', paddingBottom:6, marginBottom:10, fontFamily:"'Helvetica Neue',Arial,sans-serif" }}>Article {articleNum++} — Obligations</div>
              <div style={{ fontSize:12, color:'#333', lineHeight:1.85 }} dangerouslySetInnerHTML={{ __html: nl2br(nda.obligations) }} />
            </div>
          )}

          {/* Exclusions */}
          {nda.exclusions && (
            <div style={{ marginBottom:28 }}>
              <div style={{ fontSize:13, fontWeight:800, textTransform:'uppercase', letterSpacing:1, borderBottom:'1px solid #e0e0e0', paddingBottom:6, marginBottom:10, fontFamily:"'Helvetica Neue',Arial,sans-serif" }}>Article {articleNum++} — Exclusions</div>
              <div style={{ fontSize:12, color:'#333', lineHeight:1.85 }} dangerouslySetInnerHTML={{ __html: nl2br(nda.exclusions) }} />
            </div>
          )}

          {/* Duration & Governing Law */}
          {(nda.duration || nda.governing_law) && (
            <div style={{ marginBottom:28 }}>
              <div style={{ fontSize:13, fontWeight:800, textTransform:'uppercase', letterSpacing:1, borderBottom:'1px solid #e0e0e0', paddingBottom:6, marginBottom:10, fontFamily:"'Helvetica Neue',Arial,sans-serif" }}>Article {articleNum++} — Term & Governing Law</div>
              <div style={{ fontSize:12, color:'#333', lineHeight:1.85 }}>
                {nda.duration && <p style={{ margin:'4px 0' }}><strong>Duration:</strong> {nda.duration}</p>}
                {nda.governing_law && <p style={{ margin:'4px 0' }}><strong>Governing Law:</strong> {nda.governing_law}</p>}
              </div>
            </div>
          )}

          {/* Additional Clauses */}
          {nda.additional_clauses && (
            <div style={{ marginBottom:28 }}>
              <div style={{ fontSize:13, fontWeight:800, textTransform:'uppercase', letterSpacing:1, borderBottom:'1px solid #e0e0e0', paddingBottom:6, marginBottom:10, fontFamily:"'Helvetica Neue',Arial,sans-serif" }}>Article {articleNum++} — Additional Provisions</div>
              <div style={{ fontSize:12, color:'#333', lineHeight:1.85 }} dangerouslySetInnerHTML={{ __html: nl2br(nda.additional_clauses) }} />
            </div>
          )}

          {/* Download button — shown when both signed */}
          {bothSigned && (
            <div style={{ margin:'32px 0' }}>
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
                  const [adminB64, clientB64] = await Promise.all([
                    toBase64(nda.admin_signature_url),
                    toBase64(nda.client_signature_url),
                  ]);
                  const adminSigHtml = adminB64
                    ? `<img src="${adminB64}" style="max-height:60px;max-width:200px;object-fit:contain;display:block;">`
                    : '<div style="height:60px;"></div>';
                  const clientSigHtml = clientB64
                    ? `<img src="${clientB64}" style="max-height:60px;max-width:200px;object-fit:contain;display:block;">`
                    : '<div style="height:60px;"></div>';
                  const adminDate = nda.admin_signed_at ? new Date(nda.admin_signed_at).toLocaleDateString('en-US',{year:'numeric',month:'long',day:'numeric'}) : '';
                  const clientDate = nda.client_signed_at ? new Date(nda.client_signed_at).toLocaleDateString('en-US',{year:'numeric',month:'long',day:'numeric'}) : '';
                  const today = new Date().toLocaleDateString('en-US',{year:'numeric',month:'long',day:'numeric'});

                  const sections = [
                    nda.nda_purpose ? `<div class="sec"><h3>Purpose</h3><p>${nda.nda_purpose}</p></div>` : '',
                    nda.confidential_info ? `<div class="sec"><h3>Confidential Information</h3><p>${nda.confidential_info}</p></div>` : '',
                    nda.obligations ? `<div class="sec"><h3>Obligations</h3><p>${nda.obligations}</p></div>` : '',
                    nda.exclusions ? `<div class="sec"><h3>Exclusions</h3><p>${nda.exclusions}</p></div>` : '',
                    nda.duration ? `<div class="sec"><h3>Term & Duration</h3><p>${nda.duration}</p></div>` : '',
                    nda.additional_clauses ? `<div class="sec"><h3>Additional Provisions</h3><p>${nda.additional_clauses}</p></div>` : '',
                    nda.governing_law ? `<div class="sec"><h3>Governing Law</h3><p>${nda.governing_law}</p></div>` : '',
                  ].join('');

                  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title> </title>
<style>
  @page{size:A4;margin:0}
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:'Times New Roman',Times,serif;color:#000;background:#fff;font-size:12pt;line-height:1.75;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  .wrap{max-width:760px;margin:0 auto;padding:18mm 18mm 18mm 18mm}
  .brand{text-align:center;padding-bottom:22px;margin-bottom:26px;border-bottom:2.5pt double #000;page-break-inside:avoid}
  .brand-name{font-size:42pt;font-weight:900;letter-spacing:-2pt;line-height:1;font-family:'Helvetica Neue',Arial,sans-serif;color:#000}
  .doc-title{font-size:13pt;font-weight:700;text-transform:uppercase;letter-spacing:1.5pt;margin-top:14px;font-family:'Helvetica Neue',Arial,sans-serif;color:#000}
  .doc-ref{font-size:9pt;color:#333;margin-top:5px;letter-spacing:.5px}
  .parties{display:grid;grid-template-columns:1fr 1fr;gap:28px;margin:22px 0 26px;padding:14px 0;border-top:1pt solid #bbb;border-bottom:1pt solid #bbb;page-break-inside:avoid}
  .party-label{font-size:8pt;font-weight:700;text-transform:uppercase;letter-spacing:2px;color:#000;margin-bottom:5px;font-family:'Helvetica Neue',Arial,sans-serif}
  .party-name{font-size:12pt;font-weight:700;color:#000}
  .party-info{font-size:10pt;color:#000;margin-top:2px}
  .sec{margin-bottom:22px;page-break-inside:avoid}
  .sec h3{font-size:9pt;font-weight:700;text-transform:uppercase;letter-spacing:2px;margin-bottom:8px;padding-bottom:5px;border-bottom:1pt solid #ccc;font-family:'Helvetica Neue',Arial,sans-serif;color:#000;page-break-after:avoid}
  .sec p{font-size:11pt;line-height:1.85;text-align:justify;color:#000}
  .witness{border-top:1pt solid #aaa;padding-top:16px;margin:24px 0;font-style:italic;font-size:11pt;color:#000;line-height:1.8;page-break-inside:avoid}
  .sig-grid{display:grid;grid-template-columns:1fr 1fr;gap:36px;margin-top:22px;page-break-inside:avoid}
  .sig-label{font-size:8pt;font-weight:700;text-transform:uppercase;letter-spacing:2px;color:#000;margin-bottom:10px;font-family:'Helvetica Neue',Arial,sans-serif}
  .sig-img{min-height:56px;border-bottom:1pt solid #000;margin-bottom:8px;padding-bottom:3px}
  .sig-name{font-size:11pt;font-weight:700;color:#000}
  .sig-title{font-size:10pt;color:#000}
  .sig-date{font-size:9pt;color:#333;font-style:italic;margin-top:3px}
  .footer{margin-top:36px;padding-top:10px;border-top:1pt solid #000;text-align:center;font-size:8.5pt;color:#000;letter-spacing:.5px;font-weight:600;page-break-inside:avoid}
</style>
</head><body>
<div class="wrap">
<div class="brand">
  <div class="brand-name">AYN AI</div>
  <div class="doc-title">Non-Disclosure Agreement</div>
  <div class="doc-ref">${ndaRef} &nbsp;&middot;&nbsp; ${today}</div>
</div>
<div class="parties">
  <div>
    <div class="party-label">Disclosing Party</div>
    <div class="party-name">AYN AI</div>
    <div class="party-info">Ghazi ALDhyaei</div>
    <div class="party-info">info&#64;aynn.io</div>
  </div>
  <div>
    <div class="party-label">Receiving Party</div>
    <div class="party-name">${nda.company_name}</div>
    <div class="party-info">${nda.contact_person}</div>
    <div class="party-info">${nda.company_email.replace('@','&#64;')}</div>
  </div>
</div>
${sections}
<div class="witness"><strong>IN WITNESS WHEREOF</strong>, the parties hereto have caused this Non-Disclosure Agreement to be executed as of the date first written above.</div>
<div class="sig-grid">
  <div>
    <div class="sig-label">Disclosing Party — AYN AI</div>
    <div class="sig-img">${adminSigHtml}</div>
    <div class="sig-name">Ghazi ALDhyaei</div>
    <div class="sig-title">Founder & CEO, AYN AI</div>
    <div class="sig-date">${adminDate ? 'Signed: ' + adminDate : ''}</div>
  </div>
  <div>
    <div class="sig-label">Receiving Party — ${nda.company_name}</div>
    <div class="sig-img">${clientSigHtml}</div>
    <div class="sig-name">${nda.contact_person}</div>
    <div class="sig-title">Authorized Representative</div>
    <div class="sig-date">${clientDate ? 'Signed: ' + clientDate : ''}</div>
  </div>
</div>
<div class="footer">${ndaRef} &nbsp;&middot;&nbsp; &copy; ${new Date().getFullYear()} AYN AI &nbsp;&middot;&nbsp; This document is confidential</div>
</div>
</body></html>`;

                  // Use hidden iframe — works on mobile Safari where window.open is blocked
                  const iframe = document.createElement('iframe');
                  iframe.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;border:none;z-index:9999;background:white;';
                  document.body.appendChild(iframe);
                  const doc = iframe.contentDocument || iframe.contentWindow?.document;
                  if (doc) {
                    doc.open(); doc.write(html); doc.close();
                    setTimeout(() => {
                      iframe.contentWindow?.focus();
                      iframe.contentWindow?.print();
                      // Remove iframe after print dialog closes
                      setTimeout(() => document.body.removeChild(iframe), 2000);
                    }, 500);
                  }
                }}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                  width: '100%', background: '#16a34a', color: 'white', border: 'none',
                  borderRadius: 10, padding: '16px 24px', fontSize: 15,
                  fontWeight: 700, cursor: 'pointer', fontFamily: "'Helvetica Neue', Arial, sans-serif",
                }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
                </svg>
                Download Signed Agreement
              </button>
            </div>
          )}

          {/* Signatures */}
          <div style={{ marginTop:36 }}>
            <div style={{ fontSize:13, fontWeight:800, textTransform:'uppercase', letterSpacing:1, borderBottom:'1px solid #e0e0e0', paddingBottom:6, marginBottom:16, fontFamily:"'Helvetica Neue',Arial,sans-serif" }}>Signatures</div>
            <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
              {/* AYN AI box */}
              <div style={{ border:'1px solid #eee', borderRadius:6, padding:16, opacity: isClient && !nda.admin_signature_url ? 0.45 : 1 }}>
                <div style={{ fontSize:10, fontWeight:700, textTransform:'uppercase', letterSpacing:1.5, color:'#999', marginBottom:10, fontFamily:"'Helvetica Neue',Arial,sans-serif" }}>AYN AI — Disclosing Party</div>
                {isAdmin
                  ? <SignaturePad key={`admin-${nda.id}`} onSave={(d) => saveSignature(d, 'admin')} existingUrl={nda.admin_signature_url} signedAt={nda.admin_signed_at} />
                  : nda.admin_signature_url
                    ? <div><img src={nda.admin_signature_url} style={{ maxHeight:56, maxWidth:180, objectFit:'contain', display:'block' }} /><div style={{ fontSize:10, color:'#aaa', marginTop:4 }}>Ghazi ALDhyaei · Founder & CEO</div></div>
                    : <div style={{ fontSize:11, color:'#aaa', fontStyle:'italic', padding:'8px 0' }}>Pending AYN AI signature</div>
                }
              </div>
              {/* Client box */}
              <div style={{ border:'1px solid #eee', borderRadius:6, padding:16 }}>
                <div style={{ fontSize:10, fontWeight:700, textTransform:'uppercase', letterSpacing:1.5, color:'#999', marginBottom:10, fontFamily:"'Helvetica Neue',Arial,sans-serif" }}>{nda.company_name} — Receiving Party</div>
                {isClient
                  ? <SignaturePad key={`client-${nda.id}`} onSave={(d) => saveSignature(d, 'client')} existingUrl={nda.client_signature_url} signedAt={nda.client_signed_at} locked={!nda.admin_signature_url} />
                  : nda.client_signature_url
                    ? <div><img src={nda.client_signature_url} style={{ maxHeight:56, maxWidth:180, objectFit:'contain', display:'block' }} /><div style={{ fontSize:10, color:'#aaa', marginTop:4 }}>{nda.contact_person} · Authorized Representative</div></div>
                    : <div style={{ fontSize:11, color:'#aaa', fontStyle:'italic', padding:'8px 0' }}>Awaiting client signature</div>
                }
              </div>
            </div>
          </div>

          {/* Footer */}
          <div style={{ textAlign:'center', marginTop:40, paddingTop:16, borderTop:'1px solid #eee' }}>
            <div style={{ fontSize:10, color:'#bbb', letterSpacing:0.5 }}>© {new Date().getFullYear()} AYN AI · This document is confidential</div>
          </div>
        </div>
      </div>
    </div>
  );
}
