import { useState, useEffect, useCallback, useMemo } from 'react';
import { toast } from 'sonner';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import { cn } from '@/lib/utils';
import { sanitizeUserInput, isValidUserInput } from '@/lib/security';
import { Copy, Check, AlertCircle, Loader2, Download } from 'lucide-react';
import {
  Dialog,
  DialogContent,
} from '@/components/ui/dialog';
import { isDocumentStorageUrl, isSupabaseStorageUrl, openDocumentUrl } from '@/lib/documentUrlUtils';

interface MessageFormatterProps {
  content: string;
  className?: string;
}

// Detect if content is predominantly Arabic/RTL text
const hasArabicText = (text: string): boolean => {
  // Strip markdown syntax, URLs, code blocks for cleaner detection
  const cleaned = text
    .replace(/```[\s\S]*?```/g, '')
    .replace(/`[^`]+`/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/[^a-zA-Z\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/g, '');
  
  const arabicChars = (cleaned.match(/[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/g) || []).length;
  const latinChars = (cleaned.match(/[a-zA-Z]/g) || []).length;
  
  // Only RTL if Arabic characters are the majority (>60%)
  const total = arabicChars + latinChars;
  return total > 0 && (arabicChars / total) > 0.6;
};

// Remove outer code fence wrapping if entire content is a single code block
const unwrapCodeFences = (text: string): string => {
  if (!text) return '';
  
  const trimmed = text.trim();
  
  // Check if entire content is wrapped in a single code block
  // Pattern: ```optionalLanguage\ncontent\n```
  const codeBlockMatch = trimmed.match(/^```[\w]*\n?([\s\S]*?)\n?```$/);
  
  if (codeBlockMatch) {
    // Return the content inside the code fences
    return codeBlockMatch[1].trim();
  }
  
  return text;
};

// Detect JSON responses with image URLs and convert to markdown image syntax
// Also strips raw LLM action/tool-call JSON that leaked through
const detectImageJsonResponse = (text: string): string => {
  if (!text) return text;
  
  const trimmed = text.trim();
  
  // Check if content looks like JSON with image URL or raw action payload
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    try {
      const parsed = JSON.parse(trimmed);
      
      // Strip raw LLM action/tool-call JSON (e.g. { action: "dalle.text2im", action_input: "..." })
      if (parsed.action && parsed.action_input) {
        // Extract the prompt from the action_input for a friendly message
        let prompt = '';
        try {
          const actionData = typeof parsed.action_input === 'string' 
            ? JSON.parse(parsed.action_input) 
            : parsed.action_input;
          prompt = actionData?.prompt || '';
        } catch { /* ignore */ }
        const thought = parsed.thought || '';
        const friendlyMsg = prompt 
          ? `🎨 generating image: *${prompt.substring(0, 120)}${prompt.length > 120 ? '...' : ''}*`
          : (thought || 'processing your request...');
        return friendlyMsg;
      }
      
      // Check for common image response patterns (from n8n, DALL-E, etc.)
      if (parsed.url && typeof parsed.url === 'string') {
        const url = parsed.url;
        const isImageUrl = url.includes('.png') || 
                          url.includes('.jpg') || 
                          url.includes('.jpeg') || 
                          url.includes('.gif') || 
                          url.includes('.webp') ||
                          url.includes('image') || 
                          url.includes('blob.core.windows.net') ||
                          url.includes('oaidalleapiprodscus');
        
        if (isImageUrl) {
          const caption = parsed.revised_prompt || parsed.description || parsed.prompt || 'Generated Image';
          return `![${caption}](${url})\n\n**${caption}**`;
        }
      }
    } catch {
      // Not valid JSON, return original
    }
  }
  
  // Also handle raw JSON embedded within other text
  const actionJsonMatch = trimmed.match(/\{\s*"action"\s*:\s*"[^"]*"\s*,\s*"action_input"\s*:/);
  if (actionJsonMatch) {
    // Strip the raw JSON and keep only non-JSON text around it
    const cleaned = trimmed.replace(/\{[^{}]*"action"\s*:\s*"[^"]*"[^{}]*(?:\{[^{}]*\}[^{}]*)?\}/g, '').trim();
    return cleaned || 'processing your request...';
  }
  
  return text;
};

// Decode HTML entities safely without using innerHTML (prevents XSS)
const decodeHtmlEntities = (text: string): string => {
  if (!text) return '';
  
  // Map of common HTML entities to their decoded values
  const htmlEntities: Record<string, string> = {
    '&quot;': '"',
    '&#34;': '"',
    '&#x22;': '"',
    '&apos;': "'",
    '&#39;': "'",
    '&#x27;': "'",
    '&lt;': '<',
    '&#60;': '<',
    '&#x3C;': '<',
    '&gt;': '>',
    '&#62;': '>',
    '&#x3E;': '>',
    '&amp;': '&',
    '&#38;': '&',
    '&#x26;': '&',
    '&#x2F;': '/',
    '&#47;': '/',
    '&nbsp;': ' ',
    '&#160;': ' ',
    '&#xa0;': ' ',
    '&ndash;': '–',
    '&#8211;': '–',
    '&mdash;': '—',
    '&#8212;': '—',
    '&lsquo;': '\u2018',
    '&rsquo;': '\u2019',
    '&ldquo;': '\u201C',
    '&rdquo;': '\u201D',
    '&hellip;': '…',
    '&copy;': '©',
    '&reg;': '®',
    '&trade;': '™',
  };
  
  let decoded = text;
  
  // Replace all known named entities
  for (const [entity, char] of Object.entries(htmlEntities)) {
    decoded = decoded.split(entity).join(char);
  }
  
  // Handle remaining numeric entities (decimal: &#123; or hex: &#x7B;)
  decoded = decoded.replace(/&#(\d+);/g, (_, dec) => 
    String.fromCharCode(parseInt(dec, 10))
  );
  decoded = decoded.replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => 
    String.fromCharCode(parseInt(hex, 16))
  );
  
  return decoded;
};

export function MessageFormatter({ content, className }: MessageFormatterProps) {
  const [lightboxImage, setLightboxImage] = useState<{ src: string; alt: string } | null>(null);
  const [copiedCodeId, setCopiedCodeId] = useState<string | null>(null);
  const [savingImages] = useState<Set<string>>(new Set());
  const [failedImages, setFailedImages] = useState<Set<string>>(new Set());

  const normalizeImageUrl = useCallback((url: string) => {
    return (url || '').trim().replace(/^['"]+|['"]+$/g, '');
  }, []);

  // Helper to get the best URL for an image
  const getImageUrl = useCallback((originalUrl: string) => {
    return normalizeImageUrl(originalUrl);
  }, [normalizeImageUrl]);


  // Step 1: Detect and convert JSON image responses to markdown
  const imageProcessedContent = detectImageJsonResponse(content);
  
  // Step 2: Unwrap outer code fences (if entire content is wrapped)
  const unwrappedContent = unwrapCodeFences(imageProcessedContent);
  
  // Step 3: Decode HTML entities
  const decodedContent = decodeHtmlEntities(unwrappedContent);
  
  // Step 4: Strip inline document download links (users use the Download button instead)
  const strippedContent = decodedContent
    // Remove lines like: 📄 [Click here to download...](url) or 📊 [Download ...](url)
    .replace(/^[\s]*[📄📊📥]\s*\[[^\]]*\]\((?:https?:\/\/[^\s)]+|data:[^\s)]+)\)\s*$/gm, '')
    // Remove lines like: [Download filename.xlsx](url) or [Click here to download](url)
    .replace(/^[\s]*\[(?:[Dd]ownload[^\]]*|[Cc]lick here[^\]]*|[Cc]liquez ici[^\]]*|اضغط[^\]]*|تحميل[^\]]*)\]\((?:https?:\/\/[^\s)]+|data:[^\s)]+)\)\s*$/gm, '')
    // Clean up resulting empty lines
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  // Step 5: Sanitize content to prevent XSS attacks
  const sanitizedContent = isValidUserInput(strippedContent) ? strippedContent : sanitizeUserInput(strippedContent);

  const copyCodeToClipboard = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedCodeId(code);
      setTimeout(() => setCopiedCodeId(null), 2000);
    } catch (err) {
      console.error('Failed to copy code:', err);
    }
  };
  
  // Preprocess to convert inline tables, numbered/bullet lists to proper newlines
  const preprocessContent = (text: string): string => {
    let processed = text;
    
    // Normalize curly/smart quotes to straight quotes for markdown compatibility
    processed = processed
      .replace(/[\u2018\u2019]/g, "'")  // Single curly quotes → straight
      .replace(/[\u201C\u201D]/g, '"'); // Double curly quotes → straight
    
    // Check if content contains a markdown table (has pipes and separator row)
    const isTable = processed.includes('|') && /\|[\s-:]+\|/.test(processed);
    
    // For tables: just normalize excessive newlines, don't modify structure
    if (isTable) {
      processed = processed.replace(/\n{3,}/g, '\n\n');
      return processed;
    }
    
    // Only apply list conversion for NON-table content
    // 1. Convert inline numbered lists like "1. item 2. item 3. item"
    if (processed.match(/\d+\.\s[^0-9]+\d+\.\s/)) {
      processed = processed.replace(/(\s)(\d+)\.\s/g, '\n$2. ').trim();
    }
    
    // 2. Convert inline bullet lists like "text: - **Item** - **Item**"
    if (processed.match(/[^-\n]\s+-\s+(\*\*|[A-Z])/)) {
      processed = processed.replace(/(\S)\s+-\s+(\*\*|[A-Z])/g, '$1\n- $2');
    }
    
    // 3. Convert inline bullets with em-dash "text – item – item"
    if (processed.match(/[^\n]\s+[–—]\s+\*\*/)) {
      processed = processed.replace(/(\S)\s+[–—]\s+(\*\*)/g, '$1\n- $2');
    }
    
    return processed;
  };

  const processedContent = preprocessContent(sanitizedContent);

  // Detect RTL for Arabic content
  const isRTL = useMemo(() => hasArabicText(processedContent), [processedContent]);

  return (
    <>
      <style>{`.hljs{background:#0d1117;color:#e6edf3;border-radius:0.5rem;padding:1rem;overflow-x:auto}.hljs-keyword,.hljs-selector-tag,.hljs-built_in,.hljs-name,.hljs-tag{color:#ff7b72}.hljs-string,.hljs-title,.hljs-section,.hljs-attribute,.hljs-literal,.hljs-template-tag,.hljs-template-variable,.hljs-type,.hljs-addition{color:#a5d6ff}.hljs-comment,.hljs-quote,.hljs-deletion,.hljs-meta{color:#8b949e}.hljs-number,.hljs-regexp,.hljs-variable,.hljs-link{color:#79c0ff}.hljs-attr,.hljs-variable,.hljs-template-variable,.hljs-type,.hljs-selector-class,.hljs-selector-attr,.hljs-selector-pseudo{color:#ffa657}.hljs-function,.hljs-class{color:#d2a8ff}`}</style>
       <div 
        className={cn("space-y-4 leading-relaxed break-words max-w-none", className)}
        dir={isRTL ? 'rtl' : 'ltr'}
        style={{ 
          fontFamily: isRTL ? "'Noto Sans Arabic', 'Segoe UI', system-ui, sans-serif" : undefined,
          textAlign: isRTL ? 'right' : undefined,
        }}
      >
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          rehypePlugins={[rehypeHighlight]}
          components={{
            // Bold text
            strong: ({ children }) => (
              <strong className="font-semibold text-foreground">{children}</strong>
            ),
            // Italic text
            em: ({ children }) => (
              <em className="italic text-muted-foreground">{children}</em>
            ),
            // Strikethrough (GFM)
            del: ({ children }) => (
              <del className="line-through text-muted-foreground">{children}</del>
            ),
            // Unordered lists with styled bullets
            ul: ({ children }) => (
              <ul className="space-y-2 my-3 first:mt-0 last:mb-0 ps-1 list-none">{children}</ul>
            ),
            // Ordered lists with styled markers
            ol: ({ children }) => (
              <ol className="space-y-2 my-3 first:mt-0 last:mb-0 ps-5 list-decimal list-outside marker:text-primary/60 marker:font-medium">{children}</ol>
            ),
            // List items with custom bullet styling
            li: ({ children }) => (
              <li className="relative ps-5 leading-relaxed pb-0.5 break-words [overflow-wrap:anywhere] [&>p]:inline [&>p]:m-0 before:content-['•'] before:absolute before:start-0 before:text-primary/60 before:font-bold before:text-base [ol>&]:before:content-none [ol>&]:ps-0">{children}</li>
            ),
            // Paragraphs
            p: ({ children }) => (
              <p className="leading-[1.75] mb-3 last:mb-0 text-current break-words">{children}</p>
            ),
            // Code blocks with language label and copy button
            code: ({ children, className: codeClassName }) => {
              const isBlock = codeClassName?.includes('language-');
              const codeString = String(children).replace(/\n$/, '');
              const language = codeClassName?.replace('language-', '') || '';
              
              if (isBlock) {
                return (
                  <div className="relative group my-4 first:mt-0 last:mb-0 max-w-full overflow-hidden rounded-xl border border-border">
                    {/* Language label + copy button header */}
                    <div className="flex items-center justify-between px-4 py-2 bg-muted/80 border-b border-border">
                      <span className="text-xs font-mono text-muted-foreground uppercase tracking-wider">
                        {language || 'code'}
                      </span>
                      <button
                        onClick={() => copyCodeToClipboard(codeString)}
                        className={cn(
                          "flex items-center gap-1.5 px-2 py-1 rounded-md text-xs",
                          "text-muted-foreground hover:text-foreground hover:bg-muted",
                          "transition-colors"
                        )}
                        title="Copy code"
                      >
                        {copiedCodeId === codeString ? (
                          <>
                            <Check size={13} className="text-green-500" />
                            <span className="text-green-500">Copied</span>
                          </>
                        ) : (
                          <>
                            <Copy size={13} />
                            <span>Copy</span>
                          </>
                        )}
                      </button>
                    </div>
                    <pre className="bg-muted/40 p-4 overflow-x-auto max-w-full w-full">
                      <code className="text-[13px] font-mono text-foreground/90 whitespace-pre leading-relaxed">
                        {children}
                      </code>
                    </pre>
                  </div>
                );
              }
              return (
                <code className="bg-muted/70 text-foreground px-1.5 py-0.5 rounded-md text-[13px] font-mono border border-border/50">
                  {children}
                </code>
              );
            },
            // Pre blocks - let code component handle rendering
            pre: ({ children }) => <>{children}</>,
            // Headers
            h1: ({ children }) => (
              <h1 className="text-xl font-bold mt-6 mb-3 first:mt-0 text-foreground tracking-tight">{children}</h1>
            ),
            h2: ({ children }) => (
              <h2 className="text-lg font-semibold mt-6 mb-2.5 first:mt-0 text-foreground tracking-tight">{children}</h2>
            ),
            h3: ({ children }) => (
              <h3 className="text-base font-semibold mt-5 mb-2 first:mt-0 text-foreground">{children}</h3>
            ),
            h4: ({ children }) => (
              <h4 className="text-sm font-semibold mt-4 mb-1.5 first:mt-0 text-foreground">{children}</h4>
            ),
            // Blockquotes
            blockquote: ({ children }) => (
              <blockquote className="border-l-[3px] border-primary/40 bg-muted/30 ps-4 py-2.5 my-4 first:mt-0 last:mb-0 rounded-e-lg text-muted-foreground [&>p]:mb-1 [&>p:last-child]:mb-0">
                {children}
              </blockquote>
            ),
            // Tables
            table: ({ children }) => (
              <div className="my-4 first:mt-0 last:mb-0 rounded-xl border border-border overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="min-w-full border-collapse text-sm">
                    {children}
                  </table>
                </div>
              </div>
            ),
            thead: ({ children }) => (
              <thead className="bg-muted/60">{children}</thead>
            ),
            tbody: ({ children }) => (
              <tbody className="divide-y divide-border/60">{children}</tbody>
            ),
            tr: ({ children }) => (
              <tr className="even:bg-muted/20 hover:bg-muted/40 transition-colors">{children}</tr>
            ),
            th: ({ children }) => (
              <th className="px-4 py-2.5 text-left font-semibold text-xs uppercase tracking-wider text-foreground whitespace-nowrap border-b border-border">
                {children}
              </th>
            ),
            td: ({ children }) => (
              <td className="px-4 py-2.5 text-sm text-foreground/80 break-words">
                {children}
              </td>
            ),
            // Horizontal rule
            hr: () => (
              <hr className="my-5 border-border" />
            ),
            // Links - route document storage URLs through proxy for reliable downloads
            a: ({ children, href }) => {
              const isDataURL = href?.startsWith('data:');
              const isDocUrl = isDocumentStorageUrl(href || '');
              const isSupabaseUrl = isSupabaseStorageUrl(href || '');
              const isSandboxUrl = href?.startsWith('sandbox:') || href?.includes('/mnt/data/');
              const isDownloadable = isDataURL || isDocUrl || isSupabaseUrl;
              
              const handleClick = (e: React.MouseEvent) => {
                e.preventDefault();
                e.stopPropagation();
                console.log('[MessageFormatter] Link clicked:', href?.substring(0, 80));
                // Intercept hallucinated sandbox URLs
                if (isSandboxUrl) {
                  toast.error('File not available. Try asking again to generate the document.');
                  return;
                }
                if (isDownloadable && href) {
                  const urlFilename = href.split('/').pop()?.split('?')[0] || 'download';
                  console.log('[MessageFormatter] Downloading:', urlFilename);
                  openDocumentUrl(href, urlFilename).catch(err => {
                    console.error('[MessageFormatter] Download failed:', err);
                    toast.error('Download failed. Please try the Download button below.');
                  });
                  return;
                }
                // Regular external link - open in new tab
                if (href) {
                  window.open(href, '_blank', 'noopener,noreferrer');
                }
              };
              
              // Use <span> instead of <button> to avoid invalid nesting inside <p>
              return (
                <span
                  role="link"
                  tabIndex={0}
                  onClick={handleClick}
                  onKeyDown={(e) => e.key === 'Enter' && handleClick(e as any)}
                  className="inline text-primary underline underline-offset-2 hover:text-primary/80 transition-colors cursor-pointer"
                >
                  {children}
                </span>
              );
            },
            // Images with click-to-zoom and persistence
            img: ({ src, alt }) => {
              const rawSrc = src || '';
              const cleanSrc = normalizeImageUrl(rawSrc);
              const displaySrc = getImageUrl(cleanSrc);
              const isDalleUrl = cleanSrc.includes('oaidalleapiprodscus.blob.core.windows.net');
              const isSaving = savingImages.has(cleanSrc);
              const hasFailed = failedImages.has(cleanSrc);
              const isSupabase = isSupabaseStorageUrl(cleanSrc);

              const handleImageError = async (e: React.SyntheticEvent<HTMLImageElement>) => {
                const imgEl = e.currentTarget;
                // Avoid infinite loop: only retry once via blob
                if (imgEl.dataset.blobRetried) return;
                imgEl.dataset.blobRetried = 'true';
                
                try {
                  const response = await fetch(cleanSrc);
                  if (!response.ok) throw new Error('fetch failed');
                  const blob = await response.blob();
                  const blobUrl = URL.createObjectURL(blob);
                  imgEl.src = blobUrl;
                } catch {
                  if (isDalleUrl && !hasFailed) {
                    setFailedImages(prev => new Set(prev).add(cleanSrc));
                  }
                }
              };

              return (
                <div className="relative my-2">
                  <img 
                    src={displaySrc} 
                    alt={alt || ''} 
                    loading="lazy"
                    className="max-w-full h-auto rounded-lg cursor-zoom-in hover:opacity-90 transition-opacity shadow-sm"
                    onClick={() => setLightboxImage({ src: displaySrc, alt: alt || '' })}
                    onError={handleImageError}
                  />
                  {/* Saving indicator */}
                  {isSaving && (
                    <div className="absolute top-2 right-2 flex items-center gap-1 px-2 py-1 rounded-full bg-foreground/70 text-background text-xs">
                      <Loader2 size={12} className="animate-spin" />
                      <span>Saving...</span>
                    </div>
                  )}
                  {/* Failed/Expired indicator */}
                  {hasFailed && displaySrc === cleanSrc && (
                    <div className="absolute inset-0 flex items-center justify-center bg-muted rounded-lg">
                      <div className="text-center p-4">
                        <AlertCircle className="w-8 h-8 text-amber-500 mx-auto mb-2" />
                        <p className="text-sm text-muted-foreground">Image has expired</p>
                        <p className="text-xs text-muted-foreground mt-1">Please regenerate the image</p>
                      </div>
                    </div>
                  )}
                  {/* Download button for supabase images */}
                  {isSupabase && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        const filename = cleanSrc.split('/').pop()?.split('?')[0] || 'image.png';
                        openDocumentUrl(cleanSrc, filename);
                      }}
                      className="absolute bottom-2 right-2 flex items-center gap-1 px-2 py-1 rounded-md bg-foreground/70 text-background text-xs hover:bg-foreground/90 transition-colors"
                    >
                      <Download size={12} />
                      <span>Download</span>
                    </button>
                  )}
                </div>
              );
            },
          }}
        >
          {processedContent}
        </ReactMarkdown>
      </div>

      {/* Image Lightbox Dialog */}
      <Dialog open={!!lightboxImage} onOpenChange={() => setLightboxImage(null)}>
        <DialogContent aria-describedby={undefined} className="max-w-[90vw] max-h-[90vh] p-2 bg-black/95 border-none">
          {lightboxImage && (
            <img
              src={lightboxImage.src}
              alt={lightboxImage.alt}
              className="w-full h-full object-contain max-h-[85vh]"
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
