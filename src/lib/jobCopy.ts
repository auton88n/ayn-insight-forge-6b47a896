/** Complete prose strings keep spacing consistent in DOM text and accessible names. */
export const jobCopy = {
  source: (company: string) => `Sourced directly from ${company}'s own hiring system`,
  unavailable: (n: number) => `${n} of your saved jobs ${n === 1 ? 'is' : 'are'} no longer listed. The company may have filled or taken ${n === 1 ? 'it' : 'them'} down, so check before you spend time tailoring.`,
  results: (n: number) => `${n.toLocaleString()} ${n === 1 ? 'job matches' : 'jobs match'} your search`,
  modeCoverage: (classified: number, total: number) => `AYN has classified work mode for ${classified} of ${total} postings. ${Math.max(0, total - classified)} remain unclassified.`,
};
