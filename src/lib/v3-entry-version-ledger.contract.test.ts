import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = () =>
  readFileSync(resolve(process.cwd(), "src/lib/v3-entry-version-ledger.ts"), "utf8");

describe("Solaris Studio V3 Entry version ledger architecture", () => {
  it("extends the shared immutable binding contract instead of redefining it", () => {
    const ledger = source();

    expect(ledger).toContain('from "./v3-entry-version-binding"');
    expect(ledger).toContain("type V3SubmittedEntryVersion");
    expect(ledger).toContain("type V3EntryReview");
    expect(ledger).not.toContain("export type V3SubmittedEntryVersion");
    expect(ledger).not.toContain("export type V3EntryReview =");
  });

  it("stays pure and cannot become a second database or transport owner", () => {
    const ledger = source();

    for (const forbidden of [
      "@supabase",
      "createClient(",
      "supabase.",
      "fetch(",
      "storage.from",
      "functions.invoke",
      "localStorage",
      "sessionStorage",
      "useEffect(",
      "useMutation(",
      "useQuery(",
    ]) {
      expect(ledger).not.toContain(forbidden);
    }
  });

  it("does not manufacture canonical ids or timestamps on the client", () => {
    const ledger = source();

    expect(ledger).not.toContain("Date.now(");
    expect(ledger).not.toContain("new Date(");
    expect(ledger).not.toContain("randomUUID");
    expect(ledger).not.toContain("crypto.randomUUID");
  });

  it("locks version sequence, parentage and immutable replay semantics", () => {
    const ledger = source();

    expect(ledger).toContain(
      "versionNumber must be the next contiguous Entry version",
    );
    expect(ledger).toContain(
      "new Entry version must descend from the current version",
    );
    expect(ledger).toContain(
      "versionId replay conflicts with persisted immutable Entry history",
    );
  });

  it("locks stale-review rejection and review chronology at persistence time", () => {
    const ledger = source();

    expect(ledger).toContain("evaluateV3EntryReview");
    expect(ledger).toContain(
      "cannot persist a stale Entry review after a newer version exists",
    );
    expect(ledger).toContain(
      "reviewRevision must be the next contiguous revision",
    );
    expect(ledger).toContain(
      "reviewId replay conflicts with persisted Entry review history",
    );
  });

  it("requires explicit restore provenance and exact historical content identity", () => {
    const ledger = source();

    expect(ledger).toContain('"organizer_restore"');
    expect(ledger).toContain("restoredFromVersionId");
    expect(ledger).toContain(
      "restored Entry version must reference existing immutable history",
    );
    expect(ledger).toContain(
      "restored Entry version content hash must match its historical source",
    );
    expect(ledger).toContain(
      "participant submission cannot claim historical restore provenance",
    );
  });
});
