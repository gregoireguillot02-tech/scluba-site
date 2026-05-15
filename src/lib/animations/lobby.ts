/**
 * Animations de la page lobby (/r/[shortCode]) — phase avant départ.
 *
 * Objectifs :
 *  - Faire monter l'attente : le code de partie XL en char-by-char
 *    SplitText, ressenti "billet de match" plutôt que "checksum tech".
 *  - Players list naturellement vivante : chaque arrivée (creator
 *    invite scan) anime sans qu'on touche au code realtime existant
 *    (autoAnimate écoute les mutations DOM).
 *  - QR popover : spring scale-in à l'ouverture, dismiss naturel.
 *  - CTA "C'est parti" : pulse glow honey une fois canStart=true,
 *    communique "prêt à lancer". Géré en CSS (cf. styles inline lobby).
 *
 * Reduced-motion : SplitText skip, autoAnimate respecte nativement.
 */

import { loadSplitText, getAutoAnimate } from './registry';
import { prefersReducedMotion, EASE } from './utils';

export async function initLobbyAnimations(): Promise<void> {
  if (typeof document !== 'undefined' && document.fonts?.ready) {
    await document.fonts.ready;
  }

  // === autoAnimate sur la players list ===
  // Inscrit le parent : ANY mutation (insert via realtime, remove
  // via API DELETE) déclenche une transition fluide. Aucun code à
  // changer dans le subscribeToRound callback existant.
  const playersList = document.querySelector<HTMLElement>('[data-players-list]');
  if (playersList) {
    const autoAnimate = await getAutoAnimate();
    autoAnimate(playersList, { duration: 320, easing: 'ease-out' });
  }

  // === GSAP : SplitText sur code + QR popover spring + entrées staggered ===
  if (prefersReducedMotion()) return;
  // /lobby a besoin de gsap + SplitText (pour le code XL drop-in) mais
  // ni ScrollTrigger ni Flip → code-split via loadSplitText().
  const { gsap, SplitText } = await loadSplitText();

  gsap.context(() => {
    // Code de la partie : SplitText chars drop-in
    const codeEl = document.querySelector<HTMLElement>('.code-value');
    if (codeEl) {
      // Préserve l'accessibilité — le texte brut reste dans aria-label
      if (!codeEl.getAttribute('aria-label')) {
        codeEl.setAttribute('aria-label', `Code ${codeEl.textContent ?? ''}`);
      }
      const split = new SplitText(codeEl, { type: 'chars' });
      gsap.from(split.chars, {
        yPercent: 60,
        autoAlpha: 0,
        duration: 0.6,
        stagger: 0.05,
        ease: 'back.out(1.2)',
        delay: 0.15,
      });
    }

    // Code eyebrow + hint + invite-actions : fade-up doux
    gsap.from('.code-eyebrow', {
      autoAlpha: 0,
      y: 6,
      duration: 0.4,
      delay: 0.05,
      ease: EASE.expo,
    });
    gsap.from('.code-hint', {
      autoAlpha: 0,
      y: 6,
      duration: 0.4,
      delay: 0.6,
      ease: EASE.expo,
    });
    gsap.from('.invite-actions > *', {
      autoAlpha: 0,
      y: 8,
      duration: 0.4,
      delay: 0.7,
      stagger: 0.08,
      ease: EASE.expo,
    });

    // Players block reveal
    gsap.from('.players-head', {
      autoAlpha: 0,
      y: 8,
      duration: 0.4,
      delay: 0.55,
      ease: EASE.expo,
    });
    gsap.from('.players-list > .player-item', {
      autoAlpha: 0,
      y: 6,
      duration: 0.4,
      stagger: 0.06,
      delay: 0.7,
      ease: EASE.expo,
    });

    // Start CTA fade-up
    gsap.from('.start-btn', {
      autoAlpha: 0,
      y: 12,
      duration: 0.5,
      delay: 0.9,
      ease: EASE.expo,
    });

    // QR popover : intercept le toggle existant pour animer l'ouverture.
    // L'existant toggle popover.hidden ; on ne change pas la logique,
    // on ajoute juste un fade+scale quand le button data-toggle-qr
    // est cliqué et que le popover passe de hidden=true → false.
    const qrToggleBtn = document.querySelector<HTMLElement>('[data-toggle-qr]');
    const qrPopover = document.querySelector<HTMLElement>('[data-qr-popover]');
    if (qrToggleBtn && qrPopover) {
      qrToggleBtn.addEventListener('click', () => {
        // Le handler existant flip popover.hidden APRÈS ce listener
        // (ordre d'exécution). Mais à ce stade `hidden` est encore son
        // ancienne valeur. On lit donc l'opposé pour deviner le nouveau
        // state. (Ou on attache un raf pour lire après le flip.)
        requestAnimationFrame(() => {
          if (qrPopover.hidden) return;
          gsap.fromTo(
            qrPopover,
            { scale: 0.92, autoAlpha: 0 },
            { scale: 1, autoAlpha: 1, duration: 0.28, ease: 'back.out(1.4)' },
          );
        });
      });
    }
  });
}
