import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = () => readFileSync(resolve(process.cwd(), "src/routes/_authenticated/admin/communications.tsx"), "utf8");
const styles = () => readFileSync(resolve(process.cwd(), "src/styles/v3-organizer-communications-editorial.css"), "utf8");

describe("Official Communications web workspaces", () => {
  it("separates history and composing without hiding the original installed-app desk", () => {
    const route = source();
    expect(route).toContain("desk?: 'compose'");
    expect(route).toContain("desk: search.desk === 'compose' ? 'compose' : undefined");
    expect(route).toContain("const showCompose = isAppMode || search.desk === 'compose'");
    expect(route).toContain("const showArchive = isAppMode || search.desk !== 'compose'");
    expect(route).toContain('aria-label="Communications workspace views"');
    expect(route).toContain("aria-pressed={showArchive}");
    expect(route).toContain("aria-pressed={showCompose}");
    expect(route).toContain("onClick={() => openDesk('history')}");
    expect(route).toContain("onClick={() => openDesk('compose')}");
    expect(route).toContain("showCompose ? (");
    expect(route).toContain("showArchive ? (");
    expect(route).toContain("admin-communications-composer");
    expect(route).toContain("admin-communications-history");
  });

  it("keeps edition context, authorization, review and archival semantics unchanged", () => {
    const route = source();
    expect(route).toContain("useAdminContext()");
    expect(route).toContain("enabled: Boolean(editionId)");
    expect(route).toContain("loadStudio2Notices(editionId)");
    expect(route).toContain("createStudio2NoticeDraft(currentInput())");
    expect(route).toContain("updateStudio2NoticeDraft(editingId, currentInput())");
    expect(route).toContain("publishStudio2Notice(draft.id)");
    expect(route).toContain("scheduleStudio2Notice(draft.id, date.toISOString())");
    expect(route).toContain("archiveStudio2Communication");
    expect(route).toContain("deleteStudio2Communication");
    expect(route).toContain("AdminConfirmSheet");
    expect(route).toContain("acknowledgementRequired");
    expect(route).toContain("displaySurfaces");
  });

  it("does not fetch revision history for an invisible browser composer and styles web only", () => {
    const route = source();
    const css = styles();
    expect(route).toContain("enabled: Boolean(editionId && selectedNotice && showArchive)");
    expect(route).toContain("desk: isAppMode ? undefined : 'compose'");
    expect(route).toContain("import '@/styles/v3-organizer-communications-editorial.css'");
    expect(css).toContain("html:not([data-solaris-app]) .admin-control-room");
    expect(css).toContain('admin-communications-desk-tabs button[aria-pressed="true"]');
    expect(css).toContain("min-height: 48px");
    expect(css).toContain("min-height: 44px");
    expect(css).toContain("@media (max-width: 359px)");
    expect(css).toContain("@media (forced-colors: active)");
  });
});
