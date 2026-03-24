import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Progress } from '@/components/ui/progress';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { CreditGiftModal } from './CreditGiftModal';
import { 
  Users, 
  RefreshCw, 
  Search,
  Shield,
  Infinity as InfinityIcon,
  Edit2,
  Save,
  X,
  AlertTriangle,
  MessageSquare,
  Wrench,
  FileText,
  Gift
} from 'lucide-react';
import { getErrorMessage, ErrorCodes } from '@/lib/errorMessages';

interface UserLimit {
  id: string;
  user_id: string;
  daily_messages: number | null;
  daily_engineering: number | null;
  daily_search: number | null;
  daily_files: number | null;
  current_daily_messages: number | null;
  current_daily_engineering: number | null;
  current_daily_search: number | null;
  current_daily_files: number | null;
  is_unlimited: boolean | null;
  monthly_cost_limit_sar: number | null;
  current_month_cost_sar: number | null;
  bonus_credits: number | null;
  monthly_messages: number | null;
  current_monthly_messages: number | null;
  // Joined from profiles
  display_name?: string;
}

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.05 }
  }
};

const itemVariants = {
  hidden: { opacity: 0, y: 10 },
  visible: { 
    opacity: 1, 
    y: 0,
    transition: { duration: 0.2 }
  }
};

export function UserAILimits() {
  const [limits, setLimits] = useState<UserLimit[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [editingUser, setEditingUser] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<Partial<UserLimit>>({});
  const [giftModalOpen, setGiftModalOpen] = useState(false);
  const [selectedUserForGift, setSelectedUserForGift] = useState<UserLimit | null>(null);

  const fetchLimits = async () => {
    try {
      // Fetch limits
      const { data: limitsData, error: limitsError } = await supabase
        .from('user_ai_limits')
        .select('*')
        .order('current_daily_messages', { ascending: false });

      if (limitsError) throw limitsError;

      // Fetch user names from enriched view (includes Google users)
      const userIds = limitsData?.map(l => l.user_id) || [];
      const { data: profilesData } = await supabase
        .from('admin_users_view')
        .select('id, display_name, email')
        .in('id', userIds);

      // Create a map for quick lookup
      const profileMap = new Map(
        profilesData?.map((p: any) => [p.id, p.display_name || p.email?.split('@')[0]]) || []
      );

      // Merge the data
      const mergedLimits = (limitsData || []).map(limit => ({
        ...limit,
        display_name: profileMap.get(limit.user_id) || undefined
      }));

      setLimits(mergedLimits);
    } catch (error) {
      console.error('Error fetching limits:', error);
      toast.error(getErrorMessage(ErrorCodes.DATA_LOAD_FAILED).description);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchLimits();
  }, []);

  const startEditing = (user: UserLimit) => {
    setEditingUser(user.user_id);
    setEditValues({
      daily_messages: user.daily_messages,
      daily_engineering: user.daily_engineering,
      daily_search: user.daily_search,
      daily_files: user.daily_files,
      is_unlimited: user.is_unlimited,
      monthly_cost_limit_sar: user.monthly_cost_limit_sar
    });
  };

  const saveEditing = async () => {
    if (!editingUser) return;

    try {
      const { error } = await supabase
        .from('user_ai_limits')
        .update({
          ...editValues,
          updated_at: new Date().toISOString()
        })
        .eq('user_id', editingUser);

      if (error) throw error;

      setLimits(prev => prev.map(l => 
        l.user_id === editingUser ? { ...l, ...editValues } : l
      ));
      setEditingUser(null);
      toast.success('Limits updated');
    } catch (error) {
      console.error('Error updating limits:', error);
      toast.error(getErrorMessage(ErrorCodes.SETTINGS_SAVE_FAILED).description);
    }
  };

  const toggleUnlimited = async (userId: string, unlimited: boolean) => {
    try {
      // Upsert ensures the row exists (so toggling works even for users who never used the app yet)
      const { error } = await supabase
        .from('user_ai_limits')
        .upsert(
          { user_id: userId, is_unlimited: unlimited, updated_at: new Date().toISOString() },
          { onConflict: 'user_id' }
        );

      if (error) throw error;

      // Verify the update was successful by querying back
      const { data: verifyData, error: verifyError } = await supabase
        .from('user_ai_limits')
        .select('is_unlimited')
        .eq('user_id', userId)
        .single();

      if (verifyError) {
        console.error('Failed to verify update:', verifyError);
        toast.error(getErrorMessage(ErrorCodes.SETTINGS_SAVE_FAILED).description);
        return;
      }

      // Update local state with verified value
      const confirmedValue = verifyData.is_unlimited;
      setLimits(prev => prev.map(l =>
        l.user_id === userId ? { ...l, is_unlimited: confirmedValue } : l
      ));

      toast.success(
        confirmedValue
          ? '✓ User now has UNLIMITED access (no limits applied)'
          : '✓ User limits restored'
      );
    } catch (error) {
      console.error('Error toggling unlimited:', error);
      toast.error(getErrorMessage(ErrorCodes.SETTINGS_SAVE_FAILED).description);
    }
  };

  const getUsagePercentage = (current: number | null, limit: number | null) => {
    if (!limit || limit === 0) return 0;
    return Math.min(((current || 0) / limit) * 100, 100);
  };

  const getUsageColor = (percentage: number) => {
    if (percentage >= 90) return 'text-red-500';
    if (percentage >= 70) return 'text-amber-500';
    return 'text-emerald-500';
  };

  const filteredLimits = limits.filter((l: UserLimit) => {
    const query = searchQuery.toLowerCase();
    return l.user_id.toLowerCase().includes(query) || 
           (l.display_name?.toLowerCase().includes(query) ?? false);
  });

  const unlimitedCount = limits.filter(l => l.is_unlimited).length;
  const atLimitCount = limits.filter(l => 
    !l.is_unlimited && (l.current_daily_messages ?? 0) >= (l.daily_messages ?? 5)
  ).length;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}
        >
          <RefreshCw className="w-8 h-8 text-primary" />
        </motion.div>
      </div>
    );
  }

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="space-y-6"
    >
      {/* Header */}
      <motion.div variants={itemVariants} className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-primary/10 ring-1 ring-primary/20">
            <Shield className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h2 className="text-xl font-semibold">User AI Limits</h2>
            <p className="text-sm text-muted-foreground">
              Manage per-user daily and monthly AI usage limits
            </p>
          </div>
        </div>
        <Button 
          variant="outline" 
          size="sm"
          onClick={() => { setIsLoading(true); fetchLimits(); }}
          disabled={isLoading}
          className="border-border/50"
        >
          <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? "animate-spin" : ""}`} />
          {isLoading ? "Loading..." : "Refresh"}
        </Button>
      </motion.div>

      {/* Search */}
      <motion.div variants={itemVariants} className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Search by name or user ID..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10 bg-muted/30 border-border/50"
        />
      </motion.div>

      {/* Stats */}
      <motion.div variants={itemVariants} className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          { label: 'Total Users', value: limits.length, Icon: Users, color: 'from-primary/20 to-primary/5', iconColor: 'text-primary' },
          { label: 'Unlimited Users', value: unlimitedCount, Icon: InfinityIcon, color: 'from-emerald-500/20 to-emerald-500/5', iconColor: 'text-emerald-500' },
          { label: 'At Limit Today', value: atLimitCount, Icon: AlertTriangle, color: 'from-red-500/20 to-red-500/5', iconColor: 'text-red-500' },
        ].map((stat) => {
          const Icon = stat.Icon;
          return (
            <Card key={stat.label} className="relative overflow-hidden border border-border/50 bg-card/80 backdrop-blur-xl">
              <div className={`absolute inset-0 bg-gradient-to-br ${stat.color}`} />
              <CardContent className="relative pt-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">{stat.label}</p>
                    <p className="text-2xl font-bold">{stat.value}</p>
                  </div>
                  <div className="p-2 rounded-xl bg-background/50">
                    <Icon className={`w-6 h-6 ${stat.iconColor}`} />
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </motion.div>

      {/* User List */}
      <motion.div variants={itemVariants}>
        <Card className="relative overflow-hidden border border-border/50 bg-card/80 backdrop-blur-xl">
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-primary/60 via-primary to-primary/60" />
          <CardHeader>
            <CardTitle className="text-base">User Limits ({filteredLimits.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[400px]">
              <motion.div variants={containerVariants} className="space-y-2">
                {filteredLimits.map(user => {
                  const isEditing = editingUser === user.user_id;
                  const msgPercentage = getUsagePercentage(user.current_daily_messages, user.daily_messages);
                  
                  return (
                    <motion.div 
                      key={user.user_id}
                      variants={itemVariants}
                      whileHover={{ x: 4 }}
                      className={`p-4 rounded-xl border transition-all ${
                        isEditing 
                          ? 'bg-primary/5 border-primary/30' 
                          : 'bg-muted/20 border-border/30 hover:bg-muted/40'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-3">
                            <p className="font-medium text-sm truncate max-w-[200px]">
                              {user.display_name || (
                                <span className="font-mono text-muted-foreground">
                                  {user.user_id.substring(0, 8)}...
                                </span>
                              )}
                            </p>
                            {user.is_unlimited && (
                              <Badge variant="default" className="bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
                                <InfinityIcon className="w-3 h-3 mr-1" />
                                Unlimited
                              </Badge>
                            )}
                            {(user.bonus_credits ?? 0) > 0 && (
                              <Badge variant="secondary" className="bg-purple-500/10 text-purple-600 border border-purple-500/20">
                                <Gift className="w-3 h-3 mr-1" />
                                +{user.bonus_credits} bonus
                              </Badge>
                            )}
                          </div>
                          
                          {isEditing ? (
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                              {[
                                { key: 'daily_messages', label: 'Messages', icon: MessageSquare },
                                { key: 'daily_engineering', label: 'Engineering', icon: Wrench },
                                { key: 'daily_search', label: 'Search', icon: Search },
                                { key: 'daily_files', label: 'Files', icon: FileText },
                              ].map(({ key, label, icon: Icon }) => (
                                <div key={key} className="space-y-1">
                                  <label className="text-xs text-muted-foreground flex items-center gap-1">
                                    <Icon className="w-3 h-3" /> {label}
                                  </label>
                                  <Input
                                    type="number"
                                    value={editValues[key as keyof UserLimit] as number ?? 0}
                                    onChange={(e) => setEditValues(prev => ({ ...prev, [key]: parseInt(e.target.value) }))}
                                    disabled={Boolean(editValues.is_unlimited)}
                                    className={cn(
                                      "h-9 bg-muted/30",
                                      Boolean(editValues.is_unlimited) && "opacity-60 cursor-not-allowed"
                                    )}
                                  />
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="space-y-2">
                              <div className="flex items-center gap-4">
                                <div className="flex-1">
                                  <div className="flex items-center justify-between text-xs mb-1">
                                    <span className="text-muted-foreground">Messages</span>
                                    <span className={getUsageColor(msgPercentage)}>
                                      {user.current_daily_messages}/{user.daily_messages}
                                    </span>
                                  </div>
                                  <Progress value={msgPercentage} className="h-1.5" />
                                </div>
                              </div>
                              <div className="flex gap-4 text-xs text-muted-foreground">
                                <span>Eng: {user.current_daily_engineering}/{user.daily_engineering}</span>
                                <span>Search: {user.current_daily_search}/{user.daily_search}</span>
                                <span>Files: {user.current_daily_files}/{user.daily_files}</span>
                              </div>
                            </div>
                          )}
                        </div>

                        <div className="flex items-center gap-2">
                          {isEditing ? (
                            <>
                              <Button size="sm" variant="ghost" onClick={() => setEditingUser(null)}>
                                <X className="w-4 h-4" />
                              </Button>
                              <Button size="sm" onClick={saveEditing}>
                                <Save className="w-4 h-4" />
                              </Button>
                            </>
                          ) : (
                            <>
                              <Button 
                                size="sm" 
                                variant="ghost" 
                                onClick={() => {
                                  setSelectedUserForGift(user);
                                  setGiftModalOpen(true);
                                }}
                                className="text-purple-500 hover:text-purple-600 hover:bg-purple-500/10"
                                title="Gift credits"
                              >
                                <Gift className="w-4 h-4" />
                              </Button>
                              <Switch
                                checked={user.is_unlimited ?? false}
                                onCheckedChange={(checked) => toggleUnlimited(user.user_id, checked)}
                              />
                              <Button size="sm" variant="ghost" onClick={() => startEditing(user)}>
                                <Edit2 className="w-4 h-4" />
                              </Button>
                            </>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
                
                {filteredLimits.length === 0 && (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <div className="p-4 rounded-2xl bg-muted/50 mb-4">
                      <Users className="w-8 h-8 text-muted-foreground" />
                    </div>
                    <p className="text-sm text-muted-foreground">No users found</p>
                  </div>
                )}
              </motion.div>
            </ScrollArea>
          </CardContent>
        </Card>
      </motion.div>

      {/* Credit Gift Modal */}
      <CreditGiftModal
        isOpen={giftModalOpen}
        onClose={() => {
          setGiftModalOpen(false);
          setSelectedUserForGift(null);
        }}
        user={selectedUserForGift}
        onSuccess={() => {
          fetchLimits();
        }}
      />
    </motion.div>
  );
}
