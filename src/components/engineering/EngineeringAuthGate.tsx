import { motion } from 'framer-motion';
import { Lock, HardHat, Sparkles, Calculator, FileDown, Box } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface EngineeringAuthGateProps {
  onSignIn: () => void;
}

const features = [
  { icon: Calculator, label: '5 Professional Calculators' },
  { icon: Box, label: '3D Interactive Visualization' },
  { icon: FileDown, label: 'DXF Export for CAD' },
  { icon: Sparkles, label: 'AI-Powered Analysis' },
];

const EngineeringAuthGate = ({ onSignIn }: EngineeringAuthGateProps) => {
  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/20 flex items-center justify-center px-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.4 }}
        className="max-w-lg w-full"
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
              className="text-2xl md:text-3xl font-bold mb-3"
            >
              Civil Engineering Tools
            </motion.h1>

            {/* Description */}
            <motion.p
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="text-muted-foreground mb-8"
            >
              Sign in to access professional structural calculators with 3D visualization and AI-powered analysis.
            </motion.p>

            {/* Features Grid */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
              className="grid grid-cols-2 gap-3 mb-8"
            >
              {features.map((feature, index) => (
                <div
                  key={index}
                  className="flex items-center gap-2 p-3 bg-muted/50 rounded-xl text-left"
                >
                  <feature.icon className="w-4 h-4 text-cyan-500 flex-shrink-0" />
                  <span className="text-sm">{feature.label}</span>
                </div>
              ))}
            </motion.div>

            {/* Sign In Button */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 }}
            >
              <Button
                onClick={onSignIn}
                size="lg"
                className="w-full gap-2 bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-600 hover:to-blue-600 text-white shadow-lg"
              >
                <Lock className="w-4 h-4" />
                Sign In to Access
              </Button>
            </motion.div>

            {/* Learn More Link */}
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

export default EngineeringAuthGate;
