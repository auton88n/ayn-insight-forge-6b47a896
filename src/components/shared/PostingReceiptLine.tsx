import { receiptLine, type PostingReceipt } from '@/lib/postingEvidence';
import './posting-evidence.css';

/** Pure card content: no database client, request or nested interactive control. */
export function PostingReceiptLine({ posting }: { posting: PostingReceipt }) {
  return <span className="ayn-receipt-line" title="AYN observations, not a guarantee of hiring. Dates use UTC.">{receiptLine(posting)}</span>;
}
