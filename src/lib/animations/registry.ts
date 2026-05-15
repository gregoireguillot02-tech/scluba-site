/**
 * Registry GSAP — point d'entrée centralisé pour la suite GSAP.
 *
 * Garantit que :
 *  - Les plugins (ScrollTrigger, SplitText, Flip) sont enregistrés UNE
 *    SEULE fois pour toute la session (idempotent).
 *  - GSAP n'est jamais évalué côté serveur (window est requis).
 *  - Le code appelant n'a pas à se soucier de l'ordre d'import.
 *
 * Tous les plugins sont gratuits depuis GSAP 3.13 (relicensing MIT par
 * Webflow, mai 2024). Pas de Club GreenSock nécessaire.
 *
 * Pattern d'usage :
 *   import { registerGsap } from '../lib/animations/registry';
 *   const { gsap, ScrollTrigger } = await registerGsap();
 *
 * Pour les listes simples (lobby players, leaderboard), utiliser plutôt
 * `getAutoAnimate()` qui retourne l'API @formkit/auto-animate (2.4kb).
 */

let registered = false;

interface GsapBundle {
  gsap: typeof import('gsap').gsap;
  ScrollTrigger: typeof import('gsap/ScrollTrigger').ScrollTrigger;
  Flip: typeof import('gsap/Flip').Flip;
  SplitText: typeof import('gsap/SplitText').SplitText;
}

/**
 * Charge et enregistre la suite GSAP côté client. Idempotent : appels
 * successifs renvoient les mêmes instances.
 *
 * Code-splittable : les plugins sont chargés via dynamic import. Sur les
 * pages qui n'animent rien (ex: lobby qui utilise uniquement autoAnimate),
 * GSAP n'est jamais chargé.
 */
export async function registerGsap(): Promise<GsapBundle> {
  if (typeof window === 'undefined') {
    throw new Error('registerGsap() doit être appelé côté client uniquement');
  }

  const [{ gsap }, { ScrollTrigger }, { Flip }, { SplitText }] = await Promise.all([
    import('gsap'),
    import('gsap/ScrollTrigger'),
    import('gsap/Flip'),
    import('gsap/SplitText'),
  ]);

  if (!registered) {
    gsap.registerPlugin(ScrollTrigger, Flip, SplitText);
    // Defaults globaux : ease cohérent avec les tokens CSS, duration courte
    // (les durations longues sont surchargées par chaque timeline).
    gsap.defaults({ ease: 'power2.out', duration: 0.3 });
    registered = true;
  }

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
