import { describe, expect, it } from "vitest";

import {
  resolveV3AuthReturnPath,
  v3AuthReturnRequiresOrganizer,
} from "./v3-auth-return-intent";

describe("V3 auth return intent", () => {
  it("preserves safe internal destinations including query and hash state", () => {
    expect(resolveV3AuthReturnPath("/participate?task=entry#review")).toBe(
      "/participate?task=entry#review",
    );
  });

  it.each([
    [undefined],
    [null],
    ["https://evil.example/path"],
    ["//evil.example/path"],
    ["/\\evil.example/path"],
    ["javascript:alert(1)"],
    ["participate"],
    ["/participate\n/next"],
  ])("rejects unsafe return input %s", (value) => {
    expect(resolveV3AuthReturnPath(value)).toBeNull();
  });

  it("classifies Organizer workspaces without overmatching ordinary public paths", () => {
    expect(v3AuthReturnRequiresOrganizer("/admin/results")).toBe(true);
    expect(v3AuthReturnRequiresOrganizer("/confirmations/admin/responses")).toBe(true);
    expect(v3AuthReturnRequiresOrganizer("/televoting/admin")).toBe(true);
    expect(v3AuthReturnRequiresOrganizer("/administrator-guide")).toBe(false);
    expect(v3AuthReturnRequiresOrganizer("/confirmations")).toBe(false);
  });
});
