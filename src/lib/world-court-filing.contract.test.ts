import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  COURT_STATES, courtError, isCourtResponseAllowed,
  parseCourtCase, parseCourtDocketEntry, parseCourtFiling,
} from "./world-court-filing";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const migration = () => read("supabase/migrations/20261107005000_v3_tg14_court_filing.sql");
const id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const country = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

const caseRow = {
  id, identifier: "ITSC-000001", organization_id: id,
  applicant_country_id: id, respondent_country_id: country,
  claim: "The applicant states a formal dispute.",
  legal_basis: "Article of UNITY Charter.",
  requested_remedy: "Request a binding determination.",
  status: "filed", revision: 1,
  filed_at: "2026-11-07T00:00:00Z", updated_at: "2026-11-07T00:00:00Z",
};

describe("TG14 private International Terra Solaris Court intake", () => {
  it("registers the exact canonical Court lifecycle without inventing judgments", () => {
    expect(COURT_STATES).toEqual([
      "filed", "preliminary_review", "response_pending", "proceedings", "hearing",
      "judgment_pending", "decided", "reconsideration_requested",
      "reconsideration", "closed", "archived",
    ]);
    const record = parseCourtCase(caseRow);
    expect(isCourtResponseAllowed(record, country, false)).toBe(true);
    expect(isCourtResponseAllowed(record, country, true)).toBe(false);
    expect(isCourtResponseAllowed(record, id, false)).toBe(false);
    expect(isCourtResponseAllowed({ ...record, status: "decided" }, country, false)).toBe(false);
  });

  it("strictly validates private case and public docket fields", () => {
    expect(parseCourtCase(caseRow).identifier).toBe("ITSC-000001");
    expect(() => parseCourtCase({ ...caseRow, status: "approved" })).toThrow();
    expect(() => parseCourtCase({ ...caseRow, revision: -1 })).toThrow();
    expect(() => parseCourtCase({ ...caseRow, id: "" })).toThrow();
    const docketRow = { id, identifier: "ITSC-000001", applicantCountryId: id,
      respondentCountryId: country, status: "filed", filedAt: "2026-11-07T00:00:00Z" };
    expect(parseCourtDocketEntry(docketRow).status).toBe("filed");
    expect(() => parseCourtDocketEntry({ ...docketRow, status: "other" })).toThrow();
    expect(parseCourtFiling({ id, case_id: id, party_country_id: country,
      filing_type: "response", body: "A formal response to allegations.",
      case_revision: 2, filed_at: "2026-11-07" }).revision).toBe(2);
    expect(courtError({ message: "VERSION_CONFLICT" })).toMatch(/Refresh/);
    expect(courtError({ message: "AUTHORIZATION" })).toMatch(/authority/);
  });

  it("guards private raw tables and immutable filed pleadings at database boundary", () => {
    const sql = migration();
    for (const phrase of [
      "alter table public.world_court_cases enable row level security",
      "alter table public.world_court_filings enable row level security",
      "alter table public.world_court_parties enable row level security",
      "world_court_participant_read",
      "world_court_filings_protected",
      "world_court_filings_append_only",
      "IMMUTABLE_COURT_FILING",
      "revoke all on public.world_court_cases,public.world_court_parties",
      "grant select on public.world_court_cases,public.world_court_parties",
      "where ca.user_id = auth.uid() and ca.status = 'active'",
    ]) expect(sql).toContain(phrase);
    expect(sql).not.toMatch(/grant (insert|update|delete|all) on public\.world_court_cases[^;]*to authenticated/i);
  });

  it("enforces country-control lock, replay-safe command receipt and case revision", () => {
    const sql = migration();
    for (const phrase of [
      "world_file_court_case_v1", "world_respond_to_court_case_v1",
      "private.studio2_claim_operation", "private.studio2_complete_operation",
      "public.studio2_reconcile_operation", "private.v3_emit_domain_event",
      "for share;", "for update;", "v_case.revision is distinct from p_expected_revision",
      "unique (case_id,case_revision)", "operation_id uuid not null unique",
      "create unique index world_court_first_claim_uidx",
      "create unique index world_court_first_response_uidx",
      "world.court.file", "world.court.respond",
    ]) expect(sql).toContain(phrase);
    expect(sql).toContain("office_row.slug = 'secretary-general'");
    expect(sql).not.toContain("insert into public.world_court_judgments");
  });

  it("projects docket data only from explicit Court publication without claims", () => {
    const sql = migration();
    const start = sql.indexOf("create function public.world_court_public_docket_v1");
    const end = sql.indexOf("revoke all on function public.world_court_public_docket_v1", start);
    const fn = sql.slice(start, end);
    expect(fn).toContain("c.public_metadata @> '{\"listed\":true}'::jsonb");
    expect(fn).toContain("limit least(greatest(coalesce(p_limit,20),1),50)");
    expect(fn).not.toContain("listed.claim");
    expect(fn).not.toContain("listed.legal_basis");
    expect(fn).not.toContain("listed.filed_by_user_id");
  });

  it("keeps authorized UI behind rollout, never writes cases directly", () => {
    const adapter = read("src/lib/world-court-filing.ts");
    const ui = read("src/components/world/WorldCourtWorkspace.tsx");
    const route = read("src/routes/world/court/index.tsx");
    expect(route).toContain("<WorldPublicGate verifyOnMount>");
    expect(route).toContain("noindex,nofollow");
    expect(adapter).toContain('supabase.auth.getUser()');
    expect(adapter).toContain('world_court_public_docket_v1');
    expect(adapter).toContain('world_file_court_case_v1');
    expect(adapter).toContain('world_respond_to_court_case_v1');
    expect(adapter).toContain("input.ok !== true");
    expect(ui).toContain("crypto.randomUUID()");
    expect(ui).toContain("previous?.payload === payload");
    expect(ui).toContain("Request");
    for (const source of [adapter, ui]) {
      expect(source).not.toMatch(/\.from\("world_court_(?:cases|filings|parties)"\)\s*\.\s*(?:insert|upsert|update|delete)\s*\(/);
      expect(source).not.toContain("service_role");
    }
  });
});
