/**
 * reportParser.ts
 * 
 * Detects whether an AYN response contains reportable business intelligence,
 * and if so extracts structured data for the AYNReportCard component.
 *
 * Strategy:
 *   1. Score the content with signal keywords
 *   2. If score passes threshold → extract structured fields
 *   3. Return null if the message is casual / not report-worthy
 */

import type { AYNReport, ReportSeverity } from '@/components/eye/AYNReportCard';

// ─── Signal keywords ──────────────────────────────────────────────────────────

const REPORT_TRIGGERS = [
  // Business problems
  'problem', 'issue', 'risk', 'delay', 'overdue', 'missing', 'gap', 'stalled',
  'declined', 'dropped', 'slow', 'behind', 'failed', 'breach', 'loss',
  // Financial signals
  'revenue', 'pipeline', 'invoice', 'payment', 'cost', 'budget', 'sar', 'usd',
  // Operational
  'department', 'team', 'manager', 'supplier', 'client', 'customer', 'lead',
  'follow-up', 'approval', 'compliance', 'workflow', 'process',
  // Report-style language
  'root cause', 'evidence', 'action plan', 'recommend', 'priority',
  'business impact', 'confidence', 'verified', 'detected', 'found',
  'analysis', 'report', 'summary', 'findings',
];

const CASUAL_TRIGGERS = [
  'hello', 'hi ', 'hey ', 'thanks', 'thank you', 'okay', 'sure',
  'got it', 'understood', 'great', 'perfect', 'no problem',
  "you're welcome", 'of course',
];

// ─── Severity detection ───────────────────────────────────────────────────────

function detectSeverity(text: string): ReportSeverity {
  const lower = text.toLowerCase();

  const criticalSignals = ['critical', 'urgent', 'immediately', 'severe', 'breach', 'emergency', 'crisis'];
  const highSignals = ['high risk', 'significant', 'serious', 'major', 'escalate', 'pipeline at risk'];
  const positiveSignals = ['opportunity', 'growth', 'improved', 'exceeded', 'strong', 'positive', 'achieved'];
  const lowSignals = ['minor', 'low risk', 'stable', 'normal', 'routine'];

  if (criticalSignals.some((s) => lower.includes(s))) return 'critical';
  if (highSignals.some((s) => lower.includes(s))) return 'high';
  if (positiveSignals.some((s) => lower.includes(s))) return 'positive';
  if (lowSignals.some((s) => lower.includes(s))) return 'low';
  return 'medium';
}

// ─── Confidence extraction ────────────────────────────────────────────────────

function extractConfidence(text: string): number | undefined {
  const match = text.match(/(\d{1,3})\s*%\s*(?:confidence|certain|sure|accurate)/i);
  if (match) return parseInt(match[1], 10);
  return undefined;
}

// ─── Sources extraction ───────────────────────────────────────────────────────

function extractSources(text: string): number | undefined {
  const match = text.match(/(\d+)\s*(?:data\s*)?sources?/i);
  if (match) return parseInt(match[1], 10);
  return undefined;
}

// ─── Title extraction ─────────────────────────────────────────────────────────

function extractTitle(text: string): string {
  // Try to grab first sentence that sounds like a finding
  const sentences = text
    .split(/[.\n]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 10 && s.length < 120);

  // Look for sentences with key business nouns
  const titleCandidate = sentences.find((s) =>
    /issue|problem|risk|delay|gap|found|detected|identified|showing|reveals/i.test(s)
  );

  if (titleCandidate) return titleCandidate.replace(/^(the\s|a\s|an\s)/i, '');

  // Fallback: first meaningful sentence
  return sentences[0] ?? 'Business Intelligence Report';
}

// ─── Summary extraction ───────────────────────────────────────────────────────

function extractSummary(text: string, title: string): string {
  const sentences = text
    .split(/[.\n]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 20 && s !== title);

  return sentences[1] ?? sentences[0] ?? text.slice(0, 120);
}

// ─── Evidence extraction ──────────────────────────────────────────────────────

function extractEvidence(text: string) {
  const evidencePatterns = [
    /\d+\s+(?:unassigned|pending|overdue|missing|delayed|open|failed)/gi,
    /(?:SAR|USD|AED|OMR|KWD)\s*[\d,]+(?:K|M)?/gi,
    /\d+\s+(?:customers?|clients?|leads?|invoices?|records?|complaints?|tickets?)/gi,
    /(?:delayed?|overdue|missing)\s+(?:by\s+)?\d+\s+days?/gi,
    /\d+%\s+(?:increase|decrease|drop|growth|decline)/gi,
  ];

  const found = new Set<string>();
  for (const pattern of evidencePatterns) {
    const matches = text.matchAll(pattern);
    for (const m of matches) {
      const sentence = extractSurroundingSentence(text, m.index ?? 0);
      if (sentence && sentence.length < 150) found.add(sentence);
    }
  }

  return Array.from(found)
    .slice(0, 5)
    .map((text) => ({ text }));
}

function extractSurroundingSentence(text: string, index: number): string {
  const start = Math.max(0, text.lastIndexOf('.', index - 1) + 1);
  const end = text.indexOf('.', index + 1);
  return text.slice(start, end === -1 ? start + 200 : end).trim();
}

// ─── Root cause extraction ────────────────────────────────────────────────────

function extractRootCause(text: string): string | undefined {
  const patterns = [
    /(?:root cause[:\s]+|because\s+|due to\s+|caused by\s+|reason[:\s]+)([^.\n]{20,150})/i,
    /(?:this\s+)?(?:happens?|occurs?|stems?)\s+(?:because|due to|from)\s+([^.\n]{20,150})/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return match[1].trim();
  }
  return undefined;
}

// ─── Business impact extraction ───────────────────────────────────────────────

function extractBusinessImpact(text: string): string[] {
  const impacts: string[] = [];

  // SAR/USD amounts
  const amountMatches = text.matchAll(/((?:SAR|USD|AED)\s*[\d,]+(?:K|M)?[^.\n]{0,80})/gi);
  for (const m of amountMatches) {
    const sentence = extractSurroundingSentence(text, m.index ?? 0);
    if (sentence.length < 150) impacts.push(sentence);
  }

  // Percentage impacts
  const pctMatches = text.matchAll(/(\d+%\s+(?:increase|decrease|risk|loss|growth)[^.\n]{0,80})/gi);
  for (const m of pctMatches) {
    const sentence = extractSurroundingSentence(text, m.index ?? 0);
    if (sentence.length < 150 && !impacts.includes(sentence)) impacts.push(sentence);
  }

  return [...new Set(impacts)].slice(0, 3);
}

// ─── Actions extraction ───────────────────────────────────────────────────────

function extractActions(text: string) {
  const actions: Array<{ priority: 'CRITICAL' | 'HIGH' | 'MEDIUM'; text: string; owner?: string }> = [];

  // Numbered action lists
  const numberedItems = text.matchAll(/(?:^|\n)\s*\d+[\.\)]\s*(.{20,180})/gm);
  for (const m of numberedItems) {
    const item = m[1].trim();
    const priority = /urgent|immediate|today|now|critical/i.test(item)
      ? 'CRITICAL'
      : /escalate|high|important|soon/i.test(item)
      ? 'HIGH'
      : 'MEDIUM';

    // Try to extract owner
    const ownerMatch = item.match(/(?:assign(?:ed)? to|owner[:\s]+|by\s+)([A-Z][a-z]+ [A-Z][a-z]+)/);
    actions.push({
      priority,
      text: item.replace(ownerMatch?.[0] ?? '', '').trim(),
      owner: ownerMatch?.[1],
    });
  }

  // Bullet points
  if (actions.length === 0) {
    const bullets = text.matchAll(/(?:^|\n)\s*[-•*]\s*(.{20,180})/gm);
    for (const m of bullets) {
      const item = m[1].trim();
      if (/should|must|need|recommend|action|assign|create|escalate/i.test(item)) {
        actions.push({ priority: 'MEDIUM', text: item });
      }
    }
  }

  return actions.slice(0, 4);
}

// ─── Main scorer & parser ─────────────────────────────────────────────────────

export function shouldShowReport(content: string): boolean {
  const lower = content.toLowerCase();

  // Skip short messages
  if (content.length < 80) return false;

  // Skip clearly casual messages
  if (CASUAL_TRIGGERS.some((t) => lower.startsWith(t) || lower.includes(t + ' '))) {
    if (content.length < 200) return false;
  }

  // Score against business signal keywords
  const score = REPORT_TRIGGERS.reduce(
    (acc, trigger) => acc + (lower.includes(trigger) ? 1 : 0),
    0
  );

  return score >= 3;
}

export function parseReport(content: string): AYNReport | null {
  if (!shouldShowReport(content)) return null;

  const title = extractTitle(content);
  const summary = extractSummary(content, title);
  const severity = detectSeverity(content);
  const evidence = extractEvidence(content);
  const rootCause = extractRootCause(content);
  const businessImpact = extractBusinessImpact(content);
  const actions = extractActions(content);
  const confidence = extractConfidence(content);
  const sources = extractSources(content);

  return {
    title,
    summary,
    severity,
    evidence: evidence.length > 0 ? evidence : undefined,
    rootCause: rootCause || undefined,
    businessImpact: businessImpact.length > 0 ? businessImpact : undefined,
    actions: actions.length > 0 ? actions : undefined,
    confidence,
    sources,
  };
}
