import { useEffect, useState } from "react";

import { setSolarisAppBadge } from "@/lib/platform";

export type AppAttentionSummary = {
  participate: number;
  me: number;
  osBadge: number;
  updatedAt: string;
};

const STORAGE_KEY = "solaris:app-attention:v1";
const EVENT = "solaris:app-attention-changed";

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

export function readAppAttentionSummary(
  storage: Pick<Storage, "getItem"> | null =
    typeof window === "undefined" ? null : window.localStorage,
): AppAttentionSummary {
  if (!storage) return EMPTY;
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY;
    const parsed = JSON.parse(raw) as Partial<AppAttentionSummary>;
    return {
      participate: clampCount(parsed.participate),
      me: clampCount(parsed.me),
      osBadge: clampCount(parsed.osBadge),
      updatedAt:
        typeof parsed.updatedAt === "string"
          ? parsed.updatedAt
          : new Date(0).toISOString(),
    };
  } catch {
    return EMPTY;
  }
}

export function writeAppAttentionSummary(
  patch: Partial<Omit<AppAttentionSummary, "updatedAt">>,
  storage: Pick<Storage, "getItem" | "setItem"> | null =
    typeof window === "undefined" ? null : window.localStorage,
) {
  if (!storage) return readAppAttentionSummary(null);
  const current = readAppAttentionSummary(storage);
  const next: AppAttentionSummary = {
    participate:
      patch.participate == null
        ? current.participate
        : clampCount(patch.participate),
    me: patch.me == null ? current.me : clampCount(patch.me),
    osBadge:
      patch.osBadge == null
        ? current.osBadge
        : clampCount(patch.osBadge),
    updatedAt: new Date().toISOString(),
  };

  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Attention state is a UI enhancement, never a workflow dependency.
  }

  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent<AppAttentionSummary>(EVENT, { detail: next }));
    void setSolarisAppBadge(next.osBadge).catch(() => undefined);
  }

  return next;
}

export function useAppAttentionSummary() {
  const [summary, setSummary] = useState<AppAttentionSummary>(() =>
    readAppAttentionSummary(),
  );

  useEffect(() => {
    const refresh = () => setSummary(readAppAttentionSummary());
    const onCustom = (event: Event) => {
      const detail = (event as CustomEvent<AppAttentionSummary>).detail;
      setSummary(detail ?? readAppAttentionSummary());
    };

    window.addEventListener("storage", refresh);
    window.addEventListener(EVENT, onCustom);
    return () => {
      window.removeEventListener("storage", refresh);
      window.removeEventListener(EVENT, onCustom);
    };
  }, []);

  return summary;
}
