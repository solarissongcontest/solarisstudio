import { describe, expect, it } from "vitest";

import { appErrorPresentation, classifyAppError } from "@/lib/app-error-state";

describe("app error taxonomy", () => {
  it("distinguishes offline, auth, permission and request failures", () => {
    expect(classifyAppError(new Error("anything"), false)).toBe("offline");
    expect(classifyAppError({ status: 401, message: "JWT expired" })).toBe("authentication-expired");
    expect(classifyAppError({ status: 403, message: "permission denied" })).toBe("permission-denied");
    expect(classifyAppError(new Error("Failed to fetch"))).toBe("request-failed");
  });

  it("keeps service restrictions separate from generic failures", () => {
    expect(classifyAppError({ status: 402, message: "Payment Required" })).toBe("service-unavailable");
  });

  it("gives recoverable failures a constructive retry", () => {
    expect(appErrorPresentation("offline").retry).toBe(true);
    expect(appErrorPresentation("request-failed").retry).toBe(true);
    expect(appErrorPresentation("authentication-expired")).toMatchObject({
      retry: false,
      primaryHref: "/auth",
    });
  });
});
