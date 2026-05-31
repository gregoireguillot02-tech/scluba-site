/**
 * Format unique des chiffres du classement — partagé entre le vrai flow
 * (play.astro) et les prototypes /variants, pour que les deux affichent les
 * scores exactement pareil. Module pur (zéro DOM/Astro), importable serveur
 * comme client.
 */

/** Score vs par : « — » avant le 1er trou, « ±0 » au par, « +N » / « -N » sinon. */
export function fmtToPar(diff: number, played: number): string {
  if (played === 0) return '—';
  if (diff === 0) return '±0';
  return diff > 0 ? `+${diff}` : String(diff);
}

/** Retard sur le leader : « ±0 » si à égalité de diff, « +N » sinon. */
export function ecartToLeader(diff: number, leaderDiff: number): string {
  const gap = diff - leaderDiff;
  if (gap === 0) return '±0';
  return gap > 0 ? `+${gap}` : String(gap);
}
