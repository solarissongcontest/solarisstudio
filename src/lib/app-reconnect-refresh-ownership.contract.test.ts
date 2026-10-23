import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(path, "utf8");

describe("installed-app reconnect refresh ownership", () => {
  it("keeps resume freshness and connectivity recovery under separate coordinators", () => {
    const root = source("src/routes/__root.tsx");
    const resume = source("src/components/app/AppDataFreshnessCoordinator.tsx");
    const reconnect = source("src/components/app/AppReconnectReconciler.tsx");

    expect(root.match(/<AppDataFreshnessCoordinator \/>/g)).toHaveLength(1);
    expect(root.match(/<AppReconnectReconciler \/>/g)).toHaveLength(1);

    expect(resume).toContain("APP_RESUME_EVENT");
    expect(resume).toContain("freshnessLevelsForResume");
    expect(resume).not.toContain("connectivity.status");
    expect(resume).not.toContain("previousConnectivity");
    expect(resume).not.toContain("APP_CONNECTIVITY_RECOVERED_EVENT");

    expect(reconnect).toContain("APP_CONNECTIVITY_RECOVERED_EVENT");
    expect(reconnect).toContain("queryClient.invalidateQueries");
    expect(reconnect).toContain("router.invalidate");
  });
});
