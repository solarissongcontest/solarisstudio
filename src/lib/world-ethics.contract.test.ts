import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  canAssignEthicsCase, ethicsError, parseEthicsCase, parseEthicsMember,
} from "./world-ethics";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const sql = () => read("supabase/migrations/20261107003100_v3_tg13_ethics_cases.sql");
const id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const caseRow = {
  id, organization_id:id, organ_id:id,
  reporting_country_id:id,
  subject_country_id:id, subject_person_id:null,
  allegation:"A detailed private institutional allegation.",
  status:"filed", revision:1, opened_at:"2026-11-07T00:00:00Z",
};
const roster = {
  id, organ_id:id, person_id:id, user_id:null,
  appointment_reference:"Approved appointment under revised Charter.",
  started_at:"2026-11-07T00:00:00Z",
};

describe("TG13 Ethics Committee private authority", () => {
  it("does not allow assignment to an unconfigured or foreign-organ committee", () => {
    const record = parseEthicsCase(caseRow);
    expect(canAssignEthicsCase(record,[],true)).toBe(false);
    expect(canAssignEthicsCase(record,[parseEthicsMember(roster)],false)).toBe(false);
    expect(canAssignEthicsCase(record,[parseEthicsMember(roster)],true)).toBe(true);
    const foreign = parseEthicsMember({ ...roster,
      organ_id:"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    });
    expect(canAssignEthicsCase(record,[foreign],true)).toBe(false);
    expect(canAssignEthicsCase({ ...record,state:"assigned" },[parseEthicsMember(roster)],true)).toBe(false);
  });

  it("fails closed on unknown state, invalid revisions and forged members", () => {
    expect(() => parseEthicsCase({ ...caseRow, status:"sanctioned" })).toThrow();
    expect(() => parseEthicsCase({ ...caseRow, revision:0 })).toThrow();
    expect(() => parseEthicsMember({ ...roster, person_id:"invalid" })).toThrow();
    expect(ethicsError({ message:"COMMITTEE_NOT_CONFIGURED" })).toMatch(/explicitly appointed/);
    expect(ethicsError({ message:"VERSION_CONFLICT" })).toMatch(/Refresh/);
    expect(ethicsError({ message:"AUTHORIZATION" })).toMatch(/authority/);
  });

  it("uses canonical country controller and explicit roster without invented appointments", () => {
    const source=sql();
    for(const phrase of [
      "world_ethics_committee_memberships",
      "world_ethics_cases",
      "world_ethics_case_evidence",
      "world_ethics_case_history",
      "create function public.world_file_ethics_case_v1",
      "create function public.world_configure_ethics_member_v1",
      "create function public.world_assign_ethics_case_v1",
      "create function public.world_append_ethics_evidence_v1",
      "world.ethics.member.configure",
      "world.ethics.case.manage",
      "world.ethics.case.file",
      "world_ethics_committee_one_active_member_uidx",
      "where committee.organ_id=v_case.organ_id and committee.organization_id=v_case.organization_id",
      "COMMITTEE_NOT_CONFIGURED",
      "MEMBER_NOT_ACTIVE",
      "term.person_id=p_person_id and term.user_id=p_user_id",
      "for share;",
      "where id=p_case_id for update",
    ]) expect(source).toContain(phrase);
    expect(source).not.toMatch(/insert into public\.world_ethics_committee_memberships[\s\S]*select[^;]*from public\.world_organization_offices/i);
    expect(source).not.toMatch(/insert into public\.world_office_capabilities[\s\S]*'world.ethics.member.configure'/i);
  });

  it("keeps all private records protected by RLS, with immutable evidence", () => {
    const source=sql();
    for(const phrase of [
      "alter table public.world_ethics_cases enable row level security",
      "alter table public.world_ethics_case_evidence enable row level security",
      "alter table public.world_ethics_case_assignments enable row level security",
      "alter table public.world_ethics_committee_memberships enable row level security",
      "world_ethics_cases_private_read",
      "world_ethics_evidence_private_read",
      "world_ethics_history_private_read",
      "world_ethics_roster_scoped_read",
      "private.world_ethics_can_read_case",
      "world_ethics_evidence_no_rewrite",
      "world_ethics_history_no_rewrite",
      "IMMUTABLE_ETHICS_RECORD",
      "grant select on public.world_ethics_committee_memberships",
    ]) expect(source).toContain(phrase);
    expect(source).not.toMatch(/grant (insert|update|delete|all) on public\.world_ethics_cases[^;]*to authenticated/i);
    expect(source).not.toMatch(/create policy [^;]+to anon/i);
  });

  it("requires R2 transaction, idempotency, replay and actor-owned authoritative receipt", () => {
    const source=sql();
    const adapter=read("src/lib/world-ethics.ts");
    const ui=read("src/components/world/WorldEthicsWorkspace.tsx");
    const route=read("src/routes/world/ethics/index.tsx");
    for(const phrase of [
      "private.studio2_claim_operation",
      "private.studio2_complete_operation",
      "public.studio2_reconcile_operation",
      "private.v3_emit_domain_event",
      "v_case.revision is distinct from p_expected_revision",
      "unique(case_id,revision)",
      "operation_id uuid not null unique",
    ]) expect(source).toContain(phrase);
    expect(route).toContain("<WorldPublicGate verifyOnMount>");
    expect(route).toContain("noindex,nofollow");
    expect(adapter).toContain('envelope?.status !== "succeeded"');
    expect(adapter).toContain("envelope.operationId !== op.operationId");
    expect(adapter).toContain("result.operationId !== op.operationId");
    expect(ui).toContain("gcTime: 0");
    expect(ui).toContain("crypto.randomUUID()");
    for(const file of [adapter,ui]) {
      expect(file).not.toMatch(/\.from\("world_ethics_(?:cases|case_evidence|case_assignments)"\)\s*\.\s*(?:insert|upsert|update|delete)\s*\(/);
      expect(file).not.toContain("service_role");
    }
  });
});
