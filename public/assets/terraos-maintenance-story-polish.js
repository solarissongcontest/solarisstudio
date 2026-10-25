(function () {
  const root = document.querySelector('[data-solaris-maintenance="true"]');
  if (!root) return;

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  function focusDirectDeepLink() {
    if (!window.location.hash.startsWith('#story-')) return;
    const layer = document.querySelector('[data-story-layer]');
    if (!layer || layer.hidden) return;
    const back = layer.querySelector('[data-story-close]');
    if (back instanceof HTMLElement) back.focus({ preventScroll: true });
  }

  // The base Story runtime has already resolved the initial hash by the time
  // this script executes. Give direct deep links an intentional focus target
  // without changing the natural focus restoration used for card launches.
  window.requestAnimationFrame(focusDirectDeepLink);

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
