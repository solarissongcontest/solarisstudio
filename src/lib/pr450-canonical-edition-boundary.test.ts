import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const boundary = readFileSync(
  "supabase/migrations/20261005044000_pr450_canonical_edition_boundary.sql",
  "utf8",
);

describe("PR #450 canonical Confirmations edition boundary", () => {
  it("keeps the legacy save RPC assertion-only", () => {
    expect(boundary).toContain("Confirmations cannot create canonical editions");
    expect(boundary).toContain("Canonical edition metadata is managed by Organizer edition management");
    expect(boundary).toContain("from public.editions edition");
    expect(boundary).toContain("return v_id;");
    expect(boundary).not.toContain("update public.editions");
    expect(boundary).not.toContain("insert into public.editions");
  });

  it("normalizes the completed status exactly like the compatibility projection", () => {
    expect(boundary).toContain("case when edition.status = 'completed' then 'finished' else edition.status end");
  });
});
