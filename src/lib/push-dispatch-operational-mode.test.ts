import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";

// Exercise the actual Edge Function handler without importing Deno's remote
// modules or making network requests. Only its three runtime imports are mocked.
const source = readFileSync(
  resolve("supabase/functions/solaris-push-dispatch/index.ts"),
  "utf8",
).replace(/^import .*;\n/gm, "");
const compiled = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText;

function dispatcher(
  options: {
    mode?: unknown;
    missingState?: boolean;
    stateError?: boolean;
    vapidConfigured?: boolean;
    mutationError?: string;
  } = {},
) {
  let handler!: (request: Request) => Promise<Response>;
  const query = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({
      data: options.missingState ? null : { mode: "mode" in options ? options.mode : "normal" },
      error: options.stateError ? { code: "08006" } : null,
    }),
  };
  const service = {
    from: vi.fn((table: string) => {
      if (table !== "studio2_platform_operational_state") {
        throw new Error(`Unexpected table mutation/read: ${table}`);
      }
      return query;
    }),
    rpc: vi.fn(async (name: string) => {
      if (name === "solaris_get_push_runtime_secrets") {
        return { data: [{ dispatch_secret: "test-dispatch-secret" }], error: null };
      }
      if (options.mutationError) {
        return { data: null, error: { code: options.mutationError } };
      }
      return {
        data: name === "solaris_claim_pending_notification_deliveries" ? [] : 0,
        error: null,
      };
    }),
  };
  const webpush = { setVapidDetails: vi.fn(), sendNotification: vi.fn() };
  const variables: Record<string, string> = {
    SUPABASE_URL: "http://127.0.0.1:54321",
    SUPABASE_SERVICE_ROLE_KEY: "test-service-key",
    ...(options.vapidConfigured === false
      ? {}
      : {
          WEB_PUSH_VAPID_PUBLIC_KEY: "test-public-key",
          WEB_PUSH_VAPID_PRIVATE_KEY: "test-private-key",
        }),
  };
  runInNewContext(compiled, {
    Deno: {
      env: { get: (name: string) => variables[name] },
      serve: (callback: typeof handler) => {
        handler = callback;
      },
    },
    createClient: () => service,
    webpush,
    Response,
    console: { error: vi.fn() },
  });
  const request = (secret = "test-dispatch-secret", method = "POST") =>
    handler(
      new Request("http://localhost/push-dispatch", {
        method,
        headers: { "x-solaris-push-secret": secret },
      }),
    );
  return { request, service, query, webpush };
}

describe("push dispatcher operational mode", () => {
  it.each(["read_only", "maintenance"])(
    "returns a clean authenticated no-op in %s, even without VAPID keys",
    async (mode) => {
      const { request, service, query, webpush } = dispatcher({ mode, vapidConfigured: false });
      const response = await request();
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({
        ok: true,
        skipped: true,
        reason: "platform_writes_suspended",
        mode,
        enqueued: 0,
        examined: 0,
        sent: 0,
        failed: 0,
      });
      expect(service.from).toHaveBeenCalledTimes(1);
      expect(service.from).toHaveBeenCalledWith("studio2_platform_operational_state");
      expect(query.select).toHaveBeenCalledWith("mode");
      expect(query.eq).toHaveBeenCalledWith("singleton", true);
      expect(service.rpc.mock.calls.map(([name]) => name)).toEqual([
        "solaris_get_push_runtime_secrets",
      ]);
      expect(webpush.setVapidDetails).not.toHaveBeenCalled();
      expect(webpush.sendNotification).not.toHaveBeenCalled();
    },
  );

  it.each(["normal", "degraded"])("continues the existing pipeline in %s", async (mode) => {
    const { request, service, webpush } = dispatcher({ mode });
    const response = await request();
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, examined: 0 });
    expect(service.rpc.mock.calls.map(([name]) => name)).toEqual([
      "solaris_get_push_runtime_secrets",
      "solaris_prepare_organizer_task_delivery",
      "solaris_enqueue_app_notifications",
      "solaris_claim_pending_notification_deliveries",
    ]);
    expect(webpush.setVapidDetails).toHaveBeenCalledOnce();
  });

  it.each([
    { missingState: true },
    { stateError: true },
    { mode: "unknown" },
    { mode: null },
    { mode: undefined },
  ])("fails closed when canonical state is unavailable: %j", async (options) => {
    const { request, service, webpush } = dispatcher(options);
    const response = await request();
    expect(response.status).toBe(503);
    expect(service.rpc).toHaveBeenCalledTimes(1);
    expect(webpush.setVapidDetails).not.toHaveBeenCalled();
  });

  it("authenticates before reading operational state", async () => {
    const { request, service } = dispatcher({ mode: "maintenance" });
    expect((await request("wrong-secret")).status).toBe(401);
    expect(service.from).not.toHaveBeenCalled();
  });

  it("still rejects non-POST requests without reading the database", async () => {
    const { request, service } = dispatcher();
    expect((await request("test-dispatch-secret", "GET")).status).toBe(405);
    expect(service.rpc).not.toHaveBeenCalled();
  });

  it("does not swallow database write guards if mode changes after the read", async () => {
    const { request, service } = dispatcher({ mutationError: "25006" });
    expect((await request()).status).toBe(500);
    expect(service.rpc).not.toHaveBeenCalledWith(
      "solaris_enqueue_app_notifications",
      expect.anything(),
    );
  });
});
