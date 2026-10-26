import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { GLOBAL_MAINTENANCE_MODE } from "../src/lib/maintenance";
import { assertLocalTargets, staticEnvironment } from "./lib/v3-release-preflight";

type BuiltWorker = {
  fetch(
    request: Request,
    env: Record<string, string>,
    context: {
      waitUntil(promise: Promise<unknown>): void;
      passThroughOnException(): void;
    },
  ): Promise<Response>;
};

// Even this database-free fixture probe must reject inherited hosted bindings.
const environment = staticEnvironment();
for (const [key, value] of Object.entries(environment)) {
  if (value && /(?:^|_)SUPABASE_URL$/.test(key)) {
    assertLocalTargets(value, environment.DATABASE_URL);
  }
}
Object.assign(process.env, environment);
const origin = "http://127.0.0.1:4173";
assertLocalTargets(origin, environment.DATABASE_URL);
const bindings = Object.fromEntries(
  Object.entries(environment).filter(
    (entry): entry is [string, string] => typeof entry[1] === "string",
  ),
);
const pending: Promise<unknown>[] = [];
const context = {
  waitUntil(promise: Promise<unknown>) {
    pending.push(promise);
  },
  passThroughOnException() {},
};
const originalFetch = globalThis.fetch;
let networkAttempts = 0;
const checks: { screen: string; chrome: string; method: string; status: number }[] = [];

function requireProof(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Teaser cutover rejected: ${message}`);
}

try {
  // Requests below invoke the actual built Worker/router directly. No request
  // is sent to a socket, and any accidental SSR data/telemetry fetch fails closed.
  Object.defineProperty(globalThis, "fetch", {
    configurable: true,
    writable: true,
    value: async () => {
      networkAttempts++;
      throw new Error("Fixture-only teaser attempted network access");
    },
  });
  const worker = (await import(pathToFileURL(resolve(".output/server/index.mjs")).href))
    .default as BuiltWorker;
  if (GLOBAL_MAINTENANCE_MODE) {
    for (const screen of ["home", "explore", "participate", "results", "me"]) {
      for (const method of ["GET", "HEAD"]) {
        const initial = new URL(`/terraos-teaser-preview?screen=${screen}`, origin);
        const redirect = await worker.fetch(new Request(initial, { method }), bindings, context);
        requireProof(
          redirect.status === 307 || redirect.status === 308,
          `${screen}/${method} missing canonical-query redirect`,
        );
        const location = redirect.headers.get("location");
        requireProof(location, `${screen}/${method} missing redirect location`);
        const destination = new URL(location, initial);
        requireProof(
          destination.origin === origin && destination.pathname === initial.pathname,
          `${screen}/${method} redirect escaped its local preview route`,
        );
        requireProof(
          destination.searchParams.get("screen") === screen &&
            destination.searchParams.get("chrome") === "full",
          `${screen}/${method} redirect changed fixture identity`,
        );
        for (const chrome of ["full", "content"]) {
          destination.searchParams.set("chrome", chrome);
          const response = await worker.fetch(
            new Request(destination, { method }),
            bindings,
            context,
          );
          requireProof(
            response.status === 200,
            `${screen}/${chrome}/${method} HTTP ${response.status}`,
          );
          requireProof(
            response.headers.get("content-type")?.includes("text/html"),
            `${screen}/${method} is not HTML`,
          );
          const html = await response.text();
          if (method === "GET") {
            requireProof(
              /<meta\b[^>]*name="robots"[^>]*content="noindex,nofollow"/.test(html),
              `${screen}/${chrome} missing robots privacy boundary`,
            );
            requireProof(
              html.includes(`data-terraos-teaser-preview="${screen}"`),
              `${screen}/${chrome} missing actual fixture renderer`,
            );
            requireProof(
              html.includes("v3-screen"),
              `${screen}/${chrome} missing production V3 screen markup`,
            );
          }
          checks.push({ screen, chrome, method, status: response.status });
        }
      }
    }
  } else {
    for (const screen of ["home", "explore", "participate", "results", "me"]) {
      for (const chrome of ["full", "content"]) {
        for (const method of ["GET", "HEAD"]) {
          const response = await worker.fetch(
            new Request(`${origin}/terraos-teaser-preview?screen=${screen}&chrome=${chrome}`, {
              method,
            }),
            bindings,
            context,
          );
          const html = await response.text();
          requireProof(
            response.status === 404,
            `${screen}/${chrome}/${method} exposed preview after launch: HTTP ${response.status}`,
          );
          requireProof(
            !html.includes("data-terraos-teaser-preview="),
            `${screen}/${chrome} exposed fixture markup after launch`,
          );
          checks.push({ screen, chrome, method, status: response.status });
        }
      }
    }
  }
  for (const method of ["POST", "PUT", "DELETE"]) {
    const response = await worker.fetch(
      new Request(`${origin}/terraos-teaser-preview?screen=home&chrome=full`, { method }),
      bindings,
      context,
    );
    const rejected = GLOBAL_MAINTENANCE_MODE
      ? response.status === 503
      : [404, 405].includes(response.status);
    requireProof(
      rejected,
      `${method} escaped the ${GLOBAL_MAINTENANCE_MODE ? "maintenance" : "retired preview"} write boundary`,
    );
  }
  await Promise.all(pending);
  requireProof(
    networkAttempts === 0,
    `fixture rendering attempted ${networkAttempts} outbound requests`,
  );
  console.log(
    JSON.stringify(
      {
        check: "teaserRestrictedCutover",
        passed: true,
        mode: GLOBAL_MAINTENANCE_MODE ? "maintenance-active" : "after-launch",
        transport: "in-memory-production-worker",
        checks,
        networkAttempts,
      },
      null,
      2,
    ),
  );
} finally {
  globalThis.fetch = originalFetch;
}
