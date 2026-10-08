// When an action is refused because the person has run out of credits, the page needs to offer a way
// to buy more, not just show an error. The API layer announces it here and one dialog (mounted once in
// the signed-in shell) listens, so every paid action gets the same prompt without each screen wiring it.
export const OUT_OF_CREDITS_EVENT = "ayn:out-of-credits";

export function notifyOutOfCredits(message: string): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(OUT_OF_CREDITS_EVENT, { detail: { message } }));
}
