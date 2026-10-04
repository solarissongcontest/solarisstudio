import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

const context = source("src/components/mysolaris/MySolarisContext.tsx");

describe("MySolaris scoped data and cross-device refresh", () => {
  it("does not download the global participants table for one delegation", () => {
    expect(context).not.toContain("useAllParticipants");
    expect(context).toContain('.from("participants")');
    expect(context).toContain('.eq("edition_id", currentEdition!.id)');
    expect(context).toContain('.eq("country_id", countryId!)');
    expect(context).toContain('.is("show_id", null)');
    expect(context).toContain(".maybeSingle()");
  });

  it("refreshes participant action truth across devices without waiting for a navigation", () => {
    expect(context).toContain('queryKey: ["mysolaris-current-entry"');
    expect(context).toContain('queryKey: ["mysolaris-jury-task"');
    expect(context).toContain('queryKey: ["country-confirmation-access", "mysolaris-context"]');
    expect(context.match(/refetchInterval: 30_000/g)?.length ?? 0).toBeGreaterThanOrEqual(4);
    expect(context.match(/refetchOnWindowFocus: true/g)?.length ?? 0).toBeGreaterThanOrEqual(4);
  });
});
