import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

/**
 * DIY split d'une ligne en spans (1 span par caractère).
 * Évite la dépendance Club GSAP SplitText.
 */
function splitChars(el: HTMLElement): HTMLSpanElement[] {
  const text = el.textContent ?? '';
  el.textContent = '';
  const spans: HTMLSpanElement[] = [];
  for (const ch of text) {
    const span = document.createElement('span');
    span.className = 'char';
    span.textContent = ch === ' ' ? ' ' : ch;
    span.style.display = 'inline-block';
    el.appendChild(span);
    spans.push(span);
  }
  return spans;
}

/* ---------- HERO ---------- */
function initHero() {
  const logoEl = document.querySelector<HTMLElement>('[data-anim="hero-logo"]');
  const ballEl = document.querySelector<HTMLElement>('[data-hero-ball]');
  const taglineEl = document.querySelector<HTMLElement>('[data-anim="hero-tagline"]');
  const subEl = document.querySelector<HTMLElement>('[data-anim="hero-sub"]');
  const ctaEl = document.querySelector<HTMLElement>('[data-anim="hero-cta"]');
  const phoneEl = document.querySelector<HTMLElement>('[data-anim="hero-phone"]');

  if (!logoEl) return;

  const chars = splitChars(logoEl);
  const tl = gsap.timeline({ defaults: { ease: 'power3.out' } });

  tl.from(chars, {
    yPercent: 110,
    rotation: 8,
    opacity: 0,
    duration: 0.9,
    stagger: 0.06,
  });

  // Balle de golf — tombe du haut, rebondit, se cale en place du point
  if (ballEl) {
    tl.from(ballEl, {
      y: -240,
      rotation: -180,
      opacity: 0,
      duration: 1.1,
      ease: 'bounce.out',
    }, '-=0.55');
  }

  if (taglineEl) tl.from(taglineEl, { y: 24, opacity: 0, duration: 0.7 }, '-=0.5');
  if (subEl) tl.from(subEl, { y: 20, opacity: 0, duration: 0.6 }, '-=0.4');
  if (ctaEl) tl.from(ctaEl, { y: 16, opacity: 0, scale: 0.94, duration: 0.6 }, '-=0.3');
  if (phoneEl) tl.from(phoneEl, { y: 60, opacity: 0, rotation: -6, duration: 1.2 }, '-=0.9');
}

/* ---------- PROBLÈME (lignes successives, pinned) ---------- */
function initProblem() {
  const wrap = document.querySelector<HTMLElement>('[data-anim="problem"]');
  if (!wrap) return;

  const lines = wrap.querySelectorAll<HTMLElement>('[data-line]');
  const punch = wrap.querySelector<HTMLElement>('[data-punch]');

  gsap.set(lines, { opacity: 0, y: 30 });
  if (punch) gsap.set(punch, { opacity: 0, scale: 0.96 });

  const tl = gsap.timeline({
    scrollTrigger: {
      trigger: wrap,
      start: 'top top',
      end: '+=200%',
      pin: true,
      scrub: 0.6,
      anticipatePin: 1,
    },
  });

  lines.forEach((line) => {
    tl.to(line, { opacity: 1, y: 0, duration: 1 })
      .to(line, { opacity: 0.25, duration: 0.6 }, '+=0.6');
  });

  if (punch) {
    tl.to(punch, { opacity: 1, scale: 1, duration: 1 }, '-=0.3');
  }
}

/* ---------- 3 ÉTAPES ---------- */
function initSteps() {
  const cards = document.querySelectorAll<HTMLElement>('[data-anim="step-card"]');
  if (!cards.length) return;

  gsap.from(cards, {
    scrollTrigger: { trigger: cards[0], start: 'top 80%' },
    y: 60,
    opacity: 0,
    duration: 0.9,
    stagger: 0.18,
    ease: 'power3.out',
  });
}

/* ---------- PHONE MOCKUP (magic moment, 2 phases) ----------
   v3 (2026-05-05) : suppression du halo doré rotatif et de la rotation
   du phone pendant le scroll (user feedback). Phone reste à son tilt CSS
   initial. Phase 2 se transforme en "balle qui joue les 18 trous" :
   chaque cellule s'allume à mesure que la balle la traverse, et le score
   compte 0 -> 87. */
function initPhone() {
  const wrap = document.querySelector<HTMLElement>('[data-anim="phone-wrap"]');
  if (!wrap) return;

  const screenLive = wrap.querySelector<HTMLElement>('[data-screen-live]');
  const screenCard = wrap.querySelector<HTMLElement>('[data-screen-card]');
  const narrative1 = wrap.querySelector<HTMLElement>('[data-narrative-phase="1"]');
  const narrative2 = wrap.querySelector<HTMLElement>('[data-narrative-phase="2"]');
  const phaseLine = wrap.querySelector<HTMLElement>('[data-phase-line]');
  const phaseStep2 = wrap.querySelector<HTMLElement>('[data-phase-step="2"] .phase-dot');

  const liveHole = wrap.querySelector<HTMLElement>('[data-live-hole]');
  const liveScore = wrap.querySelector<HTMLElement>('[data-live-score]');
  const liveDistance = wrap.querySelector<HTMLElement>('[data-live-distance]');
  const liveTime = wrap.querySelector<HTMLElement>('[data-live-time]');

  const cardBrand = wrap.querySelector<HTMLElement>('[data-card-brand]');
  const cells = Array.from(wrap.querySelectorAll<HTMLElement>('[data-hole]'));
  const stats = wrap.querySelectorAll<HTMLElement>('[data-stat]');
  const score = wrap.querySelector<HTMLElement>('[data-score]');
  const grid = wrap.querySelector<HTMLElement>('.card-grid');
  const ball = wrap.querySelector<HTMLElement>('[data-grid-ball]');
  const shareHead = wrap.querySelector<HTMLElement>('[data-share-head]');
  const shareBtns = wrap.querySelectorAll<HTMLElement>('[data-share-platforms] .share-btn');
  const shareLink = wrap.querySelector<HTMLElement>('[data-share-link]');

  // États initiaux
  gsap.set(cells, { opacity: 0.18 });
  gsap.set(stats, { opacity: 0, y: 10, scale: 0.94 });
  if (score) {
    gsap.set(score, { opacity: 0, scale: 0.5 });
    score.textContent = '0';
  }
  if (cardBrand) gsap.set(cardBrand, { opacity: 0, y: 20 });
  if (ball) gsap.set(ball, { opacity: 0, x: 0, y: 0 });
  if (shareHead) gsap.set(shareHead, { opacity: 0, y: 16 });
  if (shareBtns.length) gsap.set(shareBtns, { opacity: 0, y: 12, scale: 0.9 });
  if (shareLink) gsap.set(shareLink, { opacity: 0, y: 10 });

  const tl = gsap.timeline({
    scrollTrigger: {
      trigger: wrap,
      start: 'top top',
      end: '+=320%',
      pin: true,
      scrub: 0.8,
      anticipatePin: 1,
      invalidateOnRefresh: true,
    },
  });

  // === Phase 1 : LIVE (0 → 0.45) === (phone reste fixe à son tilt CSS)

  // Compteur trous (8 → 18)
  if (liveHole) {
    const counter = { v: 8 };
    tl.to(counter, {
      v: 18,
      duration: 0.4,
      ease: 'none',
      onUpdate: () => { liveHole.textContent = `${Math.round(counter.v)}/18`; }
    }, 0.05);
  }

  // Distance (3,2 → 6,4 km)
  if (liveDistance) {
    const dist = { v: 3.2 };
    tl.to(dist, {
      v: 6.4,
      duration: 0.4,
      ease: 'none',
      onUpdate: () => { liveDistance.textContent = `${dist.v.toFixed(1).replace('.', ',')} km`; }
    }, 0.05);
  }

  // Temps (1h47 → 3h42)
  if (liveTime) {
    const tm = { v: 107 }; // minutes
    tl.to(tm, {
      v: 222,
      duration: 0.4,
      ease: 'none',
      onUpdate: () => {
        const h = Math.floor(tm.v / 60);
        const m = Math.round(tm.v % 60);
        liveTime.textContent = `${h}h${String(m).padStart(2, '0')}`;
      }
    }, 0.05);
  }

  // Score live (+6 → +15)
  if (liveScore) {
    const sc = { v: 6 };
    tl.to(sc, {
      v: 15,
      duration: 0.4,
      ease: 'none',
      onUpdate: () => { liveScore.textContent = `+${Math.round(sc.v)}`; }
    }, 0.05);
  }

  // Phase progress line
  if (phaseLine) {
    tl.to(phaseLine, { width: '100%', duration: 0.45, ease: 'none' }, 0);
  }

  // === Transition (0.45 → 0.6) === (pas de rotation du phone)
  if (screenLive) tl.to(screenLive, { opacity: 0, scale: 0.95, duration: 0.15 }, 0.45);
  if (screenCard) tl.to(screenCard, { opacity: 1, scale: 1, duration: 0.15 }, 0.5);

  // Narratives swap
  if (narrative1) tl.to(narrative1, { opacity: 0, y: -20, duration: 0.15 }, 0.42);
  if (narrative2) tl.to(narrative2, { opacity: 1, y: 0, duration: 0.18 }, 0.5);

  // Phase step 2 dot
  if (phaseStep2) tl.to(phaseStep2, { background: 'var(--accent)', duration: 0.1 }, 0.5);

  // === Phase 2 : CARD (0.6 → 1.0) ===
  if (cardBrand) tl.to(cardBrand, { opacity: 1, y: 0, duration: 0.15 }, 0.62);
  tl.to(stats, { opacity: 1, y: 0, scale: 1, duration: 0.2, stagger: 0.05 }, 0.68);

  // Score 0 → 87 avec compteur
  if (score) {
    tl.to(score, { opacity: 1, scale: 1, duration: 0.2, ease: 'back.out(1.6)' }, 0.76);
    const scoreCounter = { v: 0 };
    tl.to(scoreCounter, {
      v: 87,
      duration: 0.18,
      ease: 'power2.out',
      onUpdate: () => { score.textContent = String(Math.round(scoreCounter.v)); }
    }, 0.76);
  }

  // === Balle qui joue les 18 trous (0.82 → 0.97) ===
  // Chaque cellule s'allume à mesure que la balle la traverse.
  if (ball && grid && cells.length === 18) {
    // Position initiale : balle au-dessus du premier trou (à gauche au-dessus de F9 cell 1)
    const positionsForCells = () => cells.map((cell) => ({
      x: cell.offsetLeft + cell.offsetWidth / 2 - 5.5,
      y: cell.offsetTop + cell.offsetHeight / 2 - 5.5,
    }));

    // Recalcule les positions à chaque refresh (notamment pendant le pin)
    const positions = positionsForCells();

    // Apparition de la balle au-dessus de la première cellule
    tl.fromTo(ball,
      { opacity: 0, x: positions[0].x, y: positions[0].y - 14 },
      { opacity: 1, x: positions[0].x, y: positions[0].y - 14, duration: 0.012 },
      0.82
    );
    // Drop sur le premier trou avec mini bounce
    tl.to(ball, {
      x: positions[0].x,
      y: positions[0].y,
      duration: 0.014,
      ease: 'bounce.out',
    }, 0.825);
    tl.to(cells[0], { opacity: 1, duration: 0.01 }, 0.825);

    // Visite des 17 trous restants
    const totalSpan = 0.14; // 0.83 -> 0.97
    const stepDur = totalSpan / 17;
    for (let i = 1; i < positions.length; i++) {
      const t = 0.83 + (i - 1) * stepDur;
      tl.to(ball, {
        x: positions[i].x,
        y: positions[i].y,
        duration: stepDur * 0.95,
        ease: 'power1.inOut',
      }, t);
      tl.to(cells[i], { opacity: 1, duration: stepDur * 0.5 }, t);
    }

    // Final : la balle "tombe dans le trou" (scale + opacity)
    tl.to(ball, {
      scale: 0.6,
      opacity: 0.7,
      duration: 0.012,
      ease: 'power2.in',
    }, 0.97);
  }

  // Bloc partage (apparait après la traversée)
  if (shareHead) tl.to(shareHead, { opacity: 1, y: 0, duration: 0.18 }, 0.97);
  if (shareBtns.length) tl.to(shareBtns, { opacity: 1, y: 0, scale: 1, duration: 0.16, stagger: 0.04, ease: 'back.out(1.4)' }, 1.0);
  if (shareLink) tl.to(shareLink, { opacity: 1, y: 0, duration: 0.18 }, 1.05);
}

/* ---------- SHOWCASE — drop golf-themed ----------
   Les 4 cartes tombent une par une avec un rebond physique
   (bounce.out natif GSAP, pas de plugin payant). */
function initShowcase() {
  const cards = document.querySelectorAll<HTMLElement>('[data-anim="showcase-card"]');
  if (!cards.length) return;

  gsap.from(cards, {
    scrollTrigger: { trigger: cards[0], start: 'top 85%' },
    y: -28,
    opacity: 0,
    duration: 0.95,
    stagger: 0.10,
    ease: 'bounce.out',
  });
}

/* ---------- HOW IT WORKS — timeline ---------- */
function initHow() {
  const wrap = document.querySelector<HTMLElement>('[data-anim="how"]');
  if (!wrap) return;

  const line = wrap.querySelector<HTMLElement>('[data-how-line]');
  const items = wrap.querySelectorAll<HTMLElement>('[data-how-item]');

  if (line) {
    gsap.from(line, {
      scrollTrigger: { trigger: wrap, start: 'top 70%', end: 'bottom 60%', scrub: 0.6 },
      scaleX: 0,
      transformOrigin: 'left center',
      ease: 'none',
    });
  }

  gsap.from(items, {
    scrollTrigger: { trigger: wrap, start: 'top 70%' },
    y: 50,
    opacity: 0,
    duration: 0.7,
    stagger: 0.15,
    ease: 'power3.out',
  });
}

/* ---------- PRICING ---------- */
function initPricing() {
  const cards = document.querySelectorAll<HTMLElement>('[data-anim="plan"]');
  if (!cards.length) return;

  gsap.from(cards, {
    scrollTrigger: { trigger: cards[0], start: 'top 80%' },
    y: 50,
    opacity: 0,
    duration: 0.8,
    stagger: 0.2,
    ease: 'power3.out',
  });
}

/* ---------- FAQ ACCORDION ---------- */
function initFAQ() {
  const items = document.querySelectorAll<HTMLDetailsElement>('[data-anim="faq-item"]');
  items.forEach((item) => {
    const summary = item.querySelector<HTMLElement>('summary');
    const answer = item.querySelector<HTMLElement>('.faq-answer');
    if (!summary || !answer) return;

    summary.addEventListener('click', (e) => {
      e.preventDefault();
      const isOpen = item.open;

      if (isOpen) {
        gsap.to(answer, {
          height: 0,
          opacity: 0,
          duration: 0.3,
          ease: 'power2.inOut',
          onComplete: () => {
            item.open = false;
          },
        });
      } else {
        item.open = true;
        gsap.set(answer, { height: 'auto' });
        const fullHeight = answer.offsetHeight;
        gsap.fromTo(
          answer,
          { height: 0, opacity: 0 },
          { height: fullHeight, opacity: 1, duration: 0.4, ease: 'power2.out' }
        );
      }
    });
  });

  // Reveal stagger on scroll
  gsap.from(items, {
    scrollTrigger: { trigger: items[0], start: 'top 80%' },
    y: 24,
    opacity: 0,
    duration: 0.6,
    stagger: 0.08,
    ease: 'power3.out',
  });
}

/* ---------- SECTION HEADERS reveal ---------- */
function initSectionHeaders() {
  const headers = document.querySelectorAll<HTMLElement>('[data-anim="section-header"]');
  headers.forEach((header) => {
    gsap.from(header.children, {
      scrollTrigger: { trigger: header, start: 'top 85%' },
      y: 30,
      opacity: 0,
      duration: 0.7,
      stagger: 0.1,
      ease: 'power3.out',
    });
  });
}

/* ---------- CTA FORM ---------- */
function initCTAForm() {
  const form = document.querySelector<HTMLFormElement>('[data-anim="cta-form"]');
  if (!form) return;

  const successEl = form.querySelector<HTMLElement>('[data-form-success]');
  const errorEl = form.querySelector<HTMLElement>('[data-form-error]');
  const submitBtn = form.querySelector<HTMLButtonElement>('button[type="submit"]');
  const loadingText = submitBtn?.dataset.loading ?? 'Envoi en cours…';
  const initialText = submitBtn?.textContent ?? 'Envoyer';

  const SUPABASE_URL = import.meta.env.PUBLIC_SUPABASE_URL as string | undefined;
  const SUPABASE_KEY = import.meta.env.PUBLIC_SUPABASE_ANON_KEY as string | undefined;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    if (successEl) successEl.style.display = 'none';
    if (errorEl) errorEl.style.display = 'none';
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = loadingText;
    }

    try {
      const formData = new FormData(form);
      const lead = {
        name: String(formData.get('name') ?? '').trim(),
        club: String(formData.get('club') ?? '').trim(),
        email: String(formData.get('email') ?? '').trim(),
        locale: document.documentElement.lang || 'fr',
        user_agent: navigator.userAgent,
      };

      if (!SUPABASE_URL || !SUPABASE_KEY) {
        await new Promise((resolve) => setTimeout(resolve, 800));
        console.log('[DEV] Lead:', lead);
      } else {
        const res = await fetch(`${SUPABASE_URL}/rest/v1/leads`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: SUPABASE_KEY,
            Authorization: `Bearer ${SUPABASE_KEY}`,
            Prefer: 'return=minimal',
          },
          body: JSON.stringify(lead),
        });
        if (!res.ok) {
          console.error('Supabase insert failed:', res.status, await res.text().catch(() => ''));
          throw new Error('Failed');
        }
      }

      gsap.to(form.querySelectorAll('.form-field'), {
        opacity: 0.4,
        duration: 0.3,
      });

      if (successEl) {
        successEl.style.display = 'block';
        gsap.from(successEl, { y: 16, opacity: 0, duration: 0.5, ease: 'power3.out' });
      }
      if (submitBtn) submitBtn.textContent = '✓';
    } catch {
      if (errorEl) {
        errorEl.style.display = 'block';
        gsap.from(errorEl, { y: 8, opacity: 0, duration: 0.4 });
      }
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = initialText;
      }
    }
  });
}

/* ---------- GOLF BALL SCROLL ----------
   Balle de scroll détachée — apparaît après le hero, descend le long
   de la gouttière droite avec le scroll, atterrit près du QR.
   v2 : split sur 2 éléments pour éviter le conflit y (scrub) vs y (bounce)
   qui causait un blocage visuel à l'arrivée. L'outer wrapper porte le scrub,
   l'inner wrapper porte le bounce. */
function initGolfBallScroll() {
  const ball = document.querySelector<HTMLElement>('[data-ball-scroll]');
  const ballInner = document.querySelector<HTMLElement>('[data-ball-scroll-inner]');
  const phoneTrigger = document.querySelector<HTMLElement>('[data-anim="phone-wrap"]');
  const cta = document.querySelector<HTMLElement>('#cta');
  if (!ball || !phoneTrigger || !cta) return;

  // Apparition une fois passé la section hero (entre dans la phone-section)
  gsap.to(ball, {
    opacity: 1,
    duration: 0.5,
    scrollTrigger: {
      trigger: phoneTrigger,
      start: 'top 80%',
      toggleActions: 'play none none reverse',
    },
  });

  // Descente scroll-driven : la balle descend de top:120px vers ~62% du viewport,
  // pile à hauteur du QR dans la CTA section
  const targetY = () => window.innerHeight * 0.62 - 120;

  gsap.to(ball, {
    y: targetY,
    rotation: 720,
    ease: 'none',
    scrollTrigger: {
      trigger: phoneTrigger,
      start: 'top top',
      endTrigger: cta,
      end: 'top 50%',
      scrub: 0.6,
      invalidateOnRefresh: true,
    },
  });

  // Mini bounce d'arrivée — sur l'INNER wrapper, propre y indépendant
  // pour ne pas entrer en conflit avec le scrub-y de l'outer
  if (ballInner) {
    gsap.fromTo(ballInner,
      { y: 0 },
      {
        y: -8,
        duration: 0.45,
        yoyo: true,
        repeat: 1,
        ease: 'sine.out',
        scrollTrigger: {
          trigger: cta,
          start: 'top 60%',
          toggleActions: 'play none none reset',
        },
      }
    );
  }
}

/* ---------- ATMOSPHERE PARALLAX (magic-moment) ---------- */
// Donne de la profondeur au panneau golden hour : les hills bougent à des
// vitesses différentes (back lent, near rapide) au fil du scroll de la section.
function initPhoneAtmosphere() {
  const wrap = document.querySelector<HTMLElement>('[data-anim="phone-wrap"]');
  if (!wrap) return;
  const atmo = wrap.querySelector<HTMLElement>('[data-atmosphere="full"]');
  if (!atmo) return;

  const mm = gsap.matchMedia();
  // Reduced motion → on skip le parallax (les keyframes CSS sont déjà neutralisés)
  mm.add('(prefers-reduced-motion: no-preference)', () => {
    const far = atmo.querySelector('.atmosphere-hills-far');
    const mid = atmo.querySelector('.atmosphere-hills-mid');
    const near = atmo.querySelector('.atmosphere-hills-near');
    const shafts = atmo.querySelector('.atmosphere-shafts');

    const trigger = {
      trigger: wrap,
      start: 'top bottom',
      end: 'bottom top',
      scrub: 0.8,
    };

    if (far) gsap.to(far, { y: -8, ease: 'none', scrollTrigger: trigger });
    if (mid) gsap.to(mid, { y: -18, ease: 'none', scrollTrigger: trigger });
    if (near) gsap.to(near, { y: -32, ease: 'none', scrollTrigger: trigger });

    // Sun shafts : montée d'intensité au passage de la section
    if (shafts) {
      gsap.fromTo(
        shafts,
        { opacity: 0.7 },
        {
          opacity: 1,
          ease: 'sine.inOut',
          scrollTrigger: {
            trigger: wrap,
            start: 'top 70%',
            end: 'bottom 30%',
            scrub: 1.2,
          },
        }
      );
    }
  });
}

/* ---------- INIT ---------- */
function initAll() {
  initHero();
  initProblem();
  initSteps();
  initPhone();
  initPhoneAtmosphere();
  initShowcase();
  initHow();
  initPricing();
  initFAQ();
  initSectionHeaders();
  initCTAForm();
  initGolfBallScroll();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initAll);
} else {
  initAll();
}
