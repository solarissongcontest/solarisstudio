import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(path, "utf8");

describe("App Experience v3 native entity actions and preloading", () => {
  it("uses native Share on entity screens with a clipboard fallback", () => {
    const toolbar = source("src/components/app/AppToolbar.tsx");
    const share = source("src/components/app/AppNativeShareButton.tsx");
    expect(toolbar).toContain('chrome.archetype === "entity"');
    expect(toolbar).toContain("<AppNativeShareButton");
    expect(share).toContain('typeof navigator.share === "function"');
    expect(share).toContain("navigator.clipboard?.writeText");
    expect(share).toContain('aria-label="Share this page"');
    expect(share).toContain('error.name === "AbortError"');
  });

  it("preloads route code on genuine navigation intent", () => {
    const router = source("src/router.tsx");
    expect(router).toContain('defaultPreload: "intent"');
    expect(router).toContain("defaultPreloadStaleTime: 60_000");
  });

  it("keeps focused task chrome free from unrelated Share controls", () => {
    const toolbar = source("src/components/app/AppToolbar.tsx");
    expect(toolbar).toContain('chrome.archetype === "task"');
    expect(toolbar).toContain("chrome.helpTo");
  });
});
