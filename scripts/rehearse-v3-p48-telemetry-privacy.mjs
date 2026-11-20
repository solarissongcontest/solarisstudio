const supabaseUrl = process.env.E2E_SUPABASE_URL;
const publishableKey = process.env.E2E_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !publishableKey) {
  throw new Error(
    "P48 telemetry privacy rehearsal requires E2E_SUPABASE_URL and E2E_SUPABASE_PUBLISHABLE_KEY from isolated local Supabase.",
  );
}

const endpoint = new URL(supabaseUrl);
if (endpoint.hostname !== "127.0.0.1" && endpoint.hostname !== "localhost") {
  throw new Error(
    `Refusing P48 telemetry privacy rehearsal against non-local Supabase: ${endpoint.origin}`,
  );
}

const restBase = `${endpoint.origin.replace(/\/$/, "")}/rest/v1`;
const commonHeaders = {
  apikey: publishableKey,
  "Content-Type": "application/json",
  Prefer: "return=minimal",
};
const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

async function insert(table, payload) {
  return fetch(`${restBase}/${table}`, {
    method: "POST",
    headers: commonHeaders,
    body: JSON.stringify(payload),
  });
}

async function expectAccepted(label, table, payload) {
  const response = await insert(table, payload);
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`${label}: public insert failed (${response.status}): ${body}`);
  }
}

async function rpcBoolean(functionName, payload) {
  const response = await fetch(`${restBase}/rpc/${functionName}`, {
    method: "POST",
    headers: { apikey: publishableKey, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    throw new Error(`${functionName} failed (${response.status}): ${await response.text()}`);
  }
  return Boolean(await response.json());
}

function uxPayload(overrides = {}) {
  return {
    session_id: `p48-ux-${runId}`.slice(0, 128),
    event_name: "public_nav_clicked",
    pathname: "/explore",
    target: "/countries",
    metadata: {},
    ...overrides,
  };
}

function vitalPayload(pathname) {
  return {
    session_id: `p48-vital-${runId}`.slice(0, 128),
    pathname,
    metric_name: "LCP",
    value: 1234,
    rating: "good",
    device: "desktop",
    viewport_width: 1280,
    viewport_height: 800,
    navigation_type: "navigate",
  };
}

const uuid = "11111111-1111-4111-8111-111111111111";
const encodedUuid = "11111111%2D1111%2D4111%2D8111%2D111111111111";
const secret = "abcdefghijklmnopqrstuvwxyzABCDEF0123456789";

// Existing Public clients may still emit literal UUID route params and query-bearing
// href targets. The database normalizes them before CHECK enforcement, so privacy
// hardening must not disable all later telemetry on the page.
await expectAccepted(
  "Dynamic UX pathname is normalized",
  "public_ux_events",
  uxPayload({ pathname: `/countries/${uuid}?tab=history#private` }),
);
await expectAccepted(
  "Query-bearing UX target is normalized",
  "public_ux_events",
  uxPayload({ target: `/scorecharts?show=grand-final` }),
);
await expectAccepted(
  "Dynamic start route is normalized",
  "public_ux_events",
  uxPayload({ metadata: { start_route: `/jury-voting/${uuid}` } }),
);
await expectAccepted(
  "Dynamic Web Vitals path is normalized",
  "public_web_vitals",
  vitalPayload(`/shows/${uuid}`),
);
await expectAccepted(
  "Encoded identifier path is collapsed by the write boundary",
  "public_ux_events",
  uxPayload({ pathname: `/shows/${encodedUuid}` }),
);
await expectAccepted(
  "Absolute target is reduced to privacy-safe path identity",
  "public_ux_events",
  uxPayload({ target: `https://example.com/recovery/${uuid}?token=${secret}` }),
);

await expectAccepted(
  "Privacy-safe UX route family",
  "public_ux_events",
  uxPayload({
    pathname: "/countries/:id",
    target: "/results/:id",
    metadata: { start_route: "/participate/:id" },
  }),
);
await expectAccepted(
  "Privacy-safe stable UX token",
  "public_ux_events",
  uxPayload({ target: "search:no-results" }),
);
await expectAccepted(
  "Privacy-safe Web Vitals route family",
  "public_web_vitals",
  vitalPayload("/shows/:id"),
);

if (
  await rpcBoolean("studio2_telemetry_path_is_safe", {
    p_value: `/shows/${encodedUuid}`,
    p_max_length: 512,
  })
) {
  throw new Error("Encoded raw UUID path is unsafe at rest but invariant accepted it");
}
if (
  await rpcBoolean("studio2_telemetry_target_is_safe", {
    p_value: `https://example.com/recovery/${uuid}`,
  })
) {
  throw new Error("Absolute diagnostic target is unsafe at rest but invariant accepted it");
}
if (
  !(await rpcBoolean("studio2_telemetry_path_is_safe", {
    p_value: "/shows/:id",
    p_max_length: 512,
  }))
) {
  throw new Error("Normalized route family was unexpectedly rejected");
}

console.log("P48 telemetry privacy rehearsal passed against isolated local Supabase.");
