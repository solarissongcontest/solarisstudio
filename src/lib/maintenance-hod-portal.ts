type MaintenanceHodPortalConfig = {
  supabaseUrl: string;
  publishableKey: string;
};

function safeJson(value: unknown) {
  return JSON.stringify(value).replaceAll("<", "\\u003c");
}

export function renderMaintenanceHodPortal(config: MaintenanceHodPortalConfig) {
  const runtimeConfig = safeJson({
    supabaseUrl: config.supabaseUrl,
    publishableKey: config.publishableKey,
  });

  return `
<style>
  .hod-portal {
    order: 2;
    margin-top: 1rem;
    padding: 1rem;
    border: 1px solid rgba(115,199,223,.22);
    border-radius: .95rem;
    background:
      linear-gradient(180deg, rgba(18,43,72,.66), rgba(5,17,36,.94)),
      rgba(6,18,39,.96);
    color: #f5fbff;
    --muted: rgba(232,245,250,.88);
    --muted-soft: rgba(210,228,238,.80);
    box-shadow: inset 0 1px 0 rgba(230,248,255,.08), 0 14px 34px rgba(0,4,18,.14);
  }
  .hod-portal-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: .9rem;
  }
  .hod-portal-kicker {
    margin: 0;
    color: rgba(157,223,242,.80);
    font-size: .64rem;
    font-weight: 700;
    letter-spacing: .17em;
    text-transform: uppercase;
  }
  .hod-portal h2 {
    margin: .32rem 0 0;
    font-size: clamp(1.08rem, 3vw, 1.35rem);
    letter-spacing: -.02em;
  }
  .hod-portal-copy {
    margin: .38rem 0 0;
    max-width: 42rem;
    color: var(--muted);
    font-size: .78rem;
    line-height: 1.48;
  }
  .hod-state { margin-top: .8rem; }
  .hod-muted { margin: 0; color: var(--muted-soft); font-size: .75rem; line-height: 1.45; }
  .hod-checking { display: flex; align-items: center; gap: .58rem; min-height: 2.5rem; color: var(--muted); font-size: .78rem; }
  .hod-spinner { width: .9rem; height: .9rem; border: 2px solid rgba(157,223,242,.20); border-top-color: var(--primary); border-radius: 50%; animation: hod-spin .8s linear infinite; }
  @keyframes hod-spin { to { transform: rotate(360deg); } }

  .hod-signin-intro {
    display: grid;
    gap: .24rem;
    margin-bottom: .72rem;
    padding: .7rem .74rem;
    border: 1px solid rgba(157,223,242,.10);
    border-radius: .72rem;
    background: rgba(2,10,25,.28);
  }
  .hod-signin-intro strong { font-size: .82rem; }
  .hod-signin-intro span { color: var(--muted-soft); font-size: .72rem; line-height: 1.42; }

  .hod-form { display: grid; gap: .68rem; }
  .hod-field { display: grid; gap: .34rem; }
  .hod-field label { color: rgba(238,249,253,.92); font-size: .72rem; font-weight: 700; }
  .hod-field-help { color: var(--muted-soft); font-size: .66rem; line-height: 1.35; }
  .hod-field input {
    width: 100%;
    min-height: 2.65rem;
    padding: .66rem .75rem;
    border: 1px solid rgba(188,220,240,.17);
    border-radius: .72rem;
    background: rgba(3,12,28,.74);
    color: #fff;
    font: inherit;
    font-size: .84rem;
    outline: none;
  }
  .hod-field input:focus {
    border-color: rgba(157,223,242,.62);
    box-shadow: 0 0 0 3px rgba(157,223,242,.09);
  }

  .hod-actions { display: flex; flex-wrap: wrap; align-items: center; gap: .5rem; }
  .hod-button {
    min-height: 2.5rem;
    padding: .62rem .84rem;
    border: 1px solid rgba(157,223,242,.18);
    border-radius: .72rem;
    background: rgba(157,223,242,.09);
    color: #eafbff;
    font: inherit;
    font-size: .75rem;
    font-weight: 700;
    cursor: pointer;
  }
  .hod-button:hover { background: rgba(157,223,242,.14); }
  .hod-button:focus-visible { outline: 3px solid rgba(157,223,242,.24); outline-offset: 2px; }
  .hod-button[disabled] { opacity: .52; cursor: wait; }
  .hod-button-primary { background: #dff8ff; border-color: #dff8ff; color: #071425; }
  .hod-button-primary:hover { background: #fff; }
  .hod-button-link { border-color: transparent; background: transparent; color: var(--primary); padding-inline: .25rem; }

  .hod-error, .hod-success, .hod-note {
    margin-top: .65rem;
    padding: .68rem .72rem;
    border-radius: .68rem;
    font-size: .72rem;
    line-height: 1.45;
  }
  .hod-error { border: 1px solid rgba(255,126,126,.2); background: rgba(255,100,100,.08); color: #ffd2d2; }
  .hod-success { border: 1px solid rgba(138,236,188,.18); background: rgba(91,219,159,.08); color: #ccf8e2; }
  .hod-note { border: 1px solid rgba(157,223,242,.12); background: rgba(157,223,242,.045); color: var(--muted); }

  .hod-identity { display: flex; align-items: center; gap: .68rem; min-width: 0; }
  .hod-flag { width: 2.8rem; aspect-ratio: 3 / 2; object-fit: cover; border-radius: .4rem; border: 1px solid rgba(255,255,255,.12); background: rgba(255,255,255,.05); flex: 0 0 auto; }
  .hod-flag-fallback { display: grid; place-items: center; color: var(--primary); font-size: .66rem; font-weight: 800; letter-spacing: .08em; }
  .hod-country { margin: 0; font-size: .96rem; font-weight: 700; }
  .hod-edition { margin: .12rem 0 0; color: var(--muted-soft); font-size: .69rem; }
  .hod-signout { margin-left: auto; }

  .hod-summary {
    margin-top: .72rem;
    display: flex;
    align-items: flex-start;
    gap: .58rem;
    padding: .7rem .74rem;
    border: 1px solid rgba(255,255,255,.075);
    border-radius: .72rem;
    background: rgba(1,9,23,.31);
  }
  .hod-summary-dot {
    width: .52rem;
    height: .52rem;
    flex: 0 0 .52rem;
    margin-top: .28rem;
    border-radius: 50%;
    background: #9aa8b8;
  }
  .hod-summary[data-tone="good"] .hod-summary-dot { background: #8ee2b4; box-shadow: 0 0 10px rgba(142,226,180,.32); }
  .hod-summary[data-tone="warn"] .hod-summary-dot { background: #f2d28a; }
  .hod-summary[data-tone="action"] .hod-summary-dot { background: #f2a4a4; }
  .hod-summary-copy { min-width: 0; }
  .hod-summary strong { display: block; font-size: .84rem; }
  .hod-summary span { display: block; margin-top: .18rem; color: var(--muted); font-size: .72rem; line-height: 1.4; }

  .hod-entry {
    margin-top: .7rem;
    padding: .05rem 0;
  }
  .hod-entry-label { margin: 0; color: var(--muted-soft); font-size: .62rem; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; }
  .hod-entry-title { margin: .24rem 0 0; font-size: .96rem; font-weight: 700; line-height: 1.32; overflow-wrap: anywhere; }

  .hod-dashboard-actions {
    display: flex;
    flex-wrap: wrap;
    gap: .5rem;
    margin-top: .72rem;
  }

  .hod-status-details {
    margin-top: .72rem;
    border: 1px solid rgba(255,255,255,.075);
    border-radius: .72rem;
    background: rgba(1,9,23,.24);
  }
  .hod-status-details summary {
    list-style: none;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: .7rem;
    padding: .68rem .72rem;
    color: rgba(238,247,251,.88);
    font-size: .72rem;
    font-weight: 700;
  }
  .hod-status-details summary::-webkit-details-marker { display: none; }
  .hod-status-details summary::after { content: "+"; color: var(--primary); font-size: .95rem; }
  .hod-status-details[open] summary::after { content: "–"; }
  .hod-status-list { border-top: 1px solid rgba(255,255,255,.06); padding: 0 .72rem; }
  .hod-status-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: .72rem;
    min-height: 2.25rem;
    border-bottom: 1px solid rgba(255,255,255,.055);
    font-size: .71rem;
  }
  .hod-status-row:last-child { border-bottom: 0; }
  .hod-status-row span:first-child { color: var(--muted-soft); }
  .hod-status-value { text-align: right; color: #effaff; font-weight: 700; }
  .hod-status-value[data-tone="good"] { color: #bdf4d8; }
  .hod-status-value[data-tone="warn"] { color: #ffe19a; }
  .hod-status-value[data-tone="action"] { color: #ffc1c1; }

  .hod-round-explainer {
    margin-top: .55rem;
    color: var(--muted-soft);
    font-size: .68rem;
    line-height: 1.4;
  }
  .hod-feedback {
    margin-top: .65rem;
    padding: .65rem .7rem;
    border-left: 2px solid #ffc1c1;
    background: rgba(255,100,100,.05);
    color: #f7d9d9;
    font-size: .72rem;
    line-height: 1.45;
  }
  .hod-last-update { margin-top: .62rem; color: var(--muted-soft); font-size: .65rem; }

  @media (min-width: 1100px) {
    .site-nav {
      width: min(calc(100% - 8rem), 1280px);
      top: max(24px, env(safe-area-inset-top));
    }
    .hero {
      min-height: min(920px, 100svh);
      grid-template-columns: minmax(420px, 520px) minmax(560px, 700px);
      grid-template-rows: 1fr;
      align-content: center;
      align-items: center;
      justify-content: center;
      justify-items: stretch;
      column-gap: clamp(2.5rem, 5vw, 6rem);
      padding: max(7rem, calc(env(safe-area-inset-top) + 6rem)) clamp(2.5rem, 5vw, 5rem) 3rem;
    }
    .hero::before {
      background:
        radial-gradient(circle at 72% 38%, rgba(74,167,210,.17), transparent 27rem),
        radial-gradient(circle at 24% 42%, rgba(35,78,125,.12), transparent 31rem),
        linear-gradient(180deg, #03070b, #000 74%);
    }
    .hero::after {
      top: 51%;
      left: 72%;
      width: min(820px, 54vw);
      opacity: calc(var(--hero-glow-opacity) * .9);
    }
    .hero-copy {
      grid-column: 1;
      grid-row: 1;
      justify-self: end;
      width: 100%;
      max-width: 520px;
      text-align: left;
      transform-origin: 0 30%;
    }
    .hero h1 {
      font-size: clamp(5.5rem, 7vw, 8.4rem);
      line-height: .86;
      text-align: left;
    }
    .tagline {
      margin: 1.25rem 0 0;
      font-size: clamp(1.35rem, 1.8vw, 1.8rem);
    }
    .launch {
      width: 100%;
      margin: clamp(2.3rem, 4vh, 3.2rem) 0 0;
      justify-items: start;
    }
    .countdown {
      max-width: 500px;
      margin-left: 0;
      justify-content: flex-start;
    }
    .countdown-value { font-size: clamp(3rem, 4vw, 4.25rem); }
    .countdown-name { font-size: .56rem; }
    .hero-stage {
      grid-column: 2;
      grid-row: 1;
      justify-self: start;
      align-self: center;
      width: min(700px, 46vw);
      height: 620px;
      margin-top: 0;
      transform-origin: 50% 50%;
    }
    .phone { width: 272px; height: 588px; border-radius: 41px; }
    .phone-preview { transform: scale(.69744); }
    .phone.center { transform: translate(-50%, -50%); }
    .phone.left { transform: translate(calc(-150% - var(--hero-side-spread)), -42%) rotateY(17deg) rotateZ(-4deg) scale(.84); }
    .phone.right { transform: translate(calc(50% + var(--hero-side-spread)), -42%) rotateY(-17deg) rotateZ(4deg) scale(.84); }

    .hod-portal {
      width: min(calc(100% - 8rem), 1180px);
      margin-top: clamp(2.5rem, 4vw, 4rem);
      margin-bottom: clamp(5rem, 8vw, 8rem);
      padding: clamp(1.8rem, 2.7vw, 2.6rem);
      display: grid;
      grid-template-columns: minmax(0, .72fr) minmax(0, 1.28fr);
      align-items: start;
      gap: clamp(2.5rem, 5vw, 5.5rem);
      border-color: rgba(115,199,223,.17);
      border-radius: 1.55rem;
      background:
        radial-gradient(circle at 82% 18%, rgba(82,178,226,.11), transparent 24rem),
        linear-gradient(145deg, rgba(12,31,55,.92), rgba(3,12,27,.98));
      box-shadow: inset 0 1px 0 rgba(230,248,255,.07), 0 28px 80px rgba(0,4,18,.24);
    }
    .hod-portal > .hod-portal-head {
      grid-column: 1;
      margin: 0;
    }
    .hod-portal > .hod-state {
      grid-column: 2;
      margin-top: 0;
      min-width: 0;
      padding-left: clamp(1.5rem, 3vw, 3rem);
      border-left: 1px solid rgba(157,223,242,.10);
    }
    .hod-portal-kicker { font-size: .68rem; }
    .hod-portal h2 {
      max-width: 14ch;
      margin-top: .65rem;
      font-size: clamp(1.9rem, 2.5vw, 2.6rem);
      line-height: 1.02;
      letter-spacing: -.045em;
    }
    .hod-portal-copy {
      max-width: 34rem;
      margin-top: .9rem;
      font-size: .9rem;
      line-height: 1.62;
    }
    .hod-checking { min-height: 4rem; font-size: .86rem; }
    .hod-signin-intro {
      gap: .35rem;
      margin-bottom: 1rem;
      padding: 1rem 1.05rem;
      border-radius: 1rem;
      background: rgba(2,10,25,.34);
    }
    .hod-signin-intro strong { font-size: .96rem; }
    .hod-signin-intro span { font-size: .77rem; line-height: 1.5; }
    .hod-form { gap: .9rem; }
    .hod-field { gap: .42rem; }
    .hod-field label { font-size: .77rem; }
    .hod-field-help { font-size: .7rem; }
    .hod-field input {
      min-height: 3.15rem;
      padding: .78rem .88rem;
      border-radius: .86rem;
      font-size: .9rem;
    }
    .hod-actions { gap: .7rem; margin-top: .1rem; }
    .hod-button {
      min-height: 2.9rem;
      padding: .72rem 1rem;
      border-radius: .84rem;
      font-size: .78rem;
    }
    .hod-summary { margin-top: 0; padding: 1rem 1.05rem; border-radius: 1rem; }
    .hod-summary strong { font-size: .94rem; }
    .hod-summary span { font-size: .77rem; line-height: 1.5; }
    .hod-entry { margin-top: 1rem; }
    .hod-entry-title { font-size: 1.08rem; }
    .hod-dashboard-actions { margin-top: 1rem; gap: .7rem; }
    .hod-status-details { margin-top: 1rem; border-radius: .9rem; }

    .product-story {
      border-top: 1px solid rgba(255,255,255,.055);
    }
    .product-story > .story:first-child {
      width: min(calc(100% - 8rem), 1280px);
      display: grid;
      grid-template-columns: minmax(300px, .68fr) minmax(0, 1.32fr);
      align-items: center;
      gap: clamp(3rem, 6vw, 7rem);
      padding: clamp(7rem, 9vw, 10rem) 0;
    }
    .product-story > .story:first-child > .story-heading {
      align-self: start;
      padding-top: clamp(2rem, 5vw, 5rem);
    }
    .product-story > .story:first-child > .story-heading h2 {
      max-width: 7ch;
      font-size: clamp(4.5rem, 5.8vw, 6.8rem);
      line-height: .88;
    }
    .product-story > .story:first-child .first-look {
      min-height: 620px;
      margin-top: 0;
      grid-template-columns: minmax(0, 1fr) minmax(280px, 340px);
      gap: clamp(2rem, 4vw, 4rem);
      padding: clamp(2rem, 3vw, 3rem);
      border-radius: 2.2rem;
    }
    .product-story > .story:first-child .first-look-copy h3 {
      font-size: clamp(2.7rem, 3.6vw, 4rem);
      line-height: .94;
    }
    .product-story > .story:first-child .preview-device {
      width: min(320px, 100%);
    }
    .story-touch {
      display: grid;
      grid-template-columns: minmax(300px, .68fr) minmax(0, 1.32fr);
      align-items: center;
      gap: clamp(3rem, 6vw, 7rem);
      text-align: left;
    }
    .story-touch .interactive-device {
      width: 100%;
      max-width: 720px;
      margin: 0;
    }
    .story-touch .touch-hint {
      grid-column: 2;
      margin: -2rem 0 0;
      text-align: left;
    }
    footer {
      width: min(calc(100% - 8rem), 1280px);
    }
  }

  @media (min-width: 641px) and (max-width: 1099px) {
    .hod-portal {
      width: min(calc(100% - 2.5rem), 900px);
      margin-top: 1.5rem;
      padding: 1.25rem;
      border-radius: 1.15rem;
    }
  }

  @media (max-width: 640px) {
    .hod-portal { margin-top: .82rem; padding: .82rem; border-radius: .86rem; }
    .hod-portal-head { gap: .65rem; }
    .hod-portal-copy { font-size: .75rem; }
    .hod-actions, .hod-dashboard-actions { display: grid; grid-template-columns: 1fr; }
    .hod-button { width: 100%; }
    .hod-signout { width: auto; margin-left: auto; }
  }
  @media (prefers-reduced-motion: reduce) { .hod-spinner { animation-duration: 1.4s; } }
</style>

<section class="hod-portal" aria-labelledby="hod-portal-title">
  <div class="hod-portal-head">
    <div>
      <p class="hod-portal-kicker">Head of Delegation</p>
      <h2 id="hod-portal-title">Manage your current Confirmation</h2>
      <p class="hod-portal-copy">This is the participant area that remains available during maintenance. Sign in with the same country account you normally use for Solaris Studio.</p>
    </div>
  </div>
  <div id="maintenance-hod-root" class="hod-state" aria-live="polite">
    <div class="hod-checking"><span class="hod-spinner" aria-hidden="true"></span><span>Checking your Solaris account…</span></div>
  </div>
</section>

<script type="module">
  const MAINTENANCE_HOD_CONFIG = ${runtimeConfig};
  const hodRoot = document.getElementById("maintenance-hod-root");

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function humanize(value) {
    return String(value ?? "")
      .replaceAll("_", " ")
      .replace(/\\b\\w/g, (letter) => letter.toUpperCase());
  }

  function formatDate(value) {
    if (!value) return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(date);
  }

  function statusTone(state) {
    if (["confirmed", "accepted", "satisfied", "waived", "open"].includes(state)) return "good";
    if (["awaiting_review", "submitted", "required"].includes(state)) return "warn";
    if (["changes_requested", "action_required", "locked"].includes(state)) return "action";
    return "neutral";
  }

  function editingLabel(reason, open) {
    if (open) return "Open";
    if (reason === "locked") return "Locked";
    return "Closed";
  }

  function summaryFor(data) {
    if (data.confirmation_state === "required") {
      return ["New Confirmation required", "TSBC has opened a new Confirmation requirement for this edition.", "warn"];
    }
    if (data.entry_state === "changes_requested") {
      return ["Action required", "TSBC has requested changes to your current submission.", "action"];
    }
    if (data.entry_state === "awaiting_review") {
      return ["Awaiting review", "Your latest submission is saved and waiting for TSBC review.", "warn"];
    }
    if (data.editing_open) {
      return ["Editing is open", "You can update this existing submission now. This does not create a new Confirmation.", "good"];
    }
    if (data.confirmation_state === "accepted" && data.entry_state === "accepted") {
      return ["Everything accepted", "Your participation and current submission are complete. No action is required.", "good"];
    }
    if (data.response) {
      return ["Editing is closed", "Your current submission is saved. TSBC has not opened editing for it right now.", "neutral"];
    }
    return ["No current Confirmation action", "There is no active Confirmation response or requirement for this delegation.", "neutral"];
  }

  async function browserErrorMessage(error) {
    if (!error) return "The request could not be completed.";
    const fallback = error.message || "The request could not be completed.";
    const response = error.context;
    if (!response || typeof response.clone !== "function") return fallback;
    try {
      const payload = await response.clone().json();
      return payload && typeof payload.error === "string" ? payload.error : fallback;
    } catch {
      return fallback;
    }
  }

  function renderChecking(label = "Checking your Solaris account…") {
    hodRoot.innerHTML = '<div class="hod-checking"><span class="hod-spinner" aria-hidden="true"></span><span>' + escapeHtml(label) + '</span></div>';
  }

  function renderSignedOut(message = "") {
    hodRoot.innerHTML =
      '<div class="hod-signin-intro"><strong>Sign in to Confirmation access</strong><span>Use your existing Solaris country account. Normal Studio pages stay unavailable during maintenance.</span></div>' +
      '<form id="hod-signin-form" class="hod-form">' +
        '<div class="hod-field"><label for="hod-identifier">Instagram username or recovery email</label><span id="hod-identifier-help" class="hod-field-help">Use the Instagram username linked to your country account, or its recovery email.</span><input id="hod-identifier" name="identifier" autocomplete="username" aria-describedby="hod-identifier-help" placeholder="@username or email@example.com" required /></div>' +
        '<div class="hod-field"><label for="hod-password">Password</label><input id="hod-password" name="password" type="password" autocomplete="current-password" required /></div>' +
        '<div class="hod-actions"><button class="hod-button hod-button-primary" type="submit">Sign in to Confirmations</button><button id="hod-recovery" class="hod-button hod-button-link" type="button">Forgot password?</button></div>' +
        (message ? '<div class="hod-error" role="alert">' + escapeHtml(message) + '</div>' : '') +
      '</form>';

    const form = document.getElementById("hod-signin-form");
    form.addEventListener("submit", onSignIn);
    document.getElementById("hod-recovery").addEventListener("click", onRecovery);
  }

  function renderWrongAccount() {
    hodRoot.innerHTML =
      '<div class="hod-error" role="alert"><strong>This account is not an active country account.</strong><br />No delegation data has been exposed.</div>' +
      '<div class="hod-dashboard-actions"><button id="hod-wrong-signout" class="hod-button" type="button">Sign out</button></div>';
    document.getElementById("hod-wrong-signout").addEventListener("click", onSignOut);
  }

  function renderDashboard(data) {
    const country = data.country || {};
    const edition = data.edition || {};
    const response = data.response || null;
    const requirement = data.requirement || null;
    const summary = summaryFor(data);
    const flag = country.flag_image
      ? '<img class="hod-flag" src="' + escapeHtml(country.flag_image) + '" alt="' + escapeHtml(country.name || "Delegation") + ' flag" />'
      : '<span class="hod-flag hod-flag-fallback" aria-hidden="true">' + escapeHtml(country.short_code || "SSC") + '</span>';
    const editionLabel = edition.edition_number
      ? "SSC " + escapeHtml(edition.edition_number)
      : escapeHtml(edition.name || "Current edition");
    const entryTitle = data.artist || data.song_title
      ? escapeHtml(data.artist || "Artist pending") + " — " + escapeHtml(data.song_title || "Song pending")
      : "Entry details not yet available";
    const round = response && response.round ? response.round : null;
    const lastUpdate = formatDate(data.last_update);
    const feedback = data.entry_feedback
      ? '<div class="hod-feedback"><strong>TSBC feedback</strong><br />' + escapeHtml(data.entry_feedback) + '</div>'
      : "";
    const canEdit = Boolean(data.editing_open && round && round.id);
    const actionLabel = data.entry_state === "changes_requested" ? "Update submission" : "Change submission";
    const roundStatusLabel = round
      ? (round.status === "closed" ? "Closed to new Confirmations" : humanize(round.status))
      : "Not available";

    hodRoot.innerHTML =
      '<div class="hod-portal-head">' +
        '<div class="hod-identity">' + flag + '<div><p class="hod-country">' + escapeHtml(country.name || "Delegation") + '</p><p class="hod-edition">' + editionLabel + (edition.name ? " · " + escapeHtml(edition.name) : "") + '</p></div></div>' +
        '<button id="hod-signout" class="hod-button hod-button-link hod-signout" type="button">Sign out</button>' +
      '</div>' +
      '<div class="hod-summary" data-tone="' + escapeHtml(summary[2]) + '"><span class="hod-summary-dot" aria-hidden="true"></span><div class="hod-summary-copy"><strong>' + escapeHtml(summary[0]) + '</strong><span>' + escapeHtml(summary[1]) + '</span></div></div>' +
      '<div class="hod-entry"><p class="hod-entry-label">Current entry</p><p class="hod-entry-title">' + entryTitle + '</p></div>' +
      '<div class="hod-dashboard-actions">' +
        (canEdit ? '<button id="hod-edit" class="hod-button hod-button-primary" type="button">' + escapeHtml(actionLabel) + '</button>' : '') +
        '<button id="hod-refresh" class="hod-button" type="button">Refresh status</button>' +
      '</div>' +
      '<details class="hod-status-details"><summary>View status details</summary><div class="hod-status-list" aria-label="Confirmation status">' +
        '<div class="hod-status-row"><span>Participation</span><span class="hod-status-value" data-tone="' + statusTone(data.participation_state) + '">' + escapeHtml(humanize(data.participation_state)) + '</span></div>' +
        '<div class="hod-status-row"><span>Confirmation</span><span class="hod-status-value" data-tone="' + statusTone(data.confirmation_state) + '">' + escapeHtml(humanize(data.confirmation_state)) + '</span></div>' +
        '<div class="hod-status-row"><span>Entry</span><span class="hod-status-value" data-tone="' + statusTone(data.entry_state) + '">' + escapeHtml(humanize(data.entry_state)) + '</span></div>' +
        (round ? '<div class="hod-status-row"><span>New Confirmations</span><span class="hod-status-value">' + escapeHtml(roundStatusLabel) + '</span></div>' : '') +
        '<div class="hod-status-row"><span>Existing submission editing</span><span class="hod-status-value" data-tone="' + (data.editing_open ? "good" : "neutral") + '">' + escapeHtml(editingLabel(data.editing_reason, data.editing_open)) + '</span></div>' +
      '</div></details>' +
      (round && round.status === "closed" && data.editing_open
        ? '<p class="hod-round-explainer">The submission round is closed to new Confirmations, but TSBC has reopened editing for this existing response.</p>'
        : '') +
      feedback +
      (requirement && requirement.reason ? '<div class="hod-note">Requirement: ' + escapeHtml(requirement.reason) + '</div>' : '') +
      (lastUpdate ? '<div class="hod-last-update">Last meaningful update ' + escapeHtml(lastUpdate) + '</div>' : '');

    document.getElementById("hod-signout").addEventListener("click", onSignOut);
    document.getElementById("hod-refresh").addEventListener("click", () => loadDashboard({ announce: true }));
    if (canEdit) {
      document.getElementById("hod-edit").addEventListener("click", () => openEditor(round.id, data.entry_state));
    }
  }

  let client = null;
  let dashboardRequest = null;
  let signedIn = false;
  let boundedRefreshTimers = [];

  function clearBoundedRefresh() {
    for (const timer of boundedRefreshTimers) window.clearTimeout(timer);
    boundedRefreshTimers = [];
  }

  function scheduleBoundedRefresh() {
    clearBoundedRefresh();
    for (const delay of [30000, 90000]) {
      boundedRefreshTimers.push(window.setTimeout(() => {
        if (signedIn && document.visibilityState === "visible") loadDashboard({ quiet: true });
      }, delay));
    }
  }

  async function loadDashboard(options = {}) {
    if (!client || dashboardRequest) return dashboardRequest;
    if (!options.quiet) renderChecking(options.announce ? "Refreshing Confirmation status…" : undefined);

    dashboardRequest = (async () => {
      const sessionResult = await client.auth.getSession();
      if (sessionResult.error) throw sessionResult.error;
      if (!sessionResult.data.session) {
        signedIn = false;
        clearBoundedRefresh();
        renderSignedOut();
        return;
      }

      const userResult = await client.auth.getUser();
      if (userResult.error || !userResult.data.user) {
        signedIn = false;
        clearBoundedRefresh();
        await client.auth.signOut({ scope: "local" }).catch(() => undefined);
        renderSignedOut("Your previous Solaris session has expired. Sign in again to continue.");
        return;
      }

      const result = await client.rpc("public_country_account_confirmation_dashboard");
      if (result.error) throw result.error;
      const data = result.data || {};
      if (!data.authenticated || !data.country) {
        signedIn = true;
        clearBoundedRefresh();
        renderWrongAccount();
        return;
      }

      signedIn = true;
      renderDashboard(data);
      scheduleBoundedRefresh();
    })()
      .catch(async (error) => {
        const message = await browserErrorMessage(error);
        hodRoot.innerHTML = '<div class="hod-error" role="alert"><strong>Confirmation status could not load.</strong><br />' + escapeHtml(message) + '</div><div class="hod-dashboard-actions"><button id="hod-retry" class="hod-button" type="button">Try again</button></div>';
        document.getElementById("hod-retry").addEventListener("click", () => loadDashboard({ announce: true }));
      })
      .finally(() => { dashboardRequest = null; });

    return dashboardRequest;
  }

  async function onSignIn(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const identifier = String(new FormData(form).get("identifier") || "").trim();
    const password = String(new FormData(form).get("password") || "");
    const submit = form.querySelector('button[type="submit"]');
    submit.disabled = true;
    submit.textContent = "Signing in…";

    try {
      const authResult = await client.functions.invoke("country-auth", {
        body: { action: "signin", identifier, password },
      });
      if (authResult.error) throw authResult.error;
      if (!authResult.data?.accessToken || !authResult.data?.refreshToken) {
        throw new Error("Solaris did not return a valid session.");
      }
      const sessionResult = await client.auth.setSession({
        access_token: authResult.data.accessToken,
        refresh_token: authResult.data.refreshToken,
      });
      if (sessionResult.error || !sessionResult.data.session) {
        throw sessionResult.error || new Error("Could not start your Solaris Studio session.");
      }
      await loadDashboard({ announce: true });
    } catch (error) {
      renderSignedOut(await browserErrorMessage(error));
    }
  }

  async function onRecovery() {
    const identifier = String(document.getElementById("hod-identifier")?.value || "").trim();
    if (!identifier) {
      const field = document.getElementById("hod-identifier");
      field?.focus();
      return;
    }
    renderChecking("Requesting password recovery…");
    try {
      const result = await client.functions.invoke("country-auth", {
        body: { action: "recover", identifier },
      });
      if (result.error) throw result.error;
      renderSignedOut();
      const form = document.getElementById("hod-signin-form");
      form.insertAdjacentHTML("beforeend", '<div class="hod-success" role="status">If recovery is available for that account, Solaris has sent the next steps.</div>');
    } catch (error) {
      renderSignedOut(await browserErrorMessage(error));
    }
  }

  async function onSignOut() {
    signedIn = false;
    clearBoundedRefresh();
    renderSignedOut();
    try {
      await client.auth.signOut();
    } catch {
      // Local delegation state is already cleared. Protected RPCs still validate server-side auth.
    }
  }

  async function openEditor(roundId, entryState) {
    const button = document.getElementById("hod-edit");
    if (button) {
      button.disabled = true;
      button.textContent = "Opening…";
    }
    try {
      const result = await client.rpc("public_create_country_account_edit_token", {
        _round_id: roundId,
      });
      if (result.error) throw result.error;
      if (!result.data?.ok || !result.data?.token) {
        const reason = result.data?.reason || "editing_unavailable";
        throw new Error("Editing is no longer available (" + humanize(reason) + ").");
      }
      const focus = entryState === "changes_requested" ? "#entry-section-review" : "";
      window.location.assign("/confirmations/edit/" + encodeURIComponent(result.data.token) + focus);
    } catch (error) {
      const message = await browserErrorMessage(error);
      await loadDashboard({ quiet: true });
      const existing = hodRoot.querySelector(".hod-error[data-editor-error]");
      existing?.remove();
      hodRoot.insertAdjacentHTML("beforeend", '<div class="hod-error" data-editor-error="true" role="alert">' + escapeHtml(message) + '</div>');
    }
  }

  async function boot() {
    try {
      const module = await import("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.110.8/+esm");
      client = module.createClient(
        MAINTENANCE_HOD_CONFIG.supabaseUrl,
        MAINTENANCE_HOD_CONFIG.publishableKey,
        { auth: { storage: window.localStorage, persistSession: true, autoRefreshToken: true } },
      );
      client.auth.onAuthStateChange((event) => {
        if (event === "SIGNED_OUT") {
          signedIn = false;
          clearBoundedRefresh();
          renderSignedOut();
        }
      });
      await loadDashboard();
    } catch (error) {
      const message = await browserErrorMessage(error);
      hodRoot.innerHTML = '<div class="hod-error" role="alert"><strong>Head of Delegation access is temporarily unavailable.</strong><br />' + escapeHtml(message) + '</div>';
    }
  }

  window.addEventListener("focus", () => {
    if (signedIn) loadDashboard({ quiet: true });
  });
  document.addEventListener("visibilitychange", () => {
    if (signedIn && document.visibilityState === "visible") loadDashboard({ quiet: true });
  });
  window.addEventListener("pagehide", clearBoundedRefresh);

  void boot();
</script>`;
}
