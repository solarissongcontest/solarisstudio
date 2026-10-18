import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const publication = readFileSync(
  "src/routes/_authenticated/admin/publication/$slug.tsx",
  "utf8",
);

describe("V3 Organizer Publication context isolation", () => {
  it("uses the shell-owned edition context instead of treating the URL as authority", () => {
    expect(publication).toContain("useAdminContext");
    expect(publication).toContain("const { editionId: organizerEditionId } = useAdminContext()");
    expect(publication).toContain(
      "const scopedEditionId = edition && organizerEditionId === edition.id ? edition.id : undefined",
    );
    expect(publication).toContain("enabled: Boolean(scopedEditionId)");
    expect(publication).toContain("if (contextMismatch || !scopedEditionId)");
  });

  it("does not open or apply publication commands outside the active Organizer context", () => {
    expect(publication).toContain("assertPublicationEditionScope(show)");
    expect(publication).toContain("assertPublicationEditionScope(pendingRelease.show)");
    expect(publication).toContain("capabilityEditionId: organizerEditionId || null");
  });

  it("clears stale review state when the Organizer edition changes", () => {
    expect(publication).toContain("setDraft(null)");
    expect(publication).toContain("setPendingRelease(null)");
    expect(publication).toContain("setDiscardDraftOpen(false)");
    expect(publication).toContain("setPublicationPassword(\"\")");
    expect(publication).toContain("setRecovery(null)");
  });

  it("repeats edition and show context in the consequential confirmation sheet", () => {
    expect(publication).toContain(
      "{editionLabel(edition)} · {pendingRelease.show.name}",
    );
  });
});
