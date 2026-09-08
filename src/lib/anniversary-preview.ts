import type { AnniversaryPhase } from "@/lib/anniversary";

export const ANNIVERSARY_PREVIEW_SESSION_KEY = "solaris:anniversary-preview-phase";

export function parseAnniversaryPreviewValue(value: string | null): AnniversaryPhase | "off" | null {
  if (value === "preview" || value === "active") return "active";
  if (value === "countdown") return "countdown";
  if (value === "after") return "after";
  if (value === "off") return "off";
  return null;
}

function safeSessionGet(key: string) {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSessionSet(key: string, value: string) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(key, value);
  } catch {
    // Safari/private contexts can deny storage. Preview still works on the
    // explicit URL; it simply cannot persist across navigation in that case.
  }
}

function safeSessionRemove(key: string) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(key);
  } catch {
    // Nothing to clear if storage is unavailable.
  }
}

export function getAnniversaryPreviewPhase(searchStr: string): AnniversaryPhase | null {
  const explicit = parseAnniversaryPreviewValue(new URLSearchParams(searchStr).get("anniversary"));

  if (typeof window === "undefined") {
    return explicit === "off" ? null : explicit;
  }

  if (explicit === "off") {
    safeSessionRemove(ANNIVERSARY_PREVIEW_SESSION_KEY);
    return null;
  }

  if (explicit) {
    safeSessionSet(ANNIVERSARY_PREVIEW_SESSION_KEY, explicit);
    return explicit;
  }

  const stored = parseAnniversaryPreviewValue(safeSessionGet(ANNIVERSARY_PREVIEW_SESSION_KEY));
  return stored === "off" ? null : stored;
}

export function isAnniversaryPreviewSession() {
  if (typeof window === "undefined") return false;
  const explicit = parseAnniversaryPreviewValue(
    new URLSearchParams(window.location.search).get("anniversary"),
  );
  if (explicit && explicit !== "off") return true;
  return parseAnniversaryPreviewValue(safeSessionGet(ANNIVERSARY_PREVIEW_SESSION_KEY)) != null;
}
