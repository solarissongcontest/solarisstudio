import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { matchesOrganizerCommandSearch } from "./admin-command-search";

describe("Organizer command palette discovery and accessibility", () => {
  const command = {
    label: "Ørnådal country delegation",
    group: "Countries",
    keywords: "Ålanti country SSC22",
  };

  it("finds canonical international names without diacritics", () => {
    expect(matchesOrganizerCommandSearch("ornadal", command)).toBe(true);
    expect(matchesOrganizerCommandSearch("alanti", command)).toBe(true);
    expect(matchesOrganizerCommandSearch("ØRNÅDAL", command)).toBe(true);
  });

  it("matches unordered terms across command fields, not a single phrase", () => {
    expect(matchesOrganizerCommandSearch("countries 22", command)).toBe(true);
    expect(matchesOrganizerCommandSearch("ssc22 delegation", command)).toBe(true);
    expect(matchesOrganizerCommandSearch("ssc23 delegation", command)).toBe(false);
    expect(matchesOrganizerCommandSearch("", command)).toBe(true);
  });

  it("keeps search operable as a keyboard-accessible modal", () => {
    const source = readFileSync("src/components/admin/AdminCommandPalette.tsx", "utf8");
    expect(source).toContain('role="dialog"');
    expect(source).toContain('aria-modal="true"');
    expect(source).toContain('aria-haspopup="dialog"');
    expect(source).toContain('type="search"');
    expect(source).toContain('event.key !== "Tab"');
    expect(source).toContain("triggerRef.current?.focus()");
    expect(source).toContain("matchesOrganizerCommandSearch(query, item)");
  });
});
