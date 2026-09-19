import { describe, expect, it } from "vitest";

import { ratePublicWebVital } from "./public-web-vitals";

describe("public Core Web Vitals ratings", () => {
  it("uses the product release thresholds for LCP", () => {
    expect(ratePublicWebVital("LCP", 2500)).toBe("good");
    expect(ratePublicWebVital("LCP", 2501)).toBe("needs-improvement");
    expect(ratePublicWebVital("LCP", 4001)).toBe("poor");
  });

  it("uses the product release thresholds for INP", () => {
    expect(ratePublicWebVital("INP", 200)).toBe("good");
    expect(ratePublicWebVital("INP", 201)).toBe("needs-improvement");
    expect(ratePublicWebVital("INP", 501)).toBe("poor");
  });

  it("uses the product release thresholds for CLS", () => {
    expect(ratePublicWebVital("CLS", 0.1)).toBe("good");
    expect(ratePublicWebVital("CLS", 0.101)).toBe("needs-improvement");
    expect(ratePublicWebVital("CLS", 0.251)).toBe("poor");
  });
});
