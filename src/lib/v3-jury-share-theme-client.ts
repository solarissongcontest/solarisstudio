import { supabase as typedSupabase } from "@/integrations/supabase/client";

export type JuryShareThemeState = "draft" | "ready" | "archived" | "invalid";

export type JuryShareThemeValidationIssue = {
  code: string;
  key?: string;
  detail?: string;
};

export type JuryShareThemeValidation = {
  valid: boolean;
  errors: JuryShareThemeValidationIssue[];
  warnings: JuryShareThemeValidationIssue[];
};

export type JuryShareArtworkPlacement =
  | "top"
  | "top_fade"
  | "background"
  | "bottom"
  | "bottom_fade"
  | "full";

export type JuryShareFadeDirection = "none" | "up" | "down" | "radial";

export type JuryShareEditionComposition = {
  artwork: null | {
    assetId: string;
    placement: JuryShareArtworkPlacement;
    focalX: number;
    focalY: number;
    scale: "cover" | "contain";
    opacity: number;
    blurPx: number;
    fadeDirection: JuryShareFadeDirection;
    fadeStart: number;
    fadeEnd: number;
    scrimStrength: number;
  };
  scoreboard: {
    inheritEditionScoreboard: boolean;
    rowRadius: number;
    rowHeight: number;
    standardRowBackground: string;
    standardRowForeground: string;
    twelvePointBackground: string;
    twelvePointForeground: string;
    flagTreatment: "plain" | "soft_frame" | "edition";
    scoreTreatment: "plain" | "capsule" | "edition";
    scoreTypography: "edition" | "system_bold";
  };
  header: {
    logoMode: "edition" | "solaris" | "none";
    alignment: "left" | "center" | "right";
    titleTreatment: "edition" | "system";
  };
  background: {
    baseColor: string;
    treatment: "flat" | "artwork" | "artwork_scrim";
  };
  footer: {
    sourceCountryTreatment: "edition" | "system";
    backgroundTreatment: "none" | "soft_panel";
    motif: "none" | "edition";
  };
  decorativeAssets: Array<{
    assetId: string;
    placement: "top" | "bottom" | "background";
    opacity: number;
  }>;
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
  composition: JuryShareEditionComposition;
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

export type JuryShareThemeMutationResult = {
  editionId: string;
  themeId: string;
  version: number;
  state: JuryShareThemeState;
  validation: JuryShareThemeValidation;
  operationId: string;
  replayed: boolean;
};

export type JuryShareThemeOperationIdentity = {
  operationId: string;
  idempotencyKey: string;
};

type RpcResult = PromiseLike<{ data: unknown; error: unknown }>;
export type JuryShareThemeRpcClient = {
  rpc(name: string, args?: Record<string, unknown>): RpcResult;
};

const rpcClient = typedSupabase as unknown as JuryShareThemeRpcClient;

const HEX_COLOR = /^#[0-9a-f]{6}$/i;

export const DEFAULT_JURY_SHARE_EDITION_COMPOSITION: JuryShareEditionComposition = {
  artwork: null,
  scoreboard: {
    inheritEditionScoreboard: true,
    rowRadius: 28,
    rowHeight: 108,
    standardRowBackground: "#244f87",
    standardRowForeground: "#ffffff",
    twelvePointBackground: "#f0d596",
    twelvePointForeground: "#13213b",
    flagTreatment: "edition",
    scoreTreatment: "edition",
    scoreTypography: "edition",
  },
  header: {
    logoMode: "edition",
    alignment: "center",
    titleTreatment: "edition",
  },
  background: {
    baseColor: "#07152f",
    treatment: "artwork_scrim",
  },
  footer: {
    sourceCountryTreatment: "edition",
    backgroundTreatment: "none",
    motif: "edition",
  },
  decorativeAssets: [],
  safeArea: {
    top: 192,
    right: 72,
    bottom: 240,
    left: 72,
  },
};

function expectObject(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Invalid ${label}: expected an object.`);
  }
  return value as Record<string, unknown>;
}

function expectString(value: unknown, label: string): string {
  if (typeof value !== "string" || !value) {
    throw new Error(`Invalid ${label}: expected a string.`);
  }
  return value;
}

function expectNullableString(value: unknown, label: string): string | null {
  if (value === null || value === undefined) return null;
  return expectString(value, label);
}

function expectInteger(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new Error(`Invalid ${label}: expected an integer.`);
  }
  return value;
}

function expectBoolean(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") {
    throw new Error(`Invalid ${label}: expected a boolean.`);
  }
  return value;
}

function expectNumber(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`Invalid ${label}: expected a finite number.`);
  }
  return value;
}

function expectEnum<T extends string>(value: unknown, values: readonly T[], label: string): T {
  if (typeof value !== "string" || !values.includes(value as T)) {
    throw new Error(`Invalid ${label}.`);
  }
  return value as T;
}

function parseIssue(value: unknown): JuryShareThemeValidationIssue {
  const issue = expectObject(value, "theme validation issue");
  return {
    code: expectString(issue.code, "theme validation issue code"),
    key: typeof issue.key === "string" ? issue.key : undefined,
    detail: typeof issue.detail === "string" ? issue.detail : undefined,
  };
}

function parseValidation(value: unknown): JuryShareThemeValidation {
  const validation = expectObject(value, "theme validation");
  const errors = Array.isArray(validation.errors) ? validation.errors.map(parseIssue) : [];
  const warnings = Array.isArray(validation.warnings) ? validation.warnings.map(parseIssue) : [];
  return {
    valid: expectBoolean(validation.valid, "theme validation valid flag"),
    errors,
    warnings,
  };
}

function parseComposition(value: unknown): JuryShareEditionComposition {
  const composition = expectObject(value, "Jury Share Edition composition");
  const scoreboard = expectObject(composition.scoreboard, "Jury Share scoreboard");
  const header = expectObject(composition.header, "Jury Share header");
  const background = expectObject(composition.background, "Jury Share background");
  const footer = expectObject(composition.footer, "Jury Share footer");
  const safeArea = expectObject(composition.safeArea, "Jury Share safe area");

  let artwork: JuryShareEditionComposition["artwork"] = null;
  if (composition.artwork !== null && composition.artwork !== undefined) {
    const rawArtwork = expectObject(composition.artwork, "Jury Share artwork");
    artwork = {
      assetId: expectString(rawArtwork.assetId, "Jury Share artwork asset"),
      placement: expectEnum(
        rawArtwork.placement,
        ["top", "top_fade", "background", "bottom", "bottom_fade", "full"] as const,
        "Jury Share artwork placement",
      ),
      focalX: expectNumber(rawArtwork.focalX, "Jury Share artwork focal X"),
      focalY: expectNumber(rawArtwork.focalY, "Jury Share artwork focal Y"),
      scale: expectEnum(rawArtwork.scale, ["cover", "contain"] as const, "Jury Share artwork scale"),
      opacity: expectNumber(rawArtwork.opacity, "Jury Share artwork opacity"),
      blurPx: expectNumber(rawArtwork.blurPx, "Jury Share artwork blur"),
      fadeDirection: expectEnum(
        rawArtwork.fadeDirection,
        ["none", "up", "down", "radial"] as const,
        "Jury Share artwork fade direction",
      ),
      fadeStart: expectNumber(rawArtwork.fadeStart, "Jury Share artwork fade start"),
      fadeEnd: expectNumber(rawArtwork.fadeEnd, "Jury Share artwork fade end"),
      scrimStrength: expectNumber(rawArtwork.scrimStrength, "Jury Share artwork scrim"),
    };
  }

  const decorativeAssets = Array.isArray(composition.decorativeAssets)
    ? composition.decorativeAssets.map((value) => {
        const asset = expectObject(value, "Jury Share decorative asset");
        return {
          assetId: expectString(asset.assetId, "Jury Share decorative asset id"),
          placement: expectEnum(
            asset.placement,
            ["top", "bottom", "background"] as const,
            "Jury Share decorative asset placement",
          ),
          opacity: expectNumber(asset.opacity, "Jury Share decorative asset opacity"),
        };
      })
    : [];

  return {
    artwork,
    scoreboard: {
      inheritEditionScoreboard: expectBoolean(
        scoreboard.inheritEditionScoreboard,
        "Jury Share scoreboard inheritance",
      ),
      rowRadius: expectNumber(scoreboard.rowRadius, "Jury Share row radius"),
      rowHeight: expectNumber(scoreboard.rowHeight, "Jury Share row height"),
      standardRowBackground: expectString(
        scoreboard.standardRowBackground,
        "Jury Share normal row background",
      ),
      standardRowForeground: expectString(
        scoreboard.standardRowForeground,
        "Jury Share normal row foreground",
      ),
      twelvePointBackground: expectString(
        scoreboard.twelvePointBackground,
        "Jury Share 12-point background",
      ),
      twelvePointForeground: expectString(
        scoreboard.twelvePointForeground,
        "Jury Share 12-point foreground",
      ),
      flagTreatment: expectEnum(
        scoreboard.flagTreatment,
        ["plain", "soft_frame", "edition"] as const,
        "Jury Share flag treatment",
      ),
      scoreTreatment: expectEnum(
        scoreboard.scoreTreatment,
        ["plain", "capsule", "edition"] as const,
        "Jury Share score treatment",
      ),
      scoreTypography: expectEnum(
        scoreboard.scoreTypography,
        ["edition", "system_bold"] as const,
        "Jury Share score typography",
      ),
    },
    header: {
      logoMode: expectEnum(
        header.logoMode,
        ["edition", "solaris", "none"] as const,
        "Jury Share header logo",
      ),
      alignment: expectEnum(
        header.alignment,
        ["left", "center", "right"] as const,
        "Jury Share header alignment",
      ),
      titleTreatment: expectEnum(
        header.titleTreatment,
        ["edition", "system"] as const,
        "Jury Share header title treatment",
      ),
    },
    background: {
      baseColor: expectString(background.baseColor, "Jury Share background color"),
      treatment: expectEnum(
        background.treatment,
        ["flat", "artwork", "artwork_scrim"] as const,
        "Jury Share background treatment",
      ),
    },
    footer: {
      sourceCountryTreatment: expectEnum(
        footer.sourceCountryTreatment,
        ["edition", "system"] as const,
        "Jury Share footer country treatment",
      ),
      backgroundTreatment: expectEnum(
        footer.backgroundTreatment,
        ["none", "soft_panel"] as const,
        "Jury Share footer background treatment",
      ),
      motif: expectEnum(
        footer.motif,
        ["none", "edition"] as const,
        "Jury Share footer motif",
      ),
    },
    decorativeAssets,
    safeArea: {
      top: expectNumber(safeArea.top, "Jury Share safe area top"),
      right: expectNumber(safeArea.right, "Jury Share safe area right"),
      bottom: expectNumber(safeArea.bottom, "Jury Share safe area bottom"),
      left: expectNumber(safeArea.left, "Jury Share safe area left"),
    },
  };
}

function parseThemeVersion(value: unknown): JuryShareThemeVersion {
  const row = expectObject(value, "Jury Share theme version");
  return {
    id: expectString(row.id, "Jury Share theme id"),
    editionId: expectString(row.editionId, "Jury Share theme edition id"),
    version: expectInteger(row.version, "Jury Share theme version"),
    state: expectEnum(
      row.state,
      ["draft", "ready", "archived", "invalid"] as const,
      "Jury Share theme state",
    ),
    composition: parseComposition(row.composition),
    validation: parseValidation(row.validation),
    activatedAt: expectNullableString(row.activatedAt, "Jury Share activated time"),
    archivedAt: expectNullableString(row.archivedAt, "Jury Share archived time"),
    updatedAt: expectString(row.updatedAt, "Jury Share updated time"),
  };
}

function parseMutationResult(value: unknown, operationId: string): JuryShareThemeMutationResult {
  const envelope = expectObject(value, "Jury Share operation receipt");
  const resultValue = envelope.result ?? value;
  const result = expectObject(resultValue, "Jury Share operation result");
  const returnedOperationId = expectString(result.operationId, "Jury Share operation id");
  if (returnedOperationId !== operationId) {
    throw new Error("Jury Share operation receipt belongs to a different operation.");
  }
  return {
    editionId: expectString(result.editionId, "Jury Share result edition id"),
    themeId: expectString(result.themeId, "Jury Share result theme id"),
    version: expectInteger(result.version, "Jury Share result version"),
    state: expectEnum(
      result.state,
      ["draft", "ready", "archived", "invalid"] as const,
      "Jury Share result state",
    ),
    validation: parseValidation(result.validation),
    operationId: returnedOperationId,
    replayed: envelope.replayed === true,
  };
}

function parseSuccessfulReconciliation(
  value: unknown,
  operationId: string,
): JuryShareThemeMutationResult | null {
  const receipt = expectObject(value, "Jury Share reconciliation receipt");
  if (receipt.status !== "succeeded" || receipt.result === null || receipt.result === undefined) {
    return null;
  }
  return parseMutationResult(receipt, operationId);
}

export function validateJuryShareEditionComposition(
  composition: JuryShareEditionComposition,
): JuryShareThemeValidation {
  const errors: JuryShareThemeValidationIssue[] = [];
  const warnings: JuryShareThemeValidationIssue[] = [];
  const numericRange = (
    value: number,
    min: number,
    max: number,
    code: string,
    key: string,
  ) => {
    if (!Number.isFinite(value) || value < min || value > max) errors.push({ code, key });
  };

  for (const [key, color] of [
    ["standardRowBackground", composition.scoreboard.standardRowBackground],
    ["standardRowForeground", composition.scoreboard.standardRowForeground],
    ["twelvePointBackground", composition.scoreboard.twelvePointBackground],
    ["twelvePointForeground", composition.scoreboard.twelvePointForeground],
    ["baseColor", composition.background.baseColor],
  ] as const) {
    if (!HEX_COLOR.test(color)) errors.push({ code: "COLOR_INVALID", key });
  }

  numericRange(composition.scoreboard.rowRadius, 0, 72, "ROW_RADIUS_INVALID", "rowRadius");
  numericRange(composition.scoreboard.rowHeight, 72, 128, "ROW_HEIGHT_INVALID", "rowHeight");
  numericRange(composition.safeArea.top, 0, 600, "SAFE_AREA_INVALID", "top");
  numericRange(composition.safeArea.bottom, 0, 600, "SAFE_AREA_INVALID", "bottom");
  numericRange(composition.safeArea.left, 0, 300, "SAFE_AREA_INVALID", "left");
  numericRange(composition.safeArea.right, 0, 300, "SAFE_AREA_INVALID", "right");

  if (composition.safeArea.top + composition.safeArea.bottom >= 1920) {
    errors.push({ code: "SAFE_AREA_VERTICAL_INVALID" });
  }
  if (composition.safeArea.left + composition.safeArea.right >= 1080) {
    errors.push({ code: "SAFE_AREA_HORIZONTAL_INVALID" });
  }

  const availableHeight = 1920 - composition.safeArea.top - composition.safeArea.bottom;
  const rowsHeight = composition.scoreboard.rowHeight * 10;
  if (rowsHeight > availableHeight - 320) {
    errors.push({
      code: "TEN_ROWS_DO_NOT_FIT",
      detail: "Ten score rows plus header/footer do not fit inside the configured Story safe area.",
    });
  }

  if (composition.artwork) {
    numericRange(composition.artwork.focalX, 0, 1, "ARTWORK_FOCAL_INVALID", "focalX");
    numericRange(composition.artwork.focalY, 0, 1, "ARTWORK_FOCAL_INVALID", "focalY");
    numericRange(composition.artwork.opacity, 0, 1, "ARTWORK_OPACITY_INVALID", "opacity");
    numericRange(composition.artwork.blurPx, 0, 40, "ARTWORK_BLUR_INVALID", "blurPx");
    numericRange(
      composition.artwork.scrimStrength,
      0,
      1,
      "ARTWORK_SCRIM_INVALID",
      "scrimStrength",
    );
    numericRange(composition.artwork.fadeStart, 0, 1, "ARTWORK_FADE_INVALID", "fadeStart");
    numericRange(composition.artwork.fadeEnd, 0, 1, "ARTWORK_FADE_INVALID", "fadeEnd");
    if (composition.artwork.fadeStart > composition.artwork.fadeEnd) {
      errors.push({ code: "ARTWORK_FADE_ORDER_INVALID" });
    }
  }

  if (composition.decorativeAssets.length > 32) {
    errors.push({ code: "TOO_MANY_DECORATIVE_ASSETS" });
  }

  if (composition.scoreboard.inheritEditionScoreboard) {
    warnings.push({
      code: "INHERITED_SCOREBOARD_PREVIEW",
      detail: "Final renderer must resolve the current edition scoreboard tokens authoritatively.",
    });
  }

  return { valid: errors.length === 0, errors, warnings };
}

export function createJuryShareThemeOperationIdentity(
  kind: "save-draft" | "ready" | "archive",
): JuryShareThemeOperationIdentity {
  const operationId = globalThis.crypto.randomUUID();
  return {
    operationId,
    idempotencyKey: `jury-share-theme:${kind}:${operationId}`,
  };
}

export async function loadJuryShareThemeSnapshot(
  editionId: string,
  client: JuryShareThemeRpcClient = rpcClient,
): Promise<JuryShareThemeSnapshot> {
  const { data, error } = await client.rpc("studio2_jury_share_theme_snapshot", {
    p_edition_id: editionId,
  });
  if (error) throw error;

  const snapshot = expectObject(data, "Jury Share theme snapshot");
  const returnedEditionId = expectString(snapshot.editionId, "Jury Share snapshot edition id");
  if (returnedEditionId !== editionId) {
    throw new Error("Jury Share snapshot returned a different edition than requested.");
  }

  return {
    editionId: returnedEditionId,
    themes: Array.isArray(snapshot.themes) ? snapshot.themes.map(parseThemeVersion) : [],
    serverTime: expectString(snapshot.serverTime, "Jury Share snapshot server time"),
  };
}

async function reconcileMutation(
  operationId: string,
  client: JuryShareThemeRpcClient,
): Promise<JuryShareThemeMutationResult | null> {
  const { data, error } = await client.rpc("studio2_reconcile_operation", {
    p_operation_id: operationId,
  });
  if (error) return null;
  try {
    return parseSuccessfulReconciliation(data, operationId);
  } catch {
    return null;
  }
}

export async function saveJuryShareThemeDraft(
  request: {
    editionId: string;
    composition: JuryShareEditionComposition;
    expectedVersion: number;
  } & JuryShareThemeOperationIdentity,
  client: JuryShareThemeRpcClient = rpcClient,
): Promise<JuryShareThemeMutationResult> {
  if (!Number.isInteger(request.expectedVersion) || request.expectedVersion < 0) {
    throw new Error("Refresh Share graphics before saving this theme draft.");
  }

  const { data, error } = await client.rpc("studio2_save_jury_share_theme_draft", {
    p_edition_id: request.editionId,
    p_composition: request.composition,
    p_expected_version: request.expectedVersion,
    p_operation_id: request.operationId,
    p_idempotency_key: request.idempotencyKey,
  });

  if (!error) return parseMutationResult(data, request.operationId);
  const reconciled = await reconcileMutation(request.operationId, client);
  if (reconciled) return reconciled;
  throw error;
}

export async function setJuryShareThemeState(
  request: {
    editionId: string;
    version: number;
    targetState: "ready" | "archived";
  } & JuryShareThemeOperationIdentity,
  client: JuryShareThemeRpcClient = rpcClient,
): Promise<JuryShareThemeMutationResult> {
  if (!Number.isInteger(request.version) || request.version < 1) {
    throw new Error("Refresh Share graphics before changing theme state.");
  }

  const { data, error } = await client.rpc("studio2_set_jury_share_theme_state", {
    p_edition_id: request.editionId,
    p_version: request.version,
    p_target_state: request.targetState,
    p_operation_id: request.operationId,
    p_idempotency_key: request.idempotencyKey,
  });

  if (!error) return parseMutationResult(data, request.operationId);
  const reconciled = await reconcileMutation(request.operationId, client);
  if (reconciled) return reconciled;
  throw error;
}
