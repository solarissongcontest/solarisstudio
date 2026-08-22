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
    expect(detailRoute).toContain("admin_confirmation_response");
    expect(detailRoute).toContain("admin_review_confirmation_entry");
  });

  it("restores the standalone response filters, edition scope and Next in Line admin view", () => {
    const listRoute = source("src/routes/confirmations/admin/responses.tsx");

    expect(listRoute).toContain('value: "participating"');
    expect(listRoute).toContain('value: "national_final"');
    expect(listRoute).toContain('value: "song_submitted"');
    expect(listRoute).toContain('value: "unreviewed"');
    expect(listRoute).toContain('value: "nf_declined"');
    expect(listRoute).toContain("All editions");
    expect(listRoute).toContain("All rounds");
    expect(listRoute).toContain("Next in Line");
    expect(listRoute).toContain("admin_confirmation_next_in_line");
  });

  it("keeps the response-card triage glow contract", () => {
    const listRoute = source("src/routes/confirmations/admin/responses.tsx");

    expect(listRoute).toContain('type CardState = "review" | "issue" | "ready" | "neutral"');
    expect(listRoute).toContain("Needs review");
    expect(listRoute).toContain("Needs fixing");
    expect(listRoute).toContain("Waiting for winner");
    expect(listRoute).toContain("rgba(251,113,133");
    expect(listRoute).toContain("rgba(252,211,77");
    expect(listRoute).toContain("rgba(110,231,183");
  });

  it("restores old response-detail organizer tools", () => {
    const detailRoute = source("src/routes/confirmations/admin/responses/$id.tsx");

    expect(detailRoute).toContain("90s final clip");
    expect(detailRoute).toContain("Replacement video");
    expect(detailRoute).toContain("Reset to pending");
    expect(detailRoute).toContain("Clear NF winner");
    expect(detailRoute).toContain("Copy National Final entries");
    expect(detailRoute).toContain("admin_confirmation_create_edit_token");
    expect(detailRoute).toContain("admin_confirmation_revoke_edit_token");
    expect(detailRoute).toContain("admin_confirmation_technical");
    expect(detailRoute).toContain("admin_confirmation_delete_response");
  });
});
