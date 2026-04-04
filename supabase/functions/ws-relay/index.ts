import { corsHeaders as getCorsHeadersFn } from '../_shared/cors.ts';

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: getCorsHeadersFn(req),
    });
  }

  // Must be a WebSocket upgrade
  const upgrade = req.headers.get('upgrade') ?? '';
  if (upgrade.toLowerCase() !== 'websocket') {
    return new Response('Expected WebSocket upgrade', { status: 426 });
  }

  // Upgrade the browser connection
  const { socket: browserSocket, response } = Deno.upgradeWebSocket(req);

  // Connect to Pionex server-side (no browser Origin restrictions here)
  const pionexSocket = new WebSocket('wss://ws.pionex.com/wsPub');

  pionexSocket.onopen = () => {
    console.log('[ws-relay] Connected to Pionex');
  };

  // Buffer messages from browser until Pionex is ready
  const pendingMessages: string[] = [];

  // Browser → Pionex relay
  browserSocket.onmessage = (event) => {
    if (pionexSocket.readyState === WebSocket.OPEN) {
      pionexSocket.send(event.data);
    } else {
      pendingMessages.push(event.data as string);
    }
  };

  // Flush pending messages once Pionex connects
  pionexSocket.onopen = () => {
    console.log('[ws-relay] Pionex connected, flushing', pendingMessages.length, 'pending messages');
    for (const msg of pendingMessages) {
      pionexSocket.send(msg);
    }
    pendingMessages.length = 0;
  };

  // Pionex → Browser relay
  pionexSocket.onmessage = (event) => {
    if (browserSocket.readyState === WebSocket.OPEN) {
      browserSocket.send(event.data);
    }
  };

  // Handle close events
  browserSocket.onclose = () => {
    console.log('[ws-relay] Browser disconnected');
    if (pionexSocket.readyState === WebSocket.OPEN) pionexSocket.close();
  };

  pionexSocket.onclose = (event) => {
    console.log('[ws-relay] Pionex disconnected, code:', event.code);
    if (browserSocket.readyState === WebSocket.OPEN) browserSocket.close();
  };

  // Handle errors
  browserSocket.onerror = (e) => console.error('[ws-relay] browser error:', e);
  pionexSocket.onerror = (e) => console.error('[ws-relay] pionex error:', e);

  return response;
});
