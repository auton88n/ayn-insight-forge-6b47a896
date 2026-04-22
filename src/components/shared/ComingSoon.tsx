import React from 'react';
import { motion } from 'framer-motion';
import { Brain, ArrowLeft, Construction } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';

const ComingSoon: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 text-center">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5 }}
        className="max-w-md w-full space-y-8"
      >
        <div className="relative inline-block">
          <div className="w-24 h-24 rounded-3xl bg-primary/10 flex items-center justify-center mx-auto mb-8 relative">
            <Construction className="w-12 h-12 text-primary" />
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
              className="absolute inset-0 border-2 border-dashed border-primary/30 rounded-3xl"
            />
          </div>
        </div>

        <div className="space-y-4">
          <h1 className="text-4xl font-serif font-bold tracking-tight">Intelligence Forge</h1>
          <p className="text-xl text-muted-foreground font-medium">
            This sector is currently being calibrated for high-fidelity operations.
          </p>
          <div className="pt-4 pb-8">
            <p className="text-sm text-muted-foreground/60 leading-relaxed max-w-xs mx-auto">
              We're integrating advanced neural processing to ensure professional-grade accuracy in this module.
            </p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
          <Button 
            onClick={() => navigate(-1)} 
            variant="outline" 
            className="w-full sm:w-auto gap-2 rounded-xl h-12 px-8"
          >
            <ArrowLeft className="w-4 h-4" />
            Go Back
          </Button>
          <Button 
            onClick={() => navigate('/')} 
            className="w-full sm:w-auto gap-2 rounded-xl h-12 px-8 bg-foreground text-background hover:bg-foreground/90"
          >
            <Brain className="w-4 h-4" />
            Return to Dashboard
          </Button>
        </div>

        <div className="pt-12 flex items-center justify-center gap-2 opacity-50">
          <div className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
          <span className="text-[10px] uppercase tracking-[0.2em] font-bold">System Status: Calibrating</span>
        </div>
      </motion.div>
    </div>
  );
};

export default ComingSoon;
