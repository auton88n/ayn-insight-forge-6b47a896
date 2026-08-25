/**
 * AppMockups — inline SVG renditions of the real AYN screens.
 *
 * Every one of these mirrors a surface that actually exists in the product:
 * the tailored documents produced for one job, the employer candidate card,
 * a verification assessment, the auto-sourced Browse Jobs feed, and the
 * in-app inbox.
 *
 * All static, no runtime fetch, so reduced motion is satisfied by
 * construction. Palette matches the landing tokens. One exception to the
 * "no images" rule: the real AYN wordmark (the same asset used in the site
 * header) is embedded via SVG <image> rather than hand-redrawn, so the
 * panel's own brand badge is pixel-identical to the real logo.
 */
import type React from 'react';
import aynLogo from '@/assets/ayn-logo.png';

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

function AppChrome({ label, w }: { label: string; w: number }) {
  return (
    <g>
      <rect x="0" y="0" width={w} height="34" rx="0" fill={T.surface} />
      <circle cx="20" cy="17" r="4.5" fill="rgba(0,0,0,0.12)" />
      <circle cx="36" cy="17" r="4.5" fill="rgba(0,0,0,0.12)" />
      <circle cx="52" cy="17" r="4.5" fill="rgba(0,0,0,0.12)" />
      <text x={w / 2} y="21" fontFamily={F} fontSize="11" fill={T.inkSub} textAnchor="middle">{label}</text>
    </g>
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
// v3.208.0 -- reported directly: no invented people. A real candidate
// card can't be shown here honestly -- that data is private, not public
// like a job posting, so there's no live source to pull from the way
// LiveJobsPreview does for jobs. Redrawn as a labeled diagram instead of
// a fake screenshot: every field now names what it IS ("A named,
// concrete accomplishment"), not a specific invented person, number, or
// sentence standing in for one. The shape stays -- score ring, why-they-
// matched, matched skills, stated gaps -- because that structure is real
// and true of every real card; only the specific, fabricated content
// underneath it is gone.
export function CandidateCardMockup({ style }: { style?: React.CSSProperties }) {
  const W = 760, H = 420;
  return (
    <svg {...a11y} aria-label="A diagram of an employer candidate card: a match score, why they matched, matched skills, and gaps stated plainly" viewBox={`0 0 ${W} ${H}`} style={{ ...svgBase, ...style }} preserveAspectRatio="xMidYMid meet">
      <rect x="0.5" y="0.5" width={W - 1} height={H - 1} rx="18" fill={T.paper} stroke={T.borderMd} />

      {/* head */}
      <circle cx="58" cy="58" r="22" fill="rgba(232,93,58,0.14)" stroke="rgba(232,93,58,0.3)" strokeDasharray="3 3" />
      <text x="92" y="52" fontFamily={FD} fontSize="15" fontWeight="700" fill={T.inkSub}>A candidate, anonymized</text>
      <text x="92" y="72" fontFamily={F} fontSize="11.5" fill={T.inkSub} opacity="0.75">Years, location and availability, from their profile</text>

      <circle cx="690" cy="58" r="30" fill="none" stroke="rgba(0,0,0,0.08)" strokeWidth="7" />
      <circle cx="690" cy="58" r="30" fill="none" stroke={T.ember} strokeWidth="7" strokeLinecap="round"
        strokeDasharray={`${2 * Math.PI * 30 * 0.7} ${2 * Math.PI * 30}`} transform="rotate(-90 690 58)" />
      <text x="690" y="63" textAnchor="middle" fontFamily={FD} fontSize="12" fontWeight="700" fill={T.inkSub}>Score</text>

      <line x1="28" y1="98" x2={W - 28} y2="98" stroke={T.border} />

      {/* why */}
      <text x="28" y="126" fontFamily={F} fontSize="10" fontWeight="700" fill={T.inkSub} letterSpacing="1">WHY AYN MATCHED THEM</text>
      {[
        'A named, concrete accomplishment from their real history.',
        'A specific skill, and how recently they used it.',
        'Evidence they have worked at the scale you are hiring for.',
      ].map((line, i) => (
        <text key={i} x="28" y={148 + i * 20} fontFamily={F} fontSize="12" fill={T.inkMid}>{line}</text>
      ))}

      {/* matched / gaps columns */}
      <rect x="28" y="214" width="336" height="112" rx="12" fill={T.surface} stroke={T.border} />
      <text x="46" y="238" fontFamily={F} fontSize="10" fontWeight="700" fill={T.inkSub} letterSpacing="1">FROM THEIR RESUME</text>
      {['Skill, claimed', 'Skill, inferred', 'Skill, claimed', 'Skill, inferred'].map((s, i) => {
        const x = 46 + (i % 2) * 150, y = 252 + Math.floor(i / 2) * 32;
        return (
          <g key={`${s}-${i}`}>
            <rect x={x} y={y} width="136" height="24" rx="12" fill="#fff" stroke={T.border} />
            <text x={x + 68} y={y + 16} textAnchor="middle" fontFamily={F} fontSize="11" fill={T.inkMid}>{s}</text>
          </g>
        );
      })}

      <rect x="396" y="214" width="336" height="112" rx="12" fill="#fff" stroke={T.border} />
      <text x="414" y="238" fontFamily={F} fontSize="10" fontWeight="700" fill={T.inkSub} letterSpacing="1">GAPS, STATED PLAINLY</text>
      {['Whatever the role needs that they have not shown', 'Named directly, never guessed at'].map((s, i) => (
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
      <text x="410" y="376" fontFamily={F} fontSize="11" fill={T.inkSub}>Email and phone stay private until they accept.</text>
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

// v3.206.0 -- BrowseJobsMockup deleted. It was a hand-authored SVG
// showing invented companies ("Acme," "Halcyon," "Northline," "Cobalt")
// and invented match percentages, in a product whose entire pitch is
// "nothing invented." Replaced by LiveJobsPreview.tsx, fed by AYN's own
// real, live job_postings data through the same anon-readable query
// TrustBento.tsx already proved out.

/* ── 7. The inbox: safe, screened, employer controlled ─────── */
export function InboxMockup({ style }: { style?: React.CSSProperties }) {
  const W = 760, H = 400;
  return (
    <svg {...a11y} aria-label="A message thread between an employer and a candidate, every message screened before delivery" viewBox={`0 0 ${W} ${H}`} style={{ ...svgBase, ...style }} preserveAspectRatio="xMidYMid meet">
      <rect x="0.5" y="0.5" width={W - 1} height={H - 1} rx="16" fill={T.paper} stroke={T.borderMd} />
      <clipPath id="mk7"><rect x="0" y="0" width={W} height={H} rx="16" /></clipPath>
      <g clipPath="url(#mk7)">
        <AppChrome label="Messages" w={W} />

        {/* two-way control row */}
        <rect x="26" y="50" width={W - 52} height="34" rx="10" fill={T.surface} stroke={T.border} />
        <circle cx="46" cy="67" r="8" fill={T.ember} />
        <circle cx="49" cy="67" r="5" fill="#fff" />
        <text x="64" y="71" fontFamily={F} fontSize="11" fill={T.inkMid}>Candidate can reply</text>
        <text x={W - 46} y="71" textAnchor="end" fontFamily={F} fontSize="10.5" fill={T.inkSub}>Off by default</text>

        {/* employer message */}
        <rect x="26" y="102" width="360" height="52" rx="14" fill={T.ink} />
        <text x="44" y="124" fontFamily={F} fontSize="11.5" fill="#fff">Great, when works for a quick intro</text>
        <text x="44" y="141" fontFamily={F} fontSize="11.5" fill="#fff">call this week?</text>

        {/* candidate reply */}
        <rect x={W - 386} y="168" width="360" height="52" rx="14" fill={T.surface} stroke={T.border} />
        <text x={W - 368} y="190" fontFamily={F} fontSize="11.5" fill={T.inkMid}>Thursday afternoon works well for me.</text>
        <text x={W - 368} y="207" fontFamily={F} fontSize="10.5" fill={T.inkSub}>Sent 2 minutes ago</text>

        {/* a blocked attempt, employer-visible only */}
        <rect x="26" y="234" width="420" height="46" rx="12" fill="none" stroke={T.ember} strokeDasharray="4 3" />
        <text x="44" y="253" fontFamily={F} fontSize="11" fontWeight="600" fill={T.emberDeep}>Message blocked before delivery</text>
        <text x="44" y="269" fontFamily={F} fontSize="10.5" fill={T.inkSub}>Contained a phone number. Only you can see this.</text>

        {/* composer */}
        <rect x="26" y="298" width={W - 52} height="46" rx="12" fill={T.surface} stroke={T.border} />
        <text x="44" y="326" fontFamily={F} fontSize="11.5" fill={T.inkSub}>Write a message…</text>
        <rect x={W - 122} y="308" width="70" height="26" rx="8" fill={T.ember} />
        <text x={W - 87} y="325" textAnchor="middle" fontFamily={F} fontSize="11" fontWeight="700" fill="#fff">Send</text>

        <text x="26" y="372" fontFamily={F} fontSize="11" fill={T.inkSub}>Every message is checked before it reaches either side.</text>
        <text x="26" y="390" fontFamily={F} fontSize="11" fill={T.inkSub}>No links, no phone numbers, nothing routed off AYN.</text>
      </g>
    </svg>
  );
}

/* ── 8. One resume, sent everywhere, versus one written for the job ──
   v3.225.0 -- WhyAynTab had no visual at all, plain text next to a huge
   canvas. This is a labeled diagram of the tab's own opening line
   (PAIN.job_seeker.lines[0], "Same resume, forty postings, no
   replies.") -- the same "diagram of the real mechanism, nothing
   invented" discipline CandidateCardMockup already established, not a
   new claim made up for the graphic. */
export function SameResumeMockup({ style }: { style?: React.CSSProperties }) {
  const W = 760, H = 280;
  const postings = [0, 1, 2, 3, 4];
  return (
    <svg {...a11y} aria-label="A diagram comparing one resume sent to five postings with no replies, against one resume written for a single job" viewBox={`0 0 ${W} ${H}`} style={{ ...svgBase, ...style }} preserveAspectRatio="xMidYMid meet">
      <rect x="0.5" y="0.5" width={W - 1} height={H - 1} rx="18" fill={T.paper} stroke={T.borderMd} />
      <line x1={W / 2} y1="28" x2={W / 2} y2={H - 28} stroke={T.border} />

      {/* left: the usual way */}
      <text x="34" y="42" fontFamily={F} fontSize="10" fontWeight="700" fill={T.inkSub} letterSpacing="1">THE USUAL WAY</text>
      <rect x="34" y="64" width="80" height="104" rx="10" fill={T.surface} stroke={T.border} />
      <rect x="46" y="80" width="44" height="6" rx="3" fill={T.inkSub} opacity="0.5" />
      {[96, 108, 120, 132].map((y) => (
        <rect key={y} x="46" y={y} width="56" height="5" rx="2.5" fill={T.inkSub} opacity="0.24" />
      ))}
      <line x1="122" y1="116" x2="166" y2="116" stroke={T.borderMd} strokeWidth="1.6" />
      <polygon points="164,110 170,116 164,122" fill={T.borderMd} />
      {postings.map((i) => {
        const x = 180 + i * 38;
        return (
          <g key={i}>
            <rect x={x} y="100" width="30" height="30" rx="7" fill="#fff" stroke={T.border} />
            <rect x={x + 9} y="114" width="12" height="3" rx="1.5" fill={T.inkSub} opacity="0.4" />
          </g>
        );
      })}
      <text x="34" y="202" fontFamily={FD} fontSize="14" fontWeight="700" fill={T.ink}>Same resume, forty postings.</text>
      <text x="34" y="222" fontFamily={F} fontSize="11.5" fill={T.inkSub}>No replies, and you never learn why.</text>

      {/* right: the AYN way */}
      <text x="424" y="42" fontFamily={F} fontSize="10" fontWeight="700" fill={T.emberDeep} letterSpacing="1">THE AYN WAY</text>
      <rect x="424" y="64" width="80" height="104" rx="10" fill={T.paper} stroke={T.ember} strokeWidth="1.4" />
      <rect x="436" y="80" width="44" height="6" rx="3" fill={T.ember} opacity="0.85" />
      {[96, 108, 120].map((y) => (
        <rect key={y} x="436" y={y} width="56" height="5" rx="2.5" fill={T.inkSub} opacity="0.3" />
      ))}
      <line x1="512" y1="116" x2="556" y2="116" stroke={T.ember} strokeWidth="1.8" />
      <polygon points="554,109 562,116 554,123" fill={T.ember} />
      <rect x="570" y="92" width="48" height="48" rx="12" fill={T.ember} />
      <path d="M582,117 L591,126 L607,104" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      <text x="424" y="202" fontFamily={FD} fontSize="14" fontWeight="700" fill={T.ink}>One resume, written for the job.</text>
      <text x="424" y="222" fontFamily={F} fontSize="11.5" fill={T.inkSub}>Matched to the posting, before you send it.</text>
    </svg>
  );
}
