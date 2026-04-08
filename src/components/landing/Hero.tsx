import { useEffect, useRef, useState, memo, useCallback } from 'react';
import { Brain } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { motion, AnimatePresence } from 'framer-motion';
import { useIsMobile } from '@/hooks/use-mobile';
import { LandingChatInput } from '@/components/landing/LandingChatInput';
import { useDebugStore } from '@/stores/debugStore';

interface HeroProps {
  onGetStarted: (prefillMessage?: string) => void;
}

export const Hero = memo(({ onGetStarted }: HeroProps) => {
  const { language } = useLanguage();
  const isMobile = useIsMobile();
  const debugRef = useRef(useDebugStore.getState());
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [isHovered, setIsHovered] = useState(false);
  const [isBlinking, setIsBlinking] = useState(false);

  if (debugRef.current?.isDebugMode) {
    debugRef.current.incrementRenderCount('Hero');
  }

  // Blink callback — called by LandingChatInput when placeholder rotates
  const handlePlaceholderChange = useCallback(() => {
    setIsBlinking(true);
    setTimeout(() => setIsBlinking(false), 150);
  }, []);

  return (
    <section
      ref={containerRef}
      className="relative min-h-[100dvh] flex flex-col items-center justify-between pt-20 md:pt-24 pb-6 md:pb-8 px-4 md:px-12 lg:px-24 overflow-x-hidden overflow-y-visible"
      aria-label="Hero"
    >
      {/* Headline */}
      <div className="w-full max-w-4xl text-center mb-4 md:mb-6">
        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0, ease: [0.22, 1, 0.36, 1] }}
          className="font-display font-bold tracking-[-0.02em] text-foreground mb-2 md:mb-3 text-5xl sm:text-6xl md:text-7xl lg:text-8xl"
        >
          {language === 'ar' ? 'تعرّف على AYN' : language === 'fr' ? 'Découvrez AYN' : 'Meet AYN'}
        </motion.h1>
        <motion.p
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
          className="text-base md:text-lg lg:text-xl text-muted-foreground font-light max-w-2xl mx-auto"
        >
          {language === 'ar'
            ? 'ذكاء أعمال حقيقي — يتابع الأسواق، يحلل المخاطر، ويساعدك على القرار الصحيح.'
            : language === 'fr'
            ? 'Intelligence d\'affaires réelle — marchés, risques et décisions stratégiques.'
            : 'Real business intelligence — markets, risks, and decisions that matter.'}
        </motion.p>
      </div>

      {/* Central eye — clean, no floating cards */}
      <motion.div
        className="relative w-full max-w-5xl flex-1 flex items-center justify-center"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.25, ease: [0.22, 1, 0.36, 1] }}
      >
        {/* Subtle light behind the eye */}
        <div className="absolute w-[200px] h-[200px] sm:w-[280px] sm:h-[280px] md:w-[360px] md:h-[360px] lg:w-[480px] lg:h-[480px] rounded-full -z-10 pointer-events-none bg-gradient-to-b from-transparent via-muted/30 to-transparent" />

        {/* Eye */}
        <div
          className="relative z-10 flex items-center justify-center group cursor-pointer"
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
        >
          <div className="absolute -inset-8 rounded-full blur-2xl pointer-events-none bg-[radial-gradient(circle,_rgba(229,229,229,0.3)_0%,_transparent_70%)] dark:bg-[radial-gradient(circle,_rgba(38,38,38,0.15)_0%,_transparent_70%)]" />

          <div className="relative w-[120px] h-[120px] sm:w-[160px] sm:h-[160px] md:w-[200px] md:h-[200px] lg:w-[240px] lg:h-[240px] rounded-full bg-card flex items-center justify-center overflow-hidden shadow-xl">
            <div className="absolute inset-2 rounded-full shadow-[inset_0_4px_16px_rgba(0,0,0,0.06)] dark:shadow-[inset_0_4px_16px_rgba(0,0,0,0.25)]" />
            <div className="absolute inset-[15%] rounded-full bg-muted" />

            <motion.svg
              viewBox="0 0 100 100"
              className="w-[70%] h-[70%] relative z-10"
              xmlns="http://www.w3.org/2000/svg"
              animate={{
                scaleY: isBlinking ? 0.05 : 1,
                opacity: isBlinking ? 0.7 : 1,
              }}
              transition={{
                duration: isBlinking ? 0.08 : 0.12,
                ease: isBlinking
                  ? [0.55, 0.055, 0.675, 0.19]
                  : [0.34, 1.56, 0.64, 1],
              }}
              style={{ transformOrigin: 'center center' }}
            >
              <circle
                cx="50"
                cy="50"
                r={isHovered ? 32 : 28}
                fill="#000000"
                style={{ transition: 'r 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)' }}
              />
              <foreignObject x="0" y="0" width="100" height="100">
                <div
                  className="w-full h-full flex items-center justify-center"
                  style={{ transition: 'all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)' }}
                >
                  <Brain
                    className="text-white/90"
                    style={{
                      width: isHovered ? '40%' : '36%',
                      height: isHovered ? '40%' : '36%',
                    }}
                  />
                </div>
              </foreignObject>
            </motion.svg>
          </div>
        </div>
      </motion.div>

      {/* Interactive Chat Input */}
      <LandingChatInput
        onSendAttempt={(message) => onGetStarted(message)}
        onPlaceholderChange={handlePlaceholderChange}
      />
    </section>
  );
});
