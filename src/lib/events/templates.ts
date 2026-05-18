/**
 * Templates des lignes éditoriales affichées sur les events live + helper
 * d'anti-spam (max une ligne toutes les 3 holes, sauf eagle/hio qui bypass).
 *
 * Le ton est country-club magazine : Fraunces italique, phrases courtes,
 * pas de "wow / great / nice" — juste un constat élégant. Cf. décision
 * brainstorming 2026-05-18.
 *
 * Le compteur `lastLineHole` est tenu par l'appelant (play.astro) — cette
 * lib reste pure / sans state pour rester testable.
 */

import type { RoundEvent } from './round-events';

/** Texte affiché pour chaque event. Pickup ou strokes inconnus → string vide. */
export function lineFor(event: RoundEvent): string {
  switch (event.type) {
    case 'first_birdie':
      return `Premier birdie. Trou ${event.hole}.`;
    case 'eagle':
      return `Eagle. Trou ${event.hole}.`;
    case 'hio':
      return `Trou-en-un. Trou ${event.hole}.`;
    case 'streak_pars':
      return `${event.count} pars d'affilée. Régularité.`;
    case 'declic':
      return `Le déclic, trou ${event.hole}.`;
  }
}

/**
 * Anti-spam : décide si on peut afficher la ligne pour cet event.
 *
 *  - `eagle` et `hio` bypass (toujours montrés).
 *  - Les autres events demandent ≥ 3 trous joués depuis la dernière ligne.
 *  - Si `lastLineHole === null` (jamais affiché), c'est toujours autorisé.
 */
export function canShowLine(
  event: RoundEvent,
  currentHole: number,
  lastLineHole: number | null,
): boolean {
  if (event.type === 'eagle' || event.type === 'hio') return true;
  if (lastLineHole === null) return true;
  return currentHole - lastLineHole >= 3;
}
