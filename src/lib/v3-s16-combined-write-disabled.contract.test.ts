import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { requireCombinedTelevoteWriteApproval } from "@/integrations/televoting/combined-write-gate.server";
import { scanV3S16StaticAuthority } from "./v3-s16-mutation-authority";

const server = readFileSync(resolve(process.cwd(), "src/integrations/televoting/combined.server.ts"), "utf8");
const sync = readFileSync(resolve(process.cwd(), "src/integrations/televoting/combined-sync.server.ts"), "utf8");
const archiveWorkflow = readFileSync(resolve(process.cwd(), ".github/workflows/v3-s14-archive-forward-effects-local.yml"), "utf8");
const resultSync = readFileSync(resolve(process.cwd(), "src/integrations/televoting/results-sync.server.ts"), "utf8");

const mutationFunctions = [
  "createMergedCombinedAggregationServer",
  "updateMergedCombinedAggregationServer",
  "setMergedCombinedParticipantsServer",
  "upsertMergedCombinedSourceServer",
  "deleteMergedCombinedSourceServer",
  "saveMergedCombinedSourceValuesServer",
  "recalculateMergedCombinedServer",
  "setMergedCombinedStatusServer",
  "deleteMergedCombinedAggregationServer",
] as const;

function functionHead(source: string, name: string): string {
  const start = source.indexOf(`export async function ${name}(`);
  expect(start, `${name}: expected exported server entry point`).toBeGreaterThanOrEqual(0);
  const next = source.indexOf("export async function ", start + 1);
  return source.slice(start, next < 0 ? undefined : next).slice(0, 750);
}

function expectGatedBeforeAwait(source: string, name: string) {
  const head = functionHead(source, name);
  const guard = head.indexOf("requireCombinedTelevoteWriteApproval();");
  const firstAwait = head.indexOf("await ");
  expect(guard, `${name}: missing server-side gate`).toBeGreaterThan(0);
  expect(firstAwait, `${name}: async authorization/database boundary missing`).toBeGreaterThan(0);
  expect(guard, `${name}: guard must run before any awaited action`).toBeLessThan(firstAwait);
}

function expectRetiredBeforeNetwork(source: string, name: string) {
  const head = functionHead(source, name);
  expect(head).toContain("requireCombinedTelevoteWriteApproval();");
  expect(head).toContain('throw new Error("Combined Televote mutations are disabled pending canonical authority certification.");');
  expect(head).not.toMatch(/\bawait\b|\.from\s*\(|\.rpc\s*\(|\.(?:insert|update|upsert|delete)\s*\(/);
}

describe("COM-00: separate Combined Televote cannot write during deferred beta", () => {
  it("produces independent exact-SHA PG17 Publication evidence for every Combined writer source change", () => {
    for (const file of [
      "src/integrations/televoting/combined.server.ts",
      "src/integrations/televoting/combined-sync.server.ts",
      "src/lib/v3-s16-combined-write-disabled.contract.test.ts",
    ]) expect(archiveWorkflow).toContain('      - "' + file + '"');
    expect(archiveWorkflow).toContain('s06_archive_paths');
  });

  it("uses unconditional server-side denial", () => {
    expect(() => requireCombinedTelevoteWriteApproval()).toThrow(
      "Combined Televote mutations are disabled pending canonical authority certification.",
    );
  });

  it.each(mutationFunctions)("retires all physical DML and denies %s before any async action", (name) => {
    expectRetiredBeforeNetwork(server, name);
  });

  it("denies background or direct participant sync before reading any state", () => {
    expectRetiredBeforeNetwork(sync, "syncEditableCombinedParticipantsFromSolarisServer");
  });

  it("denies Combined official Results publication before SQL or RPC", () => {
    expectGatedBeforeAwait(resultSync, "syncPublishedCombinedResultsToSolarisServer");
    expect(functionHead(resultSync, "trySyncPublishedCombinedResultsToSolarisServer"))
      .toContain("syncPublishedCombinedResultsToSolarisServer(aggregationId)");
  });

  it("does not block ordinary round-based Televote result reconciliation", () => {
    const round = functionHead(resultSync, "syncPublishedRoundResultsToSolarisServer");
    expect(round).not.toContain("requireCombinedTelevoteWriteApproval();");
    expect(round).toContain("requireMergedTelevotingAdminServer");
    const roundBody = resultSync.slice(
      resultSync.indexOf("export async function syncPublishedRoundResultsToSolarisServer("),
      resultSync.indexOf("export async function syncPublishedCombinedResultsToSolarisServer("),
    );
    expect(roundBody).toContain("writeCanonicalShowTelevote");
  });

  it("does not retain the two deferred Combined canonical-table source writers", () => {
    const findings = scanV3S16StaticAuthority([
      { path: "src/integrations/televoting/combined.server.ts", source: server },
      { path: "src/integrations/televoting/combined-sync.server.ts", source: sync },
    ]);
    expect(findings.filter(finding =>
      finding.kind === "direct_application_writer" && finding.domain === "televote",
    )).toEqual([]);
    expect(server).not.toContain('.from("televote_aggregations").update(');
    expect(sync).not.toContain('.from("televote_aggregations")');
    expect(sync).not.toContain('.from("televote_aggregation_participants")');
    expect(server).not.toContain('from("combined_televote_results").insert(');
  });

  it("locks down the whole current exported Combined mutation inventory", () => {
    const actual = [...server.matchAll(/export async function (\w+MergedCombined\w*Server)\(/g)]
      .map((match) => match[1])
      .filter((name) => !["getMergedCombinedAggregationServer", "listMergedCombinedAggregationsServer"].includes(name));
    expect(actual.sort()).toEqual([...mutationFunctions].sort());
  });

  it("does not weaken existing organizer authorization", () => {
    expect(server).toContain("requireMergedTelevotingAdminServer");
    expect(sync).not.toContain("requireMergedTelevotingAdminServer");
    expect(sync).not.toContain("televotingAdmin");
    expect(resultSync).toContain("requireMergedTelevotingAdminServer");
  });
});
