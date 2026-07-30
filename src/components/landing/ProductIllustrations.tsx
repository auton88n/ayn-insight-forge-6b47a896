/**
 * ProductIllustrations — hand written inline SVG product visuals for the
 * landing page. No external assets, nothing fetched at runtime, all static
 * (so prefers-reduced-motion is satisfied by construction).
 *
 * Tokens mirror HeroScroll's C palette.
 */
import type React from 'react';

const T = {
  ink: '#06070A',
  inkMid: '#3D3F45',
  inkSub: '#6E7076',
  border: 'rgba(0,0,0,0.08)',
  borderMd: 'rgba(0,0,0,0.12)',
  bgOff: '#ffffff',
  orange: '#f97316',
  orangeDeep: '#ea580c',
};

const svgBase: React.CSSProperties = { width: '100%', height: 'auto', display: 'block' };
const a11y = { 'aria-hidden': true as const, role: 'presentation' as const, focusable: 'false' as const };

/* 1 — Fill in progress: form panel + AYN sidepanel */
export function FillInProgressIllustration({ style }: { style?: React.CSSProperties }) {
  const rows: { y: number; state: 'done' | 'active' | 'select' | 'skip' }[] = [
    { y: 52, state: 'done' },
    { y: 98, state: 'done' },
    { y: 144, state: 'active' },
    { y: 190, state: 'done' },
    { y: 236, state: 'select' },
  ];

  return (
    <svg {...a11y} viewBox="0 0 900 360" style={{ ...svgBase, ...style }} preserveAspectRatio="xMidYMid meet">
      {/* form panel */}
      <rect x="8" y="8" width="592" height="344" rx="18" fill="#fff" stroke={T.borderMd} />
      <rect x="36" y="30" width="118" height="8" rx="4" fill={T.ink} opacity="0.75" />

      {rows.map((r, i) => (
        <g key={i}>
          <rect x="36" y={r.y} width={i % 2 ? 96 : 74} height="6" rx="3" fill={T.inkSub} opacity="0.35" />
          <rect
            x="36"
            y={r.y + 14}
            width="528"
            height="30"
            rx="8"
            fill="#fff"
            stroke={r.state === 'active' ? T.orange : T.border}
            strokeWidth={r.state === 'active' ? 2 : 1}
          />
          {/* value placeholder */}
          <rect x="50" y={r.y + 25} width={r.state === 'active' ? 120 : 210} height="8" rx="4" fill={T.inkMid} opacity="0.28" />
          {/* dropdown chevron */}
          {r.state === 'select' && (
            <path d={`M540 ${r.y + 25} l6 7 6 -7`} fill="none" stroke={T.inkSub} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          )}
          {/* status marks */}
          {r.state === 'done' && (
            <path d={`M534 ${r.y + 29} l5 6 10 -12`} fill="none" stroke={T.orange} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          )}
          {r.state === 'active' && <circle cx="542" cy={r.y + 29} r="5.5" fill="none" stroke={T.orange} strokeWidth="2" />}
        </g>
      ))}

      {/* file upload row, left unfilled (skipped) */}
      <rect x="36" y="282" width="88" height="6" rx="3" fill={T.inkSub} opacity="0.35" />
      <rect x="36" y="296" width="528" height="38" rx="8" fill="none" stroke={T.borderMd} strokeDasharray="5 4" />
      <path d="M60 320 v-14 M54 312 l6 -6 6 6" fill="none" stroke={T.inkSub} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" opacity="0.7" />
      <rect x="78" y="311" width="120" height="8" rx="4" fill={T.inkSub} opacity="0.22" />
      <circle cx="542" cy="315" r="5.5" fill="none" stroke={T.inkSub} strokeWidth="1.5" opacity="0.6" />


      {/* sidepanel */}
      <rect x="624" y="8" width="268" height="344" rx="18" fill="#fff" stroke={T.borderMd} />
      <circle cx="758" cy="86" r="38" fill="none" stroke={T.border} strokeWidth="8" />
      <circle
        cx="758"
        cy="86"
        r="38"
        fill="none"
        stroke={T.orange}
        strokeWidth="8"
        strokeLinecap="round"
        strokeDasharray={`${2 * Math.PI * 38 * 0.72} ${2 * Math.PI * 38}`}
        transform="rotate(-90 758 86)"
      />
      <rect x="742" y="82" width="32" height="9" rx="4.5" fill={T.ink} opacity="0.7" />

      {[160, 216, 272].map((y, i) => (
        <g key={y}>
          <rect x="652" y={y} width="212" height="42" rx="10" fill="#fff" stroke={T.border} />
          <circle cx="672" cy={y + 21} r="5" fill={i === 2 ? 'none' : T.orange} stroke={i === 2 ? T.inkSub : 'none'} strokeWidth="1.5" opacity={i === 1 ? 0.55 : 1} />
          <rect x="688" y={y + 12} width={i === 0 ? 132 : i === 1 ? 108 : 88} height="6" rx="3" fill={T.inkMid} opacity="0.5" />
          <rect x="688" y={y + 25} width={i === 0 ? 92 : 64} height="6" rx="3" fill={T.inkSub} opacity="0.25" />
        </g>
      ))}
    </svg>
  );
}

/* 2 — Match score ring with grounding lines */
export function MatchScoreIllustration({ style }: { style?: React.CSSProperties }) {
  const r = 34;
  const circ = 2 * Math.PI * r;
  return (
    <svg {...a11y} viewBox="0 0 200 150" style={{ ...svgBase, ...style }} preserveAspectRatio="xMidYMid meet">
      <circle cx="100" cy="52" r={r} fill="none" stroke={T.border} strokeWidth="8" />
      <circle
        cx="100" cy="52" r={r} fill="none" stroke={T.orange} strokeWidth="8" strokeLinecap="round"
        strokeDasharray={`${circ * 0.72} ${circ}`} transform="rotate(-90 100 52)"
      />
      <text x="100" y="59" textAnchor="middle" fontFamily="'Inter Tight', Inter, system-ui, sans-serif" fontSize="22" fontWeight="700" fill={T.ink}>72%</text>
      <rect x="50" y="106" width="100" height="6" rx="3" fill={T.inkMid} opacity="0.45" />
      <rect x="62" y="120" width="76" height="6" rx="3" fill={T.inkSub} opacity="0.3" />
      <rect x="74" y="134" width="52" height="6" rx="3" fill={T.inkSub} opacity="0.2" />
    </svg>
  );
}

/* 3 — Provenance: sources feed a verified field, unverified stays blank */
export function ProvenanceIllustration({ style }: { style?: React.CSSProperties }) {
  return (
    <svg {...a11y} viewBox="0 0 240 150" style={{ ...svgBase, ...style }} preserveAspectRatio="xMidYMid meet">
      {[10, 74].map((y, i) => (
        <g key={y}>
          <rect x="8" y={y} width="72" height="52" rx="10" fill="#fff" stroke={T.borderMd} />
          <rect x="20" y={y + 14} width={i ? 38 : 46} height="6" rx="3" fill={T.inkMid} opacity="0.45" />
          <rect x="20" y={y + 26} width="34" height="5" rx="2.5" fill={T.inkSub} opacity="0.28" />
          <rect x="20" y={y + 36} width="44" height="5" rx="2.5" fill={T.inkSub} opacity="0.28" />
        </g>
      ))}
      <path d="M88 62 H126" fill="none" stroke={T.inkSub} strokeWidth="1.5" strokeLinecap="round" />
      <path d="M120 56 l7 6 -7 6" fill="none" stroke={T.inkSub} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />

      <rect x="136" y="22" width="96" height="34" rx="9" fill="#fff" stroke={T.border} />
      <rect x="148" y="35" width="48" height="7" rx="3.5" fill={T.inkMid} opacity="0.45" />
      <path d="M206 40 l5 6 10 -12" fill="none" stroke={T.orange} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />

      <rect x="136" y="90" width="96" height="34" rx="9" fill="none" stroke={T.borderMd} strokeDasharray="5 4" />
      <circle cx="214" cy="107" r="6" fill="none" stroke={T.inkSub} strokeWidth="1.5" opacity="0.6" />
    </svg>
  );
}

/* 4 — One page document */
export function OnePageDocIllustration({ style }: { style?: React.CSSProperties }) {
  return (
    <svg {...a11y} viewBox="0 0 200 150" style={{ ...svgBase, ...style }} preserveAspectRatio="xMidYMid meet">
      {/* faint second page behind, dimmed */}
      <rect x="86" y="16" width="82" height="112" rx="8" fill="#fff" stroke={T.border} opacity="0.5" />
      <path d="M96 40 L158 104" stroke={T.inkSub} strokeWidth="1.2" opacity="0.35" />

      {/* main page */}
      <rect x="34" y="10" width="88" height="124" rx="9" fill="#fff" stroke={T.borderMd} />
      <rect x="48" y="28" width="46" height="8" rx="4" fill={T.ink} opacity="0.75" />
      <rect x="48" y="44" width="30" height="5" rx="2.5" fill={T.inkSub} opacity="0.3" />
      <rect x="48" y="62" width="36" height="6" rx="3" fill={T.orange} opacity="0.75" />
      {[78, 92, 106, 120].map(y => (
        <g key={y}>
          <circle cx="51" cy={y + 2} r="1.8" fill={T.inkSub} opacity="0.45" />
          <rect x="58" y={y} width={y === 120 ? 34 : 50} height="5" rx="2.5" fill={T.inkSub} opacity="0.28" />
        </g>
      ))}
      {/* badge */}
      <rect x="120" y="6" width="52" height="22" rx="11" fill="#fff" stroke={T.orange} />
      <text x="146" y="21" textAnchor="middle" fontFamily="'Inter', system-ui, sans-serif" fontSize="11" fontWeight="600" fill={T.orangeDeep}>1 page</text>
    </svg>
  );
}

/* 5 — Run summary bar */
export function RunSummaryIllustration({ style }: { style?: React.CSSProperties }) {
  const legend = [
    { c: T.orange, label: 'Filled' },
    { c: T.inkSub, label: 'Skipped' },
    { c: 'rgba(0,0,0,0.14)', label: 'Needs review' },
  ];
  return (
    <svg {...a11y} viewBox="0 0 560 96" style={{ ...svgBase, ...style }} preserveAspectRatio="xMidYMid meet">
      <clipPath id="ayn-run-bar"><rect x="0" y="0" width="560" height="22" rx="11" /></clipPath>
      <g clipPath="url(#ayn-run-bar)">
        <rect x="0" y="0" width="380" height="22" fill={T.orange} />
        <rect x="380" y="0" width="102" height="22" fill={T.inkSub} opacity="0.55" />
        <rect x="482" y="0" width="78" height="22" fill="rgba(0,0,0,0.14)" />
      </g>
      <rect x="0.5" y="0.5" width="559" height="21" rx="10.5" fill="none" stroke={T.border} />
      {legend.map((l, i) => (
        <g key={l.label} transform={`translate(${i * 180}, 56)`}>
          <circle cx="6" cy="6" r="6" fill={l.c} opacity={i === 1 ? 0.55 : 1} />
          <text x="20" y="10" fontFamily="'Inter', system-ui, sans-serif" fontSize="13" fill={T.inkSub}>{l.label}</text>
        </g>
      ))}
    </svg>
  );
}
