import { describe, expect, it } from "vitest";
import { appRoutePath } from "./route-path";

describe("appRoutePath", () => {
  it("keeps normal production routes unchanged", () => {
    expect(appRoutePath("/countries/OLA")).toBe("/countries/OLA");
    expect(appRoutePath("/wiki/OLA")).toBe("/wiki/OLA");
  });

  it("removes the Cloudflare development mount prefix", () => {
    expect(appRoutePath("/dev")).toBe("/");
    expect(appRoutePath("/dev/countries/OLA")).toBe("/countries/OLA");
    expect(appRoutePath("/dev/country-hub/theme")).toBe("/country-hub/theme");
  });
});
