export const APP_LAUNCH_SESSION_TIMEOUT_MS = 1_500;
export const APP_LAUNCH_TRANSACTION_KEY = "solaris:app-launch-transaction:v1";
export const APP_LAUNCH_TRANSACTION_MAX_AGE_MS = 30_000;

export type AppLaunchTransaction = {
  version: 1;
  startedAt: string;
  navigationSnapshot: string | null;
};

type TransactionStorage = Pick<Storage, "getItem" | "removeItem">;

function browserSessionStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

export function readAppLaunchTransaction(
  storage: TransactionStorage | null = browserSessionStorage(),
): AppLaunchTransaction | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(APP_LAUNCH_TRANSACTION_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<AppLaunchTransaction>;
    const startedAt = typeof value.startedAt === "string" ? Date.parse(value.startedAt) : NaN;
    const age = Date.now() - startedAt;
    if (
      value.version !== 1 ||
      !Number.isFinite(startedAt) ||
      age < 0 ||
      age > APP_LAUNCH_TRANSACTION_MAX_AGE_MS ||
      (typeof value.navigationSnapshot !== "string" && value.navigationSnapshot !== null)
    ) {
      storage.removeItem(APP_LAUNCH_TRANSACTION_KEY);
      return null;
    }
    return {
      version: 1,
      startedAt: value.startedAt!,
      navigationSnapshot: value.navigationSnapshot,
    };
  } catch {
    try {
      storage.removeItem(APP_LAUNCH_TRANSACTION_KEY);
    } catch {
      // Unavailable session storage already provides the safe home fallback.
    }
    return null;
  }
}

export function hasPendingAppLaunchTransaction(
  storage: TransactionStorage | null = browserSessionStorage(),
) {
  return readAppLaunchTransaction(storage) !== null;
}

export function clearAppLaunchTransaction(
  storage: Pick<Storage, "removeItem"> | null = browserSessionStorage(),
) {
  if (!storage) return;
  try {
    storage.removeItem(APP_LAUNCH_TRANSACTION_KEY);
  } catch {
    // A failed cleanup cannot be allowed to block safe routing.
  }
}

export type AppLaunchSessionResolution = {
  signedIn: boolean;
  source: "local_session" | "timeout" | "error";
};

type TimerHandle = ReturnType<typeof globalThis.setTimeout>;
type TimerApi = {
  setTimeout: (callback: () => void, delay: number) => TimerHandle;
  clearTimeout: (id: TimerHandle) => void;
};

const defaultTimers: TimerApi = {
  setTimeout: (callback, delay) => globalThis.setTimeout(callback, delay),
  clearTimeout: (id) => globalThis.clearTimeout(id),
};

/**
 * Resolve only the local auth fact needed to choose a launch destination.
 * This helper is deliberately independent from React, routing and telemetry so
 * those systems cannot become hidden prerequisites for leaving /app-launch.
 */
export async function resolveAppLaunchSession(
  getSignedIn: () => Promise<boolean>,
  timers: TimerApi = defaultTimers,
): Promise<AppLaunchSessionResolution> {
  let timeoutId: TimerHandle | null = null;

  const timeout = new Promise<AppLaunchSessionResolution>((resolve) => {
    timeoutId = timers.setTimeout(
      () => resolve({ signedIn: false, source: "timeout" }),
      APP_LAUNCH_SESSION_TIMEOUT_MS,
    );
  });

  const session = getSignedIn()
    .then((signedIn) => ({ signedIn, source: "local_session" as const }))
    .catch(() => ({ signedIn: false, source: "error" as const }));

  const result = await Promise.race([session, timeout]);
  if (timeoutId !== null) timers.clearTimeout(timeoutId);
  return result;
}
