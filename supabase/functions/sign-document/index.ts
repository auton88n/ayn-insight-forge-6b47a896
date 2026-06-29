// sign-document: anon-facing edge function that powers the contract and NDA
// signing pages. It is the ONLY path with write access to custom_orders and
// nda_agreements for unauthenticated visitors holding a signing_token.
import { createClient } from "npm:@supabase/supabase-js@2.45.0";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const BUCKET = "generated-files";
const SIGNED_URL_TTL = 60 * 60 * 24 * 365; // 1 year

type Doc = "order" | "nda";

interface Body {
  doc: Doc;
  token: string;
  action: "view" | "sign";
  party?: "admin" | "client";
  signatureBase64?: string;
}

const TABLE: Record<Doc, string> = {
  order: "custom_orders",
  nda: "nda_agreements",
};

function badRequest(msg: string, status = 400) {
  return new Response(JSON.stringify({ error: msg }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function dataUrlToBytes(dataUrl: string): { bytes: Uint8Array; mime: string } {
  const match = dataUrl.match(/^data:(image\/[a-zA-Z+]+);base64,(.+)$/);
  if (!match) throw new Error("Invalid signature data URL");
  const mime = match[1];
  const b64 = match[2];
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return { bytes, mime };
}

async function signedUrl(supabase: any, path: string | null) {
  if (!path) return null;
  const { data } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, SIGNED_URL_TTL);
  return data?.signedUrl ?? null;
}

// Rewrites the stored signature paths into fresh signed URLs so the page
// can render them without granting public bucket access.
async function withSignedUrls(supabase: any, row: any) {
  const out = { ...row };
  if (row.admin_signature_path) {
    out.admin_signature_url = await signedUrl(supabase, row.admin_signature_path);
  } else if (row.admin_signature_url && row.admin_signature_url.includes(`/${BUCKET}/`)) {
    // legacy public URL stored before the bucket was privatised; expose it as-is
    out.admin_signature_url = row.admin_signature_url;
  }
  if (row.client_signature_path) {
    out.client_signature_url = await signedUrl(supabase, row.client_signature_path);
  } else if (row.client_signature_url && row.client_signature_url.includes(`/${BUCKET}/`)) {
    out.client_signature_url = row.client_signature_url;
  }
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") return badRequest("Method not allowed", 405);

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return badRequest("Invalid JSON");
  }

  const { doc, token, action } = body;
  if (doc !== "order" && doc !== "nda") return badRequest("Invalid doc");
  if (!token || typeof token !== "string" || token.length < 10) {
    return badRequest("Invalid token");
  }
  if (action !== "view" && action !== "sign") return badRequest("Invalid action");

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const table = TABLE[doc];

  // Always fetch the row by token first.
  const { data: row, error: fetchErr } = await supabase
    .from(table)
    .select("*")
    .eq("signing_token", token)
    .maybeSingle();

  if (fetchErr) return badRequest(fetchErr.message, 500);
  if (!row) return badRequest("Document not found", 404);

  // VIEW: record first visit, return the row.
  if (action === "view") {
    if (!row.client_viewed_at) {
      const updates: Record<string, unknown> = {
        client_viewed_at: new Date().toISOString(),
      };
      if (row.status === "sent") updates.status = "viewed";
      await supabase.from(table).update(updates).eq("signing_token", token);
      Object.assign(row, updates);
    }
    const out = await withSignedUrls(supabase, row);
    return new Response(JSON.stringify({ row: out }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // SIGN
  const party = body.party;
  if (party !== "admin" && party !== "client") return badRequest("Invalid party");
  if (!body.signatureBase64) return badRequest("Missing signature");

  // Refuse to overwrite an existing signature.
  const alreadySigned =
    party === "admin" ? row.admin_signature_url : row.client_signature_url;
  if (alreadySigned) return badRequest("Already signed", 409);

  let bytes: Uint8Array;
  try {
    ({ bytes } = dataUrlToBytes(body.signatureBase64));
  } catch (e: any) {
    return badRequest(e.message ?? "Bad signature payload");
  }
  // Cap signature image size (~ 2MB raw)
  if (bytes.length > 2 * 1024 * 1024) return badRequest("Signature too large", 413);

  const prefix = doc === "order" ? "order" : "nda";
  const path = `signatures/${prefix}_${row.id}_${party}_${Date.now()}.png`;

  const { error: upErr } = await supabase.storage
    .from(BUCKET)
    .upload(path, bytes, { contentType: "image/png", upsert: false });
  if (upErr) return badRequest(upErr.message, 500);

  const { data: urlData } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, SIGNED_URL_TTL);
  const sigUrl = urlData?.signedUrl ?? null;

  const now = new Date().toISOString();
  const updates: Record<string, unknown> =
    party === "admin"
      ? { admin_signature_url: sigUrl, admin_signed_at: now }
      : { client_signature_url: sigUrl, client_signed_at: now, status: "signed" };

  const { error: updErr } = await supabase
    .from(table)
    .update(updates)
    .eq("signing_token", token);
  if (updErr) return badRequest(updErr.message, 500);

  const merged = { ...row, ...updates };
  const out = await withSignedUrls(supabase, merged);
  return new Response(JSON.stringify({ row: out }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
