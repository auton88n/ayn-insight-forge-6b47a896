import type { AIMode, FileAttachment } from '@/types/dashboard.types';

/**
 * Intent detection logic extracted from useMessages.
 * Determines the AI intent based on mode, content, and attachment.
 */
export type ChatIntent = 'chat' | 'image' | 'document' | 'search' | 'files' | 'chart_analysis' | 'floor_plan' | 'business-intelligence' | 'trading-coach';

export function detectIntent(
  selectedMode: AIMode,
  messageContent: string,
  attachment: FileAttachment | null
): ChatIntent {
  // Mode-locked intents — user explicitly chose these modes
  if (selectedMode === 'Business') return 'business-intelligence';
  if (selectedMode === 'Trading') return 'trading-coach';
  if (selectedMode === 'LAB' || selectedMode === 'Vision Lab') return 'image';
  if (selectedMode === 'Research Pro') return 'search';
  if (selectedMode === 'PDF Analyst') return 'files';

  const lower = messageContent.toLowerCase();

  // Image generation detection FIRST (prevents "make me a" hijacking by document)
  if (/generate\s+(an?\s+)?image|create\s+(an?\s+)?image|make\s+(an?\s+)?image|make\s+me\s+(an?\s+)?(picture|photo|image)|generate\s+(an?\s+)?picture|create\s+(an?\s+)?picture|show\s+me\s+(an?\s+)?(image|picture|photo)|give\s+me\s+(an?\s+)?(image|picture|photo)|draw\s|picture\s+of|image\s+of|photo\s+of|illustration\s+of|visualize|render\s+(an?\s+)?/.test(lower)) return 'image';
  if (/(?:i\s+(?:want|need)\s+(?:an?\s+)?)?(?:image|picture|photo)\s+(?:about|of|for)/.test(lower)) return 'image';
  if (/صورة|ارسم|اعطني صورة|ابي\s*صورة|سوي\s*صورة|dessine|montre\s+moi|genere\s+une\s+image/.test(lower)) return 'image';

  // Document generation detection (English, Arabic, French)
  if (/create\s+(an?\s+)?pdf|make\s+(an?\s+)?pdf|generate\s+(an?\s+)?pdf|give\s+me\s+(an?\s+)?pdf|export\s+as\s+pdf|pdf\s+(report|document|about|for|of)/.test(lower)) return 'document';
  if (/(?:i\s+(?:want|need)\s+(?:an?\s+)?)?pdf\s+(?:about|for|on)/.test(lower)) return 'document';
  if (/(?:can\s+you\s+)?(?:make|create|get)\s+(?:me\s+)?(?:an?\s+)?pdf/.test(lower)) return 'document';
  if (/create\s+(an?\s+)?(excel|exel|excell|exsel|ecxel|exl)|make\s+(an?\s+)?(excel|exel|excell|exsel|ecxel|exl)|give\s+me\s+(an?\s+)?(excel|exel|excell|exsel|ecxel|exl)|(excel|exel|excell|exsel|ecxel|exl)\s+(sheet|about|for|of)|spreadsheet|xlsx|table\s+(about|of)|data\s+(about|overview)|create\s+(an?\s+)?table|create\s+(an?\s+)?report|make\s+(an?\s+)?report|generate\s+(an?\s+)?report/.test(lower)) return 'document';
  if (/(?:i\s+(?:want|need)\s+(?:an?\s+)?)?(?:excel|spreadsheet)\s+(?:about|for|on)/.test(lower)) return 'document';
  if (/اعمل\s*pdf|انشئ\s*pdf|ملف\s*pdf|تقرير\s*pdf|اعمل\s*(اكسل|لي)|سوي\s*لي|جدول\s*عن|بيانات\s*عن|اكسل\s*عن/.test(lower)) return 'document';
  if (/ابي\s*(?:pdf|اكسل|ملف)|اعطني\s*(?:تقرير|ملف|جدول)|سوي\s*(?:pdf|اكسل|ملف)/.test(lower)) return 'document';
  if (/créer\s+(un\s+)?pdf|faire\s+(un\s+)?pdf|rapport\s+pdf|document\s+pdf|créer\s+(un\s+)?excel|excel\s+sur|excel\s+de|tableau\s+de|données\s+sur/.test(lower)) return 'document';
  if (/document\s+about|create\s+(an?\s+)?document/.test(lower)) return 'document';
  if (/(?:make|put|convert|turn)\s+(?:it|this|that)\s+(?:in(?:to)?|to|as)?\s*(?:an?\s+)?(?:pdf|excel|exel|excell|exsel|exl|xlsx)/.test(lower)) return 'document';
  if (/(?:make|put|convert|turn)\s+(?:it|this|that)\s+(?:in(?:to)?|to|as)?\s*(?:an?\s+)?(?:report|document|table|spreadsheet)/.test(lower)) return 'document';
  if (/^(?:in\s+)?(?:excel|exel|excell|exsel|exl|pdf|xlsx)\s*$/.test(lower.trim())) return 'document';

  // Chart analysis detection (when image is attached + chart-related keywords)
  if (attachment && attachment.type.startsWith('image/') && /chart|trading|signal|technical\s+analysis|analyze|شارت|تحليل\s*فني|graphique|analyse\s+technique/.test(lower)) return 'chart_analysis';

  // Search intent
  if (/search|find|look up|latest|current|today|news|price|weather|what happened|who is|when did|where is/.test(lower)) return 'search';

  // Fallback: if image is attached and no other intent matched, default to chart analysis
  if (attachment && attachment.type.startsWith('image/')) return 'chart_analysis';

  return 'chat';
}
