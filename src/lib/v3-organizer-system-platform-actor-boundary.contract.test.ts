import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const system = readFileSync("src/routes/_authenticated/admin/system.tsx", "utf8");

describe("Organizer platform-mode actor and review boundary", () => {
  it("isolates the platform snapshot cache and requires a fresh actor-bound read", () => {
    expect(system).toContain('queryKey: ["platform-operational-state", actorId]');
    expect(system).toContain("enabled: Boolean(actorId),");
    expect(system).toContain("gcTime: 0,");
    expect(system).toContain('refetchOnMount: "always"');
    expect(system).toContain("platformQuery.isSuccess && !platformQuery.isFetching && !platformQuery.error");
    expect(system).toContain("platformQuery.isPending || platformQuery.isFetching");
    expect(system).toContain("const allowedPlatformModes = verifiedPlatform ?");
    expect(system).not.toContain('queryKey: ["platform-operational-state"],');
  });

  it("captures and invalidates the requesting actor for every high-risk review", () => {
    expect(system).toContain("actorId: string;\n  preview: PlatformModeChangePreview;");
    expect(system).toContain("const liveActorRef = useRef(actorId);");
    expect(system).toContain("liveActorRef.current = actorId;");
    expect(system).toContain("actorId: reviewedActorId,");
    expect(system).toContain("reviewedActorId !== liveActorRef.current");
    expect(system).toContain("pending.actorId === liveActorRef.current");
    expect(system).toContain("pending.actorId === liveActorRef.current &&");
    expect(system).toContain("livePlatformVerifiedRef.current");
    expect(system).toContain("setPendingModeChange(null);");
    expect(system).toContain("setPlatformPassword(\"\");");
  });

  it("preserves server version, recovery and R3 reauthentication authority", () => {
    expect(system).toContain("await reauthenticatePlatformR3(password);");
    expect(system).toContain("return applyPlatformModeChange({");
    expect(system).toContain("preview: pending.preview,");
    expect(system).toContain("operationId: pending.operationId,");
    expect(system).toContain("idempotencyKey: pending.idempotencyKey,");
    expect(system).toContain("exitPreflightId: pending.exitPreflight?.id ?? null,");
    expect(system).toContain("runExitPreflight({ data: { targetMode } })");
    expect(system).toContain('queryClient.invalidateQueries({ queryKey: ["platform-operational-state"] })');
  });
});
