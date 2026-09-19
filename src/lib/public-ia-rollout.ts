import { supabase } from "@/integrations/supabase/client";

import { isStudio2FeatureEnabled } from "./studio2-feature-flags";

export const PUBLIC_IA_V3_BETA_KEY = "solaris:public-ia-v3-beta";

export const PUBLIC_IA_ROLLOUT_STAGES = [
  "disabled",
  "organizers",
  "beta",
  "signed_in",
  "everyone",
] as const;

export type PublicIaRolloutStage = (typeof PUBLIC_IA_ROLLOUT_STAGES)[number];

export type PublicIaRolloutState = {
  key: "public_ia_v3";
  stage: PublicIaRolloutStage;
  updated_at: string;
};

export type PublicIaRolloutReadiness = {
  ready: boolean;
  responses: number;
  minimumResponses: number;
  coreTaskSuccessPercent: number | null;
  firstClickSuccessPercent: number | null;
  oldEditionLookupPercent: number | null;
  countryEntryFailures: number;
  mobileResponses: number;
  desktopResponses: number;
  mobileSuccessPercent: number | null;
  desktopSuccessPercent: number | null;
  mobileDesktopGapPercent: number | null;
};

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

type StageReadBuilder = {
  eq(column: string, value: string): {
    maybeSingle(): PromiseLike<{ data: unknown; error: { message?: string } | null }>;
  };
};

type StageUpdateBuilder = {
  eq(column: string, value: string): {
    select(columns: string): {
      single(): PromiseLike<{ data: unknown; error: { message?: string } | null }>;
    };
  };
};

type PublicIaClient = {
  from(name: string): {
    select(columns: string): StageReadBuilder;
    update(values: Record<string, unknown>): StageUpdateBuilder;
  };
  rpc(
    name: string,
    args?: Record<string, unknown>,
  ): PromiseLike<{ data: unknown; error: { message?: string } | null }>;
};

const client = supabase as unknown as PublicIaClient;

function browserStorage(): StorageLike | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function readPublicIaV3BetaOverride(
  storage: StorageLike | null = browserStorage(),
): boolean {
  if (!storage) return false;
  try {
    return storage.getItem(PUBLIC_IA_V3_BETA_KEY) === "1";
  } catch {
    return false;
  }
}

export function enablePublicIaV3BetaOverride(
  storage: StorageLike | null = browserStorage(),
) {
  if (!storage) return;
  try {
    storage.setItem(PUBLIC_IA_V3_BETA_KEY, "1");
  } catch {
    // Beta navigation should still work if local storage is unavailable.
  }
}

export function clearPublicIaV3BetaOverride(
  storage: StorageLike | null = browserStorage(),
) {
  if (!storage) return;
  try {
    storage.removeItem(PUBLIC_IA_V3_BETA_KEY);
  } catch {
    // Rollout state falls back to the server stage.
  }
}

export async function loadPublicIaRolloutStage(
  database: PublicIaClient = client,
): Promise<PublicIaRolloutStage> {
  const { data, error } = await database
    .from("public_ia_rollout_state")
    .select("key,stage,updated_at")
    .eq("key", "public_ia_v3")
    .maybeSingle();

  if (error) {
    throw new Error(error.message || "Could not load public IA rollout stage.");
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("Public IA rollout stage is unavailable.");
  }

  const stage = (data as Record<string, unknown>).stage;
  if (!isPublicIaRolloutStage(stage)) {
    throw new Error("Public IA rollout stage is invalid.");
  }
  return stage;
}

export async function setPublicIaRolloutStage(
  stage: PublicIaRolloutStage,
  database: PublicIaClient = client,
): Promise<PublicIaRolloutState> {
  const { data, error } = await database
    .from("public_ia_rollout_state")
    .update({ stage })
    .eq("key", "public_ia_v3")
    .select("key,stage,updated_at")
    .single();

  if (error) {
    throw new Error(error.message || "Could not update public IA rollout stage.");
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("Public IA rollout update returned an invalid response.");
  }

  const row = data as Record<string, unknown>;
  if (
    row.key !== "public_ia_v3" ||
    !isPublicIaRolloutStage(row.stage) ||
    typeof row.updated_at !== "string"
  ) {
    throw new Error("Public IA rollout update returned an invalid state.");
  }

  return {
    key: "public_ia_v3",
    stage: row.stage,
    updated_at: row.updated_at,
  };
}

export async function loadPublicIaRolloutReadiness(
  database: PublicIaClient = client,
): Promise<PublicIaRolloutReadiness> {
  const { data, error } = await database.rpc("admin_public_ia_rollout_readiness");

  if (error) {
    throw new Error(error.message || "Could not load public IA rollout readiness.");
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("Public IA rollout readiness returned an invalid response.");
  }

  const raw = data as Record<string, unknown>;
  return {
    ready: raw.ready === true,
    responses: numeric(raw.responses),
    minimumResponses: numeric(raw.minimumResponses),
    coreTaskSuccessPercent: optionalNumeric(raw.coreTaskSuccessPercent),
    firstClickSuccessPercent: optionalNumeric(raw.firstClickSuccessPercent),
    oldEditionLookupPercent: optionalNumeric(raw.oldEditionLookupPercent),
    countryEntryFailures: numeric(raw.countryEntryFailures),
    mobileResponses: numeric(raw.mobileResponses),
    desktopResponses: numeric(raw.desktopResponses),
    mobileSuccessPercent: optionalNumeric(raw.mobileSuccessPercent),
    desktopSuccessPercent: optionalNumeric(raw.desktopSuccessPercent),
    mobileDesktopGapPercent: optionalNumeric(raw.mobileDesktopGapPercent),
  };
}

export async function resolvePublicIaV3Enabled({
  userId,
  betaOverride = readPublicIaV3BetaOverride(),
  stageLoader = loadPublicIaRolloutStage,
  featureEnabled = isStudio2FeatureEnabled,
}: {
  userId?: string | null;
  betaOverride?: boolean;
  stageLoader?: () => Promise<PublicIaRolloutStage>;
  featureEnabled?: typeof isStudio2FeatureEnabled;
}): Promise<boolean> {
  try {
    const stage = await stageLoader();

    if (stage === "disabled") return false;
    if (stage === "beta" && betaOverride) return true;

    if (stage === "everyone") {
      return await featureEnabled("public_ia_v3");
    }

    if (!userId) return false;

    if (stage === "signed_in" || stage === "organizers" || stage === "beta") {
      return await featureEnabled("public_ia_v3");
    }

    return false;
  } catch {
    return false;
  }
}

export function publicIaRolloutStageLabel(stage: PublicIaRolloutStage) {
  switch (stage) {
    case "disabled":
      return "Disabled";
    case "organizers":
      return "Organizers";
    case "beta":
      return "Beta testers";
    case "signed_in":
      return "Signed-in users";
    case "everyone":
      return "Everyone";
  }
}

export function nextPublicIaRolloutStage(
  stage: PublicIaRolloutStage,
): PublicIaRolloutStage | null {
  const index = PUBLIC_IA_ROLLOUT_STAGES.indexOf(stage);
  return index >= 0 && index < PUBLIC_IA_ROLLOUT_STAGES.length - 1
    ? PUBLIC_IA_ROLLOUT_STAGES[index + 1]
    : null;
}

export function previousPublicIaRolloutStage(
  stage: PublicIaRolloutStage,
): PublicIaRolloutStage | null {
  const index = PUBLIC_IA_ROLLOUT_STAGES.indexOf(stage);
  return index > 0 ? PUBLIC_IA_ROLLOUT_STAGES[index - 1] : null;
}

function isPublicIaRolloutStage(value: unknown): value is PublicIaRolloutStage {
  return (
    typeof value === "string" &&
    (PUBLIC_IA_ROLLOUT_STAGES as readonly string[]).includes(value)
  );
}

function numeric(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function optionalNumeric(value: unknown) {
  if (value == null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
