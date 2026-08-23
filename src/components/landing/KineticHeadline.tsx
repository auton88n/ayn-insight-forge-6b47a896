/**
 * KineticHeadline — the hero headline fades in on load and replays on hover.
 *
 * v3.212.0 -- the per-word reveal (each word its own animated span) kept
 * producing a real, reported visual defect on "Search" -- a smeared,
 * ember-colored fragment attached to the letter -- across three separate
 * rounds of fixes (v3.208.0's blur removal, v3.211.0's text-wrap/spacing
 * rebuild), each one closing a real, confirmed mechanism without actually
 * stopping the report. Rather than chase a fourth theory, this removes
 * the entire risk category at once: the headline is now plain, un-split
 * text, exactly what a normal static heading would render, with ONE
 * single opacity/transform animation on the whole block. No per-word
 * spans, no animation-delay staggering, no compositing-layer boundary
 * between adjacent inline-block elements for a browser to get wrong --
 * there is nothing left inside the text itself for a mid-animation
 * rendering artifact to attach to.
 */
import { memo, useState } from 'react';

type Props = {
  text: string;
  emphasis?: string;
  className?: string;
};

export const KineticHeadline = memo(({ text, emphasis, className }: Props) => {
  // Bumping this remounts the heading, restarting its CSS animation --
  // the hover "replay" effect.
  const [playKey, setPlayKey] = useState(0);

  return (
    <h1
      key={playKey}
      className={`lp-display lp-h1 lp-kinetic-fade ${className || ''}`}
      style={{ marginTop: 22 }}
      onMouseEnter={() => setPlayKey((k) => k + 1)}
    >
      {text}
      {emphasis ? <> <em>{emphasis}</em></> : null}
    </h1>
  );
});

KineticHeadline.displayName = 'KineticHeadline';
