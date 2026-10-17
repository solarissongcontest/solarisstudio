export type MaintenanceHodConfig = {
  supabaseUrl: string;
  supabasePublishableKey: string;
};

type MaintenanceHodEnv = {
  MAINTENANCE_HOD_ACCESS?: string;
  SUPABASE_URL?: string;
  VITE_SUPABASE_URL?: string;
  SUPABASE_PUBLISHABLE_KEY?: string;
  VITE_SUPABASE_PUBLISHABLE_KEY?: string;
};

const HOD_ALLOWED_EXACT_PATHS = new Set([
  "/auth/reset",
  "/confirmations/recover",
]);

function truthyFlag(value: string | undefined) {
  return value ? ["1", "true", "yes", "on"].includes(value.trim().toLowerCase()) : false;
}

function runtimeEnv(env: unknown): MaintenanceHodEnv {
  return env && typeof env === "object" ? (env as MaintenanceHodEnv) : {};
}

export function maintenanceHodAccessEnabled(env: unknown) {
  const workerEnv = runtimeEnv(env);
  return truthyFlag(
    workerEnv.MAINTENANCE_HOD_ACCESS ?? process.env.MAINTENANCE_HOD_ACCESS,
  );
}

export function maintenanceHodConfig(env: unknown): MaintenanceHodConfig | null {
  if (!maintenanceHodAccessEnabled(env)) return null;
  const workerEnv = runtimeEnv(env);
  const supabaseUrl = (
    workerEnv.SUPABASE_URL ??
    workerEnv.VITE_SUPABASE_URL ??
    process.env.SUPABASE_URL ??
    process.env.VITE_SUPABASE_URL ??
    ""
  ).trim();
  const supabasePublishableKey = (
    workerEnv.SUPABASE_PUBLISHABLE_KEY ??
    workerEnv.VITE_SUPABASE_PUBLISHABLE_KEY ??
    process.env.SUPABASE_PUBLISHABLE_KEY ??
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
    ""
  ).trim();

  if (!supabaseUrl || !supabasePublishableKey) return null;
  if (!/^https?:\/\//i.test(supabaseUrl)) return null;
  if (/^sb_secret_/i.test(supabasePublishableKey)) return null;

  return { supabaseUrl: supabaseUrl.replace(/\/$/, ""), supabasePublishableKey };
}

export function isMaintenanceHodAllowedAppPath(pathname: string) {
  if (HOD_ALLOWED_EXACT_PATHS.has(pathname)) return true;
  return /^\/confirmations\/edit\/[^/]+\/?$/.test(pathname);
}

function scriptJson(value: unknown) {
  return JSON.stringify(value)
    .replaceAll("<", "\\u003c")
    .replaceAll(">", "\\u003e")
    .replaceAll("&", "\\u0026")
    .replaceAll("\u2028", "\\u2028")
    .replaceAll("\u2029", "\\u2029");
}

export function renderMaintenanceHodPortal(
  maintenanceHtml: string,
  config: MaintenanceHodConfig,
) {
  const portal = `
    <section class="panel maintenance-hod-panel" aria-labelledby="maintenance-hod-title">
      <div class="content maintenance-hod-content">
        <div class="maintenance-hod-heading">
          <div>
            <p class="eyebrow">Head of Delegation access</p>
            <h2 id="maintenance-hod-title">Manage your current Confirmation</h2>
            <p class="maintenance-hod-intro">Solaris Studio is still under maintenance. Heads of Delegation can restore their existing Solaris session, inspect their own delegation status, and update an existing submission only when TSBC has opened editing.</p>
          </div>
          <span class="maintenance-hod-scope">Confirmation only</span>
        </div>

        <div id="maintenance-hod-live" class="maintenance-hod-live" role="status" aria-live="polite">Checking your Solaris account…</div>
        <div id="maintenance-hod-error" class="maintenance-hod-message maintenance-hod-message-error" role="alert" hidden></div>
        <div id="maintenance-hod-notice" class="maintenance-hod-message" role="status" aria-live="polite" hidden></div>

        <div id="maintenance-hod-checking" class="maintenance-hod-state">
          <div class="maintenance-hod-checking-row" aria-hidden="true">
            <span class="maintenance-hod-spinner"></span>
            <span>Restoring your existing session where possible…</span>
          </div>
        </div>

        <div id="maintenance-hod-signed-out" class="maintenance-hod-state" hidden>
          <div class="maintenance-hod-state-copy">
            <strong>Head of Delegation?</strong>
            <span>Sign in with the same Solaris Studio identifier and password you normally use.</span>
          </div>
          <form id="maintenance-hod-signin" class="maintenance-hod-form">
            <label for="maintenance-hod-identifier">Identifier</label>
            <input id="maintenance-hod-identifier" name="identifier" type="text" autocomplete="username" autocapitalize="none" spellcheck="false" required placeholder="Instagram username or email" />
            <label for="maintenance-hod-password">Password</label>
            <input id="maintenance-hod-password" name="password" type="password" autocomplete="current-password" required />
            <button id="maintenance-hod-signin-button" type="submit" class="maintenance-hod-primary">Sign in</button>
            <button id="maintenance-hod-recover" type="button" class="maintenance-hod-link">Forgot password?</button>
          </form>
        </div>

        <div id="maintenance-hod-no-access" class="maintenance-hod-state" hidden>
          <div class="maintenance-hod-state-copy">
            <strong>No delegation access on this account</strong>
            <span>This signed-in Solaris account is not an active country account. No delegation information has been loaded.</span>
          </div>
          <button type="button" class="maintenance-hod-secondary" data-maintenance-hod-signout>Sign out</button>
        </div>

        <div id="maintenance-hod-dashboard" class="maintenance-hod-state" hidden>
          <div class="maintenance-hod-delegation">
            <img id="maintenance-hod-flag" class="maintenance-hod-flag" alt="" hidden />
            <div class="maintenance-hod-delegation-copy">
              <span id="maintenance-hod-welcome" class="maintenance-hod-welcome"></span>
              <strong id="maintenance-hod-country"></strong>
              <span id="maintenance-hod-edition" class="maintenance-hod-edition"></span>
            </div>
            <button type="button" class="maintenance-hod-refresh" id="maintenance-hod-refresh">Refresh</button>
          </div>

          <div id="maintenance-hod-banner" class="maintenance-hod-banner">
            <strong id="maintenance-hod-banner-title"></strong>
            <span id="maintenance-hod-banner-copy"></span>
          </div>

          <dl id="maintenance-hod-statuses" class="maintenance-hod-statuses"></dl>

          <div id="maintenance-hod-entry-card" class="maintenance-hod-entry-card" hidden>
            <span class="maintenance-hod-kicker">Current entry</span>
            <strong id="maintenance-hod-entry-title"></strong>
            <span id="maintenance-hod-entry-feedback" class="maintenance-hod-feedback" hidden></span>
          </div>

          <button id="maintenance-hod-edit" type="button" class="maintenance-hod-primary" hidden>Change submission</button>
          <p id="maintenance-hod-edit-explanation" class="maintenance-hod-edit-explanation"></p>

          <div class="maintenance-hod-footer-row">
            <span id="maintenance-hod-last-update" class="maintenance-hod-last-update"></span>
            <button type="button" class="maintenance-hod-link" data-maintenance-hod-signout>Sign out</button>
          </div>
        </div>
      </div>
    </section>

    <style>
      .maintenance-hod-panel { margin-top: 1rem; }
      .maintenance-hod-content { padding: clamp(1.25rem, 4vw, 2rem); }
      .maintenance-hod-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 1rem; }
      .maintenance-hod-heading h2 { margin: 0; font-size: clamp(1.35rem, 4vw, 1.9rem); line-height: 1.08; letter-spacing: -.025em; }
      .maintenance-hod-intro { max-width: 650px; margin: .65rem 0 0; color: var(--muted); font-size: .9rem; line-height: 1.6; }
      .maintenance-hod-scope { flex: 0 0 auto; padding: .42rem .66rem; border: 1px solid rgba(157,223,242,.26); border-radius: 999px; color: #c8f1fb; background: rgba(116,199,224,.08); font-size: .66rem; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; }
      .maintenance-hod-live { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); clip-path: inset(50%); white-space: nowrap; }
      .maintenance-hod-state { margin-top: 1.15rem; }
      .maintenance-hod-checking-row { min-height: 76px; display: flex; align-items: center; gap: .8rem; color: var(--muted); font-size: .88rem; }
      .maintenance-hod-spinner { width: 18px; height: 18px; border: 2px solid rgba(157,223,242,.22); border-top-color: #9ddff2; border-radius: 50%; animation: maintenance-hod-spin .8s linear infinite; }
      @keyframes maintenance-hod-spin { to { transform: rotate(360deg); } }
      @media (prefers-reduced-motion: reduce) { .maintenance-hod-spinner { animation: none; border-color: #9ddff2; } }
      .maintenance-hod-state-copy { display: grid; gap: .28rem; margin-bottom: 1rem; }
      .maintenance-hod-state-copy strong { font-size: 1rem; }
      .maintenance-hod-state-copy span { color: var(--muted); font-size: .86rem; line-height: 1.55; }
      .maintenance-hod-form { display: grid; gap: .48rem; }
      .maintenance-hod-form label { margin-top: .45rem; color: rgba(237,247,252,.88); font-size: .72rem; font-weight: 700; letter-spacing: .04em; text-transform: uppercase; }
      .maintenance-hod-form input { width: 100%; min-height: 46px; border: 1px solid rgba(205,232,245,.18); border-radius: .85rem; padding: .72rem .82rem; background: rgba(3,12,28,.58); color: var(--foreground); font: inherit; outline: none; }
      .maintenance-hod-form input:focus-visible { border-color: rgba(157,223,242,.72); box-shadow: 0 0 0 3px rgba(110,189,215,.14); }
      .maintenance-hod-primary, .maintenance-hod-secondary, .maintenance-hod-refresh, .maintenance-hod-link { min-height: 44px; border-radius: .82rem; font: inherit; cursor: pointer; }
      .maintenance-hod-primary { width: 100%; margin-top: .65rem; border: 1px solid rgba(214,244,252,.55); background: linear-gradient(180deg, #dff7fc, #a8dfed); color: #071522; font-weight: 800; box-shadow: 0 8px 24px rgba(84,176,207,.15); }
      .maintenance-hod-primary:disabled { cursor: wait; opacity: .62; }
      .maintenance-hod-secondary { border: 1px solid rgba(205,232,245,.2); padding: .58rem .8rem; background: rgba(255,255,255,.04); color: var(--foreground); font-weight: 700; }
      .maintenance-hod-link { border: 0; padding: .5rem 0; background: transparent; color: #bcecf7; font-weight: 700; text-align: left; }
      .maintenance-hod-message { margin-top: .9rem; padding: .7rem .8rem; border: 1px solid rgba(157,223,242,.18); border-radius: .75rem; background: rgba(104,190,219,.08); color: #d9f5fc; font-size: .8rem; line-height: 1.5; }
      .maintenance-hod-message-error { border-color: rgba(255,137,137,.22); background: rgba(138,38,50,.14); color: #ffd5d8; }
      .maintenance-hod-delegation { display: grid; grid-template-columns: auto minmax(0,1fr) auto; align-items: center; gap: .8rem; padding-bottom: 1rem; border-bottom: 1px solid rgba(205,232,245,.12); }
      .maintenance-hod-flag { width: 54px; aspect-ratio: 3 / 2; object-fit: cover; border-radius: .45rem; border: 1px solid rgba(255,255,255,.14); }
      .maintenance-hod-delegation-copy { min-width: 0; display: grid; gap: .14rem; }
      .maintenance-hod-welcome { color: var(--muted-soft); font-size: .72rem; }
      .maintenance-hod-delegation-copy strong { overflow: hidden; text-overflow: ellipsis; font-size: 1.05rem; }
      .maintenance-hod-edition { color: var(--muted); font-size: .78rem; }
      .maintenance-hod-refresh { border: 1px solid rgba(205,232,245,.14); padding: .5rem .7rem; background: rgba(255,255,255,.035); color: var(--muted); font-size: .75rem; font-weight: 700; }
      .maintenance-hod-banner { margin-top: 1rem; display: grid; gap: .25rem; padding: .9rem; border: 1px solid rgba(205,232,245,.14); border-radius: .9rem; background: rgba(255,255,255,.028); }
      .maintenance-hod-banner strong { font-size: .92rem; }
      .maintenance-hod-banner span { color: var(--muted); font-size: .79rem; line-height: 1.5; }
      .maintenance-hod-banner[data-tone="action"] { border-color: rgba(255,185,103,.28); background: rgba(139,82,24,.10); }
      .maintenance-hod-banner[data-tone="ready"] { border-color: rgba(132,229,177,.24); background: rgba(36,118,80,.10); }
      .maintenance-hod-statuses { margin: 1rem 0 0; }
      .maintenance-hod-status-row { display: flex; align-items: center; justify-content: space-between; gap: 1rem; min-height: 43px; border-bottom: 1px solid rgba(205,232,245,.09); }
      .maintenance-hod-status-row dt { color: var(--muted); font-size: .8rem; }
      .maintenance-hod-status-row dd { margin: 0; text-align: right; font-size: .8rem; font-weight: 700; }
      .maintenance-hod-status-row dd[data-tone="attention"] { color: #ffd59d; }
      .maintenance-hod-status-row dd[data-tone="ready"] { color: #b9f0d2; }
      .maintenance-hod-status-row dd[data-tone="muted"] { color: var(--muted); }
      .maintenance-hod-entry-card { margin-top: 1rem; display: grid; gap: .26rem; padding: .86rem; border: 1px solid rgba(205,232,245,.12); border-radius: .85rem; background: rgba(2,10,25,.32); }
      .maintenance-hod-kicker { color: var(--muted-soft); font-size: .66rem; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; }
      .maintenance-hod-entry-card strong { font-size: .94rem; }
      .maintenance-hod-feedback { color: #ffd5aa; font-size: .78rem; line-height: 1.5; }
      .maintenance-hod-edit-explanation { margin: .65rem 0 0; color: var(--muted); font-size: .76rem; line-height: 1.5; }
      .maintenance-hod-footer-row { margin-top: 1rem; display: flex; align-items: center; justify-content: space-between; gap: 1rem; }
      .maintenance-hod-last-update { color: var(--muted-soft); font-size: .68rem; line-height: 1.4; }
      .maintenance-hod-footer-row .maintenance-hod-link { flex: 0 0 auto; min-height: 36px; }
      @media (max-width: 600px) {
        .maintenance-hod-heading { display: grid; }
        .maintenance-hod-scope { justify-self: start; }
        .maintenance-hod-delegation { grid-template-columns: auto minmax(0,1fr); }
        .maintenance-hod-refresh { grid-column: 1 / -1; width: 100%; }
      }
    </style>

    <script id="maintenance-hod-config" type="application/json">${scriptJson(config)}</script>
    <script type="module">
      import { createClient } from "https://esm.sh/@supabase/supabase-js@2.110.8?bundle";

      const configNode = document.getElementById("maintenance-hod-config");
      const config = JSON.parse(configNode?.textContent || "{}");
      const supabase = createClient(config.supabaseUrl, config.supabasePublishableKey, {
        auth: {
          storage: window.localStorage,
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
        },
      });

      const nodes = {
        live: document.getElementById("maintenance-hod-live"),
        error: document.getElementById("maintenance-hod-error"),
        notice: document.getElementById("maintenance-hod-notice"),
        checking: document.getElementById("maintenance-hod-checking"),
        signedOut: document.getElementById("maintenance-hod-signed-out"),
        noAccess: document.getElementById("maintenance-hod-no-access"),
        dashboard: document.getElementById("maintenance-hod-dashboard"),
        form: document.getElementById("maintenance-hod-signin"),
        identifier: document.getElementById("maintenance-hod-identifier"),
        password: document.getElementById("maintenance-hod-password"),
        signinButton: document.getElementById("maintenance-hod-signin-button"),
        recover: document.getElementById("maintenance-hod-recover"),
        flag: document.getElementById("maintenance-hod-flag"),
        welcome: document.getElementById("maintenance-hod-welcome"),
        country: document.getElementById("maintenance-hod-country"),
        edition: document.getElementById("maintenance-hod-edition"),
        refresh: document.getElementById("maintenance-hod-refresh"),
        banner: document.getElementById("maintenance-hod-banner"),
        bannerTitle: document.getElementById("maintenance-hod-banner-title"),
        bannerCopy: document.getElementById("maintenance-hod-banner-copy"),
        statuses: document.getElementById("maintenance-hod-statuses"),
        entryCard: document.getElementById("maintenance-hod-entry-card"),
        entryTitle: document.getElementById("maintenance-hod-entry-title"),
        feedback: document.getElementById("maintenance-hod-entry-feedback"),
        edit: document.getElementById("maintenance-hod-edit"),
        editExplanation: document.getElementById("maintenance-hod-edit-explanation"),
        lastUpdate: document.getElementById("maintenance-hod-last-update"),
      };

      let currentPortal = null;
      let lastPortalLoadAt = 0;

      function announce(message) {
        if (nodes.live) nodes.live.textContent = message;
      }

      function clearMessages() {
        if (nodes.error) { nodes.error.hidden = true; nodes.error.textContent = ""; }
        if (nodes.notice) { nodes.notice.hidden = true; nodes.notice.textContent = ""; }
      }

      function showError(message) {
        if (!nodes.error) return;
        nodes.error.textContent = message;
        nodes.error.hidden = false;
        announce(message);
      }

      function showNotice(message) {
        if (!nodes.notice) return;
        nodes.notice.textContent = message;
        nodes.notice.hidden = false;
        announce(message);
      }

      function showOnly(name) {
        for (const key of ["checking", "signedOut", "noAccess", "dashboard"]) {
          if (nodes[key]) nodes[key].hidden = key !== name;
        }
      }

      function safeImageUrl(value) {
        if (typeof value !== "string" || !value.trim()) return null;
        try {
          const parsed = new URL(value, window.location.origin);
          if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
          return parsed.href;
        } catch { return null; }
      }

      function titleCase(value) {
        return String(value || "")
          .replaceAll("_", " ")
          .replace(/\b\w/g, (letter) => letter.toUpperCase());
      }

      function addStatus(label, value, tone = "muted") {
        const row = document.createElement("div");
        row.className = "maintenance-hod-status-row";
        const term = document.createElement("dt");
        const definition = document.createElement("dd");
        term.textContent = label;
        definition.textContent = value;
        definition.dataset.tone = tone;
        row.append(term, definition);
        nodes.statuses?.append(row);
      }

      function responseEntry(response) {
        if (!response || response.participating === false) return null;
        if (response.selection_method === "internal") return response.internal_entry || null;
        if (response.selection_method === "national_final" && response.national_final) {
          const entries = Array.isArray(response.national_final.entries) ? response.national_final.entries : [];
          return entries.find((entry) => entry.id === response.national_final.winning_entry_id) || entries[0] || null;
        }
        return response.internal_entry || null;
      }

      function entryState(entry, response) {
        if (!response || response.participating === false) return { label: "Not applicable", tone: "muted", kind: "none" };
        if (!entry) {
          return response.entry_unknown
            ? { label: "Not submitted", tone: "attention", kind: "changes" }
            : { label: "Awaiting review", tone: "muted", kind: "review" };
        }
        const status = String(entry.review_status || "pending").toLowerCase();
        if (status === "accepted") return { label: "Accepted", tone: "ready", kind: "accepted" };
        if (status === "declined" || status === "changes_required") return { label: "Changes requested", tone: "attention", kind: "changes" };
        return { label: "Awaiting review", tone: "muted", kind: "review" };
      }

      function formatEdition(edition) {
        if (!edition) return "No current edition";
        if (edition.edition_number != null) return "SSC " + edition.edition_number;
        return edition.name || "Current edition";
      }

      function formatUpdated(value) {
        if (!value) return "";
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return "";
        return new Intl.DateTimeFormat(undefined, {
          dateStyle: "medium",
          timeStyle: "short",
        }).format(date);
      }

      function renderDashboard(portal) {
        currentPortal = portal;
        clearMessages();
        showOnly("dashboard");
        const country = portal.country || {};
        const edition = portal.edition;
        const requirement = portal.requirement;
        const response = portal.response;
        const entry = responseEntry(response);
        const entryStatus = entryState(entry, response);
        const participationStatus = String(portal.participation_status || "").toLowerCase();
        const participationLabel = participationStatus === "confirmed"
          ? "Confirmed"
          : participationStatus
            ? titleCase(participationStatus)
            : response?.participating === false
              ? "Not participating"
              : "Not confirmed";
        const participationTone = participationStatus === "confirmed" ? "ready" : "muted";

        const requirementStatus = String(requirement?.status || "").toLowerCase();
        let confirmationLabel = "Not required";
        let confirmationTone = "muted";
        if (requirementStatus === "required" || requirementStatus === "invalidated") {
          confirmationLabel = "Required";
          confirmationTone = "attention";
        } else if (requirementStatus === "waived") {
          confirmationLabel = "Waived";
          confirmationTone = "ready";
        } else if (requirementStatus === "satisfied") {
          confirmationLabel = response?.reviewed ? "Accepted" : "Submitted";
          confirmationTone = response?.reviewed ? "ready" : "muted";
        } else if (response) {
          confirmationLabel = response.reviewed ? "Accepted" : "Submitted";
          confirmationTone = response.reviewed ? "ready" : "muted";
        }

        if (nodes.welcome) nodes.welcome.textContent = "Welcome back";
        if (nodes.country) nodes.country.textContent = country.name || "Your delegation";
        if (nodes.edition) nodes.edition.textContent = [formatEdition(edition), edition?.name].filter(Boolean).filter((value, index, array) => array.indexOf(value) === index).join(" · ");
        const flag = safeImageUrl(country.flag_image);
        if (nodes.flag) {
          if (flag) {
            nodes.flag.src = flag;
            nodes.flag.alt = country.name ? country.name + " flag" : "Delegation flag";
            nodes.flag.hidden = false;
          } else {
            nodes.flag.removeAttribute("src");
            nodes.flag.hidden = true;
          }
        }

        if (nodes.statuses) nodes.statuses.replaceChildren();
        addStatus("Participation", participationLabel, participationTone);
        addStatus("Confirmation", confirmationLabel, confirmationTone);
        addStatus("Entry", entryStatus.label, entryStatus.tone);
        if (response) {
          addStatus("Round", titleCase(response.round_status || "unknown"), response.round_status === "open" ? "ready" : "muted");
          addStatus("Editing", response.can_edit ? "Open" : "Closed", response.can_edit ? "ready" : "muted");
        }
        if (entry?.replacement_video_required) {
          addStatus("Media", "Replacement required", "attention");
        }

        if (nodes.entryCard && nodes.entryTitle && nodes.feedback) {
          const artist = String(entry?.artist || "").trim();
          const song = String(entry?.song_title || "").trim();
          const fallback = response?.participating === false ? "Delegation is not participating" : "Entry details are not currently available";
          nodes.entryTitle.textContent = artist || song ? [artist, song].filter(Boolean).join(" — ") : fallback;
          const feedback = String(entry?.review_reason || "").trim();
          nodes.feedback.textContent = feedback;
          nodes.feedback.hidden = !feedback;
          nodes.entryCard.hidden = false;
        }

        const canEdit = Boolean(response?.can_edit && response?.round_id);
        if (nodes.edit) {
          nodes.edit.hidden = !canEdit;
          nodes.edit.textContent = entryStatus.kind === "changes" ? "Update submission" : "Change submission";
        }
        if (nodes.editExplanation) {
          nodes.editExplanation.textContent = canEdit
            ? "Editing is open for this existing response. This does not create a new Confirmation."
            : response
              ? "Your current submission is saved. Editing is not currently available."
              : requirementStatus === "required"
                ? "A new Confirmation is required. The temporary maintenance portal does not create a duplicate response automatically."
                : "No editable Confirmation response is available for this edition.";
        }

        const changesRequested = entryStatus.kind === "changes" || Boolean(entry?.replacement_video_required);
        const awaitingReview = confirmationLabel === "Submitted" || entryStatus.kind === "review";
        const everythingAccepted =
          (confirmationLabel === "Accepted" || confirmationLabel === "Waived") &&
          (entryStatus.kind === "accepted" || response?.participating === false || !response) &&
          !entry?.replacement_video_required;

        if (nodes.banner && nodes.bannerTitle && nodes.bannerCopy) {
          if (requirementStatus === "required" || requirementStatus === "invalidated") {
            nodes.banner.dataset.tone = "action";
            nodes.bannerTitle.textContent = "Action required";
            nodes.bannerCopy.textContent = "A new Confirmation requirement is active for this edition.";
          } else if (changesRequested) {
            nodes.banner.dataset.tone = "action";
            nodes.bannerTitle.textContent = "Action required";
            nodes.bannerCopy.textContent = canEdit
              ? "TSBC has requested changes. Editing is open for your existing submission."
              : "TSBC has requested changes, but editing is currently closed.";
          } else if (canEdit) {
            nodes.banner.dataset.tone = "ready";
            nodes.bannerTitle.textContent = "Editing is open";
            nodes.bannerCopy.textContent = "You may update your existing submission without confirming again.";
          } else if (awaitingReview) {
            nodes.banner.dataset.tone = "neutral";
            nodes.bannerTitle.textContent = "Awaiting review";
            nodes.bannerCopy.textContent = "Your latest saved submission is waiting for TSBC review.";
          } else if (everythingAccepted) {
            nodes.banner.dataset.tone = "ready";
            nodes.bannerTitle.textContent = "Everything accepted";
            nodes.bannerCopy.textContent = "Your participation and current submission are complete. No action is required.";
          } else {
            nodes.banner.dataset.tone = "neutral";
            nodes.bannerTitle.textContent = "Editing closed";
            nodes.bannerCopy.textContent = "Your current submission is saved. Editing is not currently available.";
          }
        }

        if (nodes.lastUpdate) {
          const updated = formatUpdated(response?.updated_at || response?.submitted_at || requirement?.resolved_at);
          nodes.lastUpdate.textContent = updated ? "Last update · " + updated : "Status loaded from Solaris";
        }
        announce("Delegation status loaded for " + (country.name || "your country") + ".");
      }

      async function invokeCountryAuth(body) {
        const { data, error } = await supabase.functions.invoke("country-auth", { body });
        if (!error) return data;
        let message = error.message || "Authentication request failed.";
        const response = error.context;
        if (response) {
          try {
            const payload = await response.json();
            if (payload?.error) message = payload.error;
          } catch {}
        }
        throw new Error(message);
      }

      async function loadPortal(options = {}) {
        const force = Boolean(options.force);
        if (!force && Date.now() - lastPortalLoadAt < 4000) return;
        lastPortalLoadAt = Date.now();
        clearMessages();
        if (nodes.refresh) nodes.refresh.disabled = true;
        try {
          const { data, error } = await supabase.rpc("public_country_account_confirmation_portal");
          if (error) throw error;
          if (!data?.authenticated) {
            currentPortal = null;
            showOnly("noAccess");
            announce("This signed-in account has no active delegation access.");
            return;
          }
          renderDashboard(data);
        } catch (error) {
          showError(error?.message || "Your Confirmation status could not be loaded. Try again.");
        } finally {
          if (nodes.refresh) nodes.refresh.disabled = false;
        }
      }

      async function restoreSession() {
        showOnly("checking");
        clearMessages();
        announce("Checking your Solaris account…");
        try {
          const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
          if (sessionError) throw sessionError;
          if (!sessionData.session) {
            showOnly("signedOut");
            announce("Sign in to manage your current Confirmation.");
            return;
          }
          const { data: userData, error: userError } = await supabase.auth.getUser();
          if (userError || !userData.user) {
            await supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
            showOnly("signedOut");
            announce("Your previous session expired. Sign in again.");
            return;
          }
          await loadPortal({ force: true });
        } catch {
          showOnly("signedOut");
          showError("Your previous Solaris session could not be restored. Sign in again.");
        }
      }

      nodes.form?.addEventListener("submit", async (event) => {
        event.preventDefault();
        clearMessages();
        const identifier = String(nodes.identifier?.value || "").trim();
        const password = String(nodes.password?.value || "");
        if (!identifier || !password) return;
        nodes.signinButton.disabled = true;
        announce("Signing in…");
        try {
          const payload = await invokeCountryAuth({ action: "signin", identifier, password });
          const { data, error } = await supabase.auth.setSession({
            access_token: payload.accessToken,
            refresh_token: payload.refreshToken,
          });
          if (error || !data.session) throw error || new Error("Could not start your Solaris session.");
          if (nodes.password) nodes.password.value = "";
          await loadPortal({ force: true });
        } catch (error) {
          showOnly("signedOut");
          showError(error?.message || "Sign-in failed. Check your details and try again.");
        } finally {
          nodes.signinButton.disabled = false;
        }
      });

      nodes.recover?.addEventListener("click", async () => {
        clearMessages();
        const identifier = String(nodes.identifier?.value || "").trim();
        if (!identifier) {
          showError("Enter your Solaris identifier first, then request password recovery.");
          nodes.identifier?.focus();
          return;
        }
        nodes.recover.disabled = true;
        try {
          const result = await invokeCountryAuth({ action: "recover", identifier });
          showNotice(result?.recoveryAvailable === false
            ? "This country account does not currently have a recovery email. Contact TSBC for access help."
            : "If this account has a recovery email, Solaris has started password recovery. Check that inbox.");
        } catch (error) {
          showError(error?.message || "Password recovery could not be started.");
        } finally {
          nodes.recover.disabled = false;
        }
      });

      async function signOut() {
        currentPortal = null;
        clearMessages();
        showOnly("signedOut");
        if (nodes.statuses) nodes.statuses.replaceChildren();
        if (nodes.entryCard) nodes.entryCard.hidden = true;
        if (nodes.edit) nodes.edit.hidden = true;
        announce("Signed out.");
        try { await supabase.auth.signOut({ scope: "local" }); } catch {}
      }

      for (const button of document.querySelectorAll("[data-maintenance-hod-signout]")) {
        button.addEventListener("click", () => void signOut());
      }

      nodes.refresh?.addEventListener("click", () => void loadPortal({ force: true }));

      nodes.edit?.addEventListener("click", async () => {
        clearMessages();
        const response = currentPortal?.response;
        if (!response?.can_edit || !response.round_id) {
          showError("Editing is no longer available. Refresh your status.");
          return;
        }
        nodes.edit.disabled = true;
        announce("Opening your existing submission…");
        try {
          const { data, error } = await supabase.rpc("public_create_country_account_edit_token", {
            _round_id: response.round_id,
          });
          if (error) throw error;
          if (!data?.ok || !data?.token) {
            throw new Error(data?.reason === "editing_closed"
              ? "Editing was closed before the editor opened."
              : data?.reason === "locked"
                ? "This submission is locked and cannot be edited."
                : "Solaris could not open this existing submission.");
          }
          const focus = entryState(responseEntry(response), response).kind === "changes"
            ? "#entry-section-review"
            : "";
          window.location.assign("/confirmations/edit/" + encodeURIComponent(data.token) + focus);
        } catch (error) {
          showError(error?.message || "The existing submission could not be opened.");
          await loadPortal({ force: true });
        } finally {
          nodes.edit.disabled = false;
        }
      });

      document.addEventListener("visibilitychange", () => {
        if (!document.hidden && currentPortal) void loadPortal();
      });
      window.addEventListener("focus", () => {
        if (currentPortal) void loadPortal();
      });

      supabase.auth.onAuthStateChange((event) => {
        if (event === "SIGNED_OUT") {
          currentPortal = null;
          showOnly("signedOut");
        } else if (event === "TOKEN_REFRESHED" && currentPortal) {
          void loadPortal();
        }
      });

      void restoreSession();
    </script>
  `;

  const closingMain = "</main>";
  if (!maintenanceHtml.includes(closingMain)) {
    throw new Error("Maintenance page is missing its closing <main> element.");
  }
  return maintenanceHtml.replace(closingMain, `${portal}\n${closingMain}`);
}
