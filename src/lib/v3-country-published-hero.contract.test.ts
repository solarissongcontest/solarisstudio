import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const gate = readFileSync("src/components/v3/V3DelegationRouteGate.tsx", "utf8");
const screen = readFileSync("src/components/v3/V3DelegationScreen.tsx", "utf8");
const design = readFileSync("src/lib/country-design-v2.ts", "utf8");
const cinematic = readFileSync("src/components/v3/CinematicEditorialHero.tsx", "utf8");

describe("installed V3 Country cinematic media publication boundary", () => {
  it("only queries the country-scoped existing published V2 design", () => {
    expect(gate).toContain("useCountryDesignV2(shouldLoadBundle ? bundleQuery.data?.countryId : null)");
    expect(gate).toContain("publicDesignQuery.isSuccess && !publicDesignQuery.isFetching");
    expect(gate).toContain("!publicDesignQuery.isRefetchError && publicDesignQuery.data.isPublishedV2");
    expect(design).toContain('.eq("country_id", countryId)');
    expect(design).toContain("Boolean(row?.design_v2)");
    expect(gate).not.toContain("usePublishCountryDesignV2");
  });

  it("never reuses a logo or unpublished design as full-bleed Country artwork", () => {
    expect(screen).toContain('background?.mode === "image" ? background.imageUrl : null');
    expect(screen).toContain("imageUrl={publishedHeroImage}");
    expect(screen).toContain("focalPoint={publishedFocalPoint}");
    expect(screen).toContain("background.positionX / 100");
    expect(screen).toContain("background.positionY / 100");
    expect(cinematic).toContain("onError={() => setFailedUrl(usableImage)}");
  });
});
