import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

const history = source("src/components/admin/ConfirmationVersionHistory.tsx");
const route = source("src/routes/_authenticated/admin/submission-versions.tsx");

describe("V3 Organizer Confirmation restore refresh", () => {
  it("keeps the current-response query edition scoped in the parent route", () => {
    expect(route).toContain(
      "queryKey: ['confirmation-response-version-current', editionId ?? 'unscoped', activeId]",
    );
  });

  it("invalidates the current-response query family after a successful restore", () => {
    expect(history).toContain(
      "queryClient.invalidateQueries({ queryKey: ['confirmation-response-version-current'] })",
    );
    expect(history).not.toContain(
      "queryClient.invalidateQueries({ queryKey: ['confirmation-response-version-current', submissionId] })",
    );
  });

  it("refreshes history and the response index alongside the current response", () => {
    expect(history).toContain(
      "queryClient.invalidateQueries({ queryKey: ['confirmation-submission-versions', submissionId] })",
    );
    expect(history).toContain(
      "queryClient.invalidateQueries({ queryKey: ['confirmation-responses-for-version-history'] })",
    );
  });
});
