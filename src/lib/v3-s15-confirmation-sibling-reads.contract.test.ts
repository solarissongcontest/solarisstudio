import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

const overview = read("src/routes/confirmations/admin/index.tsx");
const countries = read("src/routes/confirmations/admin/countries.tsx");
const responses = read("src/routes/confirmations/admin/responses.tsx");
const reader = read("src/integrations/confirmations/v3-projections.ts");
const migration = read(
  "supabase/migrations/20261104144000_v3_s15_confirmation_review_projection.sql",
);

describe("S15 Organizer sibling Confirmation review consumers", () => {
  it.each([
    ["Delegations overview", overview],
    ["Responses by country", countries],
    ["Response review list", responses],
  ])("%s never downloads the all-edition private response archive", (_, source) => {
    expect(source).not.toContain('rpc("admin_confirmation_responses")');
  });

  it.each([
    ["Delegations overview", overview],
    ["Responses by country", countries],
  ])("%s loads only an exact selected edition with a bounded snapshot", (_, source) => {
    expect(source).toContain("loadAllConfirmationResponsesForEdition<ResponseRow>(selected)");
    expect(source).toContain("item.id === organizerEditionId");
    expect(source).toContain("setRows([])");
    expect(source).toContain("[organizerEditionId]");
    expect(source).not.toContain("editionRows[0]");
    expect(source).not.toContain('edition.status === "active"');
  });

  it("clears stale private overview state when the Organizer edition changes", () => {
    expect(overview).toContain("setResponses([])");
    expect(overview).toContain("[organizerEditionId]");
    expect(overview).toContain("if (!alive) return");
  });

  it("preserves exact-edition and canonical state guards at the read boundary", () => {
    expect(reader).toContain('rpc("admin_confirmation_responses_v2"');
    expect(reader).toContain("p_edition_id: editionId");
    expect(reader).toContain("page.stateVersion !== cursor.stateVersion");
    expect(reader).toContain("page.stateVersion !== stateVersion");
    expect(reader).toContain("rows.size !== totalCount");
    expect(migration).toContain("submission.edition_id = p_edition_id");
    expect(migration).toContain("private.solaris_confirmation_admin_read_allowed(p_edition_id, false)");
  });
});
