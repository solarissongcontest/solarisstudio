import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

const context = source("src/components/mysolaris/MySolarisContext.tsx");
const participantData = source("src/lib/my-solaris-data.ts");

describe("MySolaris scoped data and cross-device refresh", () => {
  it("does not download the global participants table for one delegation", () => {
    expect(context).not.toContain("useAllParticipants");
    expect(context).toContain("loadMySolarisParticipant");
    expect(participantData).toContain('.from("participants")');
    expect(participantData).toContain('.eq("edition_id", editionId)');
    expect(participantData).toContain('.eq("country_id", countryId)');
    expect(participantData).toContain('.is("show_id", null)');
    expect(participantData).toContain(".maybeSingle()");
  });

  it("refreshes participant action truth across devices without waiting for a navigation", () => {
    expect(context).toContain('queryKey: ["mysolaris-current-entry"');
    expect(context).toContain('queryKey: ["mysolaris-jury-task"');
    expect(context).toContain('queryKey: ["country-confirmation-access", "mysolaris-context"]');
    expect(context.match(/refetchInterval: 30_000/g)?.length ?? 0).toBeGreaterThanOrEqual(4);
    expect(context.match(/refetchOnWindowFocus: true/g)?.length ?? 0).toBeGreaterThanOrEqual(4);
  });
});
