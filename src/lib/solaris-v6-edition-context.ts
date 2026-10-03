export const SOLARIS_TAB_EDITION_KEY = "solaris:admin:edition-id";

export type EditionCommandScope = {
  routeEditionId: string | null;
  commandEditionId: string | null;
  entityEditionId: string | null;
  capabilityEditionId: string | null;
};

export type EditionScopeValidation =
  | { ok: true; editionId: string | null; mismatches: [] }
  | { ok: false; editionId: null; mismatches: string[] };

function normalized(value: string | null | undefined) {
  const next = value?.trim() ?? "";
  return next || null;
}

/**
 * A consequential command may only execute when every supplied edition identity
 * agrees. Missing optional identities do not create authority; they merely do
 * not participate in the equality check.
 */
export function validateEditionCommandScope(
  scope: EditionCommandScope,
): EditionScopeValidation {
  const entries = [
    ["route", normalized(scope.routeEditionId)],
    ["command", normalized(scope.commandEditionId)],
    ["entity", normalized(scope.entityEditionId)],
    ["capability", normalized(scope.capabilityEditionId)],
  ] as const;
  const present = entries.flatMap(([source, value]) =>
    value ? ([[source, value]] as const) : [],
  );
  const unique = new Set(present.map(([, value]) => value));

  if (unique.size <= 1) {
    return {
      ok: true,
      editionId: present[0]?.[1] ?? null,
      mismatches: [],
    };
  }

  const canonical = present[0]?.[1] ?? null;
  const mismatches = present
    .filter(([, value]) => value !== canonical)
    .map(([source, value]) => `${source}:${value}`);

  return { ok: false, editionId: null, mismatches };
}

type EditionStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export function readTabScopedEdition(
  storage: EditionStorage | null,
  key = SOLARIS_TAB_EDITION_KEY,
) {
  if (!storage) return "";
  try {
    return storage.getItem(key) ?? "";
  } catch {
    return "";
  }
}

export function writeTabScopedEdition(
  storage: EditionStorage | null,
  editionId: string,
  key = SOLARIS_TAB_EDITION_KEY,
) {
  if (!storage) return;
  try {
    if (editionId) storage.setItem(key, editionId);
    else storage.removeItem(key);
  } catch {
    // Edition selection is a navigation preference, never an authorization source.
  }
}

export type SolarisEditionMutationNotice = {
  editionId: string;
  entityType: string;
  entityId: string | null;
  version: string | number | null;
};

const EDITION_CHANNEL = "solaris:edition-mutations:v1";

/**
 * Cross-tab communication is invalidation-only. It may tell another tab that
 * state changed, but it deliberately has no API for replacing that tab's active
 * edition context.
 */
export function announceEditionMutation(notice: SolarisEditionMutationNotice) {
  if (typeof BroadcastChannel === "undefined") return () => undefined;
  const channel = new BroadcastChannel(EDITION_CHANNEL);
  channel.postMessage(notice);
  return () => channel.close();
}

export function subscribeEditionMutations(
  listener: (notice: SolarisEditionMutationNotice) => void,
) {
  if (typeof BroadcastChannel === "undefined") return () => undefined;
  const channel = new BroadcastChannel(EDITION_CHANNEL);
  channel.addEventListener("message", (event: MessageEvent<SolarisEditionMutationNotice>) => {
    if (!event.data?.editionId || !event.data.entityType) return;
    listener(event.data);
  });
  return () => channel.close();
}
