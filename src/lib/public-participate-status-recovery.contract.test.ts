import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("src/routes/participate/index.tsx", "utf8");
const juryAction = readFileSync("src/lib/public-participation-jury-action.ts", "utf8");
const projection = readFileSync("src/lib/public-participation-jury-summary.ts", "utf8");

describe("legacy Public Participate status recovery", () => {
  it("never converts a failed session or jury RPC read into a closed-vote claim", () => {
    expect(source).toContain("if (sessionError) throw sessionError");
    expect(source).toContain("if (error) throw error;");
    expect(source).toContain("projectJurySummary(data)");
    expect(projection).toContain('throw new Error("Jury voting status could not be verified.")');
    expect(source).not.toContain("if (error || !data?.ok)");
  });

  it("recognizes an ordinary fan account and suspended delegation as canonical denials", () => {
    expect(projection).toContain('context.error === "country_account_required"');
    expect(projection).toContain('context.error === "account_suspended"');
    expect(juryAction).toContain("Your country account is suspended.");
    expect(juryAction).toContain("This account does not have an assigned country delegation.");
  });

  it("treats failed public Televote reads as unknown rather than closed", () => {
    const readStart = source.indexOf("async function loadTelevoteSummary");
    const readEnd = source.indexOf("function ParticipatePage()", readStart);
    const read = source.slice(readStart, readEnd);
    expect(read).toContain("if (error) throw error;");
    expect(read).toContain("if (!data) return { openRound: null };");
    expect(read).not.toContain("if (error || !data)");
    expect(read).toContain('.limit(2)');
    expect(read).toContain('.maybeSingle()');
    expect(read).not.toContain('.limit(1)');
  });

  it("keeps unverified services out of inactive actions, rather than inventing unavailable status", () => {
    expect(source).toContain("...(!confirmationsQuery.isError ? [confirmationAction] : [])");
    expect(source).toContain("...(!televoteQuery.isError ? [televoteAction] : [])");
    expect(source).toContain("...(!juryQuery.isError ? [juryAction] : [])");
    expect(source).toContain("A cached status is not proof of a currently open voting window");
    expect(source).toContain(") : statusError ? null : (");
  });

  it("exposes meaningful retry and blocks false signed-out/task-complete state", () => {
    expect(source).toContain('title="Nothing needs your attention right now"');
    expect(source).toContain("statusError ? (");
    expect(source).toContain("<ParticipationStatusRecovery onRetry={retryStatus} />");
    expect(source).toContain("void confirmationsQuery.refetch()");
    expect(source).toContain("void juryQuery.refetch()");
    expect(source).toContain("void televoteQuery.refetch()");
    expect(source).toContain("void confirmationAccessQuery.refetch()");
    expect(source).toContain('role="alert"');
    expect(source).toContain('onClick={onRetry}');
    expect(source).toContain("min-h-11");
  });

  it("recomputes window presentation locally and discards failed cached task inputs", () => {
    expect(source).toContain("publicParticipationJuryAction(juryQuery.data, now ?? 0)");
    expect(source).toContain("window.clearInterval(timer)");
    expect(source).toContain("confirmationsQuery.isError ? [] : confirmationsQuery.data");
    expect(source).toContain("confirmationAccessQuery.isError ? undefined : confirmationAccessQuery.data");
    expect(source).toContain("juryQuery.isError ? undefined : juryQuery.data");
    expect(source).toContain("televoteQuery.isError ? null : televoteQuery.data?.openRound");
  });

  it("reads canonical jury window timestamps rather than assuming incompatible aliases", () => {
    expect(projection).toContain("round.opened_at ?? round.opens_at");
    expect(projection).toContain("round.closed_at ?? round.closes_at");
  });
});
