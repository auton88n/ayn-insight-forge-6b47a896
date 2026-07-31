import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Sparkles, ArrowRight, X } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';

interface UpgradeBannerProps {
  currentTier?: string;
  className?: string;
}

export const UpgradeBanner = ({ currentTier = 'free', className }: UpgradeBannerProps) => {
  const [isDismissed, setIsDismissed] = useState(false);
  const navigate = useNavigate();

  // Only show for free users
  if (currentTier !== 'free' || isDismissed) {
    return null;
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className={cn(
        "relative overflow-hidden rounded-xl",
        "bg-gradient-to-br from-primary/10 via-primary/5 to-transparent",
        "border border-primary/20",
        "p-3",
        className
      )}
    >
      {/* Background sparkle effect */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1 right-4 w-12 h-12 bg-primary/10 rounded-full blur-xl" />
        <div className="absolute bottom-1 left-2 w-8 h-8 bg-primary/5 rounded-full blur-lg" />
      </div>

      {/* Dismiss button */}
      <button
        onClick={() => setIsDismissed(true)}
        className="absolute top-2 right-2 p-1 rounded-full hover:bg-background/50 text-muted-foreground hover:text-foreground transition-colors"
      >
        <X className="w-3 h-3" />
      </button>

      <div className="relative flex flex-col gap-2">
        {/* Header */}
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-primary/20">
            <Sparkles className="w-3.5 h-3.5 text-primary" />
          </div>
          <span className="text-xs font-semibold text-foreground">
            Upgrade to Pro
          </span>
        </div>

        {/* Description */}
        <p className="text-[11px] text-muted-foreground leading-relaxed pr-4">
          Get 5,000 messages/mo, priority support & more
        </p>

        {/* CTA Button */}
        <Button
          size="sm"
          onClick={() => navigate('/pricing')}
          className={cn(
            "h-7 text-xs w-full mt-1",
            "bg-primary hover:bg-primary/90",
            "text-primary-foreground",
            "shadow-sm hover:shadow-md transition-all duration-200"
          )}
        >
          View Plans
          <ArrowRight className="w-3 h-3 ml-1.5" />
        </Button>
      </div>
    </motion.div>
  );
};
