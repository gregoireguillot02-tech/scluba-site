import { parse, type HTMLElement } from 'node-html-parser';
import { safeFetchBoundedBytes, safeFetchBoundedText, SafeFetchError } from '../safe-fetch';
import type { DownloadedImage, ScrapedAssets } from './types';

const USER_AGENT =
  'Mozilla/5.0 (compatible; SclubaImporter/1.0; +https://scluba.com)';

const HTML_TIMEOUT_MS = 8_000;
const IMAGE_TIMEOUT_MS = 6_000;
const MAX_HTML_BYTES = 2 * 1024 * 1024; // 2 MB hard cap for HTML
const MAX_IMAGE_BYTES = 1 * 1024 * 1024; // 1 MB hard cap for images
const MAX_LLM_TEXT_CHARS = 40_000;

const ALLOWED_IMAGE_MIMES = new Set(['image/png', 'image/jpeg', 'image/webp']);

const SUB_PAGE_HINTS = ['/parcours', '/le-parcours', '/le-club', '/club', '/about'];

const STRIP_TAGS = new Set(['script', 'style', 'noscript', 'svg', 'iframe', 'header', 'footer', 'nav', 'form']);

const COMMON_HEADERS: Record<string, string> = {
  'User-Agent': USER_AGENT,
  'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.7',
};

function absoluteUrl(maybeUrl: string, base: string): string | null {
  if (!maybeUrl) return null;
  try {
    return new URL(maybeUrl, base).toString();
  } catch {
    return null;
  }
}

function findLogoCandidates(root: HTMLElement, base: string): string[] {
  const out = new Set<string>();
  const imgs = root.querySelectorAll('img');
  for (const img of imgs) {
    const alt = (img.getAttribute('alt') ?? '').toLowerCase();
    const cls = (img.getAttribute('class') ?? '').toLowerCase();
    const id = (img.getAttribute('id') ?? '').toLowerCase();
    const src = img.getAttribute('src') ?? img.getAttribute('data-src') ?? '';
    if (!src) continue;
    const lookLikeLogo =
      /logo|brand|identity/.test(alt) ||
      /logo|brand|identity/.test(cls) ||
      /logo|brand|identity/.test(id) ||
      /logo/.test(src.toLowerCase());
    const inHeader =
      img.closest('header') !== null ||
      img.closest('nav') !== null ||
      img.closest('.header, .navbar, .topbar, .site-header, .menu') !== null;
    if (lookLikeLogo || inHeader) {
      const abs = absoluteUrl(src, base);
      if (abs) out.add(abs);
    }
  }
  const linkIcon = root.querySelector('link[rel="apple-touch-icon"]')?.getAttribute('href');
  if (linkIcon) {
    const abs = absoluteUrl(linkIcon, base);
    if (abs) out.add(abs);
  }
  return [...out].slice(0, 8);
}

function findPhotoCandidates(root: HTMLElement, base: string): string[] {
  const out = new Set<string>();
  for (const img of root.querySelectorAll('img')) {
    const src = img.getAttribute('src') ?? img.getAttribute('data-src') ?? '';
    if (!src) continue;
    const alt = (img.getAttribute('alt') ?? '').toLowerCase();
    const cls = (img.getAttribute('class') ?? '').toLowerCase();
    if (/logo|icon|sprite|avatar/.test(alt) || /logo|icon|sprite|avatar/.test(cls)) continue;
    const widthAttr = Number(img.getAttribute('width') ?? '0');
    const inHero =
      img.closest('.hero, .banner, .cover, .above-the-fold, .home-banner, .home-hero') !== null;
    if (widthAttr >= 600 || inHero || /hero|banner|cover|parcours|fairway|green/.test(src.toLowerCase())) {
      const abs = absoluteUrl(src, base);
      if (abs) out.add(abs);
    }
  }
  return [...out].slice(0, 8);
}

function findMeta(root: HTMLElement, prop: string): string | null {
  const el =
    root.querySelector(`meta[property="${prop}"]`) ??
    root.querySelector(`meta[name="${prop}"]`);
  return el?.getAttribute('content') ?? null;
}

function findFavicon(root: HTMLElement, base: string): string | null {
  const candidate =
    root.querySelector('link[rel="apple-touch-icon"]')?.getAttribute('href') ??
    root.querySelector('link[rel="icon"]')?.getAttribute('href') ??
    root.querySelector('link[rel="shortcut icon"]')?.getAttribute('href') ??
    null;
  return candidate ? absoluteUrl(candidate, base) : null;
}

function extractText(root: HTMLElement): string {
  const clone = parse(root.toString());
  for (const tag of STRIP_TAGS) {
    for (const node of clone.querySelectorAll(tag)) node.remove();
  }
  return clone.text.replace(/\s+/g, ' ').trim();
}

function pickSubPages(root: HTMLElement, base: string): string[] {
  const out = new Set<string>();
  for (const a of root.querySelectorAll('a')) {
    const href = a.getAttribute('href') ?? '';
    if (!href) continue;
    const abs = absoluteUrl(href, base);
    if (!abs) continue;
    if (new URL(abs).host !== new URL(base).host) continue;
    const path = new URL(abs).pathname.toLowerCase();
    if (SUB_PAGE_HINTS.some((hint) => path.startsWith(hint))) out.add(abs);
  }
  return [...out].slice(0, 3);
}

async function fetchHtml(url: string): Promise<string> {
  const { text, res } = await safeFetchBoundedText(url, MAX_HTML_BYTES, {
    timeoutMs: HTML_TIMEOUT_MS,
    init: { method: 'GET', headers: COMMON_HEADERS },
  });
  if (!res.ok) {
    throw new SafeFetchError('http_error', `Site responded ${res.status} ${res.statusText}`);
  }
  return text;
}

/**
 * Fetches the home page plus up to two relevant sub-pages (`/parcours`,
 * `/le-club`) and aggregates the result into a single {@link ScrapedAssets}
 * payload. Sub-pages are best-effort — failures are silent.
 *
 * Every outbound fetch flows through {@link safeFetchBoundedText} so the
 * URL (and any redirect target) is SSRF-validated and the body is capped
 * at {@link MAX_HTML_BYTES} bytes regardless of `Content-Length`.
 */
export async function scrapeClubSite(homepageUrl: string): Promise<ScrapedAssets> {
  const baseUrl = new URL(homepageUrl).origin;

  const homeHtml = await fetchHtml(homepageUrl);
  const homeRoot = parse(homeHtml);

  const ogImage = absoluteUrl(findMeta(homeRoot, 'og:image') ?? '', homepageUrl);
  const favicon = findFavicon(homeRoot, homepageUrl);

  const logoCandidates = findLogoCandidates(homeRoot, homepageUrl);
  if (favicon) logoCandidates.push(favicon);

  const photoCandidates = findPhotoCandidates(homeRoot, homepageUrl);
  if (ogImage) photoCandidates.unshift(ogImage);

  const textParts = [extractText(homeRoot)];

  for (const subUrl of pickSubPages(homeRoot, homepageUrl)) {
    try {
      const html = await fetchHtml(subUrl);
      const root = parse(html);
      textParts.push(`\n\n--- Page ${subUrl} ---\n${extractText(root)}`);
      for (const c of findPhotoCandidates(root, subUrl)) photoCandidates.push(c);
    } catch {
      // sub-page failure is non-fatal
    }
  }

  const joined = textParts.join('\n').slice(0, MAX_LLM_TEXT_CHARS);

  return {
    logoCandidates: [...new Set(logoCandidates)].slice(0, 8),
    photoCandidates: [...new Set(photoCandidates)].slice(0, 8),
    ogImage,
    faviconUrl: favicon,
    textContent: joined,
    baseUrl,
  };
}

/**
 * Downloads an image and returns its bytes if it's a supported raster format
 * within size limits. Returns null otherwise so the caller can try the next
 * candidate.
 *
 * The URL is validated through the SSRF guard before each hop. Bytes are
 * stream-bounded at {@link MAX_IMAGE_BYTES} — `Content-Length` is never trusted.
 */
export async function downloadImage(url: string): Promise<DownloadedImage | null> {
  try {
    const { bytes, res } = await safeFetchBoundedBytes(url, MAX_IMAGE_BYTES, {
      timeoutMs: IMAGE_TIMEOUT_MS,
      init: { method: 'GET', headers: COMMON_HEADERS },
    });
    if (!res.ok) return null;

    const mime = (res.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
    if (!ALLOWED_IMAGE_MIMES.has(mime)) return null;

    if (bytes.byteLength === 0 || bytes.byteLength > MAX_IMAGE_BYTES) return null;

    return {
      bytes,
      mimeType: mime as DownloadedImage['mimeType'],
      sourceUrl: url,
    };
  } catch {
    return null;
  }
}

/**
 * Tries each candidate URL in order until one returns a valid raster image.
 * Used to pick the first working logo/photo from a list of guesses.
 */
export async function downloadFirstValid(urls: string[]): Promise<DownloadedImage | null> {
  for (const u of urls) {
    const img = await downloadImage(u);
    if (img) return img;
  }
  return null;
}
