import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { classifyV3ReleaseFinding } from "./v3-release-risk";
import { V3_DOMAIN_CONSEQUENCE_REGISTRY } from "./v3-domain-consequence-registry";
import { scanV3S16StaticAuthority } from "./v3-s16-mutation-authority";
const read = (path: string) => readFileSync(path, "utf8");
const original = [
  "account.changed",
  "identity.authenticated",
  "identity.signed_out",
  "session.changed",
  "session.revoked",
  "edition.changed",
  "show.changed",
  "show.cue_changed",
  "integrity.case_changed",
  "integrity.appeal_changed",
  "media.verified",
];

describe("original eleven consequence authority boundaries", () => {
  it.each(original)("retains %s until its critical authority evidence is complete", (event) => {
    const consequence = V3_DOMAIN_CONSEQUENCE_REGISTRY.find((item) => item.eventType === event);
    expect(consequence).toBeDefined();
    expect(
      classifyV3ReleaseFinding(
        `DOMAIN_CONSEQUENCE_DECLARED ${event} owner=${consequence!.ownerDomain}`,
      ).releaseRisk,
    ).toBe("hard_blocker");
    expect(read("docs/v3-open-event-authority.md")).toContain(`| ${event} |`);
  });

  it("keeps session mutation, actor scope, tombstone and completion in the same command", () => {
    const command = read(
      "supabase/migrations/20261016163100_v3_account_session_management_hardening.sql",
    )
      .split("as $revoke$")[1]
      .split("$revoke$;")[0];
    for (const invariant of [
      "session_row.user_id = v_actor",
      "session_row.id <> v_current_session",
      "for update",
      "private.studio2_require_fresh_auth(300)",
      "insert into public.studio2_account_session_revocations",
      "delete from auth.sessions",
      "private.studio2_complete_operation",
    ])
      expect(command).toContain(invariant);
    expect(command.indexOf("delete from auth.sessions")).toBeLessThan(
      command.indexOf("return private.studio2_complete_operation"),
    );
    expect(read("src/lib/account-session.ts")).toContain("await supabase.auth.signOut()");
    expect(read("src/routes/_authenticated/route.tsx")).toContain("supabase.auth.getUser()");
  });

  it("does not confuse accepted edition transitions with unrelated direct edition/show writers", () => {
    for (const path of [
      "src/routes/_authenticated/admin/editions.tsx",
      "src/components/admin/ShowLineupWorkspace.tsx",
    ]) {
      expect(scanV3S16StaticAuthority([{ path, source: read(path) }])).toContainEqual(
        expect.objectContaining({
          domain: "contest-lifecycle",
          kind: "direct_application_writer",
          releaseRisk: "hard_blocker",
        }),
      );
    }
  });

  it("preserves locked, versioned legal cue transitions and synchronous history", () => {
    const cue = read(
      "supabase/migrations/20260912141000_studio2_advanced_broadcast_workflows.sql",
    ).split("create or replace function public.studio2_transition_broadcast_segment(")[1];
    for (const invariant of [
      "for update",
      "private.studio2_can_manage_broadcast(v_actor, v_edition_id)",
      "v_revision <> p_expected_revision",
      "Invalid segment transition",
      "Another rundown segment is already live",
      "update public.shows",
      "insert into public.studio2_contest_events",
    ])
      expect(cue).toContain(invariant);
    expect(cue.indexOf("update public.shows")).toBeLessThan(
      cue.indexOf("insert into public.studio2_contest_events"),
    );
  });

  it("retains transactional case history and reviewer-governed appeal decisions", () => {
    const cases = read("supabase/migrations/20260910213200_integrity_case_governance.sql")
      .split("create or replace function public.admin_update_integrity_case_status")[1]
      .split("create or replace function")[0];
    for (const invariant of [
      "integrity_is_organizer()",
      "for update",
      "update public.integrity_cases",
      "insert into public.integrity_case_events",
    ])
      expect(cases).toContain(invariant);
    const appeals = read("supabase/migrations/20260911160000_integrity_sanctions_and_appeals.sql")
      .split("create or replace function public.admin_decide_integrity_appeal(")[1]
      .split("create or replace function")[0];
    for (const invariant of [
      "for update",
      "Appeal has already been decided",
      "Only the assigned appeal reviewer",
      "Replacement sanction level",
      "decision_rationale",
      "insert into public.integrity_case_events",
    ])
      expect(appeals).toContain(invariant);
  });
});
