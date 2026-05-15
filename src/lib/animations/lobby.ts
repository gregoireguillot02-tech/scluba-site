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

import { loadGsap, loadSplitText, getAutoAnimate } from './registry';
import { prefersReducedMotion, isViewTransitionArrival, EASE } from './utils';

type GsapInstance = Awaited<ReturnType<typeof loadGsap>>['gsap'];

/**
 * QR popover spring : intercept le toggle existant pour animer l'ouverture.
 * Extrait dans une fonction réutilisable car appelé depuis 2 chemins :
 *  - normal flow (fresh load) — après les entrance reveals GSAP
 *  - VT arrival (depuis /join) — SEULE animation nécessaire car Astro
 *    a déjà animé les hero elements, pas besoin de ré-animer
 *
 * Le handler existant flip popover.hidden APRÈS ce listener (ordre
 * d'exécution). À ce stade `hidden` est encore son ancienne valeur.
 * On lit donc le state via requestAnimationFrame après le flip.
 */
function setupQrSpring(gsap: GsapInstance): void {
  const qrToggleBtn = document.querySelector<HTMLElement>('[data-toggle-qr]');
  const qrPopover = document.querySelector<HTMLElement>('[data-qr-popover]');
  if (!qrToggleBtn || !qrPopover) return;
  qrToggleBtn.addEventListener('click', () => {
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

  // Si arrivée via View Transition (depuis /join), Astro a déjà animé
  // les éléments matched (photo, logo, titre Masthead). On skip les
  // entrance animations GSAP pour éviter le double effet et le délai
  // d'attente — le QR popover spring reste actif (utilisé sur tap, pas
  // au load), et autoAnimate sur players list reste actif aussi (déjà
  // setup plus haut, hors du if).
  const fromVT = isViewTransitionArrival();
  if (fromVT) {
    // Setup uniquement le QR popover spring (interaction, pas entrance).
    // On charge gsap core seul — pas besoin de SplitText puisqu'on skip
    // le SplitText du code XL.
    const { gsap: gsapCore } = await loadGsap();
    setupQrSpring(gsapCore);
    return;
  }

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

    // Start CTA — pas de fade GSAP : le pulse glow CSS (cf.
    // @keyframes cta-pulse dans index.astro) gère déjà l'effet "prêt à
    // lancer". Le fade gsap.from posait autoAlpha:0 immédiatement +
    // tween 1.4s ; si le tween échouait (Safari iOS background tab,
    // batterie low, focus perdu) le bouton restait invisible et
    // bloquait le démarrage de la partie. Hotfix 2026-05-15.

    // QR popover spring (interaction, pas entrance)
    setupQrSpring(gsap);
  });
}
