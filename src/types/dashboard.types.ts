// ============================================
// MESSAGE TYPES
// ============================================

export interface Message {
  id: string;
  content: string;
  sender: 'user' | 'ayn';
  timestamp: Date;
  status?: 'sending' | 'sent' | 'error' | 'queued';
  isTyping?: boolean;
  attachment?: FileAttachment;
  labData?: LABResponse;
  chartAnalysis?: import('@/types/chartAnalyzer.types').ChartAnalysisResult;
}

export interface FileAttachment {
  url: string;
  name: string;
  type: string;
  size?: number;
}

// ============================================
// LAB MODE TYPES
// ============================================

export interface LABResponse {
  json: Record<string, unknown> | null;
  text: string;
  emotion: string;
  raw: string;
  hasStructuredData: boolean;
}

// ============================================
// USER TYPES
// ============================================

export interface UserProfile {
  user_id: string;
  contact_person?: string;
  company_name?: string;
  business_type?: string;
  avatar_url?: string;
}

export interface UserAccess {
  is_active: boolean;
  expires_at?: string;
}

// ============================================
// CHAT SESSION TYPES
// ============================================

export interface ChatSession {
  sessionId: string;
  messages: Message[];
  createdAt: Date;
  updatedAt: Date;
}

export interface ChatHistory {
  title: string;
  lastMessage: string;
  timestamp: Date;
  messages: Message[];
  sessionId: string;
}

// ============================================
// AI MODE TYPES
// ============================================

export type AIMode = 
  | 'General' 
  | 'Business'
  | 'Trading'
  | 'Nen Mode ⚡' 
  | 'Research Pro' 
  | 'PDF Analyst' 
  | 'Vision Lab'
  | 'Civil Engineering'
  | 'LAB';

export interface AIModeConfig {
  name: AIMode;
  translatedName: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  webhookUrl: string;
}

// ============================================
// WEBHOOK PAYLOAD TYPES
// ============================================

export interface WebhookPayload {
  message: string;
  userId: string;
  userEmail: string;
  mode: AIMode;
  sessionId: string;
  conversationHistory: ConversationHistoryItem[];
  userProfile: Partial<UserProfile>;
  allowPersonalization: boolean;
  detectedLanguage: string;
  concise: boolean;
  timestamp: string;
  has_attachment: boolean;
  file_data: FileAttachment | null;
  emotionHistory?: EmotionHistoryEntry[];
}

export interface EmotionHistoryEntry {
  emotion: string;
  intensity: number;
  timestamp: string;
}

export interface MoodPattern {
  trend: 'improving' | 'declining' | 'stable' | 'volatile';
  dominantEmotion: string;
  averageIntensity: number;
  adaptiveContext: string;
}

export interface ConversationHistoryItem {
  content: string;
  sender: 'user' | 'ayn';
  timestamp: string;
  has_attachment?: boolean;
  attachment?: FileAttachment | null;
}

// ============================================
// DASHBOARD STATE TYPES
// ============================================

export interface DashboardState {
  // Messages
  messages: Message[];
  isTyping: boolean;
  
  // Session
  currentSessionId: string;
  recentChats: ChatHistory[];
  
  // UI State
  selectedMode: AIMode;
  showChatSelection: boolean;
  selectedChats: Set<number>;
  activeTab: 'chat' | 'admin';
  
  // File Upload
  selectedFile: File | null;
  isUploading: boolean;
  isDragOver: boolean;
  
  // User
  userProfile: UserProfile | null;
  hasAccess: boolean;
  hasAcceptedTerms: boolean;
  isAdmin: boolean;
  
  // Settings
  allowPersonalization: boolean;
  
  // Maintenance
  maintenanceConfig: MaintenanceConfig;
}

export interface MaintenanceConfig {
  enableMaintenance: boolean;
  maintenanceMessage: string;
  maintenanceStartTime: string;
  maintenanceEndTime: string;
}

// ============================================
// HOOK RETURN TYPES
// ============================================

export interface UseMessagesReturn {
  messages: Message[];
  isTyping: boolean;
  isGeneratingDocument: boolean;
  isGeneratingFloorPlan: boolean;
  documentType: 'pdf' | 'excel' | null;
  lastSuggestedEmotion: string | null;
  moodPattern: MoodPattern | null;
  messageCount: number;
  totalMessageCount: number;
  hasReachedLimit: boolean;
  maxMessages: number;
  isLoadingFromHistory: boolean;
  loadMessages: () => Promise<void>;
  loadMoreMessages: () => Promise<void>;
  hasMoreMessages: boolean;
  isLoadingMore: boolean;
  sendMessage: (content: string, attachment?: FileAttachment | null) => Promise<void>;
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  setMessagesFromHistory: (messages: Message[]) => void;
}

export interface UseFileUploadReturn {
  selectedFile: File | null;
  isUploading: boolean;
  uploadProgress: number;
  isDragOver: boolean;
  fileInputRef: React.RefObject<HTMLInputElement>;
  uploadFile: (file: File) => Promise<FileAttachment | null>;
  handleFileSelect: (file: File | null) => void;
  removeFile: () => void;
  handleDragEnter: (e: React.DragEvent) => void;
  handleDragLeave: (e: React.DragEvent) => void;
  handleDragOver: (e: React.DragEvent) => void;
  handleDrop: (e: React.DragEvent) => void;
  // Pre-upload state
  uploadedAttachment: FileAttachment | null;
  clearUploadedAttachment: () => void;
  // Retry functionality
  uploadFailed: boolean;
  retryUpload: () => Promise<void>;
}

export interface UseChatSessionReturn {
  currentSessionId: string;
  recentChats: ChatHistory[];
  isLoadingChats: boolean;
  selectedChats: Set<number>;
  showChatSelection: boolean;
  setSelectedChats: (chats: Set<number>) => void;
  setShowChatSelection: (show: boolean) => void;
  loadRecentChats: () => Promise<void>;
  startNewChat: () => void;
  ensureSessionId: () => string;
  loadChat: (chatHistory: ChatHistory) => Message[];
  deleteSelectedChats: () => Promise<void>;
  deleteAllChats: () => Promise<void>;
  toggleChatSelection: (index: number) => void;
  selectAllChats: () => void;
}

export interface UseAuthReturn {
  hasAccess: boolean;
  hasAcceptedTerms: boolean;
  isAdmin: boolean;
  isDuty: boolean;
  hasDutyAccess: boolean;
  isAuthLoading: boolean;
  userProfile: UserProfile | null;
  currentMonthUsage: number;
  monthlyLimit: number | null;
  usageResetDate: string | null;
  checkAccess: () => Promise<void>;
  checkAdminRole: () => Promise<void>;
  loadUserProfile: () => Promise<void>;
  acceptTerms: (consent: { privacy: boolean; terms: boolean; aiDisclaimer: boolean }) => Promise<void>;
}

// ============================================
// COMPONENT PROP TYPES
// ============================================

export interface MessageBubbleProps {
  message: Message;
  onCopy: (content: string) => void;
  onReply: (message: Message) => void;
  userName?: string;
  userAvatar?: string;
}

export interface MessageListProps {
  messages: Message[];
  isTyping: boolean;
  userName?: string;
  userAvatar?: string;
  onCopy: (content: string) => void;
  onReply: (message: Message) => void;
}

export interface ChatInputProps {
  onSend: (content: string, fileToUpload?: File | null) => Promise<void>;
  isDisabled: boolean;
  selectedMode: AIMode;
  selectedFile: File | null;
  isUploading: boolean;
  isDragOver: boolean;
  onFileSelect: (file: File | null) => void;
  onRemoveFile: () => void;
  onDragEnter: (e: React.DragEvent) => void;
  onDragLeave: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
  fileInputRef: React.RefObject<HTMLInputElement>;
  hasMessages: boolean;
  sidebarOpen?: boolean;
  transcriptOpen?: boolean;
  modes: AIModeConfig[];
  onModeChange: (mode: AIMode) => void;
  prefillValue?: string;
  onPrefillConsumed?: () => void;
}

export interface SidebarProps {
  userName?: string;
  userEmail?: string;
  userAvatar?: string;
  userId?: string;
  accessToken?: string;
  isTyping: boolean;
  hasAccess: boolean;
  isAuthLoading?: boolean;
  isLoadingChats?: boolean;
  selectedMode: AIMode;
  modes: AIModeConfig[];
  recentChats: ChatHistory[];
  showChatSelection: boolean;
  selectedChats: Set<number>;
  remaining?: number;
  totalLimit?: number;
  bonusCredits?: number;
  allowed?: boolean;
  isFree?: boolean;
  isUnlimited?: boolean;
  resetsAt?: string | null;
  tier?: string;
  isUsageLoading?: boolean;
  onCreditsUpdated?: () => void;
  onModeSelect: (mode: AIMode) => void;
  onNewChat: () => void;
  onLoadChat: (chat: ChatHistory) => void;
  onToggleChatSelection: (index: number) => void;
  onSelectAllChats: () => void;
  onDeleteSelected: () => Promise<void>;
  onDeleteAllChats: () => Promise<void>;
  onShowChatSelection: (show: boolean) => void;
  onLogout: () => Promise<void>;
  onAvatarUpdated?: () => void;
  isAdmin?: boolean;
  hasDutyAccess?: boolean;
  onAdminPanelClick?: () => void;
  onStartTutorial?: () => void;
  isTutorialProfileStep?: boolean;
  onOpenFeedback?: () => void;
  betaFeedbackReward?: number;
}
