import React, { useState, useEffect } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent, SidebarGroupLabel, SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem } from '@/components/ui/sidebar';
import { Plus, LogOut, Trash2, Settings, X, MessageSquare, Search, Star, Shield, Brain, ChevronDown, GraduationCap, Loader2, Volume2, VolumeX, Headphones, Sparkles, AlertTriangle, Calculator, Monitor, ClipboardCheck, BarChart3, Activity, FileText, Network } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useSidebar } from '@/components/ui/sidebar';
import { CreditUpgradeCard } from './CreditUpgradeCard';
import SupportWidget from '@/components/support/SupportWidget';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import type { SidebarProps } from '@/types/dashboard.types';
import { useSoundStore } from '@/stores/soundStore';
import { useIsMobile } from '@/hooks/use-mobile';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

import { usePinnedChats } from '@/hooks/usePinnedChats';
import { supabase } from '@/integrations/supabase/client';

// Moved outside to prevent recreation on each render
interface ProfileTriggerButtonProps extends React.ComponentPropsWithoutRef<'button'> {
  userName?: string;
  userEmail?: string;
  userAvatar?: string;
}

const ProfileTriggerButton = React.memo(React.forwardRef<HTMLButtonElement, ProfileTriggerButtonProps>(
  ({ userName, userEmail, userAvatar, ...props }, ref) => (
    <button
      ref={ref}
      data-tutorial="profile"
      className={cn(
        "flex items-center gap-3 p-3 w-full",
        "cursor-pointer rounded-xl",
        "bg-muted/40",
        "border border-border/50",
        "shadow-sm hover:shadow-md",
        "hover:bg-muted/60 hover:border-border/70",
        "hover:-translate-y-0.5",
        "transition-all duration-200 ease-out",
        "active:scale-[0.98]",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/20"
      )}
      {...props}
    >
      <div className="relative flex-shrink-0">
        <Avatar className="w-10 h-10 ring-2 ring-background shadow-sm">
          <AvatarImage src={userAvatar} alt={userName || 'User'} />
          <AvatarFallback className="bg-primary/10 text-primary text-sm font-semibold">
            {userName?.charAt(0) || userEmail?.charAt(0) || 'U'}
          </AvatarFallback>
        </Avatar>
      </div>
      <div className="flex-1 min-w-0 text-left">
        <p className="text-sm font-semibold truncate text-foreground">
          {userName || 'User'}
        </p>
        <p className="text-xs text-muted-foreground truncate">
          {userEmail}
        </p>
      </div>
      <div className="flex items-center justify-center w-6 h-6 rounded-full bg-background/80 shadow-sm">
        <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
      </div>
    </button>
  )
));
ProfileTriggerButton.displayName = 'ProfileTriggerButton';

export const Sidebar = ({
  userName,
  userEmail,
  userAvatar,
  userId,
  accessToken,
  isTyping,
  hasAccess,
  isAuthLoading,
  isLoadingChats,
  selectedMode,
  modes,
  recentChats,
  showChatSelection,
  selectedChats,
  remaining = 0,
  totalLimit = 5,
  allowed = true,
  isFree = true,
  isUnlimited: isUnlimitedProp = false,
  resetsAt = null,
  tier: tierProp = 'free',
  onModeSelect,
  onNewChat,
  onLoadChat,
  onToggleChatSelection,
  onSelectAllChats,
  onDeleteSelected,
  onDeleteAllChats,
  onShowChatSelection,
  onLogout,
  onAvatarUpdated,
  isAdmin,
  hasDutyAccess,
  onAdminPanelClick,
  onStartTutorial,
  isTutorialProfileStep,
  onOpenFeedback,
  betaFeedbackReward = 5,
  isUsageLoading = false,
  onCreditsUpdated,
}: SidebarProps) => {
  const {
    toggleSidebar
  } = useSidebar();
  const navigate = useNavigate();
  const { toast } = useToast();
  const soundContext = useSoundStore();
  const isMobile = useIsMobile();
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [isDeletingAll, setIsDeletingAll] = useState(false);
  const [showSupportWidget, setShowSupportWidget] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  
  // Use database-synced pinned chats hook instead of localStorage
  const { pinnedChats, togglePin } = usePinnedChats(userId, accessToken);
  // v2.10.0 — role determines whether Resume Hub entry is shown.
  const { role: userRole } = useUserRole(userId);
  
  // Use props from DashboardContainer (single source of truth)
  
  // Fetch user subscription tier
  const [subscriptionTier, setSubscriptionTier] = useState<string>('free');
  
  useEffect(() => {
    if (!userId) return;
    
    // Non-blocking fetch
    const fetchTier = async () => {
      try {
        const { data } = await supabase
          .from('user_subscriptions')
          .select('subscription_tier')
          .eq('user_id', userId)
          .maybeSingle();
        if (data?.subscription_tier) {
          setSubscriptionTier(data.subscription_tier);
        }
      } catch {
        // Silent failure - default to free
      }
    };
    fetchTier();
  }, [userId]);


  // Profile menu content - memoized to prevent flickering
  const ProfileMenuContent = React.useMemo(() => (
    <>
      {/* User Info Header */}
      <div className="px-4 py-3 bg-muted/30">
        <p className="text-sm font-semibold text-foreground truncate">{userName || 'User'}</p>
        <p className="text-xs text-muted-foreground truncate">{userEmail}</p>
      </div>
      
      {/* Gradient Divider */}
      <div className="h-px bg-gradient-to-r from-transparent via-border/60 to-transparent" />
      
      {/* Menu Items */}
      <div className="p-2 space-y-0.5">
        {subscriptionTier === 'free' && (
          <Button 
            onClick={() => { setMenuOpen(false); navigate('/dashboard/pricing'); }} 
            variant="ghost" 
            className="w-full justify-start h-11 px-3 gap-3 rounded-xl bg-gradient-to-r from-purple-500/10 to-purple-600/10 hover:from-purple-500/20 hover:to-purple-600/20 border border-purple-500/20 transition-colors duration-150"
          >
            <div className="w-8 h-8 rounded-lg bg-purple-500/20 flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-purple-500" />
            </div>
            <div className="flex flex-col items-start">
              <span className="text-sm font-medium text-purple-500">Upgrade Plan</span>
              <span className="text-[10px] text-purple-400/70">Get more credits</span>
            </div>
          </Button>
        )}
        
        <Button 
          onClick={() => { setMenuOpen(false); navigate('/settings'); }} 
          onMouseEnter={() => import('@/pages/Settings')} 
          variant="ghost" 
          className="w-full justify-start h-11 px-3 gap-3 rounded-xl hover:bg-muted/60 transition-colors duration-150"
        >
          <div className="w-8 h-8 rounded-lg bg-muted/50 flex items-center justify-center">
            <Settings className="w-4 h-4 text-muted-foreground" />
          </div>
          <div className="flex flex-col items-start">
            <span className="text-sm font-medium">Settings</span>
            <span className="text-[10px] text-muted-foreground/70">Preferences & account</span>
          </div>
        </Button>
        
        <Button onClick={() => {
          setMenuOpen(false); onStartTutorial?.();
        }} variant="ghost" className="w-full justify-start h-11 px-3 gap-3 rounded-xl hover:bg-muted/60 transition-colors duration-150">
          <div className="w-8 h-8 rounded-lg bg-muted/50 flex items-center justify-center">
            <GraduationCap className="w-4 h-4 text-muted-foreground" />
          </div>
          <div className="flex flex-col items-start">
            <span className="text-sm font-medium">Tutorial</span>
            <span className="text-[10px] text-muted-foreground/70">Learn how to use AYN</span>
          </div>
        </Button>
        
        <Button onClick={() => {
          setMenuOpen(false); setShowSupportWidget(true);
        }} variant="ghost" className="w-full justify-start h-11 px-3 gap-3 rounded-xl hover:bg-muted/60 transition-colors duration-150">
          <div className="w-8 h-8 rounded-lg bg-muted/50 flex items-center justify-center">
            <Headphones className="w-4 h-4 text-muted-foreground" />
          </div>
          <div className="flex flex-col items-start">
            <span className="text-sm font-medium">Support</span>
            <span className="text-[10px] text-muted-foreground/70">Get help from AYN</span>
          </div>
        </Button>
        

      </div>
      
      {/* Gradient Divider */}
      <div className="h-px bg-gradient-to-r from-transparent via-border/60 to-transparent" />
      
      {/* Sign Out */}
      <div className="p-2">
        <Button
          onClick={async () => {
            setIsSigningOut(true);
            try {
              await onLogout();
            } catch (error) {
              localStorage.clear();
              sessionStorage.clear();
              window.location.href = '/';
            }
          }}
          disabled={isSigningOut}
          variant="ghost"
          className="w-full justify-start h-11 px-3 gap-3 rounded-xl text-destructive/80 hover:text-destructive hover:bg-destructive/8 transition-colors duration-150"
        >
          <div className="w-8 h-8 rounded-lg bg-destructive/10 flex items-center justify-center">
            {isSigningOut ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogOut className="w-4 h-4" />}
          </div>
          <span className="text-sm font-medium">
            {isSigningOut ? 'Signing out...' : 'Sign Out'}
          </span>
        </Button>
      </div>
    </>
  ), [userName, userEmail, hasDutyAccess, isAdmin, isSigningOut, subscriptionTier, onAdminPanelClick, onLogout, onStartTutorial, navigate, setShowSupportWidget, setMenuOpen]);


  const formatCompactTime = (date: Date): string => {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);
    if (diffMins < 1) return 'Now';
    if (diffMins < 60) return `${diffMins}m`;
    if (diffHours < 24) return `${diffHours}h`;
    if (diffDays === 1) return 'Yesterday';
    return format(date, 'MMM d');
  };
  // togglePin is now provided by usePinnedChats hook (line 141)
  const filteredAndSortedChats = React.useMemo(() => {
    let filtered = recentChats;
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = recentChats.filter(chat => chat.title.toLowerCase().includes(query) || chat.lastMessage.toLowerCase().includes(query));
    }
    return [...filtered].sort((a, b) => {
      const aPinned = pinnedChats.has(a.sessionId);
      const bPinned = pinnedChats.has(b.sessionId);
      if (aPinned && !bPinned) return -1;
      if (!aPinned && bPinned) return 1;
      return b.timestamp.getTime() - a.timestamp.getTime();
    });
  }, [recentChats, searchQuery, pinnedChats]);
  return <div className="h-full flex flex-col bg-background backdrop-blur-2xl">
      <SidebarHeader>
        {/* Premium Header */}
        <div className="p-4 pb-3">
          <div className="flex items-center justify-between">
            {/* Left: AYN Brand with Brain icon */}
            <div className="flex items-center gap-3">
              <div className="relative">
                <div className="w-9 h-9 rounded-xl bg-black dark:bg-white flex items-center justify-center">
                  <Brain className="w-4 h-4 text-white dark:text-black" />
                </div>
                {/* Status dot */}
                <div className={cn("absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-background", isAuthLoading ? "bg-yellow-500 animate-pulse" : hasAccess ? "bg-green-500" : "bg-foreground/30")}>
                  {isTyping && <span className="absolute inset-0 rounded-full bg-green-500 animate-ping opacity-75" />}
                </div>
              </div>
              <div>
                <h1 className="text-sm font-semibold tracking-tight text-foreground">AYN AI</h1>
                <p className="text-xs text-foreground/60">
                  {isTyping ? 'Thinking...' : isAuthLoading ? 'Loading...' : hasAccess ? 'Active' : 'Inactive'}
                </p>
              </div>
            </div>

            {/* Right: Actions */}
            <div className="flex items-center gap-1">
              {soundContext && <Button onClick={() => soundContext.toggleEnabled()} variant="ghost" size="icon" className="h-8 w-8 rounded-lg hover:bg-foreground hover:text-background transition-colors" title={soundContext.enabled ? 'Mute sounds' : 'Enable sounds'}>
                  {soundContext.enabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
                </Button>}
              <Button onClick={toggleSidebar} variant="ghost" size="icon" className="h-8 w-8 rounded-lg hover:bg-foreground hover:text-background transition-colors">
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
        <div className="h-px bg-border" />
      </SidebarHeader>

      <SidebarContent className="flex flex-col overflow-hidden">
        {/* Unified Credit & Upgrade Card */}
        {userId && (
          <SidebarGroup className="flex-shrink-0 px-4 pt-4 pb-2">
            <SidebarGroupContent>
              <CreditUpgradeCard 
                remaining={remaining}
                totalLimit={totalLimit}
                allowed={allowed}
                resetsAt={resetsAt}
                tier={subscriptionTier || tierProp}
                isFree={isFree}
                isUnlimited={isUnlimitedProp}
                userId={userId}
                onOpenFeedback={onOpenFeedback}
                rewardAmount={betaFeedbackReward}
                isUsageLoading={isUsageLoading}
              />
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        
        {/* Spheres Button — hidden for now */}
        {false && (
        <SidebarGroup className="flex-shrink-0 px-4 pb-2">
          <SidebarGroupContent>
            <button
              onClick={() => navigate('/world-intelligence')}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl bg-orange-400 hover:bg-orange-500 transition-all duration-200 group shadow-md shadow-orange-400/20"
            >
              <div className="w-8 h-8 rounded-lg bg-black/20 flex items-center justify-center shrink-0">
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                  <circle cx="10" cy="10" r="2.5" fill="black" opacity="0.7"/>
                  <circle cx="10" cy="3.5" r="1.2" fill="black" opacity="0.8"/>
                  <circle cx="16.5" cy="10" r="1" fill="black" opacity="0.6"/>
                  <circle cx="10" cy="16.5" r="1.2" fill="black" opacity="0.8"/>
                  <circle cx="3.5" cy="10" r="1" fill="black" opacity="0.6"/>
                  <circle cx="14.8" cy="5.2" r="0.8" fill="black" opacity="0.5"/>
                  <circle cx="14.8" cy="14.8" r="0.8" fill="black" opacity="0.5"/>
                  <circle cx="5.2" cy="14.8" r="0.8" fill="black" opacity="0.5"/>
                  <circle cx="5.2" cy="5.2" r="0.8" fill="black" opacity="0.5"/>
                  <circle cx="10" cy="10" r="6.5" stroke="black" strokeWidth="0.5" strokeOpacity="0.3" strokeDasharray="1.5 1.5"/>
                </svg>
              </div>
              <span className="text-sm font-semibold text-black">Sphere</span>
            </button>
          </SidebarGroupContent>
        </SidebarGroup>
        )}



        {/* v2.10.0 — Resume Hub entry hidden for employers. */}
        {userRole !== 'employer' && (
          <SidebarGroup className="flex-shrink-0 px-4 pb-3">
            <SidebarGroupContent>
              <button
                onClick={() => navigate('/resume-hub')}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl bg-muted/40 hover:bg-muted/60 border border-border/50 hover:border-border/70 transition-all duration-200 group"
              >
                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <FileText className="w-4 h-4 text-primary" />
                </div>
                <div className="flex-1 text-left">
                  <div className="text-sm font-semibold text-foreground">Resume Hub</div>
                  <div className="text-[10px] text-muted-foreground">Resumes, jobs, autofill</div>
                </div>
              </button>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {/* Search Input */}
        <div className="px-4 pb-3 flex-shrink-0">
          <div className={cn("relative transition-all duration-300", isSearchFocused && "transform scale-[1.02]")}>
            <Search className={cn("absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 transition-colors duration-200", isSearchFocused ? "text-foreground" : "text-foreground/50")} />
            <Input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} onFocus={() => setIsSearchFocused(true)} onBlur={() => setIsSearchFocused(false)} placeholder="Search chats..." className={cn("pl-9 h-9 text-sm rounded-xl", "bg-transparent", "!border !border-border/60", "placeholder:text-foreground/40", "focus:bg-background focus:!border-foreground/40", "!ring-0 !outline-none", "focus:!ring-0 focus-visible:!ring-0 focus-visible:!ring-offset-0", "transition-all duration-300")} />
          </div>
        </div>

        {/* Recent Chats Label and Actions */}
        <div className="flex-shrink-0 px-4 pb-3">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-muted-foreground/70 uppercase tracking-[0.08em]">
              Recent Chats
            </span>
            {recentChats.length > 0 && <div className="flex gap-1">
                {!showChatSelection ? <>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-6 px-2 text-xs text-destructive/70 hover:text-destructive hover:bg-destructive/10">
                          Clear All
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent className="rounded-2xl">
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete All Chat History?</AlertDialogTitle>
                          <AlertDialogDescription>
                            This will permanently delete all {recentChats.length} conversation(s). This action cannot be undone.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel className="rounded-xl">Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={async () => {
                              setIsDeletingAll(true);
                              await onDeleteAllChats();
                              setIsDeletingAll(false);
                            }}
                            className="rounded-xl bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          >
                            {isDeletingAll ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Trash2 className="w-4 h-4 mr-2" />}
                            Delete All
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                    <Button onClick={() => onShowChatSelection(true)} variant="ghost" size="sm" className="h-6 px-2 text-xs text-foreground/60 hover:text-background hover:bg-foreground">
                      Select
                    </Button>
                  </> : <>
                    <Button onClick={onSelectAllChats} variant="ghost" size="sm" className="h-6 px-2 text-xs hover:bg-foreground hover:text-background">
                      {selectedChats.size === recentChats.length ? 'None' : 'All'}
                    </Button>
                    <Button onClick={() => onShowChatSelection(false)} variant="ghost" size="sm" className="h-6 px-2 text-xs hover:bg-foreground hover:text-background">
                      Cancel
                    </Button>
                  </>}
              </div>}
          </div>
        </div>

        {/* Delete Selected Button - At Top */}
        {showChatSelection && selectedChats.size > 0 && <div className="px-4 pb-2">
            <Button onClick={onDeleteSelected} variant="destructive" size="sm" className="w-full h-9 rounded-xl">
              <Trash2 className="w-4 h-4 mr-2" />
              Delete Selected ({selectedChats.size})
            </Button>
          </div>}

        {/* Scrollable Chat List - min-height prevents layout shift */}
        <div className="flex-1 min-h-0 overflow-hidden">
          <ScrollArea className="h-full">
            <div className="py-1 px-3">
              <SidebarMenu className="space-y-0.5">
              {isLoadingChats ? (
                // Skeleton UI - 5 placeholder items
                <div className="space-y-2 px-1">
                  {[...Array(5)].map((_, i) => (
                    <div key={i} className="flex items-center gap-3 p-3 rounded-xl bg-muted/30 animate-pulse">
                      <div className="w-8 h-8 rounded-full bg-muted/60" />
                      <div className="flex-1 space-y-2">
                        <div className="h-3 bg-muted/60 rounded w-3/4" />
                        <div className="h-2 bg-muted/40 rounded w-1/2" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : filteredAndSortedChats.length === 0 ? <div className="flex flex-col items-center justify-center py-16 px-6">
                  <div className="w-14 h-14 rounded-full bg-muted/40 flex items-center justify-center mb-4">
                    <MessageSquare className="w-6 h-6 text-muted-foreground/40" />
                  </div>
                  <p className="text-sm font-medium text-muted-foreground mb-1">
                    {searchQuery ? 'No chats found' : 'No conversations yet'}
                  </p>
                  <p className="text-xs text-muted-foreground/60 text-center">
                    Start a new chat to begin
                  </p>
                </div> : <>
                  {filteredAndSortedChats.map((chat, index) => {
                const isPinned = pinnedChats.has(chat.sessionId);
                const originalIndex = recentChats.findIndex(c => c.sessionId === chat.sessionId);
return <SidebarMenuItem key={chat.sessionId} className={cn("relative", index > 0 && "before:absolute before:top-0 before:left-4 before:right-4 before:h-px before:bg-border/30")}>
                        <div className="flex items-center gap-2 w-full group">
                          {showChatSelection && <Checkbox checked={selectedChats.has(originalIndex)} onCheckedChange={() => onToggleChatSelection(originalIndex)} className="ml-2" />}
                          <div onClick={() => !showChatSelection && !isTyping && onLoadChat(chat)} role="button" tabIndex={isTyping ? -1 : 0} onKeyDown={e => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        if (!showChatSelection && !isTyping) onLoadChat(chat);
                      }
                    }} className={cn("flex-1 h-auto py-2 px-3 pr-5 rounded-lg", isTyping ? "cursor-not-allowed opacity-50" : "cursor-pointer hover:bg-muted/40 active:scale-[0.99]", "transition-all duration-150 ease-out", isPinned && "bg-muted/20")}>
                            <div className="w-full min-w-0">
                              {/* Row 1: Icon + Title + Time + Star */}
                              <div className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-2 min-w-0 flex-1">
                                  <div className="w-6 h-6 rounded-full bg-muted/60 flex items-center justify-center flex-shrink-0">
                                    <MessageSquare className="w-3.5 h-3.5 text-foreground/50" />
                                  </div>
                                  <span className="text-sm font-medium truncate text-foreground max-w-[140px]">
                                    {chat.title}
                                  </span>
                                </div>
                                <div className="flex items-center gap-1 flex-shrink-0">
                                  <span className="text-[11px] text-muted-foreground">
                                    {formatCompactTime(new Date(chat.timestamp))}
                                  </span>
                                  <button onClick={e => togglePin(chat.sessionId, e)} className={cn("w-5 h-5 flex items-center justify-center rounded transition-all duration-200", "opacity-60 hover:opacity-100", isPinned && "opacity-100", isPinned ? "text-amber-500 hover:text-amber-600" : "text-muted-foreground/40 hover:text-muted-foreground")}>
                                    <Star className={cn("w-3 h-3", isPinned && "fill-amber-500")} />
                                  </button>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </SidebarMenuItem>;
              })}
                </>}
            </SidebarMenu>
            </div>
          </ScrollArea>
        </div>
      </SidebarContent>

      <SidebarFooter className="p-3 space-y-3">
        
        {/* User Profile */}
        {isMobile ? (
          <Sheet>
            <SheetTrigger asChild>
              <ProfileTriggerButton userName={userName} userEmail={userEmail} userAvatar={userAvatar} />
            </SheetTrigger>
            <SheetContent 
              side="bottom" 
              className="max-h-[85vh] overflow-y-auto rounded-t-2xl px-0 bg-background border-t border-border/60"
            >
              {ProfileMenuContent}
            </SheetContent>
          </Sheet>
        ) : (
          <div className="relative">
            <ProfileTriggerButton
              userName={userName}
              userEmail={userEmail}
              userAvatar={userAvatar}
              onClick={() => setMenuOpen(o => !o)}
            />
            {menuOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
                <div className="absolute bottom-full left-0 mb-2 w-[19rem] z-50 rounded-2xl overflow-hidden bg-background border border-border/60 shadow-2xl">
                  {ProfileMenuContent}
                </div>
              </>
            )}
          </div>
        )}

        {/* Support Widget */}
        <SupportWidget open={showSupportWidget} onClose={() => setShowSupportWidget(false)} />
      </SidebarFooter>
    </div>;
};