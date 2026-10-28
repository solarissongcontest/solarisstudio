import { describe, expect, it } from "vitest";
import {
  beginSolarisAuthTransition,
  runSolarisAuthMutation,
  StaleSolarisAuthTransitionError,
} from "./auth-transition-authority";

describe("authentication transition authority", () => {
  it("prevents delayed A from publishing after B becomes the newer transition", async () => {
    const state: string[] = [];
    let releaseA!: () => void;
    let markStarted!: () => void;
    const started = new Promise<void>((resolve) => { markStarted = resolve; });
    const a = beginSolarisAuthTransition();
    const pendingA = runSolarisAuthMutation(
      a,
      async () => {
        state.push("A-installed");
        markStarted();
        await new Promise<void>((resolve) => { releaseA = resolve; });
        return "A";
      },
      async () => { state.push("A-cleaned"); },
    );

    await started;
    const b = beginSolarisAuthTransition();
    const pendingB = runSolarisAuthMutation(b, async () => {
      state.push("B-installed");
      return "B";
    });

    releaseA();
    await expect(pendingA).rejects.toBeInstanceOf(StaleSolarisAuthTransitionError);
    await expect(pendingB).resolves.toBe("B");
    expect(state).toEqual(["A-installed", "A-cleaned", "B-installed"]);
  });

  it("never starts a superseded restoration mutation", async () => {
    const restoring = beginSolarisAuthTransition();
    beginSolarisAuthTransition();
    let mutated = false;
    await expect(
      runSolarisAuthMutation(restoring, async () => {
        mutated = true;
      }),
    ).rejects.toBeInstanceOf(StaleSolarisAuthTransitionError);
    expect(mutated).toBe(false);
  });
});
