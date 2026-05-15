/**
 * Utilitaires partagés des modules d'animation (recap, play, lobby, join).
 *
 * Stratégie reduced-motion : chaque init* lit `prefersReducedMotion()` au plus
 * tôt et applique l'état final immédiatement (set, pas tween) pour respecter
 * la préférence système. Pas de "version dégradée" — soit on anime, soit on
 * ne touche pas.
 *
 * Pattern d'usage type :
 *   export function initFoo() {
 *     if (prefersReducedMotion()) return; // animations skip
 *     // … timelines
 *   }
 */

/** Vrai si l'utilisateur a demandé moins d'animations (OS-level). */
export function prefersReducedMotion(): boolean {
  // Guard SSR — sera appelé uniquement côté client via <script>, mais safe.
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Helper : exécute fn() uniquement si l'élément existe ET reduced-motion off. */
export function whenMotion(fn: () => void): void {
  if (prefersReducedMotion()) return;
  fn();
}

/**
 * Délai minimum avant d'animer : laisse au navigateur le temps de poser
 * le premier paint stable avant de tweener (évite le flash de fallback
 * Georgia → Fraunces qui se confond avec une vraie animation).
 */
export const FIRST_PAINT_DELAY = 50; // ms

/**
 * Easings tokens dupliqués depuis tokens.css (pour usage dans GSAP qui
 * accepte les strings ou les arrays — ici on garde les cubic-bezier).
 * Si tu changes ici, change aussi dans tokens.css.
 */
export const EASE = {
  expo: 'expo.out' as const,
  back: 'back.out(1.4)' as const,
  smooth: 'power3.inOut' as const,
  out: 'power2.out' as const,
} as const;
