import { motion, AnimatePresence } from "framer-motion";
import { lazy, Suspense } from "react";
import { useRef, useState, useEffect, useCallback, memo, useMemo } from "react";

import { cn } from "@/lib/utils";
import { StreamingMarkdown } from "@/components/eye/StreamingMarkdown";
import { MessageFormatter } from "@/components/shared/MessageFormatter";
import { TranscriptMessage } from "@/components/transcript/TranscriptMessage";
import { hapticFeedback } from "@/lib/haptics";
import { useEmotionOrchestrator } from "@/hooks/useEmotionOrchestrator";
import {
  Copy,
  Check,
  ThumbsUp,
  ThumbsDown,
  Brain,
  X,
  ChevronDown,
  
  Maximize2,
  Download,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { extractBestDocumentLink, openDocumentUrl } from "@/lib/documentUrlUtils";
import type { Message } from "@/types/dashboard.types";



interface ResponseBubbleAttachment {
  url: string;
  name: string;
  type: string;
}

interface ResponseBubble {
  id: string;
  content: string;
  isVisible: boolean;
  attachment?: ResponseBubbleAttachment;
  
}

interface ResponseCardProps {
  responses: ResponseBubble[];
  isMobile?: boolean;
  onDismiss?: () => void;
  variant?: "inline" | "sheet";
  showPointer?: boolean;
  sessionId?: string;
  transcriptOpen?: boolean;
  transcriptMessages?: Message[];
  isTyping?: boolean;
  onHistoryClose?: () => void;
  onHistoryClear?: () => void;
  onReply?: (content: string) => void;
}

const ResponseCardComponent = ({
  responses,
  isMobile = false,
  onDismiss,
  variant = "inline",
  showPointer = true,
  sessionId,
  transcriptOpen = false,
  transcriptMessages = [],
  isTyping: historyTyping = false,
  onHistoryClose,
  onHistoryClear,
  onReply,
}: ResponseCardProps) => {
  
  const { orchestrateEmotionChange } = useEmotionOrchestrator();

  const contentRef = useRef<HTMLDivElement>(null);
  const dialogContentRef = useRef<HTMLDivElement>(null);
  const historyScrollRef = useRef<HTMLDivElement>(null);
  const [isScrollable, setIsScrollable] = useState(false);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const shouldAutoScrollRef = useRef(true);
  const [copied, setCopied] = useState(false);
  const [feedback, setFeedback] = useState<"up" | "down" | null>(null);
  const [isStreaming, setIsStreaming] = useState(true);
  const [lastResponseId, setLastResponseId] = useState<string | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const [dialogScrollable, setDialogScrollable] = useState(false);
  const [dialogAtBottom, setDialogAtBottom] = useState(true);
  const dialogShouldAutoScrollRef = useRef(true);
  const [showHistoryScrollDown, setShowHistoryScrollDown] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const seenMessageIdsRef = useRef<Set<string>>(new Set());
  const [showDownloadMenu, setShowDownloadMenu] = useState(false);

  const visibleResponses = responses.filter((r) => r.isVisible);
  const currentResponseId = visibleResponses[0]?.id;

  const combinedContent = visibleResponses.map((r) => r.content.replace(/^[!?\s]+/, "").trim()).join("\n\n");

  const detectedImageUrl = useMemo(() => {
    // Check labData first (from image generation)
    const firstResponse = visibleResponses[0];
    if (firstResponse && 'labData' in firstResponse) {
      const labUrl = (firstResponse as any).labData?.json?.image_url;
      if (labUrl) return labUrl;
    }
    // Existing: markdown image URLs
    const markdownMatch = combinedContent.match(/!\[.*?\]\((https?:\/\/[^\s)]+)\)/);
    if (markdownMatch) return markdownMatch[1];
    // Existing: plain HTTP image URLs
    const urlMatch = combinedContent.match(/(https?:\/\/[^\s]+\.(?:jpg|jpeg|png|gif|webp|svg))/i);
    if (urlMatch) return urlMatch[1];
    // New: base64 data URL images
    const dataUrlMatch = combinedContent.match(/(data:image\/[^;]+;base64,[A-Za-z0-9+/=]+)/);
    if (dataUrlMatch) return dataUrlMatch[1];
    return null;
  }, [combinedContent, visibleResponses]);

  const documentAttachment = useMemo(() => {
    const firstResponse = visibleResponses[0];
    if (!firstResponse?.attachment) return null;
    const { url, name, type } = firstResponse.attachment;
    const isDocument =
      type === "pdf" ||
      type === "excel" ||
      type === "application/pdf" ||
      type?.includes("spreadsheet") ||
      url?.startsWith("data:application/pdf") ||
      url?.startsWith("data:application/vnd.openxmlformats");
    return isDocument ? { url, name, type } : null;
  }, [visibleResponses]);

  const sortedMessages = useMemo(() => {
    const indexed = transcriptMessages.map((m, i) => ({ m, i }));
    indexed.sort((a, b) => {
      const timeA = a.m.timestamp instanceof Date ? a.m.timestamp.getTime() : new Date(a.m.timestamp).getTime();
      const timeB = b.m.timestamp instanceof Date ? b.m.timestamp.getTime() : new Date(b.m.timestamp).getTime();
      const diff = timeA - timeB;
      if (diff !== 0) return diff;
      // Same timestamp: user messages come before ayn
      if (a.m.sender === 'user' && b.m.sender === 'ayn') return -1;
      if (a.m.sender === 'ayn' && b.m.sender === 'user') return 1;
      return a.i - b.i;
    });
    return indexed.map(x => x.m);
  }, [transcriptMessages]);


  useEffect(() => {
    if (currentResponseId && currentResponseId !== lastResponseId) {
      setIsStreaming(true);
      setLastResponseId(currentResponseId);
    }
  }, [currentResponseId, lastResponseId]);

  const handleStreamComplete = useCallback(() => {
    setIsStreaming(false);
    hapticFeedback("light");
  }, []);

  const markdownToPlainText = useCallback((markdown: string): string => {
    let text = markdown;
    text = text.replace(/^#{1,6}\s+/gm, "");
    text = text.replace(/\*\*(.+?)\*\*/g, "$1");
    text = text.replace(/__(.+?)__/g, "$1");
    text = text.replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, "$1");
    text = text.replace(/(?<!_)_(?!_)(.+?)(?<!_)_(?!_)/g, "$1");
    text = text.replace(/`(.+?)`/g, "$1");
    text = text.replace(/```[\w]*\n?([\s\S]*?)```/g, "$1");
    text = text.replace(/^\s*[-*+]\s+/gm, "• ");
    text = text.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
    text = text.replace(/!\[([^\]]*)\]\([^)]+\)/g, "[Image: $1]");
    text = text.replace(/^[-*_]{3,}$/gm, "");
    text = text.replace(/^>\s+/gm, "");
    text = text.replace(/\n{3,}/g, "\n\n");
    return text.trim();
  }, []);

  const copyContent = async () => {
    try {
      const plainText = markdownToPlainText(combinedContent);
      await navigator.clipboard.writeText(plainText);
      hapticFeedback("success");
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      hapticFeedback("heavy");
    }
  };

  const handleFeedback = async (type: "up" | "down") => {
    hapticFeedback("light");
    const newFeedback = feedback === type ? null : type;
    setFeedback(newFeedback);
    if (newFeedback) {
      // Play dedicated feedback sound, then transition eye emotion (skip its own sound)
      const { getSoundGenerator } = await import("@/lib/soundGenerator");
      const sound = getSoundGenerator();
      await sound.playEmotion(type === "up" ? "feedback-positive" : "feedback-negative");
      orchestrateEmotionChange(type === "up" ? "happy" : "sad", { skipSound: true });
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        const rating = type === "up" ? "positive" : "negative";
        const preview = combinedContent.slice(0, 200) + (combinedContent.length > 200 ? "..." : "");
        const { error } = await supabase.from("message_ratings").insert({
          user_id: user?.id || null,
          session_id: sessionId || null,
          message_preview: preview,
          rating,
        });
        if (error) throw error;
        toast.success(type === "up" ? "Thanks for the feedback!" : "We'll work on improving");
      } catch (err) {
        console.error("Failed to save feedback:", err);
      }
    }
  };

  const handleExpand = () => {
    hapticFeedback("light");
    setIsExpanded(true);
  };
  const handleDismiss = () => {
    hapticFeedback("light");
    onDismiss?.();
  };

  // Response content scroll tracking
  useEffect(() => {
    if (transcriptOpen) return;
    const el = contentRef.current;
    if (!el) return;
    const checkScrollState = () => {
      setIsScrollable(el.scrollHeight > el.clientHeight);
      const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 10;
      setIsAtBottom(atBottom);
      shouldAutoScrollRef.current = atBottom;
    };
    checkScrollState();
    el.addEventListener("scroll", checkScrollState, { passive: true });
    const resizeObserver = new ResizeObserver(checkScrollState);
    resizeObserver.observe(el);
    return () => {
      el.removeEventListener("scroll", checkScrollState);
      resizeObserver.disconnect();
    };
  }, [combinedContent, transcriptOpen]);

  useEffect(() => {
    if (transcriptOpen) return;
    const el = contentRef.current;
    if (el && shouldAutoScrollRef.current) {
      requestAnimationFrame(() => {
        if (contentRef.current) contentRef.current.scrollTop = contentRef.current.scrollHeight;
      });
    }
  }, [combinedContent, transcriptOpen]);

  // History scroll tracking
  const handleHistoryScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    setShowHistoryScrollDown(el.scrollHeight - el.scrollTop - el.clientHeight > 50);
  }, []);

  const scrollHistoryToBottom = useCallback(() => {
    historyScrollRef.current?.scrollTo({ top: historyScrollRef.current.scrollHeight, behavior: "smooth" });
  }, []);

  // Auto-scroll history to bottom on new messages (multi-stage for Framer Motion)
  useEffect(() => {
    if (!transcriptOpen) return;
    if (!historyScrollRef.current) return;

    const scrollToEnd = () => {
      const el = historyScrollRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    };

    // Stage 1: Immediate
    scrollToEnd();

    // Stage 2: After paint (nested RAF)
    requestAnimationFrame(() => {
      requestAnimationFrame(() => scrollToEnd());
    });

    // Stage 3: After Framer Motion animation completes
    const timer = setTimeout(scrollToEnd, 350);

    return () => clearTimeout(timer);
  }, [transcriptMessages.length, transcriptOpen]);

  // ResizeObserver for history scroll arrow (with delayed re-check for animation)
  useEffect(() => {
    if (!transcriptOpen) return;
    const el = historyScrollRef.current;
    if (!el) return;
    const checkScroll = () => {
      setShowHistoryScrollDown(el.scrollHeight - el.scrollTop - el.clientHeight > 50);
    };
    checkScroll();
    el.addEventListener("scroll", checkScroll, { passive: true });
    const observer = new ResizeObserver(checkScroll);
    observer.observe(el);
    // Delayed re-check after Framer Motion animation completes
    const timer = setTimeout(checkScroll, 350);
    return () => {
      el.removeEventListener("scroll", checkScroll);
      observer.disconnect();
      clearTimeout(timer);
    };
  }, [transcriptOpen]);

  // Dialog scroll state
  useEffect(() => {
    const el = dialogContentRef.current;
    if (!el || !isExpanded) return;
    const checkDialogScroll = () => {
      setDialogScrollable(el.scrollHeight > el.clientHeight);
      const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 10;
      setDialogAtBottom(atBottom);
      dialogShouldAutoScrollRef.current = atBottom;
    };
    checkDialogScroll();
    el.addEventListener("scroll", checkDialogScroll, { passive: true });
    const resizeObserver = new ResizeObserver(checkDialogScroll);
    resizeObserver.observe(el);
    return () => {
      el.removeEventListener("scroll", checkDialogScroll);
      resizeObserver.disconnect();
    };
  }, [isExpanded, combinedContent]);

  const scrollDialogToBottom = () => {
    const el = dialogContentRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  };

  // Hide if no content to show (but always show in history mode)
  if (!transcriptOpen && (visibleResponses.length === 0 || !combinedContent.trim())) return null;

  return (
    <>
      <AnimatePresence mode="wait">
        <motion.div
          key={transcriptOpen ? "history" : visibleResponses[0]?.id || "empty"}
          layout={false}
          className={cn(
            "relative flex flex-col",
            "w-full sm:w-[90%] md:max-w-[600px] lg:max-w-[680px]",
            "mx-2 sm:mx-auto",
            "bg-background",
            "border border-border/40",
            "shadow-md shadow-black/5 backdrop-blur-sm",
            variant === "sheet" ? "rounded-t-2xl rounded-b-lg" : "rounded-2xl",
            "overflow-hidden",
            variant === "inline" && "min-h-0",
            "h-full",
          )}
          style={{
            willChange: "transform, opacity",
            transform: "translateZ(0)",
            ...(variant === "sheet" ? { maxHeight: "min(50vh, 100%)" } : {}),
          }}
          initial={{ opacity: 0, y: 20, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 10, scale: 0.98 }}
          transition={{ duration: 0.3, ease: [0.25, 0.1, 0.25, 1] }}
        >
          {showPointer && variant !== "sheet" && !transcriptOpen && (
            <div className="absolute -top-2 left-1/2 -translate-x-1/2 w-4 h-4 rotate-45 bg-background border-l border-t border-border/40" />
          )}

          {/* Header */}
          <div className="flex-shrink-0 flex items-center justify-between px-3 py-2 bg-muted/30">
            <div className="flex items-center gap-2">
              <div className="p-1 rounded-lg bg-muted">
                <Brain className="w-3.5 h-3.5 text-foreground" />
              </div>
              <span className="text-xs font-medium text-foreground">AYN</span>
              {transcriptOpen && sortedMessages.length > 0 && (
                <span className="text-[10px] text-muted-foreground">{sortedMessages.length} messages</span>
              )}
            </div>
            {transcriptOpen ? (
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowClearConfirm(true)}
                  className="h-7 px-2 text-xs font-normal text-muted-foreground hover:text-foreground"
                >
                  Clear
                </Button>
                <button
                  onClick={onHistoryClose}
                  className="p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                  title="Close"
                >
                  <X size={14} />
                </button>
              </div>
            ) : onDismiss ? (
              <button
                onClick={handleDismiss}
                className="p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                title="Dismiss"
              >
                <X size={14} />
              </button>
            ) : null}
          </div>

          {/* Content area */}
          {transcriptOpen ? (
            /* ============================================
               HISTORY MODE — simple hard maxHeight, no flex chains
               ============================================ */
            <div className="flex-1 min-h-0 flex flex-col relative">
              {/* Scroll container — fills all available card space */}
              <div
                ref={historyScrollRef}
                onScroll={handleHistoryScroll}
                className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-2 py-2 space-y-3 [-webkit-overflow-scrolling:touch]"
              >
                {sortedMessages.length === 0 ? (
                  <div className="flex items-center justify-center py-16">
                    <p className="text-sm text-muted-foreground">No messages yet</p>
                  </div>
                ) : (
                  sortedMessages.map((msg) => {
                    const isNew = !seenMessageIdsRef.current.has(msg.id);
                    if (isNew) seenMessageIdsRef.current.add(msg.id);
                    const ts = msg.timestamp instanceof Date ? msg.timestamp : new Date(msg.timestamp);
                    return (
                      <TranscriptMessage
                        key={msg.id}
                        content={msg.content}
                        sender={msg.sender === "user" ? "user" : "ayn"}
                        timestamp={ts}
                        shouldAnimate={isNew}
                        compact
                        attachment={msg.attachment}
                        
                        onReply={onReply ? (content) => onReply(`> ${content.slice(0, 100)}\n`) : undefined}
                      />
                    );
                  })
                )}

                {/* Typing indicator */}
                {historyTyping && (
                  <div className="flex items-start gap-1.5 px-2 py-1">
                    <div className="w-5 h-5 rounded-full bg-foreground flex items-center justify-center flex-shrink-0">
                      <Brain className="w-3 h-3 text-background" />
                    </div>
                    <div className="px-3 py-1.5 rounded-2xl bg-muted/50 flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-foreground/40 animate-bounce [animation-delay:0ms]" />
                      <span className="w-1.5 h-1.5 rounded-full bg-foreground/40 animate-bounce [animation-delay:150ms]" />
                      <span className="w-1.5 h-1.5 rounded-full bg-foreground/40 animate-bounce [animation-delay:300ms]" />
                    </div>
                  </div>
                )}

                {/* Bottom padding */}
                <div className="h-6 shrink-0" />
              </div>

              {/* Scroll-to-bottom button */}
              <AnimatePresence>
                {showHistoryScrollDown && (
                  <motion.button
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                    transition={{ duration: 0.15 }}
                    onClick={scrollHistoryToBottom}
                    className="absolute bottom-3 left-1/2 -translate-x-1/2 z-10 p-1.5 rounded-full bg-foreground text-background shadow-lg hover:bg-foreground/90 transition-colors"
                    aria-label="Scroll to bottom"
                  >
                    <ChevronDown size={14} />
                  </motion.button>
                )}
              </AnimatePresence>
            </div>
          ) : (
            /* ============================================
               NORMAL RESPONSE MODE — unchanged
               ============================================ */
            <>
              <div
                ref={contentRef}
                className={cn(
                  "flex-1 min-h-0 overflow-y-auto overflow-x-hidden",
                  "[&_img]:w-full [&_img]:max-h-[200px] [&_img]:object-cover [&_img]:rounded-lg",
                  "[&>div]:px-4 [&>div]:py-3",
                  "[-webkit-overflow-scrolling:touch]",
                )}
              >
                <AnimatePresence mode="wait">
                  <motion.div
                    key={currentResponseId || "content"}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2 }}
                  >
                    {isStreaming ? (
                      <StreamingMarkdown
                        content={combinedContent}
                        speed={20}
                        onComplete={handleStreamComplete}
                        enableHaptics={isMobile}
                        className="text-sm text-foreground leading-relaxed [&_pre]:max-w-full [&_pre]:overflow-x-auto [&_pre]:bg-muted [&_pre]:rounded-lg [&_pre]:p-3"
                      />
                    ) : (
                      <MessageFormatter
                        content={combinedContent}
                        className="text-sm text-foreground leading-relaxed [&_pre]:max-w-full [&_pre]:overflow-x-auto [&_pre]:bg-muted [&_pre]:rounded-lg [&_pre]:p-3"
                      />
                    )}
                  </motion.div>
                </AnimatePresence>

                {/* Generated image display */}
                {detectedImageUrl && !combinedContent.includes(detectedImageUrl) && (
                  <div className="px-3 pb-2">
                    <img
                      src={detectedImageUrl}
                      alt="Generated image"
                      className="w-full max-w-md rounded-lg border border-border"
                      loading="lazy"
                    />
                  </div>
                )}

                {/* Document downloads handled inline via markdown links */}

              </div>

              <AnimatePresence>
                {isScrollable && !isAtBottom && (
                  <>
                    <div
                      className="absolute bottom-14 left-0 right-0 h-8 bg-gradient-to-t from-background to-transparent pointer-events-none"
                      aria-hidden="true"
                    />
                    <motion.button
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.8 }}
                      transition={{ duration: 0.15 }}
                      onClick={() => {
                        contentRef.current?.scrollTo({ top: contentRef.current.scrollHeight, behavior: "smooth" });
                        shouldAutoScrollRef.current = true;
                      }}
                      className="absolute bottom-16 left-1/2 -translate-x-1/2 z-10 p-1.5 rounded-full bg-foreground text-background shadow-lg hover:bg-foreground/90 transition-colors"
                      aria-label="Scroll to bottom"
                    >
                      <ChevronDown size={14} />
                    </motion.button>
                  </>
                )}
              </AnimatePresence>

              {/* Action bar */}
              <div className="flex-shrink-0 flex items-center justify-between px-3 py-2 border-t border-border/40">
                <div className="flex items-center gap-1">
                  <button
                    onClick={copyContent}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-border bg-background hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {copied ? (
                      <>
                        <Check size={14} className="text-green-600" />
                        <span className="text-green-600">Copied</span>
                      </>
                    ) : (
                      <>
                        <Copy size={14} />
                        <span>Copy</span>
                      </>
                    )}
                  </button>
              {(() => {
                    const docLink = documentAttachment 
                      ? { url: documentAttachment.url, title: documentAttachment.name, type: documentAttachment.type === 'excel' || documentAttachment.type?.includes('spreadsheet') ? 'excel' as const : 'pdf' as const }
                      : extractBestDocumentLink(combinedContent);
                    const hasDoc = !!docLink && docLink.url !== detectedImageUrl;
                    const hasImg = !!detectedImageUrl;
                    if (!hasDoc && !hasImg) return null;
                    const hasBoth = hasDoc && hasImg;
                    
                    if (!hasBoth) {
                      // Single-click download
                      return (
                        <button
                          onClick={async () => {
                            hapticFeedback("success");
                            try {
                              if (hasDoc) {
                                await openDocumentUrl(docLink!.url, docLink!.title || 'document');
                              } else {
                                await openDocumentUrl(detectedImageUrl!, 'ayn-image.png');
                              }
                            } catch {
                              toast.error("Download failed");
                            }
                          }}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-border bg-background hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                        >
                          <Download size={14} />
                          <span>Download</span>
                        </button>
                      );
                    }
                    
                    // Both doc + image: dropdown
                    return (
                      <div className="relative">
                        <button
                          onClick={() => setShowDownloadMenu(!showDownloadMenu)}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-border bg-background hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                        >
                          <Download size={14} />
                          <span>Download</span>
                        </button>
                        {showDownloadMenu && (
                          <div className="absolute bottom-full left-0 mb-1 bg-popover border border-border rounded-lg shadow-lg py-1 z-50 min-w-[150px]">
                            <button
                              onClick={async () => {
                                await openDocumentUrl(docLink!.url, docLink!.title || 'document');
                                setShowDownloadMenu(false);
                              }}
                              className="w-full px-3 py-1.5 text-xs text-left hover:bg-muted transition-colors"
                            >
                              {docLink!.type === 'excel' ? 'Excel (.xls)' : 'PDF (.pdf)'}
                            </button>
                            <button
                              onClick={async () => {
                                await openDocumentUrl(detectedImageUrl!, 'ayn-image.png');
                                setShowDownloadMenu(false);
                              }}
                              className="w-full px-3 py-1.5 text-xs text-left hover:bg-muted transition-colors"
                            >
                              Image (.png)
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleFeedback("up")}
                    className={cn(
                      "p-2 rounded-lg transition-colors",
                      feedback === "up"
                        ? "text-green-500 bg-green-500/10"
                        : "text-muted-foreground hover:text-green-500 hover:bg-green-500/10",
                    )}
                    aria-label="Helpful"
                  >
                    <ThumbsUp size={16} />
                  </button>
                  <button
                    onClick={() => handleFeedback("down")}
                    className={cn(
                      "p-2 rounded-lg transition-colors",
                      feedback === "down"
                        ? "text-red-500 bg-red-500/10"
                        : "text-muted-foreground hover:text-red-500 hover:bg-red-500/10",
                    )}
                    aria-label="Not helpful"
                  >
                    <ThumbsDown size={16} />
                  </button>
                  <button
                    onClick={handleExpand}
                    className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                    aria-label="Expand"
                  >
                    <Maximize2 size={16} />
                  </button>
                </div>
              </div>
            </>
          )}
        </motion.div>
      </AnimatePresence>

      {/* Reading Mode Dialog */}
      <Dialog open={isExpanded} onOpenChange={setIsExpanded}>
        <DialogContent
          className={cn(
            "flex flex-col p-0 gap-0",
            "w-screen h-[100dvh] max-w-none rounded-none",
            "sm:w-[90vw] sm:max-w-4xl sm:h-[85vh] sm:max-h-[85vh] sm:rounded-2xl",
            "bg-background",
            "border-0 sm:border sm:border-border",
            "sm:shadow-lg",
            "overflow-hidden",
          )}
        >
          <DialogHeader className="flex-shrink-0 px-5 sm:px-6 py-4 border-b border-border bg-background pr-20">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-lg bg-muted">
                <Brain className="w-5 h-5 text-foreground" />
              </div>
              <DialogTitle className="text-base font-medium">AYN Response</DialogTitle>
            </div>
          </DialogHeader>
          <div
            ref={dialogContentRef}
            className={cn(
              "flex-1 overflow-y-auto overflow-x-hidden min-h-0",
              "px-5 sm:px-8 py-6",
              "[-webkit-overflow-scrolling:touch]",
            )}
          >
            <div className="max-w-3xl mx-auto">
              <MessageFormatter
                content={combinedContent}
                className={cn(
                  "text-base sm:text-[15px] leading-relaxed sm:leading-7",
                  "text-foreground",
                  "prose prose-gray dark:prose-invert max-w-prose",
                  "[&_pre]:max-w-full [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:p-4 [&_pre]:bg-muted",
                  "[&_code]:text-sm",
                  "[&_ul]:space-y-2 [&_ol]:space-y-2",
                  "[&_h1]:text-2xl [&_h2]:text-xl [&_h3]:text-lg",
                  "[&_h1]:font-bold [&_h2]:font-semibold [&_h3]:font-medium",
                  "[&_h1]:mt-6 [&_h2]:mt-5 [&_h3]:mt-4",
                  "[&_p]:mb-4",
                )}
              />
            </div>
          </div>
          {dialogScrollable && !dialogAtBottom && (
            <>
              <div
                className="pointer-events-none absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-background to-transparent"
                aria-hidden="true"
              />
              <button
                onClick={scrollDialogToBottom}
                className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-1.5 px-4 py-2 rounded-full bg-foreground text-background text-sm font-medium shadow-lg animate-bounce"
              >
                <ChevronDown size={16} />
                <span>Scroll down</span>
              </button>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Clear history confirmation */}
      <AlertDialog open={showClearConfirm} onOpenChange={setShowClearConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear chat history?</AlertDialogTitle>
            <AlertDialogDescription>This will remove all messages from the current session.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setShowClearConfirm(false);
                onHistoryClear?.();
              }}
            >
              Clear
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export const ResponseCard = memo(ResponseCardComponent);
