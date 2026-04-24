import { useState, useRef, useEffect, useCallback } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, Download, Send, Sparkles, Globe } from 'lucide-react';
import { AynEyeIcon } from './AynEyeIcon';
import { adminSupabase as supabase } from '@/admin-app/adminSupabase';
import { toast } from 'sonner';
import type { BrandKitState } from './CompactBrandBar';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  image_url?: string;
}

interface CreativeEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  imageUrl: string | null;
  tweetText: string;
  postId: string;
  onImageGenerated: (url: string) => void;
  brandKit?: BrandKitState | null;
  onBrandKitUpdate?: (colors: { name: string; hex: string }[]) => void;
}

export interface CreativeParams {
  background_color: 'white' | 'dark' | 'blue';
  header_text: string;
  accent_color: string;
  include_logo: boolean;
  cta_text: string;
}

const QUICK_CHIPS = [
  'Dark theme',
  'Light & clean',
  'Add CTA',
  'More colorful',
  'Regenerate',
  'Scan a website',
];

const downloadImage = async (url: string, filename?: string) => {
  try {
    const response = await fetch(url);
    const blob = await response.blob();
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = filename || 'ayn-creative.png';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(blobUrl);
  } catch {
    toast.error('Download failed');
  }
};

export const CreativeEditor = ({
  open,
  onOpenChange,
  imageUrl: initialImageUrl,
  tweetText,
  postId,
  onImageGenerated,
  brandKit,
  onBrandKitUpdate,
}: CreativeEditorProps) => {
  const [currentImageUrl, setCurrentImageUrl] = useState(initialImageUrl);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [urlInput, setUrlInput] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open && messages.length === 0) {
      const topic = tweetText.length > 60 ? tweetText.slice(0, 60) + '...' : tweetText;
      setMessages([{
        role: 'assistant',
        content: `hey! i see your tweet is about "${topic}". want me to create a visual for it? tell me the vibe -- light, dark, colorful? any specific text or CTA you want on it?\n\nyou can also paste a website URL and i'll analyze their brand DNA to create matching (or competing) visuals.`,
      }]);
      setCurrentImageUrl(initialImageUrl);
    }
  }, [open, messages.length, tweetText, initialImageUrl]);

  useEffect(() => {
    if (!open) {
      setMessages([]);
      setInput('');
      setIsLoading(false);
      setShowUrlInput(false);
      setUrlInput('');
    }
  }, [open]);

  useEffect(() => {
    const timer = setTimeout(() => {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
    return () => clearTimeout(timer);
  }, [messages, isLoading]);

  const handleBrandScan = useCallback(async (url: string) => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('twitter-brand-scan', { body: { url } });
      if (error) throw error;
      if (data?.error) { toast.error(data.error); setIsLoading(false); return null; }
      if (data?.brand_dna?.colors && onBrandKitUpdate) {
        const scannedColors = data.brand_dna.colors;
        if (Array.isArray(scannedColors) && scannedColors.length > 0) {
          const mappedColors = scannedColors.slice(0, 5).map((c: { name?: string; hex?: string; role?: string }, i: number) => ({
            name: c.name || c.role || `Color ${i + 1}`,
            hex: c.hex || '#000000',
          }));
          onBrandKitUpdate(mappedColors);
          toast.success('Brand Kit colors updated from scan!');
        }
      }
      return data.brand_dna;
    } catch (err) {
      console.error('Brand scan error:', err);
      toast.error('Failed to scan website');
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [onBrandKitUpdate]);

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || isLoading) return;
    const userMsg: ChatMessage = { role: 'user', content: text.trim() };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput('');
    setShowUrlInput(false);
    setIsLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke('twitter-creative-chat', {
        body: {
          messages: newMessages.map(m => ({ role: m.role, content: m.content })),
          post_id: postId,
          tweet_text: tweetText,
          brand_kit: brandKit || undefined,
        },
      });
      if (error) throw error;
      if (data?.error) { toast.error(data.error); setIsLoading(false); return; }

      if (data.type === 'scan_url' && data.scan_url) {
        setMessages(prev => [...prev, { role: 'assistant', content: data.message }]);
        const brandDNA = await handleBrandScan(data.scan_url);
        if (brandDNA) {
          const followUp: ChatMessage = { role: 'user', content: `[BRAND_DNA_RESULT] Here's the brand analysis for ${data.scan_url}: ${JSON.stringify(brandDNA)}. Now use this to suggest visuals.` };
          const updatedMessages = [...newMessages, { role: 'assistant' as const, content: data.message }, followUp];
          setMessages(prev => [...prev, followUp]);
          const { data: followData, error: followError } = await supabase.functions.invoke('twitter-creative-chat', {
            body: { messages: updatedMessages.map(m => ({ role: m.role, content: m.content })), post_id: postId, tweet_text: tweetText, brand_kit: brandKit || undefined },
          });
          if (!followError && followData) {
            setMessages(prev => [...prev, { role: 'assistant', content: followData.message || 'got the brand DNA! what would you like me to create?', image_url: followData.image_url }]);
            if (followData.image_url) { setCurrentImageUrl(followData.image_url); onImageGenerated(followData.image_url); }
          }
        }
        setIsLoading(false);
        return;
      }

      const assistantMsg: ChatMessage = { role: 'assistant', content: data.message || 'hmm, something went wrong. try again?', image_url: data.image_url };
      setMessages(prev => [...prev, assistantMsg]);
      if (data.image_url) { setCurrentImageUrl(data.image_url); onImageGenerated(data.image_url); }
    } catch (err) {
      console.error('Chat error:', err);
      toast.error('Failed to get response from AYN');
    } finally {
      setIsLoading(false);
      inputRef.current?.focus();
    }
  }, [messages, isLoading, postId, tweetText, onImageGenerated, brandKit, handleBrandScan]);

  const handleKeyDown = (e: React.KeyboardEvent) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(input); } };
  const handleUrlScan = () => { if (urlInput.trim()) { sendMessage(`scan ${urlInput.trim()} and analyze their brand identity`); setUrlInput(''); setShowUrlInput(false); } };
  const handleChipClick = (chip: string) => { if (chip === 'Scan a website') { setShowUrlInput(true); return; } sendMessage(chip); };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl h-[90vh] max-h-[850px] p-0 gap-0 overflow-hidden border-border/40">
        <div className="grid grid-cols-1 md:grid-cols-5 h-full">
          <div className="md:col-span-3 bg-muted/5 flex items-center justify-center p-8 border-r border-border/30 overflow-hidden relative">
            <div className="absolute inset-0 opacity-[0.02]" style={{ backgroundImage: 'linear-gradient(hsl(var(--primary)) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--primary)) 1px, transparent 1px)', backgroundSize: '20px 20px' }} />
            {currentImageUrl ? (
              <div className="relative w-full max-w-md mx-auto">
                <img src={currentImageUrl} alt="Creative preview" className="relative w-full rounded-2xl shadow-2xl ring-1 ring-border/10 object-contain max-h-[70vh]" />
                <Button size="sm" variant="secondary" className="absolute bottom-3 right-3 gap-1.5 shadow-lg backdrop-blur-sm bg-background/80" onClick={() => downloadImage(currentImageUrl)}>
                  <Download className="w-3.5 h-3.5" /> Download
                </Button>
              </div>
            ) : (
              <div className="relative w-full max-w-sm aspect-square rounded-2xl bg-muted/10 border-2 border-dashed border-border/30 flex flex-col items-center justify-center gap-5">
                <div className="w-16 h-16 rounded-2xl bg-foreground flex items-center justify-center shadow-xl">
                  <AynEyeIcon size={36} className="text-background" />
                </div>
                <div className="text-center space-y-1.5">
                  <p className="text-sm font-semibold text-foreground">Chat with AYN to create</p>
                  <p className="text-xs text-muted-foreground">Describe your vision → AYN generates it</p>
                </div>
              </div>
            )}
          </div>
          <div className="md:col-span-2 flex flex-col h-full overflow-hidden bg-background">
            <div className="shrink-0 p-4 border-b border-border/30 backdrop-blur-sm bg-background/80">
              <h3 className="font-bold text-base tracking-tight flex items-center gap-2">
                <AynEyeIcon size={18} className="text-foreground" /> AYN Creative Studio
              </h3>
              <p className="text-[11px] text-muted-foreground mt-0.5">Marketing strategist · Brand consultant · Design director</p>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto">
              <div className="p-4 space-y-3">
                {messages.map((msg, i) => (
                  <div key={`msg-${i}-${msg.role}`} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[80%] rounded-2xl px-3.5 py-2.5 text-[13px] leading-relaxed break-words ${msg.role === 'user' ? 'bg-primary text-primary-foreground rounded-br-md' : 'bg-muted/40 text-foreground rounded-bl-md border border-border/20'}`}>
                      <span className="whitespace-pre-wrap">{msg.content}</span>
                      {msg.image_url && <div className="mt-2 text-[11px] opacity-70 flex items-center gap-1"><Sparkles className="w-3 h-3" /> image generated ✓</div>}
                    </div>
                  </div>
                ))}
                {isLoading && (
                  <div className="flex justify-start">
                    <div className="bg-muted/40 rounded-2xl rounded-bl-md px-3.5 py-2.5 border border-border/20 flex items-center gap-2">
                      <div className="flex gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/60 animate-bounce [animation-delay:0ms]" />
                        <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/60 animate-bounce [animation-delay:150ms]" />
                        <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/60 animate-bounce [animation-delay:300ms]" />
                      </div>
                      <span className="text-[12px] text-muted-foreground">ayn is thinking</span>
                    </div>
                  </div>
                )}
                <div ref={bottomRef} />
              </div>
            </div>
            {showUrlInput && (
              <div className="shrink-0 px-4 py-2 border-t border-border/30">
                <div className="flex gap-2">
                  <Input value={urlInput} onChange={(e) => setUrlInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleUrlScan()} placeholder="https://example.com" className="text-sm h-8 rounded-lg" autoFocus />
                  <Button size="sm" onClick={handleUrlScan} disabled={!urlInput.trim()} className="h-8 gap-1 rounded-lg"><Globe className="w-3.5 h-3.5" /> Scan</Button>
                </div>
              </div>
            )}
            <div className="shrink-0 px-4 py-2 border-t border-border/30">
              <div className="flex flex-wrap gap-1.5">
                {QUICK_CHIPS.map((chip) => (
                  <button key={chip} onClick={() => handleChipClick(chip)} disabled={isLoading} className={`text-[11px] px-2.5 py-1.5 rounded-full transition-all disabled:opacity-50 hover:scale-[1.03] active:scale-95 ${chip === 'Scan a website' ? 'bg-primary/10 hover:bg-primary/20 text-primary font-medium' : 'bg-muted/30 hover:bg-muted/60 text-muted-foreground hover:text-foreground'}`}>
                    {chip === 'Scan a website' && <Globe className="w-3 h-3 inline mr-1" />}{chip}
                  </button>
                ))}
              </div>
            </div>
            <div className="shrink-0 p-3 border-t border-border/30 bg-background">
              <div className="flex gap-2">
                <Input ref={inputRef} value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={handleKeyDown} placeholder="Describe your vision or paste a URL..." disabled={isLoading} className="text-sm rounded-lg" />
                <Button size="icon" onClick={() => sendMessage(input)} disabled={!input.trim() || isLoading} className="rounded-lg shrink-0"><Send className="w-4 h-4" /></Button>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
