(function () {
  const documentRoot = document.documentElement;
  const nav = navigator;
  const iosDevice =
    /iPad|iPhone|iPod/i.test(nav.userAgent) ||
    (nav.platform === 'MacIntel' && nav.maxTouchPoints > 1);
  const standalone =
    nav.standalone === true ||
    window.matchMedia?.('(display-mode: standalone)').matches === true;
  documentRoot.toggleAttribute('data-terraos-ios-standalone', iosDevice && standalone);

  // Maintenance is a static emergency shell, so it cannot consume the React
  // app's safe-area token directly. It still gets one canonical resolver for
  // every semantic top-chrome surface instead of letting the product bar,
  // Story View and Confirmation anchor invent independent status-bar offsets.
  const safeZoneStyle = document.createElement('style');
  safeZoneStyle.setAttribute('data-terraos-safe-zone', 'canonical');
  safeZoneStyle.textContent = `
    :root {
      --terra-system-safe-top: env(safe-area-inset-top, 0px);
      --terra-safe-content-gap: .25rem;
      --terra-safe-content-top: calc(var(--terra-system-safe-top) + var(--terra-safe-content-gap));
      --terra-top-obstruction: calc(var(--terra-safe-content-top) + 4.5rem);
    }
    html[data-terraos-ios-standalone] {
      --terra-system-safe-top: max(env(safe-area-inset-top, 0px), 3.875rem);
    }
    @media (orientation: landscape) {
      html[data-terraos-ios-standalone] {
        --terra-system-safe-top: env(safe-area-inset-top, 0px);
      }
    }
    .product-bar {
      top: var(--terra-safe-content-top) !important;
    }
    .story-view-header {
      padding-top: max(.55rem, var(--terra-safe-content-top)) !important;
    }
    #overview,
    #experience,
    #confirmation-access,
    [data-confirmation-host],
    .story-view-layer :where(a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])) {
      scroll-margin-block-start: var(--terra-top-obstruction);
    }
  `;
  document.head.appendChild(safeZoneStyle);

  const root = document.querySelector('[data-solaris-maintenance="true"]');
  const portal = document.querySelector('.hod-portal');
  const confirmationHost = document.querySelector('[data-confirmation-host]');
  const confirmationFallback = document.querySelector('[data-confirmation-fallback]');
  if (root && portal && confirmationHost) {
    confirmationHost.appendChild(portal);
    if (confirmationFallback) confirmationFallback.hidden = true;
  }

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const productBar = document.querySelector('[data-product-bar]');
  const hero = document.querySelector('[data-hero]');
  const rhythmFields = Array.from(document.querySelectorAll('[data-rhythm-field]'));
  const motionNodes = Array.from(document.querySelectorAll('[data-scroll-motion]'));
  const photoNodes = Array.from(document.querySelectorAll('[data-photo-parallax]'));
  const resultsSection = document.querySelector('.feature-results');
  const live = document.querySelector('[data-live-section]');
  const liveSteps = Array.from(document.querySelectorAll('[data-live-step]'));
  const liveChip = document.querySelector('[data-live-chip]');
  const liveKicker = document.querySelector('[data-live-kicker]');
  const liveMain = document.querySelector('[data-live-main]');
  const liveMeta = document.querySelector('[data-live-meta]');
  let frame = 0;

  function clamp01(value) {
    return Math.max(0, Math.min(1, value));
  }

  function sectionProgress(rect) {
    return clamp01((window.innerHeight - rect.top) / (window.innerHeight + rect.height));
  }

  const liveStates = [
    { chip: 'Live', kicker: 'Now', main: '12 · Oland', meta: 'Artist · Song' },
    { chip: 'Voting open', kicker: 'Participate', main: 'Voting is open', meta: 'The active action comes forward.' },
    { chip: 'Published', kicker: 'Results', main: 'The outcome', meta: 'Official results become the focus.' },
  ];

  function setLiveState(index) {
    const state = liveStates[index] || liveStates[0];
    liveSteps.forEach((step, i) => step.setAttribute('data-active', i === index ? 'true' : 'false'));
    if (liveChip) liveChip.textContent = state.chip;
    if (liveKicker) liveKicker.textContent = state.kicker;
    if (liveMain) liveMain.textContent = state.main;
    if (liveMeta) liveMeta.textContent = state.meta;
  }

  function resetMotion() {
    rhythmFields.forEach((node) => {
      node.style.setProperty('--rhythm-progress', '0');
      node.style.setProperty('--rhythm-shift', '0');
    });
    photoNodes.forEach((node) => node.style.setProperty('--photo-shift', '0'));
    motionNodes.forEach((node) => { node.style.transform = 'none'; });
    if (hero) hero.style.setProperty('--hero-progress', '0');
    if (resultsSection) resultsSection.style.setProperty('--result-shift', '0');
    if (live) live.style.setProperty('--live-beam-shift', '0');
    setLiveState(0);
  }

  function updateMotion() {
    frame = 0;
    if (productBar) productBar.setAttribute('data-scrolled', window.scrollY > 56 ? 'true' : 'false');

    if (reduceMotion.matches) {
      resetMotion();
      return;
    }

    if (hero) {
      const rect = hero.getBoundingClientRect();
      const progress = clamp01((-rect.top) / Math.max(1, rect.height * 0.8));
      hero.style.setProperty('--hero-progress', progress.toFixed(4));
    }

    rhythmFields.forEach((node) => {
      const owner = node.parentElement || node;
      const progress = sectionProgress(owner.getBoundingClientRect());
      const strength = Number.parseFloat(node.getAttribute('data-rhythm-strength') || '1');
      const direction = Number.parseFloat(node.getAttribute('data-rhythm-direction') || '1');
      node.style.setProperty('--rhythm-progress', progress.toFixed(4));
      node.style.setProperty('--rhythm-shift', (((progress - 0.5) * 42 * strength * direction)).toFixed(2));
    });

    photoNodes.forEach((node) => {
      const owner = node.closest('section,header') || node;
      const progress = sectionProgress(owner.getBoundingClientRect());
      const amount = Number.parseFloat(node.getAttribute('data-photo-parallax') || '.1');
      node.style.setProperty('--photo-shift', (((progress - 0.5) * 120 * amount)).toFixed(2));
    });

    motionNodes.forEach((node) => {
      const owner = node.closest('section') || node;
      const progress = sectionProgress(owner.getBoundingClientRect());
      const strength = Number.parseFloat(node.getAttribute('data-motion-strength') || '.15');
      node.style.transform = `translate3d(0,${((progress - 0.5) * 80 * strength).toFixed(2)}px,0)`;
    });

    if (resultsSection) {
      const progress = sectionProgress(resultsSection.getBoundingClientRect());
      resultsSection.style.setProperty('--result-shift', (((progress - 0.5) * 48)).toFixed(2));
    }

    if (live) {
      const progress = sectionProgress(live.getBoundingClientRect());
      live.style.setProperty('--live-beam-shift', (((progress - 0.5) * 42)).toFixed(2));
      if (window.innerWidth >= 681) setLiveState(progress < 0.42 ? 0 : progress < 0.68 ? 1 : 2);
      else setLiveState(0);
    }
  }

  function requestMotion() {
    if (!frame) frame = requestAnimationFrame(updateMotion);
  }

  updateMotion();
  window.addEventListener('scroll', requestMotion, { passive: true });
  window.addEventListener('resize', requestMotion, { passive: true });
  if (typeof reduceMotion.addEventListener === 'function') reduceMotion.addEventListener('change', requestMotion);

  const track = document.querySelector('[data-look-track]');
  const prev = document.querySelector('[data-gallery-prev]');
  const next = document.querySelector('[data-gallery-next]');

  function galleryStep(direction) {
    if (!track) return;
    const card = track.querySelector('[data-look-card]');
    const style = getComputedStyle(track);
    const gap = Number.parseFloat(style.columnGap || style.gap || '0') || 0;
    const width = card ? card.getBoundingClientRect().width : track.clientWidth * 0.82;
    track.scrollBy({ left: (width + gap) * direction, behavior: reduceMotion.matches ? 'auto' : 'smooth' });
  }

  if (prev) prev.addEventListener('click', () => galleryStep(-1));
  if (next) next.addEventListener('click', () => galleryStep(1));
  if (track) {
    track.addEventListener('keydown', (event) => {
      if (event.key === 'ArrowRight') {
        event.preventDefault();
        galleryStep(1);
      }
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        galleryStep(-1);
      }
    });
  }

  if ('IntersectionObserver' in window && !reduceMotion.matches) {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('seen');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.1 });
    document.querySelectorAll('.scroll-in').forEach((node) => observer.observe(node));
  } else {
    document.querySelectorAll('.scroll-in').forEach((node) => node.classList.add('seen'));
  }

  if (root) {
    if (!document.querySelector('link[data-terraos-story-styles]')) {
      const styles = document.createElement('link');
      styles.rel = 'stylesheet';
      styles.href = '/assets/terraos-maintenance-story.css';
      styles.setAttribute('data-terraos-story-styles', 'true');
      document.head.appendChild(styles);
    }
    if (!document.querySelector('script[data-terraos-story-script]')) {
      const script = document.createElement('script');
      script.src = '/assets/terraos-maintenance-story.js';
      script.defer = true;
      script.setAttribute('data-terraos-story-script', 'true');
      document.body.appendChild(script);
    }
  }
})();