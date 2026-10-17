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
    margin-top: 1rem;
    padding: 1rem;
    border: 1px solid rgba(157,223,242,.18);
    border-radius: 1rem;
    background: linear-gradient(155deg, rgba(10,27,52,.94), rgba(5,16,35,.96));
    box-shadow: inset 0 1px 0 rgba(230,248,255,.07), 0 18px 42px rgba(0,4,18,.16);
  }
  .hod-portal-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 1rem; }
  .hod-portal-kicker { margin: 0; color: rgba(157,223,242,.76); font-size: .65rem; font-weight: 700; letter-spacing: .17em; text-transform: uppercase; }
  .hod-portal h2 { margin: .42rem 0 0; font-size: clamp(1.15rem, 3vw, 1.5rem); letter-spacing: -.025em; }
  .hod-portal-copy { margin: .55rem 0 0; max-width: 42rem; color: var(--muted); font-size: .84rem; line-height: 1.55; }
  .hod-state { margin-top: 1rem; }
  .hod-muted { color: var(--muted-soft); font-size: .78rem; line-height: 1.5; }
  .hod-checking { display: flex; align-items: center; gap: .65rem; min-height: 3rem; color: var(--muted); font-size: .84rem; }
  .hod-spinner { width: 1rem; height: 1rem; border: 2px solid rgba(157,223,242,.20); border-top-color: var(--primary); border-radius: 50%; animation: hod-spin .8s linear infinite; }
  @keyframes hod-spin { to { transform: rotate(360deg); } }
  .hod-form { display: grid; gap: .8rem; margin-top: .35rem; }
  .hod-field { display: grid; gap: .42rem; }
  .hod-field label { color: rgba(238,249,253,.9); font-size: .74rem; font-weight: 700; }
  .hod-field input {
    width: 100%; min-height: 2.75rem; padding: .7rem .8rem;
    border: 1px solid rgba(188,220,240,.17); border-radius: .78rem;
    background: rgba(3,12,28,.76); color: #fff; font: inherit; outline: none;
  }
  .hod-field input:focus { border-color: rgba(157,223,242,.62); box-shadow: 0 0 0 3px rgba(157,223,242,.09); }
  .hod-actions { display: flex; flex-wrap: wrap; align-items: center; gap: .6rem; }
  .hod-button {
    min-height: 2.65rem; padding: .66rem .9rem; border: 1px solid rgba(157,223,242,.2);
    border-radius: .78rem; background: rgba(157,223,242,.10); color: #eafbff;
    font: inherit; font-size: .78rem; font-weight: 700; cursor: pointer;
  }
  .hod-button:hover { background: rgba(157,223,242,.15); }
  .hod-button:focus-visible { outline: 3px solid rgba(157,223,242,.24); outline-offset: 2px; }
  .hod-button[disabled] { opacity: .52; cursor: wait; }
  .hod-button-primary { background: #dff8ff; border-color: #dff8ff; color: #071425; }
  .hod-button-primary:hover { background: #fff; }
  .hod-button-link { border-color: transparent; background: transparent; color: var(--primary); padding-inline: .3rem; }
  .hod-error, .hod-success, .hod-note {
    margin-top: .75rem; padding: .72rem .78rem; border-radius: .72rem; font-size: .76rem; line-height: 1.5;
  }
  .hod-error { border: 1px solid rgba(255,126,126,.2); background: rgba(255,100,100,.08); color: #ffd2d2; }
  .hod-success { border: 1px solid rgba(138,236,188,.18); background: rgba(91,219,159,.08); color: #ccf8e2; }
  .hod-note { border: 1px solid rgba(157,223,242,.14); background: rgba(157,223,242,.055); color: var(--muted); }
  .hod-identity { display: flex; align-items: center; gap: .75rem; min-width: 0; }
  .hod-flag { width: 3.1rem; aspect-ratio: 3 / 2; object-fit: cover; border-radius: .42rem; border: 1px solid rgba(255,255,255,.12); background: rgba(255,255,255,.05); flex: 0 0 auto; }
  .hod-flag-fallback { display: grid; place-items: center; color: var(--primary); font-size: .68rem; font-weight: 800; letter-spacing: .08em; }
  .hod-country { margin: 0; font-size: 1rem; font-weight: 700; }
  .hod-edition { margin: .18rem 0 0; color: var(--muted-soft); font-size: .72rem; }
  .hod-summary { margin-top: .95rem; padding: .82rem; border: 1px solid rgba(255,255,255,.08); border-radius: .78rem; background: rgba(1,9,23,.34); }
  .hod-summary strong { display: block; font-size: .92rem; }
  .hod-summary span { display: block; margin-top: .28rem; color: var(--muted); font-size: .77rem; line-height: 1.45; }
  .hod-entry { margin-top: .85rem; }
  .hod-entry-label { margin: 0; color: var(--muted-soft); font-size: .65rem; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; }
  .hod-entry-title { margin: .32rem 0 0; font-size: 1rem; font-weight: 700; line-height: 1.35; overflow-wrap: anywhere; }
  .hod-status-list { margin-top: .9rem; border-top: 1px solid rgba(255,255,255,.08); }
  .hod-status-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: .8rem; min-height: 2.55rem; border-bottom: 1px solid rgba(255,255,255,.07); font-size: .76rem; }
  .hod-status-row span:first-child { color: var(--muted-soft); }
  .hod-status-value { text-align: right; color: #effaff; font-weight: 700; }
  .hod-status-value[data-tone="good"] { color: #bdf4d8; }
  .hod-status-value[data-tone="warn"] { color: #ffe19a; }
  .hod-status-value[data-tone="action"] { color: #ffc1c1; }
  .hod-feedback { margin-top: .8rem; padding: .7rem .76rem; border-left: 2px solid #ffc1c1; background: rgba(255,100,100,.055); color: #f7d9d9; font-size: .76rem; line-height: 1.5; }
  .hod-dashboard-actions { display: flex; flex-wrap: wrap; gap: .55rem; margin-top: .9rem; }
  .hod-last-update { margin-top: .75rem; color: var(--muted-soft); font-size: .68rem; }
  .hod-signout { margin-left: auto; }
  @media (max-width: 640px) {
    .hod-portal { padding: .85rem; border-radius: .9rem; }
    .hod-portal-head { display: grid; }
    .hod-signout { margin-left: 0; justify-self: start; }
    .hod-actions, .hod-dashboard-actions { display: grid; grid-template-columns: 1fr; }
    .hod-button { width: 100%; }
  }
  @media (prefers-reduced-motion: reduce) { .hod-spinner { animation-duration: 1.4s; } }
</style>
<section class="hod-portal" aria-labelledby="hod-portal-title">
  <div class="hod-portal-head">
    <div>
      <p class="hod-portal-kicker">Head of Delegation access</p>
      <h2 id="hod-portal-title">Confirmation access remains available</h2>
      <p class="hod-portal-copy">Solaris Studio is undergoing maintenance. Heads of Delegation can still review and, when TSBC has opened editing, update the current Confirmation below.</p>
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
      return ["New Confirmation required", "TSBC has explicitly opened a new Confirmation requirement for this edition."];
    }
    if (data.entry_state === "changes_requested") {
      return ["Action required", "TSBC has requested changes to your current submission."];
    }
    if (data.entry_state === "awaiting_review") {
      return ["Awaiting review", "Your latest submission is saved and waiting for TSBC review."];
    }
    if (data.editing_open) {
      return ["Editing is open", "You may update your existing submission. This does not create a new Confirmation."];
    }
    if (data.confirmation_state === "accepted" && data.entry_state === "accepted") {
      return ["Everything accepted", "Your participation and current submission are complete. No action is required."];
    }
    if (data.response) {
      return ["Editing closed", "Your current submission is saved. Editing is not currently available."];
    }
    return ["No current Confirmation action", "There is no active Confirmation response or requirement for this delegation."];
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
      '<p class="hod-muted">Sign in with your existing Solaris country account to view and manage your current Confirmation.</p>' +
      '<form id="hod-signin-form" class="hod-form">' +
        '<div class="hod-field"><label for="hod-identifier">Identifier</label><input id="hod-identifier" name="identifier" autocomplete="username" required /></div>' +
        '<div class="hod-field"><label for="hod-password">Password</label><input id="hod-password" name="password" type="password" autocomplete="current-password" required /></div>' +
        '<div class="hod-actions"><button class="hod-button hod-button-primary" type="submit">Sign in</button><button id="hod-recovery" class="hod-button hod-button-link" type="button">Forgot password?</button></div>' +
        (message ? '<div class="hod-error" role="alert">' + escapeHtml(message) + '</div>' : '') +
      '</form>';

    const form = document.getElementById("hod-signin-form");
    form.addEventListener("submit", onSignIn);
    document.getElementById("hod-recovery").addEventListener("click", onRecovery);
  }

  function renderWrongAccount() {
    hodRoot.innerHTML =
      '<div class="hod-error" role="alert"><strong>This Solaris account is not an active country account.</strong><br />No delegation data has been exposed.</div>' +
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

    hodRoot.innerHTML =
      '<div class="hod-portal-head">' +
        '<div class="hod-identity">' + flag + '<div><p class="hod-country">' + escapeHtml(country.name || "Delegation") + '</p><p class="hod-edition">' + editionLabel + (edition.name ? " · " + escapeHtml(edition.name) : "") + '</p></div></div>' +
        '<button id="hod-signout" class="hod-button hod-button-link hod-signout" type="button">Sign out</button>' +
      '</div>' +
      '<div class="hod-summary"><strong>' + escapeHtml(summary[0]) + '</strong><span>' + escapeHtml(summary[1]) + '</span></div>' +
      '<div class="hod-entry"><p class="hod-entry-label">Current entry</p><p class="hod-entry-title">' + entryTitle + '</p></div>' +
      '<div class="hod-status-list" aria-label="Confirmation status">' +
        '<div class="hod-status-row"><span>Participation</span><span class="hod-status-value" data-tone="' + statusTone(data.participation_state) + '">' + escapeHtml(humanize(data.participation_state)) + '</span></div>' +
        '<div class="hod-status-row"><span>Confirmation</span><span class="hod-status-value" data-tone="' + statusTone(data.confirmation_state) + '">' + escapeHtml(humanize(data.confirmation_state)) + '</span></div>' +
        '<div class="hod-status-row"><span>Entry</span><span class="hod-status-value" data-tone="' + statusTone(data.entry_state) + '">' + escapeHtml(humanize(data.entry_state)) + '</span></div>' +
        (round ? '<div class="hod-status-row"><span>Round</span><span class="hod-status-value">' + escapeHtml(round.name || "Confirmation") + ' · ' + escapeHtml(humanize(round.status)) + '</span></div>' : '') +
        '<div class="hod-status-row"><span>Editing</span><span class="hod-status-value" data-tone="' + (data.editing_open ? "good" : "neutral") + '">' + escapeHtml(editingLabel(data.editing_reason, data.editing_open)) + '</span></div>' +
      '</div>' +
      feedback +
      '<div class="hod-dashboard-actions">' +
        (canEdit ? '<button id="hod-edit" class="hod-button hod-button-primary" type="button">' + escapeHtml(actionLabel) + '</button>' : '') +
        '<button id="hod-refresh" class="hod-button" type="button">Refresh status</button>' +
      '</div>' +
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
    // Two bounded refreshes cover the common Organizer→HOD handoff without
    // leaving a permanent production polling loop behind.
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
      // The local delegation state is already cleared. The next protected RPC still
      // validates server-side auth, so a network failure cannot expose data here.
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
