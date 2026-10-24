import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  loadOrganizerMoreRouteAccess,
  planOrganizerMoreAccess,
  type OrganizerMoreAccessRpcClient,
} from "./v3-organizer-more-access";

function clientWithDecisions(
  decisions: Record<string, unknown>,
  calls: Array<{ name: string; args?: Record<string, unknown> }>,
): OrganizerMoreAccessRpcClient {
  return {
    rpc: async (name, args) => {
      calls.push({ name, args });
      const capability = String(args?.p_capability ?? "");
      return { data: decisions[capability], error: null };
    },
  };
}

describe("Organizer V3 More access projection", () => {
  it("deduplicates route checks by the canonical route capability", async () => {
    const paths = [
      "/admin/predictions",
      "/admin/fantasy",
      "/admin/access-permissions",
    ] as const;
    const plan = planOrganizerMoreAccess(paths);

    expect(plan.capabilities).toEqual(["edition.read", "permissions.read"]);
    expect(plan.pathCapabilities["/admin/predictions"]).toBe("edition.read");
    expect(plan.pathCapabilities["/admin/fantasy"]).toBe("edition.read");
    expect(plan.pathCapabilities["/admin/access-permissions"]).toBe("permissions.read");

    const calls: Array<{ name: string; args?: Record<string, unknown> }> = [];
    const access = await loadOrganizerMoreRouteAccess(
      paths,
      "00000000-0000-0000-0000-000000000022",
      clientWithDecisions(
        {
          "edition.read": true,
          "permissions.read": false,
        },
        calls,
      ),
    );

    expect(access).toEqual({
      "/admin/predictions": true,
      "/admin/fantasy": true,
      "/admin/access-permissions": false,
    });
    expect(calls).toHaveLength(2);
    expect(calls).toEqual(
      expect.arrayContaining([
        {
          name: "studio2_access_allowed",
          args: {
            p_capability: "edition.read",
            p_edition_id: "00000000-0000-0000-0000-000000000022",
            p_strict_before_cutover: false,
          },
        },
        {
          name: "studio2_access_allowed",
          args: {
            p_capability: "permissions.read",
            p_edition_id: "00000000-0000-0000-0000-000000000022",
            p_strict_before_cutover: false,
          },
        },
      ]),
    );
  });

  it("fails closed when the permission service returns malformed evidence", async () => {
    const calls: Array<{ name: string; args?: Record<string, unknown> }> = [];

    await expect(
      loadOrganizerMoreRouteAccess(
        ["/admin/system"],
        null,
        clientWithDecisions({ "system.read": "yes" }, calls),
      ),
    ).rejects.toThrow("Invalid access decision for system.read");
  });

  it("fails closed when a permission check errors", async () => {
    const client: OrganizerMoreAccessRpcClient = {
      rpc: async () => ({ data: null, error: { message: "permission service unavailable" } }),
    };

    await expect(
      loadOrganizerMoreRouteAccess(["/admin/rules-manager"], null, client),
    ).rejects.toThrow("permission service unavailable");
  });

  it("keeps More presentation-only, cached by Organizer scope and hidden until verified", () => {
    const source = readFileSync(
      resolve(process.cwd(), "src/routes/_authenticated/admin/more.tsx"),
      "utf8",
    );

    expect(source).toContain("loadOrganizerMoreRouteAccess(morePaths, editionId ?? null)");
    expect(source).toContain('["v3-organizer-more-access", editionId ?? "unscoped"]');
    expect(source).toContain("retry: false");
    expect(source).toContain("refetchOnWindowFocus: false");
    expect(source).toContain("accessByPath[item.to] === true");
    expect(source).toContain("access.isPending");
    expect(source).toContain("access.isError");
    expect(source).toContain("Specialist access unavailable");
    expect(source).not.toContain("supabase.from(");
    expect(source).not.toContain("has_role");
  });
});
