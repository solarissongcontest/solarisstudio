import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const page = readFileSync("src/lib/maintenance-page.ts", "utf8");
const server = readFileSync("src/server.ts", "utf8");

describe("maintenance Confirmation deep-link routing", () => {
  it("keeps root-page anchors cheap while rewriting deep maintenance pages to the real root portal", () => {
    expect(page).toContain('href="#confirmation-access"');
    expect(server).toContain('if (new URL(request.url).pathname !== "/")');
    expect(server).toContain(
      "html = html.replaceAll('href=\"#confirmation-access\"', 'href=\"/#confirmation-access\"');",
    );
  });

  it("does not broaden the functional HOD portal injection beyond the root maintenance response", () => {
    expect(server).toContain('return maintenanceResponse(request, env, url.pathname === "/")');
  });
});
