/** evidence/adapter.ts — the "adapter" evidence source; calls the active ATS plugin. Returns Evidence[]; never a Question. */
import type { Evidence } from "../evidence";
export function collect(el: Element, root: Document | Element): Evidence[] {
  void el;
  void root;
  return [];
}
