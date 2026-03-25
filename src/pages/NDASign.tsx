import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams } from 'react-router-dom';
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
  status: string; signing_token: string;
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
    catch(e: any) { alert('Failed: ' + e.message); } finally { setSaving(false); }
  };

  if (existingUrl) return (
    <div>
      <img src={existingUrl} alt="Signature" style={{ maxHeight: 54, maxWidth: 190, objectFit: 'contain' }} />
      {signedAt && <div style={{ fontSize: 10, color: '#666', marginTop: 3, fontFamily: '"Times New Roman",serif', fontStyle: 'italic' }}>
        Signed {new Date(signedAt).toLocaleDateString('en-US', { year:'numeric', month:'long', day:'numeric' })}
      </div>}
    </div>
  );
  if (locked) return <div style={{ fontSize: 11, color: '#aaa', fontStyle: 'italic', fontFamily: '"Times New Roman",serif', padding: '8px 0' }}>Awaiting AYN AI signature first</div>;
  return (
    <div>
      {!showPad ? (
        <div style={{ border: '1px dashed #bbb', borderRadius: 3, padding: '12px 16px', textAlign: 'center', cursor: 'pointer', minHeight: 60, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => { setShowPad(true); setTimeout(initCanvas, 50); }}>
          <span style={{ fontSize: 12, color: '#aaa', fontFamily: '"Times New Roman",serif', fontStyle: 'italic' }}>Click to sign</span>
        </div>
      ) : (
        <div>
          <canvas ref={canvasRef} style={{ width: '100%', height: 90, border: '1px solid #ddd', borderRadius: 3, background: '#fafafa', display: 'block', touchAction: 'none', cursor: 'crosshair' }}
            onMouseDown={startDraw} onMouseMove={draw} onMouseUp={stopDraw} onMouseLeave={stopDraw}
            onTouchStart={startDraw} onTouchMove={draw} onTouchEnd={stopDraw} />
          <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
            <button onClick={() => { const ctx = canvasRef.current?.getContext('2d'); if (ctx && canvasRef.current) ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height); }}
              style={{ flex: 1, padding: '5px 10px', border: '1px solid #ccc', background: 'white', borderRadius: 3, fontFamily: '"Times New Roman",serif', fontSize: 11, cursor: 'pointer' }}>Clear</button>
            <button onClick={handleSave} disabled={saving}
              style={{ flex: 2, padding: '5px 10px', background: '#1a1a1a', color: 'white', border: 'none', borderRadius: 3, fontFamily: '"Times New Roman",serif', fontSize: 11, cursor: 'pointer', opacity: saving ? 0.6 : 1 }}>
              {saving ? 'Saving...' : 'Confirm Signature'}
            </button>
          </div>
          <p style={{ fontSize: 10, color: '#aaa', textAlign: 'center', marginTop: 5, fontFamily: '"Times New Roman",serif', fontStyle: 'italic' }}>By signing, you agree to be legally bound by this Agreement.</p>
        </div>
      )}
    </div>
  );
}

export default function NDASign() {
  const { token } = useParams<{ token: string }>();
  const [nda, setNda] = useState<NDA | null>(null);
  const [loading, setLoading] = useState(true);
  const [completing, setCompleting] = useState(false);
  const [completed, setCompleted] = useState(false);

  const fetchNDA = useCallback(async () => {
    if (!token) return;
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
    await supabase.from('nda_agreements').update(updates).eq('signing_token', token);
    const updated = { ...nda, ...updates };
    setNda(updated);
    if (updated.admin_signature_url && updated.client_signature_url) {
      setCompleting(true);
      try {
        await fetch(`${SUPABASE_URL}/functions/v1/send-nda-completion`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` },
          body: JSON.stringify({ ndaId: nda.id }),
        });
        setCompleted(true);
      } finally { setCompleting(false); }
    }
  };

  const F: React.CSSProperties = { fontFamily: '"Times New Roman", Times, serif' };
  if (loading) return <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'#f0ede8', ...F }}><p style={{ color:'#999' }}>Loading agreement...</p></div>;
  if (!nda) return <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'#f0ede8', ...F }}><p style={{ color:'#999' }}>This link is invalid or has expired.</p></div>;

  const ndaRef = `NDA-${nda.id.substring(0,8).toUpperCase()}`;
  const bothSigned = !!(nda.admin_signature_url && nda.client_signature_url);

  return (
    <div style={{ background: '#f0ede8', minHeight: '100vh', padding: '16px 12px 48px' }}>
      <div style={{ position:'sticky', top:0, zIndex:50, background:'#1a1a1a', color:'white', display:'flex', alignItems:'center', justifyContent:'space-between', padding:'10px 16px', marginBottom:20, borderRadius:6 }}>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <span>🛡️</span>
          <span style={{ fontSize:11, fontWeight:700, letterSpacing:2, textTransform:'uppercase', fontFamily:'Arial,sans-serif' }}>Secure Legal Gateway</span>
        </div>
        <span style={{ fontSize:10, fontWeight:700, letterSpacing:1.5, textTransform:'uppercase', background: bothSigned ? '#2d6a4f' : '#c9a84c', color:'white', padding:'4px 10px', borderRadius:20, fontFamily:'Arial,sans-serif' }}>
          {bothSigned ? '✓ Executed' : 'Action Required'}
        </span>
      </div>

      <div style={{ maxWidth:680, margin:'0 auto', background:'white', boxShadow:'0 4px 24px rgba(0,0,0,0.12)', color:'#1a1a1a', lineHeight:1.75, ...F }}>
        <div style={{ padding:'52px 52px 40px' }}>

          <div style={{ textAlign:'center', marginBottom:36, borderBottom:'2px solid #1a1a1a', paddingBottom:28 }}>
            <div style={{ width:52, height:52, border:'2px solid #1a1a1a', borderRadius:10, display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 16px', fontSize:22 }}>🧠</div>
            <h1 style={{ fontSize:20, fontWeight:700, letterSpacing:2, textTransform:'uppercase', margin:0, lineHeight:1.4, ...F }}>Mutual Non-Disclosure<br />Agreement</h1>
            <div style={{ marginTop:12, fontSize:11, color:'#666', letterSpacing:1, textTransform:'uppercase' }}>Reference ID: {ndaRef}</div>
            <div style={{ fontSize:11, color:'#666', letterSpacing:1, textTransform:'uppercase' }}>Effective Date: Upon Execution by Both Parties</div>
          </div>

          <p style={{ fontSize:13, textAlign:'justify', marginBottom:20, ...F }}>This Mutual Non-Disclosure Agreement (the <strong>"Agreement"</strong>) is entered into as of the Effective Date, by and between:</p>

          <div style={{ borderLeft:'3px solid #1a1a1a', paddingLeft:20, marginBottom:28 }}>
            <div style={{ marginBottom:14 }}>
              <div style={{ fontSize:10, fontWeight:700, letterSpacing:1.5, textTransform:'uppercase', color:'#666', marginBottom:3 }}>Disclosing Party</div>
              <div style={{ fontSize:14, fontWeight:700 }}>AYN AI</div>
              <div style={{ fontSize:13 }}>Represented by Ghazi ALDhyaei</div>
              <div style={{ fontSize:12, color:'#666', fontStyle:'italic' }}>ghazi@aynn.io</div>
            </div>
            <div>
              <div style={{ fontSize:10, fontWeight:700, letterSpacing:1.5, textTransform:'uppercase', color:'#666', marginBottom:3 }}>Receiving Party</div>
              <div style={{ fontSize:14, fontWeight:700 }}>{nda.company_name}</div>
              <div style={{ fontSize:13 }}>Represented by {nda.contact_person}</div>
              <div style={{ fontSize:12, color:'#666', fontStyle:'italic' }}>{nda.company_email}</div>
            </div>
          </div>

          <p style={{ fontSize:13, textAlign:'justify', marginBottom:28, ...F }}>The parties wish to explore a potential business relationship in connection with the Purpose outlined below. In connection with this opportunity, each party may disclose to the other certain confidential technical and business information.</p>

          {[
            { n:'1', t:'PURPOSE OF DISCLOSURE', v:nda.nda_purpose },
            { n:'2', t:'DEFINITION OF CONFIDENTIAL INFORMATION', v:nda.confidential_info },
            { n:'3', t:'OBLIGATIONS OF THE RECEIVING PARTY', v:nda.obligations },
            { n:'4', t:'EXCLUSIONS FROM CONFIDENTIAL INFORMATION', v:nda.exclusions },
            { n:'5', t:'TERM AND DURATION', v:nda.duration },
            { n:'6', t:'ADDITIONAL PROVISIONS', v:nda.additional_clauses },
            { n:'7', t:'GOVERNING LAW AND JURISDICTION', v:nda.governing_law },
          ].filter(s => s.v).map(s => (
            <div key={s.n} style={{ marginBottom:24 }}>
              <h3 style={{ fontSize:13, fontWeight:700, textTransform:'uppercase', letterSpacing:0.5, marginBottom:8, marginTop:0, ...F }}>{s.n}. {s.t}</h3>
              <p style={{ fontSize:13, textAlign:'justify', margin:0, paddingLeft:18, borderLeft:'1px solid #e0e0e0', ...F }}>{s.v}</p>
            </div>
          ))}

          <div style={{ borderTop:'1px solid #ccc', paddingTop:20, marginTop:32, marginBottom:32 }}>
            <p style={{ fontSize:13, fontStyle:'italic', textAlign:'justify', margin:0, ...F }}>
              <strong>IN WITNESS WHEREOF</strong>, the parties hereto have caused this Mutual Non-Disclosure Agreement to be executed as of the date first written above by their duly authorized representatives. By digitally signing below, the parties confirm their agreement to be legally bound by these terms.
            </p>
          </div>

          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:28 }}>
            <div>
              <div style={{ fontSize:10, fontWeight:700, letterSpacing:1.5, textTransform:'uppercase', color:'#666', marginBottom:10 }}>Disclosing Party</div>
              <div style={{ borderBottom:'1px solid #1a1a1a', minHeight:76, paddingBottom:8, marginBottom:8 }}>
                <SignaturePad existingUrl={nda.admin_signature_url} signedAt={nda.admin_signed_at} onSave={async (d) => await saveSignature(d, 'admin')} />
              </div>
              <div style={{ fontSize:13, fontWeight:700, ...F }}>AYN AI Services</div>
              <div style={{ fontSize:12, ...F }}>Name: Ghazi ALDhyaei</div>
              <div style={{ fontSize:12, ...F }}>Title: Founder &amp; CEO</div>
              <div style={{ fontSize:11, color:'#aaa', fontStyle:'italic', marginTop:3, ...F }}>
                {nda.admin_signed_at ? `Signed: ${new Date(nda.admin_signed_at).toLocaleDateString('en-US',{year:'numeric',month:'long',day:'numeric'})}` : 'Timestamp: Pending Execution'}
              </div>
            </div>
            <div>
              <div style={{ fontSize:10, fontWeight:700, letterSpacing:1.5, textTransform:'uppercase', color:'#666', marginBottom:10 }}>Receiving Party</div>
              <div style={{ borderBottom:'1px solid #1a1a1a', minHeight:76, paddingBottom:8, marginBottom:8 }}>
                <SignaturePad existingUrl={nda.client_signature_url} signedAt={nda.client_signed_at} locked={!nda.admin_signature_url} onSave={async (d) => await saveSignature(d, 'client')} />
              </div>
              <div style={{ fontSize:13, fontWeight:700, ...F }}>{nda.company_name}</div>
              <div style={{ fontSize:12, ...F }}>Name: {nda.contact_person}</div>
              <div style={{ fontSize:12, ...F }}>Title: Authorized Representative</div>
              <div style={{ fontSize:11, color:'#aaa', fontStyle:'italic', marginTop:3, ...F }}>
                {nda.client_signed_at ? `Signed: ${new Date(nda.client_signed_at).toLocaleDateString('en-US',{year:'numeric',month:'long',day:'numeric'})}` : 'Timestamp: Pending Execution'}
              </div>
            </div>
          </div>

          {(bothSigned || completing || completed) && (
            <div style={{ marginTop:28, background:'#f0f7f0', border:'1px solid #2d6a4f', borderRadius:6, padding:16, textAlign:'center' }}>
              <div style={{ fontSize:14, fontWeight:700, color:'#2d6a4f', ...F }}>✓ Agreement Fully Executed</div>
              <div style={{ fontSize:12, color:'#555', marginTop:4, ...F }}>
                {completing ? 'Generating signed copy and sending to both parties...' : 'A signed copy has been emailed to both parties.'}
              </div>
            </div>
          )}

          <div style={{ borderTop:'1px solid #eee', marginTop:36, paddingTop:12, textAlign:'center' }}>
            <div style={{ fontSize:10, color:'#ccc', letterSpacing:0.5 }}>{ndaRef} · © {new Date().getFullYear()} AYN AI · aynn.io · Legally Binding Agreement</div>
          </div>
        </div>
      </div>
    </div>
  );
}
