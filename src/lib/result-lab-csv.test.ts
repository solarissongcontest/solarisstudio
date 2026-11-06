import { describe, expect, it } from "vitest";

import { resultLabCsv, type ResultLabRow } from "./result-lab";

function exampleRow(name: string): ResultLabRow {
  return {
    id: "example",
    name,
    juryPoints: 12,
    televotePoints: 10,
    officialRank: 2,
    simulatedJuryPoints: 12,
    simulatedTelevotePoints: 10,
    simulatedScore: 22,
    simulatedRank: 1,
    rankDelta: -1,
  };
}

describe("Result Lab CSV export", () => {
  it.each([
    ["equals", "=2+2"],
    ["plus", "+SUM(A1:A2)"],
    ["formula with quotes", '=HYPERLINK("https://example.invalid","Open")'],
    ["minus", "-1+2"],
    ["at sign", "@SUM(1,2)"],
    ["tab prefix", "\t=2+2"],
    ["line break prefix", "\r\n+SUM(A1:A2)"],
    ["space prefix", "  -1+2"],
    ["non-ASCII whitespace", "\u00a0\u2003=2+2"],
    ["byte-order mark", "\ufeff@SUM(1,2)"],
    ["control characters", "\u0000\u007f+SUM(A1:A2)"],
  ])("neutralizes formula-like entry names starting with %s", (_kind, name) => {
    const original = exampleRow(name);
    const csv = resultLabCsv([original]);

    expect(csv).toContain(`"'${name.replaceAll('"', '""')}"`);
    expect(original.name).toBe(name);
  });

  it("quotes embedded CSV characters and leaves ordinary country names unchanged", () => {
    const csv = resultLabCsv([exampleRow('Old "Oland", New Oland')]);

    expect(csv.split("\n")[1]).toBe(
      '"1","Old ""Oland"", New Oland","22","12","10","2","-1"',
    );
  });

  it("preserves numeric negative rank differences and exact column values", () => {
    const csv = resultLabCsv([exampleRow("Oland")]);
    const lines = csv.split("\n");

    expect(lines).toHaveLength(2);
    expect(lines[1]).toBe('"1","Oland","22","12","10","2","-1"');
  });

  it.each(["Oland=2", "@", "", "'Already literal", " New Oland"])(
    "preserves literal text %j unless it starts a formula",
    (name) => {
      const csv = resultLabCsv([exampleRow(name)]);
      const expected = name === "@" ? "'@" : name;
      expect(csv).toContain(`"${expected}"`);
    },
  );

  it("preserves null optional ranks and the header-only empty export", () => {
    const row = { ...exampleRow("Oland"), officialRank: null, rankDelta: null };
    const csv = resultLabCsv([row]);
    expect(csv.split("\n")[1]).toBe('"1","Oland","22","12","10","",""');
    expect(resultLabCsv([])).toBe(csv.split("\n")[0]);
  });
});
