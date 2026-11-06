import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { PublicAdvancedDisclosure } from "@/components/public/PublicAdvancedDisclosure";

describe("public advanced disclosure accessibility", () => {
  it("exposes a stable real controlled region while closed without mounting hidden content", () => {
    const html = renderToStaticMarkup(
      <PublicAdvancedDisclosure label="More result tools">
        <a href="/result-lab">Result Lab</a>
      </PublicAdvancedDisclosure>,
    );

    const targetId = html.match(/aria-controls="([^"]+)"/)?.[1];
    expect(targetId).toBeTruthy();
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain(`id="${targetId}"`);
    expect(html).toMatch(/class="public-advanced-content" hidden/);
    expect(html).not.toContain("Result Lab");
  });

  it("exposes the exact controlled content when expanded", () => {
    const html = renderToStaticMarkup(
      <PublicAdvancedDisclosure label="More result tools" defaultOpen>
        <a href="/result-lab">Result Lab</a>
      </PublicAdvancedDisclosure>,
    );

    const targetId = html.match(/aria-controls="([^"]+)"/)?.[1];
    expect(targetId).toBeTruthy();
    expect(html).toContain(`id="${targetId}"`);
    expect(html).toContain('aria-expanded="true"');
    expect(html).toContain('href="/result-lab"');
    expect(html).not.toContain('class="public-advanced-content" hidden');
  });

  it("restores focus to the trigger after Escape and preserves lazy mounting", () => {
    const source = readFileSync(
      resolve(process.cwd(), "src/components/public/PublicAdvancedDisclosure.tsx"),
      "utf8",
    );

    expect(source).toContain('if (event.key !== "Escape" || !open) return;');
    expect(source).toContain("event.preventDefault()");
    expect(source).toContain("event.stopPropagation()");
    expect(source).toContain("triggerRef.current?.focus()");
    expect(source).toContain("ref={triggerRef}");
    expect(source).toContain("hidden={!open}");
    expect(source).toContain("{open ? children : null}");
    expect(source).toContain("onOpen?.()");
  });
});
