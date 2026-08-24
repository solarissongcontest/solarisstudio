import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const editor = readFileSync(
  resolve(process.cwd(), "src/routes/_authenticated/country-hub/theme.tsx"),
  "utf8",
);

describe("country personality V5 compatibility labels", () => {
  it("keeps old stored values but exposes the requested human-readable names", () => {
    expect(editor).toContain('value: "monument", label: "Luxurious"');
    expect(editor).toContain('value: "heritage", label: "Traditional"');
  });
});
