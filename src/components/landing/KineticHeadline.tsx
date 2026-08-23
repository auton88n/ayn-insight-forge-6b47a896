/**
 * KineticHeadline — the hero headline reveals word by word instead of
 * sitting static on load, and replays on hover.
 *
 * Design-audit finding (Aug 2026): AYN's type is bold but never moves,
 * while 2026's own research names reactive, scroll/hover-responsive type
 * as the defining typographic move of the year. This is the cheapest,
 * highest-visibility version of that fix — same real headline text, same
 * font, same size, just given a reason to keep looking at it.
 *
 * Respects prefers-reduced-motion: the words render fully lit, no stagger,
 * no hover replay, matching the site's existing .lp-reveal fallback for
 * IntersectionObserver-less environments.
 */
import { memo, useEffect, useRef, useState } from 'react';

type Props = {
  text: string;
  emphasis?: string;
  className?: string;
};

function splitWords(s: string): string[] {
  return s.split(/\s+/).filter(Boolean);
}

export const KineticHeadline = memo(({ text, emphasis, className }: Props) => {
  const ref = useRef<HTMLHeadingElement>(null);
  const [lit, setLit] = useState(-1);
  const words = splitWords(text);
  const emphasisWords = emphasis ? splitWords(emphasis) : [];
  const total = words.length + emphasisWords.length;

  const reducedMotion = typeof window !== 'undefined'
    && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  useEffect(() => {
    if (reducedMotion) {
      setLit(total);
      return;
    }
    let i = -1;
    const id = window.setInterval(() => {
      i += 1;
      setLit(i);
      if (i >= total) window.clearInterval(id);
    }, 90);
    return () => window.clearInterval(id);
    // Runs once on mount only -- a hero headline plays once when the page
    // loads, replay is the hover handler below, not a re-run of this effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const replay = () => {
    if (reducedMotion) return;
    let i = -1;
    setLit(-1);
    const id = window.setInterval(() => {
      i += 1;
      setLit(i);
      if (i >= total) window.clearInterval(id);
    }, 70);
  };

  let idx = -1;

  return (
    <h1
      ref={ref}
      className={`lp-display lp-h1 lp-kinetic ${className || ''}`}
      style={{ marginTop: 22 }}
      onMouseEnter={replay}
    >
      {words.map((w, i) => {
        idx += 1;
        const isLit = reducedMotion || idx <= lit;
        return (
          <span key={`w-${i}`} className={`lp-kinetic-word ${isLit ? 'is-lit' : ''}`}>
            {w}{i < words.length - 1 ? ' ' : ''}
          </span>
        );
      })}
      {emphasisWords.length > 0 && (
        <>
          {' '}
          <em>
            {emphasisWords.map((w, i) => {
              idx += 1;
              const isLit = reducedMotion || idx <= lit;
              return (
                <span key={`e-${i}`} className={`lp-kinetic-word ${isLit ? 'is-lit' : ''}`}>
                  {w}{i < emphasisWords.length - 1 ? ' ' : ''}
                </span>
              );
            })}
          </em>
        </>
      )}
    </h1>
  );
});

KineticHeadline.displayName = 'KineticHeadline';
