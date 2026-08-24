/**
 * landingContent -- the seeker/employer copy records shared between
 * LandingSections.tsx (which still owns the employer route's single-page
 * layout) and HomeTabs.tsx (the seeker Home page's own explanation tabs,
 * v3.216.0). One source for this content so a copy edit never has to be
 * made twice.
 */
import type { Audience } from '@/lib/landingAudience';
import { Target, ShieldCheck, Radar, Search, FileText, MessagesSquare, Eye } from 'lucide-react';

export const PAIN: Record<Audience, { eyebrow: string; title: string; lead: string; who: string; lines: string[] }> = {
  job_seeker: {
    eyebrow: 'The problem',
    title: 'You are guessing what they want',
    lead: 'The posting is written for everybody. Your resume is written for nobody.',
    who: 'If you are applying',
    lines: [
      'Same resume, forty postings, no replies.',
      'Rewriting it properly costs you an evening.',
      'You never learn which line lost you the interview.',
      'The company that would want you does not know you exist.',
    ],
  },
  employer: {
    eyebrow: 'The problem',
    title: 'You are guessing who can actually do it',
    lead: 'A resume is a claim. Hiring needs the evidence behind it.',
    who: 'If you are hiring',
    lines: [
      'A flooded inbox of resumes, most of them wrong.',
      'The right people never see your ad.',
      'Confidence on paper proves nothing.',
      'Or you hand it to an agency and pay a cut of the salary to skip the pile.',
    ],
  },
};

export const HEAD_TO_HEAD: Record<Audience, { themLabel: string; rows: { them: string; us: string }[] }> = {
  job_seeker: {
    themLabel: 'Other job boards',
    rows: [
      { them: "Listings pulled in from anywhere, some already filled, some never real to begin with.", us: "Sourced straight from the company's own career page, pruned within 3 days if it's not reconfirmed live." },
      { them: 'One resume, sent to every posting, competing with hundreds of others.', us: 'A resume rewritten for the one job in front of you, from your real experience.' },
      { them: 'No idea what you are missing until the rejection arrives.', us: 'See exactly what matches and what is missing before you apply.' },
      { them: 'Recruiters skim keyword stuffed resumes for seconds.', us: 'Employers see an evidence based profile, gaps stated plainly.' },
      { them: 'Free to browse, but paid tiers push sponsored listings ahead of real ones.', us: 'Free to search, browse, and check your resume against a job. No account needed.' },
    ],
  },
  employer: {
    themLabel: 'A recruiter or staffing agency',
    rows: [
      { them: "A cut of the new hire's first year salary, often 15 to 25 percent.", us: 'One flat monthly rate, no matter how many people you hire.' },
      { them: 'Weeks of back and forth before you see a real candidate.', us: 'A shortlist of three people to read, in minutes.' },
      { them: 'A pile of resumes to sort through yourself.', us: 'Each name comes with its evidence and its gaps already named.' },
      { them: 'Confidence on paper, unverified until the interview.', us: "A short assessment built from that person's own claims, before you commit." },
    ],
  },
};

// The seeker-side contrast is against mass-apply/auto-apply bots (LazyApply,
// Sonara and the like).
export const AI_CONTRAST = [
  'Reads the actual job description, not a keyword list',
  'Writes from your real experience. Nothing invented, nothing generic',
  'You submit every application yourself. It never auto-applies for you',
];

// The seeker product is two things, not one: applying (a tailored resume for
// a job they found) and discovery (a profile employers can find them
// through).
export const DISCOVER_CHIPS = [
  { icon: Radar, text: 'One toggle, in your profile' },
  { icon: Eye, text: 'Employers see evidence, never a resume pile' },
  { icon: ShieldCheck, text: 'Your name and contact stay private until you accept' },
];

export const SEEKER_TILES = [
  {
    span: 'lp-span-6',
    icon: Search,
    title: 'The posting, read in full',
    desc: 'Browse real postings or add your own. See where you stand out of 10.',
    meta: ['Browse jobs', 'Add a link', 'Paste the text'],
  },
  {
    span: 'lp-span-3',
    icon: FileText,
    title: 'A resume for that one job',
    desc: 'Your real experience, in the language of the posting.',
    meta: ['PDF', 'DOCX', 'One page', 'Kept with the job'],
  },
  {
    span: 'lp-span-3',
    icon: MessagesSquare,
    title: 'A cover letter that names things',
    desc: 'The company, the role, the reason. No template sentences.',
    meta: ['Named company', 'Grounded in the posting'],
  },
  {
    span: 'lp-span-2',
    icon: Radar,
    title: 'Found while you sleep',
    desc: 'Turn on discovery. Employers see the evidence first, you decide who gets your contact.',
  },
  {
    span: 'lp-span-2',
    icon: Target,
    title: 'The honest gap list',
    desc: 'Matched, missing and nice to have, before a word is written.',
  },
  {
    span: 'lp-span-2',
    icon: ShieldCheck,
    title: 'Nothing invented',
    desc: 'No skill, number or title that is not already yours.',
  },
];

export const SEEKER_STEPS = [
  {
    icon: Search,
    title: 'Reads the posting for you',
    desc: 'The real listing, in full, not a summary or a keyword scrape.',
  },
  {
    icon: Target,
    title: 'Scores your real fit',
    desc: 'What matches, what is missing, before a word is written.',
  },
  {
    icon: FileText,
    title: 'Writes for that one job',
    desc: 'A resume and cover letter from your real experience, in the posting’s own language.',
  },
  {
    icon: Radar,
    title: 'Keeps working after you apply',
    desc: 'Turn on discovery and employers searching for your background find you too.',
  },
];

export const TRUST: Record<Audience, { title: string; lead: string; chips: string[] }> = {
  job_seeker: {
    title: 'It shows its work',
    lead: 'You see the posting it read, the resume it used and what it inferred.',
    chips: [
      'Never auto-applies',
      'Grounded in the posting',
      'Nothing invented',
      'Your details stay yours',
    ],
  },
  employer: {
    title: 'Every claim has a source',
    lead: 'Claimed and inferred stay apart, and the gaps are named out loud.',
    chips: [
      'Skills by provenance',
      'Gaps stated plainly',
      'Server timed assessments',
      'Contact on accept',
    ],
  },
};

export const FAQS: Record<Audience, { q: string; a: string }[]> = {
  job_seeker: [
    {
      q: 'What does AYN do for me?',
      a: 'It reads the job description in full and scores you against it. Then it writes a one page resume and a cover letter from your own history.',
    },
    {
      q: 'Where do the jobs come from?',
      a: 'Real company career pages, sourced automatically and refreshed every two hours, never LinkedIn or Indeed. You can also add any posting yourself, by link or by pasting the text.',
    },
    {
      q: 'Does it apply for me?',
      a: 'No. It writes the resume and the cover letter. You review them and submit the application yourself, on the company’s own site.',
    },
    {
      q: 'How do employers find me?',
      a: 'Turn on discovery in your Profile. Employers searching for people with your background can then see your evidence based profile and reach out with a proposal. Nothing about you opens until you accept.',
    },
    {
      q: 'Can employers see my name and email?',
      a: 'Not until you accept their proposal. Before that they see your profile and your match evidence only.',
    },
    {
      q: 'Is it really a real employer messaging me?',
      a: 'Yes. Every employer account is checked at signup: their email has to match their company’s own website domain, and personal email addresses are refused outright. You can message back and forth right in AYN, never through your personal email or phone, and every message is screened before it reaches you.',
    },
    {
      q: 'Will it invent experience?',
      a: 'No. Anything missing is shown to you as a gap instead.',
    },
    {
      q: 'Is it free to try?',
      a: 'Yes, free to start and no credit card needed.',
    },
  ],
  employer: [
    {
      q: 'Where do the candidates come from?',
      a: 'People who built a profile here and turned on discovery. Nobody is scraped.',
    },
    {
      q: 'How does this compare to a recruiter?',
      a: 'There is no placement fee. You pay a flat monthly rate no matter how many people you hire, where a staffing agency typically takes a cut of the new hire’s first year pay just for the introduction.',
    },
    {
      q: 'How does the matching work?',
      a: 'A hard filter on your must have skills, then semantic recall, then one grounded rerank. You see the evidence and the gaps behind every name.',
    },
    {
      q: 'What is a verification assessment?',
      a: 'A short set of questions built from that candidate’s background and your role. You see the score, the observations and the time spent per answer.',
    },
    {
      q: 'When do I get contact details?',
      a: 'Only when the candidate accepts. Everything before that is anonymous, enforced on the server.',
    },
    {
      q: 'Can I message everyone at once?',
      a: 'No. One open proposal per candidate, and none for thirty days after a decline.',
    },
    {
      q: 'How do I actually talk to a candidate?',
      a: 'Once you send a proposal, a real inbox opens on it right inside AYN. It stays one way until you choose to open it up, and every message either side sends is screened before it’s delivered, no links, no phone numbers, nothing routed off the platform.',
    },
    {
      q: 'How do I get access?',
      a: 'Request employer access. We onboard companies one at a time, starting with your company profile.',
    },
  ],
};
