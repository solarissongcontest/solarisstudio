import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(path, "utf8");

describe("Solaris V6 participant workflow inspection contract", () => {
  it("keeps Organizer inspection explicit and read-only in Tasks", () => {
    const tasks = source(
      "src/components/mysolaris/modules/MySolarisTasksModule.tsx",
    );
    expect(tasks).toContain("organizerInspection");
    expect(tasks).toContain("Participant View · read-only");
    expect(tasks).toContain("<SolarisSurfaceSwitch");
    expect(tasks).toContain("!organizerInspection ? (");
    expect(tasks).toContain("acknowledgeNotice.mutate");
  });

  it("keeps Organizer inspection out of participant confirmation mutation paths", () => {
    const entry = source(
      "src/components/mysolaris/modules/MySolarisEntryModule.tsx",
    );
    expect(entry).toContain("organizerInspection");
    expect(entry).toContain("Participant View · read-only");
    expect(entry).toContain("<SolarisSurfaceSwitch");
    expect(entry).toContain('"/confirmations/admin/countries"');
    expect(entry).toContain("!organizerInspection");
    expect(entry).toContain(
      "includeOrganizer: Boolean(access?.isOrganizer)",
    );
  });

  it("keeps Voting perspective switching access-aware", () => {
    const voting = source(
      "src/routes/_authenticated/my-solaris/voting.tsx",
    );
    expect(voting).toContain("<SolarisSurfaceSwitch");
    expect(voting).toContain('featureId: "participant-voting-overview"');
    expect(voting).toContain("workspace.permissions.isOrganizer");
    expect(voting).toContain('["participant", "organizer", "diagnostic"]');
    expect(voting).toContain('["participant"]');
  });

  it("does not impersonate a delegation notice inbox for Organizer users", () => {
    const notices = source(
      "src/components/mysolaris/modules/MySolarisNoticesModule.tsx",
    );
    expect(notices).toContain("access?.isOrganizer !== true");
    expect(notices).toContain("if (access?.isOrganizer)");
    expect(notices).toContain('to="/admin/communications"');
    expect(notices).toContain("loadStudio2NoticeInbox()");
  });

  it("keeps Organizer voting inspection read-only and registry-driven", () => {
    const voting = source(
      "src/routes/_authenticated/my-solaris/voting.tsx",
    );
    expect(voting).toContain("organizerInspection");
    expect(voting).toContain("Participant View · read-only");
    expect(voting).toContain("participant-voting-overview");
    expect(voting).toContain("<SolarisSurfaceSwitch");
    expect(voting).toContain("Open Organizer jury controls");
    expect(voting).toContain("!organizerInspection ? (");
    expect(voting).toContain("Jury submission and public voting actions are disabled here");
  });

  it("uses the same registry-driven perspective switch in the country workspace", () => {
    const country = source(
      "src/components/mysolaris/modules/MySolarisCountryModule.tsx",
    );
    expect(country).toContain("<SolarisSurfaceSwitch");
    expect(country).toContain("countrySurfaceLinks");
    expect(country).toContain("includeOrganizer: isOrganizer");
    expect(country).toContain("includeDiagnostics: isOrganizer");
  });
});
