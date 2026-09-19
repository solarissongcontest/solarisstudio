import { isStudio2FeatureEnabled } from "./studio2-feature-flags";

export const PUBLIC_IA_V3_BETA_KEY = "solaris:public-ia-v3-beta";

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

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
    // Rollout state falls back to the server flag.
  }
}

export async function resolvePublicIaV3Enabled({
  userId,
  betaOverride = readPublicIaV3BetaOverride(),
  featureEnabled = isStudio2FeatureEnabled,
}: {
  userId?: string | null;
  betaOverride?: boolean;
  featureEnabled?: typeof isStudio2FeatureEnabled;
}): Promise<boolean> {
  if (betaOverride) return true;
  if (!userId) return false;

  try {
    return await featureEnabled("public_ia_v3");
  } catch {
    return false;
  }
}
