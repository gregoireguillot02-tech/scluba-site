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

/* ---------- PHONE SHOWCASE (scroll-pinned, 3 phases) ----------
   Phone reste fixe au tilt CSS initial. 3 écrans empilés transitionnent
   via opacity + scale ; narrative gauche se synchronise. */
function initPhoneShowcase() {
  const wrap = document.querySelector<HTMLElement>('[data-anim="showcase-wrap"]');
  if (!wrap) return;

  const screen1 = wrap.querySelector<HTMLElement>('[data-flow-screen="1"]');
  const screen2 = wrap.querySelector<HTMLElement>('[data-flow-screen="2"]');
  const screen3 = wrap.querySelector<HTMLElement>('[data-flow-screen="3"]');
  const phase1 = wrap.querySelector<HTMLElement>('[data-flow-phase="1"]');
  const phase2 = wrap.querySelector<HTMLElement>('[data-flow-phase="2"]');
  const phase3 = wrap.querySelector<HTMLElement>('[data-flow-phase="3"]');
  const progressBars = wrap.querySelectorAll<HTMLElement>('[data-progress-bar]');
  const progressDots = wrap.querySelectorAll<HTMLElement>('[data-progress-dot]');
  const cells = wrap.querySelectorAll<HTMLElement>('[data-flow-cell]');
  const scoreEl = wrap.querySelector<HTMLElement>('[data-flow-score]');
  const shareSheet = wrap.querySelector<HTMLElement>('[data-share-sheet]');
  const shareApps = wrap.querySelectorAll<HTMLElement>('[data-share-app]');
  const shareToast = wrap.querySelector<HTMLElement>('[data-share-toast]');

  // États initiaux : grille cells faibles, score 0, sheet hors-écran
  gsap.set(cells, { opacity: 0.18 });
  if (scoreEl) {
    scoreEl.textContent = '0';
    gsap.set(scoreEl, { opacity: 0, scale: 0.5 });
  }
  if (shareSheet) gsap.set(shareSheet, { y: 320, opacity: 0 });
  if (shareApps.length) gsap.set(shareApps, { opacity: 0, y: 10, scale: 0.9 });
  if (shareToast) gsap.set(shareToast, { opacity: 0, y: -12 });

  const tl = gsap.timeline({
    scrollTrigger: {
      trigger: wrap,
      start: 'top top',
      end: '+=300%',
      pin: true,
      scrub: 0.8,
      anticipatePin: 1,
      invalidateOnRefresh: true,
    },
  });

  // === PHASE 1 (0 → 0.33) : join screen reste visible, anim caret/code déjà CSS ===

  // === TRANSITION 1→2 (0.33 → 0.40) ===
  if (screen1) tl.to(screen1, { opacity: 0, scale: 0.96, duration: 0.07 }, 0.33);
  if (phase1) tl.to(phase1, { opacity: 0, y: -20, duration: 0.07 }, 0.33);
  if (screen2) tl.to(screen2, { opacity: 1, scale: 1, duration: 0.07 }, 0.36);
  if (phase2) tl.to(phase2, { opacity: 1, y: 0, duration: 0.07 }, 0.36);
  if (progressBars[0]) tl.to(progressBars[0], { width: '100%', duration: 0.05, ease: 'none' }, 0.33);
  if (progressDots[1]) tl.to(progressDots[1], { backgroundColor: '#1B4332', duration: 0.05 }, 0.36);

  // === PHASE 2 (0.40 → 0.66) : score compte 0→87, cells s'illuminent une par une ===
  if (scoreEl) {
    const counter = { v: 0 };
    tl.to(scoreEl, { opacity: 1, scale: 1, duration: 0.08 }, 0.40);
    tl.to(counter, {
      v: 87,
      duration: 0.20,
      ease: 'none',
      onUpdate: () => { scoreEl.textContent = String(Math.round(counter.v)); },
    }, 0.42);
  }
  if (cells.length) {
    tl.to(cells, {
      opacity: 1,
      duration: 0.04,
      stagger: 0.01,
      ease: 'none',
    }, 0.42);
  }

  // === TRANSITION 2→3 (0.66 → 0.73) ===
  if (screen2) tl.to(screen2, { opacity: 0, scale: 0.96, duration: 0.07 }, 0.66);
  if (phase2) tl.to(phase2, { opacity: 0, y: -20, duration: 0.07 }, 0.66);
  if (screen3) tl.to(screen3, { opacity: 1, scale: 1, duration: 0.07 }, 0.69);
  if (phase3) tl.to(phase3, { opacity: 1, y: 0, duration: 0.07 }, 0.69);
  if (progressBars[1]) tl.to(progressBars[1], { width: '100%', duration: 0.05, ease: 'none' }, 0.66);
  if (progressDots[2]) tl.to(progressDots[2], { backgroundColor: '#1B4332', duration: 0.05 }, 0.69);

  // === PHASE 3 (0.73 → 1.0) : sheet monte, apps apparaissent, toast à la fin ===
  if (shareSheet) tl.to(shareSheet, { y: 0, opacity: 1, duration: 0.10, ease: 'power2.out' }, 0.73);
  if (shareApps.length) {
    tl.to(shareApps, {
      opacity: 1, y: 0, scale: 1,
      duration: 0.08,
      stagger: 0.025,
      ease: 'back.out(1.4)',
    }, 0.82);
  }
  if (shareToast) {
    tl.to(shareToast, { opacity: 1, y: 0, duration: 0.06, ease: 'power2.out' }, 0.95);
  }
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

      // Honeypot — bots that auto-fill every input get caught here. Show
      // success state and bail to make the bot think it worked.
      const honeypot = String(formData.get('hp_email') ?? '').trim();
      if (honeypot) {
        if (successEl) successEl.style.display = 'block';
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = '✓';
        }
        return;
      }

      const rawLocale = (document.documentElement.lang || 'fr').toLowerCase();
      const locale = rawLocale === 'en' ? 'en' : 'fr';

      const name = String(formData.get('name') ?? '').trim().slice(0, 120);
      const club = String(formData.get('club') ?? '').trim().slice(0, 120);
      const email = String(formData.get('email') ?? '').trim().slice(0, 254);

      if (!name || !club || !email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        throw new Error('Invalid');
      }

      const lead = {
        name,
        club,
        email,
        locale,
        user_agent: navigator.userAgent.slice(0, 512),
      };

      if (!SUPABASE_URL || !SUPABASE_KEY) {
        await new Promise((resolve) => setTimeout(resolve, 800));
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
          // Don't log res.text() — Supabase error bodies leak schema/constraint info.
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


/* ---------- INIT ---------- */
function initAll() {
  initHero();
  initProblem();
  initSteps();
  initPhoneShowcase();
  initShowcase();
  initHow();
  initPricing();
  initFAQ();
  initSectionHeaders();
  initCTAForm();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initAll);
} else {
  initAll();
}
