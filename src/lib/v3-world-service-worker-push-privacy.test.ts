import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

type PushDisplay = { title: string; body: string; tag?: string };
type PushPayload = Record<string, unknown>;

/** Evaluate the actual shipped worker helpers, not a rewritten test model. */
function loadPushDisplay(urlAvailable = true): (payload: PushPayload) => PushDisplay {
  const source = readFileSync("public/sw.js", "utf8");
  const routesStart = source.indexOf("function pushBaseOrigin()");
  const routesEnd = source.indexOf("async function reportPushReceipt(", routesStart);
  const privacyStart = source.indexOf("function isWorldPushRoute(");
  const privacyEnd = source.indexOf('self.addEventListener("push"', privacyStart);

  expect(routesStart).toBeGreaterThanOrEqual(0);
  expect(routesEnd).toBeGreaterThan(routesStart);
  expect(privacyStart).toBeGreaterThan(routesEnd);
  expect(privacyEnd).toBeGreaterThan(privacyStart);

  const factory = new Function(
    "self",
    "URL",
    [
      source.slice(routesStart, routesEnd),
      source.slice(privacyStart, privacyEnd),
      "return resolvePushDisplayContent;",
    ].join("\n"),
  ) as (
    scope: { location: { origin: string } },
    urlClass: typeof URL | undefined,
  ) => (payload: PushPayload) => PushDisplay;

  return factory(
    { location: { origin: "https://solaris.test" } },
    urlAvailable ? URL : undefined,
  );
}

const secret = {
  title: "Private Ethics case about Oland",
  body: "Confidential witness statement",
  tag: "case:secret-person",
  deliveryId: "d4e21a73-2f1e-46a4-8b5a-b59f4830fe9e",
  category: "task",
  eventType: "responsibility.open",
};

describe("TG10 PWA World push receiver confidentiality", () => {
  it.each([
    "/world",
    "/world?tab=cases",
    "/world/court/case-1",
    "/WORLD%2Fcourt/case-1",
    "/world%2fcourt/case-1",
    "/world%252Fcourt/case-1",
    "/%77orld/court/case-1",
    "/%2577orld/court/case-1",
    "/something/../world/court/case-1",
    "/world%2Fethics/case-1",
  ])("redacts the institutional payload for %s without a producer privacy flag", (route) => {
    const result = loadPushDisplay()({ ...secret, route });
    expect(result).toEqual({
      title: "Terra Solaris",
      body: "You have a new institutional update.",
      tag: "world-private:d4e21a73-2f1e-46a4-8b5a-b59f4830fe9e",
    });
    expect(JSON.stringify(result)).not.toContain("Confidential witness");
    expect(JSON.stringify(result)).not.toContain("secret-person");
  });

  it("also classifies encoded World paths in minimal workers without a URL global", () => {
    const result = loadPushDisplay(false)({ ...secret, route: "/%77orld%2Fcourt/1" });
    expect(result.title).toBe("Terra Solaris");
    expect(result.body).not.toContain("Confidential");
  });

  it.each(["/results", "/worldbuilding", "/news?redirect=%2Fworld%2Fcourt", "/countries/oland"])(
    "preserves harmless ordinary notification text at %s",
    (route) => {
      const result = loadPushDisplay()({ ...secret, route });
      expect(result.title).toBe(secret.title);
      expect(result.body).toBe(secret.body);
      expect(result.tag).toBe(secret.tag);
    },
  );

  it("keeps explicit private flags private on non-World destinations", () => {
    expect(loadPushDisplay()({ ...secret, route: "/results", sensitivity: "private" }).title)
      .toBe("Terra Solaris");
  });

  it("never reflects a secret tag when a World notification has no valid delivery UUID", () => {
    const result = loadPushDisplay()({
      ...secret,
      route: "/world%2Fcourt/case-1",
      deliveryId: "case:secret-person",
    });
    expect(result.tag).toBe("world-private");
    expect(JSON.stringify(result)).not.toContain("secret-person");
  });

  it("uses the protected display envelope in the shipped push handler", () => {
    const source = readFileSync("public/sw.js", "utf8");
    const pushStart = source.indexOf('self.addEventListener("push"');
    const showStart = source.indexOf("self.registration.showNotification(", pushStart);
    expect(pushStart).toBeGreaterThan(0);
    expect(showStart).toBeGreaterThan(pushStart);
    expect(source.slice(pushStart, showStart)).toContain("resolvePushDisplayContent(payload)");
    expect(source.slice(pushStart, showStart)).toContain("body: safeContent.body");
    expect(source.slice(pushStart, showStart)).toContain("tag: safeContent.tag");
  });
});
