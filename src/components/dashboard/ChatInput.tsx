import React, { useState, useRef, useEffect, forwardRef, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Textarea } from '@/components/ui/textarea';
import { Button, LiquidButton } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Plus, ChevronDown, ArrowUp, FileText, X, Image as ImageIcon, AlertTriangle, MessageSquarePlus, Loader2, FileImage, FileCode, FileSpreadsheet, FileArchive, FileAudio, FileVideo, File, RefreshCw, Check, Volume2, VolumeX, Brain, Sparkles, Mic, MicOff, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { useAYNEmotion } from '@/stores/emotionStore';
import { useSoundStore } from '@/stores/soundStore';
import { detectLanguage, DetectedLanguage } from '@/lib/languageDetection';
import { useSpeechRecognition } from '@/hooks/useSpeechRecognition';

import type { AIMode, Message } from '@/types/dashboard.types';
interface Suggestion {
  id: string;
  content: string;
  emoji: string;
  isVisible: boolean;
}
interface ChatInputProps {
  onSend: (message: string, file?: File | null) => void;
  suggestions?: Suggestion[];
  onSuggestionClick?: (content: string, emoji: string, position: {
    x: number;
    y: number;
  }) => void;
  isDisabled?: boolean;
  selectedMode: AIMode;
  onModeChange: (mode: AIMode) => void;
  selectedFile?: File | null;
  isUploading?: boolean;
  uploadProgress?: number;
  isDragOver?: boolean;
  onDragEnter?: (e: React.DragEvent) => void;
  onDragLeave?: (e: React.DragEvent) => void;
  onDragOver?: (e: React.DragEvent) => void;
  onDrop?: (e: React.DragEvent) => void;
  onFileSelect?: (file: File | null) => void;
  onRemoveFile?: () => void;
  fileInputRef?: React.RefObject<HTMLInputElement>;
  hasMessages?: boolean;
  sidebarOpen?: boolean;
  transcriptOpen?: boolean;
  onTranscriptToggle?: () => void;
  onTranscriptClear?: () => void;
  transcriptMessages?: Message[];
  modes?: Array<{
    name: string;
    translatedName: string;
    description?: string;
    icon: React.ComponentType<{
      className?: string;
    }>;
    color?: string;
  }>;
  prefillValue?: string;
  onPrefillConsumed?: () => void;
  onLanguageChange?: (language: DetectedLanguage) => void;
  // Empathy callback - pass typing content up for emotion detection
  onTypingContentChange?: (content: string) => void;
  // Message limit props
  hasReachedLimit?: boolean;
  messageCount?: number;
  maxMessages?: number;
  onStartNewChat?: () => void;
  // Upload retry props
  uploadFailed?: boolean;
  onRetryUpload?: () => void;
  // Maintenance mode
  maintenanceActive?: boolean;
  // Credits exhausted - blocks sending
  creditsExhausted?: boolean;
  // AYN is generating a response
  isTyping?: boolean;
  // Mode locked for this session — can't switch until new chat
  modeLocked?: boolean;
}
// Default modes - only used as fallback
const defaultModes = [{
  name: 'General',
  translatedName: 'AYN',
  icon: '🧠'
}];
const placeholders = ["Ask me anything...", "What's on your mind?", "How can I help you today?", "Type your question here..."];
const getSendButtonClass = (mode: string) => {
  const modeName = mode.toLowerCase();
  if (modeName.includes('general')) return 'bg-foreground text-background';
  if (modeName.includes('research')) return 'bg-green-600 text-white';
  if (modeName.includes('pdf')) return 'bg-purple-600 text-white';
  if (modeName.includes('vision')) return 'bg-orange-600 text-white';
  if (modeName.includes('civil')) return 'bg-teal-600 text-white';
  return 'bg-foreground text-background';
};
// Get file extension from filename
const getFileExtension = (filename: string): string => {
  return filename.split('.').pop()?.toLowerCase() || '';
};

// FileTypeIcon component - shows different icons based on file extension
const FileTypeIcon = ({
  filename,
  className
}: {
  filename: string;
  className?: string;
}) => {
  const ext = getFileExtension(filename);

  // PDF files
  if (ext === 'pdf') {
    return <FileText className={cn(className, "text-red-400")} />;
  }

  // Image files
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'ico', 'heic'].includes(ext)) {
    return <FileImage className={cn(className, "text-emerald-400")} />;
  }

  // Code files
  if (['js', 'ts', 'jsx', 'tsx', 'html', 'css', 'json', 'xml', 'py', 'java', 'cpp', 'c', 'go', 'rs', 'php', 'rb', 'swift', 'kt'].includes(ext)) {
    return <FileCode className={cn(className, "text-blue-400")} />;
  }

  // Spreadsheet files
  if (['xls', 'xlsx', 'csv', 'numbers'].includes(ext)) {
    return <FileSpreadsheet className={cn(className, "text-green-400")} />;
  }

  // Archive files
  if (['zip', 'rar', '7z', 'tar', 'gz', 'bz2'].includes(ext)) {
    return <FileArchive className={cn(className, "text-amber-400")} />;
  }

  // Audio files
  if (['mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a', 'wma'].includes(ext)) {
    return <FileAudio className={cn(className, "text-purple-400")} />;
  }

  // Video files
  if (['mp4', 'avi', 'mov', 'wmv', 'mkv', 'webm', 'flv'].includes(ext)) {
    return <FileVideo className={cn(className, "text-pink-400")} />;
  }

  // Document files (Word, etc.)
  if (['doc', 'docx', 'txt', 'rtf', 'odt', 'pages'].includes(ext)) {
    return <FileText className={cn(className, "text-blue-400")} />;
  }

  // Default file icon
  return <File className={cn(className, "text-neutral-400")} />;
};
const getFileIcon = (file: File) => {
  if (file.type.startsWith('image/')) return <FileImage className="w-4 h-4 text-emerald-400" />;
  return <FileText className="w-4 h-4 text-neutral-400" />;
};
const formatFileSize = (bytes: number) => {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
};
export const ChatInput = forwardRef<HTMLDivElement, ChatInputProps>(({
  onSend,
  suggestions = [],
  onSuggestionClick,
  isDisabled = false,
  selectedMode = 'General' as AIMode,
  onModeChange,
  selectedFile = null,
  isUploading = false,
  uploadProgress = 0,
  isDragOver = false,
  onDragEnter,
  onDragLeave,
  onDragOver,
  onDrop,
  onFileSelect,
  onRemoveFile,
  fileInputRef,
  transcriptOpen = false,
  onTranscriptToggle,
  onTranscriptClear,
  transcriptMessages = [],
  modes,
  prefillValue = '',
  onPrefillConsumed,
  onLanguageChange,
  onTypingContentChange,
  hasReachedLimit = false,
  messageCount = 0,
  maxMessages = 100,
  onStartNewChat,
  uploadFailed = false,
  onRetryUpload,
  maintenanceActive = false,
  creditsExhausted = false,
  isTyping = false,
  modeLocked = false
}, ref) => {
  const navigate = useNavigate();
  const [inputMessage, setInputMessage] = useState('');
  const visibleSuggestions = suggestions.filter(s => s.isVisible);
  const handleSuggestionClickInternal = (suggestion: Suggestion, e: React.MouseEvent<HTMLButtonElement>) => {
    if (!onSuggestionClick) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    onSuggestionClick(suggestion.content, suggestion.emoji, {
      x,
      y
    });
  };
  const [isInputFocused, setIsInputFocused] = useState(false);
  const [currentPlaceholder, setCurrentPlaceholder] = useState(0);
  const [showPlaceholder, setShowPlaceholder] = useState(true);
  const [detectedLang, setDetectedLang] = useState<DetectedLanguage | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const languageTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pendingCursorRef = useRef<number | null>(null);

  // Reposition cursor after React re-renders with pasted content
  useEffect(() => {
    if (pendingCursorRef.current !== null && textareaRef.current) {
      textareaRef.current.selectionStart = pendingCursorRef.current;
      textareaRef.current.selectionEnd = pendingCursorRef.current;
      textareaRef.current.scrollTop = textareaRef.current.scrollHeight;
      pendingCursorRef.current = null;
    }
  }, [inputMessage]);
  const {
    setIsUserTyping,
    setIsAttentive,
    updateActivity,
    triggerAttentionBlink,
    bumpActivity
  } = useAYNEmotion();
  const soundContext = useSoundStore();
  const playSound = soundContext?.playSound;
  const playModeChange = soundContext?.playModeChange;

  // Voice-to-text integration
  const {
    isSupported: voiceSupported,
    isListening: isVoiceListening,
    transcript: voiceTranscript,
    interimTranscript: voiceInterim,
    error: voiceError,
    startListening: startVoice,
    stopListening: stopVoice,
    resetTranscript: resetVoice
  } = useSpeechRecognition();

  // Handle prefilled input
  useEffect(() => {
    if (prefillValue) {
      setInputMessage(prefillValue);
      setShowPlaceholder(false);
      // Auto-resize textarea after React updates DOM
      setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.focus();
        }
      }, 0);
      if (onPrefillConsumed) onPrefillConsumed();
    }
  }, [prefillValue, onPrefillConsumed]);

  // Voice transcript integration - append transcript to input as it comes in
  useEffect(() => {
    if (voiceTranscript || voiceInterim) {
      const displayText = voiceTranscript + (voiceInterim ? voiceInterim : '');
      setInputMessage(displayText);
      setShowPlaceholder(!displayText);

    }
  }, [voiceTranscript, voiceInterim]);

  // Trigger AYN eye attention when voice listening starts
  useEffect(() => {
    if (isVoiceListening) {
      triggerAttentionBlink();
      setIsAttentive(true);
    }
  }, [isVoiceListening, triggerAttentionBlink, setIsAttentive]);

  // Handle voice toggle
  const handleVoiceToggle = useCallback(() => {
    if (isVoiceListening) {
      stopVoice();
    } else {
      startVoice();
    }
  }, [isVoiceListening, startVoice, stopVoice]);

  // Rotate placeholders
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentPlaceholder(prev => (prev + 1) % placeholders.length);
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  // Track typing state to only trigger context updates on start/stop
  const wasTypingRef = useRef(false);

  // Optimized typing detection - only update context on START/STOP transitions
  useEffect(() => {
    const hasContent = inputMessage.trim().length > 0;

    // Only notify when STARTING to type (first character)
    if (hasContent && !wasTypingRef.current) {
      setIsUserTyping(true);
      setIsAttentive(true);
      updateActivity();
      wasTypingRef.current = true;
    }

    // Handle empty input - stopped typing
    if (!hasContent && wasTypingRef.current) {
      setIsUserTyping(false);
      setDetectedLang(null);
      onTypingContentChange?.('');
      wasTypingRef.current = false;
    }

    // Stop typing timeout (debounced)
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      setIsUserTyping(false);
      wasTypingRef.current = false;
    }, 1000);

    // Detect language after a brief pause (keep 200ms debounce)
    if (hasContent) {
      if (languageTimeoutRef.current) clearTimeout(languageTimeoutRef.current);
      languageTimeoutRef.current = setTimeout(() => {
        if (inputMessage.trim().length > 2) {
          const langResult = detectLanguage(inputMessage);
          setDetectedLang(langResult);
          onLanguageChange?.(langResult);
        }
      }, 200);
    }
    return () => {
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      if (languageTimeoutRef.current) clearTimeout(languageTimeoutRef.current);
    };
  }, [inputMessage, setIsUserTyping, setIsAttentive, updateActivity, onLanguageChange, onTypingContentChange]);
  const handleSend = useCallback(() => {
    if (!inputMessage.trim() && !selectedFile) return;
    if (isDisabled || isUploading || hasReachedLimit || creditsExhausted) return;
    // Sound removed - consolidated to absorption in CenterStageLayout
    bumpActivity(); // Increase activity level on message send
    onSend(inputMessage.trim(), selectedFile);
    setInputMessage('');
    setShowPlaceholder(true);
    setDetectedLang(null);

    // NOTE: File removal is handled by CenterStageLayout after animation
    // Do NOT call onRemoveFile here to avoid race condition

    if (textareaRef.current) {
      textareaRef.current.style.height = '44px';
    }
    setTimeout(() => {
      triggerAttentionBlink();
    }, 100);
  }, [inputMessage, selectedFile, isDisabled, isUploading, hasReachedLimit, creditsExhausted, onSend, triggerAttentionBlink, bumpActivity]);
  const handleKeyPress = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }, [handleSend]);
  const resizeRafRef = useRef<number | null>(null);
  const handleTextareaChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setInputMessage(value);
    setShowPlaceholder(!value);

    // Auto-resize textarea up to max height
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = `${Math.min(textarea.scrollHeight, 150)}px`;
    }
  }, []);
  const handleFileClick = useCallback(() => {
    fileInputRef?.current?.click();
  }, [fileInputRef]);
  const handleRemoveFile = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (onRemoveFile) onRemoveFile();
  }, [onRemoveFile]);
  const handleFileInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && onFileSelect) {
      onFileSelect(file);
    }
  }, [onFileSelect]);
  return <div className={cn("relative w-full transition-[padding] duration-200 px-2 sm:px-4 pb-3")} onDragEnter={onDragEnter} onDragLeave={onDragLeave} onDragOver={onDragOver} onDrop={onDrop}>

      {/* Main container */}
      <div className={cn("relative mx-auto max-w-4xl bg-background/95 border border-border/50 rounded-2xl shadow-lg overflow-hidden transition-[border-color,box-shadow] duration-300", isDragOver && "border-primary shadow-xl", isInputFocused && "border-border ring-1 ring-accent/30 shadow-xl")}>
        
        
        
        {/* Drag overlay - INSIDE the card container for proper sizing */}
        <AnimatePresence>
          {isDragOver && <motion.div initial={{
          opacity: 0
        }} animate={{
          opacity: 1
        }} exit={{
          opacity: 0
        }} className="absolute inset-0 bg-primary/10 border-2 border-dashed border-primary rounded-2xl flex items-center justify-center z-30 pointer-events-none">
              <p className="text-primary font-medium">Drop file here</p>
            </motion.div>}
        </AnimatePresence>

        {/* Limit reached inline banner */}
        {hasReachedLimit && !maintenanceActive && !creditsExhausted && (
          <div className="px-4 pt-2 text-center">
            <span className="text-xs text-muted-foreground">
              Message limit reached — tap <strong>+ New</strong> to start a new chat
            </span>
          </div>
        )}

        {/* Credits exhausted overlay */}
        <AnimatePresence>
          {creditsExhausted && !maintenanceActive && <motion.div initial={{
          opacity: 0
        }} animate={{
          opacity: 1
        }} exit={{
          opacity: 0
        }} className="absolute inset-0 bg-background/95 backdrop-blur-sm flex flex-col items-center justify-center gap-3 z-20 rounded-2xl px-4">
              <div className="flex items-center gap-2 text-destructive">
                <AlertTriangle className="w-5 h-5" />
                <span className="font-medium">Daily Limit Reached</span>
              </div>
              <p className="text-sm text-muted-foreground text-center">
                You've used all your messages for today. Come back tomorrow or upgrade for more.
              </p>
              <Button onClick={() => navigate('/dashboard/pricing')} size="sm" className="gap-2 bg-foreground text-background hover:bg-foreground/90 border-0 font-medium">
                <Sparkles className="w-4 h-4" />
                Upgrade Plan
              </Button>
            </motion.div>}
        </AnimatePresence>
        {/* Row 1: Input area with flexbox layout */}
        <div className="flex items-end gap-3 px-4 pt-3 pb-2">
          <div className="relative flex-1 min-w-0">
            <Textarea ref={textareaRef} value={inputMessage} onChange={handleTextareaChange} onKeyDown={handleKeyPress} onFocus={() => setIsInputFocused(true)} onBlur={() => setIsInputFocused(false)} onPaste={(e) => { e.preventDefault(); const text = e.clipboardData.getData('text/plain'); const ta = textareaRef.current; if (ta) { const start = ta.selectionStart; const end = ta.selectionEnd; const before = inputMessage.slice(0, start); const after = inputMessage.slice(end); const newVal = before + text + after; setInputMessage(newVal); setShowPlaceholder(!newVal); pendingCursorRef.current = start + text.length; } else { setInputMessage(prev => prev + text); setShowPlaceholder(false); } }} disabled={isDisabled || isUploading || hasReachedLimit || creditsExhausted} className={cn("w-full resize-none h-[44px]", "text-base bg-transparent", "border-0 focus-visible:ring-0 focus-visible:ring-offset-0", "text-foreground placeholder:text-muted-foreground", "disabled:opacity-50 disabled:cursor-not-allowed", "leading-relaxed", "overflow-y-auto", "px-2 py-2")} />

            {/* Typewriter placeholder */}
            {showPlaceholder && !inputMessage && !isInputFocused && <div className="absolute top-[10px] left-[10px] pointer-events-none">
                <motion.span key={currentPlaceholder} initial={{
              opacity: 0,
              y: 5
            }} animate={{
              opacity: 0.5,
              y: 0
            }} exit={{
              opacity: 0,
              y: -5
            }} transition={{
              duration: 0.3
            }} className="text-muted-foreground text-base md:text-lg">
                  {placeholders[currentPlaceholder]}
                </motion.span>
              </div>}
          </div>

          {/* Send button - flexbox aligned to bottom */}
          <AnimatePresence>
            {(inputMessage.trim() || selectedFile) && !isDisabled && (
              <motion.div
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0, opacity: 0 }}
                transition={{ duration: 0.15, ease: "easeOut" }}
                className="shrink-0 mb-1"
              >
                <LiquidButton
                  size="sm"
                  onClick={handleSend}
                  disabled={isDisabled || isUploading}
                  className={cn(
                    "w-10 h-10 px-0",
                    "disabled:cursor-not-allowed",
                    isUploading && "opacity-70 cursor-wait"
                  )}
                >
                  {isUploading
                    ? <Loader2 className="w-5 h-5 animate-spin" />
                    : <ArrowUp className="w-5 h-5" strokeWidth={2.5} />}
                </LiquidButton>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Premium File Chip with Upload Progress */}
        <AnimatePresence>
          {selectedFile && <motion.div initial={{
          height: 0,
          opacity: 0
        }} animate={{
          height: 'auto',
          opacity: 1
        }} exit={{
          height: 0,
          opacity: 0
        }} className="px-4 pb-3 overflow-hidden">
              <motion.div initial={{
            scale: 0.95,
            opacity: 0,
            y: 5
          }} animate={{
            scale: 1,
            opacity: 1,
            y: 0
          }} exit={{
            scale: 0.95,
            opacity: 0,
            y: -5
          }} transition={{
            duration: 0.2,
            ease: "easeOut"
          }} className={cn("relative inline-flex items-center gap-2.5", "px-3.5 py-2.5 rounded-2xl", "bg-neutral-900 dark:bg-neutral-950", "border border-neutral-700/50", "shadow-lg shadow-black/20", "max-w-[320px]", "overflow-hidden")}>
                {/* Progress bar background */}
                {isUploading && <motion.div initial={{
              width: '0%'
            }} animate={{
              width: `${uploadProgress}%`
            }} className="absolute inset-0 bg-primary/20 rounded-2xl" transition={{
              duration: 0.3,
              ease: "easeOut"
            }} />}
                
                {/* Failed upload indicator */}
                {uploadFailed && !isUploading && <div className="absolute inset-0 bg-red-500/10 rounded-2xl" />}
                
                {/* File Icon based on file type or status */}
                <div className={cn("relative shrink-0", isUploading && "animate-pulse")}>
                  {isUploading ? <Loader2 className="w-4 h-4 text-primary animate-spin" /> : uploadFailed ? <AlertTriangle className="w-4 h-4 text-red-400" /> : <FileTypeIcon filename={selectedFile.name} className="w-4 h-4" />}
                </div>
                
                {/* Filename - truncated */}
                <span className={cn("text-sm truncate max-w-[100px] font-medium relative z-10", uploadFailed ? "text-red-300" : "text-neutral-200")}>
                  {selectedFile.name}
                </span>
                
                {/* File size, Upload progress, or Failed status */}
                <span className={cn("text-xs shrink-0 relative z-10 min-w-[48px] text-right", uploadFailed ? "text-red-400" : "text-neutral-500")}>
                  {isUploading ? `${uploadProgress}%` : uploadFailed ? 'Failed' : formatFileSize(selectedFile.size)}
                </span>
                
                {/* Retry button - shown when upload failed */}
                {uploadFailed && !isUploading && onRetryUpload && <button onClick={e => {
              e.stopPropagation();
              onRetryUpload();
            }} className="p-1 rounded-full bg-amber-500/20 hover:bg-amber-500/40 transition-colors shrink-0 relative z-10" title="Retry upload">
                    <RefreshCw className="w-3.5 h-3.5 text-amber-400 hover:text-amber-300 transition-colors" />
                  </button>}
                
                {/* Remove button - hidden while uploading */}
                {!isUploading && <button onClick={handleRemoveFile} className="p-1 rounded-full hover:bg-neutral-700/60 transition-colors shrink-0 relative z-10">
                    <X className="w-3.5 h-3.5 text-neutral-400 hover:text-neutral-200 transition-colors" />
                  </button>}
              </motion.div>
            </motion.div>}
        </AnimatePresence>

        {/* Row 2: Toolbar - 3-column grid: left actions | center history | right info */}
        <div className="grid grid-cols-3 items-center px-2 sm:px-3 py-1.5 sm:py-2 border-t border-border/30 bg-muted/20">
          {/* Left: Action buttons */}
          <div className="flex items-center gap-0.5 sm:gap-2">
            {/* + New pill button */}
            <button
              onClick={onStartNewChat}
              disabled={!onStartNewChat}
              className={cn(
                "inline-flex items-center gap-1 px-2.5 sm:px-3 py-1 rounded-full border text-xs sm:text-sm transition-all",
                hasReachedLimit
                  ? "bg-foreground text-background border-foreground animate-pulse shadow-md"
                  : "border-border text-muted-foreground hover:bg-muted/60 hover:text-foreground"
              )}
            >
              <Plus className="w-3.5 h-3.5" />
              <span>New</span>
            </button>

            <button onClick={handleFileClick} disabled={isDisabled || isUploading || hasReachedLimit} className={cn("p-1.5 sm:p-2 rounded-lg", "hover:bg-muted/60", "transition-all duration-200", "disabled:opacity-50 disabled:cursor-not-allowed")}>
              <Plus className="w-4 h-4 sm:w-5 sm:h-5 text-muted-foreground" />
            </button>
            
            {voiceSupported && <button onClick={handleVoiceToggle} disabled={isDisabled || isUploading} className={cn("relative p-1.5 sm:p-2 rounded-lg", "transition-all duration-200", "disabled:opacity-50 disabled:cursor-not-allowed", isVoiceListening ? "bg-red-500/20 hover:bg-red-500/30" : "hover:bg-muted/60")} title={isVoiceListening ? "Stop voice input" : "Start voice input"}>
                {isVoiceListening ? <>
                    <motion.div className="absolute inset-0 rounded-lg bg-red-500/30" animate={{
                scale: [1, 1.2, 1],
                opacity: [0.5, 0.2, 0.5]
              }} transition={{
                duration: 1.5,
                repeat: Infinity,
                ease: "easeInOut"
              }} />
                    <Mic className="w-4 h-4 text-red-500 relative z-10" />
                    <motion.span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-red-500 rounded-full z-10" animate={{
                opacity: [1, 0.5, 1]
              }} transition={{
                duration: 0.8,
                repeat: Infinity
              }} />
                  </> : <Mic className="w-4 h-4 text-muted-foreground" />}
              </button>}
            
            <button onClick={() => soundContext?.toggleEnabled()} className={cn("hidden sm:block p-1.5 sm:p-2 rounded-lg", "hover:bg-muted/60", "transition-all duration-200")} title={soundContext?.enabled ? "Sound on - click to mute" : "Sound off - click to enable"}>
              {soundContext?.enabled ? <Volume2 className="w-4 h-4 text-muted-foreground" /> : <VolumeX className="w-4 h-4 text-muted-foreground/50" />}
            </button>
          </div>

          {/* Center: History Toggle Button */}
          <div className="flex justify-center">
            {transcriptMessages.length > 0 && onTranscriptToggle && <button onClick={onTranscriptToggle} className={cn("inline-flex items-center gap-1 sm:gap-2 px-2.5 sm:px-4 py-1 sm:py-1.5 rounded-full", "border border-border bg-card/80 backdrop-blur-sm", "text-xs sm:text-sm text-muted-foreground shadow-sm", "hover:bg-muted/50 hover:text-foreground hover:shadow-md", "active:scale-95 transition-all cursor-pointer", transcriptOpen && "bg-muted/60")}>
                <Clock className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                <span className="hidden sm:inline">History</span>
                <span className="text-[10px] sm:text-xs bg-muted px-1 sm:px-1.5 py-0.5 rounded-full">{messageCount > 0 ? messageCount : transcriptMessages.length}</span>
              </button>}
          </div>

          {/* Right: Counter + Mode Switcher */}
          <div className="flex items-center justify-end gap-1.5 sm:gap-2">
            {messageCount > 0 && <div className={cn("text-[10px] sm:text-xs px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-md", hasReachedLimit ? "bg-destructive/10 text-destructive" : messageCount >= maxMessages * 0.8 ? "bg-amber-500/10 text-amber-600 dark:text-amber-400" : "text-muted-foreground")}>
                {messageCount}/{maxMessages}
              </div>}

            {/* Mode Switcher */}
            {modes && modes.length > 1 ? (
              modeLocked ? (
                /* LOCKED — show current mode with lock icon, tooltip explains */
                <div
                  className={cn(
                    "relative group h-8 sm:h-9 px-2 sm:px-3 rounded-xl flex items-center gap-1.5",
                    "border border-border/25 text-xs sm:text-sm font-medium cursor-not-allowed opacity-60"
                  )}
                  title="Mode locked — start a new chat to switch"
                >
                  <span className={cn(
                    "w-2 h-2 rounded-full shrink-0",
                    selectedMode === 'Business' ? "bg-emerald-400" : "bg-foreground"
                  )} />
                  <span className="hidden sm:inline text-muted-foreground">
                    {selectedMode === 'Business' ? 'Business' : 'AYN'}
                  </span>
                  <Brain className="w-4 h-4 sm:hidden text-muted-foreground" />
                  <svg className="w-3 h-3 text-muted-foreground/50 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                  </svg>
                  {/* Tooltip on hover */}
                  <div className="absolute bottom-full right-0 mb-2 hidden group-hover:block z-50 pointer-events-none">
                    <div className="bg-popover border border-border rounded-lg px-3 py-2 text-xs text-muted-foreground shadow-lg whitespace-nowrap">
                      Mode locked for this chat
                      <br />
                      <span className="text-foreground/60">Tap <strong>+ New</strong> to switch mode</span>
                    </div>
                  </div>
                </div>
              ) : (
                /* UNLOCKED — full switcher, pick before first message */
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button className={cn(
                      "h-8 sm:h-9 px-2 sm:px-3 rounded-xl flex items-center gap-1.5",
                      "border border-border/40 hover:border-border/80",
                      "transition-all duration-200 hover:bg-muted/40",
                      "text-xs sm:text-sm font-medium"
                    )}>
                      <span className={cn(
                        "w-2 h-2 rounded-full shrink-0",
                        selectedMode === 'Business' ? "bg-emerald-400" : "bg-foreground"
                      )} />
                      <span className="hidden sm:inline">
                        {selectedMode === 'Business' ? 'Business' : 'AYN'}
                      </span>
                      <Brain className="w-4 h-4 sm:hidden text-foreground" />
                      <ChevronDown className="w-3 h-3 text-muted-foreground shrink-0" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-64 mb-1">
                    <div className="px-3 py-2 border-b border-border/40">
                      <p className="text-[11px] text-muted-foreground leading-snug">
                        Choose mode before your first message — locks for this chat
                      </p>
                    </div>
                    {modes.map((mode) => (
                      <DropdownMenuItem
                        key={mode.name}
                        onClick={() => onModeChange(mode.name as AIMode)}
                        className={cn(
                          "flex flex-col items-start gap-0.5 px-3 py-2.5 cursor-pointer",
                          selectedMode === mode.name && "bg-muted"
                        )}
                      >
                        <div className="flex items-center gap-2 w-full">
                          <span className={cn(
                            "w-2 h-2 rounded-full shrink-0",
                            mode.name === 'Business' ? "bg-emerald-400" : "bg-foreground"
                          )} />
                          <span className="font-medium text-sm">
                            {mode.name === 'General' ? 'AYN' : mode.name}
                          </span>
                          {selectedMode === mode.name && (
                            <Check className="w-3.5 h-3.5 ml-auto text-primary" />
                          )}
                        </div>
                        {mode.description && (
                          <span className="text-[11px] text-muted-foreground pl-4 leading-snug">
                            {mode.description}
                          </span>
                        )}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              )
            ) : (
              <div className="h-8 sm:h-9 px-2 sm:px-3 rounded-xl flex items-center gap-1.5 sm:gap-2 text-muted-foreground">
                <Brain className="w-4 h-4 sm:w-5 sm:h-5 text-foreground" />
                <span className="hidden sm:inline text-xs sm:text-sm font-medium">AYN</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* AI Disclaimer */}
      <p className="text-xs text-muted-foreground/60 text-center mt-2 max-w-4xl mx-auto">
        AYN is AI and can make mistakes. Always verify critical details.
      </p>

      {/* Hidden file input */}
      <input ref={fileInputRef} type="file" className="hidden" accept=".pdf,.xlsx,.xls,.csv,.txt,.json,.xml,.html,.htm,.jpg,.jpeg,.png,.gif,.webp,.bmp,.svg" onChange={handleFileInputChange} />

    </div>;
});
ChatInput.displayName = 'ChatInput';
export default ChatInput;