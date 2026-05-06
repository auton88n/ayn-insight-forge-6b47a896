import { motion } from 'framer-motion';
import { Monitor, Tablet, HardHat, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';

const MobileBlockScreen = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/20 flex items-center justify-center px-6">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.4 }}
        className="max-w-md w-full"
      >
        {/* Card */}
        <div className="relative bg-card border border-border rounded-3xl p-8 text-center overflow-hidden">
          {/* Background decoration */}
          <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/5 to-blue-500/5" />
          <div className="absolute top-0 right-0 w-64 h-64 bg-cyan-500/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
          
          <div className="relative z-10">
            {/* Icon */}
            <motion.div
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.1, type: 'spring', stiffness: 200 }}
              className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-cyan-500 to-blue-500 flex items-center justify-center shadow-lg"
            >
              <HardHat className="w-10 h-10 text-white" />
            </motion.div>

            {/* Title */}
            <motion.h1
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="text-2xl font-bold mb-3"
            >
              Larger Screen Required
            </motion.h1>

            {/* Description */}
            <motion.p
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="text-muted-foreground mb-8"
            >
              Our engineering tools feature complex 3D visualizations and detailed calculators that require a tablet or desktop screen for the best experience.
            </motion.p>

            {/* Device Icons */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
              className="flex justify-center gap-6 mb-8"
            >
              <div className="flex flex-col items-center gap-2">
                <div className="w-14 h-14 rounded-xl bg-muted/50 flex items-center justify-center">
                  <Tablet className="w-6 h-6 text-cyan-500" />
                </div>
                <span className="text-xs text-muted-foreground">Tablet</span>
              </div>
              <div className="flex flex-col items-center gap-2">
                <div className="w-14 h-14 rounded-xl bg-muted/50 flex items-center justify-center">
                  <Monitor className="w-6 h-6 text-cyan-500" />
                </div>
                <span className="text-xs text-muted-foreground">Desktop</span>
              </div>
            </motion.div>

            {/* Back Button */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 }}
            >
              <Button
                onClick={() => navigate('/')}
                variant="outline"
                className="gap-2"
              >
                <ArrowLeft className="w-4 h-4" />
                Back to Dashboard
              </Button>
            </motion.div>

            {/* Learn More */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.6 }}
              className="mt-4"
            >
              <a
                href="/solutions/civil-engineering"
                className="text-xs text-cyan-500 hover:text-cyan-400 underline underline-offset-2"
              >
                Learn more about our engineering tools
              </a>
            </motion.div>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

export default MobileBlockScreen;
