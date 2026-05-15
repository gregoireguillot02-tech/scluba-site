/**
 * Animations de la page join (/r/[shortCode]/join) — claim de prénom.
 *
 * Le golfeur scanne le QR ou clique sur le lien d'invitation et arrive
 * ici. Premier contact avec le produit côté joueur. L'animation doit
 * faire sentir "j'ai pris ma carte" : claim cards en stagger fade-up,
 * tap = scale + radial honey ring (signal tactile).
 *
 * Reduced-motion : skip toutes les animations, le rendu Astro SSR a
 * déjà la page en état final.
 */

import { loadGsap, getAutoAnimate } from './registry';
import { prefersReducedMotion, EASE } from './utils';

export async function initJoinAnimations(): Promise<void> {
  if (typeof document !== 'undefined' && document.fonts?.ready) {
    await document.fonts.ready;
  }

  // autoAnimate sur la claim list — les claims des autres joueurs
  // (UPDATE realtime → claim retiré) sortent en fluide, et un INSERT
  // (orga ajoute un prénom oublié) entre fluide.
  const claimList = document.querySelector<HTMLElement>('[data-claim-list]');
  if (claimList) {
    const autoAnimate = await getAutoAnimate();
    autoAnimate(claimList, { duration: 280, easing: 'ease-out' });
  }

  if (prefersReducedMotion()) return;
  // /join n'a pas besoin de plugins GSAP — juste gsap core.
  const { gsap } = await loadGsap();

  gsap.context(() => {
    // Claim title + hint
    gsap.from('.claim-title', {
      autoAlpha: 0,
      y: 10,
      duration: 0.5,
      delay: 0.05,
      ease: EASE.expo,
    });
    gsap.from('.claim-hint', {
      autoAlpha: 0,
      y: 8,
      duration: 0.4,
      delay: 0.15,
      ease: EASE.expo,
    });

    // Claim cards stagger fade-up — "tu cherches ton nom" comme on
    // cherche sa carte sur le panneau d'affichage du club.
    gsap.from('.claim-list > li', {
      autoAlpha: 0,
      y: 12,
      duration: 0.45,
      stagger: 0.06,
      delay: 0.25,
      ease: EASE.expo,
    });

    // Self-add expand (visible si "Mon prénom n'est pas dans la liste")
    gsap.from('.selfadd-block', {
      autoAlpha: 0,
      y: 8,
      duration: 0.4,
      delay: 0.5,
      ease: EASE.expo,
    });

    // === Tap feedback sur les claim buttons ===
    // CSS gère le scale(0.97) sur :active (down). GSAP ajoute un
    // radial honey ring expansion subtle juste avant la soumission
    // du form. Donne le sentiment "j'ai pris ma carte".
    const claimBtns = document.querySelectorAll<HTMLElement>('.claim-btn');
    for (const btn of claimBtns) {
      btn.addEventListener('click', () => {
        // Ring expand via pseudo-élément animé (CSS), GSAP joue le
        // bounce scale subtil. La soumission native du form continue.
        gsap.fromTo(
          btn,
          { scale: 0.96 },
          { scale: 1, duration: 0.32, ease: 'back.out(2.2)' },
        );
      });
    }

    // Honey ring expansion : pseudo-élément ::after animé via inline
    // style. On crée un keyframe one-shot par click pour éviter de
    // polluer la CSS scoped Astro.
    // (Implémentation light : on toggle une classe is-ringing qui
    // déclenche un keyframe CSS, déjà préparé dans join.astro.)
  });
}
