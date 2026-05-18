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
 *
 * Amplifié dans le cadre du fil rouge Joyful Mist : scale 0.85 → 1 avec
 * back.out(2.2) qui produit un overshoot net (le bouton dépasse ~1.04 puis
 * se stabilise). Plus tactile que l'ancien elastic.out subtle (0.9 → 1) —
 * un golfeur qui tap doit *sentir* le bouton répondre, surtout sur Android
 * où l'haptic prend le relais.
 */
export async function flashSelected(btn: HTMLElement | null): Promise<void> {
  if (!btn || prefersReducedMotion()) return;
  const { gsap } = await gsapBundle();
  gsap.fromTo(
    btn,
    { scale: 0.85 },
    { scale: 1, duration: 0.55, ease: 'back.out(2.2)' },
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
 * Fade-y subtil sur le banner "TOUR DE [joueur]" quand le joueur courant
 * change (mode host). Communique le switch sans agresser — l'auto-advance
 * peut chaîner plusieurs switches, le banner doit "respirer" entre eux.
 * Spring elastic léger pour matcher le pattern des autres feedbacks.
 */
export async function flashPlayerSwitch(banner: HTMLElement | null): Promise<void> {
  if (!banner || prefersReducedMotion()) return;
  const { gsap } = await gsapBundle();
  gsap.fromTo(
    banner,
    { y: -6, autoAlpha: 0.4 },
    { y: 0, autoAlpha: 1, duration: 0.4, ease: 'expo.out' },
  );
}

/**
 * Étoile honey discrète qui se "dessine" à côté d'un score birdie+ dans
 * la scorecard live. SVG 12px injecté en absolute dans la cell, anim de
 * scale 0.4 → 1 + rotate −30° → 0 + autoAlpha 0 → 1, back-ease.
 *
 * Idempotent : si la cell a déjà une étoile (data-has-star), no-op. Permet
 * d'appeler en boucle dans render() sans accumuler des SVG.
 *
 * Reduced-motion : on injecte l'étoile mais sans animation (state final
 * immédiat) — le golfeur garde le repère visuel, juste pas le motion.
 */
export async function drawStar(cell: HTMLElement | null): Promise<void> {
  if (!cell) return;
  if (cell.dataset.hasStar === '1') return;
  // S'assurer que le parent est position-able. La grid-cell est inline-block
  // ou flex (cf. Scorecard.astro), donc on positionne en relative.
  if (getComputedStyle(cell).position === 'static') {
    cell.style.position = 'relative';
  }
  const star = document.createElement('span');
  star.className = 'joyful-star';
  star.setAttribute('aria-hidden', 'true');
  star.innerHTML =
    '<svg width="12" height="12" viewBox="0 0 12 12" focusable="false">' +
    '<polygon points="6,0.8 7.5,4.3 11.3,4.6 8.4,7.1 9.3,10.8 6,8.9 2.7,10.8 3.6,7.1 0.7,4.6 4.5,4.3" />' +
    '</svg>';
  Object.assign(star.style, {
    position: 'absolute',
    top: '-4px',
    right: '-4px',
    width: '12px',
    height: '12px',
    color: 'var(--accent, #D4A574)',
    pointerEvents: 'none',
    lineHeight: '0',
  } as Partial<CSSStyleDeclaration>);
  cell.appendChild(star);
  cell.dataset.hasStar = '1';
  if (prefersReducedMotion()) return;
  const { gsap } = await gsapBundle();
  gsap.fromTo(
    star,
    { autoAlpha: 0, scale: 0.4, rotation: -30 },
    {
      autoAlpha: 1,
      scale: 1,
      rotation: 0,
      duration: 0.6,
      ease: 'back.out(2.4)',
    },
  );
}

/**
 * Applique les classes de halo à chaque hole-chip de la mini-progression
 * (composant ScoreInput.astro, `.hole-progress`). Les classes existantes
 * `.is-current` et `.is-played` sont laissées intactes — on ajoute :
 *   - `.scored-below-par` si le trou a été joué sous le par (birdie+)
 *   - `.scored-above-par-2` si ≥ 2 strokes au-dessus du par (double bogey+)
 *
 * Pickup compte comme par + 2, donc déclenche `scored-above-par-2`.
 *
 * Idempotent : on supprime puis on ré-applique à chaque appel (cheap, le
 * nombre de chips reste petit — 9 à 27 typiquement).
 */
export function applyHoleHalos(
  chips: HTMLElement[],
  effectiveByHole: Map<number, number | null>,
  parByHole: Map<number, number>,
): void {
  for (const chip of chips) {
    const h = Number(chip.dataset.holeJump);
    if (!Number.isFinite(h)) continue;
    const eff = effectiveByHole.get(h);
    const par = parByHole.get(h);
    chip.classList.remove('scored-below-par', 'scored-above-par-2');
    if (eff === null || eff === undefined || par === undefined) continue;
    const diff = eff - par;
    if (diff < 0) chip.classList.add('scored-below-par');
    else if (diff >= 2) chip.classList.add('scored-above-par-2');
  }
}

/**
 * Active ou désactive l'effet "streak ring" sur une live-card du
 * leaderboard. Le ring autour de l'avatar passe à un stroke plus marqué
 * (géré en CSS via la classe `.has-streak`).
 *
 * `pulseLeaderRing` (burst one-shot quand un joueur prend la tête) reste
 * disponible séparément — c'est complémentaire, pas redondant.
 */
export function pulseStreakRing(card: HTMLElement | null, active: boolean): void {
  if (!card) return;
  card.classList.toggle('has-streak', active);
}

/**
 * Micro paper-transition appliquée au container du PAR/score quand on
 * change de trou. Subtil : y 6 → 0 + autoAlpha 0.6 → 1, 320ms expo.out.
 * Renforce la sensation tactile sans détourner l'œil du score.
 *
 * Idempotent (lance un nouveau tween qui overwrite le précédent grâce à
 * overwrite: 'auto'). Reduced-motion : no-op total (pas d'effet visuel
 * désagréable possible — on garde la transition CSS du browser).
 */
export async function paperTransitionToHole(container: HTMLElement | null): Promise<void> {
  if (!container || prefersReducedMotion()) return;
  const { gsap } = await gsapBundle();
  gsap.fromTo(
    container,
    { y: 6, autoAlpha: 0.6 },
    {
      y: 0,
      autoAlpha: 1,
      duration: 0.32,
      ease: EASE.expo,
      overwrite: 'auto',
    },
  );
}

/**
 * Affiche une ligne éditoriale dans la zone dédiée (`[data-editorial-line]`)
 * et la fait disparaître après 2.2s. Fraunces italique, fade-up 4px, expo.
 *
 * L'élément doit exister dans le DOM (rendu par ScoreInput.astro). On set
 * son textContent puis on enchaîne l'animation. Reduced-motion : opacity
 * 0 → 1 simple, même durée totale.
 *
 * Pas d'anti-spam ici — la décision (afficher ou non) est prise en amont
 * par templates.canShowLine() côté play.astro.
 */
export async function showEditorialLine(
  el: HTMLElement | null,
  text: string,
): Promise<void> {
  if (!el || !text) return;
  el.textContent = text;
  const { gsap } = await gsapBundle();
  if (prefersReducedMotion()) {
    gsap.fromTo(el, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.2 });
    gsap.to(el, { autoAlpha: 0, duration: 0.2, delay: 2.4 });
    return;
  }
  gsap.fromTo(
    el,
    { autoAlpha: 0, y: 4 },
    { autoAlpha: 1, y: 0, duration: 0.32, ease: EASE.expo },
  );
  gsap.to(el, { autoAlpha: 0, duration: 0.28, delay: 2.2, ease: EASE.expo });
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
