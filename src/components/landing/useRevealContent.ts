import { useEffect, type RefObject } from 'react';

/** Async tab contents mount after the shell's effect; observe those too. */
export function useRevealContent(root: RefObject<HTMLElement>) {
  useEffect(() => {
    const element = root.current;
    if (!element) return;
    const observed = new WeakSet<Element>();
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const observer = typeof IntersectionObserver === 'undefined' ? null : new IntersectionObserver(entries => {
      for (const entry of entries) if (entry.isIntersecting) {
        entry.target.classList.add('is-in');
        observer?.unobserve(entry.target);
      }
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    const scan = () => {
      const added: Element[] = [];
      element.querySelectorAll('.lp-reveal:not(.is-in)').forEach(node => {
        if (observed.has(node)) return;
        observed.add(node);
        if (observer) { observer.observe(node); added.push(node); }
        else node.classList.add('is-in');
      });
      if (added.length) {
        const timer = setTimeout(() => {
          added.forEach(node => node.classList.add('is-in'));
          timers.delete(timer);
        }, 900);
        timers.add(timer);
      }
    };
    scan();
    const mutations = new MutationObserver(scan);
    mutations.observe(element, { childList: true, subtree: true });
    return () => { mutations.disconnect(); observer?.disconnect(); timers.forEach(clearTimeout); };
  }, [root]);
}
