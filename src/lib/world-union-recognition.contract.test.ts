import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  acceptedFounderCount, isSixFoundersMet, mayRespondToFoundingInvitation,
  parseUnionApplication, parseUnionFounder, unionRecognitionError,
} from "./world-union-recognition";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const sql = () => read("supabase/migrations/20261107005500_v3_tg15_union_founder_consent.sql");
const id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const own = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const invited = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const applicationRow = {
  id, unity_organization_id: id, lead_country_id: own,
  proposed_name: "Solarian Union for Historical Cooperation",
  proposed_short_name: "SUHC",
  mission: "Coordinate historical international work.",
  governance: "Founding countries vote under the approved charter.",
  scope: "International cooperation",
  founding_charter_document_id: null, exception_requested: false,
  status: "collecting_founders", revision: 1, created_at: "2026-11-07T00:00:00Z",
};
const founder = (applicationId: string, countryId: string, status: "accepted" | "invited" | "declined") => ({
  id, applicationId, countryId, status, respondedAt: status === "invited" ? null : "2026-11-07",
});

describe("TG15 independent union recognition, real founder consent", () => {
  it("requires six actual explicit acceptances, never six invitations", () => {
    const founders = [
      founder(id, own, "accepted"),
      founder(id, "00000000-0000-4000-8000-000000000002", "accepted"),
      founder(id, "00000000-0000-4000-8000-000000000003", "accepted"),
      founder(id, "00000000-0000-4000-8000-000000000004", "accepted"),
      founder(id, "00000000-0000-4000-8000-000000000005", "accepted"),
      founder(id, "00000000-0000-4000-8000-000000000006", "invited"),
      founder(id, "00000000-0000-4000-8000-000000000007", "declined"),
    ];
    expect(acceptedFounderCount(id, founders)).toBe(5);
    expect(isSixFoundersMet(id, founders)).toBe(false);
    founders[5] = founder(id, "00000000-0000-4000-8000-000000000006", "accepted");
    expect(isSixFoundersMet(id, founders)).toBe(true);
  });

  it("allows only the currently invited country to consent", () => {
    const app = parseUnionApplication(applicationRow);
    const founders = [founder(app.id, own, "accepted"), founder(app.id, invited, "invited")];
    expect(mayRespondToFoundingInvitation(app, founders, invited)).toBe(true);
    expect(mayRespondToFoundingInvitation(app, founders, own)).toBe(false);
    expect(mayRespondToFoundingInvitation(app, founders, null)).toBe(false);
    expect(mayRespondToFoundingInvitation({ ...app, status: "recognized" }, founders, invited)).toBe(false);
    expect(() => parseUnionApplication({ ...applicationRow, status: "automatically_recognized" })).toThrow();
    expect(() => parseUnionApplication({ ...applicationRow, revision: 0 })).toThrow();
    expect(() => parseUnionFounder({ id, application_id: id, country_id: invited,
      status: "approved", responded_at: null })).toThrow();
    expect(unionRecognitionError({ message: "VERSION_CONFLICT" })).toMatch(/Refresh/);
    expect(unionRecognitionError({ message: "AUTHORIZATION" })).toMatch(/authority/);
  });

  it("separates proposed unions from canonical organizations and does not auto-recognize GUARD", () => {
    const migration = sql();
    expect(migration).toContain("world_union_recognition_applications");
    expect(migration).toContain("world_union_recognition_founders");
    expect(migration).toContain("founding_charter_document_id uuid");
    expect(migration).toContain("exception_requested boolean not null default false");
    expect(migration).toContain("status text not null default 'collecting_founders'");
    expect(migration).not.toMatch(/insert into public\.world_organizations\s*\(/i);
    expect(migration).not.toContain("private.world_legislative_tally_v1(");
    expect(migration).toContain("unity.slug='unity'");
    expect(migration).not.toMatch(/update\s+public\.world_organizations\s+set\s+status\s*=\s*'recognized'/i);
  });

  it("guards consent with current country accounts, a locked application and exact revision", () => {
    const migration = sql();
    for (const phrase of [
      "create function public.world_start_union_recognition_v1",
      "create function public.world_invite_union_founder_v1",
      "create function public.world_respond_union_founder_v1",
      "private.studio2_claim_operation",
      "private.studio2_complete_operation",
      "public.studio2_reconcile_operation",
      "private.v3_emit_domain_event",
      "v_app.revision is distinct from p_expected_revision",
      "where id=p_application_id for update",
      "where ca.user_id=auth.uid() and ca.country_id=p_country_id and ca.status='active'",
      "for share;",
      "v_founder.status <> 'invited'",
      "operation_id uuid not null unique",
      "unique (application_id,country_id)",
      "unique (application_id,revision)",
      "v_claim->>'replayed'",
      "previously successful application necessarily reserves its own name",
    ]) expect(migration).toContain(phrase);
    expect(migration).toContain("world_union_recognition_actions_append_only");
    expect(migration).toContain("IMMUTABLE_RECOGNITION_ACTION");
  });

  it("prevents public leakage and any direct client writes", () => {
    const migration = sql();
    const adapter = read("src/lib/world-union-recognition.ts");
    const page = read("src/components/world/WorldUnionRecognitionWorkspace.tsx");
    const route = read("src/routes/world/unions/index.tsx");
    for (const phrase of [
      "alter table public.world_union_recognition_applications enable row level security",
      "alter table public.world_union_recognition_founders enable row level security",
      "alter table public.world_union_recognition_actions enable row level security",
      "private.world_union_recognition_can_read",
      "grant select on public.world_union_recognition_applications",
      "from public,anon,authenticated,service_role",
    ]) expect(migration).toContain(phrase);
    expect(route).toContain("<WorldPublicGate verifyOnMount>");
    expect(route).toContain("noindex,nofollow");
    expect(page).toContain("gcTime: 0");
    expect(page).toContain("crypto.randomUUID()");
    expect(adapter).toContain('envelope?.status !== "succeeded"');
    expect(adapter).toContain("envelope.operationId !== operationId");
    expect(adapter).toContain("result.operationId !== operationId");
    for (const source of [adapter, page]) {
      expect(source).not.toMatch(/\.from\("world_union_recognition_(?:applications|founders|actions)"\)\s*\.\s*(?:insert|upsert|update|delete)\s*\(/);
      expect(source).not.toContain("service_role");
    }
  });
});
