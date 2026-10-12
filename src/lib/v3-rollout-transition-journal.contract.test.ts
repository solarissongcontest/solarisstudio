import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = () =>
  readFileSync(
    resolve(process.cwd(), "src/lib/v3-rollout-transition-journal.ts"),
    "utf8",
  );

describe("Solaris Studio V3 rollout transition journal architecture", () => {
  it("derives history from #509 applied ledger results instead of caller-authored transitions", () => {
    const journal = source();

    expect(journal).toContain('from "./v3-rollout-state-ledger"');
    expect(journal).toContain("V3AppliedRolloutLedgerResult");
    expect(journal).toContain("createV3RolloutTransitionJournalEntry");
    expect(journal).toContain("applied.previous");
    expect(journal).toContain("applied.record");
    expect(journal).not.toContain("requestedFrom");
    expect(journal).not.toContain("requestedTo");
  });

  it("requires a contiguous one-entry-per-revision append-only chain", () => {
    const journal = source();

    expect(journal).toContain("exactly one entry for every persisted revision after zero");
    expect(journal).toContain("contiguous from revision 1");
    expect(journal).toContain("before-state must equal the previous entry after-state");
    expect(journal).toContain("tail must equal the current persisted state");
    expect(journal).toContain("tail must match current.lastChange exactly");
  });

  it("understands observation epoch reset as a same-stage identity-preserving transition", () => {
    const journal = source();

    expect(journal).toContain('entry.kind === "observation_epoch_reset"');
    expect(journal).toContain(
      "observation epoch reset must preserve stage and deployment identity",
    );
  });

  it("requires authoritative monotonic transition time", () => {
    const journal = source();

    expect(journal).toContain("occurredAt must equal after.enteredAt");
    expect(journal).toContain("cannot move backwards in authoritative time");
    expect(journal).toContain("timestamps must be monotonic");
    expect(journal).not.toContain("Date.now(");
    expect(journal).not.toContain("new Date(");
  });

  it("declares atomic append-only persistence without implementing a database", () => {
    const journal = source();

    expect(journal).toContain("V3_ROLLOUT_JOURNAL_PERSISTENCE_CONTRACT");
    expect(journal).toContain("appendOnly: true");
    expect(journal).toContain("oneEntryPerRevision: true");
    expect(journal).toContain("atomicWithLedgerWrite: true");
    expect(journal).toContain("clientMayUpdateOrDeleteHistory: false");
  });

  it("cannot own Supabase, network, browser persistence or polling", () => {
    const journal = source();

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
    ]) {
      expect(journal).not.toContain(forbidden);
    }
  });
});
