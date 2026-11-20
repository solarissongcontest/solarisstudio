import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { groupFormerCountryIdentities } from "@/components/country/CountryCustomSections";
import type { PublicCountryIdentityHistoryRow } from "@/lib/country-history";
import type { Country } from "@/lib/data";

const country = {
  id: "country-oland",
  name: "Oland",
  short_code: "OLA",
  flag_image: "https://example.test/flags/modern.png",
} as Country;

function row(
  id: string,
  number: number,
  name: string,
  flag: string | null,
): PublicCountryIdentityHistoryRow {
  return {
    edition_id: id,
    edition_number: number,
    edition_name: `SSC ${number}`,
    display_name: name,
    flag_image: flag,
  };
}

describe("canonical Country historical identity presentation", () => {
  it("retains published renamed identities without rewriting current country identity", () => {
    const result = groupFormerCountryIdentities([
      row("ssc-19", 19, "Republic of Oland", "https://example.test/flags/old.png"),
      row("ssc-18", 18, "Republic of Oland", "https://example.test/flags/old.png"),
      row("ssc-22", 22, "Oland", country.flag_image),
    ], country);

    expect(result).toEqual([{
      name: "Republic of Oland",
      flag: "https://example.test/flags/old.png",
      editions: [
        { id: "ssc-18", number: 18, name: "SSC 18" },
        { id: "ssc-19", number: 19, name: "SSC 19" },
      ],
    }]);
  });

  it("does not erase historical flag changes when the country name stays the same", () => {
    const result = groupFormerCountryIdentities([
      row("ssc-14", 14, "Oland", "https://example.test/flags/old.png"),
      row("ssc-22", 22, "Oland", country.flag_image),
      row("ssc-15", 15, "", "https://example.test/flags/old.png"),
    ], country);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      name: "Oland",
      flag: "https://example.test/flags/old.png",
      editions: [
        { id: "ssc-14", number: 14 },
        { id: "ssc-15", number: 15 },
      ],
    });
  });

  it("shows published history on the canonical Country view while preserving Wiki", () => {
    const sections = readFileSync("src/components/country/CountryCustomSections.tsx", "utf8");
    const world = readFileSync("src/components/CountryWorldOverview.tsx", "utf8");
    expect(sections).toContain("const formerIdentities = groupFormerCountryIdentities(verifiedHistory, country)");
    expect(sections).toContain("usePublicCountryIdentityHistory(country.id, true)");
    expect(sections).toContain("identityHistory.isSuccess && identityHistory.isFetchedAfterMount");
    const historyHook = readFileSync("src/lib/country-history.ts", "utf8");
    expect(historyHook).toContain('refetchOnMount: verifyOnMount ? "always" : undefined');
    expect(historyHook).toContain(".abortSignal(signal)");
    expect(sections).toContain("!identityHistory.isRefetchError && !identityHistory.isFetching");
    expect(sections).toContain('anchorId={surface === "country" ? "former-identities" : undefined}');
    expect(sections).toContain('className="aspect-[3/2] w-full');
    expect(sections).toContain('span className="grid aspect-[3/2] w-full');
    expect(sections).toContain("<FormerCountryIdentities");
    expect(world).toContain("sections={data?.schemaReady ? data.sections : []}");
    expect(world).not.toContain("{data?.schemaReady ? (");
    expect(world).toContain('to="/wiki"');
    expect(world).not.toContain('to="/wiki/$code"');
    expect(world).toContain("Browse Wiki / Reference");
  });
});
