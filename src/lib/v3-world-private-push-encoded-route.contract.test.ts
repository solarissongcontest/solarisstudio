import { describe, expect, it } from "vitest";

import {
  isPrivateWorldPush,
  publicPushEnvelope,
} from "../../supabase/functions/_shared/world-private-push";

const sensitive = {
  id: "a1234567-89ab-4cde-8f01-a123456789ab",
  category: "ordinary_notifications",
  event_type: "generic.updated",
  title: "Confidential institutional case title",
  body: "Sealed respondent and allegations",
  dedupe_key: "world/case/secret-subject",
};

describe("TG19 World provider-side encoded-route privacy", () => {
  it.each([
    "/world%2Fcourt/case-1",
    "/world%2fcourt/case-1",
    "/WORLD%2Fcourt/case-1",
    "/w%6Frld/court/case-1",
    "/%77orld/court/case-1",
    "/%2577orld%252fcourt/case-1",
    "/world%252fcourt/case-1",
    "/world%ZZ",
    "/world#private",
    "/world?case=sealed",
    "/world\\court/case-1",
  ])("redacts provider payload for an encoded institutional destination: %s", (route) => {
    expect(isPrivateWorldPush({ route })).toBe(true);
    const envelope = publicPushEnvelope({ ...sensitive, route });
    expect(envelope).toEqual({
      title: "Terra Solaris",
      body: "You have a new institutional update.",
      tag: `world-private:${sensitive.id}`,
      sensitivity: "private",
    });
    expect(JSON.stringify(envelope)).not.toContain(sensitive.title);
    expect(JSON.stringify(envelope)).not.toContain(sensitive.body);
    expect(JSON.stringify(envelope)).not.toContain(sensitive.dedupe_key);
  });

  it.each([
    "/worldwide/news",
    "/worlds",
    "/results/22",
    "/countries/oland",
    "/explore?name=world",
    "/explore#world",
  ])("does not unnecessarily redact unrelated public routes: %s", (route) => {
    const envelope = publicPushEnvelope({ ...sensitive, route });
    expect(envelope).toEqual({
      title: sensitive.title,
      body: sensitive.body,
      tag: sensitive.dedupe_key,
      sensitivity: "public",
    });
  });

  it("keeps category, event and explicit privacy classification authoritative independently of the route", () => {
    expect(isPrivateWorldPush({ category: "world", route: "/results" })).toBe(true);
    expect(isPrivateWorldPush({ event_type: "world.court.filed", route: "/results" })).toBe(true);
    expect(isPrivateWorldPush({ privacy: "sealed", route: "/results" })).toBe(true);
    expect(isPrivateWorldPush({ route: "/results" })).toBe(false);
  });
});
