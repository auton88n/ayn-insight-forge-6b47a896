/**
 * HeroIntro — Static hero. ONE visual: the assembled helmet, centered.
 * No scroll logic. No second image. No brain layer.
 */
import { memo } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { LandingChatInput } from '@/components/landing/LandingChatInput';
import { HELMET_FRAMES, FRAME_COUNT } from '@/assets/helmet-frames';

interface HeroIntroProps {
  onSendAttempt?: (message: string) => void;
}

const ASSEMBLED = HELMET_FRAMES[FRAME_COUNT - 1];
const SZ = 'min(75vw, 60vh, 560px)';

export const HeroIntro = memo(({ onSendAttempt }: HeroIntroProps) => {
  const { language } = useLanguage();

  return (
    <section
      className="relative w-full flex flex-col items-center justify-between overflow-hidden"
      style={{ minHeight: '100dvh', background: '#000', paddingTop: 80, paddingBottom: 24 }}
      aria-label="Hero"
    >
      {/* Headline */}
      <div className="w-full max-w-4xl text-center px-6">
        <p
          className="text-[10px] md:text-[11px] tracking-[0.3em] uppercase mb-3 font-mono"
          style={{ color: 'rgba(255,255,255,0.4)' }}
        >
          {language === 'ar' ? 'ذكاء الأعمال' : language === 'fr' ? "Intelligence d'Affaires" : 'Business Intelligence'}
        </p>
        <h1
          className="font-display font-bold tracking-[-0.02em] text-white leading-none"
          style={{ fontSize: 'clamp(40px, 6vw, 88px)' }}
        >
          {language === 'ar' ? 'قوة ' : language === 'fr' ? 'Le pouvoir ' : 'The power '}
          <span style={{ color: 'hsl(var(--primary))' }}>
            {language === 'ar' ? 'المعرفة.' : language === 'fr' ? 'de savoir.' : 'to know.'}
          </span>
        </h1>
        <p
          className="mt-4 text-sm md:text-base font-light max-w-xl mx-auto leading-relaxed"
          style={{ color: 'rgba(255,255,255,0.5)' }}
        >
          {language === 'ar'
            ? 'العين التي تعيش داخل شركتك. ترى كل شيء. لا تفوّت شيئاً.'
            : language === 'fr'
            ? "L'œil qui vit au cœur de votre entreprise. Voit tout. Ne rate rien."
            : 'The eye that lives inside your business. Sees everything. Misses nothing.'}
        </p>
      </div>

      {/* Single assembled helmet — static */}
      <div className="flex-1 flex items-center justify-center w-full pointer-events-none">
        <img
          src={ASSEMBLED}
          alt="AYN"
          draggable={false}
          fetchPriority="high"
          decoding="async"
          style={{
            width: SZ,
            height: SZ,
            objectFit: 'contain',
            display: 'block',
            userSelect: 'none',
          }}
        />
      </div>

      {/* Chat input */}
      <div className="w-full max-w-2xl px-4">
        <LandingChatInput onSendAttempt={(m) => onSendAttempt?.(m)} />
      </div>
    </section>
  );
});

HeroIntro.displayName = 'HeroIntro';
