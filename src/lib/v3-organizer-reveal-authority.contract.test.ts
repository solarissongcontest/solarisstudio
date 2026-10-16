import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("src/routes/_authenticated/admin/results-reveal.tsx", "utf8");

describe("V3 Organizer Reveal Director authority boundary", () => {
  it("keeps the current surface in Planning/Rehearsal until governed authority exists", () => {
    expect(source).toContain("Planning / Rehearsal only");
    expect(source).toContain("Live authority unavailable");
    expect(source).toContain("Armed · server authority required");
    expect(source).toContain("Live · server authority required");
    expect(source).toContain("Complete · server authority required");
  });

  it("states that Armed locks the sequence and explicit disarm is required", () => {
    expect(source).toContain("Armed must lock the reveal sequence");
    expect(source).toContain("explicit governed disarm before editing");
  });

  it("does not invent live reveal mutations in the browser", () => {
    expect(source).not.toContain("armReveal");
    expect(source).not.toContain("startReveal");
    expect(source).not.toContain("completeReveal");
    expect(source).not.toContain(".insert(");
    expect(source).not.toContain(".update(");
    expect(source).not.toContain(".delete(");
  });
});
