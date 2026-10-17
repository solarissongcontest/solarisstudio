import {
  MAINTENANCE_LAST_UPDATED,
  MAINTENANCE_RETURN_DATE,
} from "./maintenance";

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function renderMaintenancePage(): string {
  const returnDate = escapeHtml(MAINTENANCE_RETURN_DATE);
  const updated = escapeHtml(MAINTENANCE_LAST_UPDATED);

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <meta name="theme-color" content="#06101f" />
    <meta name="color-scheme" content="dark" />
    <meta name="application-name" content="Solaris Studio" />
    <meta name="mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
    <meta name="apple-mobile-web-app-title" content="Solaris Studio" />
    <link rel="icon" href="/favicon.ico?v=img2340-20260929" sizes="any" />
    <link rel="icon" type="image/png" href="/icon-192.png?v=img2340-20260929" sizes="192x192" />
    <link rel="apple-touch-icon" href="/apple-touch-icon.png?v=img2340-20260929" sizes="180x180" />
    <link rel="manifest" href="/site.webmanifest?v=img2340-20260929" />
    <meta name="robots" content="noindex, nofollow" />
    <title>Solaris Studio maintenance</title>
    <style>
      @font-face {
        font-family: "Classica Crastao";
        src: url("https://raw.githubusercontent.com/solarissongcontest/ssc-confirmations/main/public/classicacrastao-m2pj5.ttf") format("truetype");
        font-weight: 400;
        font-style: normal;
        font-display: swap;
      }
      @font-face {
        font-family: "Gotham";
        src: url("https://raw.githubusercontent.com/solarissongcontest/ssc-confirmations/main/public/Gotham%20Book.otf") format("opentype");
        font-weight: 400;
        font-style: normal;
        font-display: swap;
      }
      @font-face {
        font-family: "Gotham";
        src: url("https://raw.githubusercontent.com/solarissongcontest/ssc-confirmations/main/public/Gotham%20Medium.otf") format("opentype");
        font-weight: 500;
        font-style: normal;
        font-display: swap;
      }
      @font-face {
        font-family: "Gotham";
        src: url("https://raw.githubusercontent.com/solarissongcontest/ssc-confirmations/main/public/Gotham%20Bold.otf") format("opentype");
        font-weight: 700;
        font-style: normal;
        font-display: swap;
      }

      :root {
        color-scheme: dark;
        --background: #020817;
        --surface: rgba(7, 18, 38, .91);
        --surface-strong: rgba(9, 25, 48, .96);
        --foreground: #f6f9fc;
        --muted: rgba(224, 236, 246, .72);
        --muted-soft: rgba(205, 223, 236, .54);
        --primary: #9ddff2;
        --primary-strong: #73c7df;
        --good: #bdf4d8;
        --border: rgba(205, 232, 245, .17);
        font-family: "Gotham", ui-sans-serif, system-ui, sans-serif;
        color: var(--foreground);
        background: var(--background);
      }

      * { box-sizing: border-box; }
      html, body { min-height: 100%; }
      html { background: var(--background); }

      body {
        margin: 0;
        min-height: 100svh;
        overflow-x: hidden;
        background-color: var(--background);
        background-image:
          linear-gradient(180deg, rgba(2, 8, 23, .16), rgba(2, 8, 23, .56)),
          url("/solaris-background.webp");
        background-size: cover, cover;
        background-position: center, center;
        background-repeat: no-repeat;
        background-attachment: fixed, fixed;
        font-family: "Gotham", ui-sans-serif, system-ui, sans-serif;
        letter-spacing: -.012em;
        -webkit-font-smoothing: antialiased;
        text-rendering: optimizeLegibility;
      }

      .ambient {
        position: fixed;
        inset: 0;
        pointer-events: none;
        overflow: hidden;
        z-index: 0;
      }
      .ambient::before,
      .ambient::after {
        content: "";
        position: absolute;
        width: min(58vw, 720px);
        aspect-ratio: 1;
        border-radius: 50%;
        filter: blur(76px);
        opacity: .13;
      }
      .ambient::before {
        left: -20vw;
        top: -22vw;
        background: radial-gradient(circle, rgba(127,213,240,.74), transparent 68%);
      }
      .ambient::after {
        right: -20vw;
        bottom: -28vw;
        background: radial-gradient(circle, rgba(88,155,218,.52), transparent 68%);
      }

      main {
        position: relative;
        z-index: 1;
        width: min(calc(100% - 2rem), 900px);
        margin: 0 auto;
        padding: max(1rem, env(safe-area-inset-top)) 0 max(1.4rem, env(safe-area-inset-bottom));
      }

      .site-nav {
        min-height: 64px;
        display: flex;
        align-items: center;
        padding: .72rem .9rem;
        border: 1px solid rgba(255,255,255,.10);
        border-radius: 1rem;
        background: rgba(5, 13, 31, .88);
        -webkit-backdrop-filter: blur(14px) saturate(145%);
        backdrop-filter: blur(14px) saturate(145%);
        box-shadow: 0 12px 30px rgba(0,0,20,.14);
      }

      .brand {
        display: flex;
        min-width: 0;
        align-items: center;
        gap: .72rem;
      }
      .studio-mark-wrap {
        width: 40px;
        height: 40px;
        flex: 0 0 40px;
        display: grid;
        place-items: center;
        overflow: hidden;
        border-radius: 999px;
      }
      .studio-mark {
        width: 100%;
        height: 100%;
        object-fit: contain;
      }
      .brand-name {
        display: block;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-family: "Classica Crastao", Georgia, serif;
        font-size: .98rem;
        text-transform: uppercase;
        letter-spacing: .045em;
      }
      .brand-sub {
        display: block;
        margin-top: .16rem;
        color: var(--muted-soft);
        font-size: .66rem;
      }

      .panel {
        margin-top: .8rem;
        overflow: hidden;
        border: 1px solid rgba(205,232,245,.19);
        border-radius: 1.15rem;
        background:
          linear-gradient(145deg, rgba(224,242,250,.085), rgba(112,183,216,.025) 38%, rgba(4,14,32,.02)),
          rgba(7,18,38,.90);
        -webkit-backdrop-filter: blur(12px) saturate(150%);
        backdrop-filter: blur(12px) saturate(150%);
        box-shadow: 0 18px 48px rgba(0,3,20,.22), inset 0 1px 0 rgba(235,248,253,.12);
      }

      .content {
        padding: clamp(1.15rem, 3.8vw, 2.25rem);
        display: flex;
        flex-direction: column;
      }

      .maintenance-summary { order: 1; }
      .service-status { order: 3; }
      .maintenance-details { order: 4; }
      .next-step { order: 5; }
      footer { order: 6; }

      .eyebrow {
        margin: 0 0 .62rem;
        color: rgba(155,225,255,.80);
        font-size: .67rem;
        font-weight: 700;
        letter-spacing: .20em;
        text-transform: uppercase;
      }

      h1 {
        margin: 0;
        max-width: 720px;
        font-family: "Classica Crastao", Georgia, serif;
        font-size: clamp(2.2rem, 6.8vw, 4.25rem);
        font-weight: 400;
        line-height: .96;
        letter-spacing: .025em;
        text-transform: uppercase;
        text-wrap: balance;
      }

      .lead {
        max-width: 680px;
        margin: .9rem 0 0;
        color: var(--muted);
        font-size: clamp(.96rem, 2vw, 1.04rem);
        line-height: 1.58;
      }
      .lead strong { color: #edfaff; font-weight: 700; }

      .status-chips {
        display: flex;
        flex-wrap: wrap;
        gap: .55rem;
        margin-top: 1rem;
      }
      .status-chip {
        display: inline-flex;
        align-items: center;
        gap: .45rem;
        min-height: 2rem;
        padding: .42rem .7rem;
        border: 1px solid rgba(205,232,245,.15);
        border-radius: 999px;
        background: rgba(205,232,245,.05);
        color: rgba(235,246,251,.86);
        font-size: .72rem;
        font-weight: 700;
      }
      .status-chip::before {
        content: "";
        width: .48rem;
        height: .48rem;
        flex: 0 0 .48rem;
        border-radius: 50%;
        background: #9aa8b8;
      }
      .status-chip.available {
        color: #d8f8e7;
        border-color: rgba(104,222,161,.19);
        background: rgba(104,222,161,.065);
      }
      .status-chip.available::before {
        background: #8ee2b4;
        box-shadow: 0 0 12px rgba(142,226,180,.42);
      }

      .section {
        margin-top: 1rem;
        border-top: 1px solid rgba(255,255,255,.075);
        padding-top: 1rem;
      }
      .section-title {
        margin: 0;
        font-size: 1rem;
        letter-spacing: -.018em;
      }
      .section-copy {
        margin: .32rem 0 0;
        color: var(--muted-soft);
        font-size: .78rem;
        line-height: 1.5;
      }

      .service-grid {
        margin-top: .72rem;
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        overflow: hidden;
        border: 1px solid rgba(205,232,245,.11);
        border-radius: .88rem;
        background: rgba(2,10,25,.26);
      }
      .service-row {
        min-width: 0;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: .8rem;
        padding: .74rem .8rem;
        border-bottom: 1px solid rgba(255,255,255,.055);
        font-size: .76rem;
      }
      .service-row:nth-child(odd) { border-right: 1px solid rgba(255,255,255,.055); }
      .service-row:nth-last-child(-n+2) { border-bottom: 0; }
      .service-name { color: rgba(232,242,248,.82); }
      .service-state { color: var(--muted-soft); font-weight: 700; text-align: right; }
      .service-state.good { color: var(--good); }

      details {
        border: 1px solid rgba(205,232,245,.11);
        border-radius: .88rem;
        background: rgba(2,10,25,.24);
      }
      details summary {
        list-style: none;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: .8rem;
        padding: .82rem .88rem;
        color: rgba(241,248,252,.92);
        font-size: .8rem;
        font-weight: 700;
      }
      details summary::-webkit-details-marker { display: none; }
      details summary::after {
        content: "+";
        color: var(--primary);
        font-size: 1.05rem;
        font-weight: 500;
      }
      details[open] summary::after { content: "–"; }
      .details-body {
        display: grid;
        gap: .7rem;
        padding: 0 .88rem .88rem;
      }
      .detail-row {
        display: grid;
        grid-template-columns: 1.25rem minmax(0,1fr);
        gap: .62rem;
        color: var(--muted);
        font-size: .77rem;
        line-height: 1.48;
      }
      .detail-index {
        color: var(--primary);
        font-size: .69rem;
        font-weight: 800;
      }
      .detail-row strong { color: rgba(245,250,253,.91); }

      .next-card {
        display: grid;
        grid-template-columns: minmax(0,1fr) auto;
        gap: .85rem;
        align-items: center;
        padding: .86rem .9rem;
        border: 1px solid rgba(205,232,245,.11);
        border-radius: .88rem;
        background: rgba(2,10,25,.24);
      }
      .next-label {
        margin: 0 0 .25rem;
        color: rgba(155,225,255,.76);
        font-size: .64rem;
        font-weight: 700;
        letter-spacing: .17em;
        text-transform: uppercase;
      }
      .next-title {
        margin: 0;
        font-size: .91rem;
        line-height: 1.35;
      }
      .next-copy {
        margin: .28rem 0 0;
        color: var(--muted-soft);
        font-size: .75rem;
        line-height: 1.45;
      }
      .next-status {
        white-space: nowrap;
        padding: .42rem .58rem;
        border-radius: .65rem;
        background: rgba(157,223,242,.07);
        color: var(--primary);
        font-size: .68rem;
        font-weight: 700;
      }

      footer {
        margin-top: 1rem;
        padding-top: .92rem;
        border-top: 1px solid rgba(255,255,255,.075);
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: .8rem;
        color: var(--muted-soft);
        font-size: .68rem;
        line-height: 1.45;
      }
      .signature strong {
        display: block;
        margin-bottom: .12rem;
        color: rgba(247,251,255,.84);
        font-weight: 500;
      }

      @supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
        .site-nav { background: rgba(5,12,31,.98); }
        .panel { background: rgba(7,18,38,.98); }
      }

      @media (max-width: 640px) {
        body { background-attachment: scroll, scroll; }
        main {
          width: min(calc(100% - 1rem), 900px);
          padding-top: max(.5rem, env(safe-area-inset-top));
        }
        .site-nav {
          min-height: 58px;
          padding: .56rem .68rem;
          border-radius: .86rem;
        }
        .studio-mark-wrap { width: 37px; height: 37px; flex-basis: 37px; }
        .brand-name { font-size: .86rem; }
        .brand-sub { display: none; }
        .panel { margin-top: .55rem; border-radius: 1rem; }
        .content { padding: 1rem .95rem 1rem; }
        h1 { font-size: clamp(2rem, 11.5vw, 3.15rem); }
        .lead { margin-top: .75rem; font-size: .92rem; line-height: 1.52; }
        .status-chips { margin-top: .82rem; }
        .section { margin-top: .82rem; padding-top: .82rem; }
        .service-grid { grid-template-columns: 1fr; }
        .service-row:nth-child(odd) { border-right: 0; }
        .service-row:nth-last-child(-n+2) { border-bottom: 1px solid rgba(255,255,255,.055); }
        .service-row:last-child { border-bottom: 0; }
        .next-card { grid-template-columns: 1fr; }
        .next-status { justify-self: start; }
        footer { flex-direction: column; gap: .2rem; }
      }

      @media (prefers-reduced-transparency: reduce) {
        .site-nav, .panel {
          -webkit-backdrop-filter: none;
          backdrop-filter: none;
        }
        .panel { background: rgba(7,18,38,.98); }
      }

      @media (prefers-reduced-motion: no-preference) {
        .ambient::before { animation: aurora-one 18s ease-in-out infinite alternate; }
        .ambient::after { animation: aurora-two 22s ease-in-out infinite alternate; }
        .site-nav { animation: reveal-nav .45s cubic-bezier(.23,1,.32,1) both; }
        .panel { animation: reveal-panel .58s .05s cubic-bezier(.23,1,.32,1) both; }
        .maintenance-summary { animation: reveal-item .46s .14s cubic-bezier(.23,1,.32,1) both; }

        @keyframes reveal-nav {
          from { opacity: 0; transform: translateY(-8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes reveal-panel {
          from { opacity: 0; transform: translateY(12px) scale(.994); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes reveal-item {
          from { opacity: 0; transform: translateY(7px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes aurora-one {
          from { transform: translate3d(-2%, -2%, 0) scale(.94); }
          to { transform: translate3d(14%, 10%, 0) scale(1.05); }
        }
        @keyframes aurora-two {
          from { transform: translate3d(3%, 0, 0) scale(.96); }
          to { transform: translate3d(-13%, -9%, 0) scale(1.05); }
        }
      }

      @media (prefers-reduced-motion: reduce) {
        *, *::before, *::after {
          animation-duration: .001ms !important;
          animation-iteration-count: 1 !important;
          scroll-behavior: auto !important;
        }
      }
    </style>
  </head>

  <body>
    <div class="ambient" aria-hidden="true"></div>
    <main data-solaris-maintenance="true" aria-labelledby="maintenance-title">
      <header class="site-nav">
        <div class="brand" aria-label="Solaris Studio">
          <span class="studio-mark-wrap">
            <img class="studio-mark" src="/solaris-studio-mark.png" alt="" aria-hidden="true" width="256" height="256" />
          </span>
          <span>
            <span class="brand-name">Solaris Studio</span>
            <span class="brand-sub">Terra Solaris Broadcasting Coalition</span>
          </span>
        </div>
      </header>

      <section class="panel">
        <div class="content">
          <section class="maintenance-summary" aria-labelledby="maintenance-title">
            <p class="eyebrow">Maintenance mode</p>
            <h1 id="maintenance-title">Solaris Studio is temporarily unavailable</h1>
            <p class="lead">
              Most Studio services are paused while we prepare the new Solaris Studio experience.
              <strong>Heads of Delegation can still access Confirmations on this page.</strong>
            </p>
            <div class="status-chips" aria-label="Maintenance availability">
              <span class="status-chip">Most services paused</span>
              <span class="status-chip available">HOD Confirmations available</span>
            </div>
          </section>

          <section class="service-status section" aria-labelledby="service-status-title">
            <h2 id="service-status-title" class="section-title">Service status</h2>
            <p class="section-copy">The maintenance screen is intentional. Confirmation access below is the current exception.</p>
            <div class="service-grid">
              <div class="service-row"><span class="service-name">Public Studio</span><span class="service-state">Paused</span></div>
              <div class="service-row"><span class="service-name">MySolaris</span><span class="service-state">Paused</span></div>
              <div class="service-row"><span class="service-name">HOD Confirmations</span><span class="service-state good">Available</span></div>
              <div class="service-row"><span class="service-name">Voting</span><span class="service-state">Paused</span></div>
              <div class="service-row"><span class="service-name">Organizer tools</span><span class="service-state">Restricted</span></div>
              <div class="service-row"><span class="service-name">Results & archive</span><span class="service-state">Paused</span></div>
            </div>
          </section>

          <section class="maintenance-details section">
            <details>
              <summary>What does maintenance affect?</summary>
              <div class="details-body">
                <div class="detail-row">
                  <span class="detail-index">01</span>
                  <span><strong>Deadlines are protected.</strong> Any deadline affected by this maintenance window will be reviewed and adjusted by TSBC where necessary.</span>
                </div>
                <div class="detail-row">
                  <span class="detail-index">02</span>
                  <span><strong>Do not repeat actions from immediately before maintenance.</strong> If you are unsure whether a submission or vote completed, wait for TSBC guidance.</span>
                </div>
                <div class="detail-row">
                  <span class="detail-index">03</span>
                  <span><strong>Normal Studio navigation remains unavailable.</strong> Public pages, MySolaris, voting and most Organizer surfaces stay behind maintenance while this limited Confirmation route is active.</span>
                </div>
              </div>
            </details>
          </section>

          <section class="next-step section" aria-labelledby="next-title">
            <div class="next-card">
              <div>
                <p class="next-label">What happens next</p>
                <h2 id="next-title" class="next-title">Solaris Studio will reopen with the new Studio experience when maintenance is complete.</h2>
                <p class="next-copy">Service notice updated ${updated}.</p>
              </div>
              <span class="next-status">${returnDate}</span>
            </div>
          </section>

          <footer>
            <div class="signature">
              <strong>Terra Solaris Broadcasting Coalition</strong>
              TSBC / Solaris Studio
            </div>
            <div>HTTP 503 · Maintenance mode</div>
          </footer>
        </div>
      </section>
    </main>
  </body>
</html>`;
}
