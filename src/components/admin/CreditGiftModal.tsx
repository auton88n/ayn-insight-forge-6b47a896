import { adminApi } from '@/lib/spineApi';
import { useState } from 'react';
import { spineAuth } from '@/lib/spineAuth';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Gift, Loader2, Sparkles } from 'lucide-react';
import { adminSupabase as supabase } from '@/admin-app/adminSupabase';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';

interface UserInfo {
  user_id: string;
  email?: string;
  company_name?: string;
  current_monthly_messages: number | null;
  monthly_messages: number | null;
  bonus_credits: number | null;
}

interface CreditGiftModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: UserInfo | null;
  onSuccess?: () => void;
}

const PRESETS = [
  { amount: 5, label: 'Feedback Reward', color: 'bg-green-500' },
  { amount: 10, label: 'Bug Report', color: 'bg-blue-500' },
  { amount: 25, label: 'Beta Tester', color: 'bg-purple-500' },
  { amount: 50, label: 'Compensation', color: 'bg-orange-500' },
];

export const CreditGiftModal = ({ isOpen, onClose, user, onSuccess }: CreditGiftModalProps) => {
  const [amount, setAmount] = useState<number>(5);
  const [reason, setReason] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  const handlePresetClick = (preset: typeof PRESETS[0]) => {
    setAmount(preset.amount);
    setReason(preset.label);
  };

  const handleSubmit = async () => {
    if (!user || !reason.trim() || amount <= 0) {
      toast.error('Please enter a valid amount and reason');
      return;
    }

    setIsSubmitting(true);
    try {
      await adminApi.giftCredits(user.user_id, amount, reason);

      setShowSuccess(true);
      toast.success(`Added ${amount} bonus credits to ${user.email || 'user'}`);
      
      setTimeout(() => {
        setShowSuccess(false);
        onSuccess?.();
        onClose();
        setAmount(5);
        setReason('');
      }, 1500);
    } catch (err) {
      console.error('Error gifting credits:', err);
      toast.error('Failed to gift credits');
    } finally {
      setIsSubmitting(false);
    }
  };

  const currentCredits = (user?.monthly_messages || 50) + (user?.bonus_credits || 0);
  const newTotal = currentCredits + amount;

  return (
    <Dialog open={isOpen} onOpenChange={() => !isSubmitting && onClose()}>
      <DialogContent className="sm:max-w-md">
        <AnimatePresence mode="wait">
          {showSuccess ? (
            <motion.div
              key="success"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              className="flex flex-col items-center justify-center py-8"
            >
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', bounce: 0.5 }}
                className="w-16 h-16 rounded-full bg-gradient-to-r from-green-400 to-emerald-500 flex items-center justify-center mb-4"
              >
                <Sparkles className="w-8 h-8 text-white" />
              </motion.div>
              <h3 className="text-xl font-bold text-foreground">Credits Added!</h3>
              <p className="text-muted-foreground mt-1">+{amount} credits gifted</p>
            </motion.div>
          ) : (
            <motion.div
              key="form"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Gift className="w-5 h-5 text-purple-500" />
                  Gift Credits
                </DialogTitle>
                <DialogDescription>
                  Add bonus credits to {user?.email || 'this user'}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4 py-4">
                {/* User Info */}
                <div className="p-3 bg-muted/50 rounded-lg space-y-1">
                  <p className="text-sm font-medium">{user?.company_name || user?.email}</p>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span>Current: {user?.current_monthly_messages || 0}/{user?.monthly_messages || 50}</span>
                    {(user?.bonus_credits || 0) > 0 && (
                      <Badge variant="secondary" className="text-xs">
                        +{user?.bonus_credits} bonus
                      </Badge>
                    )}
                  </div>
                </div>

                {/* Quick Presets */}
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Quick Presets</Label>
                  <div className="flex flex-wrap gap-2">
                    {PRESETS.map((preset) => (
                      <Button
                        key={preset.amount}
                        variant="outline"
                        size="sm"
                        className={`text-xs ${amount === preset.amount && reason === preset.label ? 'ring-2 ring-primary' : ''}`}
                        onClick={() => handlePresetClick(preset)}
                      >
                        +{preset.amount} {preset.label}
                      </Button>
                    ))}
                  </div>
                </div>

                {/* Amount */}
                <div className="space-y-2">
                  <Label htmlFor="amount">Amount</Label>
                  <Input
                    id="amount"
                    type="number"
                    min="1"
                    max="1000"
                    value={amount}
                    onChange={(e) => setAmount(Math.max(1, parseInt(e.target.value) || 0))}
                  />
                </div>

                {/* Reason */}
                <div className="space-y-2">
                  <Label htmlFor="reason">Reason (required)</Label>
                  <Textarea
                    id="reason"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="e.g., Beta tester reward, Compensation for issue..."
                    className="resize-none"
                    rows={2}
                  />
                </div>

                {/* Preview */}
                <div className="p-3 bg-gradient-to-r from-purple-500/10 to-fuchsia-500/10 rounded-lg">
                  <p className="text-sm font-medium text-foreground">Preview</p>
                  <p className="text-xs text-muted-foreground">
                    Total available: {currentCredits} → <span className="text-green-500 font-medium">{newTotal}</span> (+{amount} bonus)
                  </p>
                </div>
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
                  Cancel
                </Button>
                <Button 
                  onClick={handleSubmit} 
                  disabled={isSubmitting || !reason.trim() || amount <= 0}
                  className="bg-gradient-to-r from-purple-500 to-fuchsia-500 hover:from-purple-600 hover:to-fuchsia-600"
                >
                  {isSubmitting ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Gift className="w-4 h-4 mr-2" />
                  )}
                  Gift {amount} Credits
                </Button>
              </DialogFooter>
            </motion.div>
          )}
        </AnimatePresence>
      </DialogContent>
    </Dialog>
  );
};
