export function permanentEmailError(error: string): boolean {
  const status = Number(error.match(/^(\d{3}):/)?.[1]);
  return status >= 400 && status < 500 && ![408, 409, 425, 429].includes(status);
}

export function retryAt(attempt: number, now = Date.now()): string {
  return new Date(now + [5, 15, 60][Math.max(0, Math.min(attempt - 1, 2))] * 60_000).toISOString();
}

// Resend retains deduplication keys for 24h. Stop before expiry; an admin must
// investigate uncertain sends instead of silently issuing a fresh duplicate.
export function sendWindowExpired(startedAt: string | null, now = Date.now()): boolean {
  return !!startedAt && now - Date.parse(startedAt) >= 23 * 60 * 60_000;
}
