(function () {
  const root = document.querySelector('[data-solaris-maintenance="true"]');
  const dataNode = document.getElementById('terraos-story-data');
  if (!root || !dataNode || root.hasAttribute('data-story-views-ready')) return;

  let stories;
  try {
    stories = JSON.parse(dataNode.textContent || '[]');
  } catch {
    stories = [];
  }
  if (!Array.isArray(stories) || stories.length !== 5) return;

  root.setAttribute('data-story-views-ready', 'true');

  const storyById = new Map(stories.map((story) => [story.id, story]));
  const storyIds = stories.map((story) => story.id);
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const track = document.querySelector('[data-look-track]');
  const progress = document.querySelector('[data-story-carousel-progress]');
  const visited = new Set();
  const demoTimers = new Set();
  let activeStoryId = null;
  let origin = null;
  let carouselFrame = 0;

  const RESULT_FIXTURES = {
    combined: [
      ['Oland', 312],
      ['Vendia', 284],
      ['Hanvør', 271],
      ['Averia', 258],
    ],
    jury: [
      ['Vendia', 164],
      ['Oland', 156],
      ['Hanvør', 135],
      ['Averia', 121],
    ],
    televote: [
      ['Oland', 156],
      ['Averia', 137],
      ['Hanvør', 136],
      ['Vendia', 120],
    ],
  };

  function escapeHtml(value) {
    return String(value)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function storyHash(id) {
    return `#story-${id}`;
  }

  function storyIdFromHash(hash) {
    if (!hash.startsWith('#story-')) return null;
    const id = hash.slice('#story-'.length);
    return storyById.has(id) ? id : null;
  }

  function isStoryHash(hash) {
    return hash.startsWith('#story-');
  }

  function baseUrl() {
    return `${window.location.pathname}${window.location.search}`;
  }

  function storyIndex(id) {
    return Math.max(0, storyIds.indexOf(id));
  }

  function storyPosition(id) {
    return String(storyIndex(id) + 1).padStart(2, '0');
  }

  function clearDemoTimers() {
    for (const timer of demoTimers) window.clearTimeout(timer);
    demoTimers.clear();
  }

  function setVisited(id) {
    visited.add(id);
    const card = document.querySelector(`[data-story-card="${id}"]`);
    if (!card) return;
    card.setAttribute('data-visited', 'true');
    const cta = card.querySelector('[data-story-card-cta]');
    if (cta) cta.textContent = '✓ Explored';
  }

  function updateCarouselProgress() {
    carouselFrame = 0;
    if (!track || !progress) return;
    const cards = Array.from(track.querySelectorAll('[data-story-card]'));
    if (!cards.length) return;
    const trackRect = track.getBoundingClientRect();
    const center = trackRect.left + trackRect.width / 2;
    let bestIndex = 0;
    let bestDistance = Infinity;
    cards.forEach((card, index) => {
      const rect = card.getBoundingClientRect();
      const distance = Math.abs(rect.left + rect.width / 2 - center);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestIndex = index;
      }
    });
    progress.textContent = `${bestIndex + 1} / ${cards.length}`;
  }

  function requestCarouselProgress() {
    if (!carouselFrame) carouselFrame = window.requestAnimationFrame(updateCarouselProgress);
  }

  if (track) track.addEventListener('scroll', requestCarouselProgress, { passive: true });
  window.addEventListener('resize', requestCarouselProgress, { passive: true });
  updateCarouselProgress();

  function ensureStoryLayer() {
    let layer = document.querySelector('[data-story-layer]');
    if (layer) return layer;

    layer = document.createElement('div');
    layer.className = 'story-view-layer';
    layer.setAttribute('data-story-layer', 'true');
    layer.setAttribute('role', 'dialog');
    layer.setAttribute('aria-modal', 'true');
    layer.setAttribute('aria-labelledby', 'story-view-title');
    layer.hidden = true;
    layer.innerHTML = `
      <header class="story-view-header">
        <button class="story-view-back" type="button" data-story-close aria-label="Return to TerraOS 3">← <span>TerraOS 3</span></button>
        <strong class="story-view-header-title" data-story-header-title></strong>
        <span class="story-view-position" data-story-position></span>
      </header>
      <div class="story-view-scroll" data-story-scroll></div>`;
    document.body.appendChild(layer);
    return layer;
  }

  function homeDemo() {
    return `
      <div class="story-demo story-demo-home" data-story-demo="home" data-home-state="caught-up">
        <div class="story-demo-toolbar"><span>Right now</span><span class="story-demo-fixture">home_caught_up</span></div>
        <div class="home-demo-state">
          <span class="home-demo-symbol" aria-hidden="true">✓</span>
          <strong data-home-demo-title>You're all caught up</strong>
          <p data-home-demo-copy>Nothing needs your attention right now.</p>
        </div>
        <div class="home-demo-responsibility" data-home-responsibility hidden>
          <span>Jury voting</span><strong>1 thing needs attention</strong><small>Continue from where you left off</small>
        </div>
        <button class="story-demo-action" type="button" data-home-toggle>Show attention state</button>
      </div>`;
  }

  function exploreDemo() {
    return `
      <div class="story-demo story-demo-explore" data-story-demo="explore">
        <div class="story-demo-toolbar"><span>Search Solaris</span><span class="story-demo-fixture">explore_search</span></div>
        <label class="explore-search-shell">
          <span class="sr-only">Fixture search query</span>
          <span aria-hidden="true">⌕</span>
          <input data-explore-query readonly value="" placeholder="Search Solaris" />
        </label>
        <div class="explore-search-results" data-explore-results hidden>
          <article><strong>Oland</strong><span>Country</span></article>
          <article><strong>SSC 21</strong><span>Edition</span></article>
          <article><strong>Published entries</strong><span>Stories</span></article>
        </div>
        <div class="explore-archive" data-explore-archive hidden>
          <span>SSC 22</span><i></i><span>SSC 21</span><i></i><span>SSC 20</span><i></i><span>SSC 19</span>
        </div>
        <button class="story-demo-action" type="button" data-explore-replay>Replay fixture search</button>
      </div>`;
  }

  function participateDemo() {
    return `
      <div class="story-demo story-demo-participate" data-story-demo="participate" data-participate-step="0">
        <div class="story-demo-toolbar"><span>Participate</span><span class="story-demo-fixture">participate_changes_required</span></div>
        <div class="participate-groups">
          <article><small>Required</small><strong>Confirmation</strong><span data-participate-status>Changes required</span></article>
          <article class="participate-optional"><small>Available</small><strong>Televote</strong><span>Optional participation</span></article>
        </div>
        <ol class="participate-journey" aria-label="Confirmation fixture workflow">
          <li data-participate-stage="0" data-active="true">Changes required</li>
          <li data-participate-stage="1">Editing reopened</li>
          <li data-participate-stage="2">Submitted</li>
          <li data-participate-stage="3">✓ Complete</li>
        </ol>
        <button class="story-demo-action" type="button" data-participate-next>Advance workflow</button>
      </div>`;
  }

  function rankingRows(view) {
    return RESULT_FIXTURES[view]
      .map(
        ([country, points], index) => `
          <li data-result-country="${escapeHtml(country)}">
            <span class="result-demo-rank">${index + 1}</span>
            <strong>${escapeHtml(country)}</strong>
            <span>${points} pts</span>
          </li>`,
      )
      .join('');
  }

  function resultsDemo() {
    return `
      <div class="story-demo story-demo-results" data-story-demo="results" data-result-view="combined">
        <div class="result-demo-winner"><small>SSC 22 · Final</small><strong>312</strong><span>Oland · Winner</span></div>
        <div class="result-demo-tabs" role="group" aria-label="Result perspective">
          <button type="button" data-result-tab="combined" aria-pressed="true">Combined</button>
          <button type="button" data-result-tab="jury" aria-pressed="false">Jury</button>
          <button type="button" data-result-tab="televote" aria-pressed="false">Televote</button>
        </div>
        <ol class="result-demo-ranking" data-result-ranking>${rankingRows('combined')}</ol>
        <span class="story-demo-fixture" data-result-fixture>results_combined</span>
      </div>`;
  }

  function meDemo() {
    return `
      <div class="story-demo story-demo-me" data-story-demo="me" data-me-history-visible="false">
        <div class="story-demo-toolbar"><span>Your Solaris</span><span class="story-demo-fixture">me_current</span></div>
        <div class="me-identity"><span class="me-avatar" aria-hidden="true">S</span><div><strong>Solaris</strong><span>Oland · Head of Delegation</span></div></div>
        <div class="me-current"><small>Current</small><strong>SSC 22</strong></div>
        <div class="me-history" data-me-history hidden>
          <small>History</small>
          <ol><li><strong>SSC 21</strong><span>Delegation</span></li><li><strong>SSC 20</strong><span>Delegation</span></li></ol>
        </div>
        <button class="story-demo-action" type="button" data-me-history-toggle>Reveal Solaris history</button>
      </div>`;
  }

  function demoForStory(id) {
    if (id === 'home') return homeDemo();
    if (id === 'explore') return exploreDemo();
    if (id === 'participate') return participateDemo();
    if (id === 'results') return resultsDemo();
    return meDemo();
  }

  function comparisonMarkup(story) {
    return `
      <div class="story-comparison" data-story-comparison data-comparison-view="after">
        <div class="story-comparison-tabs" role="group" aria-label="Compare previous Solaris and TerraOS 3">
          <button type="button" data-comparison-tab="before" aria-pressed="false">Before</button>
          <button type="button" data-comparison-tab="after" aria-pressed="true">TerraOS 3</button>
        </div>
        <article class="story-comparison-panel story-comparison-before" data-comparison-panel="before">
          <span class="story-comparison-label">Before</span>
          <p>${escapeHtml(story.legacySummary)}</p>
          <div class="story-comparison-items">${story.legacyItems.map((item) => `<span>${escapeHtml(item)}</span>`).join('')}</div>
        </article>
        <article class="story-comparison-panel story-comparison-after" data-comparison-panel="after">
          <span class="story-comparison-label">TerraOS 3</span>
          <p>${escapeHtml(story.keyChanges[0])}</p>
          <div class="story-comparison-items">${story.newItems.map((item) => `<span>${escapeHtml(item)}</span>`).join('')}</div>
        </article>
      </div>`;
  }

  function storyOpening(story) {
    if (story.id === 'home') {
      return `<div class="story-opening-ui"><span>Right now</span><strong>You're all caught up ✓</strong></div>`;
    }
    if (story.id === 'explore') {
      return `<div class="story-opening-orbit" aria-hidden="true"><span>Oland</span><span>SSC 21</span><span>Stories</span><span>Archive</span></div>`;
    }
    if (story.id === 'participate') {
      return `<div class="story-opening-orbit story-opening-workflows" aria-hidden="true"><span>Confirmation</span><span>Entry</span><span>Jury</span><span>Televote</span></div>`;
    }
    if (story.id === 'results') {
      return `<div class="story-opening-result"><strong>312</strong><span>Oland</span><small>Winner</small></div>`;
    }
    return `<div class="story-opening-identity"><strong>Solaris</strong><span>Oland</span><small>Head of Delegation</small></div>`;
  }

  function renderStory(id) {
    const story = storyById.get(id);
    if (!story) return;
    clearDemoTimers();
    activeStoryId = id;
    setVisited(id);

    const layer = ensureStoryLayer();
    layer.setAttribute('data-story', id);
    layer.classList.toggle('story-view-light', id === 'me');
    const position = layer.querySelector('[data-story-position]');
    const headerTitle = layer.querySelector('[data-story-header-title]');
    const scroll = layer.querySelector('[data-story-scroll]');
    if (position) position.textContent = `${storyPosition(id)} / ${String(stories.length).padStart(2, '0')}`;
    if (headerTitle) headerTitle.textContent = story.title;
    if (!scroll) return;

    const nextButton = story.nextStory
      ? `<button class="story-next" type="button" data-story-next="${story.nextStory}">${escapeHtml(story.nextLabel)} →</button>`
      : `<button class="story-next" type="button" data-story-finish>${escapeHtml(story.nextLabel)} ↑</button>`;

    scroll.innerHTML = `
      <main class="story-page" data-story-page="${story.id}">
        <section class="story-hero">
          <p class="story-kicker">${escapeHtml(story.title.toUpperCase())}</p>
          <h2 class="story-display" id="story-view-title">${escapeHtml(story.tagline)}</h2>
          ${storyOpening(story)}
        </section>

        <section class="story-narrative story-narrative-intro">
          <p>${escapeHtml(story.intro)}</p>
        </section>

        <section class="story-demo-section" aria-labelledby="story-demo-title-${story.id}">
          <p class="story-kicker">Interactive fixture</p>
          <h3 id="story-demo-title-${story.id}">${escapeHtml(story.statement)}</h3>
          ${demoForStory(story.id)}
        </section>

        <section class="story-narrative story-narrative-statement">
          <h3>${escapeHtml(story.statement)}</h3>
        </section>

        <section class="story-compare-section" aria-labelledby="story-compare-title-${story.id}">
          <p class="story-kicker">The redesign</p>
          <h3 id="story-compare-title-${story.id}">Same Solaris. A clearer journey.</h3>
          ${comparisonMarkup(story)}
        </section>

        <section class="story-key-changes">
          ${story.keyChanges.map((change, index) => `<article><span>0${index + 1}</span><p>${escapeHtml(change)}</p></article>`).join('')}
        </section>

        <section class="story-real-preview">
          <div class="story-real-preview-copy">
            <p class="story-kicker">TerraOS 3</p>
            <h3>${escapeHtml(story.finale)}</h3>
            <p>This preview uses the same fixture-backed TerraOS component shown on the maintenance page. No production account or contest data is loaded.</p>
          </div>
          <div class="story-real-preview-frame">
            <iframe src="/terraos-teaser-preview?screen=${story.id}&chrome=content" title="TerraOS ${escapeHtml(story.title)} Story View preview" tabindex="-1" loading="eager" scrolling="no" sandbox="allow-scripts allow-same-origin"></iframe>
          </div>
        </section>

        <section class="story-finale">
          <p class="story-kicker">${story.id === 'me' ? 'TerraOS 3' : `Next · ${escapeHtml(story.nextStory || 'TerraOS 3')}`}</p>
          <h3>${escapeHtml(story.finale)}</h3>
          ${story.id === 'me' ? '<div class="story-five-places" aria-label="Five TerraOS destinations"><span>Home</span><span>Explore</span><span>Participate</span><span>Results</span><span>Me</span></div>' : ''}
          ${nextButton}
        </section>
      </main>`;

    scroll.scrollTop = 0;
    if (story.id === 'explore') startExploreTyping(layer);
  }

  function showLayer() {
    const layer = ensureStoryLayer();
    if (!layer.hidden) return;
    layer.hidden = false;
    root.setAttribute('inert', '');
    document.body.classList.add('story-view-open');
    window.requestAnimationFrame(() => layer.setAttribute('data-visible', 'true'));
  }

  function hideLayer(options) {
    const layer = document.querySelector('[data-story-layer]');
    if (!layer || layer.hidden) return;
    clearDemoTimers();
    layer.removeAttribute('data-visible');
    layer.hidden = true;
    const scroll = layer.querySelector('[data-story-scroll]');
    if (scroll) scroll.innerHTML = '';
    root.removeAttribute('inert');
    document.body.classList.remove('story-view-open');
    activeStoryId = null;

    if (options && options.restore && origin) {
      const saved = origin;
      origin = null;
      window.requestAnimationFrame(() => {
        if (track) track.scrollLeft = saved.carouselLeft;
        window.scrollTo({ top: saved.scrollY, left: 0, behavior: 'auto' });
        window.requestAnimationFrame(() => {
          const card = document.querySelector(`[data-story-card="${saved.cardId}"]`);
          if (card && typeof card.focus === 'function') card.focus({ preventScroll: true });
          updateCarouselProgress();
        });
      });
    }
  }

  function captureOrigin(card) {
    origin = {
      scrollY: window.scrollY,
      carouselLeft: track ? track.scrollLeft : 0,
      cardId: card.getAttribute('data-story-card') || card.getAttribute('data-story-view') || 'home',
      url: `${window.location.pathname}${window.location.search}${window.location.hash}`,
    };
  }

  function historyDepth() {
    const state = window.history.state;
    const depth = state && state.terraosStoryDepth;
    return Number.isInteger(depth) && depth > 0 ? depth : 0;
  }

  function pushStory(id, depth) {
    window.history.pushState(
      { ...(window.history.state || {}), terraosStoryDepth: depth },
      '',
      storyHash(id),
    );
    showLayer();
    renderStory(id);
  }

  function openFromCard(card) {
    const id = card.getAttribute('data-story-view');
    if (!storyById.has(id)) return;
    captureOrigin(card);
    card.setAttribute('data-story-opening', 'true');
    const timer = window.setTimeout(() => card.removeAttribute('data-story-opening'), reducedMotion.matches ? 0 : 430);
    demoTimers.add(timer);
    pushStory(id, 1);
    const close = ensureStoryLayer().querySelector('[data-story-close]');
    if (close) close.focus({ preventScroll: true });
  }

  function navigateStory(id) {
    if (!storyById.has(id)) return;
    const depth = Math.max(1, historyDepth() + 1);
    pushStory(id, depth);
  }

  function returnToMaintenance() {
    const depth = historyDepth();
    if (depth > 0) {
      window.history.go(-depth);
      return;
    }
    const target = origin ? origin.url : baseUrl();
    window.history.replaceState(null, '', target);
    hideLayer({ restore: true });
  }

  function syncFromLocation() {
    const id = storyIdFromHash(window.location.hash);
    if (id) {
      showLayer();
      renderStory(id);
      return;
    }
    if (isStoryHash(window.location.hash)) {
      window.history.replaceState(null, '', baseUrl());
    }
    hideLayer({ restore: true });
  }

  function startExploreTyping(layer) {
    const input = layer.querySelector('[data-explore-query]');
    const results = layer.querySelector('[data-explore-results]');
    const archive = layer.querySelector('[data-explore-archive]');
    if (!input || !results || !archive) return;
    input.value = '';
    results.hidden = true;
    archive.hidden = true;

    const query = 'Oland';
    if (reducedMotion.matches) {
      input.value = query;
      results.hidden = false;
      archive.hidden = false;
      return;
    }

    query.split('').forEach((character, index) => {
      const timer = window.setTimeout(() => {
        input.value += character;
        if (index === query.length - 1) {
          results.hidden = false;
          const archiveTimer = window.setTimeout(() => { archive.hidden = false; }, 220);
          demoTimers.add(archiveTimer);
        }
      }, 90 * (index + 1));
      demoTimers.add(timer);
    });
  }

  function toggleHomeDemo(button) {
    const demo = button.closest('[data-home-state]');
    if (!demo) return;
    const attention = demo.getAttribute('data-home-state') !== 'attention';
    demo.setAttribute('data-home-state', attention ? 'attention' : 'caught-up');
    const title = demo.querySelector('[data-home-demo-title]');
    const copy = demo.querySelector('[data-home-demo-copy]');
    const responsibility = demo.querySelector('[data-home-responsibility]');
    const fixture = demo.querySelector('.story-demo-fixture');
    if (title) title.textContent = attention ? '1 thing needs attention' : "You're all caught up";
    if (copy) copy.textContent = attention ? 'Your next responsibility moves forward.' : 'Nothing needs your attention right now.';
    if (responsibility) responsibility.hidden = !attention;
    if (fixture) fixture.textContent = attention ? 'home_attention' : 'home_caught_up';
    button.textContent = attention ? 'Return to caught-up state' : 'Show attention state';
  }

  function advanceParticipateDemo(button) {
    const demo = button.closest('[data-participate-step]');
    if (!demo) return;
    const labels = ['Changes required', 'Editing reopened', 'Submitted', '✓ Complete'];
    const fixtures = ['participate_changes_required', 'participate_changes_required', 'participate_changes_required', 'participate_complete'];
    const current = Number.parseInt(demo.getAttribute('data-participate-step') || '0', 10);
    const next = (current + 1) % labels.length;
    demo.setAttribute('data-participate-step', String(next));
    const status = demo.querySelector('[data-participate-status]');
    const fixture = demo.querySelector('.story-demo-fixture');
    if (status) status.textContent = labels[next];
    if (fixture) fixture.textContent = fixtures[next];
    demo.querySelectorAll('[data-participate-stage]').forEach((stage, index) => {
      stage.setAttribute('data-active', index === next ? 'true' : 'false');
      stage.setAttribute('data-complete', index < next ? 'true' : 'false');
    });
    button.textContent = next === labels.length - 1 ? 'Replay workflow' : 'Advance workflow';
  }

  function switchResultView(button) {
    const view = button.getAttribute('data-result-tab');
    const demo = button.closest('[data-result-view]');
    if (!demo || !RESULT_FIXTURES[view]) return;
    demo.setAttribute('data-result-view', view);
    demo.querySelectorAll('[data-result-tab]').forEach((tab) => {
      tab.setAttribute('aria-pressed', tab === button ? 'true' : 'false');
    });
    const ranking = demo.querySelector('[data-result-ranking]');
    const fixture = demo.querySelector('[data-result-fixture]');
    if (ranking) ranking.innerHTML = rankingRows(view);
    if (fixture) fixture.textContent = `results_${view}`;
  }

  function toggleMeHistory(button) {
    const demo = button.closest('[data-me-history-visible]');
    if (!demo) return;
    const show = demo.getAttribute('data-me-history-visible') !== 'true';
    demo.setAttribute('data-me-history-visible', show ? 'true' : 'false');
    const history = demo.querySelector('[data-me-history]');
    const fixture = demo.querySelector('.story-demo-fixture');
    if (history) history.hidden = !show;
    if (fixture) fixture.textContent = show ? 'me_history' : 'me_current';
    button.textContent = show ? 'Show current only' : 'Reveal Solaris history';
  }

  function switchComparison(button) {
    const comparison = button.closest('[data-story-comparison]');
    if (!comparison) return;
    const view = button.getAttribute('data-comparison-tab');
    comparison.setAttribute('data-comparison-view', view);
    comparison.querySelectorAll('[data-comparison-tab]').forEach((tab) => {
      tab.setAttribute('aria-pressed', tab === button ? 'true' : 'false');
    });
  }

  function handleCardActivation(target, event) {
    const card = target.closest('[data-story-card]');
    if (!card) return false;
    if (event.type === 'keydown' && event.key !== 'Enter' && event.key !== ' ') return false;
    if (event.type === 'keydown') event.preventDefault();
    openFromCard(card);
    return true;
  }

  document.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (handleCardActivation(target, event)) return;

    const close = target.closest('[data-story-close]');
    if (close) {
      returnToMaintenance();
      return;
    }
    const next = target.closest('[data-story-next]');
    if (next) {
      navigateStory(next.getAttribute('data-story-next'));
      return;
    }
    if (target.closest('[data-story-finish]')) {
      returnToMaintenance();
      return;
    }
    const homeToggle = target.closest('[data-home-toggle]');
    if (homeToggle) {
      toggleHomeDemo(homeToggle);
      return;
    }
    const exploreReplay = target.closest('[data-explore-replay]');
    if (exploreReplay) {
      clearDemoTimers();
      startExploreTyping(ensureStoryLayer());
      return;
    }
    const participateNext = target.closest('[data-participate-next]');
    if (participateNext) {
      advanceParticipateDemo(participateNext);
      return;
    }
    const resultTab = target.closest('[data-result-tab]');
    if (resultTab) {
      switchResultView(resultTab);
      return;
    }
    const meHistory = target.closest('[data-me-history-toggle]');
    if (meHistory) {
      toggleMeHistory(meHistory);
      return;
    }
    const comparison = target.closest('[data-comparison-tab]');
    if (comparison) switchComparison(comparison);
  });

  document.addEventListener('keydown', (event) => {
    const target = event.target;
    if (target instanceof Element && handleCardActivation(target, event)) return;

    const layer = document.querySelector('[data-story-layer]');
    if (!layer || layer.hidden) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      returnToMaintenance();
      return;
    }
    if (event.key === 'Tab') {
      const focusable = Array.from(
        layer.querySelectorAll('button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'),
      ).filter((element) => !element.hasAttribute('hidden'));
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
  });

  window.addEventListener('popstate', syncFromLocation);
  window.addEventListener('hashchange', () => {
    const id = storyIdFromHash(window.location.hash);
    if (id !== activeStoryId) syncFromLocation();
  });

  const initialStory = storyIdFromHash(window.location.hash);
  if (initialStory) {
    showLayer();
    renderStory(initialStory);
  } else if (isStoryHash(window.location.hash)) {
    window.history.replaceState(null, '', baseUrl());
  }
})();
