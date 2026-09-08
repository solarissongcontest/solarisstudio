import type { AnniversaryPhase } from "@/lib/anniversary";

export const ANNIVERSARY_PREVIEW_SESSION_KEY = "solaris:anniversary-preview-phase";

export function parseAnniversaryPreviewValue(value: string | null): AnniversaryPhase | "off" | null {
  if (value === "preview" || value === "active") return "active";
  if (value === "countdown") return "countdown";
  if (value === "after") return "after";
  if (value === "off") return "off";
  return null;
}

export function getAnniversaryPreviewPhase(searchStr: string): AnniversaryPhase | null {
  const explicit = parseAnniversaryPreviewValue(new URLSearchParams(searchStr).get("anniversary"));

  if (typeof window === "undefined") {
    return explicit === "off" ? null : explicit;
  }

  if (explicit === "off") {
    window.sessionStorage.removeItem(ANNIVERSARY_PREVIEW_SESSION_KEY);
    return null;
  }

  if (explicit) {
    window.sessionStorage.setItem(ANNIVERSARY_PREVIEW_SESSION_KEY, explicit);
    return explicit;
  }

  const stored = parseAnniversaryPreviewValue(
    window.sessionStorage.getItem(ANNIVERSARY_PREVIEW_SESSION_KEY),
  );
  return stored === "off" ? null : stored;
}
