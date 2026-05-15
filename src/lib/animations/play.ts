/**
 * Animations de la page play (/r/[shortCode]/play) — daily companion.
 *
 * Priorité : sobre, focus lisibilité long-session. Le golfeur reste 2-4h
 * sur cette page, des animations spectaculaires fatigueraient (et videraient
 * la batterie). On se limite à des micro-feedbacks utiles :
 *
 *  - flashPar(el) : à chaque changement de trou, le chiffre PAR fait un
 *    petit pop fade-y + back-ease. Confirme visuellement la navigation.
 *  - flashSelected(btn) : pulse subtile sur le bouton par-relative qui
 *    vient d'être sélectionné (sur tap → save → re-render).
 *  - flashFeedback(el) : fade-in de la ligne "Birdie · −1 vs par" quand
 *    elle change.
 *
 * Les transitions plus lourdes (Flip leaderboard via GSAP, swipe content
 * transition gesture-tracked) sont reportées en PR5 polish — l'ergonomie
 * du score input PR3 est déjà l'impact majeur sur l'UX joueur.
 */

import { registerGsap } from './registry';
import { prefersReducedMotion, EASE } from './utils';

let gsapPromise: ReturnType<typeof registerGsap> | null = null;
function gsapBundle() {
  if (!gsapPromise) gsapPromise = registerGsap();
  return gsapPromise;
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
 * Visible feedback que le tap a été enregistré (avant l'auto-advance).
 */
export async function flashSelected(btn: HTMLElement | null): Promise<void> {
  if (!btn || prefersReducedMotion()) return;
  const { gsap } = await gsapBundle();
  // Scale up légèrement puis retour à 1, sur l'élément déjà en is-selected.
  // La CSS gère le scale(0.96) sur :active (down phase), GSAP fait le
  // bounce-up à la sélection (up phase).
  gsap.fromTo(
    btn,
    { scale: 0.92 },
    { scale: 1, duration: 0.34, ease: 'back.out(2)' },
  );
}

/**
 * Fade-in de la ligne de feedback ("Birdie · −1 vs par") quand son
 * contenu change. Évite l'apparition brutale, donne un sens de continuité.
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
