import { spawnSync } from "node:child_process";

export default async function pr455BrowserPreflight() {
  if (!process.env.CI) return;
  if (process.env.SOLARIS_PR455_PREFLIGHT_CHILD === "1") return;

  const result = spawnSync(
    "bunx",
    ["playwright", "test", "--config=playwright.pr455-preflight.config.ts"],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        SOLARIS_PR455_PREFLIGHT_CHILD: "1",
      },
      stdio: "inherit",
    },
  );

  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `PR455 Organizer regression preflight failed with exit code ${result.status ?? "unknown"}; refusing to start the expensive Browser Audit matrix.`,
    );
  }
}
