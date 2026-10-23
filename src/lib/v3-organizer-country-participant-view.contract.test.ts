import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  resolve(process.cwd(), "src/routes/_authenticated/admin/countries.$countryId.tsx"),
  "utf8",
);

describe("V3 Organizer country participant-view ownership", () => {
  it("keeps read-only participant inspection inside the Organizer country cockpit", () => {
    expect(source).toContain('to="/admin/countries/$countryId"');
    expect(source).toContain('search={{ tab: "participant-view" }}');
    expect(source).toContain('if (tab === "participant-view")');
    expect(source).toContain("Read-only organizer inspection");
    expect(source).toContain("What this delegation currently sees");
    expect(source).toContain("Inspection stays inside Organizer");
  });

  it("does not escape to the retired duplicate MySolaris Tasks inspection surface", () => {
    expect(source).not.toContain("/my-solaris/tasks");
    expect(source).not.toContain("HOD inspection");
    expect(source).not.toContain("Open exact HOD projection");
  });

  it("continues to render the canonical caller-scoped workspace projection", () => {
    expect(source).toContain("loadStudio2HodWorkspace(resolvedEditionId, countryId)");
    expect(source).toContain("snapshot.model.actions.map");
    expect(source).toContain("snapshot.context.deadlines.filter");
    expect(source).toContain("snapshot.model.outstandingAcknowledgements");
  });
});
