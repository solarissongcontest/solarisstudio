import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("confirmation response review routing", () => {
  it("mounts the response detail child instead of trapping the user on the response list", () => {
    const listRoute = source("src/routes/confirmations/admin/responses.tsx");
    const detailRoute = source("src/routes/confirmations/admin/responses/$id.tsx");

    expect(listRoute).toContain("Outlet");
    expect(listRoute).toContain("pathname.startsWith(`${Route.fullPath}/`)");
    expect(listRoute).toContain("return <Outlet />");
    expect(listRoute).toContain('to="/confirmations/admin/responses/$id"');
    expect(detailRoute).toContain('createFileRoute("/confirmations/admin/responses/$id")');
    expect(detailRoute).toContain('admin_confirmation_response');
    expect(detailRoute).toContain('admin_review_confirmation_entry');
  });
});
