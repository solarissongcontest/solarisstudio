(function () {
  const root = document.querySelector('[data-solaris-maintenance="true"]');
  if (!root || root.hasAttribute('data-story-views-ready')) return;
  root.setAttribute('data-story-views-ready', 'true');

  const storyViews = [
    {
      key: 'home',
      name: 'Home',
      eyebrow: 'What matters now',
      title: 'Start with what matters.',
      teaser: 'The current contest, your next action and the most relevant update meet in one calm starting point.',
      lead: 'Home is designed to answer the first question every time you open Solaris: what matters to me right now?',
      points: ['A single clear next action instead of competing dashboards.', 'Edition context and live moments move forward when they are relevant.', 'Quiet by default, expressive when the contest demands it.'],
    },
    {
      key: 'explore',
      name: 'Explore',
      eyebrow: 'A living edition',
      title: 'Find more Solaris.',
      teaser: 'Countries, editions, stories and archive material become a visual place to wander, not a directory to decode.',
      lead: 'Explore turns discovery into an editorial experience. It gives the contest room to feel like a world, while keeping the route to useful information obvious.',
      points: ['Browse the current edition without losing historical context.', 'Country and story discovery are visual and connected.', 'Archive material belongs to the same Solaris story instead of a separate filing cabinet.'],
    },
    {
      key: 'participate',
      name: 'Participate',
      eyebrow: 'Responsibilities, clarified',
      title: 'Know what needs you.',
      teaser: 'Confirmation, entries, Jury and other responsibilities become one understandable journey.',
      lead: 'Participate is the operational heart of TerraOS 3. It keeps deadlines, status and the next permitted action visible without exposing users to organizer machinery.',
      points: ['One place for the responsibilities attached to your delegation.', 'State and review outcomes are written in human language.', 'Recovery paths stay explicit when a submission needs attention.'],
    },
    {
      key: 'results',
      name: 'Results',
      eyebrow: 'The outcome, made legible',
      title: 'See what happened.',
      teaser: 'The official outcome comes first, with deeper result context available without turning the moment into a spreadsheet.',
      lead: 'Results is built around the reveal first and analysis second. The canonical outcome remains unmistakable while countbacks and detail can still be explored.',
      points: ['The official published result is the visual focus.', 'Deeper breakdowns sit behind the outcome instead of competing with it.', 'The same result language carries from live night into the archive.'],
    },
    {
      key: 'me',
      name: 'Me',
      eyebrow: 'Your Solaris',
      title: 'A place that is yours.',
      teaser: 'Identity, delegation and participation history come together without turning your profile into an admin panel.',
      lead: 'Me gives Solaris continuity. Your current identity and delegation are clear, while participation history makes each edition part of a longer personal story.',
      points: ['Current Solaris identity and delegation are immediately understandable.', 'Participation history connects past editions to the present.', 'Settings and account controls stay available without dominating the experience.'],
    },
  ];

  const storyByKey = new Map(storyViews.map((story) => [story.key, story]));
  let activeStoryIndex = 0;
  let restoreFocus = null;

  function storyMockup(story) {
    const labels = {
      home: ['Right now', 'Next for you', 'Edition pulse'],
      explore: ['Discover', 'Countries', 'Stories'],
      participate: ['Needs attention', 'Confirmation', 'Jury'],
      results: ['Official result', 'Published', 'Breakdown'],
      me: ['Your Solaris', 'Delegation', 'History'],
    }[story.key];

    return `
      <span class="story-teaser-device" aria-hidden="true">
        <span class="story-ui-top"><span class="story-ui-brand">TerraOS 3</span><span>${story.name}</span></span>
        <span class="story-ui-content">
          <span class="story-ui-kicker">${labels[0]}</span>
          <strong class="story-ui-title">${story.title}</strong>
          <span class="story-ui-card"><strong>${labels[1]}</strong><span>${story.teaser}</span><span class="story-ui-meter"></span></span>
          <span class="story-ui-card"><strong>${labels[2]}</strong><span>Designed to surface context only when it helps.</span><span class="story-ui-row"><i></i><i></i><i></i></span></span>
        </span>
      </span>`;
  }

  function buildStoryShowcase() {
    const look = document.querySelector('.look');
    if (!look || document.querySelector('[data-story-showcase]')) return;

    const section = document.createElement('section');
    section.className = 'story-showcase';
    section.setAttribute('data-story-showcase', 'true');
    section.setAttribute('aria-labelledby', 'story-showcase-title');
    section.innerHTML = `
      <div class="story-showcase-head">
        <p class="section-kicker">Five destinations. One Solaris.</p>
        <h2 class="story-display" id="story-showcase-title">Go inside TerraOS 3.</h2>
        <p>Each part of Solaris has its own job. Open a Story View to see how Home, Explore, Participate, Results and Me fit together without becoming five unrelated products.</p>
      </div>
      <div class="story-teasers">
        ${storyViews.map((story, index) => `
          <button class="story-teaser" type="button" data-story-view="${story.key}" data-story="${story.key}" aria-haspopup="dialog">
            <span class="story-teaser-copy">
              <span class="story-teaser-index">0${index + 1} · ${story.eyebrow}</span>
              <strong class="story-teaser-title">${story.name}</strong>
              <p>${story.teaser}</p>
              <span class="story-teaser-cta">View ${story.name} story</span>
            </span>
            <span class="story-teaser-stage">${storyMockup(story)}</span>
          </button>`).join('')}
      </div>`;
    look.insertAdjacentElement('afterend', section);
  }

  function addStoryButtonsToGallery() {
    const cards = Array.from(document.querySelectorAll('[data-look-card]'));
    cards.forEach((card, index) => {
      const story = storyViews[index];
      const copy = card.querySelector('.look-copy');
      if (!story || !copy || copy.querySelector('[data-story-view]')) return;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'look-story-button';
      button.setAttribute('data-story-view', story.key);
      button.setAttribute('aria-haspopup', 'dialog');
      button.textContent = `View ${story.name} story`;
      copy.appendChild(button);
    });
  }

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
      <div class="story-view-chrome">
        <span class="story-view-brand">TerraOS 3</span>
        <button class="story-view-close" type="button" data-story-close aria-label="Close Story View">×</button>
      </div>
      <div class="story-view-content" data-story-content></div>
      <div class="story-view-footer">
        <button class="story-view-nav" type="button" data-story-prev aria-label="Previous Story View">←</button>
        <span class="story-view-position" data-story-position></span>
        <button class="story-view-nav" type="button" data-story-next aria-label="Next Story View">→</button>
      </div>`;
    document.body.appendChild(layer);
    return layer;
  }

  function renderStory(index) {
    const layer = ensureStoryLayer();
    const story = storyViews[index];
    if (!story) return;
    activeStoryIndex = index;
    layer.setAttribute('data-story', story.key);
    const content = layer.querySelector('[data-story-content]');
    const position = layer.querySelector('[data-story-position]');
    if (position) position.textContent = `${index + 1} of ${storyViews.length} · ${story.name}`;
    if (content) {
      content.innerHTML = `
        <div class="story-view-grid">
          <div class="story-view-copy">
            <span class="story-view-count">0${index + 1} · ${story.eyebrow}</span>
            <h2 class="story-view-title" id="story-view-title">${story.name}</h2>
            <p class="story-view-lead">${story.lead}</p>
            <ul class="story-view-points">${story.points.map((point) => `<li>${point}</li>`).join('')}</ul>
          </div>
          <div class="story-view-preview" aria-label="TerraOS ${story.name} interface preview">
            <iframe src="/terraos-teaser-preview?screen=${story.key}&chrome=content" title="TerraOS ${story.name} Story View preview" loading="eager" scrolling="no" sandbox="allow-scripts allow-same-origin"></iframe>
          </div>
        </div>`;
    }
  }

  function openStory(key, trigger) {
    const story = storyByKey.get(key);
    const index = storyViews.indexOf(story);
    if (!story || index < 0) return;
    restoreFocus = trigger || document.activeElement;
    const layer = ensureStoryLayer();
    renderStory(index);
    layer.hidden = false;
    root.setAttribute('inert', '');
    document.body.classList.add('story-view-open');
    const close = layer.querySelector('[data-story-close]');
    if (close) close.focus({ preventScroll: true });
  }

  function closeStory() {
    const layer = document.querySelector('[data-story-layer]');
    if (!layer || layer.hidden) return;
    layer.hidden = true;
    const content = layer.querySelector('[data-story-content]');
    if (content) content.innerHTML = '';
    root.removeAttribute('inert');
    document.body.classList.remove('story-view-open');
    if (restoreFocus && typeof restoreFocus.focus === 'function') restoreFocus.focus({ preventScroll: true });
    restoreFocus = null;
  }

  function moveStory(delta) {
    const nextIndex = (activeStoryIndex + delta + storyViews.length) % storyViews.length;
    renderStory(nextIndex);
  }

  buildStoryShowcase();
  addStoryButtonsToGallery();
  const storyLayer = ensureStoryLayer();

  document.addEventListener('click', (event) => {
    const trigger = event.target.closest('[data-story-view]');
    if (trigger) {
      openStory(trigger.getAttribute('data-story-view'), trigger);
      return;
    }
    if (event.target.closest('[data-story-close]')) closeStory();
    if (event.target.closest('[data-story-prev]')) moveStory(-1);
    if (event.target.closest('[data-story-next]')) moveStory(1);
  });

  document.addEventListener('keydown', (event) => {
    if (storyLayer.hidden) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      closeStory();
      return;
    }
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      moveStory(1);
      return;
    }
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      moveStory(-1);
      return;
    }
    if (event.key === 'Tab') {
      const focusable = Array.from(storyLayer.querySelectorAll('button:not([disabled]), a[href], iframe, [tabindex]:not([tabindex="-1"])'));
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
})();
