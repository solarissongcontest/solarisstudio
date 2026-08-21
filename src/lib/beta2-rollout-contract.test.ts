import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("Beta 2 hardened rollout contract", () => {
  it("makes Results and My Solaris primary navigation destinations", () => {
    const shell = source("src/components/AppShell.tsx");
    expect(shell).toContain('to: "/results"');
    expect(shell).toContain('label: "Results"');
    expect(shell).toContain('to="/results"');
    expect(shell).toContain('const accountHref = email ? "/my-solaris" : "/auth"');
    expect(shell).toContain('to="/predictions"');
  });

  it("provides real overview-first roots for the planned public sections", () => {
    const overview = source("src/components/PublicOverview.tsx");
    expect(overview).toContain('label="Overview"');
    expect(overview).toContain('label="Discover"');
    expect(overview).toContain('label="Deep dive"');

    for (const route of ["analysis", "pulse", "countries", "wiki"]) {
      const root = source(`src/routes/${route}.tsx`);
      expect(root).toContain("<PublicOverview");
      expect(root).toContain("<Outlet />");
    }

    expect(source("src/routes/results/index.tsx")).toContain('eyebrow="Results overview"');
  });

  it("keeps the phone result-view selector mounted as a native Safari-safe select", () => {
    const tabs = source("src/components/ResponsiveTabs.tsx");
    const show = source("src/routes/shows/$showId.tsx");
    expect(tabs).toContain('<select');
    expect(tabs).toContain('className="md:hidden"');
    expect(tabs).toContain('className="scroll-slim hidden overflow-x-auto md:block"');
    expect(show).toContain('<ResponsiveTabs');
    expect(show).toContain('label="Show view"');
  });

  it("preserves old edition result URLs and sends them into the current show results UI", () => {
    const legacy = source("src/routes/results/$slug.tsx");
    expect(legacy).toContain('createFileRoute("/results/$slug")');
    expect(legacy).toContain('to: "/shows/$showId"');
    expect(legacy).toContain('resolveShowPublication(show).results');
  });

  it("keeps the country workspace progressively disclosed", () => {
    const hub = source("src/routes/_authenticated/country-hub/index.tsx");
    expect(hub).toContain('type HubTab = "overview" | "country" | "page" | "entries"');
    expect(hub).toContain('useState<HubTab>("overview")');
    expect(hub).toContain('setActiveTab(tab.id)');
    expect(hub).toContain('activeTab === "country"');
    expect(hub).toContain('activeTab === "page"');
    expect(hub).toContain('activeTab === "entries"');
  });

  it("loads the isolated Beta 2 personality polish after the established repair layer", () => {
    const visual = source("src/components/RouteVisualTheme.tsx");
    const css = source("src/country-personalities-beta2.css");
    expect(visual.indexOf('country-personalities-beta2.css')).toBeGreaterThan(
      visual.indexOf('country-personalities-v4.css'),
    );
    for (const layout of ["ribbon", "duotone", "broadcast", "monument", "horizon"]) {
      expect(css).toContain(`data-country-hero-layout="${layout}"`);
      expect(css).toContain(`data-preview-layout="${layout}"`);
    }
    expect(css).toContain('@media (max-width: 767px)');
  });

  it("keeps Broadcast as a fading top source strip without the preview-only opaque block", () => {
    const css = source("src/country-personalities-beta2.css");
    expect(css).toContain("BROADCAST correction");
    expect(css).toContain("height: clamp(4.2rem, 9vw, 6.4rem) !important");
    expect(css).toContain("linear-gradient(180deg, #000 0 55%");
    expect(css).toContain('[data-preview-layout="broadcast"] > .relative.z-10 > div');
    expect(css).toContain("background: transparent !important");
    expect(css).not.toContain("padding-right: clamp(34%, 39vw, 44%)");
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
    expect(schedule).toContain("CLOSED_STATUSES");
    expect(schedule).toContain('if (CLOSED_STATUSES.has(status)) return "closed"');
    expect(strip).toContain("status: round.status");
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
    expect(sql).toContain(
      "sync_submission_editing_from_round() from public, anon, authenticated",
    );
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
