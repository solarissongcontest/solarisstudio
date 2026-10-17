import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

const projection = () => read("src/lib/v3-pulse.ts");
const registry = () => read("src/lib/v3-public-capability-supplements.ts");
const contract = () => read("docs/v3-public-p20-pulse-contract.md");

describe("Public V3 P20 Pulse contract", () => {
  it("maps Pulse as a retained redesign rather than a discovered placeholder", () => {
    const source = registry();
    expect(source).toContain('id: "pulse"');
    expect(source).toContain('classification: "redesign"');
    expect(source).toContain('specificationStatus: "mapped"');
    expect(source).toContain('acceptanceScenarioId: "public.pulse-v3-public-feed"');
  });

  it("documents the server-authoritative public-event projection blocker", () => {
    const source = contract();
    expect(source).toContain("Organizer permissions must not widen the public projection");
    expect(source).toContain("public Pulse event projection");
    expect(source).toContain("published_at <= now()");
  });

  it("keeps browser storage and clocks out of the V3 Pulse projection authority", () => {
    const source = projection();
    expect(source).not.toContain("localStorage");
    expect(source).not.toContain("sessionStorage");
    expect(source).not.toContain("Date.now");
    expect(source).not.toContain("new Date");
    expect(source).not.toContain("setInterval");
  });

  it("preserves the canonical event and follow projection instead of inventing a parallel feed", () => {
    const source = projection();
    expect(source).toContain("buildPulseInbox");
    expect(source).toContain("event.id");
    expect(source).toContain("readIds.has(event.id)");
  });
});
