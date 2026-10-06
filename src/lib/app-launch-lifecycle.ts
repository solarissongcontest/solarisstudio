export const APP_LAUNCH_SESSION_TIMEOUT_MS = 1_500;
export const APP_LAUNCH_ABSOLUTE_ESCAPE_MS = 3_000;

export type AppLaunchSessionResolution = {
  signedIn: boolean;
  source: "local_session" | "timeout" | "error";
};

type TimerApi = {
  setTimeout: (callback: () => void, delay: number) => number;
  clearTimeout: (id: number) => void;
};

/**
 * Resolve only the local auth fact needed to choose a launch destination.
 * This helper is deliberately independent from React, routing and telemetry so
 * those systems cannot become hidden prerequisites for leaving /app-launch.
 */
export async function resolveAppLaunchSession(
  getSignedIn: () => Promise<boolean>,
  timers: TimerApi = {
    setTimeout: (callback, delay) => window.setTimeout(callback, delay),
    clearTimeout: (id) => window.clearTimeout(id),
  },
): Promise<AppLaunchSessionResolution> {
  let timeoutId: number | null = null;

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
