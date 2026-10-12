import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = () =>
  readFileSync(
    resolve(process.cwd(), "src/lib/v3-rollout-write-reconciliation.ts"),
    "utf8",
  );

describe("Solaris Studio V3 rollout write reconciliation architecture", () => {
  it("reconciles from #516 write-set + #515 authoritative journal evidence", () => {
    const reconciliation = source();

    expect(reconciliation).toContain('from "./v3-rollout-atomic-write-set"');
    expect(reconciliation).toContain('from "./v3-rollout-transition-journal"');
    expect(reconciliation).toContain("V3RolloutAtomicWriteSet");
    expect(reconciliation).toContain("validateV3RolloutTransitionJournal");
    expect(reconciliation).toContain("sameEntry(authoritativeEntry, input.intended.appendJournalEntry)");
  });

  it("never interprets stale revision alone as proof of commit", () => {
    const reconciliation = source();

    expect(reconciliation).not.toContain("stale_revision");
    expect(reconciliation).toContain("exact intended journal entry owns revision N+1");
    expect(reconciliation).toContain('status: "confirmed_committed"');
    expect(reconciliation).toContain('status: "revision_conflict"');
  });

  it("allows retry only from a complete post-dispatch snapshot still at the expected revision", () => {
    const reconciliation = source();

    expect(reconciliation).toContain("read.ms < dispatch.ms");
    expect(reconciliation).toContain("currentRevision === intended.expectedRevision");
    expect(reconciliation).toContain('status: "retry_allowed"');
    expect(reconciliation).toContain("authoritativeReadAt cannot be before");
  });

  it("preserves commit evidence even after later rollout revisions", () => {
    const reconciliation = source();

    expect(reconciliation).toContain(
      "superseded: currentRevision > intended.committedRevision",
    );
    expect(reconciliation).toContain("laterRevisionsDoNotEraseCommitEvidence: true");
  });

  it("validates the intended write-set before using it as reconciliation evidence", () => {
    const reconciliation = source();

    expect(reconciliation).toContain("validateIntendedWriteSet");
    expect(reconciliation).toContain("advance ledger revision exactly once");
    expect(reconciliation).toContain("bridge the exact expected and next ledger revisions");
    expect(reconciliation).toContain("after-state must equal the intended next ledger state");
    expect(reconciliation).toContain("must exactly match next ledger lastChange");
  });

  it("fails closed on invalid authoritative ledger/journal snapshots", () => {
    const reconciliation = source();

    expect(reconciliation).toContain('status: "integrity_conflict"');
    expect(reconciliation).toContain(
      "Authoritative journal is missing the revision needed to reconcile",
    );
    expect(reconciliation).toContain(
      "Authoritative rollout snapshot is older than the revision used to dispatch",
    );
  });

  it("cannot own persistence, network retries, browser state, polling or client time", () => {
    const reconciliation = source();

    for (const forbidden of [
      "@supabase",
      "createClient(",
      "supabase.",
      ".from(",
      "fetch(",
      "localStorage",
      "sessionStorage",
      "useEffect(",
      "useQuery(",
      "useMutation(",
      "setInterval(",
      "setTimeout(",
      "Date.now(",
      "new Date(",
    ]) {
      expect(reconciliation).not.toContain(forbidden);
    }
  });
});
