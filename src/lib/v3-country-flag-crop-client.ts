import { supabase } from "@/integrations/supabase/client";

export type V3FlagCrop = {
  x: number;
  y: number;
  zoom: number;
};

export type V3CountryFlagCropPreflight = {
  countryId: string;
  countryName: string;
  flagImage: string | null;
  crop: V3FlagCrop;
  stateVersion: string;
  blockers: string[];
  serverTime: string;
};

export type V3CountryFlagCropUpdateRequest = {
  countryId: string;
  crop: V3FlagCrop;
  expectedStateVersion: string;
  operationId: string;
  idempotencyKey: string;
};

export type V3CountryFlagCropUpdateResult = {
  countryId: string;
  countryName: string;
  flagImage: string;
  crop: V3FlagCrop;
  stateVersion: string;
  invalidates: string[];
  operationId: string;
  replayed: boolean;
};

type RpcResult = PromiseLike<{ data: unknown; error: unknown }>;
export type V3CountryFlagCropRpcClient = {
  rpc(name: string, args?: Record<string, unknown>): RpcResult;
};

const defaultClient = supabase as unknown as V3CountryFlagCropRpcClient;

function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Invalid ${label}: expected an object.`);
  }
  return value as Record<string, unknown>;
}

function string(value: unknown, label: string): string {
  if (typeof value !== "string" || !value) {
    throw new Error(`Invalid ${label}: expected a string.`);
  }
  return value;
}

function nullableString(value: unknown, label: string): string | null {
  if (value === null) return null;
  return string(value, label);
}

function number(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`Invalid ${label}: expected a finite number.`);
  }
  return value;
}

function stringArray(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error(`Invalid ${label}: expected a string array.`);
  }
  return value as string[];
}

function mapCrop(value: unknown): V3FlagCrop {
  const crop = object(value, "country flag crop");
  const mapped = {
    x: number(crop.x, "flag crop x"),
    y: number(crop.y, "flag crop y"),
    zoom: number(crop.zoom, "flag crop zoom"),
  };
  if (mapped.x < 0 || mapped.x > 100 || mapped.y < 0 || mapped.y > 100) {
    throw new Error("Invalid country flag crop: focus must be between 0 and 100.");
  }
  if (mapped.zoom < 1 || mapped.zoom > 2) {
    throw new Error("Invalid country flag crop: zoom must be between 1 and 2.");
  }
  return mapped;
}

function stateVersion(value: unknown): string {
  const version = string(value, "country flag crop state version");
  if (!/^[0-9a-f]{64}$/.test(version)) {
    throw new Error("Invalid country flag crop state version.");
  }
  return version;
}

export async function preflightCountryFlagCropV3(
  countryId: string,
  client: V3CountryFlagCropRpcClient = defaultClient,
): Promise<V3CountryFlagCropPreflight> {
  if (!countryId) throw new Error("Country flag crop preflight requires a country id.");

  const { data, error } = await client.rpc("studio2_country_flag_crop_preflight", {
    p_country_id: countryId,
  });
  if (error) throw error;

  const result = object(data, "country flag crop preflight");
  const mapped: V3CountryFlagCropPreflight = {
    countryId: string(result.countryId, "country id"),
    countryName: string(result.countryName, "country name"),
    flagImage: nullableString(result.flagImage, "flag image"),
    crop: mapCrop(result.crop),
    stateVersion: stateVersion(result.stateVersion),
    blockers: stringArray(result.blockers, "flag crop blockers"),
    serverTime: string(result.serverTime, "server time"),
  };

  if (mapped.countryId !== countryId) {
    throw new Error("Country flag crop preflight returned a different country.");
  }
  return mapped;
}

function mapSuccessfulReceipt(
  value: unknown,
  request: V3CountryFlagCropUpdateRequest,
): V3CountryFlagCropUpdateResult | null {
  const receipt = object(value, "country flag crop operation receipt");
  if (receipt.status !== "succeeded" || receipt.result === null || receipt.result === undefined) {
    return null;
  }

  const result = object(receipt.result, "country flag crop operation result");
  const mapped: V3CountryFlagCropUpdateResult = {
    countryId: string(result.countryId, "country id"),
    countryName: string(result.countryName, "country name"),
    flagImage: string(result.flagImage, "flag image"),
    crop: mapCrop(result.crop),
    stateVersion: stateVersion(result.stateVersion),
    invalidates: stringArray(result.invalidates, "projection invalidations"),
    operationId: string(result.operationId, "operation id"),
    replayed: receipt.replayed === true,
  };

  if (mapped.countryId !== request.countryId) {
    throw new Error("Country flag crop receipt belongs to a different country.");
  }
  if (mapped.operationId !== request.operationId) {
    throw new Error("Country flag crop receipt belongs to a different operation.");
  }
  return mapped;
}

/**
 * Apply the exact crop state reviewed by Organizer. Transport failures reconcile
 * the same operation once before surfacing the original error; the caller must
 * never invent a blind second mutation with a fresh operation id.
 */
export async function updateCountryFlagCropV3(
  request: V3CountryFlagCropUpdateRequest,
  client: V3CountryFlagCropRpcClient = defaultClient,
): Promise<V3CountryFlagCropUpdateResult> {
  if (!request.countryId || !request.operationId || !request.idempotencyKey) {
    throw new Error("Country flag crop update requires stable operation identity.");
  }
  stateVersion(request.expectedStateVersion);
  mapCrop(request.crop);

  const { data, error } = await client.rpc("studio2_update_country_flag_crop", {
    p_country_id: request.countryId,
    p_flag_crop_x: request.crop.x,
    p_flag_crop_y: request.crop.y,
    p_flag_crop_zoom: request.crop.zoom,
    p_expected_state_version: request.expectedStateVersion,
    p_operation_id: request.operationId,
    p_idempotency_key: request.idempotencyKey,
  });

  if (!error) {
    const mapped = mapSuccessfulReceipt(data, request);
    if (!mapped) throw new Error("Country flag crop operation did not complete successfully.");
    return mapped;
  }

  const { data: reconciliation, error: reconciliationError } = await client.rpc(
    "studio2_reconcile_operation",
    { p_operation_id: request.operationId },
  );

  if (!reconciliationError) {
    try {
      const reconciled = mapSuccessfulReceipt(reconciliation, request);
      if (reconciled) return { ...reconciled, replayed: true };
    } catch {
      // Preserve the mutation error when reconciliation is malformed or belongs
      // to another operation/country rather than accepting ambiguous state.
    }
  }

  throw error;
}
