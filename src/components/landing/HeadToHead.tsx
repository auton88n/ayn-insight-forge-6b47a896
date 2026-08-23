/**
 * HeadToHead — a real, direct comparison, not another feature list.
 *
 * Reported directly: the landing page needed real marketing content,
 * not just another visual pass. This is that -- the single most
 * persuasive thing a page like this can say is "here is exactly how
 * we're different," stated plainly, side by side. Every line here
 * restates a claim already made elsewhere on this page (the pain
 * section, the AI-contrast chips, the pricing copy) -- nothing new is
 * asserted here, it's the same honest facts in the format that
 * actually sells them.
 */
import { memo } from 'react';
import { X, Check } from 'lucide-react';

type Row = { them: string; us: string };

export const HeadToHead = memo(({ themLabel, rows }: { themLabel: string; rows: Row[] }) => (
  <div className="lp-vs">
    <div className="lp-vs-col lp-vs-them">
      <div className="lp-vs-head">{themLabel}</div>
      {rows.map((r) => (
        <div className="lp-vs-row" key={r.them}>
          <X size={16} />
          <span>{r.them}</span>
        </div>
      ))}
    </div>
    <div className="lp-vs-col lp-vs-us">
      <div className="lp-vs-head">AYN</div>
      {rows.map((r) => (
        <div className="lp-vs-row" key={r.us}>
          <Check size={16} />
          <span>{r.us}</span>
        </div>
      ))}
    </div>
  </div>
));

HeadToHead.displayName = 'HeadToHead';
