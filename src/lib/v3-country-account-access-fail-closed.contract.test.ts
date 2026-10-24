import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("V3 country-account access fail-closed contract", () => {
  const account = source("src/lib/country-account.ts");
  const authenticatedRoute = source("src/routes/_authenticated/route.tsx");

  it("keeps compatibility callers stable while making MySolaris opt into strict authority reads", () => {
    expect(account).toContain('export type AccountAccessReadMode = "compatibility" | "strict"');
    expect(account).toContain('readMode: AccountAccessReadMode = "compatibility"');
    expect(account).toContain('getCurrentAccountAccess(userId, "strict")');
  });

  it("propagates non-schema Organizer and country-account authority failures in strict mode", () => {
    expect(account).toContain('if (readMode === "strict")');
    expect(account).toContain("if (organizerResult.error && !organizerSchemaMissing) throw organizerResult.error");
    expect(account).toContain("if (countryResult.error && !countrySchemaMissing) throw countryResult.error");
    expect(account).toContain('if (error && readMode === "strict") throw error');
  });

  it("preserves missing-schema compatibility as explicit unavailable evidence", () => {
    expect(account).toContain("const organizerSchemaMissing = missingCountrySchema(organizerResult.error)");
    expect(account).toContain("const countrySchemaMissing = missingCountrySchema(countryResult.error)");
    expect(account).toContain("schemaReady: !organizerSchemaMissing && !countrySchemaMissing");
  });

  it("does not turn compatibility-mode failures into a breaking behavior change", () => {
    expect(account).toContain('console.warn("Could not resolve organizer access", organizerResult.error)');
    expect(account).toContain('console.warn("Could not resolve country account", countryResult.error)');
    expect(account.indexOf('if (readMode === "strict")')).toBeLessThan(
      account.indexOf('console.warn("Could not resolve organizer access"'),
    );
  });

  it("closes protected MySolaris content until authority is readable and exposes explicit retry", () => {
    expect(authenticatedRoute).toContain("account.isError || account.data?.access.schemaReady === false");
    expect(authenticatedRoute).toContain('title="Account access unavailable"');
    expect(authenticatedRoute).toContain("protected participation tools stay closed");
    expect(authenticatedRoute).toContain("void account.refetch()");
    expect(authenticatedRoute).toContain("Retry access check");
  });

  it("evaluates unavailable authority before suspended or ordinary content", () => {
    const unavailable = authenticatedRoute.indexOf(
      "account.isError || account.data?.access.schemaReady === false",
    );
    const suspended = authenticatedRoute.indexOf(
      'account.data?.access.countryStatus === "suspended"',
    );
    const children = authenticatedRoute.indexOf("return <>{children}</>");

    expect(unavailable).toBeGreaterThan(-1);
    expect(suspended).toBeGreaterThan(unavailable);
    expect(children).toBeGreaterThan(suspended);
    expect(authenticatedRoute).toContain(
      "Your account has not been treated as signed out, unassigned or active",
    );
  });
});
