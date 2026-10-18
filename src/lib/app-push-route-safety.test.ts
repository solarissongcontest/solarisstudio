import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const swSource = () => readFileSync("public/sw.js", "utf8");

type NormalizePushRoute = (candidate: unknown) => string;

function loadNormalizePushRoute(
  location: { origin?: string; href?: string } | undefined = {
    origin: "https://studio.solaris.test",
  },
  urlCtor: typeof URL | undefined = URL,
): NormalizePushRoute {
  const source = swSource();
  const start = source.indexOf("function pushBaseOrigin()");
  const endMarker = "\n\nasync function reportPushReceipt";
  const end = source.indexOf(endMarker, start);

  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);

  const functionSource = source.slice(start, end);
  const factory = new Function(
    "self",
    "URL",
    `${functionSource}; return normalizePushRoute;`,
  ) as (
    scope: { location?: { origin?: string; href?: string } },
    url: typeof URL | undefined,
  ) => NormalizePushRoute;

  return factory(location ? { location } : {}, urlCtor);
}

describe("PWA push deep-link safety", () => {
  it("preserves valid internal paths and queries while reserving the push-open hash", () => {
    const normalizePushRoute = loadNormalizePushRoute();

    expect(normalizePushRoute("/results/22/final?view=scoreboard")).toBe(
      "/results/22/final?view=scoreboard",
    );
    expect(normalizePushRoute("/notifications?filter=unread#old-fragment")).toBe(
      "/notifications?filter=unread",
    );
    expect(normalizePushRoute("/")).toBe("/");
  });

  it("fails closed for absolute, protocol-relative, backslash and malformed destinations", () => {
    const normalizePushRoute = loadNormalizePushRoute();

    expect(normalizePushRoute("https://evil.example/phish")).toBe("/");
    expect(normalizePushRoute("//evil.example/phish")).toBe("/");
    expect(normalizePushRoute("/\\evil.example/phish")).toBe("/");
    expect(normalizePushRoute("results/22")).toBe("/");
    expect(normalizePushRoute(null)).toBe("/");
  });

  it("derives the service-worker origin from href when an explicit origin is unavailable", () => {
    const normalizePushRoute = loadNormalizePushRoute({
      href: "https://studio.solaris.test/sw.js",
    });

    expect(normalizePushRoute("/my-solaris?from=push")).toBe(
      "/my-solaris?from=push",
    );
  });

  it("preserves safe internal routes when a tiny service-worker harness omits URL", () => {
    const normalizePushRoute = loadNormalizePushRoute(undefined, undefined);

    expect(normalizePushRoute("/my-solaris")).toBe("/my-solaris");
    expect(normalizePushRoute("/results?round=final#payload-fragment")).toBe(
      "/results?round=final",
    );
    expect(normalizePushRoute("//evil.example/phish")).toBe("/");
    expect(normalizePushRoute("/\\evil.example/phish")).toBe("/");
  });

  it("normalizes both incoming push payloads and persisted notification clicks", () => {
    const source = swSource();

    expect(source).toContain("const route = normalizePushRoute(payload.route)");
    expect(source).toContain(
      "const route = normalizePushRoute(event.notification.data?.route)",
    );
    expect(source).toContain('if (typeof URL !== "function") return safeCandidate');
    expect(source).toContain("const origin = pushBaseOrigin()");
    expect(source).toContain("if (target.origin !== origin) return \"/\"");
    expect(source).toContain("const targetUrl = new URL(route, pushBaseOrigin())");
    expect(source).not.toContain(
      'typeof payload.route === "string" && payload.route.startsWith("/")',
    );
  });
});
