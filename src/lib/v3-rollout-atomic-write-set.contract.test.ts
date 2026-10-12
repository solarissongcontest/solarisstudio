import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = () =>
  readFileSync(
    resolve(process.cwd(), "src/lib/v3-rollout-atomic-write-set.ts"),
    "utf8",
  );

describe("Solaris Studio V3 rollout atomic write-set architecture", () => {
  it("composes #509 ledger mutations with #515 journal validation instead of redefining either", () => {
    const atomic = source();

    expect(atomic).toContain('from "./v3-rollout-state-ledger"');
    expect(atomic).toContain('from "./v3-rollout-transition-journal"');
    expect(atomic).toContain("applyV3RolloutPromotion");
    expect(atomic).toContain("applyV3RolloutRollback");
    expect(atomic).toContain("applyV3RolloutObservationEpochReset");
    expect(atomic).toContain("validateV3RolloutTransitionJournal");
    expect(atomic).toContain("appendV3RolloutTransitionJournal");
    expect(atomic).not.toContain("evaluateV3RolloutTransition");
  });

  it("validates the complete ledger/journal snapshot before dispatching a mutation", () => {
    const atomic = source();
    const integrityCheck = atomic.indexOf(
      "validateV3RolloutTransitionJournal(input.journal, input.current)",
    );
    const promotion = atomic.indexOf("applyV3RolloutPromotion({");

    expect(integrityCheck).toBeGreaterThan(-1);
    expect(promotion).toBeGreaterThan(integrityCheck);
    expect(atomic).toContain('status: "integrity_conflict"');
  });

  it("emits one database write-set only for an already-applied domain transition", () => {
    const atomic = source();

    expect(atomic).toContain("V3AppliedRolloutLedgerResult");
    expect(atomic).toContain("expectedCurrentRevision");
    expect(atomic).toContain("nextLedger");
    expect(atomic).toContain("appendJournalEntry");
    expect(atomic).toContain("writeSet: null");
    expect(atomic).toContain("There is deliberately no valid partial-write interpretation");
  });

  it("requires the journal append and ledger replacement to share the same revision boundary", () => {
    const atomic = source();

    expect(atomic).toContain(
      "input.applied.previous.revision !== input.current.revision",
    );
    expect(atomic).toContain(
      "appended.previousRevision !== input.current.revision",
    );
    expect(atomic).toContain("expectedCurrentRevision: input.current.revision");
  });

  it("keeps stale, blocked and integrity-conflict outcomes write-free", () => {
    const atomic = source();

    for (const status of ["stale_revision", "blocked", "integrity_conflict"]) {
      expect(atomic).toContain(`status: "${status}"`);
    }
    expect(atomic.match(/writeSet: null/g)?.length ?? 0).toBeGreaterThanOrEqual(4);
  });

  it("declares transaction semantics without implementing persistence", () => {
    const atomic = source();

    expect(atomic).toContain("V3_ROLLOUT_ATOMIC_WRITE_REQUIREMENTS");
    expect(atomic).toContain("replaceLedgerAndAppendJournalTogether: true");
    expect(atomic).toContain("rejectPartialCommit: true");
    expect(atomic).toContain("databaseTransactionRequired: true");
  });

  it("cannot own Supabase, network, browser state, polling or client time", () => {
    const atomic = source();

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
      expect(atomic).not.toContain(forbidden);
    }
  });
});
