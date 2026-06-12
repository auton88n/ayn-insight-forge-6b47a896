import { useRef, useCallback, useEffect, useState, useMemo } from "react";
import { cn, debounce } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { EmotionalEye } from "@/components/eye/EmotionalEye";
import { UserMessageBubble } from "@/components/eye/UserMessageBubble";

import { ResponseCard } from "@/components/eye/ResponseCard";
import { FlyingSuggestionBubble } from "@/components/eye/FlyingSuggestionBubble";

import { ChatInput } from "./ChatInput";
import { SystemNotificationBanner } from "./SystemNotificationBanner";
import { BetaBadge } from "@/components/ui/BetaBadge";

import { BetaFeedbackModal } from "./BetaFeedbackModal";
import { useBubbleAnimation } from "@/hooks/useBubbleAnimation";
import { useAYNEmotion, AYNEmotion } from "@/stores/emotionStore";
import { useSoundStore } from "@/stores/soundStore";
import { getBubbleType } from "@/lib/emotionMapping";
import { supabase } from "@/integrations/supabase/client";
import { useIsMobile } from "@/hooks/use-mobile";
import { hapticFeedback } from "@/lib/haptics";
import { useEmotionOrchestrator } from "@/hooks/useEmotionOrchestrator";
import { useEmpathyReaction } from "@/hooks/useEmpathyReaction";
import type { Message, AIMode, AIModeConfig } from "@/types/dashboard.types";

// Fallback suggestions when API fails
const DEFAULT_SUGGESTIONS = [
  { content: "Tell me more", emoji: "💬" },
  { content: "Explain simpler", emoji: "🔍" },
  { content: "Give examples", emoji: "📝" },
];

interface CenterStageLayoutProps {
  messages: Message[];
  onSendMessage: (content: string, file?: File | null) => Promise<void>;
  isTyping: boolean;
  isGeneratingDocument?: boolean;
  isGeneratingFloorPlan?: boolean;
  documentType?: "pdf" | "excel" | null;
  isDisabled: boolean;
  selectedMode: AIMode;
  selectedFile: File | null;
  isUploading: boolean;
  uploadProgress?: number;
  isDragOver: boolean;
  onFileSelect: (file: File | null) => void;
  onRemoveFile: () => void;
  onDragEnter: (e: React.DragEvent) => void;
  onDragLeave: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
  fileInputRef: React.RefObject<HTMLInputElement>;
  sidebarOpen: boolean;
  transcriptOpen?: boolean;
  onTranscriptToggle?: () => void;
  onTranscriptClear?: () => void;
  onReply?: (content: string) => void;
  modes: AIModeConfig[];
  onModeChange: (mode: AIMode) => void;
  modeLocked?: boolean;
  prefillValue?: string;
  onPrefillConsumed?: () => void;
  onLanguageChange?: (language: { code: string; flag: string; name: string }) => void;
  hasReachedLimit?: boolean;
  messageCount?: number;
  maxMessages?: number;
  onStartNewChat?: () => void;
  lastSuggestedEmotion?: string | null;
  uploadFailed?: boolean;
  onRetryUpload?: () => void;
  remaining?: number;
  totalLimit?: number;
  allowed?: boolean;
  isFree?: boolean;
  isUnlimited?: boolean;
  resetsAt?: string | null;
  isUsageLoading?: boolean;
  tier?: string;
  isLoadingFromHistory?: boolean;
  currentSessionId?: string;
  isTransitioningToChat?: boolean;
  maintenanceConfig?: {
    enabled?: boolean;
    message?: string;
    startTime?: string;
    endTime?: string;
    preMaintenanceNotice?: boolean;
    preMaintenanceMessage?: string;
  };
  betaMode?: boolean;
  betaFeedbackReward?: number;
  userId?: string;
  showFeedbackModal?: boolean;
  setShowFeedbackModal?: (show: boolean) => void;
  onCreditsUpdated?: () => void;
}

export const CenterStageLayout = ({
  messages,
  onSendMessage,
  isTyping,
  isGeneratingDocument = false,
  isGeneratingFloorPlan = false,
  documentType = null,
  isDisabled,
  selectedMode,
  selectedFile,
  isUploading,
  uploadProgress,
  isDragOver,
  onFileSelect,
  onRemoveFile,
  onDragEnter,
  onDragLeave,
  onDragOver,
  onDrop,
  fileInputRef,
  sidebarOpen,
  transcriptOpen,
  onTranscriptToggle,
  onTranscriptClear,
  onReply,
  modes,
  onModeChange,
  modeLocked = false,
  prefillValue,
  onPrefillConsumed,
  onLanguageChange,
  hasReachedLimit,
  messageCount,
  maxMessages,
  onStartNewChat,
  lastSuggestedEmotion,
  uploadFailed,
  onRetryUpload,
  remaining = 0,
  totalLimit = 5,
  allowed = true,
  isFree = true,
  isUnlimited,
  resetsAt,
  isUsageLoading = false,
  tier,
  isLoadingFromHistory,
  currentSessionId,
  isTransitioningToChat,
  maintenanceConfig,
  betaMode,
  betaFeedbackReward,
  userId,
  showFeedbackModal: showFeedbackModalProp,
  setShowFeedbackModal: setShowFeedbackModalProp,
  onCreditsUpdated,
}: CenterStageLayoutProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const eyeStageRef = useRef<HTMLDivElement>(null);
  const eyeRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLDivElement>(null);
  const footerRef = useRef<HTMLDivElement>(null);

  const [footerHeight, setFooterHeight] = useState(112);
  const responseWrapperRef = useRef<HTMLDivElement>(null);
  const [responseWrapperMaxHeight, setResponseWrapperMaxHeight] = useState(400);

  const [internalShowFeedback, setInternalShowFeedback] = useState(false);
  const showFeedbackModal = showFeedbackModalProp ?? internalShowFeedback;
  const setShowFeedbackModal = setShowFeedbackModalProp ?? setInternalShowFeedback;

  const awaitingLiveResponseRef = useRef<{ active: boolean; baselineLastMessageId: string | null }>({
    active: false,
    baselineLastMessageId: null,
  });

  const responseProcessingRef = useRef<{ active: boolean }>({ active: false });
  const responseTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const isMobile = useIsMobile();

  const creditsExhausted = useMemo(() => {
    if (isUsageLoading) return false;
    return !allowed;
  }, [allowed, isUsageLoading]);

  const {
    setEmotion,
    setEmotionWithSource,
    triggerAbsorption,
    triggerBlink,
    setIsResponding,
    detectExcitement,
    isUserTyping: contextIsTyping,
    triggerPulse,
    bumpActivity,
  } = useAYNEmotion();
  const soundContext = useSoundStore();
  const playSound = soundContext?.playSound;
  const { orchestrateEmotionChange, resetToCalm } = useEmotionOrchestrator();
  const {
    flyingBubble,
    flyingSuggestion,
    responseBubbles,
    suggestionBubbles,
    startMessageAnimation,
    completeAbsorption,
    startSuggestionFlight,
    completeSuggestionAbsorption,
    emitResponseBubble,
    clearResponseBubbles,
    emitSuggestions,
    clearSuggestions,
  } = useBubbleAnimation();

  const lastProcessedAynMessageIdRef = useRef<string | null>(null);
  const [isAbsorbPulsing, setIsAbsorbPulsing] = useState(false);
  const [lastUserMessage, setLastUserMessage] = useState<string>("");
  const gazeIndexRef = useRef<number | null>(null);
  const [gazeForRender, setGazeForRender] = useState<number | null>(null);

  const {
    userEmotion,
    empathyResponse,
    pupilReaction: empathyPupilReaction,
    blinkPattern: empathyBlinkPattern,
    colorIntensity: empathyColorIntensity,
    resetEmpathy,
  } = useEmpathyReaction("", {
    debounceMs: 400,
    minTextLength: 3,
    enabled: false,
  });

  // Measure footer height dynamically
  useEffect(() => {
    if (!footerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setFooterHeight(entry.contentRect.height + 24);
      }
    });
    observer.observe(footerRef.current);
    return () => observer.disconnect();
  }, []);

  // Dynamic height: measure from responseWrapper top to footer top, keeping 8px gap
  useEffect(() => {
    const measure = () => {
      if (!responseWrapperRef.current || !footerRef.current) return;
      const wrapperTop = responseWrapperRef.current.getBoundingClientRect().top;
      const footerTop = footerRef.current.getBoundingClientRect().top;
      const available = Math.max(0, footerTop - wrapperTop - 8);
      setResponseWrapperMaxHeight(available);
    };

    measure();

    const ro = new ResizeObserver(() => measure());
    if (footerRef.current) ro.observe(footerRef.current);
    if (responseWrapperRef.current) ro.observe(responseWrapperRef.current);

    window.addEventListener("resize", measure);
    const vv = window.visualViewport;
    if (vv) vv.addEventListener("resize", measure);

    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
      if (vv) vv.removeEventListener("resize", measure);
    };
  }, [transcriptOpen, responseBubbles.length, sidebarOpen, isMobile]);

  // Reset all visual state when messages are cleared
  useEffect(() => {
    if (messages.length === 0) {
      if (responseTimeoutRef.current) {
        clearTimeout(responseTimeoutRef.current);
        responseTimeoutRef.current = null;
      }
      clearResponseBubbles();
      clearSuggestions();
      lastProcessedAynMessageIdRef.current = null;
      setLastUserMessage("");
      setEmotion("calm");
      setIsResponding(false);
      awaitingLiveResponseRef.current = { active: false, baselineLastMessageId: null };
      responseProcessingRef.current.active = false;
    }
  }, [messages.length, clearResponseBubbles, clearSuggestions, setEmotion, setIsResponding]);

  // Clear visual state when switching chat sessions
  useEffect(() => {
    if (currentSessionId) {
      if (responseTimeoutRef.current) {
        clearTimeout(responseTimeoutRef.current);
        responseTimeoutRef.current = null;
      }
      clearResponseBubbles();
      clearSuggestions();
      lastProcessedAynMessageIdRef.current = null;
      awaitingLiveResponseRef.current = { active: false, baselineLastMessageId: null };
      responseProcessingRef.current.active = false;
    }
  }, [currentSessionId, clearResponseBubbles, clearSuggestions]);

  const suggestionGazeTargets = [
    { x: -15, y: -8 },
    { x: -15, y: 0 },
    { x: -15, y: 8 },
  ];

  const showThinking = isTyping || isGeneratingDocument || isGeneratingFloorPlan;

  // Cycle through suggestion cards with glances
  useEffect(() => {
    const visibleSuggestions = suggestionBubbles.filter((s) => s.isVisible);
    if (visibleSuggestions.length === 0 || showThinking || isMobile || contextIsTyping) {
      gazeIndexRef.current = null;
      setGazeForRender(null);
      return;
    }
    const cycleInterval = setInterval(() => {
      const prev = gazeIndexRef.current;
      let next: number | null;
      if (prev === null) {
        next = 0;
      } else {
        next = (prev + 1) % visibleSuggestions.length;
        if (Math.random() < 0.3) next = null;
      }
      gazeIndexRef.current = next;
      setGazeForRender(next);
    }, 3500);
    return () => clearInterval(cycleInterval);
  }, [suggestionBubbles, showThinking, isMobile, contextIsTyping]);

  // Fetch dynamic suggestions
  const fetchDynamicSuggestions = useCallback(async (userMessage: string, aynResponse: string, mode: AIMode) => {
    try {
      const { data, error } = await supabase.functions.invoke("generate-suggestions", {
        body: { lastUserMessage: userMessage, lastAynResponse: aynResponse, mode },
      });
      if (error) {
        if (import.meta.env.DEV) console.error("Failed to fetch suggestions:", error);
        return DEFAULT_SUGGESTIONS;
      }
      return data?.suggestions || DEFAULT_SUGGESTIONS;
    } catch (err) {
      if (import.meta.env.DEV) console.error("Error fetching suggestions:", err);
      return DEFAULT_SUGGESTIONS;
    }
  }, []);

  const debouncedFetchAndEmitSuggestions = useMemo(
    () =>
      debounce(async (userMessage: string, aynResponse: string, mode: AIMode) => {
        const suggestions = await fetchDynamicSuggestions(userMessage, aynResponse, mode);
        emitSuggestions(suggestions);
      }, 300),
    [fetchDynamicSuggestions, emitSuggestions],
  );

  const hasVisibleResponses = responseBubbles.some((b) => b.isVisible);
  const hasVisibleSuggestions = suggestionBubbles.some((s) => s.isVisible);

  const gazeTarget =
    hasVisibleSuggestions && !showThinking && !isMobile
      ? gazeForRender !== null
        ? suggestionGazeTargets[gazeForRender]
        : { x: -12, y: 0 }
      : null;

  const getEyePosition = useCallback(() => {
    const eyeIsTransformed = hasVisibleResponses || transcriptOpen;
    if (!eyeIsTransformed && eyeRef.current) {
      const eyeRect = eyeRef.current.getBoundingClientRect();
      return { x: eyeRect.left + eyeRect.width / 2, y: eyeRect.top + eyeRect.height / 2 };
    }
    if (eyeStageRef.current) {
      const stageRect = eyeStageRef.current.getBoundingClientRect();
      return { x: stageRect.left + stageRect.width / 2, y: stageRect.top + stageRect.height / 2 };
    }
    return { x: window.innerWidth / 2, y: window.innerHeight / 3 };
  }, [hasVisibleResponses, transcriptOpen]);

  const getInputPosition = useCallback(() => {
    if (!inputRef.current) return { x: window.innerWidth / 2, y: window.innerHeight - 100 };
    const inputRect = inputRef.current.getBoundingClientRect();
    return { x: inputRect.left + inputRect.width / 2, y: inputRect.top + 30 };
  }, []);

  // Handle sending message with bubble animation
  const handleSendWithAnimation = useCallback(
    async (content: string, file?: File | null) => {
      if (isUploading) return;
      if (!content.trim() && !file) return;

      if (import.meta.env.DEV) {
        console.log("[CenterStageLayout] handleSendWithAnimation called:", { content: content.substring(0, 30) });
      }

      setLastUserMessage(content);
      awaitingLiveResponseRef.current = {
        active: true,
        baselineLastMessageId: messages[messages.length - 1]?.id ?? null,
      };

      if (responseTimeoutRef.current) {
        clearTimeout(responseTimeoutRef.current);
        responseTimeoutRef.current = null;
      }

      clearResponseBubbles();
      clearSuggestions();
      resetEmpathy();

      if (isMobile) {
        const activeEl = document.activeElement as HTMLElement;
        activeEl?.blur?.();
      }

      onSendMessage(content, file);

      if (transcriptOpen) {
        onTranscriptToggle?.();
      }

      // Trigger reactions immediately without flying animation
      triggerBlink();
      triggerAbsorption();
      playSound?.("message-absorb");
      setIsResponding(true);
      setIsAbsorbPulsing(true);
      setTimeout(() => setIsAbsorbPulsing(false), 300);

      onRemoveFile();

      requestAnimationFrame(() => orchestrateEmotionChange("thinking"));
    },
    [
      isUploading,
      messages,
      clearResponseBubbles,
      clearSuggestions,
      resetEmpathy,
      getInputPosition,
      getEyePosition,
      triggerBlink,
      triggerAbsorption,
      playSound,
      orchestrateEmotionChange,
      onSendMessage,
      onRemoveFile,
      isMobile,
      onTranscriptToggle,
      transcriptOpen,
      completeAbsorption,
      setIsResponding,
      startMessageAnimation,
    ],
  );

  // Handle suggestion click
  const handleSuggestionClick = useCallback(
    (content: string, emoji: string, clickPosition: { x: number; y: number }) => {
      setLastUserMessage(content);
      awaitingLiveResponseRef.current = {
        active: true,
        baselineLastMessageId: messages[messages.length - 1]?.id ?? null,
      };
      clearSuggestions();

      // Trigger reactions immediately
      triggerBlink();
      triggerAbsorption();
      playSound?.("message-absorb");
      setIsResponding(true);
      setIsAbsorbPulsing(true);
      setTimeout(() => setIsAbsorbPulsing(false), 300);

      clearResponseBubbles();
      onSendMessage(content, null);
      requestAnimationFrame(() => orchestrateEmotionChange("thinking"));
    },
    [
      messages,
      clearSuggestions,
      clearResponseBubbles,
      getEyePosition,
      startSuggestionFlight,
      completeSuggestionAbsorption,
      triggerBlink,
      triggerAbsorption,
      orchestrateEmotionChange,
      setIsResponding,
      onSendMessage,
      playSound,
      setLastUserMessage,
    ],
  );

  // Process AYN responses
  useEffect(() => {
    if (messages.length === 0) return;
    if (isLoadingFromHistory) return;

    const gate = awaitingLiveResponseRef.current;
    if (!gate.active) return;

    const lastMessage = messages[messages.length - 1];
    if (!lastMessage || !lastMessage.id) return;
    if (gate.baselineLastMessageId && lastMessage.id === gate.baselineLastMessageId) return;

    if (lastMessage.sender === "ayn") {
      if (lastMessage.isTyping) return;
      if (!lastMessage.content?.trim()) return;
    }

    if (lastMessage.sender === "ayn" && lastMessage.id !== lastProcessedAynMessageIdRef.current) {
      lastProcessedAynMessageIdRef.current = lastMessage.id;
      awaitingLiveResponseRef.current = { active: false, baselineLastMessageId: null };
      responseProcessingRef.current.active = true;
      triggerBlink();

      const messageContent = lastMessage.content;
      const messageAttachment = lastMessage.attachment;

      responseTimeoutRef.current = setTimeout(() => {
        try {
          if (!messageContent?.trim()) return;

          const validEmotions: AYNEmotion[] = [
            "calm",
            "happy",
            "excited",
            "thinking",
            "frustrated",
            "curious",
            "sad",
            "mad",
            "bored",
            "comfort",
            "supportive",
          ];
          const emotion =
            lastSuggestedEmotion && validEmotions.includes(lastSuggestedEmotion as AYNEmotion)
              ? (lastSuggestedEmotion as AYNEmotion)
              : "calm";
          orchestrateEmotionChange(emotion);
          playSound?.("response-received");
          setIsResponding(false);
          bumpActivity();

          responseProcessingRef.current.active = false;
          responseTimeoutRef.current = null;

          detectExcitement(messageContent);

          const bubbleType = getBubbleType(messageContent);
          const response = (messageContent || "").replace(/^[!?\s]+/, "").trim();

          if (!response) return;

          const attachment = messageAttachment
            ? {
                url: messageAttachment.url,
                name: messageAttachment.name,
                type: messageAttachment.type,
              }
            : undefined;

          if (!transcriptOpen) {
            emitResponseBubble(response, bubbleType, attachment);

            setTimeout(() => {
              debouncedFetchAndEmitSuggestions(lastUserMessage || "Hello", messageContent, selectedMode);
            }, 600);
          }
        } catch (error) {
          console.error("[CenterStageLayout] Error processing response:", error);
          responseProcessingRef.current.active = false;
          responseTimeoutRef.current = null;
        }
      }, 50);
    }
  }, [
    messages,
    isLoadingFromHistory,
    lastSuggestedEmotion,
    setEmotion,
    setIsResponding,
    emitResponseBubble,
    triggerBlink,
    detectExcitement,
    debouncedFetchAndEmitSuggestions,
    lastUserMessage,
    selectedMode,
    transcriptOpen,
    bumpActivity,
    orchestrateEmotionChange,
    playSound,
  ]);

  // Update emotion when typing
  useEffect(() => {
    if (showThinking) {
      setIsResponding(true);
    }
  }, [showThinking, setIsResponding]);

  return (
    <div
      ref={containerRef}
      dir="ltr"
      className={cn("relative flex-1 flex flex-col items-center", "min-h-0 overflow-hidden")}
      style={{ paddingBottom: footerHeight }}
    >
      {/* Background gradient */}
      <div className="absolute inset-0 bg-gradient-to-b from-background via-background to-muted/10 pointer-events-none" />

      {/* Central Eye Stage */}
      <div
        ref={eyeStageRef}
        className={cn(
          "flex-1 flex flex-col relative w-full min-h-0",
          /* =============================================
             FIX: removed overflow-y-auto — this was causing
             page-level scrolling. Only the ResponseCard 
             scroll container should scroll internally.
             ============================================= */
          "overflow-hidden",
          "items-center",
          "justify-center",
          "transition-all duration-200 ease-out",
        )}
      >
        {/* Unified layout - Eye and ResponseCard in same flex column */}
        <motion.div
          className={cn(
            "flex flex-col items-center w-full px-4",
            transcriptOpen && "flex-1 min-h-0",
            sidebarOpen && transcriptOpen && "lg:max-w-[calc(100vw-42rem)]",
            sidebarOpen && !transcriptOpen && "lg:max-w-[calc(100vw-22rem)]",
            !sidebarOpen && transcriptOpen && "lg:max-w-[calc(100vw-22rem)]",
          )}
        >

          {/* ResponseCard wrapper — height is measured dynamically from wrapper top to footer top */}
          <AnimatePresence>
            {(responseBubbles.length > 0 || transcriptOpen) && (
              <motion.div
                ref={responseWrapperRef}
                className={cn("w-full flex justify-center mt-2", transcriptOpen && "flex-1 min-h-0")}
                style={{
                  maxHeight: `${responseWrapperMaxHeight}px`,
                  ...(transcriptOpen ? { height: `${responseWrapperMaxHeight}px` } : {}),
                  overflow: "hidden",
                }}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                transition={{ duration: 0.3, ease: [0.25, 0.1, 0.25, 1] }}
              >
                <ResponseCard
                  responses={responseBubbles}
                  isMobile={isMobile}
                  onDismiss={clearResponseBubbles}
                  variant="inline"
                  showPointer={false}
                  sessionId={currentSessionId}
                  transcriptOpen={transcriptOpen}
                  transcriptMessages={messages}
                  isTyping={showThinking}
                  onHistoryClose={() => onTranscriptToggle?.()}
                  onHistoryClear={() => onTranscriptClear?.()}
                  onReply={onReply}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </div>



      {/* Input area - Fixed at bottom */}
      <div
        ref={footerRef}
        className={cn(
          "fixed bottom-0 left-0 right-0 z-30",
          "pb-safe",
          "transition-all duration-200",
          sidebarOpen && "md:left-[20rem]",
        )}
      >
        {/* Banner constrained to same max-w as ChatInput */}
        <div className="px-2 sm:px-4">
          <div className="mx-auto max-w-4xl">
            <SystemNotificationBanner
              maintenanceConfig={maintenanceConfig}
              remaining={remaining}
              totalLimit={totalLimit}
              isUnlimited={isUnlimited ?? false}
              resetsAt={resetsAt ?? null}
            />
          </div>
        </div>

        <ChatInput
          ref={inputRef}
          onSend={handleSendWithAnimation}
          suggestions={suggestionBubbles}
          onSuggestionClick={handleSuggestionClick}
          isDisabled={isDisabled || isTyping || maintenanceConfig?.enabled || creditsExhausted}
          isTyping={isTyping}
          selectedMode={selectedMode}
          selectedFile={selectedFile}
          isUploading={isUploading}
          uploadProgress={uploadProgress}
          isDragOver={isDragOver}
          onFileSelect={onFileSelect}
          onRemoveFile={onRemoveFile}
          onDragEnter={onDragEnter}
          onDragLeave={onDragLeave}
          onDragOver={onDragOver}
          onDrop={onDrop}
          fileInputRef={fileInputRef}
          hasMessages={messages.length > 0}
          sidebarOpen={sidebarOpen}
          transcriptOpen={transcriptOpen}
          onTranscriptToggle={onTranscriptToggle}
          onTranscriptClear={onTranscriptClear}
          transcriptMessages={messages}
          modes={modes}
          onModeChange={onModeChange}
          modeLocked={modeLocked}
          prefillValue={prefillValue}
          onPrefillConsumed={onPrefillConsumed}
          onLanguageChange={onLanguageChange}
          hasReachedLimit={hasReachedLimit}
          messageCount={messageCount}
          maxMessages={maxMessages}
          onStartNewChat={onStartNewChat}
          uploadFailed={uploadFailed}
          onRetryUpload={onRetryUpload}
          maintenanceActive={maintenanceConfig?.enabled}
          creditsExhausted={creditsExhausted}
        />
      </div>

      {/* Beta Feedback Modal */}
      {userId && (
        <BetaFeedbackModal
          isOpen={showFeedbackModal}
          onClose={() => setShowFeedbackModal(false)}
          userId={userId}
          rewardAmount={betaFeedbackReward || 5}
          onCreditsUpdated={onCreditsUpdated}
        />
      )}
    </div>
  );
};
