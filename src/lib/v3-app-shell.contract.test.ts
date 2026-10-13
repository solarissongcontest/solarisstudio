import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("V3 app shell migration contract", () => {
  it("keeps the five stable product areas and existing canonical routes", () => {
    const shell = source("src/components/v3/V3AppShell.tsx");

    for (const destination of [
      ['home', '/', 'Home'],
      ['explore', '/explore', 'Explore'],
      ['participate', '/participate', 'Participate'],
      ['results', '/results', 'Results'],
      ['me', '/my-solaris', 'Me'],
    ] as const) {
      const [id, to, label] = destination;
      expect(shell).toContain(`id: "${id}", label: "${label}", to: "${to}"`);
    }
  });

  it("keeps Participate attention scoped while Notifications reuses the shared attention summary", () => {
    const shell = source("src/components/v3/V3AppShell.tsx");

    expect(shell).toContain('id === "participate" ? participateAttentionCount : 0');
    expect(shell).toContain('attentionCount > 9 ? "9+" : attentionCount');
    expect(shell).toContain("const attention = useAppAttentionSummary()");
    expect(shell).toContain('attention.me > 9 ? "9+" : attention.me');
    expect(shell).not.toContain("localStorage");
    expect(shell).not.toContain("sessionStorage");
  });

  it("does not put essential navigation behind gesture-only handlers", () => {
    const shell = source("src/components/v3/V3AppShell.tsx");

    expect(shell).toContain('aria-label="Primary app navigation"');
    expect(shell).toContain('aria-current={active ? "page" : undefined}');
    expect(shell).not.toContain("onPointerMove");
    expect(shell).not.toContain("onTouchMove");
    expect(shell).not.toContain("onLongPress");
  });
});