import type { Locale } from '../i18n';

export const SITE_URL = 'https://scluba.com';
export const SITE_NAME = 'Scluba';
export const SITE_OG_IMAGE = '/og/scluba-default.png';
export const SITE_TWITTER = '@scluba';

export interface SeoProps {
  locale: Locale;
  title: string;
  description: string;
  /** Path of the current page, starting with "/" (e.g. "/legal/mentions-legales/"). */
  pathname: string;
  /** Optional path of the equivalent page in the alternate locale. Defaults to homepage of the alt locale. */
  altPathname?: string;
  ogImage?: string;
  noindex?: boolean;
  /** Optional override for og:type (default: website). */
  ogType?: 'website' | 'article';
}

export function canonicalUrl(pathname: string): string {
  const clean = pathname.startsWith('/') ? pathname : `/${pathname}`;
  return `${SITE_URL}${clean}`;
}

export function hreflangAlternates(locale: Locale, pathname: string, altPathname?: string) {
  const altLocale: Locale = locale === 'fr' ? 'en' : 'fr';
  const currentHref = canonicalUrl(pathname);
  const altHref = canonicalUrl(altPathname ?? (altLocale === 'fr' ? '/' : '/en/'));
  const xDefaultHref = canonicalUrl(locale === 'fr' ? pathname : (altPathname ?? '/'));

  return {
    current: { locale: locale === 'fr' ? 'fr-FR' : 'en-US', href: currentHref },
    alt: { locale: altLocale === 'fr' ? 'fr-FR' : 'en-US', href: altHref },
    xDefault: xDefaultHref,
  };
}

export function organizationJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: SITE_NAME,
    url: SITE_URL,
    logo: `${SITE_URL}/favicon.svg`,
    sameAs: [],
  };
}

export function websiteJsonLd(locale: Locale) {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: SITE_NAME,
    url: SITE_URL,
    inLanguage: locale === 'fr' ? 'fr-FR' : 'en-US',
  };
}

export function softwareApplicationJsonLd(locale: Locale) {
  const isFr = locale === 'fr';
  return {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: SITE_NAME,
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'Web, iOS, Android',
    description: isFr
      ? "Carte de score digitale brandée pour clubs de golf. Le joueur scanne un QR au desk, joue, et partage une carte récap aux couleurs du club."
      : 'Branded digital scorecard for golf clubs. Players scan a QR at the desk, play, and share a recap card in the club\'s colors.',
    offers: [
      {
        '@type': 'Offer',
        name: isFr ? 'Essentiel' : 'Essential',
        price: '49',
        priceCurrency: 'EUR',
        priceSpecification: {
          '@type': 'UnitPriceSpecification',
          price: '49',
          priceCurrency: 'EUR',
          unitText: 'MONTH',
        },
      },
      {
        '@type': 'Offer',
        name: isFr ? 'Complet' : 'Complete',
        price: '79',
        priceCurrency: 'EUR',
        priceSpecification: {
          '@type': 'UnitPriceSpecification',
          price: '79',
          priceCurrency: 'EUR',
          unitText: 'MONTH',
        },
      },
    ],
    publisher: organizationJsonLd(),
  };
}

export function faqJsonLd(items: Array<{ q: string; a: string }>) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map((it) => ({
      '@type': 'Question',
      name: it.q,
      acceptedAnswer: {
        '@type': 'Answer',
        text: it.a,
      },
    })),
  };
}

export function breadcrumbJsonLd(crumbs: Array<{ name: string; url: string }>) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: crumbs.map((c, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: c.name,
      item: c.url.startsWith('http') ? c.url : `${SITE_URL}${c.url}`,
    })),
  };
}
