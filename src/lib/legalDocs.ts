// v3.32.0 — the legal document registry.
//
// Every legal document lives as markdown in src/content/legal/<slug>.md and is
// rendered by one component. Nothing here paraphrases a document: the title in
// this registry is the label we use in navigation, and the description is our
// own one line pointer on /legal. The text of a document is only ever what is
// in its markdown file.
//
// Amending a document means editing its markdown file and the version and
// effective date at the top of it. No component changes.

export interface LegalDoc {
  slug: string;
  /** Route this document is served at. /terms and /privacy predate the frame. */
  path: string;
  /** Navigation label. Also used to turn a cross reference into a link. */
  title: string;
  /** Our own one line pointer, shown on /legal only. */
  description: string;
  /** Linked from the footer of every public page. */
  inFooter: boolean;
  /** Other names a document is referred to by inside the other documents. */
  aliases?: string[];
}

export const LEGAL_DOCS: LegalDoc[] = [
  {
    slug: 'terms',
    path: '/terms',
    title: 'Terms of Service',
    description: 'The agreement between you and AYN for using the product.',
    inFooter: true,
    aliases: ['Terms of Use', 'the Terms'],
  },
  {
    slug: 'privacy',
    path: '/privacy',
    title: 'Privacy Policy',
    description: 'What we collect, why, how long we keep it and your rights.',
    inFooter: true,
  },
  {
    slug: 'cookies',
    path: '/cookies',
    title: 'Cookie Policy',
    description: 'The cookies we set, what each one does and how to change your choice.',
    inFooter: true,
    aliases: ['Cookie Notice'],
  },
  {
    slug: 'security',
    path: '/security',
    title: 'Security Overview',
    description: 'How your data is protected, and who can reach it.',
    inFooter: true,
  },
  {
    slug: 'subprocessors',
    path: '/subprocessors',
    title: 'Subprocessors',
    description: 'The third parties that process data on our behalf, and what for.',
    inFooter: true,
    aliases: ['Subprocessor List', 'Sub-processors'],
  },
  {
    slug: 'dpa',
    path: '/dpa',
    title: 'Data Processing Addendum',
    description: 'For employers who need a processor agreement on file.',
    inFooter: false,
    aliases: ['DPA'],
  },
  {
    slug: 'sla',
    path: '/sla',
    title: 'Service Level Agreement',
    description: 'Availability commitment, support response times and credits.',
    inFooter: false,
    aliases: ['SLA'],
  },
  {
    slug: 'copyright',
    path: '/copyright',
    title: 'Copyright Policy',
    description: 'How to report infringing content and how we respond.',
    inFooter: false,
    aliases: ['DMCA Policy', 'Copyright and DMCA Policy'],
  },
];

export function docBySlug(slug: string): LegalDoc | undefined {
  return LEGAL_DOCS.find((d) => d.slug === slug);
}

// Raw markdown, bundled at build time. Keyed by slug.
const RAW = import.meta.glob('/src/content/legal/*.md', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

export function rawMarkdown(slug: string): string | null {
  const key = `/src/content/legal/${slug}.md`;
  return typeof RAW[key] === 'string' ? RAW[key] : null;
}

export interface DocMeta {
  version: string | null;
  effective: string | null;
  /** Some documents state only a last updated date and no effective date. */
  updated: string | null;
  /** The document title as written in its own first heading. */
  heading: string | null;
  /** The markdown body with the metadata header removed. */
  body: string;
}


/**
 * Reads the version and the effective date from the top of a document.
 *
 * Two shapes are accepted so a lawyer can edit either way:
 *   1. YAML style frontmatter delimited by --- with version: and effective:
 *   2. Plain lines near the top, for example
 *      "Version 1.0" and "Effective 1 August 2026"
 *
 * Nothing is invented. When a document states neither, the header simply does
 * not show a version.
 */
export function parseDocMeta(md: string): DocMeta {
  let body = md.replace(/^\uFEFF/, '');
  let version: string | null = null;
  let effective: string | null = null;
  let updated: string | null = null;

  const fm = body.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (fm) {
    for (const line of fm[1].split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_-]*)\s*:\s*(.+?)\s*$/);
      if (!m) continue;
      const k = m[1].toLowerCase();
      const v = m[2].replace(/^["']|["']$/g, '').trim();
      if (k === 'version') version = v;
      if (k === 'effective' || k === 'effective_date' || k === 'effectivedate') effective = v;
      if (k === 'updated' || k === 'last_updated' || k === 'lastupdated') updated = v;
    }
    body = body.slice(fm[0].length);
  }

  const head = body.split(/\r?\n/).slice(0, 20).join('\n');
  if (!version) {
    const m = head.match(/\*{0,2}Version\*{0,2}\s*[:\u2013]?\s*([0-9][0-9A-Za-z.\-]*)/i);
    if (m) version = m[1];
  }
  if (!effective) {
    const m = head.match(/\*{0,2}Effective(?:\s+(?:date|from|as of))?\*{0,2}\s*:?\s*([^\n*|]+)/i);
    if (m) effective = m[1].trim().replace(/[.,;]\s*$/, '');
  }
  // Four of the documents state only when they were last updated. Read that
  // rather than leaving the header with a version and no date.
  if (!updated) {
    const m = head.match(/\*{0,2}Last\s+updated\*{0,2}\s*:?\s*([^\n*|]+)/i);
    if (m) updated = m[1].trim().replace(/[.,;]\s*$/, '');
  }

  const h = body.match(/^\s*#\s+(.+)$/m);
  const heading = h ? h[1].trim() : null;

  return { version, effective, updated, heading, body };

}

/** Stable anchor id for a heading, so a clause can be linked to directly. */
export function slugifyHeading(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s.-]/g, '')
    .trim()
    .replace(/[\s.]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

export interface TocItem {
  id: string;
  text: string;
  level: number;
}

/** Collects the h2 and h3 headings, skipping anything inside a fenced block. */
export function buildToc(body: string): TocItem[] {
  const out: TocItem[] = [];
  let fenced = false;
  for (const line of body.split(/\r?\n/)) {
    if (/^\s*```/.test(line)) { fenced = !fenced; continue; }
    if (fenced) continue;
    const m = line.match(/^(#{2,3})\s+(.+?)\s*#*\s*$/);
    if (!m) continue;
    const text = m[2].replace(/\*\*/g, '').replace(/`/g, '').trim();
    out.push({ id: slugifyHeading(text), text, level: m[1].length });
  }
  return out;
}

/**
 * Turns a reference to another legal document into a working link.
 *
 * This changes no wording. It only wraps an existing phrase, and only when
 * that phrase is not already inside a link, not inside a heading and not the
 * document's own title.
 */
export function linkCrossReferences(body: string, selfSlug: string): string {
  const targets: Array<{ phrase: string; path: string }> = [];
  for (const d of LEGAL_DOCS) {
    if (d.slug === selfSlug) continue;
    targets.push({ phrase: d.title, path: d.path });
    for (const a of d.aliases || []) targets.push({ phrase: a, path: d.path });
  }
  targets.sort((a, b) => b.phrase.length - a.phrase.length);

  const lines = body.split(/\r?\n/);
  let fenced = false;
  return lines
    .map((line) => {
      if (/^\s*```/.test(line)) { fenced = !fenced; return line; }
      if (fenced || /^\s{0,3}#/.test(line)) return line;
      let out = line;
      for (const t of targets) {
        const re = new RegExp(`(?<![\\[\\(\\w])${escapeRe(t.phrase)}(?![\\w\\]\\(])`, 'g');
        // Skip a line that already links this document.
        if (out.includes(`](${t.path})`)) continue;
        let replaced = false;
        out = out.replace(re, (match, offset: number) => {
          if (replaced) return match;
          if (insideLink(out, offset)) return match;
          replaced = true;
          return `[${match}](${t.path})`;
        });
      }
      return out;
    })
    .join('\n');
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function insideLink(line: string, index: number): boolean {
  const before = line.slice(0, index);
  const openBracket = before.lastIndexOf('[');
  if (openBracket === -1) return false;
  const closeBracket = before.lastIndexOf(']');
  return openBracket > closeBracket;
}
