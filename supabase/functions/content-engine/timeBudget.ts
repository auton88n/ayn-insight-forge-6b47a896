// The self-hosted edge supervisor kills requests at 60s. Reserve time to
// persist/report outcomes instead of allowing nested AI retries past that cap.
export function aiTimeout(deadline: number, now = Date.now()): number {
  const remaining = deadline - now - 2_000;
  if (remaining < 1_000) throw new Error("Article generation time budget exhausted; previous report retained");
  return Math.min(20_000, remaining);
}
