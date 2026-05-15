/**
 * Animations de la page récap (/r/[shortCode]/recap) — "the wouaw page".
 *
 * Architecture en 3 actes + photo parallax au scroll :
 *
 *  Acte I  — Reveal au load (1.6s)
 *    photo scale-in → logo pop → eyebrow chars stagger →
 *    title-rails scaleX → club name chars mask-reveal
 *
 *  Acte II — Le verdict (1.2s, delay 1.0s)
 *    score-eyebrow fade → score count-up avec motion-blur (4→0px)
 *    → score-meta fade-up → score-note (si pickedUp > 0) fade
 *
 *  Acte III — La carte (scroll-triggered)
 *    grid cells stagger reveal → legend → leaderboard rows stagger
 *    → weather → comment → player-row + share → colophon rails
 *
 *  Photo parallax — translateY -10% sur 60vh, scrub linear
 *
 * Reduced-motion : tout est skip, on pose juste le state final
 * (score = target, opacity = 1 partout).
 *
 * Sélecteurs ciblés (classes réelles dans le DOM rendu, pas affectées
 * par le scoping Astro CSS) :
 *   .photo-card, .logo-frame, .masthead-eyebrow, .title-rail, .masthead-title
 *   .score-eyebrow, .score-value[data-target], .score-meta, .score-note
 *   .grid-block, .grid-cell, .grid-legend
 *   .leaderboard, .lb-row
 *   .comment-block, .player-row, .share-btn (météo intégrée dans .meta-strip)
 *   .colophon-rail
 */

import { loadScrollTrigger, loadSplitText } from './registry';
import { prefersReducedMotion, EASE } from './utils';

// Type aliases — récap a besoin de ScrollTrigger + SplitText mais pas
// de Flip → chargement parallèle des deux plugins via Promise.all.
type GsapInstance = Awaited<ReturnType<typeof loadScrollTrigger>>['gsap'];
type ScrollTriggerStatic = Awaited<ReturnType<typeof loadScrollTrigger>>['ScrollTrigger'];
type SplitTextStatic = Awaited<ReturnType<typeof loadSplitText>>['SplitText'];
interface RecapBundle {
  gsap: GsapInstance;
  ScrollTrigger: ScrollTriggerStatic;
  SplitText: SplitTextStatic;
}

/** Entrée publique — appelée depuis le <script> de recap.astro. */
export async function initRecapAnimations(): Promise<void> {
  // Attend les fonts pour éviter un layout shift quand SplitText
  // recalcule les positions des chars avec Fraunces. Sans ça, le
  // reveal du titre peut sauter d'1-2 pixels au moment du font swap.
  if (typeof document !== 'undefined' && document.fonts?.ready) {
    await document.fonts.ready;
  }

  if (prefersReducedMotion()) {
    applyReducedMotionFinalState();
    return;
  }

  // Load ScrollTrigger + SplitText en parallèle, mais PAS Flip
  // (recap n'utilise pas Flip → ~20kb gz économisés).
  const [st, sp] = await Promise.all([loadScrollTrigger(), loadSplitText()]);
  const bundle: RecapBundle = {
    gsap: st.gsap,
    ScrollTrigger: st.ScrollTrigger,
    SplitText: sp.SplitText,
  };
  const { gsap } = bundle;

  // gsap.context() scope les sélecteurs au document ET capture toutes
  // les timelines + ScrollTriggers pour un revert() propre si jamais
  // View Transitions sont activées plus tard.
  gsap.context(() => {
    playLoadActes(bundle);
    setupScrollActes(bundle);
    setupPhotoParallax(bundle);
  });
}

/* ---------------------------------------------------------------- */
/* Reduced-motion : pose immédiatement l'état final visible          */
/* ---------------------------------------------------------------- */
function applyReducedMotionFinalState(): void {
  // Count-up : passe direct à la valeur cible.
  const scoreEl = document.querySelector<HTMLElement>('.score-value');
  if (scoreEl?.dataset.target) {
    scoreEl.textContent = scoreEl.dataset.target;
    scoreEl.style.filter = '';
  }
  // Tout le reste reste visible par défaut (pas de set opacity:0
  // pré-animation), donc aucun ajustement nécessaire.
}

/* ---------------------------------------------------------------- */
/* Acte I + Acte II : timeline maître au load                        */
/* ---------------------------------------------------------------- */
function playLoadActes({ gsap, SplitText }: RecapBundle): void {
  // SplitText sur eyebrow + title : préserver l'accessibilité en
  // gardant le texte original dans aria-label si pas déjà set.
  const eyebrowEl = document.querySelector<HTMLElement>('.masthead-eyebrow');
  const titleEl = document.querySelector<HTMLElement>('.masthead-title');
  if (titleEl && !titleEl.getAttribute('aria-label')) {
    titleEl.setAttribute('aria-label', titleEl.textContent ?? '');
  }
  if (eyebrowEl && !eyebrowEl.getAttribute('aria-label')) {
    eyebrowEl.setAttribute('aria-label', eyebrowEl.textContent ?? '');
  }

  const splitEyebrow = eyebrowEl ? new SplitText(eyebrowEl, { type: 'chars' }) : null;
  const splitTitle = titleEl ? new SplitText(titleEl, { type: 'chars,words' }) : null;

  const tl = gsap.timeline({ defaults: { ease: EASE.expo } });

  // === Acte I (au load, ~1.6s) ==================================

  tl
    // 1. Photo card : scale-in léger depuis 1.08
    .fromTo(
      '.photo-card',
      { scale: 1.08, autoAlpha: 0 },
      { scale: 1, autoAlpha: 1, duration: 0.8 },
      0,
    )
    // 2. Logo frame : pop + slight rotate
    .fromTo(
      '.logo-frame',
      { scale: 0, rotate: -12, autoAlpha: 0 },
      { scale: 1, rotate: 0, autoAlpha: 1, duration: 0.48, ease: EASE.back },
      0.3,
    );

  // 3. Eyebrow chars stagger
  if (splitEyebrow) {
    tl.fromTo(
      splitEyebrow.chars,
      { yPercent: 30, autoAlpha: 0 },
      { yPercent: 0, autoAlpha: 1, duration: 0.5, stagger: 0.025 },
      0.5,
    );
  }

  // 4. Title rails depuis le centre
  tl.fromTo(
    '.masthead .title-rail',
    { scaleX: 0, autoAlpha: 0 },
    { scaleX: 1, autoAlpha: 1, duration: 0.38, transformOrigin: 'center', ease: 'power2.out' },
    0.7,
  );

  // 5. Club name chars (le moment éditorial)
  if (splitTitle) {
    tl.fromTo(
      splitTitle.chars,
      { yPercent: 100, autoAlpha: 0 },
      { yPercent: 0, autoAlpha: 1, duration: 0.6, stagger: 0.04, ease: 'expo.out' },
      0.8,
    );
  }

  // === Acte II : le verdict (delay ~1.0s après Acte I) ==========

  // 6. score-eyebrow
  tl.fromTo(
    '.score-eyebrow',
    { y: 12, autoAlpha: 0 },
    { y: 0, autoAlpha: 1, duration: 0.4 },
    1.4,
  );

  // 7. score-value count-up + motion blur
  const scoreEl = document.querySelector<HTMLElement>('.score-value');
  if (scoreEl?.dataset.target) {
    const target = Number(scoreEl.dataset.target);
    scoreEl.textContent = '0';
    const obj = { val: 0, blur: 4 };
    tl.to(
      obj,
      {
        val: target,
        blur: 0,
        duration: 1.6,
        ease: 'expo.out',
        onUpdate: () => {
          scoreEl.textContent = String(Math.round(obj.val));
          scoreEl.style.filter = `blur(${obj.blur}px)`;
        },
        onComplete: () => {
          // Clean up filter pour ne pas laisser un blur(0px) résiduel
          // qui consomme inutilement du GPU (filter forme une layer).
          scoreEl.style.filter = '';
          scoreEl.textContent = String(target);
        },
      },
      1.5,
    );
  }

  // 8. score-meta (diff +N · Par X · 18 trous)
  tl.fromTo(
    '.score-meta',
    { y: 8, autoAlpha: 0 },
    { y: 0, autoAlpha: 1, duration: 0.4 },
    2.4,
  );

  // 9. score-note (si présent — trous abandonnés)
  tl.fromTo(
    '.score-note',
    { y: 6, autoAlpha: 0 },
    { y: 0, autoAlpha: 1, duration: 0.4 },
    2.6,
  );
}

/* ---------------------------------------------------------------- */
/* Acte III : reveal au scroll                                       */
/* ---------------------------------------------------------------- */
function setupScrollActes({ gsap, ScrollTrigger }: RecapBundle): void {
  // Grid cells : stagger reveal cell-by-cell quand le block entre.
  // On cible les .grid-cell INSIDE .grid-block uniquement (pas la
  // mini scorecard live dans play.astro — recap n'a qu'un seul grid).
  gsap.from('.grid-block .grid-cell', {
    y: 6,
    autoAlpha: 0,
    scale: 0.92,
    duration: 0.42,
    stagger: 0.022,
    ease: EASE.expo,
    scrollTrigger: {
      trigger: '.grid-block',
      start: 'top 75%',
      toggleActions: 'play none none none',
    },
  });

  // Legend
  gsap.from('.grid-legend', {
    autoAlpha: 0,
    duration: 0.4,
    delay: 0.3,
    scrollTrigger: {
      trigger: '.grid-block',
      start: 'top 60%',
      toggleActions: 'play none none none',
    },
  });

  // Leaderboard rows stagger (présent uniquement si multiplayer).
  const lbRows = document.querySelectorAll<HTMLElement>('.leaderboard .lb-row');
  if (lbRows.length > 0) {
    gsap.from(lbRows, {
      y: 12,
      autoAlpha: 0,
      duration: 0.45,
      stagger: 0.06,
      ease: EASE.expo,
      scrollTrigger: {
        trigger: '.leaderboard',
        start: 'top 80%',
        toggleActions: 'play none none none',
      },
    });

    // Subtil scale-pulse sur le podium (1-2-3) après la reveal.
    const podium = document.querySelectorAll<HTMLElement>(
      '.leaderboard .lb-row.is-leader, .leaderboard .lb-row.is-second, .leaderboard .lb-row.is-third',
    );
    if (podium.length > 0) {
      gsap.fromTo(
        podium,
        { scale: 1 },
        {
          scale: 1.012,
          duration: 0.6,
          delay: 0.5,
          stagger: 0.1,
          ease: EASE.back,
          yoyo: true,
          repeat: 1,
          scrollTrigger: {
            trigger: '.leaderboard',
            start: 'top 80%',
            toggleActions: 'play none none none',
          },
        },
      );
    }

    // Medal rim stroke-draw : le rim du SVG médaille (circle r=10,
    // circumference ~62.83) part en dashoffset = path length puis se
    // dessine de 0 en 700ms expo. Donne le sentiment "la médaille
    // s'inscrit autour du chiffre" — détail premium, presque sub-
    // conscient mais qui fait la différence sur capture vidéo.
    const medalRims = document.querySelectorAll<SVGCircleElement>(
      '.leaderboard .medal-rim',
    );
    if (medalRims.length > 0) {
      gsap.set(medalRims, { strokeDasharray: 63, strokeDashoffset: 63 });
      gsap.to(medalRims, {
        strokeDashoffset: 0,
        duration: 0.7,
        stagger: 0.12,
        delay: 0.35,
        ease: EASE.expo,
        scrollTrigger: {
          trigger: '.leaderboard',
          start: 'top 80%',
          toggleActions: 'play none none none',
        },
      });
    }
  }

  // Comment + player-row + colophon : fade-up simple, chacun à son
  // propre trigger. La météo est maintenant dans .meta-strip (animée
  // en bloc avec le masthead, pas individuellement).
  const tailSelectors = [
    '.comment-block',
    '.player-row',
    '.colophon',
  ];
  for (const sel of tailSelectors) {
    const el = document.querySelector<HTMLElement>(sel);
    if (!el) continue;
    gsap.from(el, {
      y: 12,
      autoAlpha: 0,
      duration: 0.5,
      ease: EASE.expo,
      scrollTrigger: {
        trigger: el,
        start: 'top 85%',
        toggleActions: 'play none none none',
      },
    });
  }

  // Colophon rails : scaleX depuis le centre (subtil signature de fin).
  gsap.from('.colophon-rail', {
    scaleX: 0,
    duration: 0.6,
    stagger: 0.08,
    transformOrigin: 'center',
    ease: 'power2.out',
    scrollTrigger: {
      trigger: '.colophon',
      start: 'top 90%',
      toggleActions: 'play none none none',
    },
  });
}

/* ---------------------------------------------------------------- */
/* Photo parallax : translateY -10% sur 60vh, scrub                  */
/* ---------------------------------------------------------------- */
function setupPhotoParallax({ gsap, ScrollTrigger }: RecapBundle): void {
  const photo = document.querySelector<HTMLElement>('.photo-card');
  if (!photo) return;

  gsap.to(photo, {
    yPercent: -10,
    ease: 'none',
    scrollTrigger: {
      trigger: photo,
      start: 'top top',
      end: 'bottom top',
      scrub: 0.6,
    },
  });
}
