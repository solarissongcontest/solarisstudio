import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const route = readFileSync("src/routes/encyclopedia/index.tsx", "utf8");

describe("Chat 2 Reference knowledge topics", () => {
  it("offers real Stories and Official rules as selectable Reference topics", () => {
    expect(route).toContain('type Kind = "all" | ResultKind | "story" | "rule"');
    expect(route).toContain('story: "Stories"');
    expect(route).toContain('rule: "Official rules"');
    expect(route).toContain('kind: "story", label: "Stories"');
    expect(route).toContain('kind: "rule", label: "Official rules"');
    expect(route).toContain('href: "/stories"');
    expect(route).toContain('href: "/rules"');
    expect(route).toContain("kind === \"all\" || destination.kind === kind");
  });

  it("never invents searchable article records or performs unsupported topic RPC queries", () => {
    expect(route).toContain('const dedicatedTopicOnly = kind === "story" || kind === "rule"');
    expect(route).toContain("enabled: feature.data === true && !dedicatedTopicOnly");
    expect(route).toContain('normalizedQuery.length === 0 || dedicatedTopicOnly');
    expect(route).toContain("bounded Reference record search does not index this topic");
    expect(route).toContain('role="status"');
    expect(route).toContain('"solaris_public_search"');
    expect(route).toContain("result_limit: 50");
    expect(route).toContain("parseSearchRows(data)");
    expect(route).not.toContain('from("stories")');
    expect(route).not.toContain('from("rules")');
  });

  it("preserves accessible filtering in installed app, mobile browser and desktop browser", () => {
    expect(route).toContain('aria-label="Filter Reference by topic"');
    expect(route).toContain('aria-label="Filter Reference"');
    expect(route).toContain('aria-label="Filter Reference"');
    expect(route).toContain('aria-pressed={kind === value}');
    expect(route).toContain("setKind(event.target.value as Kind)");
    expect(route).toContain("KINDS.map((value)");
  });
});
