import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Organizer Confirmation review must be read-only on open", () => {
  const source = readFileSync("src/routes/confirmations/admin/responses/$id.tsx", "utf8");

  it("never runs privileged Solaris reconciliation in the response load callback", () => {
    const loadStart = source.indexOf("const load = useCallback(async () => {");
    const loadEnd = source.indexOf("\n  useEffect(() => {", loadStart);
    expect(loadStart).toBeGreaterThan(-1);
    expect(loadEnd).toBeGreaterThan(loadStart);
    const loadBody = source.slice(loadStart, loadEnd);
    expect(loadBody).not.toContain("syncSnapshot(");
    expect(loadBody).not.toContain("syncToSolaris(");
    expect(loadBody).not.toContain("syncConfirmationSnapshotToSolaris(");
  });

  it("retains a deliberate, user-triggered reconciliation path", () => {
    expect(source).toContain("async function manualSync()");
    expect(source).toContain("const result = await syncSnapshot(data);");
    expect(source).toContain("onClick={() => void manualSync()}");
    expect(source).toContain('title="Sync with Solaris Studio"');
  });

  it("does not tie read-only data loading to mutation callback identity", () => {
    expect(source).toContain("}, [id, loadTechnical, navigate]);");
    expect(source).not.toContain("}, [id, loadTechnical, navigate, syncSnapshot]);");
  });
});
