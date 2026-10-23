import { describe, expect, it } from "vitest";

import { resolveV3TasteDnaPrivateState } from "./v3-taste-dna-private-state";

describe("resolveV3TasteDnaPrivateState", () => {
  it("waits for session identity before deciding anonymous state", () => {
    expect(
      resolveV3TasteDnaPrivateState({
        sessionLoading: true,
        sessionError: false,
        viewerId: null,
        historyLoading: false,
        historyError: false,
      }),
    ).toBe("resolving_session");
  });

  it("allows anonymous analysis after the session resolves without a viewer", () => {
    expect(
      resolveV3TasteDnaPrivateState({
        sessionLoading: false,
        sessionError: false,
        viewerId: null,
        historyLoading: false,
        historyError: false,
      }),
    ).toBe("anonymous");
  });

  it("keeps authenticated editing blocked until private history resolves", () => {
    expect(
      resolveV3TasteDnaPrivateState({
        sessionLoading: false,
        sessionError: false,
        viewerId: "viewer-1",
        historyLoading: true,
        historyError: false,
      }),
    ).toBe("loading_history");
  });

  it("fails closed when session or private history cannot be verified", () => {
    expect(
      resolveV3TasteDnaPrivateState({
        sessionLoading: false,
        sessionError: true,
        viewerId: null,
        historyLoading: false,
        historyError: false,
      }),
    ).toBe("error");

    expect(
      resolveV3TasteDnaPrivateState({
        sessionLoading: false,
        sessionError: false,
        viewerId: "viewer-1",
        historyLoading: false,
        historyError: true,
      }),
    ).toBe("error");
  });

  it("opens the existing Taste DNA runtime only after authenticated history is ready", () => {
    expect(
      resolveV3TasteDnaPrivateState({
        sessionLoading: false,
        sessionError: false,
        viewerId: "viewer-1",
        historyLoading: false,
        historyError: false,
      }),
    ).toBe("ready");
  });
});
