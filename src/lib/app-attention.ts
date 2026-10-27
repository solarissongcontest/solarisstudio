import { useEffect, useState } from "react";

import { setSolarisAppBadge } from "@/lib/platform";
import { useFanSession } from "@/lib/prediction-data";

export type AppAttentionSummary = {
  participate: number;
  me: number;
  osBadge: number;
  updatedAt: string;
};

const LEGACY_STORAGE_KEY = "solaris:app-attention:v1";
const STORAGE_PREFIX = "solaris:app-attention:v2:";
const EVENT = "solaris:app-attention-changed";
// Owned only by the existing root SDK auth-isolation callback. A late writer
// may update its own cache, but cannot publish an OS badge for another viewer.
let activeViewerId: string | null | undefined;

type AttentionStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;
const EMPTY: AppAttentionSummary = {
  participate: 0,
  me: 0,
  osBadge: 0,
  updatedAt: new Date(0).toISOString(),
};

function clampCount(value: unknown) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.min(99, Math.round(value)))
    : 0;
}

function browserStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function storageKey(viewerId: string) {
  return `${STORAGE_PREFIX}${encodeURIComponent(viewerId)}`;
}

export function readAppAttentionSummary(
  storage: Pick<Storage, "getItem"> | null = browserStorage(),
  viewerId: string | null = null,
): AppAttentionSummary {
  if (!storage || !viewerId) return EMPTY;
  try {
    // The old global cache has no recipient identity and cannot be migrated.
    const raw = storage.getItem(storageKey(viewerId));
    if (!raw) return EMPTY;
    const parsed = JSON.parse(raw) as Partial<AppAttentionSummary>;
    return {
      participate: clampCount(parsed.participate),
      me: clampCount(parsed.me),
      osBadge: clampCount(parsed.osBadge),
      updatedAt:
        typeof parsed.updatedAt === "string" ? parsed.updatedAt : new Date(0).toISOString(),
    };
  } catch {
    return EMPTY;
  }
}

function publishAttention(viewerId: string | null, summary: AppAttentionSummary) {
  if (typeof window === "undefined") return;
  // Events are invalidation hints only. Readers reload their own scoped cache;
  // an event payload can never inject another account's counts into the shell.
  window.dispatchEvent(new CustomEvent(EVENT, { detail: { viewerId } }));
  if (activeViewerId === viewerId) {
    void setSolarisAppBadge(summary.osBadge).catch(() => undefined);
  }
}

/** Called before the root auth handler publishes the next fan-session. */
export function resetAppAttentionSummary(
  viewerId: string | null,
  storage: AttentionStorage | null = browserStorage(),
): AppAttentionSummary {
  if (!storage && typeof window === "undefined") return EMPTY;
  const previousViewerId = activeViewerId;
  activeViewerId = viewerId;
  try {
    storage?.removeItem(LEGACY_STORAGE_KEY);
    if (previousViewerId) storage?.removeItem(storageKey(previousViewerId));
    if (viewerId) storage?.removeItem(storageKey(viewerId));
  } catch {
    // Attention state is a UI enhancement, never a workflow dependency.
  }
  publishAttention(viewerId, EMPTY);
  return EMPTY;
}

export function writeAppAttentionSummary(
  patch: Partial<Omit<AppAttentionSummary, "updatedAt">>,
  storage: AttentionStorage | null = browserStorage(),
  viewerId: string | null = null,
) {
  if (!storage || !viewerId) return EMPTY;
  const current = readAppAttentionSummary(storage, viewerId);
  const next: AppAttentionSummary = {
    participate: patch.participate == null ? current.participate : clampCount(patch.participate),
    me: patch.me == null ? current.me : clampCount(patch.me),
    osBadge: patch.osBadge == null ? current.osBadge : clampCount(patch.osBadge),
    updatedAt: new Date().toISOString(),
  };
  try {
    storage.removeItem(LEGACY_STORAGE_KEY);
    storage.setItem(storageKey(viewerId), JSON.stringify(next));
  } catch {
    // Attention state is a UI enhancement, never a workflow dependency.
  }
  publishAttention(viewerId, next);
  return next;
}

export function useAppAttentionSummary() {
  const viewer = useFanSession();
  const identityReady = viewer.isSuccess;
  const viewerId = identityReady ? (viewer.data?.id ?? null) : null;
  const [observed, setObserved] = useState<{
    viewerId: string | null;
    summary: AppAttentionSummary;
  }>({ viewerId: null, summary: EMPTY });

  useEffect(() => {
    const refresh = () => {
      const summary = identityReady ? readAppAttentionSummary(undefined, viewerId) : EMPTY;
      setObserved({ viewerId, summary });
      if (activeViewerId === viewerId) {
        void setSolarisAppBadge(summary.osBadge).catch(() => undefined);
      }
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key == null || (viewerId && event.key === storageKey(viewerId))) refresh();
    };
    const onCustom = (event: Event) => {
      const detail = (event as CustomEvent<{ viewerId?: unknown }>).detail;
      if (detail?.viewerId === viewerId) refresh();
    };
    refresh();
    window.addEventListener("storage", onStorage);
    window.addEventListener(EVENT, onCustom);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(EVENT, onCustom);
    };
  }, [identityReady, viewerId]);

  // Render-time ownership prevents a one-frame A→B leak before effects refresh.
  return identityReady && observed.viewerId === viewerId ? observed.summary : EMPTY;
}
