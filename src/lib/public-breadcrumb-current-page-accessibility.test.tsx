import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";

describe("public breadcrumb current-page accessibility", () => {
  it("announces the current location as current text, never a disabled fake link", () => {
    const html = renderToStaticMarkup(
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href="/results">Results</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Scorecharts</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>,
    );

    expect(html).toContain('aria-label="breadcrumb"');
    expect(html).toContain('href="/results"');
    expect(html).toContain('aria-current="page"');
    expect(html).toMatch(/<span[^>]*aria-current="page"[^>]*>Scorecharts<\/span>/);
    expect(html).not.toContain('role="link"');
    expect(html).not.toContain('aria-disabled="true"');
    expect(html).not.toContain('href="/scorecharts"');
  });
});
