import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const route = readFileSync(
  "src/routes/_authenticated/admin/televote/$slug.tsx",
  "utf8",
);
const s08 = readFileSync(
  "docs/v3/recovery-candidates/s08-televote-single-writer-local.sql",
  "utf8",
);

describe("V3 S08 Organizer Televote totals scope", () => {
  it("binds the read-only route to exact Organizer edition and show", () => {
    expect(route).toContain("useAdminContext()");
    expect(route).toContain('key={editionId || "unscoped"}');
    expect(route).toContain(
      "const scopedEditionId = edition && organizerEditionId === edition.id ? edition.id : undefined",
    );
    expect(route).toContain("useShows(scopedEditionId)");
    expect(route).toContain("useParticipants(scopedEditionId)");
    expect(route).toContain("useContestEntities(scopedEditionId)");
    expect(route).toContain("const contextMismatch = Boolean(edition && organizerEditionId !== edition.id)");
    expect(route).toContain('title="Edition context mismatch"');
    expect(route).toContain("Reads and saves stay blocked until the contexts match");
  });

  it("rejects an unknown show URL instead of defaulting to another show's vote totals", () => {
    expect(route).toContain("const invalidShowLink = Boolean(search.show)");
    expect(route).toContain("const selectedShow = search.show");
    expect(route).toContain("if (invalidShowLink)");
    expect(route).toContain('title="Show link is no longer valid"');
  });

  it("stops every manual official total write and retains source-owned publication", () => {
    expect(route).not.toContain('supabase.from("televote_votes")');
    expect(route).not.toContain("validateEditionCommandScope");
    expect(s08).toContain("revoke insert, update, delete on public.televote_votes");
    expect(s08).toContain("private.v3_televote_projection_write_context");
    expect(s08).toContain("writer.transaction_id=pg_current_xact_id()");
    expect(s08).toContain("v_previous_show_id is distinct from v_show_id");
    expect(s08).not.toContain("grant insert on public.televote_votes");
  });
});
