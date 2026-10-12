import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = () =>
  readFileSync(resolve(process.cwd(), "src/lib/v3-primary-surface-bootstrap.ts"), "utf8");

describe("Solaris Studio V3 primary surface bootstrap architecture", () => {
  it("stacks on the shared server bootstrap and passes one loaded snapshot through its validator", () => {
    const adapter = source();

    expect(adapter).toContain("loadV3BootstrapProjection");
    expect(adapter).toContain("normalizeV3BootstrapServerRequest");
    expect(adapter).toContain("const snapshot = await source.loadSnapshot(normalizedRequest)");
    expect(adapter).toContain("return snapshot");
    expect(adapter).toContain("zero-I/O adapter");
  });

  it("shares the exact bootstrap object across Home and Participate", () => {
    const adapter = source();

    expect(adapter).toContain("home: {");
    expect(adapter).toContain("participate: {");
    expect(adapter.match(/\n\s+bootstrap,/g)?.length).toBeGreaterThanOrEqual(3);
  });

  it("requires Home supplemental sections from the same server snapshot", () => {
    const adapter = source();

    expect(adapter).toContain("snapshot.primarySurfaces.upcoming");
    expect(adapter).toContain("snapshot.primarySurfaces.latest");
    expect(adapter).toContain("must be supplied by the shared server snapshot");
    expect(adapter).not.toContain("upcoming ?? []");
    expect(adapter).not.toContain("latest ?? []");
  });

  it("cannot acquire its own Supabase/network/query ownership", () => {
    const adapter = source();

    for (const forbidden of [
      "@supabase",
      "createClient(",
      "supabase.",
      "fetch(",
      "useQuery(",
      "useMutation(",
      "useEffect(",
      "setInterval(",
      "setTimeout(",
      "localStorage",
      "sessionStorage",
    ]) {
      expect(adapter).not.toContain(forbidden);
    }
  });

  it("does not manufacture current contest state or client time", () => {
    const adapter = source();

    expect(adapter).toContain("snapshot.publicContest");
    expect(adapter).not.toContain("resolvePublicContestState");
    expect(adapter).not.toContain("Date.now(");
    expect(adapter).not.toContain("new Date(");
  });

  it("does not import React components into the server projection layer", () => {
    const adapter = source();

    expect(adapter).not.toContain("components/v3");
    expect(adapter).not.toContain("react");
    expect(adapter).not.toContain("V3HomeScreen");
    expect(adapter).not.toContain("V3ParticipateScreen");
  });
});
