import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PrimarySurfaceRecovery } from "./PrimarySurfaceRecovery";

describe("primary surface recovery before hydration", () => {
  it.each([ ["home", "/"], ["participate", "/participate"] ] as const)("provides native recovery for %s without scripts or mutation", (surface, action) => {
    const html = renderToStaticMarkup(<PrimarySurfaceRecovery surface={surface} />);
    expect(html).toContain(`<form action="${action}"`);
    expect(html).toContain('method="get"');
    expect(html).toContain("<details");
    expect(html).toContain("<summary");
    expect(html).toContain("<noscript>");
    expect(html).toContain('type="submit"');
    expect(html).not.toMatch(/<script|aria-busy|localStorage|\/api\/|\/jury-voting|\/televoting/);
  });
});
