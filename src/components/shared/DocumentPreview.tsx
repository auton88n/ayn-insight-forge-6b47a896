import type { ResumeContent } from '@/lib/resumeHub';
import { buildResumeBlocks } from '@/lib/resumeBlocks';

/** Screen-only reading layout. Downloads keep their own measured pagination. */
export function ResumeDocumentPreview({ content }: { content: ResumeContent }) {
  const blocks = buildResumeBlocks(content);
  const elements = [];
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    if (block.kind === 'bullet') {
      const bullets = [];
      const key = i;
      while (i < blocks.length && blocks[i].kind === 'bullet') {
        bullets.push(<li key={i}>{blocks[i].text}</li>);
        i++;
      }
      i--;
      elements.push(<ul key={key}>{bullets}</ul>);
    } else if (block.kind === 'name') {
      elements.push(<h3 key={i} className="ayn-document-name">{block.text}</h3>);
    } else if (block.kind === 'header') {
      elements.push(<h4 key={i} className="ayn-document-heading">{block.text}</h4>);
    } else {
      const strong = block.kind === 'title' || block.kind === 'label';
      elements.push(<p key={i} className={block.kind === 'contact' ? 'ayn-document-contact' : undefined}>
        {strong ? <strong>{block.text}</strong> : block.text}
        {block.meta && <span className="ayn-document-date">{` | ${block.meta}`}</span>}
      </p>);
    }
  }
  return <article aria-label="Resume preview" className="ayn-document-sheet">{elements}</article>;
}

export function LetterDocumentPreview({ text }: { text: string }) {
  // Do not interpret employer/user text as HTML, or rewrite the downloadable body.
  return <article aria-label="Cover letter preview" className="ayn-document-sheet">
    {text.split(/\r?\n\s*\r?\n/).filter(p => p.trim()).map((p, i) => <p key={i} className="whitespace-pre-line">{p}</p>)}
  </article>;
}
