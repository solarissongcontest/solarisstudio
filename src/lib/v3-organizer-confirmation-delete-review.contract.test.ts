import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

const route = source("src/routes/confirmations/admin/responses/$id.tsx");

describe("V3 Organizer Confirmation permanent deletion review", () => {
  it("requires an explicit typed review before invoking the delete authority", () => {
    expect(route).toContain("AdminConfirmSheet");
    expect(route).toContain("deleteReviewOpen");
    expect(route).toContain('confirmationText={data.country}');
    expect(route).toContain("Review permanent deletion");
    expect(route).toContain("Delete response permanently");
    expect(route).toContain("onClick={() => setDeleteReviewOpen(true)}");
    expect(route).not.toContain("window.confirm");
  });

  it("repeats the exact response context and keeps the existing authority behind review", () => {
    expect(route).toContain("data.edition.edition_number");
    expect(route).toContain("data.round?.name");
    expect(route).toContain("data.submitted_at");
    expect(route).toContain("admin_confirmation_delete_response");
    expect(route).toContain("expectedRevision: data.delete_revision");
    expect(route).toContain("onlyPending: true");
  });

  it("states irreversibility without inventing rollback or a second mutation path", () => {
    expect(route).toContain("Organizer cannot undo this action");
    expect(route).toContain("Reopening this response safely recovers");
    expect(route).toContain("runConfirmationResponseDelete");
    expect(route.match(/admin_confirmation_delete_response/g)?.length).toBe(1);
  });
});
