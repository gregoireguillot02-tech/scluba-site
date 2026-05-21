import { assertSafeUrl, SafeFetchError } from '../safe-fetch';
import { buildCourseData } from './defaults';
import { extractClubData } from './llm';
import { downloadFirstValid, scrapeClubSite } from './scrape';
import type { ImportResult } from './types';

const DEFAULT_PRIMARY_COLOR = '#1B4332';

function normalizeHex(value: string | null | undefined): string {
  if (!value) return DEFAULT_PRIMARY_COLOR;
  const v = value.trim().toUpperCase();
  if (!/^#[0-9A-F]{6}$/.test(v)) return DEFAULT_PRIMARY_COLOR;
  return v;
}

/**
 * Orchestrates the import preview pipeline: scrape the site, download the
 * best logo and photo, ask the LLM to structure the data, and build a
 * {@link ImportResult} that the admin UI can render and edit.
 *
 * The entry URL is validated through {@link assertSafeUrl} — scheme allowlist,
 * IP-literal rejection, internal-hostname rejection — before any outbound
 * fetch. Each downstream candidate URL is re-validated by the scraper too.
 *
 * Image URLs returned here point at the source site (external). Persisting
 * to Supabase Storage happens later in `from-import.ts`.
 */
export async function runImportPreview(args: {
  url: string;
  apiKey: string;
}): Promise<ImportResult> {
  const { url, apiKey } = args;

  let parsed: URL;
  try {
    parsed = assertSafeUrl(url);
  } catch (err) {
    if (err instanceof SafeFetchError) throw err;
    throw new SafeFetchError('invalid_url', 'URL invalide');
  }

  const scraped = await scrapeClubSite(parsed.toString());

  const logo = await downloadFirstValid(scraped.logoCandidates);
  const photo = await downloadFirstValid(scraped.photoCandidates);

  const extracted = await extractClubData({
    apiKey,
    sourceUrl: parsed.toString(),
    textContent: scraped.textContent,
    logo,
  });

  const { course_data, warnings } = buildCourseData(extracted);

  const allWarnings = [...warnings];
  if (!logo) allWarnings.push("Aucun logo détecté — uploade-en un à la main après import.");
  if (!photo) allWarnings.push("Aucune photo hero détectée — uploade-en une à la main après import.");
  if (extracted.confidence.name === 'low') allWarnings.push(`Nom incertain : "${extracted.name}" — vérifie.`);

  return {
    source_url: parsed.toString(),
    name: extracted.name,
    city: extracted.city,
    primary_color: normalizeHex(extracted.primary_color),
    logo_url: logo?.sourceUrl ?? null,
    photo_url: photo?.sourceUrl ?? null,
    course_data,
    warnings: allWarnings,
    llm_notes: extracted.notes,
  };
}
