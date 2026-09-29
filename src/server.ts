import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";
import { GLOBAL_MAINTENANCE_MODE } from "./lib/maintenance";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

type ServerEnv = {
  MAINTENANCE_ADMIN_SECRET?: string;
};

const MAINTENANCE_ADMIN_PATH = "/__maintenance-admin";
const MAINTENANCE_ADMIN_LOGOUT_PATH = "/__maintenance-admin/logout";
const MAINTENANCE_BYPASS_COOKIE = "solaris_maintenance_admin";
const MAINTENANCE_BYPASS_HEADER = "x-solaris-maintenance-bypass";
const MAINTENANCE_BYPASS_VERSION = "v1";
const MAINTENANCE_BYPASS_MAX_AGE_SECONDS = 12 * 60 * 60;

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}

function errorResponse() {
  return new Response(renderErrorPage(), {
    status: 500,
    headers: {
      "cache-control": "no-store",
      "content-type": "text/html; charset=utf-8",
      "x-content-type-options": "nosniff",
    },
  });
}

function maintenanceSecret(env: unknown) {
  const workerEnv = env && typeof env === "object" ? (env as ServerEnv) : undefined;
  return workerEnv?.MAINTENANCE_ADMIN_SECRET ?? process.env.MAINTENANCE_ADMIN_SECRET ?? "";
}

function bytesToHex(bytes: ArrayBuffer) {
  return Array.from(new Uint8Array(bytes))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function sha256Hex(value: string) {
  return bytesToHex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
}

function constantTimeEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

async function hmacHex(secret: string, value: string) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return bytesToHex(await crypto.subtle.sign("HMAC", key, encoder.encode(value)));
}

function readCookie(request: Request, name: string) {
  const cookie = request.headers.get("cookie");
  if (!cookie) return null;

  for (const part of cookie.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return rest.join("=") || null;
  }
  return null;
}

async function createMaintenanceBypassCookie(secret: string) {
  const expiresAt = Math.floor(Date.now() / 1000) + MAINTENANCE_BYPASS_MAX_AGE_SECONDS;
  const payload = `${MAINTENANCE_BYPASS_VERSION}.${expiresAt}`;
  const signature = await hmacHex(secret, payload);
  return `${payload}.${signature}`;
}

async function hasValidMaintenanceBypass(request: Request, secret: string) {
  if (!secret) return false;
  const raw = readCookie(request, MAINTENANCE_BYPASS_COOKIE);
  if (!raw) return false;

  const [version, expiresRaw, signature, ...extra] = raw.split(".");
  if (extra.length || version !== MAINTENANCE_BYPASS_VERSION || !expiresRaw || !signature) {
    return false;
  }

  const expiresAt = Number(expiresRaw);
  if (!Number.isSafeInteger(expiresAt) || expiresAt <= Math.floor(Date.now() / 1000)) {
    return false;
  }

  const payload = `${version}.${expiresRaw}`;
  const expectedSignature = await hmacHex(secret, payload);
  return constantTimeEqual(signature, expectedSignature);
}

function maintenanceAdminPage(message?: string) {
  const escapedMessage = message
    ? message.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
    : "";

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover" />
  <meta name="robots" content="noindex,nofollow" />
  <title>Maintenance access — Solaris Studio</title>
  <style>
    :root { color-scheme: dark; font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    * { box-sizing: border-box; }
    body { margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 24px; background: radial-gradient(circle at 50% 20%, #18254a 0, #080d1b 42%, #03050b 100%); color: #f7f8ff; }
    main { width: min(430px, 100%); padding: 28px; border: 1px solid rgba(255,255,255,.16); border-radius: 24px; background: rgba(12,17,33,.82); box-shadow: 0 24px 70px rgba(0,0,0,.45); backdrop-filter: blur(20px); }
    .eyebrow { margin: 0 0 8px; color: #aeb9dd; font-size: 12px; font-weight: 700; letter-spacing: .14em; text-transform: uppercase; }
    h1 { margin: 0; font-size: 28px; line-height: 1.05; }
    p { color: #c5cbe0; line-height: 1.55; }
    label { display: block; margin-top: 22px; font-size: 13px; font-weight: 700; }
    input { width: 100%; margin-top: 8px; padding: 13px 14px; border: 1px solid rgba(255,255,255,.18); border-radius: 14px; background: rgba(255,255,255,.07); color: white; font: inherit; outline: none; }
    input:focus { border-color: #8ba4ff; box-shadow: 0 0 0 3px rgba(107,135,255,.18); }
    button { width: 100%; margin-top: 14px; padding: 13px 16px; border: 0; border-radius: 14px; background: #f3f6ff; color: #091020; font: inherit; font-weight: 800; cursor: pointer; }
    .message { margin-top: 16px; padding: 11px 12px; border-radius: 12px; background: rgba(255,120,120,.1); color: #ffc9c9; font-size: 13px; }
    .note { margin-top: 18px; font-size: 12px; color: #8f99b8; }
  </style>
</head>
<body>
  <main>
    <p class="eyebrow">Solaris Studio</p>
    <h1>Maintenance access</h1>
    <p>This temporary gate bypasses the public maintenance screen on this browser. It does not grant Solaris account or Organizer permissions.</p>
    <form method="post" action="${MAINTENANCE_ADMIN_PATH}">
      <label for="secret">Maintenance access secret</label>
      <input id="secret" name="secret" type="password" required autocomplete="current-password" autofocus />
      <button type="submit">Open Solaris Studio</button>
    </form>
    ${escapedMessage ? `<div class="message" role="alert">${escapedMessage}</div>` : ""}
    <p class="note">This access is temporary and stored only in a secure HttpOnly cookie.</p>
  </main>
</body>
</html>`;
}

function adminPageResponse(message?: string, status = 200) {
  return new Response(maintenanceAdminPage(message), {
    status,
    headers: {
      "cache-control": "no-store, max-age=0",
      "content-type": "text/html; charset=utf-8",
      "x-content-type-options": "nosniff",
      "x-robots-tag": "noindex, nofollow",
    },
  });
}

function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  return origin === new URL(request.url).origin;
}

async function handleMaintenanceAdminRequest(request: Request, secret: string) {
  if (!GLOBAL_MAINTENANCE_MODE) {
    return Response.redirect(new URL("/", request.url), 303);
  }

  if (!secret) {
    return adminPageResponse(
      "Maintenance admin access is not configured on this deployment.",
      503,
    );
  }

  if (request.method === "GET" || request.method === "HEAD") {
    return request.method === "HEAD" ? new Response(null, { status: 200 }) : adminPageResponse();
  }

  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: { allow: "GET, HEAD, POST" } });
  }

  if (!sameOrigin(request)) {
    return adminPageResponse("Request origin was rejected.", 403);
  }

  const form = await request.formData();
  const submitted = String(form.get("secret") ?? "");
  const [submittedHash, expectedHash] = await Promise.all([
    sha256Hex(submitted),
    sha256Hex(secret),
  ]);

  if (!constantTimeEqual(submittedHash, expectedHash)) {
    return adminPageResponse("Incorrect maintenance access secret.", 401);
  }

  const cookieValue = await createMaintenanceBypassCookie(secret);
  return new Response(null, {
    status: 303,
    headers: {
      location: new URL("/", request.url).toString(),
      "cache-control": "no-store",
      "set-cookie": `${MAINTENANCE_BYPASS_COOKIE}=${cookieValue}; Path=/; Max-Age=${MAINTENANCE_BYPASS_MAX_AGE_SECONDS}; HttpOnly; Secure; SameSite=Strict`,
    },
  });
}

function handleMaintenanceAdminLogout(request: Request) {
  return new Response(null, {
    status: 303,
    headers: {
      location: new URL("/", request.url).toString(),
      "cache-control": "no-store",
      "set-cookie": `${MAINTENANCE_BYPASS_COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict`,
    },
  });
}

async function requestWithMaintenanceBypass(request: Request, secret: string) {
  const headers = new Headers(request.headers);
  // Never trust this header from the public internet. Only this Worker entry may set it.
  headers.delete(MAINTENANCE_BYPASS_HEADER);

  if (GLOBAL_MAINTENANCE_MODE && (await hasValidMaintenanceBypass(request, secret))) {
    headers.set(MAINTENANCE_BYPASS_HEADER, "verified");
  }

  return new Request(request, { headers });
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!isH3SwallowedErrorBody(body)) return response;

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return errorResponse();
}

function isH3SwallowedErrorBody(body: string): boolean {
  try {
    const payload = JSON.parse(body) as { unhandled?: unknown; message?: unknown };
    return payload.unhandled === true && payload.message === "HTTPError";
  } catch {
    return false;
  }
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    try {
      const url = new URL(request.url);
      const secret = maintenanceSecret(env);

      if (url.pathname === MAINTENANCE_ADMIN_PATH) {
        return await handleMaintenanceAdminRequest(request, secret);
      }

      if (url.pathname === MAINTENANCE_ADMIN_LOGOUT_PATH) {
        return handleMaintenanceAdminLogout(request);
      }

      const handler = await getServerEntry();
      const trustedRequest = await requestWithMaintenanceBypass(request, secret);
      const response = await handler.fetch(trustedRequest, env, ctx);
      return await normalizeCatastrophicSsrResponse(response);
    } catch (error) {
      console.error(error);
      return errorResponse();
    }
  },
};
