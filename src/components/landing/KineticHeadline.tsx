/**
 * KineticHeadline — the hero headline reveals word by word instead of
 * sitting static on load, and replays on hover.
 *
 * v3.211.0 -- rebuilt after the v3.208.0 blur fix didn't hold: the same
 * smeared-letter glitch on "Search" was reported again, twice, on the
 * live site with the blur already removed. Two real, compounding causes,
 * both from the same root habit: putting the separating space INSIDE
 * each word's own `display: inline-block` span, as trailing content
 * right before the closing tag.
 *
 * One, .lp-h1's own `text-wrap: balance` forces the browser to recompute
 * line-balancing against the current text -- the old version grew the
 * revealed text one word at a time via a JS setInterval driving React
 * state, so that recompute was firing on every word added mid-animation,
 * not once, fighting a live opacity/transform transition on the same
 * glyphs. Fixed by never growing the DOM incrementally: the full, final
 * text is present from the very first paint (so balance computes exactly
 * once, like any static heading), and each word's reveal is a pure CSS
 * animation (animation-delay staggers them) instead of a JS class
 * mutation.
 *
 * Two, confirmed live after that fix: a trailing space as the LAST thing
 * inside an inline-block span, immediately followed by another
 * inline-block span with no whitespace between them in the source (which
 * is exactly what JSX's array-mapped output produces), is not reliably
 * preserved -- confirmed live as "Searchrealjobs." rendering with the
 * words run together, no space at all. That same unreliable boundary is
 * the more likely real explanation for the original glyph-fragment
 * report too, not the animation. Fixed by making the space its own
 * sibling text node BETWEEN the two spans instead of trailing content
 * inside one of them -- normal inter-element whitespace, which every
 * browser preserves the same, ordinary way it always handles text.
 */
import { memo, useState } from 'react';
import type { ReactNode } from 'react';

type Props = {
  text: string;
  emphasis?: string;
  className?: string;
};

function splitWords(s: string): string[] {
  return s.split(/\s+/).filter(Boolean);
}

// Each word its own animated span; the space between two words is a plain
// sibling text node, never trailing content inside a span.
function renderWords(words: string[], startIdx: number): ReactNode[] {
  const nodes: ReactNode[] = [];
  words.forEach((w, i) => {
    const wordIdx = startIdx + i;
    nodes.push(
      <span key={`w-${wordIdx}`} className="lp-kinetic-word" style={{ animationDelay: `${wordIdx * 90}ms` }}>
        {w}
      </span>,
    );
    if (i < words.length - 1) nodes.push(' ');
  });
  return nodes;
}

export const KineticHeadline = memo(({ text, emphasis, className }: Props) => {
  // Bumping this remounts the heading, which restarts every word's CSS
  // animation-delay from zero -- the hover "replay" effect, with no manual
  // animation-restart bookkeeping needed.
  const [playKey, setPlayKey] = useState(0);
  const words = splitWords(text);
  const emphasisWords = emphasis ? splitWords(emphasis) : [];

  return (
    <h1
      key={playKey}
      className={`lp-display lp-h1 lp-kinetic ${className || ''}`}
      style={{ marginTop: 22 }}
      onMouseEnter={() => setPlayKey((k) => k + 1)}
    >
      {renderWords(words, 0)}
      {emphasisWords.length > 0 && (
        <>
          {' '}
          <em>{renderWords(emphasisWords, words.length)}</em>
        </>
      )}
    </h1>
  );
});

KineticHeadline.displayName = 'KineticHeadline';
