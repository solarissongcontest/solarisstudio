import { describe, expect, it, vi } from "vitest";

import {
  preflightCountryFlagCropV3,
  updateCountryFlagCropV3,
  type V3CountryFlagCropRpcClient,
  type V3CountryFlagCropUpdateRequest,
} from "./v3-country-flag-crop-client";

const VERSION_A = "a".repeat(64);
const VERSION_B = "b".repeat(64);

function request(): V3CountryFlagCropUpdateRequest {
  return {
    countryId: "11111111-1111-4111-8111-111111111111",
    crop: { x: 42, y: 58, zoom: 1.2 },
    expectedStateVersion: VERSION_A,
    operationId: "22222222-2222-4222-8222-222222222222",
    idempotencyKey: "flag-crop-11111111-42-58-1.2",
  };
}

function succeededReceipt(input = request()) {
  return {
    status: "succeeded",
    replayed: false,
    result: {
      countryId: input.countryId,
      countryName: "Oland",
      flagImage: "https://example.invalid/oland.png",
      crop: input.crop,
      stateVersion: VERSION_B,
      invalidates: ["country identity projection", "Organizer Country"],
      operationId: input.operationId,
    },
  };
}

describe("V3 country flag crop client", () => {
  it("maps the exact authoritative preflight snapshot", async () => {
    const rpc = vi.fn(async () => ({
      data: {
        countryId: request().countryId,
        countryName: "Oland",
        flagImage: "https://example.invalid/oland.png",
        crop: { x: 50, y: 50, zoom: 1 },
        stateVersion: VERSION_A,
        blockers: [],
        serverTime: "2026-10-23T18:00:00+00:00",
      },
      error: null,
    }));

    const result = await preflightCountryFlagCropV3(request().countryId, { rpc });

    expect(rpc).toHaveBeenCalledWith("studio2_country_flag_crop_preflight", {
      p_country_id: request().countryId,
    });
    expect(result.stateVersion).toBe(VERSION_A);
    expect(result.crop).toEqual({ x: 50, y: 50, zoom: 1 });
  });

  it("passes stable operation identity and the reviewed state version to the canonical command", async () => {
    const input = request();
    const rpc = vi.fn(async () => ({ data: succeededReceipt(input), error: null }));

    const result = await updateCountryFlagCropV3(input, { rpc });

    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("studio2_update_country_flag_crop", {
      p_country_id: input.countryId,
      p_flag_crop_x: 42,
      p_flag_crop_y: 58,
      p_flag_crop_zoom: 1.2,
      p_expected_state_version: VERSION_A,
      p_operation_id: input.operationId,
      p_idempotency_key: input.idempotencyKey,
    });
    expect(result.stateVersion).toBe(VERSION_B);
    expect(result.replayed).toBe(false);
  });

  it("reconciles the same operation after an uncertain transport outcome instead of blind retrying", async () => {
    const input = request();
    const transportError = new Error("network disappeared after commit");
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({ data: null, error: transportError })
      .mockResolvedValueOnce({ data: succeededReceipt(input), error: null });

    const result = await updateCountryFlagCropV3(input, {
      rpc: rpc as unknown as V3CountryFlagCropRpcClient["rpc"],
    });

    expect(rpc).toHaveBeenCalledTimes(2);
    expect(rpc).toHaveBeenNthCalledWith(2, "studio2_reconcile_operation", {
      p_operation_id: input.operationId,
    });
    expect(result.replayed).toBe(true);
    expect(result.operationId).toBe(input.operationId);
  });

  it("surfaces the original mutation error when reconciliation cannot prove success", async () => {
    const input = request();
    const transportError = new Error("uncertain mutation");
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({ data: null, error: transportError })
      .mockResolvedValueOnce({ data: { status: "processing", result: null }, error: null });

    await expect(
      updateCountryFlagCropV3(input, {
        rpc: rpc as unknown as V3CountryFlagCropRpcClient["rpc"],
      }),
    ).rejects.toBe(transportError);
  });

  it("rejects invalid crop geometry before issuing any RPC", async () => {
    const input = request();
    input.crop.zoom = 2.5;
    const rpc = vi.fn();

    await expect(updateCountryFlagCropV3(input, { rpc })).rejects.toThrow(
      "zoom must be between 1 and 2",
    );
    expect(rpc).not.toHaveBeenCalled();
  });
});
