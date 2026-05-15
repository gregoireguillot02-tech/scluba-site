/**
 * Registry GSAP — chargeurs par plugin pour permettre le code-splitting.
 *
 * Chaque page joueur consomme un sous-ensemble des plugins GSAP :
 *   /r/play      → gsap core (zéro plugin) + autoAnimate
 *   /r/join      → gsap core (zéro plugin) + autoAnimate
 *   /r/[lobby]   → gsap core + SplitText (code drop-in) + autoAnimate
 *   /r/recap     → gsap core + ScrollTrigger + SplitText (zéro Flip)
 *
 * Sans split, chaque page charge ~80kb gz de plugins inutiles. Le split
 * fait économiser ~40kb sur /play (la page longue-session, on prend
 * tous les wins batterie/latence). Chaque loader est idempotent (un
 * plugin n'est registerPlugin'é qu'une fois par session).
 *
 * Tous les plugins sont gratuits depuis GSAP 3.13 (relicensing MIT
 * par Webflow, mai 2024).
 */

const registered = new Set<string>();

/** Charge gsap core. Idempotent — appels successifs renvoient le même module. */
export async function loadGsap() {
  if (typeof window === 'undefined') {
    throw new Error('loadGsap() doit être appelé côté client uniquement');
  }
  const { gsap } = await import('gsap');
  if (!registered.has('defaults')) {
    gsap.defaults({ ease: 'power2.out', duration: 0.3 });
    registered.add('defaults');
  }
  return { gsap };
}

/** Charge gsap + ScrollTrigger. Pour les reveals au scroll + parallax. */
export async function loadScrollTrigger() {
  const { gsap } = await loadGsap();
  const { ScrollTrigger } = await import('gsap/ScrollTrigger');
  if (!registered.has('ScrollTrigger')) {
    gsap.registerPlugin(ScrollTrigger);
    registered.add('ScrollTrigger');
  }
  return { gsap, ScrollTrigger };
}

/** Charge gsap + SplitText. Pour les reveals char-by-char (titres, code). */
export async function loadSplitText() {
  const { gsap } = await loadGsap();
  const { SplitText } = await import('gsap/SplitText');
  if (!registered.has('SplitText')) {
    gsap.registerPlugin(SplitText);
    registered.add('SplitText');
  }
  return { gsap, SplitText };
}

/** Charge gsap + Flip. Pour les transitions DOM-reorder (leaderboards). */
export async function loadFlip() {
  const { gsap } = await loadGsap();
  const { Flip } = await import('gsap/Flip');
  if (!registered.has('Flip')) {
    gsap.registerPlugin(Flip);
    registered.add('Flip');
  }
  return { gsap, Flip };
}

/**
 * Charge tout (compat ascendante pour les modules qui n'ont pas
 * encore migré vers le code-split). Préférer les loaders ciblés
 * sur les nouvelles pages.
 *
 * @deprecated Use loadGsap + loadScrollTrigger/loadSplitText/loadFlip
 *   per-need to reduce bundle size on pages that don't need everything.
 */
export interface GsapBundle {
  gsap: typeof import('gsap').gsap;
  ScrollTrigger: typeof import('gsap/ScrollTrigger').ScrollTrigger;
  Flip: typeof import('gsap/Flip').Flip;
  SplitText: typeof import('gsap/SplitText').SplitText;
}

export async function registerGsap(): Promise<GsapBundle> {
  const [{ gsap }, { ScrollTrigger }, { Flip }, { SplitText }] = await Promise.all([
    loadGsap(),
    loadScrollTrigger(),
    loadFlip(),
    loadSplitText(),
  ]);
  return { gsap, ScrollTrigger, Flip, SplitText };
}

/**
 * Re-export léger de @formkit/auto-animate pour les listes réordonnables
 * (live leaderboard, lobby players, claim list). API : autoAnimate(parent).
 * 2.4kb gzipped, respecte prefers-reduced-motion nativement.
 */
export async function getAutoAnimate() {
  const mod = await import('@formkit/auto-animate');
  return mod.default;
}
