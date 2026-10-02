// Keep numeric checks independent of the Deno handler so they can be tested
// without calling the AI relay or a production database.
const FIGURE_RE = /(?:[$€£¥]\s?\d[\d,.]*(?:\s?(?:k|m|b|bn|million|billion)\b)?|\d[\d,.]*\s?%|\b(?:19|20)\d{2}\b|\b\d[\d,.]*\s?(?:k|m|x|\+)?\b)/gi;

export function extractFigures(text: string): string[] {
  const raw = String(text || "").match(FIGURE_RE) || [];
  const out = new Set<string>();
  for (const f of raw) {
    let t = f.trim().toLowerCase().replace(/\s+/g, "");
    t = t.replace(/^[$€£¥]/, "");
    t = t.replace(/[.,]+$/, "");
    t = t.replace(/(?<=\d),(?=\d)/g, "");
    if (!t || /^[.,]+$/.test(t)) continue;
    out.add(t);
  }
  return Array.from(out);
}

export function invalidFigures(generatedText: string, sourceData: unknown): string[] {
  const source = JSON.stringify(sourceData).toLowerCase().replace(/\s+/g, "");
  return extractFigures(generatedText).filter((figure) => {
    // A substring check wrongly accepts "20" as grounded by a source value
    // of 120, or "20" by 20.5. Match an entire numeric token instead.
    const escaped = figure.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return !new RegExp(`(?<![\\d.])${escaped}(?![\\d.])`).test(source);
  });
}
