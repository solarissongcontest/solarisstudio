import { supabase as baseSupabase } from "@/integrations/supabase/client";

export type PublicResultAnalysisContext =
  | {
      schemaVersion: number;
      available: false;
      editionId: string;
      showId: string;
      reason: "results_unavailable";
      currentPublic: false;
      seenResultVersionIsCurrent: false | null;
      serverTime: string;
    }
  | {
      schemaVersion: number;
      available: true;
      editionId: string;
      showId: string;
      resultVersion: number;
      resultVersionId: string;
      resultRowCount: number;
      currentPublic: true;
      seenResultVersionIsCurrent: boolean | null;
      serverTime: string;
    };

type RpcError = {
  code?: string;
  message?: string;
  details?: string;
  hint?: string;
};

type RpcResult = {
  data: unknown;
  error: RpcError | null;
};

export type PublicResultAnalysisContextRpcClient = {
  rpc(name: string, params: Record<string, unknown>): Promise<RpcResult>;
};

const rpcClient = baseSupabase as unknown as PublicResultAnalysisContextRpcClient;
const RESULT_VERSION_ID_RE = /^rv1_[0-9a-f]{64}$/;

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function requiredString(value: unknown, field: string) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Result Analysis Context is missing ${field}.`);
  }
  return value;
}

function requiredNonNegativeInteger(value: unknown, field: string) {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new Error(`Result Analysis Context has invalid ${field}.`);
  }
  return value;
}

function rpcFailure(error: RpcError) {
  const detail = error.message?.trim() || error.code?.trim() || "Unknown server error";
  return new Error(`Could not resolve public Result Analysis Context: ${detail}`);
}

export async function loadPublicResultAnalysisContext(
  input: {
    editionId: string;
    showId: string;
    seenResultVersionId?: string | null;
  },
  client: PublicResultAnalysisContextRpcClient = rpcClient,
): Promise<PublicResultAnalysisContext> {
  if (!input.editionId.trim() || !input.showId.trim()) {
    throw new Error("Result Analysis Context requires exact edition and show ids.");
  }

  const seenResultVersionId = input.seenResultVersionId?.trim().toLowerCase() || null;
  if (seenResultVersionId && !RESULT_VERSION_ID_RE.test(seenResultVersionId)) {
    throw new Error("Result Analysis Context has an invalid seen Result Version identity.");
  }

  const { data, error } = await client.rpc("v3_public_result_analysis_context", {
    p_edition_id: input.editionId,
    p_show_id: input.showId,
    p_seen_result_version_id: seenResultVersionId,
  });
  if (error) throw rpcFailure(error);

  const row = asObject(data);
  if (!row) throw new Error("Result Analysis Context returned an invalid response.");

  const schemaVersion = requiredNonNegativeInteger(row.schemaVersion, "schemaVersion");
  const editionId = requiredString(row.editionId, "editionId");
  const showId = requiredString(row.showId, "showId");
  const serverTime = requiredString(row.serverTime, "serverTime");

  if (editionId !== input.editionId || showId !== input.showId) {
    throw new Error("Result Analysis Context response scope does not match the request.");
  }
  if (!Number.isFinite(Date.parse(serverTime))) {
    throw new Error("Result Analysis Context serverTime is invalid.");
  }

  if (row.available !== true) {
    if (row.available !== false || row.reason !== "results_unavailable") {
      throw new Error("Result Analysis Context returned an unknown availability state.");
    }
    if (row.currentPublic !== false) {
      throw new Error("Unavailable Result Analysis Context cannot be public.");
    }
    if (
      row.seenResultVersionIsCurrent !== null
      && row.seenResultVersionIsCurrent !== false
    ) {
      throw new Error("Unavailable Result Analysis Context returned invalid version comparison state.");
    }

    return {
      schemaVersion,
      available: false,
      editionId,
      showId,
      reason: "results_unavailable",
      currentPublic: false,
      seenResultVersionIsCurrent: row.seenResultVersionIsCurrent as false | null,
      serverTime,
    };
  }

  if (row.currentPublic !== true) {
    throw new Error("Available Result Analysis Context must be public.");
  }

  const resultVersion = requiredNonNegativeInteger(row.resultVersion, "resultVersion");
  if (resultVersion < 1) {
    throw new Error("Result Analysis Context resultVersion must be positive.");
  }
  const resultVersionId = requiredString(row.resultVersionId, "resultVersionId").toLowerCase();
  if (!RESULT_VERSION_ID_RE.test(resultVersionId)) {
    throw new Error("Result Analysis Context resultVersionId is invalid.");
  }
  const resultRowCount = requiredNonNegativeInteger(row.resultRowCount, "resultRowCount");
  if (
    row.seenResultVersionIsCurrent !== null
    && typeof row.seenResultVersionIsCurrent !== "boolean"
  ) {
    throw new Error("Result Analysis Context returned invalid version comparison state.");
  }

  return {
    schemaVersion,
    available: true,
    editionId,
    showId,
    resultVersion,
    resultVersionId,
    resultRowCount,
    currentPublic: true,
    seenResultVersionIsCurrent: row.seenResultVersionIsCurrent as boolean | null,
    serverTime,
  };
}
