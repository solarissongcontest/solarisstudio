import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const exists = (path: string) => existsSync(resolve(process.cwd(), path));

describe("Beta 2 hardened rollout contract", () => {
  it("keeps Results direct and gives mobile users the five primary journeys", () => {
    const shell = source("src/components/AppShell.tsx");
    expect(shell).toContain('to="/results"');
    expect(shell).toContain("<PublicDrawerNavigation");
    expect(shell).toContain("<PublicSiteSidebar");
    expect(shell).toContain('to: "/results",\n      label: "Results"');
    expect(shell).toContain('to: "/participate",\n      label: "Participate"');
    expect(shell).toContain('label: "Explore"');
    expect(shell).toContain('label: "Me"');
    expect(shell).toContain('const accountHref = email ? "/my-solaris" : "/auth"');
  });

  it("opens public hubs directly instead of inserting generic overview gates", () => {
    expect(exists("src/components/PublicOverview.tsx")).toBe(false);
    for (const route of ["analysis", "pulse", "countries", "wiki", "editions", "records"]) {
      expect(exists(`src/routes/${route}.tsx`)).toBe(false);
      expect(exists(`src/routes/${route}/index.tsx`)).toBe(true);
    }

    const countries = source("src/routes/countries/index.tsx");
    const wiki = source("src/routes/wiki/index.tsx");
    expect(countries).toContain('eyebrow="Delegation directory"');
    expect(countries).toContain("Most successful delegations");
    expect(wiki).toContain('eyebrow="Terra Solaris"');
    expect(wiki).toContain("Browse the Wiki");

    const results = source("src/routes/results/index.tsx");
    expect(results).toContain("Latest published result");
    expect(results).not.toContain("01 Overview");
    expect(results).not.toContain("Deep dive");
  });

  it("keeps the phone result-view selector mounted as a native Safari-safe select", () => {
    const tabs = source("src/components/ResponsiveTabs.tsx");
    const show = source("src/routes/shows/$showId.tsx");
    expect(tabs).toContain("<select");
    expect(tabs).toContain('collapseAt = "md"');
    expect(tabs).toContain('collapseAt === "lg" ? "lg:hidden" : "md:hidden"');
    const country = source("src/routes/countries/$code.tsx");
    expect(country).toContain('collapseAt="lg"');
    expect(tabs).toContain('className="scroll-slim hidden overflow-x-auto md:block"');
    expect(show).toContain("<ResponsiveTabs");
    expect(show).toContain('label="Show view"');
  });

  it("preserves old edition result URLs and sends them into the current show results UI", () => {
    const legacy = source("src/routes/results/$slug.tsx");
    expect(legacy).toContain('createFileRoute("/results/$slug")');
    expect(legacy).toContain('to: "/shows/$showId"');
    expect(legacy).toContain("resolveShowPublication(show).results");
  });

  it("keeps the country workspace progressively disclosed", () => {
    const hub = source("src/components/mysolaris/modules/MySolarisCountryModule.tsx");
    expect(hub).toContain('type HubTab = "overview" | "country" | "page" | "entries"');
    expect(hub).toContain("const COUNTRY_TABS");
    expect(hub).toContain('section === "history" ? "entries" : "overview"');
    expect(hub).toContain("setActiveTab(tab.id)");
    expect(hub).toContain('section === "country" && activeTab === "country"');
    expect(hub).toContain('section === "history" && activeTab === "entries"');
  });

  it("owns expanded personal activity inside the MySolaris route", () => {
    const authLayout = source("src/routes/_authenticated/route.tsx");
    const portal = source("src/components/MySolarisPortalExtension.tsx");
    const mySolaris = source("src/routes/_authenticated/my-solaris/index.tsx");
    expect(authLayout).not.toContain("MySolarisPortalExtension");
    expect(authLayout).not.toContain("HodWorkspaceLauncher");
    expect(mySolaris).toContain("<MySolarisActivityPanels />");
    expect(portal).not.toContain("createPortal");
    for (const section of ["Saved", "Results dashboard", "Predictions", "Compare", "Activity"]) {
      expect(portal).toContain(`title="${section}"`);
    }
  });

  it("replaces the old personality repair stack with the source-driven system", () => {
    const visual = source("src/components/CountryPersonalityStyles.tsx");
    const registry = source("src/lib/country-personality-system.ts");
    const css = source("src/country-personality-shared-foundation.css");
    const wiki = source("src/country-wiki-v8.css");
    expect(visual).toContain("country-personality-shared-foundation.css");
    expect(visual).not.toContain("country-personality-system-v8.css");
    expect(visual).toContain("country-wiki-v8.css");
    expect(visual).not.toContain("country-personality-system-v7.css");
    expect(visual).not.toContain("country-personality-v7-production-bridge.css");
    expect(visual).not.toContain("country-liquid-glass-public-v7.css");
    for (const name of ["Glass", "Editorial", "Passport", "Poster", "Heritage", "Broadcast", "Minimal", "Atlas", "Diplomatic", "Festival", "Brutalist", "Retro Digital", "Luxury", "Newspaper", "Scientific", "Civic", "Avant-Garde"]) {
      expect(registry).toContain(`name: "${name}"`);
    }
    expect(registry).toContain("referenceFamily:");
    expect(registry).toContain("implementationReference:");
    expect(css).toContain("@media (max-width: 639px)");
    expect(css).toContain("@media (forced-colors: active)");
    expect(wiki).toContain("--wiki-measure: 72ch");
  });

  it("keeps Broadcast grid-based with a bounded metadata band instead of free-floating technical lines", () => {
    const css = source("src/styles/personalities/broadcast-source.adapter.css");
    expect(css).toContain("BBC GEL Grid + GEL Typography translated adapter");
    expect(css).toContain(".country-hero-actions {");
    expect(css).toContain("background: var(--primary)");
    expect(css).not.toContain("country-hero-signature-a");
    expect(css).not.toContain("signal-line");
  });

  it("uses one Glass identity plate over the visual scene", () => {
    const css = source("src/styles/personalities/glass-source.adapter.css");
    const hero = source("src/components/country/CountryIdentityHero.tsx");
    expect(css).toContain("samasante/liquid-glass");
    expect(css).toContain(".country-hero-scene-flag");
    expect(css).toContain("backdrop-filter: blur(20px) saturate(132%)");
    expect(hero).toContain("country-hero-scene");
    expect(hero).toContain("country-hero-layout");
    expect(hero).not.toContain("country-liquid-glass-refraction");
  });

  it("lets entity colours reach the page chrome and interactive controls", () => {
    const css = source("src/calm-public-chrome.css");
    expect(css).toContain(".site-nav");
    expect(css).toContain(".mobile-quick-nav");
    expect(css).toContain(":is(.public-drawer, .nav-menu-panel)");
    expect(css).toContain(".directory-page-filter");
  });

  it("shows the planned ten-second pending to confirmed receipt for submissions and voting", () => {
    const receipt = source("src/components/DelayedConfirmationState.tsx");
    const confirmationRoute = source("src/routes/confirmations/index.tsx");
    const editRoute = source("src/routes/confirmations/edit/$token.tsx");
    const televotingRoute = source("src/routes/televoting/index.tsx");
    const session = source("src/lib/session.ts");
    const antiAbuse = source("src/integrations/televoting/anti-abuse.ts");

    expect(receipt).toContain("const DEFAULT_SECONDS = 10");
    expect(receipt).toContain('data-confirmation-stage={confirmed ? "confirmed" : "pending"}');
    expect(receipt).toContain("Finalising receipt");
    expect(confirmationRoute).toContain("<ConfirmationFormWithReceipt");
    expect(editRoute).toContain("<ConfirmationFormWithReceipt");
    expect(televotingRoute).toContain("<TelevotingBoothWithReceipt");
    expect(session).toContain("CONFIRMATION_SUBMITTED_EVENT");
    expect(antiAbuse).toContain("TELEVOTE_SUBMITTED_EVENT");
  });

  it("keeps custom Televoting entries in the same ballot and receipt path as country songs", () => {
    const schema = source("supabase/migrations/20260818094000_local_televoting_schema.sql");
    const entries = source("src/integrations/televoting/entries.server.ts");
    const route = source("src/routes/televoting/index.tsx");

    expect(schema).toContain("entry_type in ('country','custom')");
    expect(entries).toContain('entry_type: "country" | "custom"');
    expect(entries).toContain('entry_type: "custom"');
    expect(route).toContain("entry_type: entry.entry_type");
    expect(route).toContain("TelevotingBoothWithReceipt");
  });

  it("keeps internal NF trigger helpers off the browser RPC surface", () => {
    const migration = source(
      "supabase/migrations/20260821174500_harden_beta2_trigger_rpc_surface.sql",
    );
    expect(migration).toContain(
      "revoke all on function public.national_final_pulse_trigger() from public, anon, authenticated",
    );
    expect(migration).toContain(
      "revoke all on function public.national_final_entry_pulse_trigger() from public, anon, authenticated",
    );
  });

  it("exposes entry publication controls only to signed-in Solaris users", () => {
    const migration = source(
      "supabase/migrations/20260821175500_harden_beta2_entry_publication_rpc.sql",
    );
    expect(migration).toContain(
      "revoke all on function public.owned_country_entry_publication(uuid) from public, anon",
    );
    expect(migration).toContain(
      "revoke all on function public.set_owned_country_entry_publication(uuid, text, timestamptz, text) from public, anon",
    );
    expect(migration).toContain(
      "grant execute on function public.owned_country_entry_publication(uuid) to authenticated",
    );
    expect(migration).toContain(
      "grant execute on function public.set_owned_country_entry_publication(uuid, text, timestamptz, text) to authenticated",
    );
  });

  it("uses explicit confirmation status when deciding whether a round is open", () => {
    const schedule = source("src/lib/solaris-schedule.ts");
    const strip = source("src/components/PulseStrip.tsx");
    const mySolaris = source("src/routes/_authenticated/my-solaris/index.tsx");
    expect(schedule).toContain("CLOSED_STATUSES");
    expect(schedule).toContain('if (CLOSED_STATUSES.has(status)) return "closed"');
    expect(strip).toContain("status: round.status");
    expect(mySolaris).toContain("status: round.status");
  });

  it("rechecks confirmation editing state when an existing edit token is resolved", () => {
    const sql = source("scripts/confirmations-edit-token-hardening.sql");
    expect(sql).toContain("coalesce(s.editing_allowed, false)");
    expect(sql).toContain("coalesce(r.editing_enabled, false)");
    expect(sql).toContain("coalesce(e.editing_enabled, false)");
    expect(sql).toContain("'reason', 'editing_closed'");
    expect(sql).toContain("update public.edit_tokens set active = false");
  });

  it("keeps confirmation-only trigger helpers off the public RPC surface", () => {
    const sql = source("scripts/confirmations-trigger-rpc-hardening.sql");
    expect(sql).toContain(
      "keep_submission_editable_after_open_edit() from public, anon, authenticated",
    );
    expect(sql).toContain(
      "sync_submission_editing_from_edition() from public, anon, authenticated",
    );
    expect(sql).toContain("sync_submission_editing_from_round() from public, anon, authenticated");
  });

  it("uses an init-plan-friendly publication RLS policy and indexes NF history lookups", () => {
    const migration = source(
      "supabase/migrations/20260821175000_optimize_beta2_publication_rls.sql",
    );
    expect(migration).toContain("public.has_role((select auth.uid()), 'organizer')");
    expect(migration).toContain("ca.user_id = (select auth.uid())");
    expect(migration).toContain("national_final_entries_national_final_id_idx");
  });
});
