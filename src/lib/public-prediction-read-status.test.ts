import { describe, expect, it } from "vitest";

import { predictionDraftScope, predictionReadStatus } from "./public-prediction-read-status";

const ready = { isError: false, isLoading: false };
const loading = { isError: false, isLoading: true };
const failed = { isError: true, isLoading: false };

describe("Prediction read verification before showing empty or editable state", () => {
  it("distinguishes initial requests from a confirmed empty public round list", () => {
    expect(predictionReadStatus(loading)).toBe("loading");
    expect(predictionReadStatus(ready)).toBe("ready");
  });

  it("does not present a failed published-round read as no prediction round", () => {
    expect(predictionReadStatus(failed)).toBe("error");
  });

  it("blocks editing when session verification fails, even with a fetched round", () => {
    expect(predictionReadStatus(ready, failed)).toBe("error");
  });

  it("blocks editing when the saved entry cannot be fetched", () => {
    expect(predictionReadStatus(ready, ready, failed)).toBe("error");
  });

  it("does not show a blank editable form while a saved entry is loading", () => {
    expect(predictionReadStatus(ready, ready, loading)).toBe("loading");
  });

  it("prioritizes an error during a background refetch over still-loading responses", () => {
    expect(predictionReadStatus(loading, failed, ready)).toBe("error");
  });

  it("allows read-only public rounds without loading an absent user's private entry", () => {
    expect(predictionReadStatus(ready, undefined, undefined)).toBe("ready");
  });

  it("resumes the verified state after successful retries", () => {
    expect(predictionReadStatus(ready, ready, failed)).toBe("error");
    expect(predictionReadStatus(ready, ready, ready)).toBe("ready");
  });
});

describe("in-memory Prediction draft account/round isolation", () => {
  it("retains the same scope across harmless rerenders", () => {
    expect(predictionDraftScope("round-1", "fan-a")).toBe(
      predictionDraftScope("round-1", "fan-a"),
    );
  });

  it("changes scope when the signed-in account changes for a round", () => {
    expect(predictionDraftScope("round-1", "fan-a")).not.toBe(
      predictionDraftScope("round-1", "fan-b"),
    );
  });

  it("changes scope when navigating between shows or losing the signed-in session", () => {
    const original = predictionDraftScope("round-1", "fan-a");
    expect(predictionDraftScope("round-2", "fan-a")).not.toBe(original);
    expect(predictionDraftScope("round-1", null)).not.toBe(original);
    expect(predictionDraftScope(null, "fan-a")).not.toBe(original);
  });

  it("does not confuse an anonymous round with a differently keyed signed-in draft", () => {
    expect(predictionDraftScope("round-1", null)).not.toBe(
      predictionDraftScope("round-1", "null"),
    );
  });
});
