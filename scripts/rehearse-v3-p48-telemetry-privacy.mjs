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

async function expectRejected(label, table, payload) {
  const response = await insert(table, payload);
  if (response.ok) {
    throw new Error(`${label}: handcrafted public insert unexpectedly succeeded`);
  }
}

async function expectAccepted(label, table, payload) {
  const response = await insert(table, payload);
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`${label}: privacy-safe public insert failed (${response.status}): ${body}`);
  }
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
const secret = "abcdefghijklmnopqrstuvwxyzABCDEF0123456789";

await expectRejected(
  "UX pathname query/fragment",
  "public_ux_events",
  uxPayload({ pathname: `/countries/${uuid}?token=${secret}#private` }),
);
await expectRejected(
  "UX pathname UUID",
  "public_ux_events",
  uxPayload({ pathname: `/countries/${uuid}` }),
);
await expectRejected(
  "UX pathname secret-shaped segment",
  "public_ux_events",
  uxPayload({ pathname: `/recovery/${secret}` }),
);
await expectRejected(
  "UX pathname e-mail segment",
  "public_ux_events",
  uxPayload({ pathname: "/account/person@example.com" }),
);
await expectRejected(
  "UX route target query/fragment",
  "public_ux_events",
  uxPayload({ target: `/results/${uuid}?auth=${secret}` }),
);
await expectRejected(
  "UX metadata start_route identifier",
  "public_ux_events",
  uxPayload({ metadata: { start_route: `/jury-voting/${uuid}` } }),
);
await expectRejected(
  "Web Vitals raw route identifier",
  "public_web_vitals",
  vitalPayload(`/shows/${uuid}`),
);
await expectRejected(
  "Web Vitals raw secret route",
  "public_web_vitals",
  vitalPayload(`/recover/${secret}`),
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

console.log("P48 telemetry privacy rehearsal passed against isolated local Supabase.");
