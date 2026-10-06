import { afterEach, describe, expect, it, vi } from "vitest";

import {
  APP_LAUNCH_SESSION_TIMEOUT_MS,
  resolveAppLaunchSession,
} from "./app-launch-lifecycle";

describe("app launch lifecycle", () => {
  afterEach(() => vi.useRealTimers());

  it("uses the local session when auth resolves normally", async () => {
    const result = await resolveAppLaunchSession(() => Promise.resolve(true));
    expect(result).toEqual({ signedIn: true, source: "local_session" });
  });

  it("fails safe when auth rejects", async () => {
    const result = await resolveAppLaunchSession(() => Promise.reject(new Error("auth unavailable")));
    expect(result).toEqual({ signedIn: false, source: "error" });
  });

  it("bounds a hanging auth lookup without waiting for it to settle", async () => {
    vi.useFakeTimers();
    const pending = new Promise<boolean>(() => undefined);
    const resultPromise = resolveAppLaunchSession(() => pending);

    await vi.advanceTimersByTimeAsync(APP_LAUNCH_SESSION_TIMEOUT_MS);
    await expect(resultPromise).resolves.toEqual({ signedIn: false, source: "timeout" });
  });
});
