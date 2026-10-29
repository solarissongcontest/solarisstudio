(function () {
  const root = document.querySelector('[data-solaris-maintenance="true"]');
  if (!root) return;

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let observedLayer = null;
  let layerObserver = null;
  let bodyObserver = null;

  function lockHeroWordmarkToSingleLine() {
    const title = document.getElementById('maintenance-title');
    if (!(title instanceof HTMLElement)) return;
    title.textContent = 'TerraOS\u00a03';
    title.style.maxWidth = 'none';
    title.style.whiteSpace = 'nowrap';
    title.style.fontSize = 'clamp(3.35rem, 18vw, 10.5rem)';
  }

  function installConfirmationContrastStyle() {
    if (document.getElementById('terraos-confirmation-contrast')) return;
    const style = document.createElement('style');
    style.id = 'terraos-confirmation-contrast';
    style.textContent = `
      .hod-portal {
        color: #ffffff !important;
      }

      .hod-portal h2,
      .hod-portal .hod-country,
      .hod-portal .hod-summary strong,
      .hod-portal .hod-entry-title,
      .hod-portal .hod-signin-intro strong {
        color: #ffffff !important;
      }

      .hod-portal .hod-portal-copy,
      .hod-portal .hod-checking,
      .hod-portal .hod-note,
      .hod-portal .hod-summary span {
        color: #ffffff !important;
      }

      .hod-portal .hod-muted,
      .hod-portal .hod-signin-intro span,
      .hod-portal .hod-field-help,
      .hod-portal .hod-edition,
      .hod-portal .hod-entry-label,
      .hod-portal .hod-status-row span:first-child,
      .hod-portal .hod-round-explainer,
      .hod-portal .hod-last-update {
        color: rgba(255, 255, 255, .88) !important;
      }
    `;
    document.head.appendChild(style);
  }

  function focusDirectDeepLink() {
    if (!window.location.hash.startsWith('#story-')) return;
    const layer = document.querySelector('[data-story-layer]');
    if (!layer || layer.hidden) return;
    const back = layer.querySelector('[data-story-close]');
    if (back instanceof HTMLElement) back.focus({ preventScroll: true });
  }

  function enrichParticipateStory(layer) {
    if (layer.getAttribute('data-story') !== 'participate') return;
    const groups = layer.querySelector('.participate-groups');
    if (!groups || groups.querySelector('[data-participate-ready]')) return;

    const country = document.createElement('article');
    country.setAttribute('data-participate-ready', 'country');
    country.innerHTML = '<small>Ready</small><strong>Country confirmed</strong><span>✓ Complete</span>';

    const entry = document.createElement('article');
    entry.setAttribute('data-participate-ready', 'entry');
    entry.innerHTML = '<small>Ready</small><strong>Entry ready</strong><span>✓ Complete</span>';

    groups.insertBefore(entry, groups.firstChild);
    groups.insertBefore(country, groups.firstChild);
  }

  function enrichMeStory(layer) {
    if (layer.getAttribute('data-story') !== 'me') return;

    const list = layer.querySelector('.me-history ol');
    if (list && !list.hasAttribute('data-me-timeline-ready')) {
      list.setAttribute('data-me-timeline-ready', 'true');
      list.innerHTML = [
        ['SSC 22', 'Current'],
        ['SSC 21', 'Delegation'],
        ['SSC 20', 'Delegation'],
        ['SSC 19', 'Delegation'],
      ]
        .map(([edition, state]) => `<li><strong>${edition}</strong><span>${state}</span></li>`)
        .join('');
    }

    const finale = layer.querySelector('.story-finale');
    if (!finale || finale.hasAttribute('data-me-finale-ready')) return;
    const destinations = finale.querySelector('.story-five-places');
    const heading = finale.querySelector('h3');
    const oldKicker = finale.querySelector('.story-kicker');
    const next = finale.querySelector('[data-story-finish]');
    if (!destinations || !heading || !next) return;

    finale.setAttribute('data-me-finale-ready', 'true');
    if (oldKicker) oldKicker.remove();
    finale.insertBefore(destinations, heading);

    const brand = document.createElement('div');
    brand.setAttribute('data-me-brand-finale', 'true');
    brand.innerHTML = '<p class="story-kicker">TerraOS 3</p><strong>Solaris, reimagined.</strong>';
    heading.insertAdjacentElement('afterend', brand);
  }

  function enrichRenderedStory() {
    const layer = document.querySelector('[data-story-layer]');
    if (!layer || layer.hidden) return;
    enrichParticipateStory(layer);
    enrichMeStory(layer);
  }

  function bindLayerEnhancer() {
    const layer = document.querySelector('[data-story-layer]');
    if (!layer) return false;

    if (observedLayer !== layer) {
      if (layerObserver) layerObserver.disconnect();
      observedLayer = layer;
      layerObserver = new MutationObserver(enrichRenderedStory);
      layerObserver.observe(layer, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['data-story'],
      });
    }

    enrichRenderedStory();
    return true;
  }

  // The maintenance hero is intentionally one indivisible brand lockup. Use a
  // non-breaking space in the actual text node while keeping the oversized hero
  // scale that gives the product mark its intended visual presence.
  lockHeroWordmarkToSingleLine();

  // Confirmation remains available during maintenance, so the dark card must
  // own its own foreground palette instead of inheriting black/grey text from
  // the surrounding light section.
  installConfirmationContrastStyle();

  // The base Story runtime has already resolved the initial hash by the time
  // this script executes. Give direct deep links an intentional focus target
  // without changing the natural focus restoration used for card launches.
  window.requestAnimationFrame(() => {
    focusDirectDeepLink();
    bindLayerEnhancer();
  });

  // On the normal maintenance page the Story layer is created only after the
  // first card is opened. Observe body additions until that single layer
  // exists, then switch to the much narrower layer observer.
  if (!document.querySelector('[data-story-layer]')) {
    bodyObserver = new MutationObserver(() => {
      if (!bindLayerEnhancer()) return;
      bodyObserver.disconnect();
      bodyObserver = null;
    });
    bodyObserver.observe(document.body, { childList: true });
  }

  window.addEventListener('hashchange', () => {
    window.requestAnimationFrame(() => {
      bindLayerEnhancer();
      focusDirectDeepLink();
    });
  });
  window.addEventListener('popstate', () => window.requestAnimationFrame(bindLayerEnhancer));

  // Capture result-row geometry before the base click handler swaps fixture
  // rows, then animate the new rows from their previous positions. This keeps
  // the demo truthful and comprehensible without turning the result table into
  // a slot machine. Reduced Motion skips the movement entirely.
  document.addEventListener(
    'click',
    (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const tab = target.closest('[data-result-tab]');
      if (!tab || reducedMotion.matches) return;

      const demo = tab.closest('[data-result-view]');
      const ranking = demo && demo.querySelector('[data-result-ranking]');
      if (!ranking) return;

      const before = new Map();
      ranking.querySelectorAll('[data-result-country]').forEach((row) => {
        const country = row.getAttribute('data-result-country');
        if (country) before.set(country, row.getBoundingClientRect());
      });

      window.requestAnimationFrame(() => {
        ranking.querySelectorAll('[data-result-country]').forEach((row) => {
          const country = row.getAttribute('data-result-country');
          const oldRect = country ? before.get(country) : null;
          if (!oldRect) return;
          const newRect = row.getBoundingClientRect();
          const deltaX = oldRect.left - newRect.left;
          const deltaY = oldRect.top - newRect.top;
          if (Math.abs(deltaX) < 1 && Math.abs(deltaY) < 1) return;
          row.animate(
            [
              { transform: `translate3d(${deltaX}px, ${deltaY}px, 0)` },
              { transform: 'translate3d(0, 0, 0)' },
            ],
            {
              duration: 420,
              easing: 'cubic-bezier(.2,.75,.2,1)',
            },
          );
        });
      });
    },
    true,
  );
})();
