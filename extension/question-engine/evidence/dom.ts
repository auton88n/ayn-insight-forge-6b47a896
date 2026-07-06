/** evidence/dom.ts — the "dom" evidence source. Returns Evidence[]; never a Question. */
import type { Evidence } from "../evidence";
export function collect(el: Element, root: Document | Element): Evidence[] {
  void el;
  void root;
  return [];
}
