import { describe, expect, it } from "vitest";

import {
  publicUxTelemetryAllowed,
  sanitizePublicUxPath,
  sanitizePublicUxTarget,
} from "./public-ux-privacy";

describe("public UX telemetry privacy", () => {
  it("respects browser privacy signals", () => {
    expect(publicUxTelemetryAllowed()).toBe(true);
    expect(publicUxTelemetryAllowed({ doNotTrack: "0" })).toBe(true);
    expect(publicUxTelemetryAllowed({ doNotTrack: "1" })).toBe(false);
    expect(publicUxTelemetryAllowed({ doNotTrack: "yes" })).toBe(false);
    expect(publicUxTelemetryAllowed({ globalPrivacyControl: true })).toBe(false);
  });

  it("removes query strings and fragments from route telemetry", () => {
    expect(
      sanitizePublicUxPath("/results?country=oland&token=secret#jury"),
    ).toBe("/results");
    expect(
      sanitizePublicUxPath("https://solaris.example/results?country=oland#jury"),
    ).toBe("/results");
  });

  it("redacts durable or secret-shaped path identifiers", () => {
    expect(
      sanitizePublicUxPath(
        "/integrity/cases/123e4567-e89b-42d3-a456-426614174000/recovery",
      ),
    ).toBe("/integrity/cases/:id/recovery");
    expect(
      sanitizePublicUxPath(
        "/auth/recovery/abcdefghijklmnopqrstuvwxyzABCDEF0123456789",
      ),
    ).toBe("/auth/recovery/:token");
    expect(sanitizePublicUxPath("/profile/person@example.com")).toBe(
      "/profile/:value",
    );
  });

  it("keeps useful public route families and static diagnostic targets", () => {
    expect(sanitizePublicUxPath("/countries/oland")).toBe("/countries/oland");
    expect(sanitizePublicUxTarget("/results/ssc-22?tab=jury")).toBe(
      "/results/ssc-22",
    );
    expect(sanitizePublicUxTarget("public-command-palette")).toBe(
      "public-command-palette",
    );
  });

  it("drops free-form and identifier-like targets instead of storing content", () => {
    expect(sanitizePublicUxTarget("A user supplied title with spaces")).toBeNull();
    expect(
      sanitizePublicUxTarget("123e4567-e89b-42d3-a456-426614174000"),
    ).toBeNull();
    expect(
      sanitizePublicUxTarget("abcdefghijklmnopqrstuvwxyzABCDEF0123456789"),
    ).toBeNull();
  });
});
