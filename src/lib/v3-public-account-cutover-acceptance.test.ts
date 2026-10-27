import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { ModuleKind, transpileModule } from "typescript";
import { describe, expect, it, vi } from "vitest";
import { resolveV3AuthReturnPath, v3AuthReturnRequiresOrganizer } from "./v3-auth-return-intent";
import { publicUxTelemetryAllowed, sanitizePublicUxPath, sanitizePublicUxTarget } from "./public-ux-privacy";
import { V3_PUBLIC_CAPABILITY_REGISTRY } from "./v3-public-capability-registry";
import { V3_PUBLIC_ROUTE_DISCOVERED_CAPABILITIES } from "./v3-public-capability-supplements";
import { BetaScreenshotValidationError, publicBetaFeedbackErrorMessage } from "./public-beta-feedback-safety";

/** Execute production adapters with an isolated transport. No Supabase client,
 * browser environment, credentials or network implementation enters the VM. */
function moduleWith(path: string, bindings: Record<string, unknown>) {
  const exports: Record<string, unknown> = {};
  const code = transpileModule(readFileSync(path, "utf8").replace(/^import[\s\S]*?;\n/gm, ""), {
    compilerOptions: { module: ModuleKind.CommonJS },
  }).outputText;
  runInNewContext(code, { exports, ...bindings });
  return exports;
}

describe("accepted Public account/preference and optional UX families", () => {
  it("accepts exactly the audited account/preference and restricted UX capabilities with their executable owner proof", () => {
    const capabilities = [...V3_PUBLIC_CAPABILITY_REGISTRY, ...V3_PUBLIC_ROUTE_DISCOVERED_CAPABILITIES];
    for (const id of ["predictions", "prediction-league", "saved-items", "fan-public-identity", "me-route", "authentication", "public-ux-diagnostics", "beta-test-feedback"]) {
      const row = capabilities.find((capability) => capability.id === id);
      expect(row?.specificationStatus, id).toBe("cutover");
      expect(row && "migrationEvidence" in row ? row.migrationEvidence : undefined, id).toContain("v3-public-account-cutover-acceptance.test.ts");
    }
  });
  it("renders actual Predictions, League and Saved screens with canonical state and account-private boundaries", () => {
    const report = JSON.parse(execFileSync(process.execPath, ["--env-file=/dev/null", "run", "scripts/fixtures/v3-public-account-screen-proof.tsx"], { encoding: "utf8", env: process.env }));
    expect(report).toEqual({ passed: true, routeCases: 5, privateHistoryFailClosed: true, canonicalRoundState: true, scopedPreferences: true, networkAttempts: 0 });
  });
  it("executes the actual public league read adapter, using only its public edition-scoped aggregate RPC", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [{ profileId: "public-opt-in", displayName: "Public name", score: "24", rounds: "2", position: "1", lastScoredAt: null }], error: null });
    const module = moduleWith("src/lib/prediction-league-data.ts", { supabase: { rpc }, useQuery: (options: unknown) => options });
    const useStandings = module.usePredictionLeagueStandings as (enabled: boolean, editionId: string) => { enabled: boolean; queryKey: unknown[]; queryFn(): Promise<unknown> };
    const query = useStandings(true, "edition-22");
    expect(query.queryKey).toEqual(["prediction-league", "edition-22"]);
    expect(await query.queryFn()).toEqual([{ profileId: "public-opt-in", displayName: "Public name", score: 24, rounds: 2, position: 1, lastScoredAt: null }]);
    expect(rpc).toHaveBeenCalledWith("prediction_league_leaderboard", { _edition_id: "edition-22" });
    expect(useStandings(false, "edition-22").enabled).toBe(false);
    rpc.mockResolvedValueOnce({ data: null, error: new Error("unavailable") });
    await expect(query.queryFn()).rejects.toThrow("unavailable");
  });

  it("executes the actual follow hooks with actor-scoped reads, actor-free canonical writes and scoped invalidation", async () => {
    const readScopes: unknown[][] = [];
    const rpc = vi.fn().mockResolvedValue({ data: { following: true }, error: null });
    const invalidateQueries = vi.fn().mockResolvedValue(undefined);
    const queryBuilder = {
      select() { return this; },
      eq(key: string, value: string) { readScopes.push([key, value]); return this; },
      async order() { return { data: [], error: null }; },
    };
    const module = moduleWith("src/lib/engagement-data.ts", {
      baseSupabase: { from(name: string) { expect(name).toBe("fan_follows"); return queryBuilder; }, rpc },
      useQuery: (options: unknown) => options, useMutation: (options: unknown) => options,
      useQueryClient: () => ({ invalidateQueries }), missingEngagementSchema: () => false,
    });
    const useMyFollows = module.useMyFollows as (profileId?: string) => { enabled: boolean; queryKey: unknown[]; queryFn(): Promise<unknown> };
    const read = useMyFollows("actor-A");
    expect(read.queryKey).toEqual(["fan-follows", "actor-A"]);
    await read.queryFn();
    expect(readScopes).toEqual([["profile_id", "actor-A"]]);
    expect(useMyFollows().enabled).toBe(false);
    const useWriter = module.useSetFanFollow as (profileId?: string) => { mutationFn(input: unknown): Promise<unknown>; onSuccess(): Promise<void> };
    const writer = useWriter("actor-A");
    const input = { entityType: "country", entityId: "country-A", following: true, notificationLevel: "important" };
    await writer.mutationFn(input);
    expect(rpc).toHaveBeenCalledWith("set_fan_follow", { _entity_type: "country", _entity_id: "country-A", _following: true, _notification_level: "important" });
    await writer.onSuccess();
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ["fan-follows", "actor-A"] });
    await expect(useWriter().mutationFn(input)).rejects.toThrow("Sign in");
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("executes the actual sign-in destination policy with server-resolved Organizer access", async () => {
    const source = readFileSync("src/routes/auth/index.tsx", "utf8");
    const match = source.match(/const destinationFor = (async \(userId: string\) => \{[\s\S]*?\n {2}\});/);
    expect(match).not.toBeNull();
    async function destination(redirect: string, isOrganizer: boolean) {
      const safeRedirect = resolveV3AuthReturnPath(redirect);
      const getCurrentAccountAccess = vi.fn(async (id: string) => { expect(id).toBe("signed-in-actor"); return { isOrganizer }; });
      const exports: { destinationFor?: (id: string) => Promise<string> } = {};
      runInNewContext(transpileModule(`exports.destinationFor = ${match![1]};`, { compilerOptions: { module: ModuleKind.CommonJS } }).outputText,
        { exports, safeRedirect, getCurrentAccountAccess, v3AuthReturnRequiresOrganizer });
      return exports.destinationFor!("signed-in-actor");
    }
    expect(await destination("/admin/results", false)).toBe("/my-solaris");
    expect(await destination("/admin/results", true)).toBe("/admin/results");
    expect(await destination("/participate?task=entry#review", false)).toBe("/participate?task=entry#review");
    expect(await destination("https://foreign.invalid", false)).toBe("/my-solaris");
  });

  it("executes the real optional telemetry producer with privacy redaction and stops after a rejected write", async () => {
    const payloads: Record<string, unknown>[] = [];
    const storage = new Map<string, string>();
    const insert = vi.fn(async (payload: Record<string, unknown>) => { payloads.push(payload); return { error: new Error("read only") }; });
    const navigator = { webdriver: false, doNotTrack: "1", globalPrivacyControl: false };
    const module = moduleWith("src/lib/public-ux-events.ts", {
      supabase: { from(name: string) { expect(name).toBe("public_ux_events"); return { insert }; } },
      publicUxTelemetryAllowed, sanitizePublicUxPath, sanitizePublicUxTarget,
      crypto: { randomUUID: () => "local-optional-session" },
      window: { navigator, innerWidth: 375, location: { pathname: "/me/123e4567-e89b-42d3-a456-426614174000?token=private" },
        localStorage: { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value), removeItem: (key: string) => storage.delete(key) } },
    });
    const track = module.trackPublicUxEvent as (name: string, options?: unknown) => void;
    track("search_submitted");
    expect(insert).not.toHaveBeenCalled();
    navigator.doNotTrack = "0";
    navigator.globalPrivacyControl = true;
    track("search_submitted");
    expect(insert).not.toHaveBeenCalled();
    navigator.globalPrivacyControl = false;
    track("search_submitted", { target: "/results?query=private", metadata: { query_length: 4, raw_query: "private", message_body: "private", elapsed_ms: -20 } });
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(payloads[0]).toMatchObject({ pathname: "/me/:id", target: "/results", metadata: { query_length: 4, elapsed_ms: 0 } });
    expect(JSON.stringify(payloads)).not.toContain("private");
    track("search_submitted");
    expect(insert).toHaveBeenCalledTimes(1);
  });

  it("executes the real screenshot owner with typed local validation and redacts a failed upload's backend error", async () => {
    const uploadVerifiedFile = vi.fn().mockRejectedValue(new Error("RLS secret: not a supported image type"));
    const module = moduleWith("src/lib/beta-feedback-upload.ts", { supabase: {}, uploadVerifiedFile, BetaScreenshotValidationError });
    const upload = module.uploadBetaFeedbackScreenshot as (input: unknown) => Promise<string>;
    for (const file of [
      { name: "private.png", type: "application/octet-stream", size: 1 },
      { name: "private.png", type: "image/png", size: 0 },
      { name: "private.png", type: "image/png", size: 5 * 1024 * 1024 + 1 },
    ]) {
      let rejected: unknown;
      try { await upload({ submissionId: "local-submission", bugId: "local-bug", file }); }
      catch (error) { rejected = error; }
      expect(rejected).toBeInstanceOf(BetaScreenshotValidationError);
      expect(publicBetaFeedbackErrorMessage(rejected)).toContain("Screenshot");
    }
    expect(uploadVerifiedFile).not.toHaveBeenCalled();
    let backendFailure: unknown;
    try { await upload({ submissionId: "local-submission", bugId: "local-bug", file: { name: "private.png", type: "image/png", size: 1024 } }); }
    catch (error) { backendFailure = error; }
    expect(uploadVerifiedFile).toHaveBeenCalledTimes(1);
    expect(publicBetaFeedbackErrorMessage(backendFailure)).toContain("Your draft is still saved");
    expect(publicBetaFeedbackErrorMessage(backendFailure)).not.toContain("RLS secret");
  });

  it("exposes only locally typed screenshot validation while arbitrary backend lookalikes keep drafts and errors private", () => {
    for (const reason of ["unsupported-type", "empty", "too-large"] as const) {
      const local = new BetaScreenshotValidationError(reason, "my-image.png");
      expect(publicBetaFeedbackErrorMessage(local)).toBe(local.message);
    }
    for (const error of [new Error("secret bucket screenshot is empty"), new Error("RLS secret: not a supported image type"), new Error("internal secret larger than 5 mb"), { message: "Screenshot “test” is empty." }]) {
      const visible = publicBetaFeedbackErrorMessage(error);
      expect(visible).toContain("Your draft is still saved");
      expect(visible).not.toMatch(/secret|RLS|bucket/);
    }
  });
});
