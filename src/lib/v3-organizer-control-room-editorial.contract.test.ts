import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const route = () => read("src/routes/_authenticated/admin/control-room.tsx");
const css = () => read("src/styles/v3-organizer-control-room-editorial.css");

describe("Screenshot-driven Organizer Control Room redesign", () => {
  it("presents a real operational state rail, exception list, and command workspace", () => {
    const source = route();
    expect(source).toContain('data-control-room-design="operational"');
    expect(source).toContain('className="admin-control-room-editorial');
    expect(source).toContain('className="admin-control-state-strip');
    expect(source).toContain('className="admin-control-commands');
    expect(source).toContain('className="admin-control-incidents');
    expect(source).toContain('className="admin-control-transition');
    expect(source).toContain('className="admin-control-subsystems');
    expect(source).toContain("ControlRoomImmediateAttention");
    expect(source).toContain("readinessLoading={readinessDataQuery.isLoading || showsQuery.isLoading}");
    expect(source).toContain("snapshot.incidentSummary.crisisMode");
  });

  it("retains original authorization, review boundaries and installed-app header", () => {
    const source = route();
    expect(source).toContain("useSolarisApp()");
    expect(source).toContain('eyebrow={isAppMode ? "Solaris Studio 2" : undefined}');
    expect(source).toContain("const { editionId } = useAdminContext()");
    expect(source).toContain("studio2ControlRoom.loadSnapshot(editionId!)");
    expect(source).toContain("controlRoomReviewMatchesEdition(");
    expect(source).toContain("runtimeVersion: snapshot.runtime.version");
    expect(source).toContain("transitionEdition.mutateAsync");
    expect(source).toContain("approveTransition.mutateAsync");
    expect(source).toContain("createIncident.mutate()");
    expect(source).toContain("AdminConfirmSheet");
  });

  it("exposes command errors to assistive technology and styles only ordinary web", () => {
    const source = route();
    const styles = css();
    expect(source).toContain('import \'@/styles/v3-organizer-control-room-editorial.css\'');
    expect(source).toContain('role="alert"');
    expect(styles).toContain("html:not([data-solaris-app]) .admin-control-room");
    expect(styles).toContain("admin-control-state-strip");
    expect(styles).toContain("admin-control-transition button:focus-visible");
    expect(styles).toContain("min-height: 44px");
    expect(styles).toContain("@media (max-width: 359px)");
    expect(styles).toContain("@media (forced-colors: active)");
  });
});
