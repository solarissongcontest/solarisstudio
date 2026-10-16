import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

const rehearsal = source(".github/scripts/v3-s11-database-restore-rehearsal.sh");
const databaseRunbook = source("docs/runbooks/database-restore.md");
const storageRunbook = source("docs/runbooks/storage-restore.md");
const deploymentRunbook = source("docs/runbooks/deployment-rollback.md");
const fullRecoveryRunbook = source("docs/runbooks/full-service-recovery.md");

describe("System V3 S11 recovery foundation", () => {
  it("hard-refuses destructive database rehearsal outside loopback/local Supabase", () => {
    expect(rehearsal).toContain("refusing non-local database restore rehearsal");
    expect(rehearsal).toContain("127.0.0.1");
    expect(rehearsal).toContain("localhost");
    expect(rehearsal).not.toContain("supabase.co");
  });

  it("performs an actual dump/restore into a separate local database", () => {
    expect(rehearsal).toContain("pg_dump");
    expect(rehearsal).toContain("pg_restore");
    expect(rehearsal).toContain("create database");
    expect(rehearsal).toContain("v3_s11_rehearsal.restore_sentinel");
    expect(rehearsal).toContain("--exit-on-error");
  });

  it("verifies critical canonical truth rather than accepting process exit alone", () => {
    for (const relation of [
      "public.editions",
      "public.shows",
      "public.participants",
      "public.entries",
      "public.jury_votes",
      "public.televote_votes",
      "public.results",
      "public.studio2_operation_receipts",
      "public.admin_audit_log",
    ]) {
      expect(rehearsal).toContain(relation);
    }
    expect(rehearsal).toContain("hashtextextended(row_to_json(row_value)::text");
    expect(rehearsal).toContain("private.v3_domain_events");
    expect(rehearsal).toContain("private.v3_domain_event_outbox");
    expect(rehearsal).toContain("foreign-key validation state differs after restore");
  });

  it("documents the canonical isolate-validate-reconcile-cutover recovery sequence", () => {
    for (const phrase of [
      "declare a recovery incident",
      "Freeze dangerous production writes",
      "Restore into an isolated",
      "Validate canonical truth",
      "Reconcile Storage/external state separately",
      "Cut over only after",
    ]) {
      expect(databaseRunbook.toLowerCase()).toContain(phrase.toLowerCase());
    }
  });

  it("does not confuse Storage metadata with recovered object bytes", () => {
    expect(storageRunbook).toContain("PostgreSQL can restore bucket/object metadata while every binary object is still missing");
    expect(storageRunbook).toContain("Never delete, overwrite, empty or rewrite production buckets");
    expect(storageRunbook).toContain("provider-level Storage byte restore drill");
    expect(storageRunbook).toContain("not proof that S11 Storage recovery is certified");
  });

  it("keeps application rollback separate from unsafe schema/data rollback", () => {
    expect(deploymentRunbook).toContain("Application rollback and database rollback are separate decisions");
    expect(deploymentRunbook.toLowerCase()).toContain("does **not** authorize reversing migrations or restoring older data");
    expect(deploymentRunbook).toContain("Cloudflare");
    expect(deploymentRunbook).toContain("does not currently contain an isolated Cloudflare provider rollback drill");
  });

  it("marks full recovery as foundation until every component and end-to-end drill is proven", () => {
    expect(fullRecoveryRunbook).toContain("database-restore.md");
    expect(fullRecoveryRunbook).toContain("storage-restore.md");
    expect(fullRecoveryRunbook).toContain("exact application/runtime candidate identity");
    expect(fullRecoveryRunbook).toContain("cannot be certified until its component restore drills");
    expect(fullRecoveryRunbook).toContain("S11 foundation");
    expect(fullRecoveryRunbook).not.toContain("S11 certified");
  });
});
