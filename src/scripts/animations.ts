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

/* ---------- HERO ----------
   Reveal éditorial sobre : stagger doux sur les chars du wordmark (sans
   rotation overshoot), fade-up sur tagline/sub/CTA, slide-in latéral du
   phone. Pas de bounce/back.out — power2.out partout pour rester
   country-club premium plutôt que startup tech. */
function initHero() {
  const logoEl = document.querySelector<HTMLElement>('[data-anim="hero-logo"]');
  const taglineEl = document.querySelector<HTMLElement>('[data-anim="hero-tagline"]');
  const subEl = document.querySelector<HTMLElement>('[data-anim="hero-sub"]');
  const ctaEl = document.querySelector<HTMLElement>('[data-anim="hero-cta"]');
  const phoneEl = document.querySelector<HTMLElement>('[data-anim="hero-phone"]');

  if (!logoEl) return;

  const chars = splitChars(logoEl);
  const tl = gsap.timeline({ defaults: { ease: 'power2.out' } });

  tl.from(chars, {
    yPercent: 60,
    opacity: 0,
    duration: 0.8,
    stagger: 0.05,
  });

  if (taglineEl) tl.from(taglineEl, { y: 24, opacity: 0, duration: 0.7 }, '-=0.4');
  if (subEl) tl.from(subEl, { y: 20, opacity: 0, duration: 0.6 }, '-=0.4');
  if (ctaEl) tl.from(ctaEl, { y: 16, opacity: 0, duration: 0.6 }, '-=0.3');
  if (phoneEl) tl.from(phoneEl, { y: 40, opacity: 0, duration: 1.0 }, '-=0.8');
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

/* ---------- PHONE SHOWCASE (scroll-pinned, N phases V5 2026-05-23) ----------
   Pattern HeroPhone : frame.png par-dessus + screens PNG empilés dans le mask.
   Boucle dynamique sur [data-flow-phase] et [data-flow-screen] — extensible
   sans toucher au code si on rajoute une phase 05.

   Timing : pin duration = 100% par phase (pour 4 phases : +=400%).
   Transitions équiréparties dans la timeline normalisée 0..1 :
     - i=0 (phase 1→2) à pos = 1/N = 0.25
     - i=1 (phase 2→3) à pos = 2/N = 0.50
     - i=2 (phase 3→4) à pos = 3/N = 0.75 */
function initPhoneShowcase() {
  const wrap = document.querySelector<HTMLElement>('[data-anim="showcase-wrap"]');
  if (!wrap) return;

  // Desktop only : le pin + morph N phases ne fonctionne qu'avec le grid
  // 2-cols ≥1024px. En mobile, le CSS bascule sur un layout vertical statique.
  const mm = gsap.matchMedia();
  mm.add('(min-width: 1024px)', () => {
    const screens = Array.from(wrap.querySelectorAll<HTMLElement>('[data-flow-screen]'));
    const phases = Array.from(wrap.querySelectorAll<HTMLElement>('[data-flow-phase]'));
    const progressBars = Array.from(wrap.querySelectorAll<HTMLElement>('[data-progress-bar]'));
    const progressDots = Array.from(wrap.querySelectorAll<HTMLElement>('[data-progress-dot]'));

    const N = Math.min(screens.length, phases.length);
    if (N < 2) return; // rien à animer si une seule phase

    const pinScrollPercent = N * 100; // 100% par phase
    const transitions = N - 1;
    const ACCENT_ACTIVE = '#1B4332';

    const tl = gsap.timeline({
      scrollTrigger: {
        trigger: wrap,
        start: 'top top',
        end: `+=${pinScrollPercent}%`,
        pin: true,
        scrub: 0.8,
        anticipatePin: 1,
        invalidateOnRefresh: true,
      },
    });

    // Boucle : pour chaque transition i, fade-out de la phase i, fade-in i+1
    for (let i = 0; i < transitions; i++) {
      const pos = (i + 1) / N; // 0.25, 0.50, 0.75 pour 4 phases
      const tweenOut = pos - 0.02;
      const tweenIn = pos + 0.02;

      if (screens[i]) tl.to(screens[i], { opacity: 0, scale: 0.96, duration: 0.05 }, tweenOut);
      if (phases[i]) tl.to(phases[i], { opacity: 0, y: -20, duration: 0.05 }, tweenOut);
      if (screens[i + 1]) tl.to(screens[i + 1], { opacity: 1, scale: 1, duration: 0.05 }, tweenIn);
      if (phases[i + 1]) tl.to(phases[i + 1], { opacity: 1, y: 0, duration: 0.05 }, tweenIn);
      if (progressBars[i]) tl.to(progressBars[i], { width: '100%', duration: 0.04, ease: 'none' }, tweenOut);
      if (progressDots[i + 1]) tl.to(progressDots[i + 1], { backgroundColor: ACCENT_ACTIVE, duration: 0.03 }, tweenIn);
    }

    return () => tl.kill();
  });
}


/* ---------- SHOWCASE ----------
   Cartes en fade-up doux + mini-cells qui apparaissent en cascade sans
   overshoot — power3.out, cohérent avec le ton country-club sobre. */
function initShowcase() {
  const cards = document.querySelectorAll<HTMLElement>('[data-anim="showcase-card"]');
  if (!cards.length) return;

  gsap.from(cards, {
    scrollTrigger: { trigger: cards[0], start: 'top 85%' },
    y: 30,
    opacity: 0,
    duration: 0.8,
    stagger: 0.10,
    ease: 'power3.out',
  });

  cards.forEach((card) => {
    const cells = card.querySelectorAll<HTMLElement>('.mini-cell');
    if (!cells.length) return;
    gsap.from(cells, {
      scrollTrigger: { trigger: card, start: 'top 75%' },
      opacity: 0,
      scale: 0.7,
      duration: 0.45,
      stagger: 0.022,
      ease: 'power2.out',
    });
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
    scrollTrigger: { trigger: cards[0], start: 'top 85%' },
    y: 40,
    opacity: 0,
    duration: 0.8,
    stagger: 0.15,
    ease: 'power3.out',
  });
}

/* ---------- FOOTER — slide-up ---------- */
function initFooter() {
  const footer = document.querySelector<HTMLElement>('footer');
  if (!footer) return;
  gsap.from(footer, {
    scrollTrigger: { trigger: footer, start: 'top 95%' },
    y: 30,
    opacity: 0,
    duration: 0.9,
    ease: 'power2.out',
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


/* V4.2 — initPaletteCycler droppé. ClubsShowcase passe en split before/after
   static, plus de morph anim runtime. */

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
  initFooter();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initAll);
} else {
  initAll();
}
