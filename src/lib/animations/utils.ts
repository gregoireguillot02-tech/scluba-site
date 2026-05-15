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

/**
 * Vrai si la page courante a été atteinte via une View Transition Astro
 * depuis une autre page joueur (/r/CODE/*).
 *
 * Quand c'est le cas, Astro a déjà morphé les éléments matched-geometry
 * (logo, photo, titre) entre l'ancienne page et la nouvelle. Si on
 * relance les entrance animations GSAP (gsap.from sur .photo-card,
 * SplitText sur club name, etc.) par-dessus, on a un double effet
 * disgracieux (fade VT + scale GSAP simultanés).
 *
 * Donc chaque init*Animations() check ce helper et SKIP les entrance
 * sur les hero elements quand VT arrival === true. Les animations
 * spécifiques à la page (score count-up, grid stagger reveal,
 * leaderboard reveal) restent active.
 *
 * Détection : same-origin + référent matche /r/CODE/* (sibling player
 * page). Approche simple et fiable, pas besoin d'event listeners.
 */
export function isViewTransitionArrival(): boolean {
  if (typeof document === 'undefined') return false;
  if (!document.referrer) return false;
  try {
    const ref = new URL(document.referrer);
    if (ref.origin !== window.location.origin) return false;
    // Tout /r/<code>... compte comme page sibling. On exclut /r/ tout court.
    return /^\/r\/[^/]+/.test(ref.pathname);
  } catch {
    return false;
  }
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
