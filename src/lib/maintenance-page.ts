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
    <meta name="theme-color" content="#071018" />
    <meta name="color-scheme" content="dark" />
    <meta name="robots" content="noindex, nofollow" />
    <title>Solaris Studio is temporarily unavailable</title>
    <style>
      :root {
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        color: #f7fbff;
        background: #05080d;
      }
      * { box-sizing: border-box; }
      html, body { min-height: 100%; }
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        overflow-x: hidden;
        background:
          radial-gradient(circle at 15% 15%, rgba(255, 198, 74, .14), transparent 28rem),
          radial-gradient(circle at 85% 12%, rgba(71, 161, 255, .13), transparent 30rem),
          linear-gradient(145deg, #05080d 0%, #071018 48%, #090b11 100%);
      }
      body::before {
        content: "";
        position: fixed;
        inset: 0;
        pointer-events: none;
        opacity: .35;
        background-image:
          linear-gradient(rgba(255,255,255,.025) 1px, transparent 1px),
          linear-gradient(90deg, rgba(255,255,255,.025) 1px, transparent 1px);
        background-size: 40px 40px;
        mask-image: linear-gradient(to bottom, black, transparent 80%);
      }
      main {
        width: min(100% - 32px, 760px);
        margin: 32px auto;
        position: relative;
      }
      .panel {
        border: 1px solid rgba(255,255,255,.11);
        border-radius: 28px;
        background: linear-gradient(155deg, rgba(16, 23, 34, .94), rgba(8, 12, 19, .88));
        box-shadow: 0 28px 90px rgba(0,0,0,.42);
        overflow: hidden;
      }
      .topline {
        height: 3px;
        background: linear-gradient(90deg, #f6c653, #ffffff, #4ca6ff);
        opacity: .82;
      }
      .content { padding: clamp(28px, 6vw, 58px); }
      .brands {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 24px;
        margin-bottom: 42px;
      }
      .tsbc-mark {
        width: 164px;
        height: auto;
        max-width: 48%;
      }
      .studio-mark {
        width: 72px;
        height: 72px;
        object-fit: contain;
        filter: drop-shadow(0 8px 24px rgba(0,0,0,.28));
      }
      .status {
        display: inline-flex;
        align-items: center;
        gap: 9px;
        min-height: 30px;
        padding: 6px 11px;
        border: 1px solid rgba(246,198,83,.24);
        border-radius: 999px;
        background: rgba(246,198,83,.07);
        color: #f7d57d;
        font-size: 12px;
        font-weight: 750;
        letter-spacing: .08em;
        text-transform: uppercase;
      }
      .status-dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: #f6c653;
        box-shadow: 0 0 16px rgba(246,198,83,.8);
      }
      h1 {
        margin: 20px 0 14px;
        max-width: 650px;
        font-size: clamp(34px, 7vw, 58px);
        line-height: .98;
        letter-spacing: -.048em;
      }
      .lead {
        margin: 0;
        max-width: 620px;
        color: rgba(235,244,255,.72);
        font-size: clamp(16px, 2.4vw, 19px);
        line-height: 1.65;
      }
      .return {
        margin: 30px 0 0;
        padding: 20px 22px;
        border: 1px solid rgba(76,166,255,.2);
        border-radius: 18px;
        background: rgba(76,166,255,.07);
      }
      .return-label {
        margin: 0 0 5px;
        color: rgba(218,235,255,.58);
        font-size: 11px;
        font-weight: 800;
        letter-spacing: .12em;
        text-transform: uppercase;
      }
      .return-date {
        margin: 0;
        font-size: clamp(22px, 4vw, 30px);
        font-weight: 800;
        letter-spacing: -.025em;
      }
      .notice {
        margin-top: 28px;
        display: grid;
        gap: 12px;
      }
      .notice-item {
        display: grid;
        grid-template-columns: 26px 1fr;
        gap: 12px;
        align-items: start;
        color: rgba(235,244,255,.73);
        font-size: 14px;
        line-height: 1.55;
      }
      .notice-icon {
        width: 26px;
        height: 26px;
        display: grid;
        place-items: center;
        border-radius: 8px;
        background: rgba(255,255,255,.055);
        color: #fff;
        font-size: 13px;
        font-weight: 800;
      }
      .notice-item strong { color: #fff; }
      .deadline {
        color: #fff;
        font-weight: 760;
      }
      footer {
        margin-top: 38px;
        padding-top: 22px;
        border-top: 1px solid rgba(255,255,255,.08);
        display: flex;
        align-items: end;
        justify-content: space-between;
        gap: 24px;
        color: rgba(218,230,244,.48);
        font-size: 12px;
        line-height: 1.5;
      }
      .signature strong {
        display: block;
        color: rgba(247,251,255,.82);
        font-size: 13px;
      }
      @media (max-width: 520px) {
        main { width: min(100% - 20px, 760px); margin: 10px auto; }
        .panel { border-radius: 22px; }
        .content { padding: 26px 22px 24px; }
        .brands { margin-bottom: 32px; }
        .studio-mark { width: 58px; height: 58px; }
        footer { align-items: start; flex-direction: column; gap: 8px; }
      }
      @media (prefers-reduced-motion: no-preference) {
        .status-dot { animation: pulse 2.6s ease-in-out infinite; }
        @keyframes pulse { 50% { opacity: .48; transform: scale(.86); } }
      }
    </style>
  </head>
  <body>
    <main data-solaris-maintenance="true" aria-labelledby="maintenance-title">
      <section class="panel">
        <div class="topline" aria-hidden="true"></div>
        <div class="content">
          <div class="brands">
            <img class="tsbc-mark" src="/tsbc-maintenance-mark.svg" alt="TSBC" width="164" height="44" />
            <img class="studio-mark" src="/solaris-studio-mark.png" alt="Solaris Studio" width="72" height="72" />
          </div>

          <div class="status"><span class="status-dot" aria-hidden="true"></span>Temporary outage</div>
          <h1 id="maintenance-title">Solaris Studio is temporarily offline</h1>
          <p class="lead">
            A database service error is currently preventing Solaris Studio from operating reliably.
            We have taken the platform offline temporarily rather than leave submissions, voting,
            results or account actions in an uncertain state.
          </p>

          <div class="return">
            <p class="return-label">Expected return</p>
            <p class="return-date">${returnDate}</p>
          </div>

          <div class="notice" aria-label="Outage information">
            <div class="notice-item">
              <span class="notice-icon" aria-hidden="true">1</span>
              <span><strong>Deadlines are protected.</strong> <span class="deadline">All deadlines scheduled during this outage will be postponed.</span> Updated deadlines will be published after Solaris Studio is back online.</span>
            </div>
            <div class="notice-item">
              <span class="notice-icon" aria-hidden="true">2</span>
              <span><strong>Please do not repeat submissions or votes.</strong> If you attempted an action around the start of the outage, wait for TSBC guidance before trying again.</span>
            </div>
            <div class="notice-item">
              <span class="notice-icon" aria-hidden="true">3</span>
              <span><strong>All Solaris Studio services are temporarily unavailable.</strong> This includes public pages, MySolaris, Confirmations, Televoting and Organizer tools.</span>
            </div>
          </div>

          <footer>
            <div class="signature">
              <strong>Terra Solaris Broadcasting Coalition</strong>
              TSBC / Solaris Studio
            </div>
            <div>Service notice updated ${updated}</div>
          </footer>
        </div>
      </section>
    </main>
  </body>
</html>`;
}
