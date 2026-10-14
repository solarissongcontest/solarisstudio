import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";
import { submitTelevoteWithReconciliation, verifiedTelevoteReceipt } from "./v3-televote-reconciliation";

const code = ts.transpileModule(readFileSync("src/integrations/televoting/vote.server.ts", "utf8"), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
  transformers: { before: [() => (node) => ts.factory.updateSourceFile(node, node.statements.filter((item) => !ts.isImportDeclaration(item)))] },
}).outputText.replace(/\bexport /g, "");
const input = { roundId: "round", username: "Voter", countryCode: "HOME", preflightToken: "token", entries: [{ target_country_code: "A", points: 4 }], fingerprintHash: "fingerprint", deviceTokenHash: "device" };
const receipt = { found: true, authority: "authoritative_server", id: "submission", preflight_id: "token", round_id: "round", status: "active", accepted_at: "2026-10-14T00:00:00Z" };
function runtime(readResults: unknown[], writeResult: unknown) {
  const reads = [...readResults];
  const read = vi.fn(async () => reads.shift() ?? { data: { found: false }, error: null });
  const write = vi.fn(async (_name: string, _args: Record<string, unknown>) => writeResult);
  const schema = vi.fn(() => ({ rpc: read }));
  const rate = vi.fn();
  const exports: { submit?: (data: typeof input) => Promise<unknown> } = {};
  runInNewContext(code + "\nexports.submit = submitMergedTelevotingVoteServer;", { exports, submitTelevoteWithReconciliation, verifiedTelevoteReceipt, televotingPublicServer: { rpc: write, schema }, enforceTelevotingRateLimit: rate, getTelevotingNetworkSignals: () => ({ ipHash: "ip", ipCountry: "XX", isVpn: false }), Error });
  return { submit: exports.submit!, read, write, schema, rate };
}
describe("production Televote server recovery adapter", () => {
  it("replays the exact receipt before attempting the legacy mutator", async () => {
    const r = runtime([{ data: receipt, error: null }], null);
    expect(await r.submit(input)).toEqual(receipt);
    expect(r.write).not.toHaveBeenCalled();
    expect(r.schema).toHaveBeenCalledWith("public");
    expect(r.read).toHaveBeenCalledWith("v3_reconcile_televote", { p_preflight_token: "token", p_round_id: "round", p_username: "Voter", p_country_code: "HOME", p_entries: input.entries });
  });
  it("recovers a lost SQL response through the same capability", async () => {
    const r = runtime([{ data: { found: false }, error: null }, { data: receipt, error: null }], { data: null, error: { message: "response lost" } });
    expect(await r.submit(input)).toEqual(receipt);
    expect(r.write).toHaveBeenCalledTimes(1);
    expect(r.write.mock.calls[0][1]).toMatchObject({ p_preflight_token: "token", p_entries: input.entries, p_ip_hash: "ip", p_fingerprint_hash: "fingerprint", p_device_token_hash: "device" });
  });
  it("never treats a network duplicate as this ballot's receipt", async () => {
    const r = runtime([], { data: null, error: { message: "A vote from this network was already recorded" } });
    await expect(r.submit(input)).rejects.toThrow("network was already recorded");
  });
  it("allows successful legacy submission before the receipt migration is deployed", async () => {
    const accepted = { id: "submission", preflight_id: "token", status: "active" };
    const r = runtime([{ data: null, error: { code: "PGRST202" } }, { data: null, error: { code: "PGRST202" } }], { data: accepted, error: null });
    expect(await r.submit(input)).toEqual(accepted);
    expect(r.write).toHaveBeenCalledTimes(1);
  });
  it("rejects a receipt from another preflight and preserves the write rejection", async () => {
    const r = runtime([{ data: { ...receipt, preflight_id: "other" }, error: null }], { data: null, error: { message: "integrity check expired" } });
    await expect(r.submit(input)).rejects.toThrow("integrity check expired");
  });
});
