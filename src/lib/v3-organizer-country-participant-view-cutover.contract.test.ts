import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const route = readFileSync(
  "src/routes/_authenticated/admin/countries.$countryId.tsx",
  "utf8",
);

describe("V3 Organizer country participant-view cutover", () => {
  it("keeps HOD inspection inside the Organizer country cockpit", () => {
    expect(route).toContain('to="/admin/countries/$countryId"');
    expect(route).toContain('search={{ tab: "participant-view" }}');
    expect(route).toContain('if (tab === "participant-view")');
    expect(route).toContain("What this delegation currently sees");
    expect(route).toContain("snapshot.model.actions");
    expect(route).toContain("snapshot.model.outstandingAcknowledgements");
    expect(route).toContain("snapshot.context.deadlines");
  });

  it("does not send Organizer HOD inspection into legacy MySolaris Tasks", () => {
    expect(route).not.toContain("/my-solaris/tasks");
    expect(route).not.toContain("Open exact HOD projection");
    expect(route).not.toContain("Organizer actions remain disabled in the participant workspace");
  });

  it("does not expose the legacy participant perspective switch from Organizer", () => {
    expect(route).toContain('.filter((link) => link.perspective !== "participant")');
    expect(route).toContain("current responsibilities inside Organizer");
    expect(route).toContain("Participant-owned actions remain unavailable here");
  });
});