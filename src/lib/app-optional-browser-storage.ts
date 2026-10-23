export type BrowserStorageName = "localStorage" | "sessionStorage";

export function optionalBrowserStorage(name: BrowserStorageName): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window[name];
  } catch {
    return null;
  }
}

export function readOptionalStorage(
  storage: Storage | null,
  key: string,
): string | null | undefined {
  if (!storage) return undefined;
  try {
    return storage.getItem(key);
  } catch {
    return undefined;
  }
}

export function writeOptionalStorage(
  storage: Storage | null,
  key: string,
  value: string,
): boolean {
  if (!storage) return false;
  try {
    storage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}
