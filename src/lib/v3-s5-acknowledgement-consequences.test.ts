import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { v3DomainConsequence } from "./v3-domain-consequence-registry";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

const migration = source(
  "supabase/migrations/20261017123000_v3_s5_acknowledgement_consequences.sql",
);
const rehearsal = source(
  ".github/scripts/v3-s5-acknowledgement-consequences-rehearsal.sh",
);
const communications = source("src/lib/studio2-communications.ts");
const hodWorkspace = source("src/lib/studio2-hod-workspace.ts");

describe("System V3 S5 acknowledgement consequences", () => {
  it("keeps the existing acknowledgement RPC as the participant write authority", () => {
    expect(migration).toContain("create or replace function public.studio2_acknowledge_notice(p_notice_id uuid)");
    expect(migration).toContain("private.studio2_user_can_receive_notice_as_recipient(");
    expect(migration).toContain("This notice does not require acknowledgement");
    expect(communications).toContain("studio2_acknowledge_notice");
    expect(hodWorkspace).toContain("studio2_acknowledge_notice");
  });

  it("makes the first acknowledgement immutable and exact retries semantic no-ops", () => {
    expect(migration).toContain("private.v3_preserve_notice_acknowledgement");
    expect(migration).toContain("new.acknowledged_at := old.acknowledged_at");
    expect(migration).toContain("if v_receipt.acknowledged_at is not null then");
    expect(migration).toContain(
      "acknowledged_at = coalesce(public.studio2_notice_receipts.acknowledged_at, excluded.acknowledged_at)",
    );
  });

  it("derives a deterministic S2 operation identity from recipient + notice version", () => {
    expect(migration).toContain("private.v3_acknowledgement_operation_id");
    expect(migration).toContain("'acknowledgement.record'");
    expect(migration).toContain("'R0'");
    expect(migration).toContain("'recipientUserId', p_recipient_user_id");
    expect(migration).toContain("'noticeRevision', p_notice_revision");
    expect(migration).toContain("private.studio2_request_fingerprint(");
  });

  it("emits only the first committed acknowledgement as a privacy-safe DomainEvent", () => {
    expect(migration).toContain("private.v3_emit_notice_acknowledgement_event");
    expect(migration).toContain("Acknowledgement actor does not own this receipt");
    expect(migration).toContain("'acknowledgement.recorded'");
    expect(migration).toContain("'acknowledgement'");
    expect(migration).toContain("v_operation_id::text");
    expect(migration).toContain("array[]::text[]");

    const eventEmission = migration.split("perform private.v3_emit_domain_event(")[1]?.split("return new;")[0] ?? "";
    expect(eventEmission).not.toContain("recipientUserId");
    expect(eventEmission).not.toContain("actorId");
    expect(eventEmission).not.toContain("userId");
  });

  it("preserves the legacy contest-event projection only for the first acknowledgement", () => {
    expect(migration).toContain("'notice.acknowledged'");
    expect(migration).toContain("if v_receipt.acknowledged_at is not null then");
    expect(migration).toContain("return v_receipt;");
  });

  it("marks acknowledgement.recorded event-backed without fabricating a task worker", () => {
    expect(v3DomainConsequence("acknowledgement.recorded")?.implementationState).toBe("event-backed");
    expect(v3DomainConsequence("acknowledgement.recorded")?.ownerDomain).toBe("acknowledgement");
    expect(v3DomainConsequence("acknowledgement.recorded")?.taskEffects).toEqual([]);
  });

  it("rehearses first write, retry, immutable evidence, recipient scope and privacy locally", () => {
    expect(rehearsal).toContain("first acknowledgement returned no timestamp");
    expect(rehearsal).toContain("exact retry rewrote acknowledged_at");
    expect(rehearsal).toContain("service maintenance rewrote immutable acknowledgement timestamp");
    expect(rehearsal).toContain("non-recipient acknowledgement unexpectedly succeeded");
    expect(rehearsal).toContain("ownerless direct acknowledgement unexpectedly succeeded");
    expect(rehearsal).toContain("DomainEvent leaked recipient identity");
    expect(rehearsal).toContain("Refusing hosted Supabase rehearsal");
  });
});
