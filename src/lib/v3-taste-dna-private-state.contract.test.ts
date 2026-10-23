import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

const boundary = source("src/routes/taste-dna.tsx");
const runtime = source("src/routes/taste-dna/index.tsx");

describe("Taste DNA private-state boundary", () => {
  it("resolves session and caller-owned history before mounting the existing editor", () => {
    expect(boundary).toContain("const session = useFanSession()");
    expect(boundary).toContain("const viewerId = session.data?.id ?? null");
    expect(boundary).toContain("useTasteBallots(viewerId ?? undefined)");
    expect(boundary).toContain("resolveV3TasteDnaPrivateState({");
    expect(boundary).toContain('state === "anonymous" || state === "ready"');
    expect(boundary).toContain("return <Outlet />");
  });

  it("fails closed instead of treating an unresolved private ballot as empty", () => {
    expect(boundary).toContain('data-v3-taste-dna-private-state="error"');
    expect(boundary).toContain("Editing stays unavailable");
    expect(boundary).toContain("privateHistory.refetch()");
    expect(boundary).toContain("session.refetch()");
  });

  it("keeps one Taste DNA controller/runtime instead of duplicating the expensive analysis tree", () => {
    for (const token of [
      "useEditions(",
      "useResults(",
      "useJuryVotes(",
      "useSaveTasteBallot(",
      "useDeleteTasteBallot(",
      "buildV3TasteDnaAnalysis(",
    ]) {
      expect(runtime).toContain(token);
      expect(boundary).not.toContain(token);
    }
    expect(boundary).not.toContain("V3TasteDnaScreen");
  });

  it("preserves anonymous temporary analysis and accessible non-drag ranking controls", () => {
    expect(boundary).toContain('state === "anonymous"');
    expect(runtime).toContain('aria-label={`Move ${display?.name ?? "entry"} up`}');
    expect(runtime).toContain('aria-label={`Move ${display?.name ?? "entry"} down`}');
    expect(runtime).not.toContain("Date.now()");
  });

  it("does not invent local persistence or an alternate publication authority", () => {
    expect(boundary).not.toContain("localStorage");
    expect(boundary).not.toContain("sessionStorage");
    expect(boundary).not.toContain("supabase");
    expect(boundary).not.toContain("resolveShowPublication");
    expect(runtime).toContain("resolveShowPublication(show)");
  });
});
