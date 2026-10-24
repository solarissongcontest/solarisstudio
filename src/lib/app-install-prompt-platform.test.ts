import { describe, expect, it } from "vitest";

import { isIOSLikeBrowser } from "@/components/app/AppInstallPrompt";

describe("installed-app suggestion platform detection", () => {
  it("recognizes classic iPhone and iPad user agents", () => {
    expect(
      isIOSLikeBrowser({
        userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)",
        platform: "iPhone",
        maxTouchPoints: 5,
      }),
    ).toBe(true);

    expect(
      isIOSLikeBrowser({
        userAgent: "Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X)",
        platform: "iPad",
        maxTouchPoints: 5,
      }),
    ).toBe(true);
  });

  it("recognizes desktop-class iPadOS without classifying desktop Macs as iPads", () => {
    const desktopClassUserAgent =
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15";

    expect(
      isIOSLikeBrowser({
        userAgent: desktopClassUserAgent,
        platform: "MacIntel",
        maxTouchPoints: 5,
      }),
    ).toBe(true);

    expect(
      isIOSLikeBrowser({
        userAgent: desktopClassUserAgent,
        platform: "MacIntel",
        maxTouchPoints: 0,
      }),
    ).toBe(false);
  });

  it("does not classify unrelated touch devices as iOS-like", () => {
    expect(
      isIOSLikeBrowser({
        userAgent: "Mozilla/5.0 (Linux; Android 15; Pixel 9)",
        platform: "Linux armv8l",
        maxTouchPoints: 5,
      }),
    ).toBe(false);
  });
});
