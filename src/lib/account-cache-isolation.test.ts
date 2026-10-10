import { QueryClient } from "@tanstack/react-query";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { clearPrivateAccountQueries } from "./account-cache-isolation";

describe("shared-browser private state", () => {
  it("removes A, preserves public data and prevents A's late response repopulating B", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    client.setQueryData(["countries"], ["public"]);
    client.setQueryData(["mysolaris-jury-task", "A", "country", "edition"], "AAAA");
    let complete: (value: string) => void = () => undefined;
    const pending = client.fetchQuery({ queryKey: ["country-confirmation-access", "A"], queryFn: () => new Promise<string>((resolve) => { complete = resolve; }) }).catch(() => undefined);
    clearPrivateAccountQueries(client);
    client.setQueryData(["mysolaris-jury-task", "B", "country", "edition"], "BBBB");
    complete("OLD ACCOUNT DATA");
    await pending;
    expect(client.getQueryData(["mysolaris-jury-task", "A", "country", "edition"])).toBeUndefined();
    expect(client.getQueryData(["country-confirmation-access", "A"])).toBeUndefined();
    expect(client.getQueryData(["mysolaris-jury-task", "B", "country", "edition"])).toBe("BBBB");
    expect(client.getQueryData(["countries"])).toEqual(["public"]);
    clearPrivateAccountQueries(client);
    expect(client.getQueryData(["mysolaris-jury-task", "B", "country", "edition"])).toBeUndefined();
    client.clear();
  });
  it("namespaces private jury observers and remounts the ballot when accounts change", () => {
    const jury = readFileSync("src/routes/jury-voting.tsx", "utf8");
    expect(jury).toContain("useFanSession");
    expect(jury).toContain('["country-jury-voting-context", userId]');
    expect(jury).toContain('key={`${userId}:${context.country.id}:${openRound.show_id}`}');
    expect(jury).toContain('`solaris:jury-ballot-draft:${userId}:${country.id}:${round.show_id}`');
    expect(jury).not.toContain('`solaris:jury-ballot-draft:${round.show_id}`');
  });
});
