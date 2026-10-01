export type ResumeFinding = {
  id: string; title: string; excerpt: string; explanation: string;
  action: 'optimize' | 'clarify';
};

/** Conservative text-only observations, never a prediction of rejection.
 * No inferred metrics, layout claims, employment-gap penalty or AI detector. */
export function reviewResumeText(text: string): ResumeFinding[] {
  const lines = text.split(/\n+/).map(line => line.trim()).filter(Boolean);
  const findings: ResumeFinding[] = [];
  const duty = lines.find(line => /^(?:[-•*]\s*)?(?:responsible for|tasked with|duties included)\b/i.test(line));
  if (duty) findings.push({
    id: 'duty', title: 'Lead with the contribution, not the duty', excerpt: duty,
    explanation: 'This line describes an assignment. A clearer action and a supported outcome would make your contribution easier to understand.', action: 'optimize',
  });
  const generic = lines.find(line => /\b(?:results[- ]driven professional|dynamic professional|proven track record|hard[- ]working individual)\b/i.test(line));
  if (generic) findings.push({
    id: 'generic', title: 'Make the introduction specific to you', excerpt: generic,
    explanation: 'This phrase could describe many applicants. Your actual specialty and relevant experience would communicate more.', action: 'optimize',
  });
  const longLine = lines.find(line => line.length > 280 && line !== duty && line !== generic);
  if (longLine) findings.push({
    id: 'dense', title: 'Make this passage easier to scan', excerpt: longLine.slice(0, 320),
    explanation: 'This passage is long in the pasted text. Check whether it combines several ideas; shorter, focused statements may be clearer. Pasting can remove original line breaks.', action: 'optimize',
  });
  if (!/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(text)) findings.push({
    id: 'contact', title: 'Check your contact email', excerpt: '',
    explanation: 'No email address was found in the pasted text. If you removed it for this check, no change to the actual resume is needed.', action: 'clarify',
  });
  return findings.slice(0, 3);
}
