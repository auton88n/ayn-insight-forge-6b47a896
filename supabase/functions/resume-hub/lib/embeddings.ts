// v3.131.0 — stage 7 of the resume-hub reorganization: embeddings.
// embedText calls the AI gateway for a real 768-dim vector, falling back to
// a deterministic hash-based embedding (deterministicEmbed) on any failure
// so a candidate/JD is never left without a comparable vector — callers
// must check the returned model to know which kind they got, since a real
// and a hash vector must never be cosine-compared against each other.
// semanticGapRecheck is the second-pass "is this really missing" check
// used by match/tailor/cover_letter. Pure code movement, zero logic changes.
import type { GapAnalysis, SectionBundle } from "../../_shared/tailoring.ts";
import { applySemanticRecheck } from "../../_shared/tailoring.ts";

const EMBED_DIMS = 768;
const REAL_EMBED_MODEL = "openai/text-embedding-3-small";
export const FALLBACK_EMBED_MODEL = "deterministic-v1";
// v3.159.0 — self-hosted has no LOVABLE_API_KEY of its own (see ai.ts's
// identical AI_RELAY_URL comment). This call path was never wired to the
// relay at all, so every self-hosted embedding call silently fell back to
// the hash embedding — confirmed live, every candidate_index row on
// self-hosted carried 'deterministic-v1', degrading semanticGapRecheck and
// employer_match's vector recall with no visible error. ai-relay now
// routes on this /embeddings suffix to Lovable's real embeddings endpoint.
const AI_RELAY_URL = Deno.env.get("AI_RELAY_URL");
const EMBED_ENDPOINT = AI_RELAY_URL ? `${AI_RELAY_URL}/embeddings` : "https://ai.gateway.lovable.dev/v1/embeddings";

function tokenizeForEmbed(text: string): string[] {
  return (text || "").toLowerCase().match(/[a-z0-9+.#-]{2,}/g) || [];
}

async function hashToken(tok: string): Promise<number> {
  const bytes = new TextEncoder().encode(tok);
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-1", bytes));
  return ((digest[0] << 24) | (digest[1] << 16) | (digest[2] << 8) | digest[3]) >>> 0;
}

async function deterministicEmbed(text: string): Promise<number[]> {
  const v = new Array<number>(EMBED_DIMS).fill(0);
  for (const tok of tokenizeForEmbed(text)) {
    const h = await hashToken(tok);
    const dim = h % EMBED_DIMS;
    const sign = ((h >>> 16) & 1) === 0 ? 1 : -1;
    v[dim] += sign;
  }
  let norm = 0;
  for (const x of v) norm += x * x;
  norm = Math.sqrt(norm) || 1;
  for (let i = 0; i < v.length; i++) v[i] = v[i] / norm;
  return v;
}

/**
 * Call the AI gateway embeddings endpoint with a 768-dim OpenAI model
 * (text-embedding-3-small supports the `dimensions` param so we don't
 * need to change the vector(768) column). On any failure — missing key,
 * network, non-2xx, malformed body — fall back to deterministicEmbed
 * and tag the row with 'deterministic-v1' so employer_match knows not
 * to mix these vectors with real ones.
 */
export async function embedText(text: string): Promise<{ vector: number[]; model: string }> {
  const apiKey = AI_RELAY_URL ? Deno.env.get("RELAY_SECRET") : Deno.env.get("LOVABLE_API_KEY");
  const input = (text || "").slice(0, 8000);
  if (!apiKey || !input) {
    console.log(`[embedText] fallback path (${apiKey ? "empty input" : AI_RELAY_URL ? "no RELAY_SECRET" : "no LOVABLE_API_KEY"})`);
    return { vector: await deterministicEmbed(input), model: FALLBACK_EMBED_MODEL };
  }
  try {
    const r = await fetch(EMBED_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: REAL_EMBED_MODEL,
        input,
        dimensions: EMBED_DIMS,
      }),
    });
    if (!r.ok) {
      const body = await r.text().catch(() => "");
      console.log(`[embedText] fallback path (gateway ${r.status}: ${body.slice(0, 200)})`);
      return { vector: await deterministicEmbed(input), model: FALLBACK_EMBED_MODEL };
    }
    const data = await r.json() as { data?: Array<{ embedding?: number[] }> };
    const vec = data?.data?.[0]?.embedding;
    if (!Array.isArray(vec) || vec.length !== EMBED_DIMS) {
      console.log(`[embedText] fallback path (bad response shape, len=${vec?.length ?? "n/a"})`);
      return { vector: await deterministicEmbed(input), model: FALLBACK_EMBED_MODEL };
    }
    console.log(`[embedText] real path (${REAL_EMBED_MODEL}, ${vec.length}d)`);
    return { vector: vec, model: REAL_EMBED_MODEL };
  } catch (e) {
    console.log(`[embedText] fallback path (exception: ${(e as Error).message})`);
    return { vector: await deterministicEmbed(input), model: FALLBACK_EMBED_MODEL };
  }
}

/**
 * v3.124.0 — real semantic gap-matching. A first version tried the
 * embeddings endpoint's array-input form to do a whole batch in one
 * request; live testing showed it silently falling back to the hash
 * embedding every time (the gateway's embeddings route does not accept
 * `input` as an array the way raw OpenAI's does), so the "semantic" check
 * was running on vectors with no real semantic meaning and never promoting
 * anything. Fixed by fanning out to embedText — proven working in this
 * project already (real candidate_index rows carry embedding_model
 * 'openai/text-embedding-3-small') — one call per text, run concurrently.
 * Model is uniform across the whole result: if even one call falls back,
 * the caller (semanticGapRecheck) already treats the batch as "no real
 * embeddings available" and skips the recheck rather than compare a mix
 * of real and hashed vectors.
 */
async function embedBatch(texts: string[]): Promise<{ vectors: number[][]; model: string }> {
  const results = await Promise.all(texts.map((t) => embedText(t)));
  const model = results.every((r) => r.model === REAL_EMBED_MODEL) ? REAL_EMBED_MODEL : FALLBACK_EMBED_MODEL;
  return { vectors: results.map((r) => r.vector), model };
}

/**
 * Second-pass semantic check on whatever computeGap called "missing":
 * one real embeddings call (skipped entirely if nothing is missing, so a
 * clean match costs nothing extra) comparing each missing requirement
 * against the candidate's own skills and bullets. Only ever promotes a
 * false "missing" to "matched" — see applySemanticRecheck's own doc
 * comment. Silently returns the original gap unchanged if the real
 * embedding model isn't available (the hash fallback has no semantic
 * meaning, so running cosine similarity on it would be noise, not signal).
 */
export async function semanticGapRecheck(gap: GapAnalysis, bundle: SectionBundle): Promise<GapAnalysis> {
  // Bare 1-2 word tool/skill names never get promoted (see
  // applySemanticRecheck's own comment for why: they scored a confirmed
  // false positive higher than a confirmed true one, live-tested) — skip
  // embedding them at all rather than spend a call on something that can
  // never change the result.
  const missingReqs = gap.requirements.filter((r) => r.status === "missing" && r.text.trim().split(/\s+/).length >= 3).slice(0, 12);
  if (!missingReqs.length) return gap;
  // Capped at 20: embedBatch now fans out to one real HTTP call per text
  // (see its own comment), so this bounds total concurrent requests to
  // roughly 32 worst case, not an unbounded fan-out.
  const chunks = Array.from(new Set([
    ...bundle.sections.skills,
    ...bundle.sections.work.flatMap((w) => (Array.isArray(w.bullets) ? (w.bullets as unknown[]) : []).map(String)),
  ])).filter((c) => c && c.length >= 3).slice(0, 20);
  if (!chunks.length) return gap;

  const missingTexts = missingReqs.map((r) => r.text);
  const { vectors, model } = await embedBatch([...missingTexts, ...chunks]);
  if (model !== REAL_EMBED_MODEL) return gap; // hash fallback carries no real meaning to compare

  const missingEmbeddings = missingTexts.map((text, i) => ({ text, vector: vectors[i] }));
  const chunkEmbeddings = chunks.map((text, i) => ({ text, vector: vectors[missingTexts.length + i] }));
  return applySemanticRecheck(gap, missingEmbeddings, chunkEmbeddings);
}
