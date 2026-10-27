/** Isolated process: mock only the caller transport, execute real server owners, forbid all I/O/writes. */
import assert from "node:assert/strict";
import { mock } from "bun:test";

let allowed = false;
let queries: { table: string; method: string; args: unknown[] }[] = [];
let rows: Record<string, Record<string, unknown>[]> = {};
let networkAttempts = 0;
globalThis.fetch = (() => { networkAttempts++; throw new Error("Observational proof forbids network"); }) as typeof fetch;
const transport = {
  from(table: string) {
    queries.push({ table, method: "from", args: [] });
    let selected = rows[table] ?? [];
    const chain: Record<string, unknown> = {};
    for (const method of ["select", "order", "limit", "eq", "in", "ilike"]) {
      chain[method] = (...args: unknown[]) => {
        queries.push({ table, method, args });
        if (method === "eq") selected = selected.filter((row) => row[String(args[0])] === args[1]);
        if (method === "in") selected = selected.filter((row) => (args[1] as unknown[]).includes(row[String(args[0])]));
        if (method === "limit") selected = selected.slice(0, Number(args[0]));
        return chain;
      };
    }
    chain.then = (resolve: (value: unknown) => unknown) => Promise.resolve(resolve({ data: selected, error: null }));
    // Missing insert/update/delete/upsert/rpc means any attempted write fails this proof.
    return chain;
  },
};
mock.module("../../src/integrations/televoting/admin-session.server", () => ({
  requireMergedTelevotingAdminServer: async () => {
    if (!allowed) throw new Error("Organizer access required");
    return { id: "caller", username: "Organizer" };
  },
}));
mock.module("../../src/integrations/televoting/client.server", () => ({ televotingAdmin: transport }));
const countries = [
  { id: "country-a", short_code: "AA", name: "A" },
  { id: "country-b", short_code: "BB", name: "B" },
];
const canonical = {
  hod: {
    editions: [{ id: "edition-22", name: "SSC 22", edition_number: 22 }],
    editionsById: new Map([["edition-22", { id: "edition-22", name: "SSC 22", edition_number: 22 }]]),
    people: [], assignments: [], countries,
    countriesById: new Map(countries.map((row) => [row.id, row])),
    countriesByCode: new Map(countries.map((row) => [row.short_code, row])),
    resolve: () => null,
  },
  juryVotes: [],
  remoteEditionToCanonical: new Map([["remote-22", "edition-22"]]),
  roundBindings: new Map(), participantsByShow: new Map(), editionParticipants: new Map(),
};
mock.module("../../src/integrations/televoting/canonical-context.server", () => ({
  loadCanonicalVotingContextServer: async () => canonical,
  canonicalEditionForRound: (_context: unknown, round: { edition_id: string }) => canonical.remoteEditionToCanonical.get(round.edition_id),
}));
let backtestHasBallots = false;
// The simulation consumes read-only materialized ballots; it never invokes official conversion.
mock.module("../../src/integrations/televoting/conversion.server", () => ({
  loadMergedConversionRound: async () => ({ total_points_to_distribute: 100, televote_engine_version: "robust_v2" }),
  loadMergedConversionParticipants: async () => ["AA", "BB", "CC", "DD", "EE"],
  loadMergedRobustBallots: async () => backtestHasBallots ? [
    { voterId: "read-voter-1", allocations: { AA: 7, BB: 5, CC: 4, DD: 2, EE: 2 } },
    { voterId: "read-voter-2", allocations: { AA: 2, BB: 2, CC: 4, DD: 5, EE: 7 } },
  ] : [],
}));
const { listMergedAuditLogServer } = await import("../../src/integrations/televoting/audit.server");
const { getMergedScopedAnalyticsServer } = await import("../../src/integrations/televoting/analytics.server");
const { getMergedIntelligenceServer } = await import("../../src/integrations/televoting/intelligence.server");
const { runHistoricalTelevoteBacktestServer } = await import("../../src/integrations/televoting/backtest.server");
const calls = [
  () => listMergedAuditLogServer({ limit: 20000 }),
  () => getMergedScopedAnalyticsServer({ mode: "round", roundId: "round-22" }),
  () => getMergedIntelligenceServer({ editionId: "edition-22", channel: "televote", lens: "country" }),
  () => runHistoricalTelevoteBacktestServer({ limit: 20000 }),
];
for (const call of calls) {
  queries = [];
  await assert.rejects(call, /Organizer access required/);
  assert.equal(queries.length, 0, "Denied callers must not read any source");
}
allowed = true;
rows.admin_audit_log = [{ id: 42, actor_username: "organizer", action: "round.closed", target_type: "round", created_at: "2026-10-26T00:00:00Z" }];
queries = [];
const audit = await listMergedAuditLogServer({ action: "round.closed", targetType: "round", limit: 20000 });
assert.equal(audit[0].id, "42");
assert.equal(audit[0].action, "round.closed");
assert(queries.some((q) => q.method === "limit" && q.args[0] === 1000));
assert(queries.some((q) => q.method === "eq" && q.args[0] === "action" && q.args[1] === "round.closed"));
rows = {
  editions: [{ id: "remote-22", name: "SSC 22", created_at: "2026-01-01" }, { id: "remote-23", name: "SSC 23", created_at: "2027-01-01" }],
  rounds: [
    { id: "round-22", name: "Semi final", edition_id: "remote-22", status: "closed", created_at: "2026-01-01" },
    { id: "round-23", name: "Unrelated", edition_id: "remote-23", status: "closed", created_at: "2027-01-01" },
  ],
  vote_submissions: [
    { id: "ballot-a", round_id: "round-22", country_code: "AA", username: "a", username_normalized: "a", created_at: "2026-01-01", status: "verified", risk_score: 0, is_vpn: false },
    { id: "ballot-deleted", round_id: "round-22", country_code: "AA", username: "a", created_at: "2026-01-01", status: "deleted", risk_score: 99, is_vpn: false },
    { id: "ballot-other", round_id: "round-23", country_code: "BB", username: "b", created_at: "2027-01-01", status: "verified", risk_score: 0, is_vpn: false },
  ],
  vote_entries: [{ submission_id: "ballot-a", target_country_code: "BB", points: 12 }],
  countries: [{ code: "AA", name: "A" }, { code: "BB", name: "B" }],
  round_entries: [{ round_id: "round-22", entry_key: "BB", country_code: "BB" }],
};
queries = [];
const analytics = await getMergedScopedAnalyticsServer({ mode: "round", roundId: "round-22" });
assert.deepEqual(analytics.scope.rounds.map((round) => round.id), ["round-22"]);
assert.equal(analytics.overview.ballots, 1);
assert.equal(analytics.overview.televotePoints, 12);
assert(queries.some((q) => q.table === "vote_submissions" && q.method === "in" && JSON.stringify(q.args) === '["round_id",["round-22"]]'));
const intelligence = await getMergedIntelligenceServer({ editionId: "edition-22", lens: "country", channel: "televote" });
assert.equal(intelligence.stats.ballots, 1);
assert.equal(intelligence.filters.editionId, "edition-22");
assert.equal(intelligence.filters.channel, "televote");
assert(intelligence.relationships.every((row) => row.votingCountries.every((name) => name !== "B")));
queries = [];
const simulation = await runHistoricalTelevoteBacktestServer({ roundId: "round-22", limit: 20000 });
assert.equal(simulation.summary.roundsAnalysed, 0, "No source ballots must not fabricate a result");
assert(queries.some((q) => q.method === "limit" && q.args[0] === 100));
assert(queries.some((q) => q.method === "eq" && q.args[0] === "id" && q.args[1] === "round-22"));
backtestHasBallots = true;
const beforeSimulation = JSON.stringify(rows);
const populatedSimulation = await runHistoricalTelevoteBacktestServer({ roundId: "round-22", limit: 40 });
assert.equal(populatedSimulation.summary.roundsAnalysed, 1);
assert.equal(populatedSimulation.rounds[0].roundId, "round-22");
assert.equal(populatedSimulation.rounds[0].totalPoints, 100);
assert.equal(populatedSimulation.rounds[0].attacks.length, 3);
assert.equal(JSON.stringify(rows), beforeSimulation, "Backtesting must not modify its persisted read source");
assert.equal(networkAttempts, 0);
console.log(JSON.stringify({ passed: true, unauthorizedOwners: 4, auditBound: 1000, historicalRoundBound: 100, scopedBallots: analytics.overview.ballots, officialWrites: 0, networkAttempts }));
