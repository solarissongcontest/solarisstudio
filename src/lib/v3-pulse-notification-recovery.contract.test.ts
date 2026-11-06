import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  new URL("../routes/pulse/index.tsx", import.meta.url),
  "utf8",
);

describe("V3 Pulse notification preference recovery", () => {
  it("does not interpret an unresolved Following request as an empty saved list", () => {
    const followState = source.indexOf("followsQuery.isLoading ? (");
    const followError = source.indexOf("followsQuery.isError ? (");
    const schemaUnavailable = source.indexOf("followData?.schemaReady === false ? (");
    const emptyState = source.indexOf("You are not following anything yet.");

    expect(source).toContain("const followsQuery = useMyFollows(user?.id)");
    expect(followState).toBeGreaterThan(-1);
    expect(followError).toBeGreaterThan(followState);
    expect(schemaUnavailable).toBeGreaterThan(followError);
    expect(emptyState).toBeGreaterThan(schemaUnavailable);
    expect(source).toContain("void followsQuery.refetch()");
    expect(source).toContain("This does not mean your list is empty");
  });

  it("cannot overwrite unverified server preferences with client defaults", () => {
    const save = source.slice(
      source.indexOf("const saveNotificationSettings = async () => {"),
      source.indexOf("const updateFollowLevel = async ("),
    );
    expect(source).toContain("const preferencesQuery = useNotificationPreferences(user?.id)");
    expect(save).toContain("if (!preferencesQuery.isSuccess)");
    expect(save.indexOf("if (!preferencesQuery.isSuccess)")).toBeLessThan(
      save.indexOf("savePreferences.mutateAsync("),
    );
    expect(source.match(/disabled=\{!preferencesQuery\.isSuccess \|\| savePreferences\.isPending\}/g)).toHaveLength(3);
  });

  it("offers explicit query recovery and preserves caller-scoped mutation authority", () => {
    expect(source).toContain("preferencesQuery.isLoading");
    expect(source).toContain("preferencesQuery.isError");
    expect(source).toContain("void preferencesQuery.refetch()");
    expect(source).toContain("Changes are disabled until your saved settings are verified");
    expect(source).toContain("const savePreferences = useSaveNotificationPreferences(user?.id)");
    expect(source).toContain("const setFollow = useSetFanFollow(user?.id)");
    expect(source).not.toContain("supabase.from(");
  });
});
