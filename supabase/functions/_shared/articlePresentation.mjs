/** One factual report for the browser, crawler and publisher. Legacy generated
 * prose is not used when the saved numeric snapshot is available. */
const count = n => new Intl.NumberFormat('en-US').format(n);
const money = n => `USD ${count(n)} per year`;
const number = value => value != null && value !== '' && Number.isFinite(Number(value)) && Number(value) >= 0 ? Number(value) : null;
const label = value => String(value || '').replace(/[_-]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
const md = value => String(value).replace(/[\\`*_[\]<>|]/g, '\\$&').replace(/[\r\n]+/g, ' ');

export function presentArticle(article) {
  const data = article.source_data;
  const open = number(data?.open_roles);
  if (open === null) return article;
  const topic = `${label(article.category)}${article.city ? ` in ${article.city}` : ''}`;
  const sample = number(data.salary_sample_size);
  const median = number(data.median_salary);
  const pay = sample !== null && sample >= 10 && median !== null && median > 0;
  const title = `${topic}: ${article.kind === 'salary_report' ? 'advertised pay' : 'hiring snapshot'}`;
  const dek = `${count(open)} listings in this AYN catalog snapshot${pay ? `; median advertised annual midpoint ${money(median)}` : ''}.`;
  const sections = [
    `## Listings in this snapshot\n\n${count(open)} ${md(topic)} listings were in AYN’s catalog when this report was computed. This is a catalog sample, not a count of all vacancies in the market.`,
  ];
  // posted_at is refreshed by sync and successful checks. It is not an
  // original publication timestamp, and is deliberately not narrated.
  if (pay) {
    const rows = [`| Measure | Advertised annual midpoint |`, `| --- | --- |`, `| Median | ${money(median)} |`];
    for (const [key, name] of [['p25_salary', '25th percentile'], ['p75_salary', '75th percentile']]) {
      const n = number(data[key]);
      if (n !== null && n > 0) rows.push(`| ${name} | ${money(n)} |`);
    }
    sections.push(`## Advertised pay\n\nBased on ${count(sample)} listings with comparable USD pay data. Figures summarize the midpoint of each advertised annual range, not actual earnings or a guaranteed offer. Hourly and monthly ranges are annualized for comparison.\n\n${rows.join('\n')}`);
  } else sections.push('## Advertised pay\n\nFewer than 10 comparable USD salary listings are available, so no median is reported. Missing pay does not mean the employer offers a low salary.');
  const modes = Object.entries(data.work_mode || {}).filter(([, n]) => number(n) !== null);
  if (modes.length) {
    const names = { remote: 'Remote', hybrid: 'Hybrid', onsite: 'On-site', on_site: 'On-site', unspecified: 'Not stated' };
    sections.push(`## Work mode\n\n${modes.map(([mode, n]) => `- ${md(names[mode] || label(mode))}: ${count(Number(n))} listings`).join('\n')}\n\nUnspecified work mode does not establish remote eligibility. Check each posting’s location restrictions.`);
  }
  const companies = (Array.isArray(data.top_companies) ? data.top_companies : []).filter(c => c.company && number(c.open_roles) !== null);
  if (companies.length) sections.push(`## Companies represented\n\n${companies.slice(0, 8).map(c => `- ${md(c.company)}: ${count(Number(c.open_roles))} listings`).join('\n')}\n\nThese are observed postings, not confirmed headcount, hiring speed, or completed hires.`);
  sections.push('## Using this report\n\nOpen the individual posting to review its requirements, pay basis and latest recorded observations. Compare the location and seniority as well as the salary. A catalog sighting is not a guarantee that an employer is interviewing or that a role remains open now.');
  return { ...article, title, dek, meta_description: dek, body_md: sections.join('\n\n'), faq: null };
}
