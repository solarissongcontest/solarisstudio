import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("TG10/TG18 World following in all Me experiences", () => {
  it("reuses one private, account-scoped source across web and app", () => {
    const hook = source("src/lib/use-world-following-public.ts");
    const installed = source("src/components/v3/V3FollowingSavedScreen.tsx");
    const browser = source("src/components/world/WorldSavedInstitutionFollows.tsx");
    expect(hook).toContain('row.profile_id === viewerId');
    expect(hook).toContain('["v3-world-following-public", viewerId ?? null, ids]');
    expect(hook).toContain("lookup.isFetchedAfterMount");
    expect(hook).toContain("!lookup.isFetching");
    expect(installed).toContain("usePublishedWorldFollowing({");
    expect(browser).toContain("usePublishedWorldFollowing({");
    expect(browser).toContain("follows: schemaReady ? follows : undefined");
  });

  it("does not query institution preferences per item until their editor is opened", () => {
    const installed = source("src/components/v3/V3FollowingSavedScreen.tsx");
    const browser = source("src/components/world/WorldSavedInstitutionFollows.tsx");
    expect(installed).toContain('item.entityType === "organization" && expandedWorldFollow === item.followId');
    expect(browser).toContain("{open ? (");
    expect(browser).toContain("<WorldOrganizationFollowControl organizationId={id} organizationName={name} />");
    expect(installed).toContain("setWorldOrganizationFollow(item.entityId, following, notificationLevel)");
    expect(installed).toContain("queryClient.invalidateQueries");
  });

  it("does not disclose private institution details or invent a second follow writer", () => {
    const lookup = source("src/lib/v3-world-following-public.ts");
    const projection = source("src/lib/v3-following-saved.ts");
    const browser = source("src/components/mysolaris/MySolarisPersonalPage.tsx");
    expect(lookup.indexOf("fetchWorldPublicEnabled()")).toBeLessThan(lookup.indexOf('.from("world_organizations")'));
    expect(lookup).toContain('.eq("public_visibility", "public")');
    expect(lookup).not.toContain("localStorage");
    expect(projection).toContain('"Unavailable institution"');
    expect(projection).toContain('"Unsupported saved item"');
    expect(browser).toContain('<WorldSavedInstitutionFollows');
    expect(browser).toContain('followsQuery.data?.schemaReady === true');
    expect(lookup).not.toContain("service_role");
  });
});
