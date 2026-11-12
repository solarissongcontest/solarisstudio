import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const launch = readFileSync("src/routes/app-launch.tsx", "utf8");

describe("V3 installed-app cold-launch surface", () => {
  it("keeps the parsing-time navigation trampoline authoritative", () => {
    expect(launch).toContain('if (window.location.pathname !== "/app-launch") return;');
    expect(launch).toContain("APP_LAUNCH_TRANSACTION_KEY");
    expect(launch).toContain("APP_NAVIGATION_STORAGE_KEY");
    expect(launch).toContain("window.location.replace(safeRoot)");
    expect(launch).toContain('window.location.replace("/")');
  });

  it("uses Solaris Studio identity instead of a generic app-icon splash", () => {
    expect(launch).toContain('src="/solaris-studio-mark.png"');
    expect(launch).toContain("Solaris Studio");
    expect(launch).not.toContain('src="/icon-192.png?v=img2340-20260929"');
  });

  it("does not invent fake launch progress or loading theatre", () => {
    expect(launch).not.toContain("animate-pulse");
    expect(launch).not.toContain("Opening your app…");
    expect(launch).not.toContain("h-1 w-28");
    expect(launch).not.toContain('role="progressbar"');
    expect(launch).not.toContain("setTimeout(");
    expect(launch).not.toContain("setInterval(");
  });

  it("remains accessible while the immediate redirect is in flight", () => {
    expect(launch).toContain('aria-busy="true"');
    expect(launch).toContain('aria-live="polite"');
    expect(launch).toContain('role="status"');
    expect(launch).toContain("Opening Solaris Studio.");
  });

  it("does not acquire data, auth or telemetry ownership", () => {
    expect(launch).not.toContain("supabase");
    expect(launch).not.toContain("fetch(");
    expect(launch).not.toContain("useQuery");
    expect(launch).not.toContain("trackEvent(");
    expect(launch).not.toContain("captureEvent(");
    expect(launch).not.toContain('from "@/lib/telemetry"');
  });
});
