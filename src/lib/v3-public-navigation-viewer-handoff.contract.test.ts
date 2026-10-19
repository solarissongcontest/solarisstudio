import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const shell = () => readFileSync("src/components/v3/V3AppShell.tsx", "utf8");

describe("V3 public navigation viewer handoff", () => {
  it("quarantines the still-mounted route when resolved viewer identity changes", () => {
    const code = shell();
    const effectStart = code.indexOf("useEffect(() => {");
    const destinationsStart = code.indexOf("const navigationDestinations", effectStart);
    const memoryEffect = code.slice(effectStart, destinationsStart);

    expect(code).toContain('const resolvedViewerKey = navigationScope ?? "anonymous"');
    expect(code).toContain(
      "const previousResolvedViewerKeyRef = useRef<string | undefined>(undefined)",
    );
    expect(memoryEffect).toContain(
      "const previousViewerKey = previousResolvedViewerKeyRef.current",
    );
    expect(memoryEffect).toContain(
      "previousResolvedViewerKeyRef.current = resolvedViewerKey",
    );
    expect(memoryEffect).toContain(
      "previousViewerKey !== undefined && previousViewerKey !== resolvedViewerKey",
    );

    const quarantine = memoryEffect.indexOf("previousViewerKey !== undefined");
    expect(quarantine).toBeGreaterThanOrEqual(0);
    expect(quarantine).toBeLessThan(
      memoryEffect.indexOf("consumeV3PublicNavigationRestore("),
    );
    expect(quarantine).toBeLessThan(memoryEffect.indexOf("rememberV3PublicLocation("));
  });

  it("keeps initial resolved bootstrap eligible for normal tab memory", () => {
    const code = shell();
    expect(code).toContain(
      "previousViewerKey !== undefined && previousViewerKey !== resolvedViewerKey",
    );
    expect(code).not.toContain("previousViewerKey !== resolvedViewerKey) return;");
  });

  it("invalidates direct Liquid interaction when viewer authority changes", () => {
    const code = shell();
    expect(code).toContain("const navigationInteractionKey = navigationIdentityReady");
    expect(code).toContain('(navigationScope ?? "anonymous")');
    expect(code).toContain(': "resolving"');
    expect(code).toContain("key={navigationInteractionKey}");
    expect(code).not.toContain("key={navigationScope}");
  });
});
