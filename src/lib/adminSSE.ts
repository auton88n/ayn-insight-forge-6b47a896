/**
 * adminSSE.ts — SSE client for admin realtime updates.
 *
 * Replaces adminSupabase.channel('x').on('postgres_changes', ...).subscribe().
 *
 * Usage:
 *   const unsub = subscribeAdminTables(['support_tickets'], (table) => {
 *     // re-fetch your data here
 *   });
 *   return () => unsub();
 *
 * Reconnects automatically on stream end / disconnect.
 */
import { AYN_BACKEND_URL } from '@/config';
const SPINE_URL = AYN_BACKEND_URL || 'https://spine.aynn.io';
import { getAdminToken } from './adminApi';

type ChangeHandler = (table: string) => void;

const RECONNECT_DELAY_MS = 1500;

export function subscribeAdminTables(tables: string[], onChange: ChangeHandler): () => void {
  let es: EventSource | null = null;
  let stopped = false;
  let reconnectTimer: number | null = null;

  const connect = () => {
    if (stopped) return;
    const token = getAdminToken();
    if (!token) {
      // No session; retry shortly in case auth is still bootstrapping
      reconnectTimer = window.setTimeout(connect, RECONNECT_DELAY_MS);
      return;
    }
    const url = new URL(`${SPINE_URL}/sse/admin`);
    url.searchParams.set('tables', tables.join(','));
    url.searchParams.set('token', token);
    es = new EventSource(url.toString());

    es.addEventListener('change', (e) => {
      try {
        const payload = JSON.parse((e as MessageEvent).data);
        if (payload?.table) onChange(payload.table);
      } catch { /* ignore */ }
    });

    es.addEventListener('reconnect', () => {
      es?.close();
      es = null;
      if (!stopped) reconnectTimer = window.setTimeout(connect, 250);
    });

    es.onerror = () => {
      es?.close();
      es = null;
      if (!stopped) reconnectTimer = window.setTimeout(connect, RECONNECT_DELAY_MS);
    };
  };

  connect();

  return () => {
    stopped = true;
    if (reconnectTimer) window.clearTimeout(reconnectTimer);
    es?.close();
    es = null;
  };
}
