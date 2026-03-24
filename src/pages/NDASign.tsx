import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { SUPABASE_ANON_KEY } from '@/config';
import { cn } from '@/lib/utils';
import { CheckCircle, ChevronDown, PenTool, Shield } from 'lucide-react';
import { Button } from '@/components/ui/button';

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
    <div className="min-h-screen bg-zinc-200/50 dark:bg-zinc-950 py-8 px-4 sm:px-6 lg:px-8 font-serif selection:bg-amber-100">
      
      {/* Sticky Banner - Status */}
      <div className="fixed top-0 left-0 right-0 bg-zinc-900 border-b border-zinc-800 text-white px-6 py-2.5 flex items-center justify-between z-30 font-sans shadow-md">
        <div className="flex items-center gap-3">
          <div className="w-6 h-6 rounded-md bg-white/10 flex items-center justify-center">
            <Shield className="w-3.5 h-3.5 text-zinc-300" />
          </div>
          <span className="text-xs font-semibold tracking-wide uppercase opacity-90">Secure Legal Gateway</span>
        </div>
        <div>
          {signed ? (
            <span className="flex items-center gap-1.5 bg-emerald-500/20 text-emerald-400 text-[10px] sm:text-xs font-bold px-3 py-1 rounded-full border border-emerald-500/30 uppercase tracking-widest">
              <CheckCircle className="w-3 h-3" /> Fully Executed
            </span>
          ) : (
            <span className="flex items-center gap-1.5 bg-amber-500/20 text-amber-400 text-[10px] sm:text-xs font-bold px-3 py-1 rounded-full border border-amber-500/30 uppercase tracking-widest">
              Action Required
            </span>
          )}
        </div>
      </div>

      <div className="max-w-[800px] mx-auto mt-10 bg-white shadow-2xl border border-zinc-300 rounded-sm relative text-zinc-900">
        
        {/* Paper texture subtle overlay */}
        <div className="absolute inset-0 pointer-events-none opacity-[0.02]" style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=%220 0 200 200%22 xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cfilter id=%22noiseFilter%22%3E%3CfeTurbulence type=%22fractalNoise%22 baseFrequency=%220.85%22 numOctaves=%223%22 stitchTiles=%22stitch%22/%3E%3C/filter%3E%3Crect width=%22100%25%22 height=%22100%25%22 filter=%22url(%23noiseFilter)%22/%3E%3C/svg%3E")' }}></div>

        <div className="px-8 py-12 sm:px-16 sm:py-16 relative z-10">
          
          {/* Legal Header */}
          <div className="text-center mb-12 border-b-2 border-zinc-900 pb-8">
            <div className="mb-6 flex justify-center">
               <div className="w-12 h-12 border border-zinc-900 flex items-center justify-center p-2 rounded-sm bg-zinc-50">
                 <svg width="100%" height="100%" viewBox="0 0 24 24" fill="none" className="text-zinc-900">
                   <path d="M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z" stroke="currentColor" strokeWidth="2" strokeLinecap="square" />
                   <path d="M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z" stroke="currentColor" strokeWidth="2" strokeLinecap="square" />
                   <path d="M15 13a4.5 4.5 0 0 1-3-4 4.5 4.5 0 0 1-3 4" stroke="currentColor" strokeWidth="2" strokeLinecap="square" />
                 </svg>
               </div>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold uppercase tracking-widest text-zinc-900 mb-2 font-sans">
              MUTUAL NON-DISCLOSURE AGREEMENT
            </h1>
            <p className="text-sm text-zinc-500 uppercase tracking-widest font-sans font-semibold mt-4">
              Reference Id: {ndaRef}
            </p>
            <p className="text-sm text-zinc-500 uppercase tracking-widest font-sans mt-1">
              Effective Date: {nda.client_signed_at ? new Date(nda.client_signed_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : 'Upon execution by both parties'}
            </p>
          </div>

          {/* Preamble */}
          <div className="mb-10 text-sm sm:text-base leading-loose text-justify text-zinc-800">
            <p className="indent-8">
              This Mutual Non-Disclosure Agreement (the <span className="font-bold">"Agreement"</span>) is entered into as of the Effective Date, by and between:
            </p>
            <div className="my-6 pl-8 border-l-4 border-zinc-200 space-y-4 font-sans text-sm">
              <p>
                <span className="font-bold tracking-wider text-zinc-900 uppercase text-xs block mb-0.5">Disclosing Party</span>
                <span className="font-semibold text-base text-zinc-900">AYN AI</span><br/>
                <span className="text-zinc-600">Represented by Authorized Signatory</span>
              </p>
              <p>
                <span className="font-bold tracking-wider text-zinc-900 uppercase text-xs block mb-0.5">Receiving Party</span>
                <span className="font-semibold text-base text-zinc-900">{nda.company_name}</span><br/>
                <span className="text-zinc-600">Represented by {nda.contact_person}</span><br/>
                <span className="text-zinc-500 italic">{nda.company_email}</span>
              </p>
            </div>
            <p className="indent-8">
              The parties wish to explore a potential business relationship in connection with the Purpose outlined below. In connection with this opportunity, each party may disclose to the other certain confidential technical and business information format.
            </p>
          </div>

          {/* Legal Clauses */}
          <div className="space-y-8 text-sm sm:text-base leading-relaxed text-justify text-zinc-800 font-serif">
            {[
              { label: '1. Purpose of Disclosure', value: nda.nda_purpose },
              { label: '2. Definition of Confidential Information', value: nda.confidential_info },
              { label: '3. Obligations of the Receiving Party', value: nda.obligations },
              { label: '4. Exclusions from Confidential Information', value: nda.exclusions },
              { label: '5. Term and Duration', value: nda.duration },
              { label: '6. Additional Provisions', value: nda.additional_clauses },
              { label: '7. Governing Law and Jurisdiction', value: nda.governing_law },
            ].filter(s => s.value).map((section, idx) => (
              <section key={idx} className="page-break-inside-avoid">
                <h2 className="font-bold text-zinc-900 mb-2 font-sans tracking-wide uppercase text-sm sm:text-base">
                  {section.label}
                </h2>
                <div className="pl-4">
                  {cleanText(section.value!).split('\n').map((paragraph, i) => (
                    <p key={i} className="mb-3">{paragraph}</p>
                  ))}
                </div>
              </section>
            ))}
          </div>

          {/* Binding Clause */}
          <div className="mt-12 mb-10 text-justify text-sm leading-relaxed text-zinc-700 italic border-t border-zinc-200 pt-8">
            IN WITNESS WHEREOF, the parties hereto have caused this Mutual Non-Disclosure Agreement to be executed as of the date first written above by their duly authorized representatives. By digitally signing below, the parties confirm their agreement to be legally bound by these terms.
          </div>

          {/* Signatures Area */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-12 font-sans">
            
            {/* Disclosing Party (AYN AI) */}
            <div>
              <p className="font-bold text-xs tracking-widest uppercase text-zinc-400 mb-8 border-b border-zinc-200 pb-2">Disclosing Party</p>
              
              <div className="h-24 flex items-end mb-2">
                <div className="w-full border-b border-zinc-400 pb-2 text-zinc-900 text-2xl font-[signature] italic opacity-80 select-none">
                  AYN AI Services
                </div>
              </div>
              <p className="font-semibold text-sm text-zinc-900">Name: Authorized Signatory</p>
              <p className="text-xs text-zinc-500 mt-0.5">Title: Administration</p>
              <p className="text-[10px] text-zinc-400 mt-2 font-mono bg-zinc-50 inline-block px-2 py-0.5 rounded border border-zinc-200">
                Timestamp: {nda.client_signed_at ? new Date(nda.client_signed_at).toISOString() : 'Pending Execution'}
              </p>
            </div>

            {/* Receiving Party (Client) */}
            <div>
              <p className="font-bold text-xs tracking-widest uppercase text-zinc-400 mb-8 border-b border-zinc-200 pb-2">Receiving Party</p>
              
              {signed ? (
                <>
                  <div className="h-24 flex items-end mb-2">
                    <div className="w-full border-b border-zinc-400 pb-2 relative">
                      {nda.client_signature_url && (
                        <img src={nda.client_signature_url} alt="Signature" className="absolute bottom-1 left-0 max-h-20 max-w-[250px] object-contain mix-blend-multiply filter contrast-125 invert-0" style={{ filter: 'grayscale(100%) contrast(150%) brightness(50%)' }} />
                      )}
                    </div>
                  </div>
                  <p className="font-semibold text-sm text-zinc-900">Name: {nda.contact_person}</p>
                  <p className="text-xs text-zinc-500 mt-0.5">Company: {nda.company_name}</p>
                  <p className="text-[10px] text-zinc-400 mt-2 font-mono bg-emerald-50 text-emerald-700 inline-block px-2 py-0.5 rounded border border-emerald-200">
                    Verified ID: {nda.company_email}
                  </p>
                </>
              ) : (
                <div className="rounded-none border border-zinc-300 bg-zinc-50 p-6 shadow-inner relative">
                  <div className="absolute top-0 right-0 p-2 opacity-30 pointer-events-none">
                     <PenTool className="w-4 h-4 text-zinc-800" />
                  </div>
                  {!showPad ? (
                    <div className="text-center py-4">
                      <p className="text-sm font-semibold text-amber-700 mb-4">Signature Required</p>
                      <Button onClick={() => { setShowPad(true); setTimeout(initCanvas, 50); }} className="w-full font-serif font-bold text-sm h-12 bg-zinc-900 hover:bg-zinc-800 text-white shadow-md">
                        Click to Sign Document
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <p className="text-[11px] font-bold uppercase tracking-wider text-zinc-500 font-sans px-1">Draw signature in black ink below:</p>
                      <div className="relative border border-zinc-400 bg-white shadow-sm overflow-hidden">
                        {/* Signature line overlay */}
                        <div className="absolute bottom-4 left-4 right-4 border-b border-blue-200 pointer-events-none"></div>
                        <canvas ref={canvasRef}
                          className="w-full h-36 touch-none cursor-crosshair relative z-10 mix-blend-multiply"
                          onMouseDown={startDraw} onMouseMove={draw} onMouseUp={stopDraw} onMouseLeave={stopDraw}
                          onTouchStart={startDraw} onTouchMove={draw} onTouchEnd={stopDraw} />
                      </div>
                      <div className="flex gap-3 font-sans">
                        <Button variant="outline" onClick={() => { const ctx = canvasRef.current?.getContext('2d'); if (ctx && canvasRef.current) { ctx.clearRect(0,0,canvasRef.current.width, canvasRef.current.height); } }} className="flex-1 text-xs">
                          Clear
                        </Button>
                        <Button onClick={handleSign} disabled={signing} className="flex-[2] bg-zinc-900 hover:bg-zinc-800 text-white font-bold text-xs">
                          {signing ? 'Executing...' : 'Sign & Execute NDA'}
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
            
          </div>
          
        </div>
      </div>
      
      <div className="max-w-3xl mx-auto mt-6 mb-12 text-center text-[10px] text-zinc-500 font-sans uppercase tracking-widest">
        Powered by AYN AI Legal Compliance Engine
      </div>
    </div>
  );
}
