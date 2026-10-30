import { readFileSync, writeFileSync } from "node:fs";

function replaceExactlyOnce(source, needle, replacement, label) {
  const first = source.indexOf(needle);
  if (first < 0) throw new Error(`Preview preparation could not find ${label}`);
  if (source.indexOf(needle, first + needle.length) >= 0) {
    throw new Error(`Preview preparation found ${label} more than once`);
  }
  return source.slice(0, first) + replacement + source.slice(first + needle.length);
}

const serverPath = "src/server.ts";
let server = readFileSync(serverPath, "utf8");

server = replaceExactlyOnce(
  server,
  `import {\n  GLOBAL_MAINTENANCE_MODE,\n  isMaintenanceHodAppRouteAllowed,\n  maintenanceHodAccessEnabled,\n} from "./lib/maintenance";`,
  `import {\n  isMaintenanceHodAppRouteAllowed,\n  maintenanceHodAccessEnabled,\n} from "./lib/maintenance";`,
  "maintenance import",
);

server = replaceExactlyOnce(
  server,
  `import { renderMaintenancePage } from "./lib/maintenance-page";\n\ntype ServerEntry = {`,
  `import { renderMaintenancePage } from "./lib/maintenance-page";\n\n// Preview builds deliberately keep production source unchanged. The protected\n// preview wrapper disables the public maintenance landing page only after the\n// outer Basic-auth gate below has accepted the request.\nconst GLOBAL_MAINTENANCE_MODE = false;\n\ntype ServerEntry = {`,
  "preview maintenance override insertion point",
);

server = replaceExactlyOnce(
  server,
  `  MAINTENANCE_ADMIN_SECRET?: string;\n  MAINTENANCE_HOD_ACCESS?: string;`,
  `  MAINTENANCE_ADMIN_SECRET?: string;\n  MAINTENANCE_HOD_ACCESS?: string;\n  SOLARIS_V3_PREVIEW_PASSWORD_SHA256?: string;`,
  "preview server binding",
);

const previewHelpers = `
function previewPasswordHash(env: unknown) {
  const hash = serverEnv(env)?.SOLARIS_V3_PREVIEW_PASSWORD_SHA256?.trim().toLowerCase() ?? "";
  return /^[a-f0-9]{64}$/.test(hash) ? hash : "";
}

function previewUnauthorizedResponse() {
  return new Response("Protected Solaris Studio V3 preview", {
    status: 401,
    headers: {
      "cache-control": "no-store, max-age=0",
      "content-type": "text/plain; charset=utf-8",
      "www-authenticate": 'Basic realm="Solaris Studio V3 preview", charset="UTF-8"',
      "x-content-type-options": "nosniff",
      "x-robots-tag": "noindex, nofollow",
    },
  });
}

function previewReadOnlyResponse() {
  return new Response(
    JSON.stringify({
      error: "solaris_v3_preview_read_only",
      message: "This protected V3 preview is inspection-only. Mutations are disabled.",
    }),
    {
      status: 503,
      headers: {
        "cache-control": "no-store, max-age=0",
        "content-type": "application/json; charset=utf-8",
        "x-robots-tag": "noindex, nofollow",
      },
    },
  );
}

function previewBasicPassword(request: Request) {
  const header = request.headers.get("authorization") ?? "";
  if (!header.startsWith("Basic ")) return null;

  try {
    const decoded = atob(header.slice("Basic ".length).trim());
    const separator = decoded.indexOf(":");
    if (separator < 0) return null;
    return decoded.slice(separator + 1);
  } catch {
    return null;
  }
}

async function hasValidV3PreviewAccess(request: Request, expectedHash: string) {
  const password = previewBasicPassword(request);
  if (!password) return false;
  const submittedHash = await sha256Hex(password);
  return constantTimeEqual(submittedHash, expectedHash);
}

`;

server = replaceExactlyOnce(
  server,
  `export default {\n  async fetch(request: Request, env: unknown, ctx: unknown) {`,
  `${previewHelpers}export default {\n  async fetch(request: Request, env: unknown, ctx: unknown) {`,
  "preview access helpers insertion point",
);

server = replaceExactlyOnce(
  server,
  `      const url = new URL(request.url);\n      const secret = maintenanceSecret(env);`,
  `      const url = new URL(request.url);\n      const previewHash = previewPasswordHash(env);\n      if (previewHash) {\n        if (!(await hasValidV3PreviewAccess(request, previewHash))) {\n          return previewUnauthorizedResponse();\n        }\n        if (request.method !== "GET" && request.method !== "HEAD") {\n          return previewReadOnlyResponse();\n        }\n      }\n\n      const secret = maintenanceSecret(env);`,
  "preview access enforcement point",
);

server = replaceExactlyOnce(
  server,
  `      return normalized;\n    } catch (error) {`,
  `      if (previewHash) {\n        const headers = new Headers(normalized.headers);\n        headers.set("cache-control", "no-store, max-age=0");\n        headers.set("x-robots-tag", "noindex, nofollow");\n        return new Response(normalized.body, {\n          status: normalized.status,\n          statusText: normalized.statusText,\n          headers,\n        });\n      }\n\n      return normalized;\n    } catch (error) {`,
  "preview response hardening point",
);

writeFileSync(serverPath, server);

const clientPath = "src/integrations/supabase/client.ts";
let client = readFileSync(clientPath, "utf8");
client = replaceExactlyOnce(
  client,
  `function createSupabaseFetch(supabaseKey: string): typeof fetch {\n  return (input, init) => {\n    const headers = new Headers(`,
  `function createSupabaseFetch(supabaseKey: string): typeof fetch {\n  const previewReadOnly = import.meta.env.VITE_SOLARIS_V3_PREVIEW_READ_ONLY === 'true';\n\n  return (input, init) => {\n    const method = (\n      init?.method ??\n      (typeof Request !== 'undefined' && input instanceof Request ? input.method : 'GET')\n    ).toUpperCase();\n\n    if (previewReadOnly && method !== 'GET' && method !== 'HEAD') {\n      return Promise.resolve(\n        new Response(\n          JSON.stringify({\n            error: 'solaris_v3_preview_read_only',\n            message: 'Supabase mutations are disabled in the protected V3 preview.',\n          }),\n          {\n            status: 503,\n            headers: { 'content-type': 'application/json; charset=utf-8' },\n          },\n        ),\n      );\n    }\n\n    const headers = new Headers(`,
  "browser Supabase read-only guard",
);
writeFileSync(clientPath, client);

console.log("Prepared protected read-only Solaris Studio V3 preview source.");
