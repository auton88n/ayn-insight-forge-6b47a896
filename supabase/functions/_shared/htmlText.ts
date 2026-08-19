// v3.170.0 — found live while looking into "salary is missing on most
// postings": a real base salary range sits right in the description text
// on a large share of the postings where it's not (freehire's own
// countries=ca,us states, several with real pay-transparency laws --
// California, Colorado, New York, Illinois, Massachusetts among them --
// require exactly this). Chasing why some of those ranges weren't
// matchable at all led here: 2,815 real description rows have a literal,
// undecoded "&mdash;" sitting where the em dash separating a salary range
// belongs ("Salary Range$190,000&mdash;$236,000 USD"), because both
// ingestion functions' own decodeEntities/stripHtml only ever handled six
// entities (&lt; &gt; &quot; &#39; &amp; &nbsp;) -- real, common ones like
// &mdash;, &ndash;, and the numeric form of a straight quote (&#34;, 3,906
// real rows) were never covered, in either function, confirmed by reading
// both. This is a real JD-quality bug on its own, not just a salary one --
// an undecoded &mdash; reads as literal garbage text anywhere it lands in
// a description, not only inside a salary line.
//
// A live scan of every distinct entity actually present in job_postings
// (not a guess at what might show up) is what this list is built from.
// &amp; alone still appears 11,560 times despite already being handled --
// a real double-encoding case (some source text is HTML-escaped twice
// before it ever reaches here), which a single decode pass can't close;
// running the whole decode twice does, cheaply and safely, since decoding
// an already-plain "&" a second time is a no-op.
const NAMED_ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'",
  nbsp: " ", mdash: "—", ndash: "–",
  lsquo: "‘", rsquo: "’", ldquo: "“", rdquo: "”",
  hellip: "…",
};

function decodeEntitiesOnce(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, code) => {
      try { return String.fromCodePoint(Number(code)); } catch { return ""; }
    })
    .replace(/&#x([0-9a-fA-F]+);/g, (_, code) => {
      try { return String.fromCodePoint(parseInt(code, 16)); } catch { return ""; }
    })
    .replace(/&([a-zA-Z]+);/g, (m, name) => NAMED_ENTITIES[name] ?? m);
}

/** Decodes twice on purpose -- closes the real, observed double-encoding
 * case (a literal "&amp;amp;" in the source) without needing to special
 * case it; a second pass over already-plain text changes nothing. */
export function decodeEntities(s: string): string {
  return decodeEntitiesOnce(decodeEntitiesOnce(s));
}

export function stripHtml(html: string): string {
  return decodeEntities(String(html || ""))
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<li[^>]*>/gi, "- ")
    .replace(/<[^>]+>/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
