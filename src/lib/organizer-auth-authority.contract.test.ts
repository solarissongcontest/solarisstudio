import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(path, "utf8");

describe("Organizer authentication authority", () => {
  it("keeps identity in the authenticated parent and awaits Organizer role access in the admin loader", () => {
    const authenticatedRoute = source("src/routes/_authenticated/route.tsx");
    const adminRoute = source("src/routes/_authenticated/admin/route.tsx");
    const beforeLoadStart = adminRoute.indexOf("beforeLoad:");
    const loaderStart = adminRoute.indexOf("loader:");
    const adminBeforeLoad = adminRoute.slice(beforeLoadStart, loaderStart);

    expect(authenticatedRoute).toContain("supabase.auth.getUser()");
    expect(authenticatedRoute).toContain("return { user: data.user }");
    expect(authenticatedRoute).not.toContain("hasSolarisOrganizerAccess");

    expect(adminRoute).toContain("beforeLoad: ({ location, context })");
    expect(adminBeforeLoad).not.toContain("await ");
    expect(adminBeforeLoad).not.toContain("hasSolarisOrganizerAccess");
    expect(adminRoute).toContain("loader: async ({ context })");
    expect(adminRoute).toContain("isOrganizer = await hasSolarisOrganizerAccess(user.id)");
    expect(adminRoute).toContain("if (!isOrganizer)");
    expect(adminRoute).toContain('to: "/my-solaris"');
    expect(adminRoute).toContain('notice: "organizer-access-required"');
    expect(adminRoute).toContain("replace: true");
    expect(adminRoute).not.toContain("supabase.auth.getUser()");
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
