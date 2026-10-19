import { QueryClient } from "@tanstack/react-query";
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  clearPrivateAccountQueries,
  createAccountCacheIsolationHandler,
} from "./account-cache-isolation";

describe("shared-browser private state", () => {
  it("removes A, preserves public data and prevents A's late response repopulating B", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    client.setQueryData(["countries"], ["public"]);
    client.setQueryData(["prediction-rounds", "show"], ["public prediction round"]);
    client.setQueryData(["prediction-league", "edition"], ["public standings"]);
    client.setQueryData(["edition-selection", "A"], "edition A");
    client.setQueryData(["user-prefs", "A"], "prefs A");
    client.setQueryData(["user-country-ownership", "A"], "A");
    client.setQueryData(["mysolaris-jury-task", "A", "country", "edition"], "AAAA");
    client.setQueryData(["owned-entry-publication", "edition"], "A publication");
    client.setQueryData(["owned-country-identity-history", "edition"], "A identity");
    client.setQueryData(["owned-hod-history", "edition"], "A HOD history");
    client.setQueryData(["fan-follows", "A"], ["A follows"]);
    client.setQueryData(["fan-event-reads", "A"], ["A read state"]);
    client.setQueryData(["fan-profile", "A"], { displayName: "A" });
    client.setQueryData(["fan-taste-ballots", "A"], ["A ballot"]);
    client.setQueryData(["notification-preferences", "A"], { spoilerFree: true });
    client.setQueryData(["my-prediction", "round", "A"], { rank: 1 });
    client.setQueryData(["prediction-history", "A"], ["A history"]);
    client.setQueryData(["prediction-movement", "round"], { authorizedBy: "A" });
    client.setQueryData(["solaris-app-push-state", "A"], { subscribed: true });
    client.setQueryData(["v3-entry-bundle", "A"], { privateEntry: true });
    client.setQueryData(["v3-me-summary", "A"], { userId: "A" });
    client.setQueryData(["v3-delegation-notices", "A", "edition"], ["private notice"]);
    client.setQueryData(["v3-notifications-inbox", "A", "edition"], ["private inbox"]);
    client.setQueryData(["v3-follow-entity-details", "A", "signature"], ["private follows"]);
    client.setQueryData(["v3-participation-history", "A"], ["private history"]);
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
    const pending = client.fetchQuery({
      queryKey: ["country-confirmation-access", "A"],
      queryFn: () => new Promise<string>((resolve) => { complete = resolve; }),
    }).catch(() => undefined);
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
    expect(client.getQueryData(["fan-follows", "A"])).toBeUndefined();
    expect(client.getQueryData(["fan-event-reads", "A"])).toBeUndefined();
    expect(client.getQueryData(["fan-profile", "A"])).toBeUndefined();
    expect(client.getQueryData(["fan-taste-ballots", "A"])).toBeUndefined();
    expect(client.getQueryData(["notification-preferences", "A"])).toBeUndefined();
    expect(client.getQueryData(["my-prediction", "round", "A"])).toBeUndefined();
    expect(client.getQueryData(["prediction-history", "A"])).toBeUndefined();
    expect(client.getQueryData(["prediction-movement", "round"])).toBeUndefined();
    expect(client.getQueryData(["solaris-app-push-state", "A"])).toBeUndefined();
    expect(client.getQueryData(["v3-entry-bundle", "A"])).toBeUndefined();
    expect(client.getQueryData(["v3-me-summary", "A"])).toBeUndefined();
    expect(client.getQueryData(["v3-delegation-notices", "A", "edition"])).toBeUndefined();
    expect(client.getQueryData(["v3-notifications-inbox", "A", "edition"])).toBeUndefined();
    expect(client.getQueryData(["v3-follow-entity-details", "A", "signature"])).toBeUndefined();
    expect(client.getQueryData(["v3-participation-history", "A"])).toBeUndefined();
    expect(client.getQueryData(["v3-rollout-probe"])).toBeUndefined();
    expect(
      client.getQueryData(["v3-primary-surface-bundle", "edition", "A"]),
    ).toBeUndefined();
    expect(client.getQueryData(["mysolaris-jury-task", "B", "country", "edition"])).toBe("BBBB");
    expect(client.getQueryData(["countries"])).toEqual(["public"]);
    expect(client.getQueryData(["prediction-rounds", "show"])).toEqual(["public prediction round"]);
    expect(client.getQueryData(["prediction-league", "edition"])).toEqual(["public standings"]);
    clearPrivateAccountQueries(client);
    expect(client.getQueryData(["mysolaris-jury-task", "B", "country", "edition"])).toBeUndefined();
    client.clear();
  });

  it("replaces the protected identity gate immediately on remote sign-out and account change", () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const resetAttention = vi.fn();
    const applySession = createAccountCacheIsolationHandler(client, resetAttention);

    client.setQueryData(["authenticated-identity-gate"], { id: "STALE", email: "stale@example.test" });
    applySession({ id: "A", email: "a@example.test" });
    expect(client.getQueryData(["authenticated-identity-gate"])).toEqual({
      id: "A",
      email: "a@example.test",
    });

    applySession(null);
    expect(client.getQueryData(["authenticated-identity-gate"])).toBeNull();

    applySession({ id: "B", email: "b@example.test" });
    expect(client.getQueryData(["authenticated-identity-gate"])).toEqual({
      id: "B",
      email: "b@example.test",
    });
    expect(client.getQueryData(["fan-session"])).toEqual({
      id: "B",
      email: "b@example.test",
    });
    expect(resetAttention).toHaveBeenCalledTimes(3);
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
