import { useState, useRef } from 'react';
import { motion } from 'framer-motion';
import { FileText, Loader2, Download, Sparkles, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';

const DOC_TYPES = [
  { value: 'Business Plan', label: 'Business Plan' },
  { value: 'Deal Memo', label: 'Deal Memo' },
  { value: 'Proposal', label: 'Proposal' },
  { value: 'Letter', label: 'Formal Letter' },
  { value: 'Brainstorming', label: 'Brainstorming' },
  { value: 'Report', label: 'Report' },
];

interface GeneratedDoc {
  html: string;
  title: string;
  refNumber: string;
  type: string;
  createdAt: string;
}

export const DocumentStudio = () => {
  const [prompt, setPrompt] = useState('');
  const [docType, setDocType] = useState('Business Plan');
  const [isGenerating, setIsGenerating] = useState(false);
  const [currentDoc, setCurrentDoc] = useState<GeneratedDoc | null>(null);
  const [history, setHistory] = useState<GeneratedDoc[]>([]);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const handleGenerate = async () => {
    if (!prompt.trim()) { toast.error('Please describe what you need'); return; }
    setIsGenerating(true);
    try {
      const res = await fetch(`https://spine.aynn.io/admin/edge/generate-business-document`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${}` },
        body: JSON.stringify({ prompt: prompt.trim(), documentType: docType }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Generation failed' }));
        throw new Error(err.error || 'Generation failed');
      }
      const data = await res.json();
      const doc: GeneratedDoc = { html: data.html, title: data.title, refNumber: data.refNumber, type: docType, createdAt: new Date().toISOString() };
      setCurrentDoc(doc);
      setHistory(prev => [doc, ...prev]);
      toast.success('Document generated!');
    } catch (e: any) {
      toast.error(e.message || 'Failed to generate document');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDownload = () => {
    if (!currentDoc) return;
    const blob = new Blob([currentDoc.html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const w = window.open(url, '_blank');
    if (w) {
      w.onafterprint = () => URL.revokeObjectURL(url);
    }
  };

  const loadFromHistory = (doc: GeneratedDoc) => {
    setCurrentDoc(doc);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
        <h2 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <FileText className="w-6 h-6 text-primary" />
          Document Studio
        </h2>
        <p className="text-muted-foreground text-sm mt-1">
          AI-powered business document generator with AYN branding
        </p>
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Input Panel */}
        <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.1 }}>
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-primary" />
                Create Document
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-sm font-medium text-foreground mb-1.5 block">Document Type</label>
                <Select value={docType} onValueChange={setDocType}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DOC_TYPES.map(t => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-sm font-medium text-foreground mb-1.5 block">Describe what you need</label>
                <Textarea
                  value={prompt}
                  onChange={e => setPrompt(e.target.value)}
                  placeholder="E.g., A business plan for a SaaS platform that provides AI-powered legal document review for small law firms in the Middle East..."
                  className="min-h-[180px] resize-none"
                />
              </div>

              <Button
                onClick={handleGenerate}
                disabled={isGenerating || !prompt.trim()}
                className="w-full"
                size="lg"
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4 mr-2" />
                    Generate Document
                  </>
                )}
              </Button>

              {/* History */}
              {history.length > 0 && (
                <div className="mt-4">
                  <h4 className="text-sm font-medium text-muted-foreground mb-2">Recent Documents</h4>
                  <div className="space-y-2 max-h-[200px] overflow-y-auto">
                    {history.map((doc, i) => (
                      <button
                        key={i}
                        onClick={() => loadFromHistory(doc)}
                        className="w-full text-left p-2.5 rounded-lg border border-border hover:bg-muted/50 transition-colors"
                      >
                        <p className="text-sm font-medium text-foreground truncate">{doc.title}</p>
                        <p className="text-xs text-muted-foreground">{doc.type} · {doc.refNumber}</p>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* Preview Panel */}
        <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.2 }}>
          <Card className="h-full flex flex-col">
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <CardTitle className="text-lg">Preview</CardTitle>
              {currentDoc && (
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={handleDownload}>
                    <Download className="w-4 h-4 mr-1" />
                    Open & Print
                  </Button>
                </div>
              )}
            </CardHeader>
            <CardContent className="flex-1 min-h-0">
              {currentDoc ? (
                <iframe
                  ref={iframeRef}
                  srcDoc={currentDoc.html}
                  className="w-full h-[600px] border border-border rounded-lg bg-white"
                  title="Document Preview"
                  sandbox="allow-same-origin"
                />
              ) : (
                <div className="h-[600px] flex items-center justify-center border border-dashed border-border rounded-lg bg-muted/20">
                  <div className="text-center text-muted-foreground">
                    <FileText className="w-12 h-12 mx-auto mb-3 opacity-30" />
                    <p className="text-sm">Your generated document will appear here</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </div>
  );
};
