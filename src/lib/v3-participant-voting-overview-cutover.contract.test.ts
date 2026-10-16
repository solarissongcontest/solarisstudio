import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const shell = () => read("src/components/mysolaris/MySolarisWorkspaceShell.tsx");
const source = () => read("src/integrations/v3/primary-surface-source.server.ts");
const legacy = () => read("src/routes/_authenticated/my-solaris/voting.tsx");

describe("V3 participant voting overview cutover", () => {
  it("merges the installed-app participant overview into canonical Participate", () => {
    const code = shell();
    expect(code).toContain('location.pathname === "/my-solaris/voting"');
    expect(code).toContain("useV3RolloutProbe(");
    expect(code).toContain('rollout.data?.enabled === true');
    expect(code).toContain('<Navigate to="/participate" replace />');
  });

  it("does not intercept Organizer delegation inspection", () => {
    const code = shell();
    expect(code).toContain("countryInspectionTarget(location.search)");
    expect(code).toContain("workspace.countryAccount?.access.isOrganizer === true");
    expect(code).toContain("!organizerInspection");
    expect(legacy()).toContain("Participant View · read-only");
  });

  it("fails back to the legacy participant overview when the rollout probe is unavailable", () => {
    const code = shell();
    expect(code).toContain("!rollout.isError");
    expect(code).toContain("{children}");
  });

  it("uses the canonical Participate bundle that already includes jury and public televote evidence", () => {
    const code = source();
    expect(code).toContain("jury: juryTaskFromContext(juryContext.data, editionId)");
    expect(code).toContain("loadOpenPublicTelevote(publicClient)");
    expect(code).toContain("jury: participant.jury");
    expect(code).toContain("televote: publicTelevote");
  });

  it("does not create a new client-side voting authority in the cutover shell", () => {
    const code = shell();
    expect(code).not.toContain("televotingSupabase");
    expect(code).not.toContain("loadCountryJuryVotingState");
    expect(code).not.toContain("localStorage");
    expect(code).not.toContain("sessionStorage");
  });
});
