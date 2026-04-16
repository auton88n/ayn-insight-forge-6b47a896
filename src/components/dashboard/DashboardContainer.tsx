import React, { useEffect, useCallback, useState, useRef } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { spineAuth } from '@/lib/spineAuth';
import { useToast } from '@/hooks/use-toast';

import { SidebarProvider, Sidebar as ShadcnSidebar, SidebarTrigger, useSidebar } from '@/components/ui/sidebar';
import { Sidebar as DashboardSidebar } from './Sidebar';
import { CenterStageLayout } from './CenterStageLayout';


import { TutorialWelcome } from '@/components/tutorial/TutorialWelcome';
import { TutorialOverlay } from '@/components/tutorial/TutorialOverlay';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import type { AIMode, FileAttachment, AIModeConfig, ChatHistory } from '@/types/dashboard.types';
import type { MaintenanceConfig, BetaConfig } from '@/components/Dashboard';

// Import custom hooks
import type { UseAuthReturn } from '@/types/dashboard.types';
import { useChatSession } from '@/hooks/useChatSession';
import { useFileUpload } from '@/hooks/useFileUpload';
import { useMessages } from '@/hooks/useMessages';
import { useTutorial } from '@/hooks/useTutorial';
import { useUsageTracking } from '@/hooks/useUsageTracking';
import { useAYNEmotion } from '@/stores/emotionStore';
import { analyzeResponseEmotion } from '@/lib/emotionMapping';
import { hapticFeedback } from '@/lib/haptics';

// Import icons for modes
import { Menu, Brain, FlaskConical, MessageSquare, Sparkles } from 'lucide-react';

interface DashboardContainerProps {
  user: User;
  session: Session;
  auth: UseAuthReturn;
  isAdmin?: boolean;
  hasDutyAccess?: boolean;
  onAdminPanelClick?: () => void;
  maintenanceConfig?: MaintenanceConfig;
  betaConfig?: BetaConfig;
}

// Two modes — Trading hidden until ready for users
const getModes = (): AIModeConfig[] => [
  { 
    name: 'General', 
    translatedName: 'AYN',
    description: 'Intelligence on markets, world events, and anything',
    icon: Brain,
    color: 'text-primary',
    webhookUrl: ''
  },
  {
    name: 'Business',
    translatedName: 'Business',
    description: 'Deep business analysis — ideas, growth, problems, market entry',
    icon: Sparkles,
    color: 'text-emerald-400',
    webhookUrl: ''
  },
];

export const DashboardContainer = ({ user, session, auth, isAdmin, hasDutyAccess, onAdminPanelClick, maintenanceConfig, betaConfig }: DashboardContainerProps) => {
  const { toast } = useToast();
  
  // Real-time usage tracking
  const usageTracking = useUsageTracking(user.id);
  
  // Custom hooks - pass session to useChatSession for direct REST API calls
  const chatSession = useChatSession(user.id, session);
  const fileUpload = useFileUpload(user.id);
  
  // State
  const [selectedMode, setSelectedMode] = React.useState<AIMode>('General');
  const [modeLocked, setModeLocked] = React.useState(false); // locks after first message
  const [allowPersonalization, setAllowPersonalization] = React.useState(false);
  const [isTransitioningToChat, setIsTransitioningToChat] = React.useState(false);
  const transitionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Messages hook - depends on other state, pass session for direct REST API calls
  const messagesHook = useMessages(
    chatSession.currentSessionId,
    user.id,
    user.email || '',
    selectedMode,
    auth.userProfile,
    allowPersonalization,
    session,
    usageTracking.isUnlimited,
    usageTracking.refreshUsage
  );

  // Get modes (English only)
  const modes = getModes();

  // Load messages when sessionId changes — messagesHook intentionally excluded
  // from deps to prevent re-triggering when the hook reference changes (which
  // would abort the in-flight fetch and cause hundreds of AbortError logs).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (chatSession.currentSessionId) {
      messagesHook.loadMessages();
    }
  }, [chatSession.currentSessionId]);


  // Handle send message with pre-uploaded file attachment
  const handleSendMessage = useCallback(async (
    content: string,
    _fileToUpload?: File | null  // Kept for interface compatibility, but we use pre-uploaded attachment
  ) => {
    // Don't block if auth is still loading - allow message to proceed
    if (!auth.isAuthLoading && (!auth.hasAccess || !auth.hasAcceptedTerms)) {
      toast({
        title: 'Access Required',
        description: 'Please accept the terms to continue.',
        variant: "destructive"
      });
      return;
    }

    // Block if file is still uploading
    if (fileUpload.isUploading) {
      toast({
        title: 'Upload in Progress',
        description: 'Please wait for the file to finish uploading.',
        variant: "destructive"
      });
      return;
    }

    // Use the pre-uploaded attachment (already uploaded when file was selected)
    const attachment = fileUpload.uploadedAttachment;
    
    try {
      // Send message with attachment
      await messagesHook.sendMessage(content, attachment);
      
      // Lock the mode after first message — can't switch within this session
      if (!modeLocked) setModeLocked(true);

      // Refresh chat history - title is guaranteed to exist now (saved before messages)
      await chatSession.loadRecentChats();
      
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Something went wrong. Please try again.';
      toast({
        title: 'Message Failed',
        description: message.includes('limit') ? message : 'Failed to send message. Please try again.',
        variant: 'destructive',
      });
      return false;
    } finally {
      // Always clear the file state, even if sending fails
      fileUpload.removeFile();
    }
  }, [
    auth.hasAccess,
    auth.hasAcceptedTerms,
    auth.isAuthLoading,
    messagesHook,
    chatSession,
    fileUpload,
    modeLocked,
    toast
  ]);

  // Handle copy message
  const handleCopyMessage = useCallback(async (content: string) => {
    try {
      await navigator.clipboard.writeText(content);
      toast({
        title: "Message Copied",
        description: "Message copied to clipboard.",
      });
    } catch (err) {
      toast({
        title: "Copy Failed",
        description: "Couldn't copy to clipboard. Please try manually.",
        variant: "destructive"
      });
    }
  }, [toast]);

  // Handle reply to message
  const handleReplyToMessage = useCallback((message: { content: string }) => {
    handleCopyMessage(message.content);
  }, [handleCopyMessage]);

  // Handle load chat - decouple eye animation from data rendering
  const handleLoadChat = useCallback((chat: ChatHistory) => {
    // Block chat switching while AYN is responding — prevents shaking/state corruption
    if (messagesHook.isTyping) return;

    // Trigger eye shrink IMMEDIATELY — zero main-thread work before this
    setIsTransitioningToChat(true);
    if (transitionTimerRef.current) clearTimeout(transitionTimerRef.current);
    // Defer ALL heavy work (parsing + rendering) into the timeout
    transitionTimerRef.current = setTimeout(() => {
      const loadedMessages = chatSession.loadChat(chat);
      messagesHook.setMessagesFromHistory(loadedMessages);
      setIsTransitioningToChat(false);
    }, 280);
  }, [chatSession, messagesHook]);

  // Handle new chat — reset mode lock so user can pick mode fresh
  const handleNewChat = useCallback(() => {
    chatSession.startNewChat();
    messagesHook.setMessages([]);
    setModeLocked(false);
    setSelectedMode('General');
  }, [chatSession, messagesHook]);

  // Handle logout with timeout to prevent hanging
  const handleLogout = useCallback(async () => {
    try {
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Sign out timeout')), 2000);
      });
      
      // Use local scope to clear local session without requiring server validation
      await Promise.race([
        supabase.auth.signOut({ scope: 'local' }),
        timeoutPromise
      ]);
    } catch (error) {
      console.log('Logout timeout or error, forcing local cleanup');
    } finally {
      // Always force local logout by clearing storage
      localStorage.removeItem('sb-dfkoxuokfkttjhfjcecx-auth-token');
      sessionStorage.clear();
      window.location.href = '/';
    }
  }, []);


  return (
    <DashboardContent
      user={user}
      session={session}
      auth={auth}
      chatSession={chatSession}
      fileUpload={fileUpload}
      messagesHook={messagesHook}
      selectedMode={selectedMode}
      modes={modes}
      setSelectedMode={setSelectedMode}
      handleNewChat={handleNewChat}
      handleLoadChat={handleLoadChat}
      handleCopyMessage={handleCopyMessage}
      handleReplyToMessage={handleReplyToMessage}
      handleSendMessage={handleSendMessage}
      handleLogout={handleLogout}
      isAdmin={isAdmin}
      hasDutyAccess={hasDutyAccess}
      onAdminPanelClick={onAdminPanelClick}
      usageTracking={usageTracking}
      maintenanceConfig={maintenanceConfig}
      betaConfig={betaConfig}
      isTransitioningToChat={isTransitioningToChat}
      modeLocked={modeLocked}
    />
  );
};

// Separate component that can use useSidebar hook
const DashboardContent = ({
  user,
  session,
  auth,
  chatSession,
  fileUpload,
  messagesHook,
  selectedMode,
  modes,
  setSelectedMode,
  handleNewChat,
  handleLoadChat,
  handleCopyMessage,
  handleReplyToMessage,
  handleSendMessage,
  handleLogout,
  isAdmin,
  hasDutyAccess,
  onAdminPanelClick,
  onLanguageChange,
  usageTracking,
  maintenanceConfig,
  betaConfig,
  isTransitioningToChat,
  modeLocked,
}: {
  user: User;
  session: Session;
  auth: UseAuthReturn;
  chatSession: ReturnType<typeof useChatSession>;
  fileUpload: ReturnType<typeof useFileUpload>;
  messagesHook: ReturnType<typeof useMessages>;
  selectedMode: AIMode;
  modes: AIModeConfig[];
  setSelectedMode: (mode: AIMode) => void;
  handleNewChat: () => void;
  handleLoadChat: (chat: ChatHistory) => void;
  handleCopyMessage: (content: string) => Promise<void>;
  handleReplyToMessage: (message: { content: string }) => void;
  handleSendMessage: (content: string, fileToUpload?: File | null) => Promise<boolean | undefined>;
  handleLogout: () => Promise<void>;
  isAdmin?: boolean;
  hasDutyAccess?: boolean;
  onAdminPanelClick?: () => void;
  onLanguageChange?: (language: { code: string; flag: string; name: string }) => void;
  usageTracking: ReturnType<typeof useUsageTracking>;
  maintenanceConfig?: MaintenanceConfig;
  betaConfig?: BetaConfig;
  isTransitioningToChat?: boolean;
  modeLocked: boolean;
}) => {
  const { open, setOpen, openMobile, setOpenMobile, isMobile, toggleSidebar } = useSidebar();
  const [transcriptOpen, setTranscriptOpen] = useState(false);
  const [replyPrefill, setReplyPrefill] = useState<string>('');
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  
  const { setEmotion, setIsResponding } = useAYNEmotion();
  
  // Tutorial system
  const tutorial = useTutorial(user.id);

  // Mutual exclusivity: close transcript when left sidebar opens
  useEffect(() => {
    const sidebarIsOpen = isMobile ? openMobile : open;
    if (sidebarIsOpen && transcriptOpen) {
      setTranscriptOpen(false);
    }
  }, [open, openMobile, isMobile, transcriptOpen]);

  // Handle transcript toggle with mutual exclusivity
  // Accepts optional boolean from Sheet's onOpenChange
  const handleToggleTranscript = useCallback((newState?: boolean) => {
    const shouldOpen = typeof newState === 'boolean' ? newState : !transcriptOpen;
    
    if (shouldOpen && !transcriptOpen) {
      // Opening transcript - close left sidebar
      if (isMobile) {
        setOpenMobile(false);
      } else {
        setOpen(false);
      }
    }
    setTranscriptOpen(shouldOpen);
  }, [transcriptOpen, isMobile, setOpen, setOpenMobile]);

  // Handle reply from transcript - close sidebar and prefill input
  const handleReply = useCallback((quotedContent: string) => {
    setReplyPrefill(quotedContent);
    setTranscriptOpen(false);
  }, []);

  const handlePrefillConsumed = useCallback(() => {
    setReplyPrefill('');
  }, []);

  // Track last processed emotion and content to prevent duplicate processing
  const lastProcessedEmotionRef = useRef<string | null>(null);
  const lastProcessedContentRef = useRef<string | null>(null);

  // Update emotion when AYN responds - prioritize backend emotion detection + trigger haptic
  useEffect(() => {
    if (!messagesHook.isTyping && messagesHook.messages.length > 0) {
      const lastMessage = messagesHook.messages[messagesHook.messages.length - 1];
      if (lastMessage.sender === 'ayn') {
        // Guard: Skip if we already processed this exact content
        if (lastMessage.content === lastProcessedContentRef.current) {
          return;
        }
        lastProcessedContentRef.current = lastMessage.content;
        
        // Use backend-detected emotion if available, otherwise fallback to frontend analysis
        const emotion = messagesHook.lastSuggestedEmotion || analyzeResponseEmotion(lastMessage.content);
        setEmotion(emotion as 'calm' | 'happy' | 'excited' | 'thinking' | 'frustrated' | 'curious');
        setIsResponding(false);
        
        // Trigger haptic feedback for emotion (only if emotion changed)
        if (emotion !== lastProcessedEmotionRef.current) {
          lastProcessedEmotionRef.current = emotion;
          // Map emotion to haptic pattern
          const hapticType = emotion as 'calm' | 'happy' | 'excited' | 'thinking' | 'frustrated' | 'curious';
          hapticFeedback(hapticType);
        }
      }
    } else if (messagesHook.isTyping) {
      setEmotion('thinking');
      setIsResponding(true);
    }
  }, [messagesHook.isTyping, messagesHook.messages, messagesHook.lastSuggestedEmotion, setEmotion, setIsResponding]);

  // Auto-open/close sidebars during tutorial steps
  useEffect(() => {
    const stepId = tutorial.currentStepData?.id;
    
    // Open transcript when on history step
    if (stepId === 'history') {
      setTranscriptOpen(true);
    }
    // Close transcript when moving past it
    else if (transcriptOpen && tutorial.isActive && stepId !== 'history') {
      setTranscriptOpen(false);
    }
    
    // Open left sidebar when on sidebar step
    if (stepId === 'sidebar' && !open) {
      toggleSidebar();
    }
  }, [tutorial.currentStepData?.id, tutorial.isActive, open, toggleSidebar, transcriptOpen]);

  const handleClearTranscript = useCallback(() => {
    handleNewChat();
  }, [handleNewChat]);

  return (
    <>
      {/* Tutorial System */}
      <TutorialWelcome
        isOpen={tutorial.showWelcome}
        onStart={tutorial.startTutorial}
        onSkip={tutorial.dismissWelcome}
      />
      <TutorialOverlay
        isActive={tutorial.isActive}
        currentStep={tutorial.currentStep}
        totalSteps={tutorial.totalSteps}
        currentStepData={tutorial.currentStepData}
        onNext={tutorial.nextStep}
        onPrev={tutorial.prevStep}
        onSkip={tutorial.skipTutorial}
        onComplete={tutorial.completeTutorial}
      />
      
      <div className="flex h-screen w-full" dir="ltr">
        <ShadcnSidebar>
          <div data-tutorial="sidebar" className="h-full">
            <DashboardSidebar
          userName={auth.userProfile?.contact_person || user.user_metadata?.name || user.email?.split('@')[0]}
          userEmail={auth.userProfile?.company_name || 'No company'}
          userAvatar={auth.userProfile?.avatar_url}
          userId={user.id}
          accessToken={session.access_token}
          isTyping={messagesHook.isTyping}
          hasAccess={auth.hasAccess}
          isAuthLoading={auth.isAuthLoading}
          isLoadingChats={chatSession.isLoadingChats}
          selectedMode={selectedMode}
          modes={modes}
          recentChats={chatSession.recentChats}
          showChatSelection={chatSession.showChatSelection}
          selectedChats={chatSession.selectedChats}
          remaining={usageTracking.remaining}
          totalLimit={usageTracking.totalLimit}
          bonusCredits={usageTracking.bonusCredits ?? 0}
          allowed={usageTracking.allowed}
          isFree={usageTracking.isFree}
          isUnlimited={usageTracking.isUnlimited}
          resetsAt={usageTracking.resetsAt}
          tier={usageTracking.tier}
          isUsageLoading={usageTracking.isLoading}
          onCreditsUpdated={usageTracking.refreshUsage}
          onModeSelect={setSelectedMode}
          onNewChat={handleNewChat}
          onLoadChat={handleLoadChat}
          onToggleChatSelection={(index) => {
            const newSelected = new Set(chatSession.selectedChats);
            if (newSelected.has(index)) {
              newSelected.delete(index);
            } else {
              newSelected.add(index);
            }
            chatSession.setSelectedChats(newSelected);
          }}
          onSelectAllChats={() => {
            if (chatSession.selectedChats.size === chatSession.recentChats.length) {
              chatSession.setSelectedChats(new Set());
            } else {
              chatSession.setSelectedChats(new Set(chatSession.recentChats.map((_chat: unknown, i: number) => i)));
            }
          }}
          onDeleteSelected={chatSession.deleteSelectedChats}
          onDeleteAllChats={chatSession.deleteAllChats}
          onShowChatSelection={chatSession.setShowChatSelection}
          onLogout={handleLogout}
          onAvatarUpdated={auth.loadUserProfile}
          isAdmin={isAdmin}
          hasDutyAccess={hasDutyAccess}
          onAdminPanelClick={onAdminPanelClick}
              onStartTutorial={tutorial.startTutorial}
              isTutorialProfileStep={tutorial.isActive && tutorial.currentStepData?.id === 'profile'}
               onOpenFeedback={() => setShowFeedbackModal(true)}
               betaFeedbackReward={betaConfig?.feedbackReward}
            />
          </div>
        </ShadcnSidebar>

      {/* Mobile Backdrop Overlay */}
      <AnimatePresence>
        {openMobile && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40 md:hidden"
            onClick={() => setOpenMobile(false)}
          />
        )}
      </AnimatePresence>

      {/* Floating Menu Button - Desktop only */}
      <Button
        variant="ghost"
        size="icon"
        onClick={toggleSidebar}
        className={cn(
          "fixed top-4 left-4 z-50",
          "h-10 w-10 rounded-xl",
          "bg-background/90 backdrop-blur-lg border border-border/60",
          "shadow-lg hover:shadow-xl",
          "hover:bg-background hover:scale-105",
          "active:scale-95",
          "transition-all duration-200",
          // Desktop only - show when sidebar is closed
          "hidden md:flex",
          open && "md:hidden"
        )}
      >
        <Menu className="w-5 h-5" />
      </Button>

      <main 
        dir="ltr"
        className="flex-1 overflow-hidden flex flex-col"
      >
        {/* Mobile header - clean & centered */}
        <header className="md:hidden flex items-center justify-between px-4 py-3 
          bg-background/98 backdrop-blur-xl 
          border-b border-border/30
          shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
          
          {/* Left: Menu button */}
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleSidebar}
            className="h-9 w-9 rounded-full bg-muted/40 border border-border/40 
              shadow-sm hover:shadow hover:bg-muted/60 transition-all duration-200"
          >
            <Menu className="w-4 h-4" />
          </Button>
          
          {/* Center: Brand with Brain icon */}
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-muted/50 to-muted 
              flex items-center justify-center shadow-inner border border-border/30">
              <Brain className="w-3.5 h-3.5 text-foreground/60" />
            </div>
            <span className="font-semibold text-base tracking-tight">AYN</span>
          </div>
          
          {/* Right spacer for centering */}
          <div className="h-9 w-9" />
        </header>

        <CenterStageLayout
          messages={messagesHook.messages}
          onSendMessage={async (content, file) => {
            const success = await handleSendMessage(content, file);
            if (success) {
              tutorial.triggerFirstMessageTutorial();
            }
          }}
          isTyping={messagesHook.isTyping}
          isGeneratingDocument={messagesHook.isGeneratingDocument}
          isGeneratingFloorPlan={messagesHook.isGeneratingFloorPlan}
          documentType={messagesHook.documentType}
          isDisabled={auth.isAuthLoading ? false : (!auth.hasAccess || !auth.hasAcceptedTerms)}
          allowed={usageTracking.allowed}
          selectedMode={selectedMode}
          selectedFile={fileUpload.selectedFile}
          isUploading={fileUpload.isUploading}
          uploadProgress={fileUpload.uploadProgress}
          isDragOver={fileUpload.isDragOver}
          onFileSelect={fileUpload.handleFileSelect}
          onRemoveFile={fileUpload.removeFile}
          onDragEnter={fileUpload.handleDragEnter}
          onDragLeave={fileUpload.handleDragLeave}
          onDragOver={fileUpload.handleDragOver}
          onDrop={fileUpload.handleDrop}
          fileInputRef={fileUpload.fileInputRef}
          sidebarOpen={open}
          transcriptOpen={transcriptOpen}
          onTranscriptToggle={() => handleToggleTranscript()}
          onTranscriptClear={handleClearTranscript}
          onReply={handleReply}
          modes={modes}
          onModeChange={setSelectedMode}
          modeLocked={modeLocked}
          prefillValue={replyPrefill}
          onPrefillConsumed={handlePrefillConsumed}
          onLanguageChange={onLanguageChange}
          hasReachedLimit={messagesHook.hasReachedLimit}
          messageCount={messagesHook.messageCount}
          maxMessages={messagesHook.maxMessages}
          onStartNewChat={handleNewChat}
          lastSuggestedEmotion={messagesHook.lastSuggestedEmotion}
          uploadFailed={fileUpload.uploadFailed}
          onRetryUpload={fileUpload.retryUpload}
          resetsAt={usageTracking.resetsAt}
          tier={usageTracking.tier}
          isUsageLoading={usageTracking.isLoading}
          isLoadingFromHistory={messagesHook.isLoadingFromHistory}
          currentSessionId={chatSession.currentSessionId}
          isTransitioningToChat={isTransitioningToChat}
          maintenanceConfig={maintenanceConfig}
          betaMode={betaConfig?.enabled}
          betaFeedbackReward={betaConfig?.feedbackReward}
          userId={user.id}
          showFeedbackModal={showFeedbackModal}
          setShowFeedbackModal={setShowFeedbackModal}
          onCreditsUpdated={usageTracking.refreshUsage}
        />
      </main>

      </div>
    </>
  );
};
