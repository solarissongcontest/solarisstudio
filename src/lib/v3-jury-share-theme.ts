import { supabase as baseSupabase } from "@/integrations/supabase/client";

export type JuryShareThemeState = "draft" | "ready" | "archived" | "invalid";

export type JuryShareValidationIssue = {
  code: string;
  key?: string;
};

export type JuryShareThemeValidation = {
  valid: boolean;
  errors: JuryShareValidationIssue[];
  warnings: JuryShareValidationIssue[];
};

export type JuryShareThemeComposition = {
  artwork: null | {
    assetId: string;
    placement: "top" | "top_fade" | "background" | "bottom" | "bottom_fade" | "full";
    focalX: number;
    focalY: number;
    scale: "cover" | "contain";
    opacity: number;
    blurPx: number;
    fadeDirection: "none" | "up" | "down" | "radial";
    fadeStart: number;
    fadeEnd: number;
    scrimStrength: number;
  };
  scoreboard: {
    inheritEditionScoreboard: true;
    rowRadius: number;
    rowHeight: number;
    topScoreTreatment: "gold" | "edition";
    flagTreatment: "standard" | "framed";
    scoreTreatment: "plain" | "capsule";
  };
  header: {
    alignment: "left" | "center";
    showEditionLogo: boolean;
    titleTreatment: "compact" | "display";
  };
  background: {
    treatment: "edition" | "neutral";
    strength: number;
  };
  footer: {
    sourceCountryTreatment: "name" | "flag_name";
    motifStrength: number;
  };
  decorativeAssets: unknown[];
  safeArea: {
    top: number;
    right: number;
    bottom: number;
    left: number;
  };
};

export type JuryShareThemeVersion = {
  id: string;
  editionId: string;
  version: number;
  state: JuryShareThemeState;
  composition: JuryShareThemeComposition;
  validation: JuryShareThemeValidation;
  activatedAt: string | null;
  archivedAt: string | null;
  updatedAt: string;
};

export type JuryShareThemeSnapshot = {
  editionId: string;
  themes: JuryShareThemeVersion[];
  serverTime: string;
};

export type JuryShareThemeOperationIdentity = {
  operationId: string;
  idempotencyKey: string;
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

export type JuryShareThemeRpcClient = {
  rpc(name: string, params: Record<string, unknown>): Promise<RpcResult>;
};

const rpcClient = baseSupabase as unknown as JuryShareThemeRpcClient;

function objectOrNull(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function stringValue(value: unknown, field: string) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Jury Share theme response is missing ${field}.`);
  }
  return value;
}

function integerValue(value: unknown, field: string) {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new Error(`Jury Share theme response has invalid ${field}.`);
  }
  return value;
}

function rpcFailure(error: RpcError, action: string) {
  const detail = error.message?.trim() || error.code?.trim() || "Unknown server error";
  return new Error(`${action}: ${detail}`);
}

function parseIssues(value: unknown): JuryShareValidationIssue[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((candidate) => {
    const row = objectOrNull(candidate);
    if (!row || typeof row.code !== "string" || !row.code.trim()) return [];
    return [{
      code: row.code,
      key: typeof row.key === "string" ? row.key : undefined,
    }];
  });
}

function parseValidation(value: unknown): JuryShareThemeValidation {
  const row = objectOrNull(value);
  return {
    valid: row?.valid === true,
    errors: parseIssues(row?.errors),
    warnings: parseIssues(row?.warnings),
  };
}

function parseComposition(value: unknown): JuryShareThemeComposition {
  const row = objectOrNull(value);
  if (!row) throw new Error("Jury Share theme response has invalid composition.");
  return row as unknown as JuryShareThemeComposition;
}

function parseTheme(value: unknown): JuryShareThemeVersion {
  const row = objectOrNull(value);
  if (!row) throw new Error("Jury Share theme response contains an invalid theme version.");
  const state = row.state;
  if (state !== "draft" && state !== "ready" && state !== "archived" && state !== "invalid") {
    throw new Error("Jury Share theme response contains an invalid state.");
  }
  return {
    id: stringValue(row.id, "theme id"),
    editionId: stringValue(row.editionId, "edition id"),
    version: integerValue(row.version, "version"),
    state,
    composition: parseComposition(row.composition),
    validation: parseValidation(row.validation),
    activatedAt: typeof row.activatedAt === "string" ? row.activatedAt : null,
    archivedAt: typeof row.archivedAt === "string" ? row.archivedAt : null,
    updatedAt: stringValue(row.updatedAt, "updatedAt"),
  };
}

export function createDefaultJuryShareThemeComposition(artworkAssetId?: string | null): JuryShareThemeComposition {
  return {
    artwork: artworkAssetId
      ? {
          assetId: artworkAssetId,
          placement: "top_fade",
          focalX: 0.5,
          focalY: 0.5,
          scale: "cover",
          opacity: 0.9,
          blurPx: 0,
          fadeDirection: "down",
          fadeStart: 0.18,
          fadeEnd: 0.48,
          scrimStrength: 0.36,
        }
      : null,
    scoreboard: {
      inheritEditionScoreboard: true,
      rowRadius: 28,
      rowHeight: 112,
      topScoreTreatment: "gold",
      flagTreatment: "standard",
      scoreTreatment: "plain",
    },
    header: {
      alignment: "center",
      showEditionLogo: true,
      titleTreatment: "compact",
    },
    background: {
      treatment: "edition",
      strength: 0.72,
    },
    footer: {
      sourceCountryTreatment: "flag_name",
      motifStrength: 0.35,
    },
    decorativeAssets: [],
    safeArea: {
      top: 160,
      right: 72,
      bottom: 190,
      left: 72,
    },
  };
}

export function createJuryShareThemeOperationIdentity(
  input: {
    editionId: string;
    action: "save_draft" | "ready" | "archived";
    version: number;
  },
  randomUuid: () => string = () => globalThis.crypto.randomUUID(),
): JuryShareThemeOperationIdentity {
  if (!input.editionId.trim()) throw new Error("Jury Share edition is required.");
  if (!Number.isInteger(input.version) || input.version < 0) throw new Error("Jury Share version is invalid.");
  const operationId = randomUuid();
  if (!operationId.trim()) throw new Error("Jury Share operation id is required.");
  return {
    operationId,
    idempotencyKey: `jury-share-theme:${input.action}:${input.editionId}:v${input.version}:${operationId}`,
  };
}

export async function loadJuryShareThemeSnapshot(
  editionId: string,
  client: JuryShareThemeRpcClient = rpcClient,
): Promise<JuryShareThemeSnapshot> {
  if (!editionId.trim()) throw new Error("Jury Share edition is required.");
  const { data, error } = await client.rpc("studio2_jury_share_theme_snapshot", {
    p_edition_id: editionId,
  });
  if (error) throw rpcFailure(error, "Could not load Edition share graphics");
  const row = objectOrNull(data);
  if (!row) throw new Error("Jury Share theme snapshot returned an invalid response.");
  const snapshotEditionId = stringValue(row.editionId, "editionId");
  if (snapshotEditionId !== editionId) throw new Error("Jury Share theme snapshot returned the wrong edition.");
  return {
    editionId: snapshotEditionId,
    themes: Array.isArray(row.themes) ? row.themes.map(parseTheme) : [],
    serverTime: stringValue(row.serverTime, "serverTime"),
  };
}

export async function saveJuryShareThemeDraft(
  input: {
    editionId: string;
    composition: JuryShareThemeComposition;
    expectedVersion: number;
    identity: JuryShareThemeOperationIdentity;
  },
  client: JuryShareThemeRpcClient = rpcClient,
): Promise<Record<string, unknown>> {
  const { data, error } = await client.rpc("studio2_save_jury_share_theme_draft", {
    p_edition_id: input.editionId,
    p_composition: input.composition,
    p_expected_version: input.expectedVersion,
    p_operation_id: input.identity.operationId,
    p_idempotency_key: input.identity.idempotencyKey,
    p_correlation_id: input.identity.operationId,
  });
  if (error) throw rpcFailure(error, "Could not save Edition share graphics draft");
  const row = objectOrNull(data);
  if (!row) throw new Error("Jury Share save returned an invalid response.");
  return row;
}

export async function setJuryShareThemeState(
  input: {
    editionId: string;
    version: number;
    targetState: "ready" | "archived";
    identity: JuryShareThemeOperationIdentity;
  },
  client: JuryShareThemeRpcClient = rpcClient,
): Promise<Record<string, unknown>> {
  const { data, error } = await client.rpc("studio2_set_jury_share_theme_state", {
    p_edition_id: input.editionId,
    p_version: input.version,
    p_target_state: input.targetState,
    p_operation_id: input.identity.operationId,
    p_idempotency_key: input.identity.idempotencyKey,
    p_correlation_id: input.identity.operationId,
  });
  if (error) throw rpcFailure(error, `Could not mark Edition share graphics ${input.targetState}`);
  const row = objectOrNull(data);
  if (!row) throw new Error("Jury Share state transition returned an invalid response.");
  return row;
}

export async function reconcileJuryShareThemeOperation(
  operationId: string,
  client: JuryShareThemeRpcClient = rpcClient,
): Promise<Record<string, unknown>> {
  if (!operationId.trim()) throw new Error("Jury Share operation id is required.");
  const { data, error } = await client.rpc("studio2_reconcile_operation", {
    p_operation_id: operationId,
  });
  if (error) throw rpcFailure(error, "Could not reconcile Edition share graphics operation");
  const row = objectOrNull(data);
  if (!row) throw new Error("Jury Share reconciliation returned an invalid response.");
  return row;
}
