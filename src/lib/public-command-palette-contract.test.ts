import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("public command palette contract", () => {
  const palette = source("src/components/public/PublicCommandPalette.tsx");
  const shell = source("src/components/AppShell.tsx");

  it("keeps the keyboard palette and focus-return behavior", () => {
    expect(palette).toContain('event.key.toLowerCase() === "k"');
    expect(palette).toContain('event.key === "Escape"');
    expect(palette).toContain("triggerRef.current?.focus()");
  });

  it("offers the planned quick actions", () => {
    for (const label of [
      "Open current edition",
      "Continue confirmation",
      "Open my country",
      "Go to latest results",
      "Compare countries",
    ]) {
      expect(palette).toContain(label);
    }
    expect(palette).toContain('group: "Actions"');
    expect(shell).toContain("<PublicCommandPalette access={access} />");
  });

  it("keeps action search inside the same privacy-safe search telemetry", () => {
    expect(palette).toContain('source: result.group === "Actions" ? "action"');
    expect(palette).not.toContain("query_text");
    expect(palette).not.toContain("raw_query");
  });
});
