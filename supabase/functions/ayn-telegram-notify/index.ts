import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.56.0";
import { corsHeaders as getCorsHeadersFn } from '../_shared/cors.ts';


// corsHeaders: static fallback using primary origin (from _shared/cors.ts)
const corsHeaders = getCorsHeadersFn({ headers: new Headers() } as Request);

type NotificationType = 'support_ticket' | 'error_alert' | 'marketing' | 'insight' | 'idea' | 'escalation' | 'general';

interface TelegramNotifyRequest {
  type: NotificationType;
  title: string;
  message: string;
  details?: Record<string, unknown>;
  priority?: 'low' | 'medium' | 'high' | 'critical';
}

const TYPE_ICONS: Record<NotificationType, string> = {
  support_ticket: '🎫',
  error_alert: '⚠️',
  marketing: '📈',
  insight: '💡',
  idea: '🧠',
  escalation: '🚨',
  general: '📋',
};

const PRIORITY_ICONS: Record<string, string> = {
  low: '🟢',
  medium: '🟡',
  high: '🟠',
  critical: '🔴',
};

function formatTelegramMessage(req: TelegramNotifyRequest): string {
  const icon = TYPE_ICONS[req.type] || '📋';
  const priorityIcon = req.priority ? PRIORITY_ICONS[req.priority] || '' : '';

  let text = `${icon} *${escapeMarkdown(req.title)}*\n`;
  if (req.priority) {
    text += `${priorityIcon} Priority: ${req.priority.toUpperCase()}\n`;
  }
  text += `\n${escapeMarkdown(req.message)}`;

  if (req.details) {
    text += '\n\n*Details:*\n';
    for (const [key, value] of Object.entries(req.details)) {
      const label = key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
      text += `• ${escapeMarkdown(label)}: ${escapeMarkdown(String(value))}\n`;
    }
  }

  // Truncate to Telegram's 4096 char limit
  if (text.length > 4000) {
    text = text.substring(0, 3990) + '\n\n_...truncated_';
  }

  return text;
}

function escapeMarkdown(text: string): string {
  return text.replace(/([_*\[\]()~`>#+\-=|{}.!])/g, '\\$1');
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body: TelegramNotifyRequest = await req.json();

    if (!body.title || !body.message) {
      return new Response(JSON.stringify({ error: 'title and message are required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const TELEGRAM_BOT_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN');
    const TELEGRAM_CHAT_ID = Deno.env.get('TELEGRAM_CHAT_ID');

    if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
      console.error('Telegram credentials not configured');
      return new Response(JSON.stringify({ error: 'Telegram not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const formattedMessage = formatTelegramMessage(body);

    // Send to Telegram
    const telegramResponse = await fetch(
      `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: TELEGRAM_CHAT_ID,
          text: formattedMessage,
          parse_mode: 'MarkdownV2',
        }),
      }
    );

    const telegramResult = await telegramResponse.json();

    if (!telegramResponse.ok) {
      console.error('Telegram API error:', JSON.stringify(telegramResult));
      // Retry with plain text if markdown fails
      const plainRetry = await fetch(
        `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: TELEGRAM_CHAT_ID,
            text: `${TYPE_ICONS[body.type] || '📋'} ${body.title}\n\n${body.message}`,
          }),
        }
      );
      const plainResult = await plainRetry.json();
      if (!plainRetry.ok) {
        throw new Error(`Telegram send failed: ${JSON.stringify(plainResult)}`);
      }
    }

    // Log notification to DB
    try {
      const supabase = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
      );
      await supabase.from('admin_notification_log').insert({
        notification_type: `telegram_${body.type}`,
        recipient_email: 'telegram',
        subject: body.title,
        content: body.message,
        status: 'sent',
        metadata: { type: body.type, priority: body.priority, details: body.details },
      });
    } catch (logErr) {
      console.error('Failed to log notification:', logErr);
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('ayn-telegram-notify error:', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
