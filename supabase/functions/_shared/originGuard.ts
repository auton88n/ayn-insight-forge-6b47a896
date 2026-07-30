const ALLOWED_ORIGINS = [
  'https://aynn.io',
  'https://www.aynn.io',
  'https://ayn-insight-forge.lovable.app',
  'http://localhost:5173',
  'http://localhost:8080',
];

function isAllowedOrigin(origin: string): boolean {
  if (ALLOWED_ORIGINS.includes(origin)) return true;
  // Allow Lovable preview/project origins
  if (/^https:\/\/[a-z0-9-]+\.lovableproject\.com$/.test(origin)) return true;
  if (/^https:\/\/[a-z0-9-]+--[a-z0-9-]+\.lovable\.app$/.test(origin)) return true;
  return false;
}

/**
 * Validates the Origin header against the whitelist.
 * Allows requests with NO Origin (server-to-server, Postman).
 * Blocks requests where Origin IS present but doesn't match.
 */
export function validateOrigin(req: Request): boolean {
  const origin = req.headers.get('Origin');
  if (!origin) return true; // No origin = not a browser CSRF
  return isAllowedOrigin(origin);
}

/**
 * Returns the appropriate Access-Control-Allow-Origin value.
 * If the request origin is allowed, echo it back; otherwise use the primary origin.
 */
export function getAllowedOrigin(req: Request): string {
  const origin = req.headers.get('Origin') || '';
  return isAllowedOrigin(origin) ? origin : ALLOWED_ORIGINS[0];
}

export { ALLOWED_ORIGINS };
