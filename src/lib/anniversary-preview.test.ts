import { describe, expect, it } from "vitest";

import { parseAnniversaryPreviewValue } from "./anniversary-preview";

describe("anniversary preview parsing", () => {
  it("maps preview aliases to active mode", () => {
    expect(parseAnniversaryPreviewValue("preview")).toBe("active");
    expect(parseAnniversaryPreviewValue("active")).toBe("active");
  });

  it("supports countdown and afterglow previews", () => {
    expect(parseAnniversaryPreviewValue("countdown")).toBe("countdown");
    expect(parseAnniversaryPreviewValue("after")).toBe("after");
  });

  it("supports explicitly turning a sticky preview off", () => {
    expect(parseAnniversaryPreviewValue("off")).toBe("off");
  });

  it("ignores unknown preview values", () => {
    expect(parseAnniversaryPreviewValue("banana")).toBeNull();
    expect(parseAnniversaryPreviewValue(null)).toBeNull();
  });
});
