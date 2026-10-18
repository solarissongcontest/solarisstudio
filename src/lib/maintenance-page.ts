import {
  MAINTENANCE_LAST_UPDATED,
  MAINTENANCE_RETURN_DATE,
  TERRAOS3_ESTIMATED_LAUNCH_AT,
} from "./maintenance";

const TERRAOS_NAVIGATION_REVEAL_AT = Date.parse("2026-10-19T00:00:00+03:00");
const TERRAOS_PARTICIPATION_REVEAL_AT = Date.parse("2026-10-20T00:00:00+03:00");
const TERRAOS_RESULTS_REVEAL_AT = Date.parse("2026-10-21T00:00:00+03:00");

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function teaserPhase(now: Date) {
  const time = now.getTime();
  if (time >= TERRAOS_RESULTS_REVEAL_AT) return 3;
  if (time >= TERRAOS_PARTICIPATION_REVEAL_AT) return 2;
  if (time >= TERRAOS_NAVIGATION_REVEAL_AT) return 1;
  return 0;
}

function icon(name: "home" | "explore" | "participate" | "results" | "me") {
  const body = {
    home: '<path d="M3 10.8 12 3l9 7.8v9.7a.5.5 0 0 1-.5.5h-5.8v-6.2H9.3V21H3.5a.5.5 0 0 1-.5-.5Z"/><path d="M9.3 21h5.4"/>',
    explore: '<circle cx="12" cy="12" r="8.5"/><path d="m14.8 9.2-1.9 4-3.7 1.6 1.8-3.9Z"/>',
    participate: '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="m8.2 12.2 2.5 2.5 5.2-5.4"/>',
    results: '<path d="M8 4h8v3.3c0 3.2-1.7 5.4-4 6.3-2.3-.9-4-3.1-4-6.3Z"/><path d="M8 6H4.8v1.3c0 2.1 1.3 3.5 3.5 3.7M16 6h3.2v1.3c0 2.1-1.3 3.5-3.5 3.7M12 13.6V18m-3.5 2h7"/>',
    me: '<circle cx="12" cy="8" r="3.3"/><path d="M5.8 20c.7-4 2.8-6 6.2-6s5.5 2 6.2 6"/>',
  }[name];
  return `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">${body}</svg>`;
}

function miniNav(active: "home" | "explore" | "participate" | "results" | "me") {
  const items = ["home", "explore", "participate", "results", "me"] as const;
  return `<div class="mini-nav" aria-hidden="true">${items
    .map((item) => `<span class="mini-nav-item${item === active ? " active" : ""}">${icon(item)}</span>`)
    .join("")}</div>`;
}

function nextRevealMarkup(phase: number) {
  if (phase === 0) {
    return '<section class="next-reveal" data-next-reveal="2026-10-19"><span>More on 19.10</span></section>';
  }
  if (phase === 1) {
    return '<section class="next-reveal" data-next-reveal="2026-10-20"><span>More on 20.10</span></section>';
  }
  if (phase === 2) {
    return '<section class="next-reveal" data-next-reveal="2026-10-21"><span>More on 21.10</span></section>';
  }
  return "";
}

function navigationStoryMarkup() {
  return `
    <section class="story story-touch scroll-in" aria-labelledby="touch-title">
      <div class="story-heading">
        <p class="eyebrow">Five places. One Solaris.</p>
        <h2 id="touch-title">Touch it.</h2>
      </div>
      <div class="interactive-device" id="interactive-device" data-active="0">
        <div class="interactive-screen">
          <div class="interactive-topline"><span class="status-dot"></span><span>SSC 22 · Current edition</span></div>
          <div class="nav-pane" data-pane="0">
            <span class="pane-kicker">Home</span><strong>Solaris now</strong>
            <div class="demo-card demo-now"><small>Right now</small><b>You’re all caught up</b><span class="demo-check">✓</span></div>
            <div class="demo-card"><small>Current contest</small><b>SSC 22 is the current Solaris edition</b></div>
          </div>
          <div class="nav-pane" data-pane="1" hidden>
            <span class="pane-kicker">Explore Solaris</span><strong>Discover the contest</strong>
            <div class="demo-row"><span class="demo-icon">⌕</span><span><b>Search Solaris</b><small>Countries, editions, songs, shows and stories</small></span></div>
            <div class="demo-card"><small>Current edition</small><b>Solaris Song Contest 22</b></div>
          </div>
          <div class="nav-pane" data-pane="2" hidden>
            <span class="pane-kicker">SSC 22</span><strong>Your participation</strong>
            <div class="responsibility-row"><span class="state-check">✓</span><span><b>Country confirmed</b><small>Done</small></span></div>
            <div class="responsibility-row"><span class="state-check">✓</span><span><b>Entry ready</b><small>Done</small></span></div>
          </div>
          <div class="nav-pane" data-pane="3" hidden>
            <span class="pane-kicker">Results</span><strong>SSC 22 · Final</strong>
            <div class="ranking-row"><span>1</span><b>Oland</b><strong>312</strong></div>
            <div class="ranking-row"><span>2</span><b>Vendia</b><strong>284</strong></div>
            <div class="ranking-row"><span>3</span><b>Hanvør</b><strong>271</strong></div>
          </div>
          <div class="nav-pane" data-pane="4" hidden>
            <span class="pane-kicker">Me</span><strong>Your Solaris</strong>
            <div class="demo-card"><small>Current delegation</small><b>Oland · SSC 22</b></div>
            <div class="demo-row"><span class="demo-avatar">A</span><span><b>Account</b><small>Identity, history and settings</small></span></div>
          </div>
          <div class="liquid-nav" id="liquid-demo" role="tablist" aria-label="TerraOS destinations" data-dragging="false" data-direction="0">
            <span class="liquid-lens" aria-hidden="true"></span>
            <button class="liquid-tab" type="button" role="tab" data-index="0" aria-selected="true" aria-label="Home">${icon("home")}</button>
            <button class="liquid-tab" type="button" role="tab" data-index="1" aria-selected="false" aria-label="Explore">${icon("explore")}</button>
            <button class="liquid-tab" type="button" role="tab" data-index="2" aria-selected="false" aria-label="Participate">${icon("participate")}</button>
            <button class="liquid-tab" type="button" role="tab" data-index="3" aria-selected="false" aria-label="Results">${icon("results")}</button>
            <button class="liquid-tab" type="button" role="tab" data-index="4" aria-selected="false" aria-label="Me">${icon("me")}</button>
          </div>
        </div>
      </div>
      <p class="touch-hint">Press, drag, or choose a destination.</p>
    </section>`;
}

function participationStoryMarkup() {
  return `
    <section class="story participation-story scroll-in" aria-labelledby="participation-title">
      <div class="story-grid">
        <div class="story-heading sticky-heading"><p class="eyebrow">Participate</p><h2 id="participation-title">What’s next,<br />at a glance.</h2></div>
        <div class="participation-device" aria-label="TerraOS participation states">
          <div class="participation-header"><span>SSC 22</span><strong>Your participation</strong></div>
          <div class="state-sequence">
            <article class="state-card state-complete"><span class="state-number">01</span><span><b>Confirmation</b><small>Official responsibility</small></span><strong>Submitted</strong></article>
            <article class="state-card state-action"><span class="state-number">02</span><span><b>Entry</b><small>Review</small></span><strong>Changes required</strong></article>
            <article class="state-card"><span class="state-number">03</span><span><b>Jury</b><small>Official voting</small></span><strong>Opens tomorrow</strong></article>
            <article class="state-card"><span class="state-number">04</span><span><b>Televote</b><small>Optional</small></span><strong>Opens tonight</strong></article>
            <article class="state-card state-complete"><span class="state-number">05</span><span><b>Results</b><small>Published show</small></span><strong>Available</strong></article>
          </div>
        </div>
      </div>
    </section>`;
}

function resultsStoryMarkup(returnDate: string) {
  return `
    <section class="story results-story scroll-in" aria-labelledby="results-title">
      <div class="story-heading"><p class="eyebrow">TerraOS 3</p><h2 id="results-title">Results, live.</h2></div>
      <div class="results-reveal" aria-label="Cropped TerraOS Results preview">
        <div class="results-spotlight" aria-hidden="true"><span>12</span><span>10</span><span>8</span></div>
        <div class="results-ui">
          <div class="results-title-row"><span><small>SSC 22</small><b>Final</b></span><span class="live-chip">Published</span></div>
          <div class="result-tabs"><span class="selected">Combined</span><span>Jury</span><span>Televote</span></div>
          <div class="ranking-row large"><span>1</span><b>Oland</b><strong>312</strong></div>
          <div class="ranking-row large"><span>2</span><b>Vendia</b><strong>284</strong></div>
          <div class="ranking-row large"><span>3</span><b>Hanvør</b><strong>271</strong></div>
          <div class="ranking-row large"><span>4</span><b>Averia</b><strong>258</strong></div>
          <div class="results-mask" aria-hidden="true"></div>
        </div>
      </div>
      <div class="interface-details" aria-label="TerraOS interface details">
        <div class="detail-crop"><span>LIQUID NAVIGATION</span><div class="detail-pill"></div></div>
        <div class="detail-crop"><span>STATUS</span><div class="detail-status"><i></i><b>Changes required</b></div></div>
        <div class="detail-crop"><span>RESULTS</span><div class="detail-score">12</div></div>
      </div>
    </section>
    <section class="story final-countdown scroll-in" aria-labelledby="final-title">
      <h2 id="final-title">TerraOS 3</h2>
      <p class="tagline">Solaris Studio, rebuilt.</p>
      <p class="final-date">Estimated arrival · ${returnDate}</p>
      <div class="final-clock" aria-hidden="true"><span data-final="days">--</span><span>:</span><span data-final="hours">--</span><span>:</span><span data-final="minutes">--</span><span>:</span><span data-final="seconds">--</span></div>
    </section>`;
}

export function renderMaintenancePage(now: Date = new Date()): string {
  const returnDate = escapeHtml(MAINTENANCE_RETURN_DATE);
  const updated = escapeHtml(MAINTENANCE_LAST_UPDATED);
  const launchAt = escapeHtml(TERRAOS3_ESTIMATED_LAUNCH_AT);
  const phase = teaserPhase(now);
  const navigationStory = phase >= 1 ? navigationStoryMarkup() : "";
  const participationStory = phase >= 2 ? participationStoryMarkup() : "";
  const resultsStory = phase >= 3 ? resultsStoryMarkup(returnDate) : "";
  const nextReveal = nextRevealMarkup(phase);

  return `<!doctype html>
<html lang="en" data-terraos-launch-at="${launchAt}" data-terraos-teaser-phase="${phase}">
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
  <title>TerraOS 3 — Solaris Studio</title>
  <style>
    @font-face { font-family:"Classica Crastao"; src:url("https://raw.githubusercontent.com/solarissongcontest/ssc-confirmations/main/public/classicacrastao-m2pj5.ttf") format("truetype"); font-display:swap; }
    @font-face { font-family:"Gotham"; src:url("https://raw.githubusercontent.com/solarissongcontest/ssc-confirmations/main/public/Gotham%20Book.otf") format("opentype"); font-weight:400; font-display:swap; }
    @font-face { font-family:"Gotham"; src:url("https://raw.githubusercontent.com/solarissongcontest/ssc-confirmations/main/public/Gotham%20Medium.otf") format("opentype"); font-weight:500; font-display:swap; }
    @font-face { font-family:"Gotham"; src:url("https://raw.githubusercontent.com/solarissongcontest/ssc-confirmations/main/public/Gotham%20Bold.otf") format("opentype"); font-weight:700; font-display:swap; }

    :root { color-scheme:dark; --bg:#000; --fg:#f5f5f7; --muted:rgba(245,245,247,.62); --soft:rgba(245,245,247,.42); --muted-soft:var(--soft); --line:rgba(255,255,255,.09); --blue:#7ddcff; --primary:var(--blue); --panel:#10141d; --panel-2:#111a2b; --wide:1180px; --narrow:900px; font-family:"Gotham",ui-sans-serif,system-ui,sans-serif; color:var(--fg); background:var(--bg); }
    * { box-sizing:border-box; }
    html { min-height:100%; background:#000; scroll-behavior:smooth; }
    body { margin:0; min-height:100svh; overflow-x:hidden; background:radial-gradient(circle at 50% -10%,rgba(59,133,192,.16),transparent 34rem),#000; color:var(--fg); letter-spacing:-.015em; -webkit-font-smoothing:antialiased; }
    button,input { font:inherit; }
    button { -webkit-tap-highlight-color:transparent; }
    svg { display:block; }
    .content { display:flex; min-height:100svh; flex-direction:column; }
    .hero { order:1; }
    .hod-portal { order:2; width:min(calc(100% - 2rem),var(--narrow)); margin-inline:auto; }
    .product-story { order:3; }
    footer { order:4; }
    .sr-only { position:absolute!important; width:1px!important; height:1px!important; padding:0!important; margin:-1px!important; overflow:hidden!important; clip:rect(0,0,0,0)!important; white-space:nowrap!important; border:0!important; }

    .site-nav { position:absolute; z-index:20; top:max(14px,env(safe-area-inset-top)); left:50%; width:min(calc(100% - 2rem),var(--wide)); transform:translateX(-50%); display:flex; align-items:center; justify-content:space-between; pointer-events:none; }
    .brand { display:flex; align-items:center; gap:.7rem; pointer-events:auto; }
    .mark { width:38px; height:38px; border-radius:999px; object-fit:contain; }
    .brand-name { display:block; font-family:"Classica Crastao",Georgia,serif; font-size:.88rem; letter-spacing:.045em; text-transform:uppercase; }
    .brand-sub { display:block; margin-top:.12rem; color:var(--soft); font-size:.62rem; }
    .maintenance-pill { display:inline-flex; align-items:center; gap:.44rem; min-height:34px; padding:.45rem .7rem; border:1px solid rgba(255,255,255,.1); border-radius:999px; background:rgba(14,14,16,.68); color:rgba(245,245,247,.7); font-size:.66rem; font-weight:700; -webkit-backdrop-filter:blur(18px); backdrop-filter:blur(18px); }
    .maintenance-pill::before { content:""; width:.45rem; height:.45rem; border-radius:50%; background:#efc36f; }

    .hero { position:relative; min-height:100svh; overflow:hidden; display:grid; align-content:start; justify-items:center; padding:max(7.2rem,calc(env(safe-area-inset-top) + 6rem)) 1rem 0; isolation:isolate; }
    .hero::before { content:""; position:absolute; z-index:-2; inset:0; background:radial-gradient(circle at 50% 26%,rgba(74,167,210,.14),transparent 25rem),linear-gradient(180deg,#03070b,#000 61%); }
    .hero::after { content:""; position:absolute; z-index:-1; top:48%; left:50%; width:min(900px,95vw); aspect-ratio:1.8; transform:translate(-50%,-50%); border-radius:50%; background:radial-gradient(ellipse,rgba(87,185,226,.09),transparent 70%); filter:blur(24px); }
    .hero-copy { position:relative; z-index:2; width:min(100%,900px); text-align:center; }
    .hero h1 { margin:0; font-family:"Classica Crastao",Georgia,serif; font-size:clamp(3.7rem,12.5vw,9rem); font-weight:400; line-height:.88; letter-spacing:-.03em; text-transform:none; white-space:nowrap; }
    .tagline { margin:1rem auto 0; color:rgba(245,245,247,.91); font-size:clamp(1.12rem,2.8vw,1.9rem); font-weight:500; line-height:1.15; letter-spacing:-.035em; }
    .launch { margin:clamp(2rem,5vw,3rem) auto 0; display:grid; justify-items:center; gap:.68rem; }
    .launch-label { color:var(--soft); font-size:.68rem; font-weight:700; letter-spacing:.14em; text-transform:uppercase; }
    .launch-date { font-size:clamp(.95rem,2vw,1.15rem); font-weight:700; }
    .countdown { display:flex; align-items:flex-start; justify-content:center; gap:clamp(.14rem,1vw,.7rem); width:min(100%,580px); margin-top:.18rem; font-variant-numeric:tabular-nums; }
    .countdown-unit { min-width:0; flex:1 1 0; text-align:center; }
    .countdown-value { display:block; font-size:clamp(1.95rem,7.2vw,4.5rem); font-weight:500; line-height:.92; letter-spacing:-.055em; }
    .countdown-name { display:block; margin-top:.44rem; color:rgba(245,245,247,.4); font-size:clamp(.46rem,1.8vw,.6rem); font-weight:700; letter-spacing:.095em; text-transform:uppercase; }
    .colon { flex:0 0 auto; margin-top:clamp(.3rem,1.2vw,.72rem); color:rgba(245,245,247,.24); font-size:clamp(1.6rem,5.4vw,3.25rem); line-height:1; }

    .hero-stage { position:relative; width:min(1100px,116vw); height:clamp(310px,43vw,520px); margin-top:clamp(1.8rem,4vw,3.2rem); perspective:1400px; pointer-events:none; }
    .phone { position:absolute; left:50%; top:50%; width:clamp(190px,23vw,285px); aspect-ratio:.49; overflow:hidden; border:1px solid rgba(255,255,255,.17); border-radius:clamp(28px,4vw,43px); background:#070a10; box-shadow:0 45px 120px rgba(0,0,0,.64),inset 0 0 0 1px rgba(255,255,255,.03); }
    .phone::before { content:""; position:absolute; z-index:8; top:10px; left:50%; width:31%; height:18px; transform:translateX(-50%); border-radius:999px; background:#020203; }
    .phone.center { z-index:3; transform:translate(-50%,-46%); }
    .phone.left { z-index:1; transform:translate(-145%,-36%) rotateY(18deg) rotateZ(-4deg) scale(.88); opacity:.72; }
    .phone.right { z-index:2; transform:translate(45%,-36%) rotateY(-18deg) rotateZ(4deg) scale(.88); opacity:.72; }
    .screen { position:absolute; inset:0; padding:2.75rem .82rem 3.7rem; background:radial-gradient(circle at 55% 3%,rgba(55,112,210,.19),transparent 33%),linear-gradient(180deg,#07101f,#02050a 78%); }
    .screen-context { display:flex; align-items:center; gap:.3rem; color:rgba(255,255,255,.54); font-size:.43rem; font-weight:700; letter-spacing:.1em; text-transform:uppercase; white-space:nowrap; }
    .screen-context::before { content:""; width:.32rem; height:.32rem; border-radius:50%; background:#62d4ff; box-shadow:0 0 .4rem rgba(98,212,255,.55); }
    .screen-kicker { display:block; margin-top:.8rem; color:#68ddff; font-size:.43rem; font-weight:700; letter-spacing:.12em; text-transform:uppercase; }
    .screen-title { display:block; margin-top:.26rem; font-family:"Classica Crastao",Georgia,serif; font-size:clamp(.98rem,1.8vw,1.3rem); font-weight:400; line-height:.95; letter-spacing:.01em; }
    .screen-copy { margin:.5rem 0 0; color:rgba(255,255,255,.52); font-size:.45rem; line-height:1.45; }
    .screen-section-title { display:block; margin:.8rem 0 .38rem; color:#fff; font-size:.53rem; font-weight:700; }
    .phone-card { position:relative; margin-top:.5rem; padding:.62rem; border:1px solid rgba(142,191,255,.15); border-radius:.82rem; background:linear-gradient(145deg,rgba(20,54,99,.72),rgba(9,22,48,.78)); }
    .phone-card small { display:block; color:rgba(255,255,255,.52); font-size:.39rem; }
    .phone-card b { display:block; margin-top:.18rem; font-size:.55rem; line-height:1.25; }
    .phone-card .big { font-size:.82rem; font-weight:500; letter-spacing:-.04em; }
    .phone-card .check { position:absolute; right:.55rem; top:50%; transform:translateY(-50%); display:grid; place-items:center; width:1.5rem; height:1.5rem; border:1px solid rgba(79,212,255,.4); border-radius:50%; color:#62dcff; font-size:.68rem; }
    .phone-row { display:grid; grid-template-columns:auto 1fr auto; align-items:center; gap:.45rem; padding:.45rem 0; border-top:1px solid rgba(255,255,255,.07); }
    .phone-row:first-child { border-top:0; }
    .phone-row .state { display:grid; place-items:center; width:1.25rem; height:1.25rem; border:1px solid rgba(99,218,157,.4); border-radius:50%; color:#79e4aa; font-size:.5rem; }
    .phone-row b { font-size:.49rem; }
    .phone-row small { display:block; margin-top:.08rem; color:rgba(255,255,255,.44); font-size:.37rem; }
    .phone-row em { color:rgba(255,255,255,.55); font-size:.38rem; font-style:normal; }
    .search-card { display:flex; align-items:center; gap:.5rem; margin-top:.5rem; padding:.62rem; border:1px solid rgba(142,191,255,.15); border-radius:.82rem; background:rgba(12,30,60,.78); }
    .search-icon { display:grid; place-items:center; width:1.45rem; height:1.45rem; border-radius:.48rem; background:rgba(47,150,197,.18); color:#62d9ff; font-size:.7rem; }
    .search-card b { display:block; font-size:.5rem; }
    .search-card small { display:block; margin-top:.1rem; color:rgba(255,255,255,.44); font-size:.36rem; line-height:1.3; }
    .mini-nav { position:absolute; z-index:7; left:.58rem; right:.58rem; bottom:.58rem; height:2.75rem; display:grid; grid-template-columns:repeat(5,1fr); align-items:center; padding:.2rem .28rem; border:1px solid rgba(155,200,255,.16); border-radius:1.2rem; background:rgba(15,28,52,.86); box-shadow:inset 0 1px 0 rgba(255,255,255,.05); -webkit-backdrop-filter:blur(18px); backdrop-filter:blur(18px); }
    .mini-nav-item { display:grid; place-items:center; height:100%; color:rgba(220,232,250,.56); }
    .mini-nav-item svg { width:.82rem; height:.82rem; fill:none; stroke:currentColor; stroke-width:1.7; stroke-linecap:round; stroke-linejoin:round; }
    .mini-nav-item.active { color:#67dcff; }

    .product-story { background:#000; }
    .story { position:relative; width:min(calc(100% - 2rem),var(--wide)); margin:0 auto; padding:clamp(5.5rem,11vw,9rem) 0; }
    .story + .story { border-top:1px solid rgba(255,255,255,.06); }
    .story h2 { max-width:900px; margin:0; font-size:clamp(2.7rem,7vw,6.2rem); line-height:.94; letter-spacing:-.065em; text-wrap:balance; }
    .eyebrow { margin:0 0 .8rem; color:#70dcff; font-size:.72rem; font-weight:700; letter-spacing:.16em; text-transform:uppercase; }
    .story-heading { position:relative; z-index:3; }
    .story-grid { display:grid; grid-template-columns:minmax(0,.78fr) minmax(0,1.22fr); gap:clamp(2rem,7vw,7rem); align-items:start; }
    .sticky-heading { position:sticky; top:max(5rem,12vh); }

    .first-look { min-height:min(760px,84svh); margin-top:clamp(2.4rem,5vw,4rem); display:grid; grid-template-columns:minmax(0,.78fr) minmax(0,1.22fr); align-items:center; gap:clamp(1.5rem,5vw,5rem); overflow:hidden; padding:clamp(1.4rem,4vw,3rem); border:1px solid var(--line); border-radius:clamp(1.7rem,3.4vw,2.8rem); background:radial-gradient(circle at 72% 35%,rgba(52,123,205,.2),transparent 35%),linear-gradient(145deg,#0c121d,#08090d 68%); }
    .first-look-copy h3 { margin:0; font-size:clamp(2rem,4.5vw,4.2rem); line-height:.98; letter-spacing:-.06em; }
    .first-look-copy p { margin:1rem 0 0; color:var(--muted); font-size:clamp(.9rem,1.7vw,1.08rem); line-height:1.5; }
    .preview-device { position:relative; justify-self:center; width:min(360px,72vw); aspect-ratio:.51; overflow:hidden; border:1px solid rgba(255,255,255,.16); border-radius:2.6rem; background:#06101e; box-shadow:0 35px 100px rgba(0,0,0,.5); }
    .preview-device::before { content:""; position:absolute; z-index:8; top:.72rem; left:50%; width:29%; height:1.2rem; transform:translateX(-50%); border-radius:999px; background:#010205; }
    .preview-screen { position:absolute; inset:0; padding:3.1rem 1.15rem 5.4rem; background:radial-gradient(circle at 70% 0%,rgba(56,105,204,.19),transparent 34%),#030914; }
    .preview-screen .screen-title { font-size:2rem; }
    .preview-screen .phone-card { margin-top:1rem; padding:1rem; border-radius:1.15rem; }
    .preview-screen .phone-card small { font-size:.62rem; }
    .preview-screen .phone-card b { font-size:.92rem; }
    .preview-device .mini-nav { left:.85rem; right:.85rem; bottom:.85rem; height:4.1rem; border-radius:1.7rem; }
    .preview-device .mini-nav-item svg { width:1.15rem; height:1.15rem; }

    .next-reveal { width:min(calc(100% - 2rem),var(--wide)); min-height:28svh; margin:0 auto; display:grid; place-items:center; border-top:1px solid rgba(255,255,255,.06); }
    .next-reveal span { display:inline-flex; min-width:min(88vw,24rem); min-height:3rem; align-items:center; justify-content:center; padding:.75rem 1.1rem; border:1px solid rgba(255,255,255,.12); border-radius:999px; color:rgba(255,255,255,.72); font-size:.72rem; font-weight:700; letter-spacing:.12em; text-transform:uppercase; }

    .story-touch { text-align:center; }
    .interactive-device { width:min(660px,100%); margin:clamp(2.4rem,5vw,4rem) auto 0; padding:clamp(.7rem,2vw,1.2rem); border:1px solid var(--line); border-radius:clamp(1.8rem,4vw,3rem); background:linear-gradient(145deg,#10141d,#07090d); box-shadow:0 45px 120px rgba(0,0,0,.55); }
    .interactive-screen { position:relative; min-height:clamp(520px,68vw,720px); overflow:hidden; padding:2.1rem clamp(1rem,3vw,2rem) 6.5rem; border:1px solid rgba(255,255,255,.07); border-radius:clamp(1.35rem,3.2vw,2.2rem); background:radial-gradient(circle at 70% 0%,rgba(58,106,207,.18),transparent 33%),#030914; text-align:left; }
    .interactive-topline { display:flex; align-items:center; gap:.45rem; color:rgba(255,255,255,.54); font-size:.66rem; font-weight:700; letter-spacing:.1em; text-transform:uppercase; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
    .status-dot { width:.48rem; height:.48rem; flex:0 0 auto; border-radius:50%; background:#5fd7ff; box-shadow:0 0 .6rem rgba(95,215,255,.55); }
    .nav-pane { margin-top:clamp(2.1rem,5vw,4rem); }
    .pane-kicker { display:block; color:#69dcff; font-size:.72rem; font-weight:700; letter-spacing:.14em; text-transform:uppercase; }
    .nav-pane > strong { display:block; margin-top:.45rem; font-family:"Classica Crastao",Georgia,serif; font-size:clamp(2rem,7vw,4.6rem); font-weight:400; line-height:.95; }
    .demo-card { position:relative; margin-top:1.3rem; padding:1.05rem 1.1rem; border:1px solid rgba(142,191,255,.15); border-radius:1.2rem; background:linear-gradient(145deg,rgba(20,54,99,.7),rgba(9,22,48,.8)); }
    .demo-card small,.demo-row small,.responsibility-row small { display:block; color:rgba(255,255,255,.48); font-size:.72rem; }
    .demo-card b { display:block; margin-top:.25rem; font-size:clamp(1rem,2.4vw,1.35rem); }
    .demo-now b { font-size:clamp(1.45rem,4vw,2.45rem); font-weight:500; letter-spacing:-.045em; }
    .demo-check { position:absolute; right:1rem; top:50%; transform:translateY(-50%); display:grid; place-items:center; width:2.8rem; height:2.8rem; border:1px solid rgba(86,215,255,.42); border-radius:50%; color:#68deff; font-size:1.25rem; }
    .demo-row { display:flex; align-items:center; gap:.8rem; margin-top:1.25rem; padding:1rem; border:1px solid rgba(142,191,255,.13); border-radius:1.1rem; background:rgba(12,30,60,.68); }
    .demo-row b { display:block; font-size:1rem; }
    .demo-icon,.demo-avatar { display:grid; place-items:center; width:2.8rem; height:2.8rem; flex:0 0 auto; border-radius:.9rem; background:rgba(60,168,219,.15); color:#6ee2ff; font-size:1.2rem; }
    .responsibility-row { display:grid; grid-template-columns:auto 1fr; align-items:center; gap:.8rem; margin-top:.8rem; padding:.9rem 0; border-top:1px solid rgba(255,255,255,.08); }
    .state-check { display:grid; place-items:center; width:2.5rem; height:2.5rem; border:1px solid rgba(104,226,169,.36); border-radius:50%; color:#7be4ac; }
    .ranking-row { display:grid; grid-template-columns:2rem 1fr auto; align-items:center; gap:.8rem; min-height:3rem; border-top:1px solid rgba(255,255,255,.08); }
    .ranking-row:first-of-type { margin-top:1rem; }
    .ranking-row span { color:var(--soft); font-size:.76rem; }
    .ranking-row b { font-size:.9rem; }
    .ranking-row strong { font-size:.9rem; }

    .liquid-nav { --p:0; --stretch:0; position:absolute; left:clamp(.7rem,2vw,1.2rem); right:clamp(.7rem,2vw,1.2rem); bottom:clamp(.7rem,2vw,1.2rem); height:4.45rem; display:grid; grid-template-columns:repeat(5,1fr); align-items:center; padding:.35rem; touch-action:none; user-select:none; border:1px solid rgba(255,255,255,.16); border-radius:1.65rem; background:rgba(23,34,54,.72); box-shadow:inset 0 1px 0 rgba(255,255,255,.11),0 12px 36px rgba(0,0,0,.28); -webkit-backdrop-filter:blur(24px) saturate(155%); backdrop-filter:blur(24px) saturate(155%); }
    .liquid-lens { position:absolute; z-index:1; top:.35rem; bottom:.35rem; left:.35rem; width:calc((100% - .7rem)/5); border:1px solid rgba(255,255,255,.2); border-radius:1.25rem; background:linear-gradient(145deg,rgba(255,255,255,.17),rgba(119,202,255,.07)); box-shadow:inset 0 1px 0 rgba(255,255,255,.2),0 5px 18px rgba(0,0,0,.24); transform:translateX(calc(var(--p)*100%)) scaleX(calc(1 + var(--stretch))); transition:transform .38s cubic-bezier(.2,.8,.2,1),border-radius .22s; pointer-events:none; }
    .liquid-nav[data-dragging="true"] .liquid-lens { transition:none; border-radius:1.05rem 1.4rem 1.4rem 1.05rem; }
    .liquid-nav[data-dragging="true"][data-direction="-1"] .liquid-lens { border-radius:1.4rem 1.05rem 1.05rem 1.4rem; }
    .liquid-tab { position:relative; z-index:2; display:grid; place-items:center; width:100%; height:100%; border:0; border-radius:1.2rem; background:transparent; color:rgba(225,235,250,.5); cursor:pointer; }
    .liquid-tab svg { width:1.4rem; height:1.4rem; fill:none; stroke:currentColor; stroke-width:1.7; stroke-linecap:round; stroke-linejoin:round; transition:transform .18s ease,color .18s ease; }
    .liquid-tab[aria-selected="true"] { color:#fff; }
    .liquid-tab[aria-selected="true"] svg { transform:scale(1.06); }
    .liquid-tab:focus-visible { outline:2px solid #82e5ff; outline-offset:-5px; }
    .touch-hint { margin:1rem 0 0; color:var(--soft); font-size:.72rem; text-align:center; }

    .participation-device { width:min(620px,100%); justify-self:end; padding:clamp(1.2rem,3vw,2rem); border:1px solid var(--line); border-radius:2rem; background:radial-gradient(circle at 90% 0%,rgba(53,105,205,.18),transparent 35%),#07101e; }
    .participation-header span { display:block; color:#6bdcff; font-size:.72rem; font-weight:700; letter-spacing:.14em; text-transform:uppercase; }
    .participation-header strong { display:block; margin-top:.45rem; font-family:"Classica Crastao",Georgia,serif; font-size:clamp(2rem,5vw,3.5rem); font-weight:400; }
    .state-sequence { margin-top:1.5rem; display:grid; gap:.72rem; }
    .state-card { display:grid; grid-template-columns:auto 1fr auto; align-items:center; gap:.8rem; min-height:4.6rem; padding:.82rem .9rem; border:1px solid rgba(255,255,255,.08); border-radius:1.1rem; background:rgba(255,255,255,.04); }
    .state-number { display:grid; place-items:center; width:2.4rem; height:2.4rem; border-radius:.75rem; background:rgba(255,255,255,.06); color:var(--soft); font-size:.66rem; font-weight:700; }
    .state-card b { display:block; font-size:.9rem; }
    .state-card small { display:block; margin-top:.14rem; color:var(--soft); font-size:.67rem; }
    .state-card > strong { max-width:9.5rem; color:rgba(255,255,255,.66); font-size:.7rem; text-align:right; }
    .state-complete > strong { color:#9fe8c0; }
    .state-action > strong { color:#ffb4b4; }

    .results-reveal { position:relative; width:min(860px,100%); min-height:clamp(560px,72vw,760px); margin:clamp(2.5rem,5vw,4rem) auto 0; overflow:hidden; display:grid; align-items:end; border:1px solid var(--line); border-radius:clamp(1.8rem,4vw,3rem); background:radial-gradient(circle at 50% 24%,rgba(54,112,206,.2),transparent 28rem),#060910; box-shadow:0 45px 130px rgba(0,0,0,.55); }
    .results-spotlight { position:absolute; inset:0; pointer-events:none; }
    .results-spotlight span { position:absolute; font-size:clamp(4.8rem,13vw,10rem); font-weight:700; letter-spacing:-.08em; }
    .results-spotlight span:nth-child(1) { top:7%; left:8%; opacity:.95; }
    .results-spotlight span:nth-child(2) { top:23%; right:9%; opacity:.44; }
    .results-spotlight span:nth-child(3) { top:43%; left:31%; opacity:.18; }
    .results-ui { position:relative; z-index:2; margin:0 clamp(1rem,4vw,2.5rem) clamp(1rem,4vw,2.5rem); padding:clamp(1.1rem,3vw,1.7rem); overflow:hidden; border:1px solid rgba(255,255,255,.1); border-radius:1.6rem; background:rgba(10,20,39,.82); -webkit-backdrop-filter:blur(24px); backdrop-filter:blur(24px); }
    .results-title-row { display:flex; align-items:center; justify-content:space-between; gap:1rem; }
    .results-title-row small { display:block; color:#6bdcff; font-size:.68rem; font-weight:700; letter-spacing:.13em; text-transform:uppercase; }
    .results-title-row b { display:block; margin-top:.2rem; font-size:1.45rem; }
    .live-chip { padding:.42rem .7rem; border:1px solid rgba(125,220,255,.18); border-radius:999px; color:#91e7ff; font-size:.68rem; font-weight:700; }
    .result-tabs { display:flex; gap:.5rem; margin:1rem 0 .45rem; color:var(--soft); font-size:.72rem; }
    .result-tabs span { padding:.42rem .65rem; border-radius:999px; }
    .result-tabs .selected { background:rgba(125,220,255,.1); color:#a7ebff; }
    .ranking-row.large { min-height:3.5rem; }
    .results-mask { position:absolute; z-index:3; left:0; right:0; bottom:0; height:27%; background:linear-gradient(180deg,transparent,#08101f 88%); pointer-events:none; }
    .interface-details { margin-top:1rem; display:grid; grid-template-columns:1.05fr .95fr 1fr; gap:.8rem; }
    .detail-crop { position:relative; min-height:240px; overflow:hidden; padding:1.1rem; border:1px solid var(--line); border-radius:1.45rem; background:radial-gradient(circle at 50% 110%,rgba(66,133,209,.16),transparent 58%),#0b0f17; }
    .detail-crop > span { color:var(--soft); font-size:.62rem; font-weight:700; letter-spacing:.12em; }
    .detail-pill { position:absolute; left:10%; right:10%; bottom:17%; height:4rem; border:1px solid rgba(255,255,255,.15); border-radius:1.6rem; background:rgba(35,47,68,.67); -webkit-backdrop-filter:blur(18px); backdrop-filter:blur(18px); }
    .detail-status { position:absolute; left:10%; right:10%; top:42%; display:flex; align-items:center; gap:.7rem; padding:.9rem; border:1px solid rgba(255,255,255,.1); border-radius:1rem; background:rgba(255,255,255,.04); }
    .detail-status i { width:.65rem; height:.65rem; border-radius:50%; background:#ffaaa8; }
    .detail-status b { font-size:.78rem; }
    .detail-score { position:absolute; left:50%; top:53%; transform:translate(-50%,-50%); font-size:5.5rem; font-weight:700; letter-spacing:-.08em; }
    .final-countdown { text-align:center; }
    .final-countdown h2 { margin-inline:auto; }
    .final-date { margin-top:1.5rem; color:rgba(255,255,255,.56); font-size:clamp(1rem,2.3vw,1.3rem); font-weight:700; }
    .final-clock { margin-top:1.6rem; display:inline-flex; gap:.55rem; font-size:clamp(2rem,6vw,4.6rem); font-weight:500; letter-spacing:-.06em; font-variant-numeric:tabular-nums; }

    footer { width:min(calc(100% - 2rem),var(--wide)); margin:0 auto; padding:1.5rem 0 max(1.5rem,env(safe-area-inset-bottom)); border-top:1px solid rgba(255,255,255,.07); display:flex; justify-content:space-between; gap:1rem; color:rgba(245,245,247,.38); font-size:.67rem; line-height:1.5; }
    footer strong { display:block; margin-bottom:.14rem; color:rgba(245,245,247,.65); font-weight:500; }
    .scroll-in { opacity:1; transform:none; }

    @media (min-width:901px) and (prefers-reduced-motion:no-preference) { .scroll-in:not(.seen) { opacity:0; transform:translateY(28px); } .scroll-in { transition:opacity .72s cubic-bezier(.2,.8,.2,1),transform .72s cubic-bezier(.2,.8,.2,1); } }
    @media (max-width:900px) {
      .site-nav { width:min(calc(100% - 1.25rem),var(--wide)); }
      .maintenance-pill,.brand-sub { display:none; }
      .hero { min-height:900px; }
      .hero-stage { width:120vw; height:385px; }
      .phone { width:clamp(170px,43vw,230px); }
      .phone.left { transform:translate(-140%,-35%) rotateY(17deg) rotateZ(-5deg) scale(.83); }
      .phone.right { transform:translate(40%,-35%) rotateY(-17deg) rotateZ(5deg) scale(.83); }
      .story-grid,.first-look { grid-template-columns:1fr; }
      .sticky-heading { position:static; }
      .first-look { min-height:0; }
      .first-look-copy { max-width:30rem; }
      .preview-device { margin-top:.8rem; }
      .participation-device { justify-self:stretch; }
      .interface-details { grid-template-columns:1fr; }
      .detail-crop { min-height:200px; }
    }
    @media (max-width:560px) {
      .site-nav { top:max(10px,env(safe-area-inset-top)); }
      .mark { width:34px; height:34px; }
      .brand-name { font-size:.76rem; }
      .hero { min-height:850px; padding-inline:.7rem; }
      .hero h1 { font-size:clamp(3.3rem,17vw,5.7rem); max-width:100%; }
      .hero-stage { width:126vw; height:320px; margin-top:1.7rem; }
      .phone { width:178px; border-radius:30px; }
      .phone.left { transform:translate(-135%,-32%) rotateY(15deg) rotateZ(-5deg) scale(.78); }
      .phone.right { transform:translate(35%,-32%) rotateY(-15deg) rotateZ(5deg) scale(.78); }
      .screen { padding-inline:.72rem; }
      .countdown { gap:.08rem; }
      .colon { margin-inline:-.08rem; }
      .story { width:min(calc(100% - 1.25rem),var(--wide)); padding:4.8rem 0; }
      .story h2 { font-size:clamp(2.8rem,15vw,4.25rem); }
      .first-look { margin-top:2rem; padding:1.15rem; border-radius:1.8rem; }
      .first-look-copy h3 { font-size:2.35rem; }
      .preview-device { width:min(330px,84vw); }
      .next-reveal { width:min(calc(100% - 1.25rem),var(--wide)); min-height:24svh; }
      .interactive-device { padding:.55rem; border-radius:1.8rem; }
      .interactive-screen { min-height:560px; padding:1.5rem .9rem 5.7rem; border-radius:1.4rem; }
      .nav-pane { margin-top:2rem; }
      .liquid-nav { left:.55rem; right:.55rem; bottom:.55rem; height:4.1rem; border-radius:1.45rem; }
      .liquid-tab svg { width:1.25rem; height:1.25rem; }
      .participation-device { padding:1rem; border-radius:1.6rem; }
      .state-card { grid-template-columns:auto 1fr; }
      .state-card > strong { grid-column:2; text-align:left; max-width:none; margin-top:-.3rem; }
      .results-reveal { min-height:560px; }
      .interface-details { grid-template-columns:1fr; }
      footer { width:min(calc(100% - 1.25rem),var(--wide)); flex-direction:column; gap:.3rem; }
    }
    @supports not ((backdrop-filter:blur(1px)) or (-webkit-backdrop-filter:blur(1px))) { .maintenance-pill,.mini-nav,.liquid-nav,.results-ui,.detail-pill { background:rgba(20,29,45,.98); } }
    @media (prefers-reduced-transparency:reduce) { .maintenance-pill,.mini-nav,.liquid-nav,.results-ui,.detail-pill { -webkit-backdrop-filter:none; backdrop-filter:none; background:rgba(20,29,45,.98); } }
    @media (prefers-reduced-motion:no-preference) { .hero-copy { animation:hero-in .72s cubic-bezier(.2,.8,.2,1) both; } .phone.center { animation:center-in .85s .08s cubic-bezier(.2,.8,.2,1) both; } @keyframes hero-in { from { opacity:0; transform:translateY(12px); } to { opacity:1; transform:none; } } @keyframes center-in { from { opacity:0; transform:translate(-50%,-39%) scale(.95); } to { opacity:1; transform:translate(-50%,-46%); } } }
    @media (prefers-reduced-motion:reduce) { html { scroll-behavior:auto; } *,*::before,*::after { animation-duration:.001ms!important; animation-iteration-count:1!important; transition-duration:.001ms!important; scroll-behavior:auto!important; } .liquid-lens { transform:translateX(calc(var(--p)*100%))!important; } }
  </style>
</head>
<body>
<div class="content" data-solaris-maintenance="true">
  <section class="hero" aria-labelledby="maintenance-title">
    <header class="site-nav">
      <div class="brand" aria-label="Solaris Studio">
        <img class="mark" src="/solaris-studio-mark.png" alt="" aria-hidden="true" width="256" height="256" />
        <span><span class="brand-name">Solaris Studio</span><span class="brand-sub">Terra Solaris Broadcasting Coalition</span></span>
      </div>
      <span class="maintenance-pill">Maintenance in progress</span>
    </header>

    <div class="hero-copy">
      <h1 id="maintenance-title">TerraOS 3</h1>
      <p class="tagline">Solaris Studio, rebuilt.</p>
      <div class="launch">
        <span class="launch-label">Estimated arrival</span>
        <span class="launch-date">${returnDate}</span>
        <div class="countdown" id="terraos-countdown" role="timer" aria-live="off" aria-label="Estimated arrival ${returnDate}">
          <span class="countdown-unit"><span class="countdown-value" data-countdown="days">--</span><span class="countdown-name">Days</span></span><span class="colon" aria-hidden="true">:</span>
          <span class="countdown-unit"><span class="countdown-value" data-countdown="hours">--</span><span class="countdown-name">Hours</span></span><span class="colon" aria-hidden="true">:</span>
          <span class="countdown-unit"><span class="countdown-value" data-countdown="minutes">--</span><span class="countdown-name">Minutes</span></span><span class="colon" aria-hidden="true">:</span>
          <span class="countdown-unit"><span class="countdown-value" data-countdown="seconds">--</span><span class="countdown-name">Seconds</span></span>
        </div>
        <span class="sr-only">Estimated arrival: ${returnDate}.</span>
      </div>
    </div>

    <div class="hero-stage" aria-label="TerraOS preview" role="img">
      <div class="phone left" aria-hidden="true"><div class="screen"><div class="screen-context">SSC 22 · Current edition</div><span class="screen-kicker">SSC 22</span><strong class="screen-title">Your participation</strong><span class="screen-section-title">Your responsibilities</span><div class="phone-card"><div class="phone-row"><span class="state">✓</span><span><b>Country confirmed</b><small>Current edition confirmation</small></span><em>Done</em></div><div class="phone-row"><span class="state">✓</span><span><b>Entry ready</b><small>Current workflow complete</small></span><em>Done</em></div></div><span class="screen-section-title">Voting</span><div class="phone-card"><small>Jury · Official</small><b>No current voting actions</b></div>${miniNav("participate")}</div></div>
      <div class="phone center" aria-hidden="true"><div class="screen"><div class="screen-context">SSC 22 · Current edition</div><strong class="screen-title" style="margin-top:1rem">Solaris now</strong><p class="screen-copy">What matters now, followed by the current contest and what comes next.</p><div class="phone-card"><small>Right now</small><b class="big">You’re all caught up</b><span class="check">✓</span></div><span class="screen-section-title">Current contest</span><div class="phone-card"><small>Solaris Song Contest 22</small><b>SSC 22 is the current Solaris edition</b></div>${miniNav("home")}</div></div>
      <div class="phone right" aria-hidden="true"><div class="screen"><div class="screen-context">SSC 22 · Current edition</div><span class="screen-kicker">Explore Solaris</span><strong class="screen-title">Discover the contest</strong><p class="screen-copy">Browse editions, delegations, songs, shows and stories.</p><span class="screen-section-title">Search</span><div class="search-card"><span class="search-icon">⌕</span><span><b>Search Solaris</b><small>Find public editions, countries, entries and shows</small></span></div><span class="screen-section-title">Current edition</span><div class="phone-card"><small>Current edition</small><b>Solaris Song Contest 22</b></div>${miniNav("explore")}</div></div>
    </div>
  </section>

  <main class="product-story">
    <section class="story scroll-in" aria-labelledby="closer-title">
      <div class="story-heading"><h2 id="closer-title">Take a closer look.</h2></div>
      <div class="first-look">
        <div class="first-look-copy"><h3>Five places.<br />One Solaris.</h3><p>Home. Explore. Participate. Results. Me.</p></div>
        <div class="preview-device" aria-label="TerraOS Home preview">
          <div class="preview-screen"><div class="screen-context">SSC 22 · Current edition</div><strong class="screen-title" style="margin-top:1.1rem">Solaris now</strong><div class="phone-card"><small>Right now</small><b class="big">You’re all caught up</b><span class="check">✓</span></div><span class="screen-section-title">Current contest</span><div class="phone-card"><small>Solaris Song Contest 22</small><b>SSC 22 is the current Solaris edition</b></div>${miniNav("home")}</div>
        </div>
      </div>
    </section>
    ${navigationStory}
    ${participationStory}
    ${resultsStory}
    ${nextReveal}
  </main>

          <footer>
    <div><strong>Terra Solaris Broadcasting Coalition</strong>Solaris Studio · TerraOS 3 preview</div>
    <div>Maintenance notice updated ${updated} · HTTP 503</div>
  </footer>
</div>
<script>
(function(){
  var root=document.querySelector('.content');
  var portal=document.querySelector('.hod-portal');
  var story=document.querySelector('.product-story');
  if(root&&portal&&story&&portal.parentNode===root){root.insertBefore(portal,story);}

  var launch=new Date(document.documentElement.getAttribute('data-terraos-launch-at')||'').getTime();
  var interval=null;
  function two(v){return String(Math.max(0,v)).padStart(2,'0');}
  function text(sel,v){var n=document.querySelector(sel);if(n)n.textContent=v;}
  function tick(){
    if(!Number.isFinite(launch))return;
    var left=Math.max(0,launch-Date.now()),s=Math.floor(left/1000),d=Math.floor(s/86400),h=Math.floor((s%86400)/3600),m=Math.floor((s%3600)/60),sec=s%60;
    text('[data-countdown="days"]',two(d));text('[data-countdown="hours"]',two(h));text('[data-countdown="minutes"]',two(m));text('[data-countdown="seconds"]',two(sec));
    text('[data-final="days"]',two(d));text('[data-final="hours"]',two(h));text('[data-final="minutes"]',two(m));text('[data-final="seconds"]',two(sec));
    if(left<=0&&interval!==null){clearInterval(interval);interval=null;}
  }
  tick();if(Number.isFinite(launch)&&launch>Date.now())interval=setInterval(tick,1000);

  var demo=document.getElementById('liquid-demo');
  var device=document.getElementById('interactive-device');
  if(demo&&device){
    var tabs=Array.from(demo.querySelectorAll('.liquid-tab'));
    var panes=Array.from(device.querySelectorAll('[data-pane]'));
    var active=0,visual=0,dragging=false,startX=0,startP=0,startT=0,lastX=0,lastT=0,velocity=0;
    function clamp(v,a,b){return Math.min(b,Math.max(a,v));}
    function resist(v){if(v<0)return-Math.min(.24,Math.abs(v)*.2);if(v>4)return 4+Math.min(.24,(v-4)*.2);return v;}
    function render(progress,preview,stretch,direction){
      visual=progress;
      demo.style.setProperty('--p',String(progress));
      demo.style.setProperty('--stretch',String(stretch||0));
      demo.setAttribute('data-direction',String(direction||0));
      tabs.forEach(function(tab,i){tab.setAttribute('aria-selected',i===preview?'true':'false');});
      panes.forEach(function(pane,i){pane.hidden=i!==preview;});
      device.setAttribute('data-active',String(preview));
    }
    function select(i){active=clamp(i,0,4);render(active,active,0,0);}
    tabs.forEach(function(tab,i){
      tab.addEventListener('click',function(){select(i);});
      tab.addEventListener('keydown',function(event){
        if(event.key==='ArrowRight'){event.preventDefault();select(active+1);tabs[active].focus();}
        if(event.key==='ArrowLeft'){event.preventDefault();select(active-1);tabs[active].focus();}
        if(event.key==='Home'){event.preventDefault();select(0);tabs[0].focus();}
        if(event.key==='End'){event.preventDefault();select(4);tabs[4].focus();}
      });
    });
    demo.addEventListener('pointerdown',function(event){
      if(event.pointerType==='mouse'&&event.button!==0)return;
      dragging=true;startX=event.clientX;startP=active;startT=event.timeStamp;lastX=event.clientX;lastT=event.timeStamp;velocity=0;
      demo.setAttribute('data-dragging','true');demo.setPointerCapture(event.pointerId);
    });
    demo.addEventListener('pointermove',function(event){
      if(!dragging)return;
      var rect=demo.getBoundingClientRect(),slot=rect.width/5,raw=startP+(event.clientX-startX)/slot,p=resist(raw),dt=Math.max(1,event.timeStamp-lastT);
      velocity=(event.clientX-lastX)/dt;lastX=event.clientX;lastT=event.timeStamp;
      var preview=clamp(Math.round(p),0,4),stretch=Math.min(.18,Math.abs(velocity)*.12+Math.abs(p-active)*.035),direction=event.clientX===startX?0:(event.clientX>startX?1:-1);
      render(p,preview,stretch,direction);
    });
    function end(event,cancelled){
      if(!dragging)return;
      dragging=false;demo.setAttribute('data-dragging','false');
      var rect=demo.getBoundingClientRect(),slot=rect.width/5,projected=cancelled?active:visual+(velocity*110)/slot,target=clamp(Math.round(projected),0,4);
      if(!cancelled&&Math.abs(visual-active)<.28&&Math.abs(velocity)<.35)target=active;
      select(target);
      if(demo.hasPointerCapture&&demo.hasPointerCapture(event.pointerId))demo.releasePointerCapture(event.pointerId);
    }
    demo.addEventListener('pointerup',function(event){end(event,false);});
    demo.addEventListener('pointercancel',function(event){end(event,true);});
  }

  if('IntersectionObserver'in window&&!matchMedia('(prefers-reduced-motion: reduce)').matches){var observer=new IntersectionObserver(function(entries){entries.forEach(function(entry){if(entry.isIntersecting){entry.target.classList.add('seen');observer.unobserve(entry.target);}});},{threshold:.12});document.querySelectorAll('.scroll-in').forEach(function(node){observer.observe(node);});}else{document.querySelectorAll('.scroll-in').forEach(function(node){node.classList.add('seen');});}
})();
</script>
</body>
</html>`;
}
