import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  resolve(process.cwd(), "src/components/mysolaris/MySolarisAnniversaryRecap.tsx"),
  "utf8",
);

function section(start: string, end: string) {
  return source.slice(source.indexOf(start), source.indexOf(end));
}

describe("V3 MySolaris anniversary request budget", () => {
  it("returns before the anniversary data child mounts outside active or preview-active mode", () => {
    const gate = section(
      "export function MySolarisAnniversaryRecap",
      "function VisibleMySolarisAnniversaryRecap",
    );

    expect(gate).toContain('anniversary.phase === "active" || previewPhase === "active"');
    expect(gate).toContain("if (!visible) return null;");
    expect(gate).toContain("<VisibleMySolarisAnniversaryRecap anniversary={anniversary} />");
    expect(gate).not.toContain("useEditions()");
    expect(gate).not.toContain("useAllParticipants()");
    expect(gate).not.toContain("useAllShows()");
    expect(gate).not.toContain("useAllResults()");
  });

  it("does not mount archive reads for viewers without a country account", () => {
    const accountGate = section(
      "function VisibleMySolarisAnniversaryRecap",
      "function MySolarisAnniversaryRecapData",
    );

    expect(accountGate).toContain("useMySolaris()");
    expect(accountGate).toContain("if (!country) return null;");
    expect(accountGate).not.toContain("useEditions()");
    expect(accountGate).not.toContain("useAllParticipants()");
    expect(accountGate).not.toContain("useAllShows()");
    expect(accountGate).not.toContain("useAllResults()");
  });

  it("keeps the complete recap archive calculation in the active data child", () => {
    const data = section("function MySolarisAnniversaryRecapData", "function StoryStat");

    expect(data).toContain("useEditions()");
    expect(data).toContain("useAllParticipants()");
    expect(data).toContain("useAllShows()");
    expect(data).toContain("useAllResults()");
    expect(data).toContain("finalRankingIsResolved");
    expect(data).toContain("editionIsInAnniversaryYear");
    expect(data).toContain("navigator.clipboard.writeText(shareText)");
    expect(data).toContain("Your Solaris story");
  });
});
