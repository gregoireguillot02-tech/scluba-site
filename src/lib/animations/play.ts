/**
 * Animations de la page play (/r/[shortCode]/play) — daily companion.
 *
 * Priorité : sobre, focus lisibilité long-session. Le golfeur reste 2-4h
 * sur cette page, des animations spectaculaires fatigueraient (et videraient
 * la batterie). On se limite à des micro-feedbacks utiles :
 *
 *  - flashPar(el) : à chaque changement de trou, le chiffre PAR fait un
 *    petit pop fade-y + back-ease.
 *  - flashSelected(btn) : pulse subtile sur le bouton par-relative qui
 *    vient d'être sélectionné.
 *  - flashFeedback(el) : fade-in de la ligne "Birdie · −1 vs par".
 *
 * Refonte live-leaderboard (PR#68) — ajout des helpers narrative :
 *  - flipLeaderboard(items, rebuildDom) : reorder fluide via GSAP Flip
 *    plugin (remplace le FLIP vanilla custom de play.astro).
 *  - countUp(el, from, to) : chiffre qui s'incrémente sur changement
 *    de score plutôt qu'un swap brutal.
 *  - pulseLeaderRing(card) : ring honey burst quand un joueur prend
 *    la tête — communique l'événement "tu n'es plus leader".
 *
 * Bundle : GSAP Flip ajoute ~12kb gz à /play, mais retire ~30 LOC de
 * FLIP vanilla custom + récupère stagger natif. Acceptable.
 */

import { loadGsap, loadFlip } from './registry';
import { prefersReducedMotion, EASE } from './utils';

let gsapPromise: ReturnType<typeof loadGsap> | null = null;
function gsapBundle() {
  if (!gsapPromise) gsapPromise = loadGsap();
  return gsapPromise;
}

let flipPromise: ReturnType<typeof loadFlip> | null = null;
function flipBundle() {
  if (!flipPromise) flipPromise = loadFlip();
  return flipPromise;
}

/**
 * Pop le chiffre PAR à chaque changement de trou (dot tap, swipe, auto-advance).
 * Subtile : -12px → 0 + opacity, 320ms, back-ease 1.6.
 */
export async function flashPar(el: HTMLElement | null): Promise<void> {
  if (!el || prefersReducedMotion()) return;
  const { gsap } = await gsapBundle();
  gsap.fromTo(
    el,
    { y: -12, autoAlpha: 0 },
    { y: 0, autoAlpha: 1, duration: 0.32, ease: 'back.out(1.6)' },
  );
}

/**
 * Quick pulse sur le bouton par-relative qui vient d'être sélectionné.
 * Spring physique : elastic.out(1, 0.4) simule un vrai ressort qui se
 * libère du tap — le bouton dépasse légèrement la cible puis se stabilise.
 * Inspiré SwiftUI .spring(response: 0.4, dampingFraction: 0.6).
 */
export async function flashSelected(btn: HTMLElement | null): Promise<void> {
  if (!btn || prefersReducedMotion()) return;
  const { gsap } = await gsapBundle();
  gsap.fromTo(
    btn,
    { scale: 0.9 },
    { scale: 1, duration: 0.55, ease: 'elastic.out(1, 0.4)' },
  );
}

/**
 * Fade-in de la ligne de feedback ("Birdie · −1 vs par") quand son
 * contenu change.
 */
export async function flashFeedback(el: HTMLElement | null): Promise<void> {
  if (!el || prefersReducedMotion()) return;
  const { gsap } = await gsapBundle();
  gsap.fromTo(
    el,
    { autoAlpha: 0, y: 4 },
    { autoAlpha: 1, y: 0, duration: 0.28, ease: EASE.expo },
  );
}

/**
 * Reorder fluide du live-leaderboard via GSAP Flip plugin.
 *
 * Remplace le FLIP vanilla custom (translateY + transition CSS) qui
 * fonctionnait mais sans stagger, sans absolute positioning, et avec
 * un layout shift visible pendant le reorder. Flip plugin gère tout
 * proprement avec `absolute: true` (les rows quittent le flow le
 * temps de l'anim) et stagger natif.
 *
 * Usage :
 *   const oldItems = Array.from(list.children) as HTMLElement[];
 *   await flipLeaderboard(oldItems, () => {
 *     list.replaceChildren(...newItems);
 *   });
 *
 * Reduced-motion : skip Flip, juste exécuter rebuildDom() immédiatement.
 */
export async function flipLeaderboard(
  items: HTMLElement[],
  rebuildDom: () => void,
): Promise<void> {
  if (prefersReducedMotion()) {
    rebuildDom();
    return;
  }
  const { gsap, Flip } = await flipBundle();
  const state = Flip.getState(items, { props: 'opacity,backgroundColor' });
  rebuildDom();
  Flip.from(state, {
    duration: 0.45,
    ease: 'power3.out',
    stagger: 0.025,
    absolute: true,
    onEnter: (els) =>
      gsap.fromTo(
        els,
        { autoAlpha: 0, y: 8 },
        { autoAlpha: 1, y: 0, duration: 0.3, ease: EASE.expo },
      ),
    onLeave: (els) => gsap.to(els, { autoAlpha: 0, duration: 0.2 }),
  });
}

/**
 * Anime un chiffre qui change (ex : score cumulé d'un joueur qui passe
 * de 12 à 15 après saisie d'un trou). Plus narrative que textContent =
 * newValue brutal — donne le sens "le verdict se précise".
 *
 * Si reduced-motion, set la valeur finale immédiatement.
 */
export async function countUp(
  el: HTMLElement | null,
  from: number,
  to: number,
  duration = 0.4,
): Promise<void> {
  if (!el) return;
  if (prefersReducedMotion() || from === to) {
    el.textContent = String(to);
    return;
  }
  const { gsap } = await gsapBundle();
  const obj = { val: from };
  gsap.to(obj, {
    val: to,
    duration,
    ease: 'expo.out',
    onUpdate() {
      el.textContent = String(Math.round(obj.val));
    },
  });
}

/**
 * Ring honey burst depuis une card (utilisée quand un joueur prend la
 * tête du classement). Overlay div positionné absolu sur la card, anime
 * scale 1 → 1.08 + opacity 0.7 → 0, puis se retire du DOM.
 *
 * La card doit avoir `position: relative` (déjà le cas pour .live-card).
 */
export async function pulseLeaderRing(card: HTMLElement | null): Promise<void> {
  if (!card || prefersReducedMotion()) return;
  const { gsap } = await gsapBundle();
  const ring = document.createElement('span');
  ring.setAttribute('aria-hidden', 'true');
  Object.assign(ring.style, {
    position: 'absolute',
    inset: '-2px',
    borderRadius: '14px',
    border: '2px solid rgba(212, 165, 116, 0.85)',
    pointerEvents: 'none',
    opacity: '0',
  } as Partial<CSSStyleDeclaration>);
  card.appendChild(ring);
  gsap.fromTo(
    ring,
    { scale: 1, opacity: 0.75 },
    {
      scale: 1.08,
      opacity: 0,
      duration: 0.65,
      ease: 'power2.out',
      onComplete: () => ring.remove(),
    },
  );
}
