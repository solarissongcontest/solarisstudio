import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(path, "utf8");

function routeFiles(root: string): string[] {
  return readdirSync(root).flatMap((name) => {
    const path = join(root, name);
    return statSync(path).isDirectory()
      ? routeFiles(path)
      : /\.tsx?$/.test(name)
        ? [path]
        : [];
  });
}

describe("Organizer authentication authority", () => {
  it("verifies identity only after the authenticated boundary mounts, then reuses it for Organizer access", () => {
    const authenticatedRoute = source("src/routes/_authenticated/route.tsx");
    const adminRoute = source("src/routes/_authenticated/admin/route.tsx");
    const identityGateStart = authenticatedRoute.indexOf("function AuthenticatedIdentityGate");
    const identityGateEnd = authenticatedRoute.indexOf(
      "function MySolarisAccessGate",
      identityGateStart,
    );
    const identityGate = authenticatedRoute.slice(identityGateStart, identityGateEnd);
    const organizerGateStart = adminRoute.indexOf("function OrganizerAccessGate");
    const organizerGateEnd = adminRoute.indexOf("export const Route", organizerGateStart);
    const organizerGate = adminRoute.slice(organizerGateStart, organizerGateEnd);

    expect(authenticatedRoute).toContain("ssr: false");
    expect(authenticatedRoute).not.toContain("beforeLoad:");
    expect(authenticatedRoute).not.toContain("throw redirect");
    expect(identityGateStart).toBeGreaterThanOrEqual(0);
    expect(identityGate).toContain("useEffect(() =>");
    expect(identityGate).toContain("await supabase.auth.getUser()");
    expect(identityGate).toContain("if (!active) return");
    expect(identityGate).toContain('to: "/auth"');
    expect(identityGate.indexOf("await supabase.auth.getUser()")).toBeGreaterThan(
      identityGate.indexOf("useEffect(() =>"),
    );
    expect(authenticatedRoute).toContain("<AuthenticatedIdentityGate>");
    expect(authenticatedRoute).toContain("<AuthenticatedUserProvider user={state.user}>");
    expect(authenticatedRoute).not.toContain("hasSolarisOrganizerAccess");

    expect(adminRoute).not.toContain("beforeLoad:");
    expect(adminRoute).not.toContain("loader:");
    expect(adminRoute).not.toContain("supabase.auth.getUser()");
    expect(adminRoute).toContain("const user = useAuthenticatedUser()");
    expect(organizerGateStart).toBeGreaterThanOrEqual(0);
    expect(organizerGate).toContain("useEffect(() =>");
    expect(organizerGate).toContain("isOrganizer = await hasSolarisOrganizerAccess(user.id)");
    expect(organizerGate).toContain("if (!active) return");
    expect(organizerGate).toContain('to: "/my-solaris"');
    expect(organizerGate).toContain('notice: "organizer-access-required"');
    expect(organizerGate).toContain("replace: true");

    const gateUse = adminRoute.indexOf("<OrganizerAccessGate user={user}>");
    const shellUse = adminRoute.indexOf("<AdminShell", gateUse);
    expect(gateUse).toBeGreaterThanOrEqual(0);
    expect(shellUse).toBeGreaterThan(gateUse);
  });

  it("does not allow authenticated child loaders to bypass the mounted identity gate", () => {
    for (const path of routeFiles("src/routes/_authenticated")) {
      expect(
        source(path),
        `${path} must not load route data before identity is verified`,
      ).not.toMatch(/\bloader\s*:/);
    }
  });

  it("does not start Auth verification requests from Organizer shell render observers", () => {
    const shell = source("src/components/admin/AdminShell.tsx");
    const adminOps = source("src/lib/admin-ops.ts");
    const notificationsStart = adminOps.indexOf("export function useAdminNotifications()");
    const notificationsEnd = adminOps.indexOf("export function useCreateAdminDeadline()");
    const notificationsHook = adminOps.slice(notificationsStart, notificationsEnd);

    expect(shell).not.toContain("supabase.auth.getUser()");
    expect(shell).not.toContain("supabase.auth.getSession()");
    expect(notificationsHook).toContain("const user = useAuthenticatedUser();");
    expect(notificationsHook).toContain('["admin-notifications", user.id]');
    expect(notificationsHook).toContain('.eq("recipient_id", user.id)');
    expect(notificationsHook).not.toContain("supabase.auth.getSession()");
    expect(notificationsHook).not.toContain("supabase.auth.getUser()");
  });
});