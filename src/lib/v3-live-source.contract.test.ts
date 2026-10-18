import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("Public V3 Live source contract", () => {
  it("uses one focused server boundary instead of browser-owned archive fanout", () => {
    const source = read("src/integrations/v3/live-source.server.ts");
    const fn = read("src/lib/v3-live.functions.ts");

    expect(fn).toContain('createServerFn({ method: "GET" })');
    expect(fn).toContain("loadV3LiveBundle");
    expect(source).toContain("public_safe_participants");
    expect(source).toContain('.eq("edition_id", edition.id)');
    expect(source).toContain("preferredShowModeShow");
    expect(source).not.toContain("useAllParticipants");
    expect(source).not.toContain("useAllShows");
    expect(source).not.toContain("useCountries");
  });

  it("rejects terminal edition fallback instead of resurrecting archived Live", () => {
    const source = read("src/integrations/v3/live-source.server.ts");

    expect(source).toContain("activeLiveEdition(editions)");
    expect(source).toContain("normalizeLegacyEditionStatus(edition.status)");
    expect(source).toContain('lifecycle === "post_edition" || lifecycle === "archived" ? null : edition');
    expect(source).toContain("if (!edition)");
    expect(source).not.toContain("const edition = resolveCurrentPublicEdition(editions);");
  });

  it("uses canonical show publication and linked voting state", () => {
    const source = read("src/integrations/v3/live-source.server.ts");
    const projection = read("src/lib/v3-live.ts");

    expect(source).toContain("resolveShowPublication(input.show).running_order");
    expect(source).toContain("showModeConfig(show).televoteRoundId");
    expect(source).toContain('.schema("televoting")');
    expect(projection).toContain("resolveShowCompanionState");
    expect(projection).not.toContain("setInterval");
    expect(projection).not.toContain("Date.now()");
  });

  it("does not fabricate current performance when no canonical cursor exists", () => {
    const projection = read("src/lib/v3-live.ts");

    expect(projection).toContain(
      "intentionally leaves current/next/progress absent",
    );
    expect(projection).not.toContain("currentPerformance:");
    expect(projection).not.toContain("nextPerformance:");
    expect(projection).not.toContain("progress:");
  });

  it("bounds foreground refresh to active states only", () => {
    const runtime = read("src/lib/v3-live-runtime.ts");

    expect(runtime).toContain("ACTIVE_LIVE_STATES");
    expect(runtime).toContain("30_000");
    expect(runtime).toContain("refetchIntervalInBackground: false");
    expect(runtime).toContain("refetchOnReconnect: true");
    expect(runtime).toContain("return state && ACTIVE_LIVE_STATES.has(state) ? 30_000 : false");
  });

  it("never exposes a mutation path from the Public Live projection", () => {
    const combined = [
      read("src/integrations/v3/live-source.server.ts"),
      read("src/lib/v3-live.functions.ts"),
      read("src/lib/v3-live-runtime.ts"),
      read("src/lib/v3-live.ts"),
    ].join("\n");

    expect(combined).not.toContain(".insert(");
    expect(combined).not.toContain(".update(");
    expect(combined).not.toContain(".delete(");
    expect(combined).not.toContain(".upsert(");
    expect(combined).not.toContain("service_role");
  });
});
