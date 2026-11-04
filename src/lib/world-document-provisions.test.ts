import { describe, expect, it } from "vitest";

import {
  MAX_WORLD_PROVISIONS_IN_EDITOR,
  addWorldDocumentProvision,
  parseWorldDocumentProvisions,
  toWorldProvisionCommandRows,
  validateWorldDocumentProvisions,
  type WorldDocumentProvision,
} from "./world-document-provisions";

const row = (overrides: Partial<WorldDocumentProvision> = {}): WorldDocumentProvision => ({
  semanticKey: "membership.admission",
  parentSemanticKey: null,
  displayLabel: "Article 4",
  heading: "Membership",
  anchor: "membership-admission",
  bodyPlainText: "Eligibility and application rules.",
  bodyStructured: { links: [{ href: "#membership-admission" }] },
  status: "active",
  ...overrides,
});

describe("TG4 structured legal provision authoring", () => {
  it("round-trips the official projection without inventing durable keys", () => {
    const canonical = parseWorldDocumentProvisions([
      { ...row({ displayLabel: "Article 5" }), sortOrder: 8 },
      { ...row({ semanticKey: "preamble", anchor: "preamble",
        displayLabel: "Preamble", heading: "Foundation" }), sortOrder: 2 },
    ]);
    expect(canonical.map((item) => item.semanticKey)).toEqual([
      "preamble", "membership.admission",
    ]);
    expect(canonical[1].displayLabel).toBe("Article 5");
    expect(canonical[1].bodyStructured).toEqual(row().bodyStructured);
    expect(canonical[1].anchor).toBe("membership-admission");
  });

  it("treats reordered article numbers separately from persistent semantic keys", () => {
    const sections = [
      row({ semanticKey: "preamble", anchor: "preamble", displayLabel: "Preamble" }),
      row(),
    ];
    const payload = toWorldProvisionCommandRows([sections[1], sections[0]]);
    expect(payload.map((item) => [item.semanticKey, item.sortOrder, item.displayLabel])).toEqual([
      ["membership.admission", 0, "Article 4"],
      ["preamble", 1, "Preamble"],
    ]);
  });

  it("blocks duplicated case-sensitive keys and anchors instead of losing rows", () => {
    expect(validateWorldDocumentProvisions([
      row(),
      row({ anchor: "membership-two" }),
    ])).toMatch(/unique/);
    expect(validateWorldDocumentProvisions([
      row(),
      row({ semanticKey: "membership.other" }),
    ])).toMatch(/unique/);
  });

  it("rejects missing parents and loops, including indirect ancestry", () => {
    expect(validateWorldDocumentProvisions([
      row({ parentSemanticKey: "missing" }),
    ])).toMatch(/parent/);
    expect(validateWorldDocumentProvisions([
      row({ parentSemanticKey: "membership.admission" }),
    ])).toMatch(/different/);
    expect(validateWorldDocumentProvisions([
      row({ parentSemanticKey: "article.2" }),
      row({ semanticKey: "article.2", anchor: "article-2", parentSemanticKey: "article.3" }),
      row({ semanticKey: "article.3", anchor: "article-3",
        parentSemanticKey: "membership.admission" }),
    ])).toMatch(/cycle/);
  });

  it("rejects malformed source data, unsupported states and oversized payloads", () => {
    expect(() => parseWorldDocumentProvisions(null)).toThrow();
    expect(() => parseWorldDocumentProvisions([{ semanticKey: "test" }])).toThrow();
    expect(() => parseWorldDocumentProvisions([
      { ...row({ status: "unauthorized" as "active" }), sortOrder: 0 },
    ])).toThrow();
    expect(validateWorldDocumentProvisions([
      row({ semanticKey: "a-1" }),
    ])).toMatch(/stable lowercase key/);
    expect(validateWorldDocumentProvisions([
      row({ anchor: "../unsafe" }),
    ])).toMatch(/anchor/);
    expect(validateWorldDocumentProvisions([
      row({ bodyPlainText: "a".repeat(12001) }),
    ])).toMatch(/invalid/);
    expect(() => toWorldProvisionCommandRows([
      row({ parentSemanticKey: "missing" }),
    ])).toThrow();
  });

  it("bounds the editor, generates available keys and never modifies the existing rows", () => {
    const existing = [row({ semanticKey: "article.1", anchor: "article-1" })];
    const added = addWorldDocumentProvision(existing);
    expect(added).toHaveLength(2);
    expect(added[1].semanticKey).toBe("article.2");
    expect(existing).toHaveLength(1);
    expect(validateWorldDocumentProvisions(new Array(MAX_WORLD_PROVISIONS_IN_EDITOR + 1)
      .fill(row()))).toMatch(/Only 50/);
  });

  it("accepts a retained historical state without silently changing it to active", () => {
    const retained = [row({ status: "repealed", heading: "",
      bodyPlainText: "", bodyStructured: { reason: "amended" } })];
    expect(validateWorldDocumentProvisions(retained)).toBeNull();
    expect(toWorldProvisionCommandRows(retained)[0].status).toBe("repealed");
  });
});
