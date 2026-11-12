import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { AppUpdatePrompt } from "@/components/app/AppUpdatePrompt";


const updatePrompt = () =>
  readFileSync("src/components/app/AppUpdatePrompt.tsx", "utf8");

describe("V3 safe-update prompt accessibility contract", () => {
  it("renders a polite live announcement without an implicit update action", () => {
    const html = renderToStaticMarkup(
      createElement(AppUpdatePrompt, { onUpdate: () => undefined }),
    );

    expect(html).toContain('role="status"');
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain('aria-atomic="true"');
    expect(html).toContain("Solaris Studio update available");
    expect(html).toContain('type="button"');
    expect(html).not.toContain("autofocus");
  });

  it("announces newly available safe updates without stealing focus", () => {
    const source = updatePrompt();

    expect(source).toContain('role="status"');
    expect(source).toContain('aria-live="polite"');
    expect(source).toContain('aria-atomic="true"');
    expect(source).toContain("Solaris Studio update available");
  });

  it("keeps update activation as an explicit user action", () => {
    const source = updatePrompt();

    expect(source).toContain('type="button"');
    expect(source).toContain("onClick={onUpdate}");
    expect(source).toContain("Update");
    expect(source).not.toContain("autoFocus");
  });
});
