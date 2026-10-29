import { QueryClient, QueryObserver } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import { confirmationCalendarEditionsQuery, confirmationCalendarQuery } from "./v3-organizer-confirmation-calendar";
import { createAccountCacheIsolationHandler } from "./account-cache-isolation";
import type { ConfirmationCalendarRow } from "@/integrations/confirmations/admin";

const row = (edition: string, round = "round"): ConfirmationCalendarRow => ({
  id: `submission-${edition}`, country: edition, participating: true, selection_method: "internal_selection",
  reveal_date_type: "exact", reveal_exact_date: "2030-01-02", reveal_approximate_text: null,
  nf_date_type: null, nf_exact_date: null, nf_approximate_text: null,
  nf_result_date_type: null, nf_result_exact_date: null, nf_result_approximate_text: null,
  edition_id: edition, round_id: round, edition_name: edition, edition_number: 22,
  round_name: round, nf_name: null,
});
function fixture() {
  let actor = "A";
  let reads = 0;
  const authority = { requireAdmin: async () => actor ? ({ id: actor }) : null, editions: async () => [], calendar: async (edition: string) => { reads++; return [row(edition)]; } };
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  return { authority, client, actor: (id: string) => { actor = id; }, reads: () => reads };
}

describe("canonical Organizer Confirmation calendar read", () => {
  it("rejects absent editions and stale/unauthorized actors before the scoped RPC", async () => {
    const f = fixture();
    try {
      expect(confirmationCalendarQuery("A", "", "", f.authority).enabled).toBe(false);
      await expect(f.client.fetchQuery(confirmationCalendarQuery("A", "", "", f.authority))).rejects.toThrow("exact edition");
      f.actor("B");
      await expect(f.client.fetchQuery(confirmationCalendarQuery("A", "edition", "", f.authority))).rejects.toThrow("account changed");
      f.actor("");
      await expect(f.client.fetchQuery(confirmationCalendarEditionsQuery("A", f.authority))).rejects.toThrow("account changed");
      expect(f.reads()).toBe(0);
    } finally { f.client.clear(); }
  });

  it("rejects rows from another edition/round and duplicate submissions", async () => {
    const f = fixture();
    try {
      for (const rows of [[row("foreign")], [row("edition", "foreign")], [row("edition"), row("edition")]]) {
        const authority = { ...f.authority, calendar: async () => rows };
        await expect(f.client.fetchQuery(confirmationCalendarQuery("A", "edition", "round", authority))).rejects.toThrow(/outside|duplicate/);
      }
    } finally { f.client.clear(); }
  });

  it("switches observed edition immediately and never displays a slow preceding edition response", async () => {
    const f = fixture();
    const complete = new Map<string, (rows: ConfirmationCalendarRow[]) => void>();
    const authority = { ...f.authority, calendar: (edition: string) => new Promise<ConfirmationCalendarRow[]>((resolve) => complete.set(edition, resolve)) };
    const observer = new QueryObserver(f.client, confirmationCalendarQuery("A", "first", "", authority));
    const seen: string[] = [];
    const stop = observer.subscribe((result) => { if (result.data) seen.push(result.data[0].edition_id); });
    try {
      await Promise.resolve(); await Promise.resolve();
      observer.setOptions(confirmationCalendarQuery("A", "second", "", authority));
      expect(observer.getCurrentResult().data).toBeUndefined();
      await Promise.resolve(); await Promise.resolve();
      complete.get("second")!([row("second")]);
      await f.client.fetchQuery(confirmationCalendarQuery("A", "second", "", authority));
      complete.get("first")!([row("first")]);
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(observer.getCurrentResult().data?.[0].edition_id).toBe("second");
      expect(seen).not.toContain("first");
    } finally { stop(); f.client.clear(); }
  });

  it("purges actor-scoped editions/calendar reads and cancels their late completions at account change", async () => {
    const f = fixture();
    const apply = createAccountCacheIsolationHandler(f.client, () => {});
    let resolve!: (rows: ConfirmationCalendarRow[]) => void;
    try {
      apply({ id: "A" });
      const key = confirmationCalendarQuery("A", "edition", "", f.authority).queryKey;
      f.client.setQueryData(confirmationCalendarEditionsQuery("A", f.authority).queryKey, ["A-private-editions"]);
      const pending = f.client.fetchQuery(confirmationCalendarQuery("A", "edition", "", { ...f.authority, calendar: () => new Promise((complete) => { resolve = complete; }) })).catch(() => undefined);
      await Promise.resolve(); await Promise.resolve();
      apply({ id: "B" });
      resolve([row("edition")]);
      await pending;
      expect(f.client.getQueryData(key)).toBeUndefined();
      expect(f.client.getQueryData(confirmationCalendarEditionsQuery("A", f.authority).queryKey)).toBeUndefined();
      expect(confirmationCalendarQuery("B", "edition", "", f.authority).queryKey).not.toEqual(key);
    } finally { f.client.clear(); }
  });
});

it("renders the real Calendar route from only its exact actor/edition identity", async () => {
  const { execFileSync } = await import("node:child_process");
  const report = JSON.parse(execFileSync(process.execPath, ["--env-file=/dev/null", "run", "scripts/fixtures/v3-organizer-confirmation-calendar-proof.tsx"], { encoding: "utf8", env: process.env }));
  expect(report).toEqual({ passed: true, routeCases: 4, exactActorScope: true, noEditionFallback: true, deniedBeforeRead: true, exactRpcParameters: true, networkAttempts: 0 });
});

it("keeps SQL read authority and explicit runtime scope cases in the local maintenance rehearsal", async () => {
  const { readFileSync } = await import("node:fs");
  const source = readFileSync(".github/scripts/v3-confirmation-maintenance-edit-rehearsal.sh", "utf8");
  const sql = readFileSync("supabase/migrations/20261017201000_confirmation_maintenance_postgrest_path_and_reads.sql", "utf8");
  expect(sql).toContain("private.solaris_confirmation_calendar_read_allowed(_edition_id, _round_id)");
  expect(sql).toContain("Missing Solaris capability: confirmation.read");
  for (const assertion of [
    "Calendar exact-edition response cardinality", "Calendar exact response identity",
    "Calendar exact edition identity", "Calendar exact round identity",
    "Calendar excludes a foreign round", "Calendar denies an edition outside the scoped read grant",
    "Calendar denies a participant without Organizer read authority",
    "Calendar null scope cannot widen an edition-only read grant",
  ]) expect(source).toContain(assertion);
  expect(source).toContain("Refusing non-local Confirmation maintenance API");
  expect(source).toContain("Missing Solaris capability: confirmation.read");
  expect(source).toContain("did not fail through canonical read authorization");
  const workflow = readFileSync(".github/workflows/v3-confirmation-maintenance-edit-rehearsal.yml", "utf8");
  expect(workflow).toContain("ref: ${{ github.event.pull_request.head.sha || github.sha }}");
  expect(workflow).toContain("Verify exact feature head");
});
