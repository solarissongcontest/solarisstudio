import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

describe("Solaris Studio guides and country confirmation access", () => {
  const appShell = source("components/AppShell.tsx");
  const adminNav = source("components/admin/AdminNav.tsx");
  const adminFrame = source("components/admin/AdminFrame.tsx");
  const commandPalette = source("components/admin/AdminCommandPalette.tsx");
  const publicGuide = source("routes/guide/index.tsx");
  const adminGuide = source("routes/_authenticated/admin/guide.tsx");
  const confirmations = source("routes/confirmations/index.tsx");
  const accountBridge = source("lib/confirmation-country-account.ts");
  const confirmationSql = source("../scripts/confirmations-country-account-editing.sql");

  it("keeps both guide pages easy to find", () => {
    expect(appShell).toContain('to="/guide"');
    expect(adminNav).toContain('to: "/admin/guide"');
    expect(adminFrame).toContain('href: "/admin/guide"');
    expect(commandPalette).toContain('["Guide", "/admin/guide", "Help"');
  });

  it("keeps substantial public and organizer Q&A guides", () => {
    expect((publicGuide.match(/question:/g) ?? []).length).toBeGreaterThan(15);
    expect((adminGuide.match(/question:/g) ?? []).length).toBeGreaterThan(15);
    expect(publicGuide).toContain("How to use Solaris Studio");
    expect(adminGuide).toContain("How to use the organizer tools");
  });

  it("keeps the current public and organizer section names", () => {
    for (const text of ['label="Insights"', 'label: "Pulse"', 'label: "Relationships"', 'label: "Participate"'])
      expect(appShell).toContain(text);

    expect(adminNav).toContain(">Workspace<");
    expect(adminNav).toContain(">More<");
    expect(appShell).not.toContain('label: "Recent activity"');
    expect(appShell).not.toContain('label: "Voting links"');
  });

  it("lets a signed-in country account find and edit only its own confirmation", () => {
    expect(accountBridge).toContain("public_country_account_confirmation_access");
    expect(accountBridge).toContain("public_create_country_account_edit_token");
    expect(confirmations).toContain("Country account connected");
    expect(confirmations).toContain("Edit your response");
    expect(confirmations).toContain("Recover response");
  });

  it("requires editing to be open before issuing a country-account edit token", () => {
    expect(confirmationSql).toContain("not coalesce(s.locked, false)");
    expect(confirmationSql).toContain("coalesce(s.editing_allowed, false)");
    expect(confirmationSql).toContain("coalesce(r.editing_enabled, false)");
    expect(confirmationSql).toContain("coalesce(e.editing_enabled, false)");
    expect(confirmationSql).toContain("token_type = 'country_account'");
    expect(confirmationSql).toContain("now() + interval '2 hours'");
  });

  it("documents automatic confirmation access in both guides", () => {
    expect(publicGuide).toContain("without entering a recovery code");
    expect(adminGuide).toContain("without a recovery code");
  });
});
