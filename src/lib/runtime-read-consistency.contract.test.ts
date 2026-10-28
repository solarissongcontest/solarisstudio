import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(path, "utf8");

describe("runtime read consistency", () => {
  const readContracts = source(
    "supabase/migrations/20261011160000_read_only_public_read_contracts.sql",
  );
  const confirmationProjectionReconciliation = source(
    "supabase/migrations/20261011161500_reconcile_confirmation_entry_projection.sql",
  );
  const resultsFunctions = source(
    "src/integrations/televoting/results.functions.ts",
  );
  const televotingStatus = source(
    "src/integrations/televoting/status.functions.ts",
  );
  const confirmationSync = source(
    "src/integrations/confirmations/sync.functions.ts",
  );
  const hodWorkspace = source("src/lib/studio2-hod-workspace.ts");
  const publicUxEvents = source("src/lib/public-ux-events.ts");
  const participationShell = source(
    "src/components/ParticipationServiceShell.tsx",
  );
  const televotingRoute = source("src/routes/televoting/index.tsx");
  const resultsRoute = source("src/routes/televoting/results.tsx");

  it("declares genuine public context RPCs as stable for read-only mode", () => {
    expect(readContracts).toContain(
      "alter function public.country_jury_voting_context() stable;",
    );
    expect(readContracts).toContain(
      "alter function public.public_country_account_confirmation_access() stable;",
    );
    expect(readContracts).toContain(
      "alter function public.public_country_account_confirmation_requirements() stable;",
    );
    expect(readContracts).toContain(
      "alter function public.public_next_in_line_countries() stable;",
    );
    expect(readContracts).toContain("proc.provolatile not in ('s', 'i')");
  });

  it("keeps the canonical TanStack server-function transport while database reads stay read-only", () => {
    expect(resultsFunctions).toContain(
      'createServerFn({ method: "POST" })',
    );
    expect(resultsFunctions).toContain(
      "enforce read-only semantics at the database",
    );
  });

  it("probes the real public Televoting backend instead of treating env presence as readiness", () => {
    expect(televotingStatus).toContain("async function checkPublicBackend()");
    expect(televotingStatus).toContain('from("rounds")');
    expect(televotingStatus).toContain('select("id", { head: true, count: "exact" })');
    expect(televotingStatus).not.toContain(
      "votingReady: Boolean(\n      import.meta.env.VITE_SUPABASE_URL",
    );
  });

  it("preserves accepted confirmation media in the canonical entry", () => {
    expect(confirmationSync).toContain(
      '.from("national_final_entries")',
    );
    expect(confirmationSync).toContain(
      '"id,artist,song_title,song_url,review_status,removed"',
    );
    const entryAuthority = source("supabase/migrations/20261027211501_v3_s16_entry_confirmation_authority.sql");
    expect(confirmationSync).toContain('db.rpc("v3_sync_confirmation_entry"');
    expect(entryAuthority).toContain("nullif(btrim(entry.song_url), '')");
    expect(entryAuthority).toContain("nullif(btrim(candidate.song_url), '')");
    expect(entryAuthority).toContain("song_url = excluded.song_url");
    expect(hodWorkspace).toContain(
      "'entry.media': completed(\n      pendingConfirmationEntry || Boolean(entry?.songUrl?.trim()),",
    );
  });

  it("reconciles stale accepted Confirmation projections without overwriting canonical values", () => {
    expect(confirmationProjectionReconciliation).toContain(
      "canonical.source = 'confirmations'",
    );
    expect(confirmationProjectionReconciliation).toContain(
      "internal_entry.review_status = 'accepted'",
    );
    expect(confirmationProjectionReconciliation).toContain(
      "national_entry.review_status = 'accepted'",
    );
    expect(confirmationProjectionReconciliation).toContain(
      "coalesce(nullif(btrim(canonical.song_url), ''), accepted.song_url)",
    );
    expect(confirmationProjectionReconciliation).toContain(
      "coalesce(nullif(btrim(participant.song), ''), reconciled.song_title)",
    );
    expect(confirmationProjectionReconciliation).toContain(
      "- 'awaiting_official_entry'",
    );
  });

  it("stops optional UX telemetry after the first rejected write", () => {
    expect(publicUxEvents).toContain("let telemetryWriteDisabled = false;");
    expect(publicUxEvents).toContain("if (telemetryWriteDisabled) return;");
    expect(publicUxEvents).toContain("if (error) telemetryWriteDisabled = true;");
    expect(publicUxEvents).toContain("telemetryWriteDisabled = true;");
  });

  it("uses one compact state primitive for Televoting and published results", () => {
    expect(participationShell).toContain(
      "export function ParticipationStatusPanel",
    );
    expect(televotingRoute).toContain("ParticipationStatusPanel");
    expect(resultsRoute).toContain("ParticipationStatusPanel");
    expect(televotingRoute).not.toContain(
      'className="data-panel p-8 text-center sm:p-10"',
    );
  });
});
