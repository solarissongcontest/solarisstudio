import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(path, "utf8");

describe("Organizer authentication authority", () => {
  it("resolves Organizer access in the authenticated parent and consumes it synchronously in the lazy Organizer route", () => {
    const authenticatedRoute = source("src/routes/_authenticated/route.tsx");
    const adminRoute = source("src/routes/_authenticated/admin/route.tsx");

    expect(authenticatedRoute).toContain("hasSolarisOrganizerAccess(data.user.id)");
    expect(authenticatedRoute).toContain('location.pathname === "/admin"');
    expect(authenticatedRoute).toContain('location.pathname.startsWith("/admin/")');
    expect(authenticatedRoute).toContain("organizerAccess = false");

    expect(adminRoute).toContain("beforeLoad: ({ location, context })");
    expect(adminRoute).toContain("const user = context.user");
    expect(adminRoute).toContain("context.organizerAccess !== true");
    expect(adminRoute).not.toContain("supabase.auth.getUser()");
    expect(adminRoute).not.toContain("hasSolarisOrganizerAccess(user.id)");
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
