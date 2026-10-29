import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("Public V3 P24 Records", () => {
  it("derives records on the server through the existing canonical public calculator", () => {
    const source = read("src/integrations/v3/records-source.server.ts");
    const fn = read("src/lib/v3-records.functions.ts");

    expect(fn).toContain('createServerFn({ method: "GET" })');
    expect(fn).toContain("loadV3RecordsBundle");
    expect(source).toContain("buildCanonicalFanRecords");
    expect(source).toContain("createConfirmationPublicRuntimeClient");
    expect(source).toContain("Only derived record output crosses the server boundary");
  });

  it("limits result and jury reads to their canonical publication layers", () => {
    const source = read("src/integrations/v3/records-source.server.ts");

    expect(source).toContain("resolveShowPublication(show).results === true");
    expect(source).toContain("snapshots.get(show.id)!.availability.detailedVoting");
    expect(source).toContain("snapshots.get(show.id)?.editionId === show.edition_id");
    expect(source).not.toContain('fetchPaged<ResultRow>(client, "results"');
    expect(source).toContain("await loadPublicResultSnapshots(client, resultShowIds)");
    expect(source).toContain("snapshots.get(show.id)!.rows");
    expect(source).toContain('fetchPaged<JuryVote>(client, "jury_votes"');
    expect(source).toContain('query.in("show_id", juryShowIds)');
  });

  it("does not return raw archive rows to the browser runtime", () => {
    const runtime = read("src/lib/v3-records-runtime.ts");
    const contract = read("src/lib/v3-records.ts");

    expect(runtime).toContain("getV3RecordsBundle");
    expect(contract).toContain("records: FanRecord[]");
    expect(contract).toContain("spoilerSafeRecords: FanRecord[]");
    expect(contract).not.toContain("participants:");
    expect(contract).not.toContain("results:");
    expect(contract).not.toContain("jury:");
    expect(runtime).not.toContain("useAllParticipants");
    expect(runtime).not.toContain("useAllResults");
    expect(runtime).not.toContain("useAllJuryVotes");
  });

  it("keeps the server projection read-only", () => {
    const combined = [
      read("src/integrations/v3/records-source.server.ts"),
      read("src/lib/v3-records.functions.ts"),
      read("src/lib/v3-records-runtime.ts"),
    ].join("\n");

    expect(combined).not.toContain(".insert(");
    expect(combined).not.toContain(".update(");
    expect(combined).not.toContain(".delete(");
    expect(combined).not.toContain(".upsert(");
    expect(combined).not.toContain("service_role");
  });

  it("uses server-owned Results rollout authority and fails closed", () => {
    const gate = read("src/components/v3/V3RecordsGate.tsx");
    const route = read("src/routes/records/index.tsx");

    expect(gate).toContain("useV3EditionRolloutProbe");
    expect(gate).toContain("useV3RolloutProbe");
    expect(gate).toContain("rollout.data.resultsEnabled !== true");
    expect(gate).toContain("return <>{fallback}</>");
    expect(route).toContain("isAppMode");
    expect(route).toContain("<V3RecordsGate fallback={<LegacyRecordsPage />} />");
    expect(route).toContain("return <LegacyRecordsPage />");
  });

  it("derives a second canonical archive with the current public edition removed", () => {
    const source = read("src/integrations/v3/records-source.server.ts");

    expect(source).toContain("resolveCurrentPublicEdition(editions)");
    expect(source).toContain("spoilerSafeEditions");
    expect(source).toContain("edition.id !== currentEditionId");
    expect(source).toContain("show.edition_id !== currentEditionId");
    expect(source).toContain("row.edition_id !== currentEditionId");
    expect(source).toContain("const spoilerSafeRecords = currentEditionAffectsRecords");
    expect(source).toContain("buildCanonicalFanRecords({");
    expect(source).toContain("spoilerSafeArchivedFinalEditions");
  });

  it("uses the shared Results spoiler authority and requires deliberate current-edition reveal", () => {
    const gate = read("src/components/v3/V3RecordsGate.tsx");
    const screen = read("src/components/v3/V3RecordsScreen.tsx");

    expect(gate).toContain("useAppExperiencePreferences");
    expect(gate).toContain("useNotificationPreferences");
    expect(gate).toContain("resolveV3ResultsSpoilerProtection");
    expect(gate).toContain("localSpoilerFree: preferences.spoilerFree");
    expect(gate).toContain("serverSpoilerFree: serverPreferences.data?.spoiler_free ?? null");
    expect(gate).toContain("bundle.data.currentEditionAffectsRecords");
    expect(gate).toContain("bundle.data.spoilerSafeRecords");
    expect(gate).toContain("setCurrentEditionRevealed(true)");
    expect(gate).toContain("setCurrentEditionRevealed(false)");
    expect(screen).toContain('data-v3-records-spoilers="protected"');
    expect(screen).toContain("Reveal current-edition records");
  });

  it("does not collect participant notes for derived public Records", () => {
    const source = read("src/integrations/v3/records-source.server.ts");
    const participantColumns = source.slice(
      source.indexOf("const PARTICIPANT_COLUMNS"),
      source.indexOf("const RESULT_COLUMNS"),
    );

    expect(participantColumns).not.toContain("notes");
  });

  it("preserves record categories, ties and canonical country drill-downs", () => {
    const screen = read("src/components/v3/V3RecordsScreen.tsx");

    for (const category of [
      "career",
      "streaks",
      "edition",
      "voting",
      "regional",
      "unusual",
    ]) {
      expect(screen).toContain(`value: "${category}"`);
    }
    expect(screen).toContain("record.holders.length} tied");
    expect(screen).toContain('to="/countries/$code"');
    expect(screen).toContain('data-v3-records-empty=""');
  });

  it("does not expose a browser-controlled Records rollout escape hatch", () => {
    const combined = [
      read("src/components/v3/V3RecordsGate.tsx"),
      read("src/routes/records/index.tsx"),
      read("src/lib/v3-records-runtime.ts"),
    ].join("\n");

    expect(combined).not.toContain("localStorage");
    expect(combined).not.toContain("sessionStorage");
    expect(combined).not.toContain("VITE_SOLARIS_APP_V3_RECORDS");
    expect(combined).not.toContain("window.location.search");
  });
});
