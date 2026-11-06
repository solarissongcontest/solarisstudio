import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockRpc = vi.hoisted(() => vi.fn());
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: mockRpc } }));

import {
  parseDomesticCountry, parseDomesticWriteReceipt, readWorldDomesticCountry,
  writeWorldDomesticCanon,
} from "./terra-world-domestic";
import { parseWorldHistoryPage, readWorldHistoryPage } from "./terra-world-history";

const MIGRATION = readFileSync(resolve(process.cwd(),
  "supabase/migrations/20261107003000_v3_tg16_domestic_politics_history.sql"),"utf8");
const countryId = "11111111-1111-4111-8111-111111111111";
const partyId = "22222222-2222-4222-8222-222222222222";
const operationId = "33333333-3333-4333-8333-333333333333";
const country = {
  countryId, countryCode: "OL", countryName: "Oland",
  governmentType: "Republic", leaderName: null, leaderTitle: null,
  isController: false,
  parties: [{ id: partyId, name: "Example Party", abbreviation: "EP", ideology: null,
    summary: null, status: "active", published: true, revision: 1, privateNotes: "secret" }],
  elections: [],
  privateAuthUserId: "must-never-surface",
};

beforeEach(() => mockRpc.mockReset());
describe("WORLD-09 TG16 canonical domestic political records", () => {
  it("reuses current country and government authorities rather than shadowing them", () => {
    expect(MIGRATION).toContain("public.country_accounts");
    expect(MIGRATION).toContain("public.country_profiles");
    expect(MIGRATION).not.toMatch(/create table(?: if not exists)? public\.country_accounts/i);
    expect(MIGRATION).not.toMatch(/create table(?: if not exists)? public\.country_profiles/i);
    expect(MIGRATION).not.toMatch(/insert into public\.country_accounts/i);
    expect(MIGRATION).not.toMatch(/update public\.country_profiles/i);
  });
  it("denies direct anonymous and authenticated mutation", () => {
    for (const table of ["world_domestic_parties","world_domestic_elections",
                         "world_history_events","world_domestic_record_revisions"]) {
      expect(MIGRATION).toContain("public." + table + " enable row level security");
      expect(MIGRATION).toContain("public." + table);
    }
    expect(MIGRATION).toMatch(/revoke all on public\.world_domestic_parties from public, anon, authenticated/);
    expect(MIGRATION).toMatch(/revoke all on public\.world_history_events from public, anon, authenticated/);
    expect(MIGRATION).toContain("grant execute on function public.world_write_domestic_canon_v1");
    expect(MIGRATION).toContain("ca.user_id = v_actor and ca.status = 'active'");
    expect(MIGRATION).toContain("revision=p_expected_revision");
    expect(MIGRATION).toContain("private.studio2_claim_operation");
    expect(MIGRATION).toContain("private.studio2_complete_operation");
    expect(MIGRATION).toContain("private.v3_emit_domain_event");
  });
  it("never mistakes fictional elections for institutional ballots", () => {
    expect(MIGRATION).toContain("NEVER an authenticated institutional ballot");
    expect(MIGRATION).not.toContain("insert into public.world_ballots");
    expect(MIGRATION).toContain("foreign key (winner_party_id, country_id)");
    expect(MIGRATION).toContain("visibility='draft'");
    expect(MIGRATION).toContain("world_domestic_record_revisions");
  });
  it("parses only safe projection keys and rejects malformed private/foreign responses", () => {
    const data = parseDomesticCountry(country,"OL")!;
    expect(data.parties[0].name).toBe("Example Party");
    expect(data).not.toHaveProperty("privateAuthUserId");
    expect(data.parties[0]).not.toHaveProperty("privateNotes");
    expect(() => parseDomesticCountry(country,"UN")).toThrow("Invalid");
    expect(() => parseDomesticCountry({ ...country, parties: "private" },"OL")).toThrow("Invalid");
    expect(parseDomesticCountry(null,"OL")).toBeNull();
  });
  it("uses only a bounded canonical government RPC, forwards cancellation and skips aborted I/O", async () => {
    const signal = new AbortController();
    signal.abort();
    await expect(readWorldDomesticCountry("OL", signal.signal)).rejects.toThrow("cancelled");
    expect(mockRpc).not.toHaveBeenCalled();
    const forwarding = vi.fn().mockResolvedValue({ data: country, error: null });
    mockRpc.mockReturnValueOnce({ abortSignal: forwarding });
    await expect(readWorldDomesticCountry("OL",new AbortController().signal))
      .resolves.toMatchObject({ countryCode:"OL" });
    expect(mockRpc).toHaveBeenCalledWith("world_domestic_country_v1",{ p_country_code:"OL" });
    expect(forwarding).toHaveBeenCalledTimes(1);
  });
  it("requires an acknowledged server receipt rather than faking client success", async () => {
    expect(() => parseDomesticWriteReceipt({ ok: true })).toThrow("receipt");
    mockRpc.mockResolvedValueOnce({ data: { ok: true, id: partyId, kind: "party",
      revision: 1, operationId, replayed: false }, error: null });
    const result = await writeWorldDomesticCanon({
      countryId, kind:"party", subjectId: null,
      payload: { name:"Example Party",published:true }, expectedRevision:0,
      operationId, idempotencyKey:operationId,
    });
    expect(result.operationId).toBe(operationId);
    expect(mockRpc).toHaveBeenCalledWith("world_write_domestic_canon_v1", {
      p_country_id:countryId,p_kind:"party",p_subject_id:null,
      p_payload:{ name:"Example Party",published:true },p_expected_revision:0,
      p_operation_id:operationId,p_idempotency_key:operationId,
    });
    mockRpc.mockResolvedValueOnce({ data: null,error:{code:"40001",message:"VERSION_CONFLICT"} });
    await expect(writeWorldDomesticCanon({
      countryId, kind:"party",subjectId:partyId,
      payload:{name:"Changed"},expectedRevision:1,operationId,idempotencyKey:operationId,
    })).rejects.toThrow("changed elsewhere");
  });
});

describe("WORLD-09 TG17 derived public World Archive", () => {
  it("derives history from canonical public-only facts instead of copying votes or private drafts", () => {
    expect(MIGRATION).toContain("create function public.world_history_timeline_v1");
    expect(MIGRATION).toContain("from public.world_domestic_elections e");
    expect(MIGRATION).toContain("from public.world_organizations o");
    expect(MIGRATION).toContain("o.public_visibility='public'");
    expect(MIGRATION).toContain("h.visibility='public'");
    expect(MIGRATION).toContain("e.visibility='public'");
    expect(MIGRATION).toContain("source_type text not null default 'editorial'");
    expect(MIGRATION).toContain("limit 20 offset p_page*20");
    expect(MIGRATION).not.toContain("from public.world_session_ballots");
  });
  it("returns provenance and crosslinks without projecting private fields", () => {
    const result = parseWorldHistoryPage({ page:0,pageSize:20,hasMore:false,
      events:[{
        id:"editorial:1",occurred_at:"2025-01-01T00:00:00Z",title:"A historic event",
        summary:"A public editorial record.",source_type:"editorial",
        provenance:"world_history_events",country_code:"OL",organization_slug:null,
        auth_user_id:"private"
      }] },0);
    expect(result.events[0]).toMatchObject({countryCode:"OL",sourceType:"editorial"});
    expect(result.events[0]).not.toHaveProperty("auth_user_id");
    expect(() => parseWorldHistoryPage({page:0,pageSize:20,events:Array(21).fill({})},0)).toThrow();
    expect(() => parseWorldHistoryPage({page:1,pageSize:20,hasMore:false,events:[]},0)).toThrow();
  });
  it("bounds pages, rejects invalid filters and never falls back to hosted Supabase", async () => {
    await expect(readWorldHistoryPage(-1)).rejects.toThrow("Invalid");
    await expect(readWorldHistoryPage(101)).rejects.toThrow("Invalid");
    await expect(readWorldHistoryPage(0,"OL?private")).rejects.toThrow("Invalid");
    expect(mockRpc).not.toHaveBeenCalled();
    mockRpc.mockResolvedValueOnce({ data:{page:0,pageSize:20,hasMore:false,events:[]},error:null });
    await expect(readWorldHistoryPage(0)).resolves.toMatchObject({events:[]});
    expect(mockRpc).toHaveBeenCalledWith("world_history_timeline_v1",{p_page:0,p_country_code:null});
  });
});
