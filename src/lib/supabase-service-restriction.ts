export const SUPABASE_SERVICE_RESTRICTION_EVENT = "solaris:supabase-service-restriction";
const STORAGE_KEY = "solaris:supabase-service-restriction";

export type SupabaseServiceRestriction = {
  status: 402;
  detectedAt: string;
};

function safeSessionStorage() {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

export function readSupabaseServiceRestriction(): SupabaseServiceRestriction | null {
  const storage = safeSessionStorage();
  if (!storage) return null;

  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SupabaseServiceRestriction>;
    if (parsed.status !== 402 || typeof parsed.detectedAt !== "string") return null;
    return { status: 402, detectedAt: parsed.detectedAt };
  } catch {
    return null;
  }
}

export function clearSupabaseServiceRestriction() {
  safeSessionStorage()?.removeItem(STORAGE_KEY);
}

export function noteSupabaseResponse(response: Pick<Response, "status">) {
  if (response.status !== 402 || typeof window === "undefined") return;

  const detail: SupabaseServiceRestriction = {
    status: 402,
    detectedAt: new Date().toISOString(),
  };

  try {
    safeSessionStorage()?.setItem(STORAGE_KEY, JSON.stringify(detail));
  } catch {
    // Storage is an enhancement only. The in-page event still works.
  }

  window.dispatchEvent(
    new CustomEvent<SupabaseServiceRestriction>(SUPABASE_SERVICE_RESTRICTION_EVENT, {
      detail,
    }),
  );
}

export function isSupabaseServiceRestrictionError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const value = error as Record<string, unknown>;
  const status = Number(value.status ?? value.statusCode ?? value.httpStatusCode);
  if (status === 402) return true;

  const message = [value.message, value.error, value.details, value.hint]
    .filter((part): part is string => typeof part === "string")
    .join(" ");

  return /(?:\\b402\\b|service[- ]restriction|fair use|exceed(?:ed)?[_ -](?:egress|db|database|quota))/i.test(
    message,
  );
}
