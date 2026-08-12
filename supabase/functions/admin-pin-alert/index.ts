import { Resend } from 'https://esm.sh/resend@2.0.0';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };

// v3.132.0 — pulled into the repo for the first time (previously lived only
// on the server, no local source, which is exactly why it was invisible to
// the v3.85.0 domain-cutover sweep, that one only ever grepped tracked
// files). Both the sender and the recipient were still on the retired
// pre-rebrand domain — Resend's own "domain is not verified" error
// (documented elsewhere in this app's history as leaking through this
// function) was likely this exact bug: the old domain was never
// re-verified with Resend after the move, so this alert has probably been
// silently failing to send since the migration. Domain swapped to the
// current one (confirmed live and verified — every other email this app
// sends already goes out from that domain without issue).
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  try {
    const resend = new Resend(Deno.env.get('RESEND_API_KEY')!);
    const time = new Date().toUTCString();
    const ip = req.headers.get('cf-connecting-ip') || req.headers.get('x-forwarded-for') || 'Unknown';

    const { error } = await resend.emails.send({
      from: 'AYN Security <info@ayn.careers>',
      to: ['ghazi@ayn.careers'],
      subject: '⚠️ Admin Panel — Failed PIN Attempts',
      html: `
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px">
          <div style="background:#dc2626;color:#fff;padding:12px 16px;border-radius:8px;margin-bottom:24px;font-weight:bold">
            ⚠️ Security Alert
          </div>
          <p style="color:#111;font-size:15px;margin:0 0 12px">Someone entered the wrong PIN <strong>3 times</strong> on your admin panel.</p>
          <p style="color:#111;font-size:15px;margin:0 0 20px">The panel has been <strong>locked for 5 minutes</strong>.</p>
          <table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:24px">
            <tr style="background:#f9fafb">
              <td style="padding:8px 12px;color:#6b7280;border:1px solid #e5e7eb">Time</td>
              <td style="padding:8px 12px;color:#111;border:1px solid #e5e7eb">${time}</td>
            </tr>
            <tr>
              <td style="padding:8px 12px;color:#6b7280;border:1px solid #e5e7eb">IP Address</td>
              <td style="padding:8px 12px;color:#111;border:1px solid #e5e7eb">${ip}</td>
            </tr>
          </table>
          <p style="color:#6b7280;font-size:13px">If this was you testing, ignore this. If not — change your PIN immediately.</p>
          <div style="margin-top:24px;padding-top:16px;border-top:1px solid #e5e7eb;color:#9ca3af;font-size:12px">AYN AI &bull; ayn.careers</div>
        </div>
      `
    });

    if (error) {
      console.error('[admin-pin-alert] Resend error:', error);
      throw new Error(error.message);
    }

    console.log('[admin-pin-alert] Email sent successfully to ghazi@ayn.careers');
    return new Response(JSON.stringify({ success: true }), { headers: { ...cors, 'Content-Type': 'application/json' } });
  } catch (e: any) {
    console.error('[admin-pin-alert] Failed:', e.message);
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: cors });
  }
});
