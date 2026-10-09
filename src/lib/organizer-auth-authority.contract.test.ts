import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(path, "utf8");

describe("Organizer authentication authority", () => {
  it("reuses the authenticated parent route user instead of revalidating during lazy Organizer mount", () => {
    const route = source("src/routes/_authenticated/admin/route.tsx");
    expect(route).toContain("beforeLoad: async ({ location, context })");
    expect(route).toContain("const user = context.user");
    expect(route).not.toContain("supabase.auth.getUser()");
    expect(route).toContain("hasSolarisOrganizerAccess(user.id)");
  });

  it("does not start Auth verification requests from Organizer shell render observers", () => {
    const shell = source("src/components/admin/AdminShell.tsx");
    const adminOps = source("src/lib/admin-ops.ts");
    const notificationsStart = adminOps.indexOf("export function useAdminNotifications()");
    const notificationsEnd = adminOps.indexOf("export function useCreateAdminDeadline()");
    const notificationsHook = adminOps.slice(notificationsStart, notificationsEnd);

    expect(shell).not.toContain("supabase.auth.getUser()");
    expect(notificationsHook).toContain("supabase.auth.getSession()");
    expect(notificationsHook).not.toContain("supabase.auth.getUser()");
  });
});
