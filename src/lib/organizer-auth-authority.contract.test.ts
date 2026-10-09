import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(path, "utf8");

describe("Organizer authentication authority", () => {
  it("keeps identity in the authenticated parent and verifies Organizer role access only after the gate mounts", () => {
    const authenticatedRoute = source("src/routes/_authenticated/route.tsx");
    const adminRoute = source("src/routes/_authenticated/admin/route.tsx");
    const beforeLoadStart = adminRoute.indexOf("beforeLoad:");
    const componentStart = adminRoute.indexOf("component:");
    const adminBeforeLoad = adminRoute.slice(beforeLoadStart, componentStart);
    const gateStart = adminRoute.indexOf("function OrganizerAccessGate");
    const gateEnd = adminRoute.indexOf("export const Route", gateStart);
    const gate = adminRoute.slice(gateStart, gateEnd);

    expect(authenticatedRoute).toContain("supabase.auth.getUser()");
    expect(authenticatedRoute).toContain("return { user: data.user }");
    expect(authenticatedRoute).not.toContain("hasSolarisOrganizerAccess");

    expect(adminRoute).toContain("beforeLoad: ({ location, context })");
    expect(adminBeforeLoad).not.toContain("await ");
    expect(adminBeforeLoad).not.toContain("hasSolarisOrganizerAccess");
    expect(adminBeforeLoad).toContain("return { user }");
    expect(adminRoute).not.toContain("loader:");
    expect(adminRoute).not.toContain("supabase.auth.getUser()");

    expect(gateStart).toBeGreaterThanOrEqual(0);
    expect(gate).toContain("useEffect(() =>");
    expect(gate).toContain("isOrganizer = await hasSolarisOrganizerAccess(user.id)");
    expect(gate).toContain("if (!active) return");
    expect(gate).toContain('to: "/my-solaris"');
    expect(gate).toContain('notice: "organizer-access-required"');
    expect(gate).toContain("replace: true");
    expect(gate).toContain('state !== "allowed"');

    const gateUse = adminRoute.indexOf("<OrganizerAccessGate user={user}>");
    const shellUse = adminRoute.indexOf("<AdminShell", gateUse);
    expect(gateUse).toBeGreaterThanOrEqual(0);
    expect(shellUse).toBeGreaterThan(gateUse);
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
