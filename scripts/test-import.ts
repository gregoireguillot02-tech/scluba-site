#!/usr/bin/env node
// Local smoke-test for the club importer pipeline. Reads ANTHROPIC_API_KEY
// from process.env (or .dev.vars), scrapes a club URL passed as argv[2], runs
// the full Scrape + Claude pipeline and dumps the result as JSON. No Supabase,
// no auth — just validation that the extraction works.
//
// Usage:
//   ANTHROPIC_API_KEY=sk-ant-... npm run test:import -- https://www.golf-lyon-tassin.fr
//
// Or, if .dev.vars contains ANTHROPIC_API_KEY=...:
//   npm run test:import -- https://www.golf-lyon-tassin.fr

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { runImportPreview } from '../src/lib/club-importer/pipeline';

function loadDotenv(path: string): Record<string, string> {
  try {
    const content = readFileSync(path, 'utf-8');
    const out: Record<string, string> = {};
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq < 0) continue;
      const k = trimmed.slice(0, eq).trim();
      const v = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
      out[k] = v;
    }
    return out;
  } catch {
    return {};
  }
}

async function main(): Promise<void> {
  const url = process.argv[2];
  if (!url) {
    console.error('Usage: node --experimental-strip-types scripts/test-import.ts <URL>');
    process.exit(1);
  }

  const here = dirname(fileURLToPath(import.meta.url));
  const devVarsPath = join(here, '..', '.dev.vars');
  const envFallback = loadDotenv(devVarsPath);

  const apiKey = process.env.ANTHROPIC_API_KEY || envFallback.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('ANTHROPIC_API_KEY manquante.');
    console.error('Soit: ANTHROPIC_API_KEY=sk-ant-... node --experimental-strip-types scripts/test-import.ts <URL>');
    console.error("Soit: ajoute la ligne 'ANTHROPIC_API_KEY=sk-ant-...' dans scluba-site/.dev.vars puis relance.");
    process.exit(1);
  }

  const startedAt = Date.now();
  console.error(`→ Import depuis ${url} …`);
  try {
    const result = await runImportPreview({ url, apiKey });
    const elapsed = Date.now() - startedAt;
    console.error(`✓ Terminé en ${elapsed}ms`);
    console.error('');
    console.error('═══ Récap visuel ═══');
    console.error(`Nom         : ${result.name}`);
    console.error(`Ville       : ${result.city ?? '(non détectée)'}`);
    console.error(`Couleur     : ${result.primary_color}`);
    console.error(`Logo URL    : ${result.logo_url ?? '(aucun)'}`);
    console.error(`Photo URL   : ${result.photo_url ?? '(aucune)'}`);
    console.error(`Loops       : ${result.course_data.loops?.length ?? 0}`);
    for (const loop of result.course_data.loops ?? []) {
      const pars = loop.holes.map((h) => h.par).join(' ');
      const total = loop.holes.reduce((s, h) => s + h.par, 0);
      console.error(`  • ${loop.name} (${loop.holes.length} trous, par ${total}) → ${pars}`);
    }
    if (result.warnings.length) {
      console.error('');
      console.error('⚠  Warnings:');
      for (const w of result.warnings) console.error(`   - ${w}`);
    }
    if (result.llm_notes) {
      console.error('');
      console.error(`📝 Note IA : ${result.llm_notes}`);
    }
    console.error('');
    console.error('═══ JSON complet (stdout) ═══');
    process.stdout.write(JSON.stringify(result, null, 2));
    process.stdout.write('\n');
  } catch (err) {
    console.error('✗ Erreur:', err instanceof Error ? err.message : err);
    process.exit(2);
  }
}

main();
