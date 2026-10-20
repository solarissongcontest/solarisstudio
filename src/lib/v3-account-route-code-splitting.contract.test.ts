import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const accountRouteSource = readFileSync(
  resolve(process.cwd(), "src/routes/_authenticated/my-solaris/account.tsx"),
  "utf8",
);

describe("V3 account route bundle boundary", () => {
  it("keeps mutually exclusive legacy and V3 account surfaces out of the eager route graph", () => {
    expect(accountRouteSource).not.toContain(
      'import { MySolarisAccountPanel } from "@/components/MySolarisAccountPanel"',
    );
    expect(accountRouteSource).not.toContain(
      'import { MySolarisNotificationsPanel } from "@/components/mysolaris/MySolarisNotificationsPanel"',
    );
    expect(accountRouteSource).not.toContain(
      'import { MySolarisPasswordPanel } from "@/components/MySolarisPasswordPanel"',
    );
    expect(accountRouteSource).not.toContain(
      'import { V3AccountSections } from "@/components/v3/V3AccountSections"',
    );

    expect(accountRouteSource).toContain('import("@/components/MySolarisAccountPanel")');
    expect(accountRouteSource).toContain(
      'import("@/components/mysolaris/MySolarisNotificationsPanel")',
    );
    expect(accountRouteSource).toContain('import("@/components/MySolarisPasswordPanel")');
    expect(accountRouteSource).toContain('import("@/components/v3/V3AccountSections")');
  });

  it("keeps both deferred trees behind Suspense instead of deleting compatibility behavior", () => {
    expect(accountRouteSource).toContain("<LazyV3AccountSections />");
    expect(accountRouteSource).toContain("<LazyMySolarisAccountPanel />");
    expect(accountRouteSource).toContain("<LazyMySolarisNotificationsPanel />");
    expect(accountRouteSource).toContain("<LazyMySolarisPasswordPanel />");
    expect(accountRouteSource).toContain("<Suspense");
    expect(accountRouteSource).toContain("<LegacyAccountContent />");
  });
});
