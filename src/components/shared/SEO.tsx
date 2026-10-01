import { useEffect } from 'react';
import { Helmet } from 'react-helmet-async';

interface SEOProps {
  title: string;
  description: string;
  canonical?: string;
  type?: 'website' | 'article' | 'product';
  image?: string;
  noIndex?: boolean;
  jsonLd?: object;
  keywords?: string;
  language?: 'en' | 'ar' | 'fr';
}

const SITE_URL = 'https://ayn.careers';
const DEFAULT_IMAGE = 'https://ayn.careers/og-image.jpg';

export const SEO = ({
  title,
  description,
  canonical,
  type = 'website',
  image = DEFAULT_IMAGE,
  noIndex = false,
  jsonLd,
  keywords,
  language = 'en',
}: SEOProps) => {
  const fullTitle = title.includes('AYN') ? title : `${title} | AYN`;
  const canonicalUrl = canonical ? `${SITE_URL}${canonical}` : undefined;
  const ogLocale = language === 'ar' ? 'ar_SA' : language === 'fr' ? 'fr_FR' : 'en_US';

  // v3.205.0 -- index.html ships a static <link rel="canonical"> and
  // <meta name="description"> as a pre-JS/no-JS fallback (a real crawler
  // or link-unfurler that never runs JavaScript still needs something).
  // react-helmet-async only ever manages tags it renders itself -- it has
  // no way to know a raw static tag baked into the served HTML exists at
  // all, so it was never replacing these, only adding alongside them.
  // Confirmed live: every route carried two competing description tags,
  // and worse, every page with no explicit `canonical` prop of its own
  // was silently inheriting the static tag's literal href pointing at
  // the homepage -- telling Google that page's canonical version IS "/",
  // a real de-indexing risk. Helmet marks every tag it renders with
  // data-rh="true"; removing anything WITHOUT that marker, once, on the
  // first real SEO mount, leaves exactly one of each behind from then on
  // and needs no change to index.html or to any of the 15 call sites.
  useEffect(() => {
    document.querySelectorAll('link[rel="canonical"]:not([data-rh])').forEach((el) => el.remove());
    document.querySelectorAll('meta[name="description"]:not([data-rh])').forEach((el) => el.remove());
    // index.html's own static robots tag is always "index, follow" -- fine
    // as the default, but a real conflict on a page that sets noIndex:
    // confirmed live, a thin category/location hub correctly grew its own
    // "noindex, nofollow" tag while the static "index, follow" one sat
    // right alongside it, unmanaged, undermined. Same fix, same reason.
    document.querySelectorAll('meta[name="robots"]:not([data-rh])').forEach((el) => el.remove());
  }, []);

  return (
    // v3.205.0 -- found live on routes that re-render several times in
    // quick succession while their own data loads (/jobs and /jobs/:id,
    // each with 2-3 chained fetch effects): Helmet's default behavior
    // defers its real DOM commit to a requestAnimationFrame batch, and a
    // fast-enough stream of new renders kept rescheduling that batch
    // before it ever fired -- confirmed live, the component's own props
    // (checked directly) were correct on every render, only the actual
    // <head> tags never landed. defer={false} is Helmet's own documented
    // opt-out of that batching, committing synchronously on every render
    // instead: the fix, not a workaround.
    <Helmet defer={false}>
      {/* Basic Meta Tags */}
      <title>{fullTitle}</title>
      <meta name="description" content={description} />
      {keywords && <meta name="keywords" content={keywords} />}
      {canonicalUrl && <link rel="canonical" href={canonicalUrl} />}
      {noIndex && <meta name="robots" content="noindex, nofollow" />}

      {/* Open Graph */}
      <meta property="og:title" content={fullTitle} />
      <meta property="og:description" content={description} />
      <meta property="og:type" content={type} />
      <meta property="og:image" content={image} />
      {canonicalUrl && <meta property="og:url" content={canonicalUrl} />}
      <meta property="og:site_name" content="AYN" />
      <meta property="og:locale" content={ogLocale} />
      <meta property="og:locale:alternate" content="en_US" />
      <meta property="og:locale:alternate" content="ar_SA" />
      <meta property="og:locale:alternate" content="fr_FR" />

      {/* Twitter Card */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={fullTitle} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={image} />
      <meta name="twitter:site" content="@ayn_ai" />

      {/* JSON-LD Structured Data */}
      {jsonLd && (
        <script type="application/ld+json">
          {JSON.stringify(jsonLd)}
        </script>
      )}
    </Helmet>
  );
};

// Pre-configured JSON-LD schemas
export const organizationSchema = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: 'AYN AI',
  alternateName: ['AYN', 'عين AI', 'Perceptive AI', 'AYN Artificial Intelligence'],
  url: 'https://ayn.careers',
  logo: 'https://ayn.careers/favicon-brain.png',
  description: 'AYN AI is a perceptive artificial intelligence platform that learns your habits, understands your goals, and helps you succeed with AI employees, custom AI agents, and business automation.',
  sameAs: [
    'https://twitter.com/ayn_ai'
  ],
  contactPoint: {
    '@type': 'ContactPoint',
    contactType: 'customer support',
    url: 'https://ayn.careers/support'
  },
  foundingDate: '2024',
  slogan: 'AI That Knows You'
};

// SoftwareApplication schema for AI platform
export const softwareApplicationSchema = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: 'AYN AI Platform',
  applicationCategory: 'BusinessApplication',
  operatingSystem: 'Web Browser',
  description: 'AYN AI is a personal AI assistant and business automation platform featuring AI employees, custom AI agents, and smart automation tools.',
  url: 'https://ayn.careers',
  offers: {
    '@type': 'Offer',
    price: '0',
    priceCurrency: 'USD',
    description: 'Free to get started'
  },
  aggregateRating: {
    '@type': 'AggregateRating',
    ratingValue: '4.8',
    ratingCount: '150'
  }
};

export const websiteSchema = {
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  name: 'AYN AI',
  alternateName: ['AYN', 'عين AI'],
  url: 'https://ayn.careers',
  description: 'AYN AI - Personal AI Assistant That Learns You. Smart AI platform for AI employees, custom AI agents, and business automation.',
  inLanguage: ['en', 'ar', 'fr'],
  potentialAction: {
    '@type': 'SearchAction',
    target: 'https://ayn.careers/search?q={search_term_string}',
    'query-input': 'required name=search_term_string'
  }
};

export const createServiceSchema = (service: {
  name: string;
  description: string;
  url: string;
}) => ({
  '@context': 'https://schema.org',
  '@type': 'Service',
  name: service.name,
  description: service.description,
  url: service.url,
  provider: {
    '@type': 'Organization',
    name: 'AYN',
    url: 'https://ayn.careers'
  }
});

// BreadcrumbList schema for navigation hierarchy
export const createBreadcrumbSchema = (breadcrumbs: Array<{ name: string; url: string }>) => ({
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: breadcrumbs.map((item, index) => ({
    '@type': 'ListItem',
    position: index + 1,
    name: item.name,
    item: item.url
  }))
});

// FAQPage schema for FAQ sections
export const createFAQSchema = (faqs: Array<{ question: string; answer: string }>) => ({
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: faqs.map(faq => ({
    '@type': 'Question',
    name: faq.question,
    acceptedAnswer: {
      '@type': 'Answer',
      text: faq.answer
    }
  }))
});

export default SEO;
