export const APP_LAUNCH_SESSION_TIMEOUT_MS = 1_500;
export const APP_LAUNCH_ABSOLUTE_ESCAPE_MS = 3_000;

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
