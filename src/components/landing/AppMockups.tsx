/**
 * AppMockups — inline SVG renditions of the real AYN screens.
 *
 * Every one of these mirrors a surface that actually exists in the product:
 * the extension panel on a live posting, the tailored documents produced for
 * one job, the employer candidate card, and a verification assessment.
 *
 * All static, no images, no runtime fetch, so reduced motion is satisfied by
 * construction. Palette matches the landing tokens.
 */
import type React from 'react';

const T = {
  ink: '#0B0C0F',
  inkMid: '#3D3F45',
  inkSub: '#6E7076',
  border: 'rgba(0,0,0,0.09)',
  borderMd: 'rgba(0,0,0,0.14)',
  paper: '#ffffff',
  surface: '#f5f2ec',
  ember: '#e85d3a',
  emberDeep: '#c2410c',
  green: '#3f9d6a',
};

const F = "'Inter', system-ui, sans-serif";
const FD = "'Outfit', system-ui, sans-serif";
const svgBase: React.CSSProperties = { width: '100%', height: 'auto', display: 'block' };
const a11y = { role: 'img' as const, focusable: 'false' as const };

function Chrome({ url, w }: { url: string; w: number }) {
  return (
    <g>
      <rect x="0" y="0" width={w} height="34" rx="0" fill={T.surface} />
      <circle cx="20" cy="17" r="4.5" fill="rgba(0,0,0,0.12)" />
      <circle cx="36" cy="17" r="4.5" fill="rgba(0,0,0,0.12)" />
      <circle cx="52" cy="17" r="4.5" fill="rgba(0,0,0,0.12)" />
      <rect x="70" y="7" width={w - 150} height="20" rx="10" fill="#fff" stroke={T.border} />
      <text x="84" y="21" fontFamily={F} fontSize="10.5" fill={T.inkSub}>{url}</text>
      <rect x={w - 68} y="7" width="52" height="20" rx="10" fill={T.ember} />
      <text x={w - 42} y="21" textAnchor="middle" fontFamily={FD} fontSize="10" fontWeight="700" fill="#fff" letterSpacing="0.6">AYN</text>
    </g>
  );
}

/* ── 1. The extension reading a real posting ───────────────── */
export function ExtensionOnPostingMockup({ style }: { style?: React.CSSProperties }) {
  const W = 900, H = 430;
  const matched = ['React and TypeScript', 'Design systems at scale', 'Mentoring engineers'];
  const missing = ['Kubernetes', 'Terraform'];
  return (
    <svg {...a11y} aria-label="The AYN panel open beside a job posting, showing a match score, matched skills and real gaps" viewBox={`0 0 ${W} ${H}`} style={{ ...svgBase, ...style }} preserveAspectRatio="xMidYMid meet">
      <rect x="0.5" y="0.5" width={W - 1} height={H - 1} rx="16" fill={T.paper} stroke={T.borderMd} />
      <clipPath id="mk1"><rect x="0" y="0" width={W} height={H} rx="16" /></clipPath>
      <g clipPath="url(#mk1)">
        <Chrome url="boards.greenhouse.io/acme/jobs/senior-frontend-engineer" w={W} />

        {/* posting */}
        <text x="30" y="72" fontFamily={FD} fontSize="19" fontWeight="700" fill={T.ink}>Senior Frontend Engineer</text>
        <text x="30" y="93" fontFamily={F} fontSize="12" fill={T.inkSub}>Acme · Toronto, hybrid · Full time</text>
        <rect x="30" y="108" width="118" height="20" rx="10" fill="rgba(232,93,58,0.12)" stroke="rgba(232,93,58,0.3)" />
        <text x="89" y="122" textAnchor="middle" fontFamily={F} fontSize="10.5" fontWeight="600" fill={T.emberDeep}>1,240 words read</text>

        {[148, 168, 188, 208, 228, 248, 268, 288, 308, 328, 348, 368].map((y, i) => (
          <rect key={y} x="30" y={y} width={i % 3 === 2 ? 300 : i % 2 ? 470 : 520} height="7" rx="3.5" fill={T.inkSub} opacity={0.18} />
        ))}
        <text x="30" y="400" fontFamily={F} fontSize="11" fill={T.inkSub} opacity="0.8">The full posting, not the nav bar.</text>

        {/* panel */}
        <rect x="596" y="34" width={W - 596} height={H - 34} fill={T.surface} />
        <line x1="596" y1="34" x2="596" y2={H} stroke={T.border} />
        <circle cx="622" cy="62" r="7" fill="none" stroke={T.ember} strokeWidth="2.5" />
        <circle cx="622" cy="62" r="2" fill={T.ember} />
        <text x="638" y="66" fontFamily={FD} fontSize="12.5" fontWeight="700" fill={T.ink} letterSpacing="0.6">AYN</text>

        <circle cx="748" cy="132" r="42" fill="none" stroke="rgba(0,0,0,0.08)" strokeWidth="9" />
        <circle cx="748" cy="132" r="42" fill="none" stroke={T.ember} strokeWidth="9" strokeLinecap="round"
          strokeDasharray={`${2 * Math.PI * 42 * 0.84} ${2 * Math.PI * 42}`} transform="rotate(-90 748 132)" />
        <text x="748" y="139" textAnchor="middle" fontFamily={FD} fontSize="26" fontWeight="700" fill={T.ink}>84%</text>
        <text x="748" y="192" textAnchor="middle" fontFamily={F} fontSize="11" fill={T.inkSub}>match for this role</text>

        <text x="620" y="224" fontFamily={F} fontSize="10" fontWeight="700" fill={T.inkSub} letterSpacing="1">WHAT LINES UP</text>
        {matched.map((m, i) => (
          <g key={m}>
            <path d={`M622 ${240 + i * 22} l4 5 8 -10`} fill="none" stroke={T.green} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            <text x="640" y={244 + i * 22} fontFamily={F} fontSize="11.5" fill={T.inkMid}>{m}</text>
          </g>
        ))}

        <text x="620" y="326" fontFamily={F} fontSize="10" fontWeight="700" fill={T.inkSub} letterSpacing="1">WHAT IS MISSING</text>
        {missing.map((m, i) => (
          <g key={m}>
            <circle cx="626" cy={340 + i * 22} r="4.5" fill="none" stroke={T.ember} strokeWidth="1.8" />
            <text x="640" y={344 + i * 22} fontFamily={F} fontSize="11.5" fill={T.inkMid}>{m}</text>
          </g>
        ))}

        <rect x="614" y="384" width="262" height="30" rx="9" fill="rgba(232,93,58,0.12)" stroke="rgba(232,93,58,0.3)" />
        <text x="745" y="403" textAnchor="middle" fontFamily={F} fontSize="11" fontWeight="600" fill={T.emberDeep}>Grounded on the posting you are reading</text>
      </g>
    </svg>
  );
}

/* ── 2. Tailored resume and cover letter for one job ───────── */
export function TailoredDocsMockup({ style }: { style?: React.CSSProperties }) {
  const W = 620, H = 400;
  return (
    <svg {...a11y} aria-label="A one page resume and a cover letter generated for one specific job" viewBox={`0 0 ${W} ${H}`} style={{ ...svgBase, ...style }} preserveAspectRatio="xMidYMid meet">
      {/* cover letter behind */}
      <g transform="rotate(4 400 200)">
        <rect x="330" y="46" width="226" height="312" rx="12" fill={T.paper} stroke={T.borderMd} />
        <text x="352" y="76" fontFamily={FD} fontSize="12" fontWeight="700" fill={T.ink}>Cover letter</text>
        <text x="352" y="94" fontFamily={F} fontSize="9.5" fill={T.inkSub}>Acme, Senior Frontend Engineer</text>
        <rect x="352" y="108" width="120" height="6" rx="3" fill={T.ember} opacity="0.7" />
        {[128, 144, 160, 176, 192, 208, 224, 240, 256, 272].map((y, i) => (
          <rect key={y} x="352" y={y} width={i % 3 === 2 ? 118 : 182} height="6" rx="3" fill={T.inkSub} opacity="0.2" />
        ))}
        <rect x="352" y="300" width="86" height="6" rx="3" fill={T.inkMid} opacity="0.4" />
      </g>

      {/* resume front */}
      <rect x="42" y="26" width="264" height="352" rx="14" fill={T.paper} stroke={T.borderMd} />
      <text x="68" y="62" fontFamily={FD} fontSize="15" fontWeight="700" fill={T.ink}>Your resume</text>
      <text x="68" y="80" fontFamily={F} fontSize="10" fill={T.inkSub}>Written for this posting, from your own facts</text>

      <rect x="68" y="96" width="120" height="7" rx="3.5" fill={T.ember} opacity="0.8" />
      {[116, 130, 144].map((y, i) => (
        <g key={y}>
          <circle cx="71" cy={y + 2} r="2" fill={T.inkSub} opacity="0.5" />
          <rect x="80" y={y} width={i === 2 ? 130 : 200} height="6" rx="3" fill={T.inkSub} opacity="0.26" />
        </g>
      ))}
      <rect x="68" y="170" width="96" height="7" rx="3.5" fill={T.ember} opacity="0.8" />
      {[190, 204, 218, 232].map((y, i) => (
        <g key={y}>
          <circle cx="71" cy={y + 2} r="2" fill={T.inkSub} opacity="0.5" />
          <rect x="80" y={y} width={i === 3 ? 110 : 196} height="6" rx="3" fill={T.inkSub} opacity="0.26" />
        </g>
      ))}
      <rect x="68" y="258" width="80" height="7" rx="3.5" fill={T.ember} opacity="0.8" />
      {[278, 292].map((y) => (
        <rect key={y} x="80" y={y} width="184" height="6" rx="3" fill={T.inkSub} opacity="0.22" />
      ))}

      {/* download row */}
      <rect x="68" y="322" width="98" height="28" rx="8" fill={T.ink} />
      <text x="117" y="340" textAnchor="middle" fontFamily={F} fontSize="10.5" fontWeight="600" fill="#fff">Download PDF</text>
      <rect x="176" y="322" width="76" height="28" rx="8" fill="none" stroke={T.borderMd} />
      <text x="214" y="340" textAnchor="middle" fontFamily={F} fontSize="10.5" fontWeight="600" fill={T.inkMid}>DOCX</text>

      <rect x="212" y="10" width="96" height="26" rx="13" fill="#fff" stroke={T.ember} />
      <text x="260" y="27" textAnchor="middle" fontFamily={F} fontSize="10.5" fontWeight="700" fill={T.emberDeep}>One page</text>
    </svg>
  );
}

/* ── 3. Employer candidate card ────────────────────────────── */
export function CandidateCardMockup({ style }: { style?: React.CSSProperties }) {
  const W = 760, H = 420;
  return (
    <svg {...a11y} aria-label="An employer candidate card with a match score, evidence, gaps and where each skill came from" viewBox={`0 0 ${W} ${H}`} style={{ ...svgBase, ...style }} preserveAspectRatio="xMidYMid meet">
      <rect x="0.5" y="0.5" width={W - 1} height={H - 1} rx="18" fill={T.paper} stroke={T.borderMd} />

      {/* head */}
      <circle cx="58" cy="58" r="22" fill="rgba(232,93,58,0.14)" stroke="rgba(232,93,58,0.3)" />
      <text x="58" y="64" textAnchor="middle" fontFamily={FD} fontSize="16" fontWeight="700" fill={T.emberDeep}>M</text>
      <text x="92" y="52" fontFamily={FD} fontSize="18" fontWeight="700" fill={T.ink}>Maya</text>
      <text x="92" y="72" fontFamily={F} fontSize="11.5" fill={T.inkSub}>7 years · Toronto · open to hybrid</text>

      <circle cx="690" cy="58" r="30" fill="none" stroke="rgba(0,0,0,0.08)" strokeWidth="7" />
      <circle cx="690" cy="58" r="30" fill="none" stroke={T.ember} strokeWidth="7" strokeLinecap="round"
        strokeDasharray={`${2 * Math.PI * 30 * 0.91} ${2 * Math.PI * 30}`} transform="rotate(-90 690 58)" />
      <text x="690" y="64" textAnchor="middle" fontFamily={FD} fontSize="18" fontWeight="700" fill={T.ink}>91</text>

      <line x1="28" y1="98" x2={W - 28} y2="98" stroke={T.border} />

      {/* why */}
      <text x="28" y="126" fontFamily={F} fontSize="10" fontWeight="700" fill={T.inkSub} letterSpacing="1">WHY AYN PICKED MAYA</text>
      {[
        'Led the rebuild of a design system used by four product teams.',
        'Seven years in React and TypeScript, last used this year.',
        'Has shipped to the same customer size you are hiring for.',
      ].map((line, i) => (
        <text key={i} x="28" y={148 + i * 20} fontFamily={F} fontSize="12" fill={T.inkMid}>{line}</text>
      ))}

      {/* matched / gaps columns */}
      <rect x="28" y="214" width="336" height="112" rx="12" fill={T.surface} stroke={T.border} />
      <text x="46" y="238" fontFamily={F} fontSize="10" fontWeight="700" fill={T.inkSub} letterSpacing="1">FROM THEIR RESUME</text>
      {['React', 'TypeScript', 'Design systems', 'Accessibility'].map((s, i) => {
        const x = 46 + (i % 2) * 150, y = 252 + Math.floor(i / 2) * 32;
        return (
          <g key={s}>
            <rect x={x} y={y} width="136" height="24" rx="12" fill="#fff" stroke={T.border} />
            <text x={x + 68} y={y + 16} textAnchor="middle" fontFamily={F} fontSize="11" fill={T.inkMid}>{s}</text>
          </g>
        );
      })}

      <rect x="396" y="214" width="336" height="112" rx="12" fill="#fff" stroke={T.border} />
      <text x="414" y="238" fontFamily={F} fontSize="10" fontWeight="700" fill={T.inkSub} letterSpacing="1">GAPS, STATED PLAINLY</text>
      {['No Kubernetes anywhere in their history', 'Team lead title, not manager title'].map((s, i) => (
        <g key={s}>
          <circle cx="420" cy={258 + i * 26} r="4" fill="none" stroke={T.ember} strokeWidth="1.6" />
          <text x="434" y={262 + i * 26} fontFamily={F} fontSize="11.5" fill={T.inkMid}>{s}</text>
        </g>
      ))}
      <text x="414" y="316" fontFamily={F} fontSize="10.5" fill={T.inkSub} opacity="0.85">Nothing here is inferred without saying so.</text>

      {/* actions */}
      <rect x="28" y="352" width="180" height="38" rx="10" fill={T.ember} />
      <text x="118" y="376" textAnchor="middle" fontFamily={F} fontSize="12.5" fontWeight="700" fill="#fff">Send an assessment</text>
      <rect x="220" y="352" width="170" height="38" rx="10" fill="none" stroke={T.borderMd} />
      <text x="305" y="376" textAnchor="middle" fontFamily={F} fontSize="12.5" fontWeight="600" fill={T.inkMid}>Send a proposal</text>
      <text x="410" y="376" fontFamily={F} fontSize="11" fill={T.inkSub}>Email and phone stay private until Maya accepts.</text>
    </svg>
  );
}

/* ── 4. Verification assessment ────────────────────────────── */
export function AssessmentMockup({ style }: { style?: React.CSSProperties }) {
  const W = 760, H = 400;
  return (
    <svg {...a11y} aria-label="A verification assessment question written from the candidate's own background, and the employer's result view" viewBox={`0 0 ${W} ${H}`} style={{ ...svgBase, ...style }} preserveAspectRatio="xMidYMid meet">
      {/* candidate side */}
      <rect x="0.5" y="0.5" width="404" height={H - 1} rx="16" fill={T.paper} stroke={T.borderMd} />
      <text x="26" y="38" fontFamily={F} fontSize="10" fontWeight="700" fill={T.inkSub} letterSpacing="1">QUESTION 3 OF 6</text>
      <rect x="286" y="22" width="94" height="22" rx="11" fill="rgba(232,93,58,0.12)" stroke="rgba(232,93,58,0.3)" />
      <text x="333" y="37" textAnchor="middle" fontFamily={F} fontSize="10.5" fontWeight="700" fill={T.emberDeep}>18:42 left</text>

      <text x="26" y="72" fontFamily={F} fontSize="12.5" fill={T.ink}>You rebuilt a design system used by four teams.</text>
      <text x="26" y="92" fontFamily={F} fontSize="12.5" fill={T.ink}>What broke for the teams already shipping on the</text>
      <text x="26" y="112" fontFamily={F} fontSize="12.5" fill={T.ink}>old one, and what did you do about it?</text>

      <rect x="26" y="132" width="352" height="180" rx="12" fill={T.surface} stroke={T.border} />
      {[158, 176, 194, 212, 230, 248, 266].map((y, i) => (
        <rect key={y} x="44" y={y} width={i === 6 ? 150 : i % 2 ? 280 : 316} height="7" rx="3.5" fill={T.inkSub} opacity="0.24" />
      ))}
      <rect x="26" y="330" width="120" height="34" rx="9" fill={T.ink} />
      <text x="86" y="352" textAnchor="middle" fontFamily={F} fontSize="11.5" fontWeight="600" fill="#fff">Next question</text>
      <text x="160" y="352" fontFamily={F} fontSize="10.5" fill={T.inkSub}>Written from their own background.</text>

      {/* employer side */}
      <rect x="424.5" y="0.5" width="335" height={H - 1} rx="16" fill={T.surface} stroke={T.borderMd} />
      <text x="450" y="38" fontFamily={F} fontSize="10" fontWeight="700" fill={T.inkSub} letterSpacing="1">WHAT YOU SEE</text>
      <text x="450" y="72" fontFamily={FD} fontSize="26" fontWeight="700" fill={T.ink}>78</text>
      <rect x="492" y="52" width="182" height="24" rx="12" fill="#fff" stroke={T.border} />
      <text x="583" y="68" textAnchor="middle" fontFamily={F} fontSize="10.5" fill={T.inkMid}>Consistent with their profile</text>

      {[
        ['Q1', '92', '3m 10s'],
        ['Q2', '71', '4m 02s'],
        ['Q3', '80', '5m 48s'],
      ].map((r, i) => (
        <g key={r[0]}>
          <rect x="450" y={98 + i * 44} width="284" height="36" rx="10" fill="#fff" stroke={T.border} />
          <text x="466" y={121 + i * 44} fontFamily={F} fontSize="11.5" fontWeight="600" fill={T.inkMid}>{r[0]}</text>
          <text x="500" y={121 + i * 44} fontFamily={F} fontSize="11.5" fill={T.inkSub}>score {r[1]}</text>
          <text x="718" y={121 + i * 44} textAnchor="end" fontFamily={F} fontSize="11.5" fill={T.inkSub}>{r[2]}</text>
        </g>
      ))}

      <rect x="450" y="240" width="284" height="86" rx="12" fill="#fff" stroke={T.border} />
      <text x="466" y="264" fontFamily={F} fontSize="10" fontWeight="700" fill={T.inkSub} letterSpacing="1">OBSERVED</text>
      <text x="466" y="286" fontFamily={F} fontSize="11.5" fill={T.inkMid}>Named the migration cost and the two</text>
      <text x="466" y="304" fontFamily={F} fontSize="11.5" fill={T.inkMid}>teams that pushed back. Lived detail.</text>

      <text x="450" y="356" fontFamily={F} fontSize="10.5" fill={T.inkSub}>Time per answer is part of the signal.</text>
      <text x="450" y="374" fontFamily={F} fontSize="10.5" fill={T.inkSub}>The candidate never sees a score.</text>
    </svg>
  );
}

/* ── 5. Role spec to a shortlist of three ──────────────────── */
export function ShortlistMockup({ style }: { style?: React.CSSProperties }) {
  const W = 760, H = 400;
  const spec: [string, string][] = [
    ['Role', 'Senior Frontend Engineer'],
    ['Must have', 'React, TypeScript, design systems'],
    ['Location', 'Toronto, hybrid'],
    ['Experience', '5 years or more'],
  ];
  const rows: [string, string, string, string][] = [
    ['M', 'Maya', '7 years · Toronto · hybrid', '91'],
    ['D', 'Devon', '6 years · Ottawa · remote', '84'],
    ['S', 'Sana', '5 years · Toronto · onsite', '79'],
  ];
  return (
    <svg {...a11y} aria-label="A role described once on the left, and the three strongest candidates ranked on the right" viewBox={`0 0 ${W} ${H}`} style={{ ...svgBase, ...style }} preserveAspectRatio="xMidYMid meet">
      {/* the spec */}
      <rect x="0.5" y="0.5" width="292" height={H - 1} rx="16" fill={T.surface} stroke={T.borderMd} />
      <text x="26" y="38" fontFamily={F} fontSize="10" fontWeight="700" fill={T.inkSub} letterSpacing="1">THE ROLE, ONCE</text>
      {spec.map(([k, v], i) => (
        <g key={k}>
          <rect x="26" y={58 + i * 62} width="240" height="50" rx="12" fill="#fff" stroke={T.border} />
          <text x="42" y={78 + i * 62} fontFamily={F} fontSize="10" fontWeight="700" fill={T.inkSub} letterSpacing="0.8">{k.toUpperCase()}</text>
          <text x="42" y={97 + i * 62} fontFamily={F} fontSize="11.5" fill={T.inkMid}>{v}</text>
        </g>
      ))}
      <rect x="26" y="318" width="150" height="34" rx="9" fill={T.ember} />
      <text x="101" y="340" textAnchor="middle" fontFamily={F} fontSize="12" fontWeight="700" fill="#fff">Find candidates</text>
      <text x="26" y="372" fontFamily={F} fontSize="10.5" fill={T.inkSub}>No boolean strings, no keyword filters.</text>

      {/* the shortlist */}
      <rect x="312.5" y="0.5" width="447" height={H - 1} rx="16" fill={T.paper} stroke={T.borderMd} />
      <text x="338" y="38" fontFamily={F} fontSize="10" fontWeight="700" fill={T.inkSub} letterSpacing="1">THE THREE STRONGEST FITS</text>
      {rows.map(([initial, name, meta, score], i) => {
        const y = 58 + i * 92;
        return (
          <g key={name}>
            <rect x="338" y={y} width="396" height="76" rx="14" fill={i === 0 ? T.surface : '#fff'} stroke={i === 0 ? T.borderMd : T.border} />
            <circle cx="376" cy={y + 38} r="18" fill="rgba(232,93,58,0.14)" stroke="rgba(232,93,58,0.3)" />
            <text x="376" y={y + 43} textAnchor="middle" fontFamily={FD} fontSize="13" fontWeight="700" fill={T.emberDeep}>{initial}</text>
            <text x="406" y={y + 32} fontFamily={FD} fontSize="14" fontWeight="700" fill={T.ink}>{name}</text>
            <text x="406" y={y + 51} fontFamily={F} fontSize="11" fill={T.inkSub}>{meta}</text>
            <rect x="640" y={y + 20} width="76" height="36" rx="10" fill="#fff" stroke={T.borderMd} />
            <text x="678" y={y + 44} textAnchor="middle" fontFamily={FD} fontSize="15" fontWeight="700" fill={T.ink}>{score}</text>
          </g>
        );
      })}
      <text x="338" y="360" fontFamily={F} fontSize="10.5" fill={T.inkSub}>Ranked on evidence in their own history.</text>
      <text x="338" y="378" fontFamily={F} fontSize="10.5" fill={T.inkSub}>Names and contact stay private until they accept.</text>
    </svg>
  );
}
