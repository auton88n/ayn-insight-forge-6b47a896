import { motion, AnimatePresence } from 'framer-motion';
import { useRef, useState, useEffect, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { Brain, Copy, Check } from 'lucide-react';
import { MessageFormatter } from '@/components/shared/MessageFormatter';
import type { BubbleType } from '@/lib/emotionMapping';
import { AYNReportCard } from '@/components/eye/AYNReportCard';
import { parseReport } from '@/lib/reportParser';

interface AYNSpeechBubbleProps {
  id: string;
  content: string;
  type: BubbleType;
  isVisible: boolean;
  onDismiss?: () => void;
  position?: { x: number; y: number };
}

export const AYNSpeechBubble = ({
  id,
  content,
  type,
  isVisible,
}: AYNSpeechBubbleProps) => {
  const contentRef = useRef<HTMLDivElement>(null);
  const [isScrollable, setIsScrollable] = useState(false);
  const [isAtBottom, setIsAtBottom] = useState(true);
  // Ref avoids race conditions during rapid content updates
  const shouldAutoScrollRef = useRef(true);
  const [copied, setCopied] = useState(false);

  // Clean content - remove leading punctuation and whitespace
  const cleanedContent = content.replace(/^[!?\s]+/, '').trim();

  // Parse structured report — memoized so it only recalculates when content changes
  const report = useMemo(() => parseReport(cleanedContent), [cleanedContent]);

  const copyContent = async () => {
    try {
      await navigator.clipboard.writeText(cleanedContent);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  // Check if content is scrollable and track scroll position
  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;

    const checkScrollState = () => {
      const scrollable = el.scrollHeight > el.clientHeight;
      setIsScrollable(scrollable);
      
      const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 10;
      setIsAtBottom(atBottom);
      shouldAutoScrollRef.current = atBottom;
    };

    checkScrollState();
    el.addEventListener('scroll', checkScrollState, { passive: true });
    
    // Re-check when content changes
    const resizeObserver = new ResizeObserver(checkScrollState);
    resizeObserver.observe(el);

    return () => {
      el.removeEventListener('scroll', checkScrollState);
      resizeObserver.disconnect();
    };
  }, [cleanedContent]);

  // Auto-scroll to bottom when new content arrives
  useEffect(() => {
    const el = contentRef.current;
    if (el && shouldAutoScrollRef.current) {
      requestAnimationFrame(() => {
        if (!contentRef.current) return;
        contentRef.current.scrollTop = contentRef.current.scrollHeight;
      });
    }
  }, [cleanedContent]);

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          key={id}
          className={cn(
            "relative z-40 group",
            // Responsive width - fit content up to max width
            "w-fit min-w-[200px] max-w-[calc(100vw-2rem)] sm:max-w-[600px]",
            // Premium white glass card
            "bg-white/98 dark:bg-gray-900/95",
            "backdrop-blur-xl",
            // Elegant soft shadows with hover effect
            "shadow-[0_4px_24px_rgba(0,0,0,0.06),0_2px_8px_rgba(0,0,0,0.03)]",
            "hover:shadow-[0_6px_28px_rgba(0,0,0,0.08),0_3px_10px_rgba(0,0,0,0.04)]",
            "transition-shadow",
            // Subtle border
            "border border-gray-200/60 dark:border-gray-800/50",
            // Rounded speech bubble shape
            "px-5 py-4 rounded-2xl rounded-bl-md"
          )}
          initial={{
            x: -20,
            scale: 0.9,
            opacity: 0,
          }}
          animate={{
            x: 0,
            scale: 1,
            opacity: 1,
          }}
          exit={{
            x: -20,
            scale: 0.9,
            opacity: 0,
          }}
          transition={{
            type: 'spring',
            stiffness: 300,
            damping: 25,
          }}
        >
          {/* Small AYN badge in corner */}
          <div className="absolute -left-2 -top-2 w-7 h-7 rounded-full bg-white dark:bg-gray-900 shadow-md border border-gray-100 dark:border-gray-800 flex items-center justify-center">
            <Brain className="w-3.5 h-3.5 text-gray-500 dark:text-gray-400" />
          </div>

          {/* Copy button - shows on hover */}
          <button
            onClick={copyContent}
            className={cn(
              "absolute right-2 top-2 p-1.5 rounded-md z-10",
              "bg-muted/80 hover:bg-muted",
              "opacity-0 group-hover:opacity-100 transition-opacity",
              "text-muted-foreground hover:text-foreground"
            )}
            title="Copy response"
          >
            {copied ? (
              <Check size={14} className="text-green-500" />
            ) : (
              <Copy size={14} />
            )}
          </button>
          
          {/* Content with markdown formatting and scrolling */}
          <div 
            ref={contentRef}
            className={cn(
              "speech-bubble-content",
              "max-h-[450px] overflow-y-auto overflow-x-hidden",
              // Word wrapping
              "break-words",
              // Premium scrollbar styling - more visible
              "[&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar]:h-2",
              "[&::-webkit-scrollbar-track]:bg-muted/30",
              "[&::-webkit-scrollbar-track]:rounded-full",
              "[&::-webkit-scrollbar-thumb]:bg-gray-300 dark:[&::-webkit-scrollbar-thumb]:bg-gray-600",
              "[&::-webkit-scrollbar-thumb]:rounded-full",
              "[&::-webkit-scrollbar-thumb]:hover:bg-gray-400 dark:[&::-webkit-scrollbar-thumb]:hover:bg-gray-500",
              // iOS touch scrolling
              "[-webkit-overflow-scrolling:touch]",
              // Padding for copy button
              "pr-6"
            )}
            style={{ wordWrap: 'break-word', overflowWrap: 'break-word' }}
          >
            <MessageFormatter 
              content={cleanedContent} 
              className="text-sm text-gray-700 dark:text-gray-200 leading-relaxed [&_p]:mb-2 [&_p:last-child]:mb-0 [&_strong]:text-gray-900 dark:[&_strong]:text-white max-w-prose break-words" 
            />
          </div>

          {/* Fade gradient indicator when scrollable and not at bottom */}
          {isScrollable && !isAtBottom && (
            <div 
              className="absolute bottom-0 left-0 right-0 h-10 bg-gradient-to-t from-white dark:from-gray-900 to-transparent pointer-events-none rounded-b-2xl"
              aria-hidden="true"
            />
          )}

          {/* AYN Report Card — renders below the reply when content is report-worthy */}
          {report && (
            <AYNReportCard
              report={report}
              className="mt-3"
            />
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
};
