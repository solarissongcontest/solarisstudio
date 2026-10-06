import { describe, expect, it } from "vitest";

import {
  APP_LAUNCH_SESSION_TIMEOUT_MS,
  resolveAppLaunchSession,
} from "./app-launch-lifecycle";

describe("app launch lifecycle", () => {
  it("uses the local session when auth resolves normally", async () => {
    const result = await resolveAppLaunchSession(() => Promise.resolve(true));
    expect(result).toEqual({ signedIn: true, source: "local_session" });
  });

  it("fails safe when auth rejects", async () => {
    const result = await resolveAppLaunchSession(() => Promise.reject(new Error("auth unavailable")));
    expect(result).toEqual({ signedIn: false, source: "error" });
  });

  it("bounds a hanging auth lookup without waiting for it to settle", async () => {
    const pending = new Promise<boolean>(() => undefined);
    let timeoutCallback: (() => void) | null = null;
    let cleared = false;
    const timerHandle = 1 as unknown as ReturnType<typeof globalThis.setTimeout>;

    const resultPromise = resolveAppLaunchSession(
      () => pending,
      {
        setTimeout: (callback, delay) => {
          expect(delay).toBe(APP_LAUNCH_SESSION_TIMEOUT_MS);
          timeoutCallback = callback;
          return timerHandle;
        },
        clearTimeout: (handle) => {
          expect(handle).toBe(timerHandle);
          cleared = true;
        },
      },
    );

    expect(timeoutCallback).not.toBeNull();
    timeoutCallback?.();

    await expect(resultPromise).resolves.toEqual({ signedIn: false, source: "timeout" });
    expect(cleared).toBe(true);
  });
});
