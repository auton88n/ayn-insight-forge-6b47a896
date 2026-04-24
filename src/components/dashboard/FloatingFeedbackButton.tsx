import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Gift, Sparkles, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';

interface FloatingFeedbackButtonProps {
  userId: string;
  rewardAmount: number;
  onOpenFeedback: () => void;
}

export const FloatingFeedbackButton = ({ 
  userId, 
  rewardAmount, 
  onOpenFeedback 
}: FloatingFeedbackButtonProps) => {
  const [hasSubmittedFeedback, setHasSubmittedFeedback] = useState<boolean | null>(null);
  const [isDismissed, setIsDismissed] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  // Check if user has already submitted feedback
  useEffect(() => {
    const checkFeedbackStatus = async () => {
      try {
        const { data, error } = await supabase
          .from('beta_feedback')
          .select('id')
          .eq('user_id', userId)
          .limit(1);

        if (error) {
          console.error('Error checking feedback status:', error);
          return;
        }

        setHasSubmittedFeedback(data && data.length > 0);
      } catch (err) {
        console.error('Error checking feedback status:', err);
      }
    };

    checkFeedbackStatus();
  }, [userId]);

  // Don't show if already submitted, still loading, or dismissed
  if (hasSubmittedFeedback === null || hasSubmittedFeedback || isDismissed) {
    return null;
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 100, scale: 0.8 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 100, scale: 0.8 }}
        transition={{ type: 'spring', bounce: 0.4, duration: 0.6 }}
        className="fixed bottom-24 right-4 z-50 md:bottom-8 md:right-8"
      >
        <motion.div
          onHoverStart={() => setIsHovered(true)}
          onHoverEnd={() => setIsHovered(false)}
          className="relative"
        >
          {/* Dismiss button */}
          <button
            onClick={() => setIsDismissed(true)}
            className="absolute -top-2 -right-2 z-10 w-5 h-5 rounded-full bg-muted border border-border flex items-center justify-center hover:bg-destructive hover:text-destructive-foreground transition-colors"
            aria-label="Dismiss"
          >
            <X className="w-3 h-3" />
          </button>

          {/* Main button */}
          <Button
            onClick={onOpenFeedback}
            className={cn(
              "relative overflow-hidden rounded-full px-5 py-3 h-auto",
              "bg-gradient-to-r from-purple-500 via-fuchsia-500 to-pink-500",
              "hover:from-purple-600 hover:via-fuchsia-600 hover:to-pink-600",
              "shadow-lg shadow-purple-500/25 hover:shadow-purple-500/40",
              "transition-all duration-300"
            )}
          >
            {/* Shimmer effect */}
            <motion.div
              animate={{
                x: ['0%', '200%'],
              }}
              transition={{
                duration: 2,
                repeat: Infinity,
                ease: 'linear',
              }}
              className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -skew-x-12"
            />

            {/* Content */}
            <div className="relative flex items-center gap-2">
              <motion.div
                animate={{
                  rotate: isHovered ? [0, -10, 10, -10, 0] : 0,
                  scale: isHovered ? 1.2 : 1,
                }}
                transition={{ duration: 0.5 }}
              >
                <Gift className="w-5 h-5 text-white" />
              </motion.div>
              
              <span className="font-semibold text-white whitespace-nowrap">
                Earn +{rewardAmount} Credits
              </span>

              <motion.div
                animate={{
                  scale: [1, 1.2, 1],
                  opacity: [1, 0.8, 1],
                }}
                transition={{
                  duration: 1.5,
                  repeat: Infinity,
                  ease: 'easeInOut',
                }}
              >
                <Sparkles className="w-4 h-4 text-yellow-200" />
              </motion.div>
            </div>
          </Button>

          {/* Tooltip on hover */}
          <AnimatePresence>
            {isHovered && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 px-3 py-1.5 bg-popover border border-border rounded-lg shadow-lg whitespace-nowrap"
              >
                <p className="text-xs text-muted-foreground">
                  Share your beta feedback and earn rewards!
                </p>
                <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-px">
                  <div className="w-2 h-2 bg-popover border-r border-b border-border rotate-45 -translate-y-1" />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};
