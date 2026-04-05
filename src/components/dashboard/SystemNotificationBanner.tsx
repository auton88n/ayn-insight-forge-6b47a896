import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { AlertCircle, Clock, X, Wrench } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface MaintenanceConfig {
  enabled?: boolean;
  message?: string;
  startTime?: string;
  endTime?: string;
  preMaintenanceNotice?: boolean;
  preMaintenanceMessage?: string;
}

interface SystemNotificationBannerProps {
  maintenanceConfig?: MaintenanceConfig;
  remaining?: number;
  totalLimit?: number;
  isUnlimited?: boolean;
  resetsAt?: string | null;
  className?: string;
}

export const SystemNotificationBanner = ({
  maintenanceConfig,
  remaining = 0,
  totalLimit = 5,
  isUnlimited = false,
  resetsAt,
  className,
}: SystemNotificationBannerProps) => {
  const [isDismissed, setIsDismissed] = useState(false);
  const [preNoticeDismissed, setPreNoticeDismissed] = useState(false);

  // Auto-dismiss usage warning after 5 seconds
  useEffect(() => {
    if (!isDismissed && !isUnlimited && totalLimit > 0) {
      const timer = setTimeout(() => {
        setIsDismissed(true);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [isDismissed, isUnlimited, totalLimit]);

  // Priority 1: Active Maintenance (NOT dismissible, blocks chat)
  if (maintenanceConfig?.enabled) {
    const formatTime = (time: string) => {
      try {
        return format(new Date(time), "MMM d 'at' h:mm a");
      } catch {
        return time;
      }
    };

    return (
      <motion.div
        initial={{ opacity: 0, y: 10, height: 0 }}
        animate={{ opacity: 1, y: 0, height: 'auto' }}
        className={cn(
          "flex items-center justify-center gap-3 px-4 py-3 mb-2",
          "rounded-xl border backdrop-blur-sm",
          "text-sm font-medium",
          "bg-orange-500/15 border-orange-500/40 text-orange-600 dark:text-orange-400",
          className
        )}
      >
        <Wrench className="w-4 h-4 shrink-0 animate-pulse" />
        <span className="flex-1 text-center">
          {maintenanceConfig.message || 'System under maintenance. Back soon!'}
          {maintenanceConfig.endTime && (
            <span className="ml-2 opacity-80">
              • Expected: {formatTime(maintenanceConfig.endTime)}
            </span>
          )}
        </span>
      </motion.div>
    );
  }

  // Priority 2: Pre-Maintenance Notice (dismissible)
  if (maintenanceConfig?.preMaintenanceNotice && !preNoticeDismissed) {
    const formatTime = (time: string) => {
      try {
        return format(new Date(time), "MMM d 'at' h:mm a");
      } catch {
        return time;
      }
    };

    return (
      <AnimatePresence>
        <motion.div
          initial={{ opacity: 0, y: 10, height: 0 }}
          animate={{ opacity: 1, y: 0, height: 'auto' }}
          exit={{ opacity: 0, y: 10, height: 0 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          className={cn(
            "flex items-center justify-center gap-3 px-4 py-2.5 mb-2",
            "rounded-xl border backdrop-blur-sm",
            "text-sm font-medium",
            "bg-yellow-500/10 border-yellow-500/30 text-yellow-600 dark:text-yellow-400",
            className
          )}
        >
          <Clock className="w-4 h-4 shrink-0" />
          <span className="flex-1 text-center">
            {maintenanceConfig.preMaintenanceMessage || 'Scheduled maintenance coming soon'}
            {maintenanceConfig.startTime && (
              <span className="ml-2 opacity-80">
                • Starts: {formatTime(maintenanceConfig.startTime)}
              </span>
            )}
          </span>
          <button
            onClick={() => setPreNoticeDismissed(true)}
            className="p-1 hover:bg-yellow-500/20 rounded-full transition-colors shrink-0"
            aria-label="Dismiss notice"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </motion.div>
      </AnimatePresence>
    );
  }

  // Priority 3: Usage Warning (dismissible) - skip for unlimited users
  if (!isDismissed && !isUnlimited && totalLimit > 0) {
    const usagePercentage = ((totalLimit - remaining) / totalLimit) * 100;
    
    // Only show when approaching limit (>80% used) or <= 5 remaining
    const shouldShow = usagePercentage >= 80 || remaining <= 5;
    
    if (!shouldShow || remaining < 0) return null;
    
    // Format the reset time nicely
    let formattedResetTime = 'tomorrow';
    if (resetsAt) {
      const reset = new Date(resetsAt);
      const now = new Date();
      const hoursLeft = Math.max(0, Math.ceil((reset.getTime() - now.getTime()) / (1000 * 60 * 60)));
      formattedResetTime = hoursLeft > 24 ? format(reset, "MMM d") : `${hoursLeft}h`;
    }

    const isUrgent = remaining <= 3;
    const isWarning = remaining <= 10 && !isUrgent;

    return (
      <AnimatePresence>
        <motion.div
          initial={{ opacity: 0, y: 10, height: 0 }}
          animate={{ opacity: 1, y: 0, height: 'auto' }}
          exit={{ opacity: 0, y: 10, height: 0 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          className={cn(
            "flex items-center justify-center gap-2 px-4 py-2.5 mb-2",
            "rounded-xl border backdrop-blur-sm",
            "text-sm font-medium",
            isUrgent && "bg-muted/60 border-border text-muted-foreground",
            isWarning && "bg-muted/50 border-border/80 text-muted-foreground",
            !isUrgent && !isWarning && "bg-muted/50 border-border/50 text-muted-foreground",
            className
          )}
        >
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span className="flex-1 text-center">
            {remaining} message{remaining !== 1 ? 's' : ''} remaining • Resets in {formattedResetTime}
          </span>
          <button
            onClick={() => setIsDismissed(true)}
            className="p-1 hover:bg-black/10 dark:hover:bg-white/10 rounded-full transition-colors shrink-0"
            aria-label="Dismiss warning"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </motion.div>
      </AnimatePresence>
    );
  }

  return null;
};
