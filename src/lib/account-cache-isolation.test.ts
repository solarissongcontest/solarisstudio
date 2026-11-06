import { QueryClient } from "@tanstack/react-query";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { clearPrivateAccountQueries } from "./account-cache-isolation";

describe("shared-browser private state", () => {
  it("removes A, preserves public data and prevents A's late response repopulating B", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    client.setQueryData(["countries"], ["public"]);
    client.setQueryData(["edition-selection", "A"], "edition A");
    client.setQueryData(["user-prefs", "A"], "prefs A");
    client.setQueryData(["user-country-ownership", "A"], "A");
    client.setQueryData(["mysolaris-jury-task", "A", "country", "edition"], "AAAA");
    client.setQueryData(["owned-entry-publication", "edition"], "A publication");
    client.setQueryData(["owned-country-identity-history", "edition"], "A identity");
    client.setQueryData(["owned-hod-history", "edition"], "A HOD history");
    client.setQueryData(["v3-rollout-probe"], {
      enabled: true,
      editionId: "edition",
      userId: "A",
    });
    client.setQueryData(
      ["v3-primary-surface-bundle", "edition", "A"],
      { bootstrap: { identity: { userId: "A" } } },
    );
    let complete: (value: string) => void = () => undefined;
    const pending = client.fetchQuery({ queryKey: ["country-confirmation-access", "A"], queryFn: () => new Promise<string>((resolve) => { complete = resolve; }) }).catch(() => undefined);
    clearPrivateAccountQueries(client);
    client.setQueryData(["mysolaris-jury-task", "B", "country", "edition"], "BBBB");
    complete("OLD ACCOUNT DATA");
    await pending;
    expect(client.getQueryData(["edition-selection", "A"])).toBeUndefined();
    expect(client.getQueryData(["user-prefs", "A"])).toBeUndefined();
    expect(client.getQueryData(["user-country-ownership", "A"])).toBeUndefined();
    expect(client.getQueryData(["mysolaris-jury-task", "A", "country", "edition"])).toBeUndefined();
    expect(client.getQueryData(["country-confirmation-access", "A"])).toBeUndefined();
    expect(client.getQueryData(["owned-entry-publication", "edition"])).toBeUndefined();
    expect(client.getQueryData(["owned-country-identity-history", "edition"])).toBeUndefined();
    expect(client.getQueryData(["owned-hod-history", "edition"])).toBeUndefined();
    expect(client.getQueryData(["v3-rollout-probe"])).toBeUndefined();
    expect(
      client.getQueryData(["v3-primary-surface-bundle", "edition", "A"]),
    ).toBeUndefined();
    expect(client.getQueryData(["mysolaris-jury-task", "B", "country", "edition"])).toBe("BBBB");
    expect(client.getQueryData(["countries"])).toEqual(["public"]);
    clearPrivateAccountQueries(client);
    expect(client.getQueryData(["mysolaris-jury-task", "B", "country", "edition"])).toBeUndefined();
    client.clear();
  });
  it("evicts legacy Jury and private Televote evidence while preserving ordinary public discovery", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const protectedKeys = [
      ["voters", "show", "show-1"],
      ["jury_votes", "show", "show-1"],
      ["jury_ballot_statuses", "actor-A", "edition-1", "show", "show-1"],
      ["jury_ballot_submissions", "actor-A", "edition-1", "show", "show-1"],
      ["merged-televoting-conversion", "actor-A", "edition-1", "round-1"],
      ["merged-televoting-admin", "actor-A"],
      ["merged-combined-detail", "actor-A", "combined-1"],
      ["merged-integrity-declarations", "actor-A", "edition-1"],
      ["v3-organizer-integrity-submissions", "actor-A", "edition-1"],
      ["integrity-human-moderation"],
      ["televoting-result-integrity", "actor-A", "edition-1"],
    ] as const;

    for (const key of protectedKeys) client.setQueryData(key, { privateAccount: "A" });
    client.setQueryData(["countries"], { published: true });
    client.setQueryData(["editions"], { published: true });

    let resolveOld: (value: unknown) => void = () => undefined;
    const pending = client.fetchQuery({
      queryKey: ["merged-televoting-round-entries", "actor-A", "round-1"],
      queryFn: () => new Promise((resolve) => { resolveOld = resolve; }),
    }).catch(() => undefined);

    clearPrivateAccountQueries(client);
    resolveOld({ privateAccount: "A", late: true });
    await pending;

    for (const key of protectedKeys) expect(client.getQueryData(key)).toBeUndefined();
    expect(client.getQueryData(["merged-televoting-round-entries", "actor-A", "round-1"])).toBeUndefined();
    expect(client.getQueryData(["countries"])).toEqual({ published: true });
    expect(client.getQueryData(["editions"])).toEqual({ published: true });
    client.clear();
  });

  it("namespaces private jury observers and remounts the ballot when accounts change", () => {
    const context = readFileSync("src/components/mysolaris/MySolarisContext.tsx", "utf8");
    const jury = readFileSync("src/routes/jury-voting.tsx", "utf8");
    expect(jury).toContain("useFanSession");
    expect(context).toContain('["mysolaris-jury-task", userId, countryId, currentEdition?.id ?? "none"]');
    expect(jury).toContain('["country-jury-voting-context", userId]');
    expect(jury).toContain('key={`${userId}:${context.country.id}:${openRound.show_id}`}');
    expect(jury).toContain('`solaris:jury-ballot-draft:${userId}:${country.id}:${round.show_id}`');
    const voting = readFileSync("src/routes/_authenticated/my-solaris/voting.tsx", "utf8");
    expect(voting).toContain('["mysolaris-jury-window-state", workspace.user?.id ?? "none", country?.id ?? "none"');
    expect(jury).not.toContain('`solaris:jury-ballot-draft:${round.show_id}`');
  });
});