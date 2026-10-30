import {
  MAINTENANCE_LAST_UPDATED,
  MAINTENANCE_RETURN_DATE,
  TERRAOS3_ESTIMATED_LAUNCH_AT,
} from "./maintenance";
import {
  serializeTerraOsMaintenanceStories,
  TERRAOS_MAINTENANCE_STORIES,
  type TerraOsStoryId,
} from "./terraos-maintenance-stories";
import { getTerraOsPublicReadiness } from "./terraos-release-readiness";

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

type PreviewScreen = TerraOsStoryId;
type FeatureTone = "now" | "participate" | "explore" | "results" | "me";

const ATMOSPHERE_PHOTO = "/assets/terraos-maintenance/atmosphere.jpeg";
const SOLARIS_VISUAL_REVISION = "20261025-crisp-vectors";
const MAINTENANCE_ASSET_REVISION = "20261025-wordmark-global-nowrap";
const SOLARIS_MOMENT_A = `/assets/terraos-maintenance/moment-a.svg?v=${SOLARIS_VISUAL_REVISION}`;
const SOLARIS_MOMENT_B = `/assets/terraos-maintenance/moment-b.svg?v=${SOLARIS_VISUAL_REVISION}`;

function previewFrame(screen: PreviewScreen, title: string, loading: "eager" | "lazy" = "lazy") {
  return `<iframe class="terra-preview-frame" src="/terraos-teaser-preview?screen=${screen}&chrome=content" title="${escapeHtml(title)}" tabindex="-1" loading="${loading}" scrolling="no" sandbox="allow-scripts allow-same-origin"></iframe>`;
}

function rhythmFieldMarkup(className = "", strength = 1, direction = 1) {
  return `<svg class="rhythm-field ${className}" data-rhythm-field data-rhythm-strength="${strength}" data-rhythm-direction="${direction}" viewBox="0 0 1600 900" aria-hidden="true" preserveAspectRatio="none">
    <g class="rhythm-layer rhythm-layer-a">
      <path d="M-120 685 C 180 400, 410 390, 710 630 S 1240 880, 1730 420" />
      <path d="M-120 738 C 190 452, 438 445, 742 682 S 1272 920, 1740 468" />
      <path d="M-120 790 C 204 504, 468 500, 780 735 S 1304 966, 1748 520" />
    </g>
    <g class="rhythm-layer rhythm-layer-b">
      <path d="M-80 286 C 280 130, 540 176, 806 334 S 1294 536, 1684 214" />
      <path d="M-80 334 C 292 180, 558 230, 830 386 S 1318 586, 1694 264" />
    </g>
  </svg>`;
}

function galleryMarkup() {
  return TERRAOS_MAINTENANCE_STORIES.map(
    (story) => `
      <article class="look-card look-card-${story.id}" data-look-card data-story-card="${story.id}" data-story-view="${story.id}" role="button" tabindex="0" aria-haspopup="dialog" aria-label="Explore ${escapeHtml(story.title)} story">
        <div class="look-copy">
          <span class="look-index">0${story.number}</span>
          <h3>${escapeHtml(story.title)}</h3>
          <p>${escapeHtml(story.eyebrow)}.</p>
          <span class="look-story-button" data-story-card-cta aria-hidden="true">Explore ${escapeHtml(story.title)} →</span>
        </div>
        <div class="look-preview" aria-hidden="true">
          ${previewFrame(story.id, `TerraOS ${story.title} preview`)}
        </div>
      </article>`,
  ).join("");
}

function featureChapter(options: {
  id: string;
  screen: PreviewScreen;
  kicker: string;
  titleHtml: string;
  copy: string;
  tone: FeatureTone;
  reverse?: boolean;
  art?: string;
  variant?: "phone" | "wide" | "editorial";
  rhythm?: boolean;
}) {
  const art = options.art
    ? `<img class="feature-art" src="${options.art}" alt="" aria-hidden="true" loading="lazy" data-photo-parallax=".11" />`
    : "";
  const rhythm = options.rhythm ? rhythmFieldMarkup("feature-rhythm", 0.5, options.reverse ? -1 : 1) : "";
  return `
    <section class="feature-chapter feature-${options.tone}${options.reverse ? " feature-reverse" : ""}" id="${options.id}" aria-labelledby="${options.id}-title">
      ${art}${rhythm}
      <div class="feature-inner">
        <div class="feature-copy scroll-in">
          <p class="section-kicker">${escapeHtml(options.kicker)}</p>
          <h2 class="display-heading" id="${options.id}-title">${options.titleHtml}</h2>
          <p class="body-copy">${escapeHtml(options.copy)}</p>
        </div>
        <div class="feature-preview-shell feature-preview-${options.variant ?? "wide"} scroll-in" aria-label="TerraOS ${options.screen} preview" data-scroll-motion data-motion-strength="${options.reverse ? -0.18 : 0.18}">
          ${previewFrame(options.screen, `TerraOS ${options.screen} feature preview`)}
        </div>
      </div>
    </section>`;
}

export function renderMaintenancePage(now: Date = new Date()): string {
  const returnDate = escapeHtml(MAINTENANCE_RETURN_DATE);
  const updated = escapeHtml(MAINTENANCE_LAST_UPDATED);
  const launchAt = escapeHtml(TERRAOS3_ESTIMATED_LAUNCH_AT);
  const estimatedLaunchMs = Date.parse(TERRAOS3_ESTIMATED_LAUNCH_AT);
  const estimateStillFuture = Number.isFinite(estimatedLaunchMs) && estimatedLaunchMs > now.getTime();
  const readiness = getTerraOsPublicReadiness();
  const readinessStage = escapeHtml(readiness.stage);
  const readinessStyle = `--readiness:${readiness.percent}%`;
  const arrivalMarkup = estimateStillFuture
    ? `<span class="arrival-label">Estimated arrival</span><strong>${returnDate}</strong>`
    : `<strong>TerraOS 3 is being prepared.</strong>`;
  const storyData = serializeTerraOsMaintenanceStories();

  return `<!doctype html>
<html lang="en" data-terraos-launch-at="${launchAt}" data-terraos-readiness="${readiness.percent}">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <meta name="theme-color" content="#000000" />
  <meta name="color-scheme" content="dark" />
  <meta name="application-name" content="Solaris Studio" />
  <meta name="mobile-web-app-capable" content="yes" />
  <meta name="apple-mobile-web-app-capable" content="yes" />
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
  <meta name="apple-mobile-web-app-title" content="Solaris Studio" />
  <meta name="robots" content="noindex, nofollow" />
  <link rel="icon" href="/favicon.ico?v=img2340-20260929" sizes="any" />
  <link rel="icon" type="image/png" href="/icon-192.png?v=img2340-20260929" sizes="192x192" />
  <link rel="apple-touch-icon" href="/apple-touch-icon.png?v=img2340-20260929" sizes="180x180" />
  <link rel="manifest" href="/site.webmanifest?v=img2340-20260929" />
  <link rel="stylesheet" href="/assets/terraos-maintenance.css?v=${MAINTENANCE_ASSET_REVISION}" />
  <link rel="stylesheet" href="/assets/terraos-maintenance-story.css?v=${MAINTENANCE_ASSET_REVISION}" data-terraos-story-styles="true" />
  <title>TerraOS 3 — Solaris Studio</title>
</head>
<body>
<div class="content" data-solaris-maintenance="true">
  <nav class="product-bar" aria-label="TerraOS 3 page navigation" data-product-bar>
    <a class="product-name" href="#overview"><img class="product-mark" src="/solaris-studio-mark.png" alt="" aria-hidden="true" width="256" height="256" /><span style="white-space:nowrap">TerraOS&nbsp;3</span></a>
    <div class="product-links"><a href="#overview">Overview</a><a href="#experience">Experience</a><a href="/terraos-teaser-preview?screen=home">Preview</a><a class="confirmation-link" href="#confirmation-access">Confirmation</a></div>
  </nav>

  <header class="hero" id="overview" aria-labelledby="maintenance-title" data-hero>
    <img class="hero-photo" src="${ATMOSPHERE_PHOTO}" alt="" aria-hidden="true" data-photo-parallax=".10" data-photo-kind="photo" />
    ${rhythmFieldMarkup("hero-rhythm", 0.7, 1)}
    <div class="hero-grid">
      <div class="hero-copy">
        <p class="hero-kicker">Solaris Studio</p>
        <h1 id="maintenance-title" class="terra-wordmark" style="white-space:nowrap;max-width:none;font-size:clamp(2.6rem,14vw,9.8rem)">TerraOS&nbsp;3</h1>
        <p class="hero-tagline">Solaris, reimagined.</p>
        <p class="hero-intro">A new generation of Solaris Studio is taking shape around what is happening, what matters to you, and what comes next.</p>
        <div class="hero-actions"><a class="hero-action hero-action-primary" href="/terraos-teaser-preview?screen=home">Preview TerraOS&nbsp;3</a><a class="hero-action" href="#confirmation-access">Access Confirmation</a></div>
        <div class="release-card">
          <div class="arrival-line">${arrivalMarkup}</div>
          <div class="readiness-head"><span>TerraOS&nbsp;3 readiness</span><strong>${readiness.percent}%</strong></div>
          <div class="readiness-track" style="${readinessStyle}" role="progressbar" aria-label="TerraOS 3 readiness" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${readiness.percent}"><span class="readiness-fill" aria-hidden="true"></span></div>
          <p class="readiness-stage">${readinessStage}</p><p class="readiness-note">Based on tracked release criteria, not time elapsed.</p>
        </div>
      </div>
      <div class="hero-product" aria-label="TerraOS 3 interface preview">
        <div class="hero-device hero-device-left" aria-hidden="true">${previewFrame("participate", "TerraOS Participate preview")}</div>
        <div class="hero-device hero-device-main" aria-hidden="true">${previewFrame("home", "TerraOS Home preview", "eager")}</div>
        <div class="hero-device hero-device-right" aria-hidden="true">${previewFrame("explore", "TerraOS Explore preview")}</div>
      </div>
    </div>
  </header>

  <main class="product-story" id="experience">
    <section class="photo-chapter" aria-labelledby="atmosphere-title" data-photo-section>
      <img src="${ATMOSPHERE_PHOTO}" alt="" aria-hidden="true" loading="lazy" data-photo-parallax=".13" data-photo-kind="photo" />
      <div class="photo-chapter-copy scroll-in"><p class="section-kicker">Built around the contest</p><h2 class="display-heading" id="atmosphere-title">One experience.<br />Every moment.</h2></div>
    </section>

    <section class="manifesto" aria-labelledby="generation-title"><div class="manifesto-inner scroll-in"><p class="section-kicker">TerraOS&nbsp;3</p><h2 class="display-heading" id="generation-title">A new generation of Solaris.</h2><p class="manifesto-lead">Solaris Studio is being rebuilt around the contest itself: what is happening, what matters to you, and what you need to do next.</p><div class="principles"><article class="principle"><strong>What matters now</strong><p>The important thing comes first instead of hiding behind a maze of competing screens.</p></article><article class="principle"><strong>Everything in its place</strong><p>Discover, participate, follow results and manage your Solaris identity through a clearer structure.</p></article><article class="principle"><strong>Built for the moment</strong><p>The experience can stay calm on ordinary days and become expressive when Solaris goes live.</p></article></div></div></section>

    <section class="immersive" aria-labelledby="place-title" data-photo-section>
      <img class="immersive-art" src="${SOLARIS_MOMENT_A}" alt="" aria-hidden="true" loading="lazy" data-photo-parallax=".14" />
      ${rhythmFieldMarkup("immersive-rhythm", 0.85, -1)}
      <div class="immersive-inner"><div class="immersive-copy scroll-in"><p class="section-kicker">Designed around you</p><h2 class="display-heading" id="place-title">Everything<br />in its place.</h2><p>A calmer Solaris experience keeps the next important thing where you expect it, without turning every screen into a dashboard.</p></div><div class="immersive-stack" aria-hidden="true"><div class="immersive-status scroll-in"><small>Right now</small><strong>You're all caught up ✓</strong></div><div class="immersive-status scroll-in"><small>Participate</small><strong>1 thing needs attention</strong></div><div class="immersive-liquid scroll-in"><i></i><i></i><i></i><i></i><i></i></div></div></div>
    </section>

    ${featureChapter({ id:"solaris-now", screen:"home", kicker:"Solaris Now", titleHtml:"What matters,<br />now.", copy:"TerraOS brings the current contest, your next action and the most relevant Solaris updates into one clear starting point.", tone:"now", variant:"phone", rhythm:true })}
    ${featureChapter({ id:"participate-feature", screen:"participate", kicker:"Participate", titleHtml:"Know exactly<br />what needs you.", copy:"Confirmation, entries, Jury and other responsibilities become one clear journey instead of separate destinations you have to remember.", tone:"participate", reverse:true, variant:"wide", rhythm:true })}

    <section class="photo-chapter photo-chapter-secondary" aria-labelledby="preparation-title" data-photo-section>
      <img src="${SOLARIS_MOMENT_B}" alt="" aria-hidden="true" loading="lazy" data-photo-parallax="-.10" />
      <div class="photo-chapter-copy scroll-in"><p class="section-kicker">From preparation</p><h2 class="display-heading" id="preparation-title">To the moment<br />it matters.</h2></div>
    </section>

    ${featureChapter({ id:"explore-feature", screen:"explore", kicker:"Explore", titleHtml:"More Solaris.<br />Less searching.", copy:"Editions, countries, stories, archive material and discovery live together in a more visual, editorial Explore experience.", tone:"explore", art:SOLARIS_MOMENT_B, variant:"editorial" })}
    ${featureChapter({ id:"results-feature", screen:"results", kicker:"Results", titleHtml:"See what<br />happened.", copy:"Published results become a focused story of the outcome, with the official result first and deeper context available when you want it.", tone:"results", reverse:true, variant:"phone", rhythm:true })}
    ${featureChapter({ id:"me-feature", screen:"me", kicker:"Me", titleHtml:"Your<br />Solaris.", copy:"Your identity, current delegation and participation history come together in one calm place that belongs to you.", tone:"me", art:SOLARIS_MOMENT_A, variant:"phone" })}

    <section class="look" id="preview" aria-labelledby="look-title">
      ${rhythmFieldMarkup("gallery-rhythm", 0.62, 1)}
      <div class="look-head scroll-in"><div><p class="section-kicker">TerraOS&nbsp;3</p><h2 class="display-heading" id="look-title">Take a closer look.</h2></div><div class="look-controls" aria-label="Preview gallery controls"><button class="look-control" type="button" data-gallery-prev aria-label="Previous preview">←</button><button class="look-control" type="button" data-gallery-next aria-label="Next preview">→</button></div></div><div class="look-track" data-look-track tabindex="0" aria-label="TerraOS 3 destinations">${galleryMarkup()}</div><div class="look-mobile-progress" data-story-carousel-progress aria-live="polite" aria-atomic="true">1 / ${TERRAOS_MAINTENANCE_STORIES.length}</div>
    </section>

    <section class="live" aria-labelledby="live-title" data-live-section data-photo-section>
      <img class="live-art" src="${ATMOSPHERE_PHOTO}" alt="" aria-hidden="true" loading="lazy" data-photo-parallax=".14" data-photo-kind="photo" />
      <div class="live-inner"><div class="live-copy scroll-in"><p class="section-kicker">Live</p><h2 class="display-heading" id="live-title">Built for<br />contest night.</h2><p>When Solaris goes live, TerraOS moves with it. Show, voting and results each become the focus when the moment calls for them.</p></div><div class="live-ui scroll-in" aria-label="Illustrative TerraOS Live preview"><div class="live-top"><span>SSC 22 · Grand Final</span><span class="live-chip" data-live-chip>Live</span></div><div class="live-now"><small data-live-kicker>Now</small><strong data-live-main>12 · Oland</strong><div class="live-meta" data-live-meta>Artist · Song</div></div><div class="live-steps" aria-hidden="true"><div class="live-step" data-live-step="0" data-active="true"><span>SHOW</span><small>Performance sequence</small></div><div class="live-step" data-live-step="1" data-active="false"><span>VOTING OPEN</span><small>Participation becomes available</small></div><div class="live-step" data-live-step="2" data-active="false"><span>RESULTS</span><small>Published outcome</small></div></div></div></div>
    </section>

    <section class="confirmation-section" id="confirmation-access" aria-labelledby="confirmation-title"><div class="confirmation-layout"><div class="confirmation-intro scroll-in"><p class="section-kicker">Available during the transition</p><h2 class="display-heading" id="confirmation-title">Your delegation<br />keeps moving.</h2><p>While TerraOS 3 is being prepared, eligible delegation members can continue managing their current Confirmation. The rest of Solaris Studio remains under maintenance.</p></div><div class="confirmation-host" data-confirmation-host><div class="confirmation-fallback" data-confirmation-fallback>Confirmation access appears here for eligible delegation accounts.</div></div></div></section>

    <section class="readiness-chapter" aria-labelledby="readiness-title"><div class="readiness-chapter-inner scroll-in"><p class="section-kicker">What's next</p><h2 class="display-heading" id="readiness-title"><span class="terra-wordmark" style="white-space:nowrap">TerraOS&nbsp;3</span><br />is taking shape.</h2><div class="readiness-big"><div class="readiness-big-head"><span>TerraOS&nbsp;3 readiness</span><strong>${readiness.percent}%</strong></div><div class="readiness-track" style="${readinessStyle}" role="progressbar" aria-label="TerraOS 3 readiness" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${readiness.percent}"><span class="readiness-fill" aria-hidden="true"></span></div><p class="readiness-stage">${readinessStage}</p><p class="readiness-note">Progress reflects tracked release readiness rather than time remaining.</p></div></div></section>

    <section class="finale" aria-labelledby="finale-title">${rhythmFieldMarkup("finale-rhythm", 1, -1)}<div class="finale-inner scroll-in"><p class="section-kicker">Solaris Studio</p><h2 id="finale-title" class="terra-wordmark display-heading" style="white-space:nowrap;max-width:none;font-size:clamp(2.5rem,13.5vw,9rem)">TerraOS&nbsp;3</h2><p>Built for what happens next.</p><a class="finale-link" href="/terraos-teaser-preview?screen=home">Open Preview →</a><a class="finale-link" href="#confirmation-access">Access Confirmation ↑</a></div></section>
  </main>

  <footer><div><strong>Terra Solaris Broadcasting Coalition</strong>Solaris Studio · TerraOS&nbsp;3</div><div>Maintenance notice updated ${updated} · HTTP 503</div></footer>
</div>
<script id="terraos-story-data" type="application/json">${storyData}</script>
<script src="/assets/terraos-maintenance.js?v=${MAINTENANCE_ASSET_REVISION}"></script>
<script src="/assets/terraos-maintenance-story.js?v=${MAINTENANCE_ASSET_REVISION}" data-terraos-story-script="true"></script>
<script src="/assets/terraos-maintenance-story-polish.js?v=${MAINTENANCE_ASSET_REVISION}" data-terraos-story-polish="true"></script>
</body>
</html>`;
}
