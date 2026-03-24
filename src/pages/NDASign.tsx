import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { SUPABASE_ANON_KEY } from '@/config';
import { cn } from '@/lib/utils';
import { CheckCircle, ChevronDown, PenTool } from 'lucide-react';

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

export default function NDASign() {
  const { token } = useParams<{ token: string }>();
  const [nda, setNda] = useState<NDA | null>(null);
  const [loading, setLoading] = useState(true);
  const [signed, setSigned] = useState(false);
  const [signing, setSigning] = useState(false);
  const [showPad, setShowPad] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);

  const fetchNDA = useCallback(async () => {
    if (!token) return;
    const { data, error } = await supabase
      .from('nda_agreements').select('*').eq('signing_token', token).single();
    if (error || !data) { setLoading(false); return; }
    setNda(data);
    if (data.client_signature_url) setSigned(true);
    if (data.status === 'sent' || data.status === 'viewed') {
      await supabase.from('nda_agreements')
        .update({ client_viewed_at: new Date().toISOString(), status: data.status === 'sent' ? 'viewed' : data.status })
        .eq('signing_token', token);
    }
    setLoading(false);
  }, [token]);

  useEffect(() => { fetchNDA(); }, [fetchNDA]);

  const initCanvas = () => {
    const c = canvasRef.current; if (!c) return;
    const ctx = c.getContext('2d'); if (!ctx) return;
    c.width = c.offsetWidth * 2; c.height = c.offsetHeight * 2;
    ctx.scale(2, 2);
    ctx.strokeStyle = '#0a0a0a'; ctx.lineWidth = 2.5; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  };

  const getPos = (e: React.MouseEvent | React.TouchEvent, canvas: HTMLCanvasElement) => {
    const rect = canvas.getBoundingClientRect();
    if ('touches' in e) return { x: e.touches[0].clientX - rect.left, y: e.touches[0].clientY - rect.top };
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

  const handleSign = async () => {
    if (!nda || !canvasRef.current) return;
    setSigning(true);
    try {
      const dataUrl = canvasRef.current.toDataURL('image/png');
      const blob = await fetch(dataUrl).then(r => r.blob());
      const path = `signatures/nda_${nda.id}_${Date.now()}.png`;
      const { error: upErr } = await supabase.storage.from('generated-files').upload(path, blob, { contentType: 'image/png' });
      if (upErr) throw upErr;
      const { data: urlData } = supabase.storage.from('generated-files').getPublicUrl(path);
      const { error: updateErr } = await supabase.from('nda_agreements')
        .update({ client_signature_url: urlData.publicUrl, client_signed_at: new Date().toISOString(), status: 'signed' })
        .eq('signing_token', token);
      if (updateErr) throw updateErr;
      setNda(n => n ? { ...n, client_signature_url: urlData.publicUrl, client_signed_at: new Date().toISOString() } : n);
      setSigned(true); setShowPad(false);
    } catch (e: any) {
      alert('Failed to save signature: ' + e.message);
    } finally { setSigning(false); }
  };

  function cleanText(text: string): string {
    if (!text) return '';
    return text.split('\n')
      .filter(l => !l.match(/^\s*[|\-]{2,}/))
      .map(l => l.replace(/#{1,6}\s/g,'').replace(/\*\*/g,'').replace(/[\x60]/g,'').replace(/\|/g,' · ').trim())
      .filter(l => l.length > 0).join('\n');
  }

  if (loading) return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
      <div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
    </div>
  );

  if (!nda) return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
      <div className="text-center"><div className="text-white text-lg font-bold mb-2">NDA Not Found</div>
      <div className="text-zinc-500 text-sm">This link may be invalid or expired.</div></div>
    </div>
  );

  const ndaRef = `NDA-${nda.id.substring(0,8).toUpperCase()}`;
  const today = new Date().toLocaleDateString('en-US', { year:'numeric', month:'long', day:'numeric' });

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      {/* Header */}
      <div className="bg-zinc-900 text-white px-6 py-4 flex items-center justify-between sticky top-0 z-20">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path d="M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M15 13a4.5 4.5 0 0 1-3-4 4.5 4.5 0 0 1-3 4" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <div>
            <div className="font-black text-base leading-tight">AYN</div>
            <div className="text-[9px] uppercase tracking-widest opacity-40">Non-Disclosure Agreement</div>
          </div>
        </div>
        {signed ? (
          <span className="flex items-center gap-1.5 bg-emerald-500/20 text-emerald-400 text-xs font-semibold px-3 py-1.5 rounded-full border border-emerald-500/30">
            <CheckCircle className="w-3 h-3" /> Signed
          </span>
        ) : (
          <span className="text-xs text-zinc-500">{ndaRef}</span>
        )}
      </div>

      <div className="max-w-lg mx-auto px-4 py-6 space-y-4">
        {/* Signed success */}
        {signed && (
          <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-2xl p-6 text-center">
            <div className="text-3xl mb-2">✅</div>
            <div className="text-emerald-400 font-bold text-lg">You've signed this NDA</div>
            <div className="text-emerald-600 dark:text-emerald-500 text-sm mt-1">
              Signed on {nda.client_signed_at ? new Date(nda.client_signed_at).toLocaleDateString('en-US',{year:'numeric',month:'long',day:'numeric'}) : today}
            </div>
          </div>
        )}

        {/* Parties */}
        <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden">
          <div className="px-5 py-3.5 border-b border-zinc-100 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/50">
            <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">Agreement Between</span>
          </div>
          <div className="grid grid-cols-2 gap-px bg-zinc-100 dark:bg-zinc-800">
            <div className="bg-white dark:bg-zinc-900 p-4">
              <div className="text-[9px] font-bold uppercase tracking-widest text-zinc-400 mb-2">Disclosing Party</div>
              <div className="font-bold text-zinc-900 dark:text-zinc-100">AYN AI</div>
            </div>
            <div className="bg-white dark:bg-zinc-900 p-4">
              <div className="text-[9px] font-bold uppercase tracking-widest text-zinc-400 mb-2">Receiving Party</div>
              <div className="font-bold text-zinc-900 dark:text-zinc-100">{nda.company_name}</div>
              <div className="text-xs text-zinc-500 mt-1">{nda.contact_person}</div>
            </div>
          </div>
        </div>

        {/* NDA Sections */}
        {[
          { label: 'Purpose', value: nda.nda_purpose },
          { label: 'Confidential Information', value: nda.confidential_info },
          { label: 'Obligations', value: nda.obligations },
          { label: 'Exclusions', value: nda.exclusions },
          { label: 'Duration', value: nda.duration },
          { label: 'Additional Clauses', value: nda.additional_clauses },
          { label: 'Governing Law', value: nda.governing_law },
        ].filter(s => s.value).map(section => (
          <details key={section.label} className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden group">
            <summary className="px-5 py-3.5 flex items-center justify-between cursor-pointer list-none">
              <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{section.label}</span>
              <ChevronDown className="w-4 h-4 text-zinc-400 group-open:rotate-180 transition-transform" />
            </summary>
            <div className="px-5 pb-5 text-xs text-zinc-500 dark:text-zinc-400 whitespace-pre-wrap leading-relaxed border-t border-zinc-100 dark:border-zinc-800 pt-4">
              {cleanText(section.value!)}
            </div>
          </details>
        ))}

        {/* Signatures */}
        <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden">
          <div className="px-5 py-3.5 border-b border-zinc-100 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/50">
            <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">Signatures</span>
          </div>
          <div className="bg-white dark:bg-zinc-900 p-4">
            <div className="text-[9px] font-bold uppercase tracking-widest text-zinc-400 mb-3">{nda.contact_person} · Receiving Party</div>
            <div className={cn('rounded-xl border-2 h-20 flex items-center justify-center mb-3 overflow-hidden',
              signed ? 'border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-900/20' : 'border-dashed border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/10')}>
              {signed && nda.client_signature_url
                ? <img src={nda.client_signature_url} alt="Signature" className="max-h-16 max-w-full object-contain" />
                : <span className="text-xs text-amber-600 dark:text-amber-400 font-medium italic">Your signature here</span>}
            </div>
            <div className={cn('text-[10px] font-semibold', signed ? 'text-emerald-600' : 'text-amber-600')}>
              {signed ? `✓ Signed ${nda.client_signed_at ? new Date(nda.client_signed_at).toLocaleDateString() : ''}` : '⚠ Awaiting your signature'}
            </div>
          </div>
        </div>

        {/* Sign pad */}
        {!signed && (
          <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden">
            <div className="px-5 py-3.5 border-b border-zinc-100 dark:border-zinc-800">
              <div className="flex items-center gap-2">
                <PenTool className="w-4 h-4 text-zinc-400" />
                <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Sign the NDA</span>
              </div>
              <div className="text-xs text-zinc-500 mt-0.5">Draw your signature in the box below</div>
            </div>
            <div className="p-4 space-y-3">
              {!showPad ? (
                <button onClick={() => { setShowPad(true); setTimeout(initCanvas, 50); }}
                  className="w-full bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 font-bold py-4 rounded-2xl text-sm">
                  ✍️ Sign this NDA
                </button>
              ) : (
                <>
                  <canvas ref={canvasRef}
                    className="w-full h-36 border-2 border-dashed border-zinc-300 dark:border-zinc-600 rounded-xl bg-zinc-50 dark:bg-zinc-800 touch-none cursor-crosshair"
                    onMouseDown={startDraw} onMouseMove={draw} onMouseUp={stopDraw} onMouseLeave={stopDraw}
                    onTouchStart={startDraw} onTouchMove={draw} onTouchEnd={stopDraw} />
                  <div className="flex gap-2">
                    <button onClick={() => { const ctx = canvasRef.current?.getContext('2d'); if (ctx && canvasRef.current) { ctx.clearRect(0,0,canvasRef.current.width, canvasRef.current.height); } }}
                      className="flex-1 border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 py-3 rounded-xl text-sm font-medium">
                      Clear
                    </button>
                    <button onClick={handleSign} disabled={signing}
                      className="flex-2 flex-1 bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 py-3 rounded-xl text-sm font-bold disabled:opacity-50">
                      {signing ? 'Saving...' : 'Submit Signature'}
                    </button>
                  </div>
                  <p className="text-xs text-zinc-400 text-center">By signing, you agree to the terms of this Non-Disclosure Agreement.</p>
                </>
              )}
            </div>
          </div>
        )}

        <div className="text-center text-xs text-zinc-400 pb-8">
          {ndaRef} · © {new Date().getFullYear()} AYN AI · aynn.io
        </div>
      </div>
    </div>
  );
}
