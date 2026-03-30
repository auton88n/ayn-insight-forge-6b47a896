import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { toast } from 'sonner';
import { adminSupabase as supabase } from '@/admin-app/adminSupabase';
import { NotificationLogViewer } from './NotificationLogViewer';
import { 
  AlertTriangle, 
  Users, 
  Shield,
  Save,
  Loader2,
  KeyRound,
  ChevronDown,
  ChevronRight,
  Clock,
  Mail,
  Bell,
  Eye,
  Settings,
  Sparkles,
  Gift
} from 'lucide-react';

// Beta Program Settings Sub-component
const BetaProgramSettings = () => {
  const [betaMode, setBetaMode] = useState(false);
  const [feedbackReward, setFeedbackReward] = useState(5);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const loadConfig = async () => {
      const { data } = await supabase
        .from('system_config')
        .select('key, value')
        .in('key', ['beta_mode', 'beta_feedback_reward']);
      
      if (data) {
        data.forEach(item => {
          if (item.key === 'beta_mode') {
            setBetaMode(item.value === true || item.value === 'true');
          } else if (item.key === 'beta_feedback_reward') {
            setFeedbackReward(parseInt(String(item.value)) || 5);
          }
        });
      }
      setLoading(false);
    };
    loadConfig();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await supabase.from('system_config').upsert([
        { key: 'beta_mode', value: betaMode },
        { key: 'beta_feedback_reward', value: feedbackReward }
      ], { onConflict: 'key' });
      toast.success('Beta settings saved');
    } catch (err) {
      toast.error('Failed to save beta settings');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="flex justify-center py-4"><Loader2 className="w-5 h-5 animate-spin" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between p-4 bg-violet-500/5 rounded-xl border border-violet-500/20">
        <div>
          <Label htmlFor="beta-mode" className="font-medium flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-violet-500" />
            Enable Beta Mode
          </Label>
          <p className="text-xs text-muted-foreground mt-1">Show "BETA" badge on AYN for all users</p>
        </div>
        <Switch
          id="beta-mode"
          checked={betaMode}
          onCheckedChange={setBetaMode}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="feedback-reward" className="flex items-center gap-2">
          <Gift className="w-4 h-4 text-purple-500" />
          Feedback Survey Reward (credits)
        </Label>
        <Input
          id="feedback-reward"
          type="number"
          min={0}
          max={100}
          value={feedbackReward}
          onChange={(e) => setFeedbackReward(parseInt(e.target.value) || 0)}
          className="bg-muted/30 border-border/50 w-32"
        />
        <p className="text-xs text-muted-foreground">Credits awarded when users complete the beta feedback survey</p>
      </div>

      <Button onClick={handleSave} disabled={saving} className="bg-gradient-to-r from-violet-500 to-purple-500">
        {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
        Save Beta Settings
      </Button>
    </div>
  );
};

interface SystemConfig {
  maintenanceMode: boolean;
  maintenanceMessage: string;
  maintenanceStartTime?: string;
  maintenanceEndTime?: string;
  preMaintenanceNotice?: boolean;
  preMaintenanceMessage?: string;
  defaultMonthlyLimit: number;
  requireApproval: boolean;
  maxLoginAttempts: number;
  sessionTimeout: number;
}

interface SystemSettingsProps {
  systemConfig: SystemConfig;
  onUpdateConfig: (updates: Partial<SystemConfig>) => Promise<void>;
}

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.1 }
  }
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { 
    opacity: 1, 
    y: 0,
    transition: { duration: 0.3 }
  }
};

interface CollapsibleSectionProps {
  title: string;
  description: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
  accentColor?: string;
}

const CollapsibleSection = ({ title, description, icon, children, defaultOpen = false, accentColor = 'primary' }: CollapsibleSectionProps) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  
  const colorMap: Record<string, string> = {
    primary: 'from-primary/60 via-primary to-primary/60',
    orange: 'from-orange-500/60 via-orange-500 to-orange-500/60',
    blue: 'from-blue-500/60 via-blue-500 to-blue-500/60',
    green: 'from-emerald-500/60 via-emerald-500 to-emerald-500/60',
    purple: 'from-purple-500/60 via-purple-500 to-purple-500/60',
  };
  
  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <Card className="relative overflow-hidden border border-border/50 shadow-lg bg-card/80 backdrop-blur-xl">
        {/* Accent bar */}
        <div className={`absolute top-0 left-0 right-0 h-1 bg-gradient-to-r ${colorMap[accentColor] || colorMap.primary} ${isOpen ? 'opacity-100' : 'opacity-40'} transition-opacity`} />
        
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer hover:bg-muted/30 transition-colors">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-muted/50 ring-1 ring-border/50">
                  {icon}
                </div>
                <div>
                  <CardTitle className="text-base">{title}</CardTitle>
                  <CardDescription className="text-sm">{description}</CardDescription>
                </div>
              </div>
              <motion.div
                animate={{ rotate: isOpen ? 180 : 0 }}
                transition={{ duration: 0.2 }}
              >
                <ChevronDown className="w-5 h-5 text-muted-foreground" />
              </motion.div>
            </div>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="pt-0 pb-6">
            {children}
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
};

export const SystemSettings = ({ systemConfig, onUpdateConfig }: SystemSettingsProps) => {
  const [localConfig, setLocalConfig] = useState(systemConfig);
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  
  // PIN change state
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [isChangingPin, setIsChangingPin] = useState(false);


  // PIN change is now direct — no pending state needed

  const handleChange = <K extends keyof SystemConfig>(key: K, value: SystemConfig[K]) => {
    setLocalConfig(prev => ({ ...prev, [key]: value }));
    setHasChanges(true);
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      if (localConfig.maintenanceMode && !systemConfig.maintenanceMode) {
        const { error: notifyError } = await supabase.functions.invoke('admin-notifications', {
          body: {
            type: 'maintenance_announcement',
            message: localConfig.maintenanceMessage,
            startTime: localConfig.maintenanceStartTime,
            endTime: localConfig.maintenanceEndTime
          }
        });
        if (notifyError) {
          console.error('Failed to send maintenance notifications:', notifyError);
          toast.error('Maintenance enabled but failed to notify users');
        } else {
          toast.success('Maintenance enabled, users notified via email');
        }
      }
      
      await onUpdateConfig(localConfig);
      setHasChanges(false);
      if (!localConfig.maintenanceMode || systemConfig.maintenanceMode) {
        toast.success('Settings saved');
      }
    } catch (error) {
      toast.error('Failed to save settings');
    } finally {
      setIsSaving(false);
    }
  };

  const handleChangePin = async () => {
    if (newPin.length < 4 || newPin.length > 6) {
      toast.error('PIN must be 4-6 digits');
      return;
    }
    if (!/^\d+$/.test(newPin)) {
      toast.error('PIN must contain only numbers');
      return;
    }
    if (newPin !== confirmPin) {
      toast.error('PINs do not match');
      return;
    }

    setIsChangingPin(true);
    try {
      // Hash the new PIN using SHA-256 (same as the PIN gate)
      const msgBuffer = new TextEncoder().encode(newPin);
      const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

      // Update directly in app_settings
      const { error } = await supabase
        .from('app_settings')
        .upsert({ key: 'admin_pin_hash', value: hashHex, updated_at: new Date().toISOString() }, { onConflict: 'key' });

      if (error) throw error;

      toast.success('PIN updated successfully!');
      setNewPin('');
      setConfirmPin('');

      // Log the change
      try {
        await supabase.from('security_logs').insert({
          action: 'admin_pin_changed',
          details: { changed_at: new Date().toISOString() },
          severity: 'high'
        } as any);
      } catch {}
    } catch (error) {
      console.error('Error changing PIN:', error);
      toast.error('Failed to update PIN');
    } finally {
      setIsChangingPin(false);
    }
  };

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="space-y-4"
    >
      {/* Header */}
      <motion.div variants={itemVariants} className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-primary/10 ring-1 ring-primary/20">
            <Settings className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h2 className="text-xl font-semibold">System Settings</h2>
            <p className="text-sm text-muted-foreground">Configure system behavior and security</p>
          </div>
        </div>
        
        {hasChanges && (
          <Button 
            onClick={handleSave} 
            disabled={isSaving}
            className="bg-gradient-to-r from-primary to-primary/80"
          >
            {isSaving ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Save className="w-4 h-4 mr-2" />
            )}
            Save Changes
          </Button>
        )}
      </motion.div>
      
      {/* Maintenance Mode */}
      <motion.div variants={itemVariants}>
        <CollapsibleSection
          title="Maintenance Mode"
          description="Block users during maintenance"
          icon={<AlertTriangle className="w-5 h-5 text-orange-500" />}
          accentColor="orange"
        >
          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 bg-muted/30 rounded-xl border border-border/50">
              <div>
                <Label htmlFor="maintenance-mode" className="font-medium">Enable Maintenance Mode</Label>
                <p className="text-xs text-muted-foreground mt-1">Blocks all regular users, admins can still access</p>
              </div>
              <Switch
                id="maintenance-mode"
                checked={localConfig.maintenanceMode}
                onCheckedChange={(checked) => handleChange('maintenanceMode', checked)}
              />
            </div>
            
            {localConfig.maintenanceMode && (
              <>
                {/* Live Preview Banner */}
                <div className="space-y-2">
                  <Label className="flex items-center gap-2 text-sm font-medium">
                    <Eye className="w-4 h-4" /> Live Preview
                  </Label>
                  <div className="p-3 bg-muted/30 rounded-xl border border-dashed border-border/50">
                    <div className="flex items-center justify-center gap-3 px-4 py-3 rounded-xl border bg-orange-500/15 border-orange-500/40 text-orange-600 dark:text-orange-400 text-sm font-medium">
                      <AlertTriangle className="w-4 h-4 shrink-0 animate-pulse" />
                      <span className="flex-1 text-center">
                        {localConfig.maintenanceMessage || "System under maintenance. Back soon!"}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="maintenance-message">Maintenance Message</Label>
                  <Textarea
                    id="maintenance-message"
                    value={localConfig.maintenanceMessage}
                    onChange={(e) => handleChange('maintenanceMessage', e.target.value)}
                    placeholder="Enter message to display during maintenance..."
                    rows={3}
                    className="bg-muted/30 border-border/50"
                  />
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="start-time" className="flex items-center gap-2">
                      <Clock className="w-4 h-4" /> Start Time
                    </Label>
                    <Input
                      id="start-time"
                      type="datetime-local"
                      value={localConfig.maintenanceStartTime || ''}
                      onChange={(e) => handleChange('maintenanceStartTime', e.target.value)}
                      className="bg-muted/30 border-border/50"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="end-time" className="flex items-center gap-2">
                      <Clock className="w-4 h-4" /> End Time
                    </Label>
                    <Input
                      id="end-time"
                      type="datetime-local"
                      value={localConfig.maintenanceEndTime || ''}
                      onChange={(e) => handleChange('maintenanceEndTime', e.target.value)}
                      className="bg-muted/30 border-border/50"
                    />
                  </div>
                </div>
              </>
            )}
            
            {/* Pre-Maintenance Notice */}
            <div className="border-t border-border/50 pt-4 mt-4">
              <div className="flex items-center justify-between p-4 bg-amber-500/5 rounded-xl border border-amber-500/20 mb-3">
                <div>
                  <Label htmlFor="pre-notice" className="font-medium flex items-center gap-2">
                    <Bell className="w-4 h-4 text-amber-600" />
                    Pre-Maintenance Notice
                  </Label>
                  <p className="text-xs text-muted-foreground mt-1">Show warning banner before maintenance starts</p>
                </div>
                <Switch
                  id="pre-notice"
                  checked={localConfig.preMaintenanceNotice || false}
                  onCheckedChange={(checked) => handleChange('preMaintenanceNotice', checked)}
                />
              </div>
              
              {localConfig.preMaintenanceNotice && (
                <div className="space-y-3">
                  <div className="space-y-2">
                    <Label htmlFor="pre-message">Pre-Maintenance Message</Label>
                    <Textarea
                      id="pre-message"
                      value={localConfig.preMaintenanceMessage || ''}
                      onChange={(e) => handleChange('preMaintenanceMessage', e.target.value)}
                      placeholder="e.g., Scheduled maintenance in 2 hours..."
                      rows={2}
                      className="bg-muted/30 border-border/50"
                    />
                  </div>
                </div>
              )}
            </div>
            
            <p className="text-xs text-muted-foreground flex items-center gap-2 pt-2">
              <Mail className="w-4 h-4" />
              Enabling maintenance will send email notifications to all users
            </p>
          </div>
        </CollapsibleSection>
      </motion.div>

      {/* User Settings */}
      <motion.div variants={itemVariants}>
        <CollapsibleSection
          title="Default User Settings"
          description="Settings applied to new users"
          icon={<Users className="w-5 h-5 text-blue-500" />}
          accentColor="blue"
        >
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="monthly-limit">Default Monthly Limit</Label>
                <Input
                  id="monthly-limit"
                  type="number"
                  value={localConfig.defaultMonthlyLimit}
                  onChange={(e) => handleChange('defaultMonthlyLimit', Number(e.target.value))}
                  min={0}
                  className="bg-muted/30 border-border/50"
                />
              </div>
              
              <div className="flex items-center justify-between p-4 bg-muted/30 rounded-xl border border-border/50">
                <Label htmlFor="require-approval">Require Approval</Label>
                <Switch
                  id="require-approval"
                  checked={localConfig.requireApproval}
                  onCheckedChange={(checked) => handleChange('requireApproval', checked)}
                />
              </div>
            </div>
          </div>
        </CollapsibleSection>
      </motion.div>

      {/* Security Settings */}
      <motion.div variants={itemVariants}>
        <CollapsibleSection
          title="Security Settings"
          description="Configure authentication and session security"
          icon={<Shield className="w-5 h-5 text-emerald-500" />}
          accentColor="green"
        >
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="max-attempts">Max Login Attempts</Label>
                <Input
                  id="max-attempts"
                  type="number"
                  value={localConfig.maxLoginAttempts}
                  onChange={(e) => handleChange('maxLoginAttempts', Number(e.target.value))}
                  min={1}
                  max={10}
                  className="bg-muted/30 border-border/50"
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="session-timeout">Session Timeout (minutes)</Label>
                <Input
                  id="session-timeout"
                  type="number"
                  value={localConfig.sessionTimeout}
                  onChange={(e) => handleChange('sessionTimeout', Number(e.target.value))}
                  min={5}
                  max={120}
                  className="bg-muted/30 border-border/50"
                />
              </div>
            </div>
          </div>
        </CollapsibleSection>
      </motion.div>

      {/* Beta Program Settings */}
      <motion.div variants={itemVariants}>
        <CollapsibleSection
          title="Beta Program"
          description="Beta mode and feedback rewards"
          icon={<Sparkles className="w-5 h-5 text-violet-500" />}
          accentColor="purple"
        >
          <BetaProgramSettings />
        </CollapsibleSection>
      </motion.div>

      {/* Admin PIN Settings */}
      <motion.div variants={itemVariants}>
        <CollapsibleSection
          title="Admin Panel PIN"
          description="Change the admin PIN — takes effect immediately"
          icon={<KeyRound className="w-5 h-5 text-purple-500" />}
          accentColor="purple"
        >
          <div className="space-y-4">

            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="new-pin">New PIN (4-6 digits)</Label>
                <Input
                  id="new-pin"
                  type="password"
                  value={newPin}
                  onChange={(e) => setNewPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="••••"
                  maxLength={6}
                  
                  className="bg-muted/30 border-border/50"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm-pin">Confirm PIN</Label>
                <Input
                  id="confirm-pin"
                  type="password"
                  value={confirmPin}
                  onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="••••"
                  maxLength={6}
                  
                  className="bg-muted/30 border-border/50"
                />
              </div>
            </div>
            
            <Button 
              onClick={handleChangePin} 
              disabled={isChangingPin || !newPin || !confirmPin}
              className="w-full bg-gradient-to-r from-purple-600 to-purple-500"
            >
              {isChangingPin ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <KeyRound className="w-4 h-4 mr-2" />
              )}
              Update PIN
            </Button>
            
            <p className="text-xs text-muted-foreground">
              PIN updated immediately. Takes effect on next login.
            </p>
          </div>
        </CollapsibleSection>
      </motion.div>

      {/* Notification Log */}
      <motion.div variants={itemVariants}>
        <NotificationLogViewer />
      </motion.div>
    </motion.div>
  );
};
