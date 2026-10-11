import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(path, "utf8");

describe("runtime read consistency", () => {
  const readContracts = source(
    "supabase/migrations/20261011160000_read_only_public_read_contracts.sql",
  );
  const resultsFunctions = source(
    "src/integrations/televoting/results.functions.ts",
  );
  const confirmationSync = source(
    "src/integrations/confirmations/sync.functions.ts",
  );
  const hodWorkspace = source("src/lib/studio2-hod-workspace.ts");
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

  it("keeps published-result transport read-only", () => {
    expect(resultsFunctions).toContain(
      'createServerFn({ method: "GET" })',
    );
    expect(resultsFunctions).not.toContain(
      'createServerFn({ method: "POST" })',
    );
  });

  it("preserves accepted confirmation media in the canonical entry", () => {
    expect(confirmationSync).toContain(
      '.from("national_final_entries")',
    );
    expect(confirmationSync).toContain(
      '"id,artist,song_title,song_url,review_status,removed"',
    );
    expect(confirmationSync).toContain(
      "song_url: cleanText(officialEntry.song_url)",
    );
    expect(hodWorkspace).toContain(
      "'entry.media': completed(\n      pendingConfirmationEntry || Boolean(entry?.songUrl?.trim()),",
    );
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
