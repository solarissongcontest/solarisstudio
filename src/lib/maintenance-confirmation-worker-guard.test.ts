import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { emptyPayload } from "./ssc";
import {
  reconcileMaintenanceEdit,
  submitMaintenanceConfirmation,
} from "./maintenance-confirmation-editor";

const base = {
  ...emptyPayload("00000000-0000-4000-8000-000000000001"),
  browser_session_id: "local-fixture-session",
  edit_token: "local-fixture-edit-token",
};
const response = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });

afterEach(() => vi.unstubAllGlobals());

describe("maintenance Confirmation transport (mocked, no hosted traffic)", () => {
  it("treats a rejected 400 as definitive without reconciling or retrying", async () => {
    const fetchMock = vi.fn().mockResolvedValue(response({ error: "invalid_request" }, 400));
    vi.stubGlobal("fetch", fetchMock);
    expect(await submitMaintenanceConfirmation(base)).toMatchObject({
      ok: false, error: "invalid_request",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/maintenance-confirmation");
  });

  it("reconciles the exact idempotency key after a lost submit response", async () => {
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new TypeError("connection lost after write"))
      .mockResolvedValueOnce(response({ found: true, ok: true, submission_id: "existing-response" }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await submitMaintenanceConfirmation(base)).toMatchObject({
      found: true, ok: true, submission_id: "existing-response",
    });
    const save = JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string);
    const reconcile = JSON.parse(fetchMock.mock.calls[1]?.[1]?.body as string);
    expect(save.action).toBe("submit");
    expect(reconcile.action).toBe("reconcile");
    expect(reconcile.idempotency_key).toBe(save.idempotency_key);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("never sends another save when the operation outcome is unresolved", async () => {
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new TypeError("network interrupted"))
      .mockResolvedValueOnce(response({ found: false }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await submitMaintenanceConfirmation(base)).toMatchObject({
      ok: false, error: "submission_uncertain",
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("checks an existing operation directly without a second submission", async () => {
    const fetchMock = vi.fn().mockResolvedValue(response({ found: true, ok: true }));
    vi.stubGlobal("fetch", fetchMock);
    const operationId = "00000000-0000-4000-8000-000000000002";
    expect((await reconcileMaintenanceEdit(operationId, base.browser_session_id)).found).toBe(true);
    const sent = JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string);
    expect(sent.action).toBe("reconcile");
    expect(sent.idempotency_key).toBe(operationId);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("Cloudflare emergency Confirmation POST isolation", () => {
  const server = readFileSync("src/server.ts", "utf8");
  const api = readFileSync("src/routes/api/maintenance-confirmation.ts", "utf8");
  const editor = readFileSync("src/components/MaintenanceConfirmationEditor.tsx", "utf8");
  const runtime = readFileSync("src/integrations/confirmations/public-runtime.server.ts", "utf8");

  it("checks maintenance, explicit HoD enablement, exact path, and POST before direct routing", () => {
    expect(server).toMatch(/GLOBAL_MAINTENANCE_MODE\s*&&\s*hod\.enabled\s*&&\s*url\.pathname === MAINTENANCE_CONFIRMATION_API_PATH\s*&&\s*request\.method === "POST"/);
    expect(server).toContain("handleMaintenanceConfirmationRequest(request, serverEnv(env))");
    expect(api).toContain("if (!GLOBAL_MAINTENANCE_MODE)");
    expect(api).toContain("if (!sameOrigin(request))");
    expect(api).toContain('rpc<ConfirmationSubmitResult>("v3_submit_confirmation"');
    expect(api).toContain('rpc<ConfirmationSubmitResult>("v3_reconcile_confirmation"');
    expect(runtime).toContain("createConfirmationPublicRuntimeClient(runtime?: ConfirmationRuntimeEnv)");
    expect(runtime).toContain("canonicalSupabaseConfig(runtime)");
    expect(api).toContain("createConfirmationPublicRuntimeClient(runtime)");
  });

  it("blocks new save while a prior edit is awaiting authoritative reconciliation", () => {
    expect(editor).toContain("if (busy || uncertainOperationId) return");
    expect(editor).toContain("Check whether this edit was saved");
    expect(editor).toContain("result.found === true");
    expect(editor).toContain("result.found === false");
  });
});
