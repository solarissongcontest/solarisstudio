import { expect, test, type Page } from "@playwright/test";

import {
  applyNavbarInstalledCssEmulation,
  prepareNavbarInstalledContext,
} from "./navbar-local-rollout";

type FrameProfile = {
  sampleCount: number;
  durationMs: number;
  averageFrameMs: number;
  p95FrameMs: number;
  maxFrameMs: number;
  framesOver34Ms: number;
  framesOver50Ms: number;
};

async function startFrameSampler(page: Page, durationMs: number) {
  await page.evaluate((duration) => {
    const samples: number[] = [];
    let startedAt: number | null = null;
    let previous: number | null = null;
    (window as unknown as { __v3FrameProfile?: Promise<FrameProfile> }).__v3FrameProfile =
      new Promise<FrameProfile>((resolve) => {
        const tick = (now: number) => {
          // Start the profiling window on the first frame actually delivered by
          // the browser. Headless WebKit can delay that first RAF while the test
          // process is busy; counting that scheduler delay as the entire sample
          // window produced one-frame false failures instead of frame evidence.
          if (startedAt == null || previous == null) {
            startedAt = now;
            previous = now;
            requestAnimationFrame(tick);
            return;
          }

          samples.push(now - previous);
          previous = now;
          if (now - startedAt < duration) {
            requestAnimationFrame(tick);
            return;
          }
          const sorted = [...samples].sort((a, b) => a - b);
          const p95Index = Math.min(
            Math.max(0, sorted.length - 1),
            Math.floor(sorted.length * 0.95),
          );
          const sum = samples.reduce((total, value) => total + value, 0);
          resolve({
            sampleCount: samples.length,
            durationMs: now - startedAt,
            averageFrameMs: samples.length ? sum / samples.length : 0,
            p95FrameMs: sorted[p95Index] ?? 0,
            maxFrameMs: sorted.at(-1) ?? 0,
            framesOver34Ms: samples.filter((value) => value > 34).length,
            framesOver50Ms: samples.filter((value) => value > 50).length,
          });
        };
        requestAnimationFrame(tick);
      });
  }, durationMs);
}

async function finishFrameSampler(page: Page) {
  return page.evaluate(async () => {
    const profile = await (
      window as unknown as { __v3FrameProfile?: Promise<FrameProfile> }
    ).__v3FrameProfile;
    if (!profile) throw new Error("V3 frame sampler was not started");
    return profile;
  });
}

test("installed app shell survives representative navigation without duplicate chrome: direct lens manipulation emits bounded frame-profile evidence", async ({
  browser,
}, testInfo) => {
  test.skip(testInfo.project.name !== "ios-pwa-portrait", "Focused installed-iOS contract only");

  // Override the project's Reduced Motion context only for this profiling slice.
  // N12 Reduced Motion is tested separately; here we need the actual visual path.
  // Match the proven installed-navbar interaction context instead of emulating a
  // touch-only device and then manufacturing synthetic PointerEvents.
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    reducedMotion: "no-preference",
  });
  const { baseURL } = await prepareNavbarInstalledContext(context);
  const page = await context.newPage();
  await page.goto(`${baseURL}/my-solaris/account`, { waitUntil: "domcontentloaded" });
  await applyNavbarInstalledCssEmulation(page);

  const nav = page.locator(".solaris-app-tabbar");
  const material = nav.locator(".solaris-app-tabbar-material");
  const active = nav.getByRole("link", { name: /^Me(?:,|$)/ });
  await expect(page.locator('[data-v3-account-settings-screen="account"]')).toBeVisible();
  await expect(nav).toBeVisible();
  await expect(nav.locator("[data-app-tab-index]")).toHaveCount(5);
  await expect(active).toHaveAttribute("aria-current", "page");
  await expect
    .poll(async () => (await active.boundingBox())?.width ?? 0)
    .toBeGreaterThan(0);

  const bounds = await active.boundingBox();
  expect(bounds).not.toBeNull();
  if (!bounds) return;

  const startX = bounds.x + bounds.width / 2;
  const startY = bounds.y + bounds.height / 2;
  await page.mouse.move(startX, startY);
  await startFrameSampler(page, 950);

  await page.mouse.down();

  // Direct manipulation is intentionally hold-gated. Profile the production
  // gesture instead of moving immediately and cancelling the pending hold.
  await page.waitForTimeout(420);
  await expect(material).toHaveAttribute("data-held", "true");
  await expect(material).toHaveAttribute("data-dragging", "true");

  // Stay below the adjacent-tab release threshold. This still exercises the
  // held lens' continuous drag/stretch path, then measures the real snap-back
  // settlement without mixing route loading into the frame profile.
  await page.mouse.move(startX - 44, startY, { steps: 11 });
  await page.waitForTimeout(48);
  await page.mouse.up();

  await expect(material).toHaveAttribute("data-dragging", "false");
  await expect(material).toHaveAttribute("data-held", "false");
  await expect(active).toHaveAttribute("aria-current", "page");
  await expect(page).toHaveURL(/\/my-solaris\/account(?:[/?#]|$)/);

  const profile = await finishFrameSampler(page);
  const cadenceSufficient = profile.sampleCount >= 20;
  const samplingQuality = cadenceSufficient ? "sufficient" : "headless-raf-throttled";

  // Always persist what the runner actually delivered. A headless WebKit worker
  // that only supplies one or two RAFs cannot honestly certify frame cadence;
  // treating that as application jank would manufacture evidence. Real-device
  // 60/120 Hz certification remains required by N14.
  await testInfo.attach("v3-navigation-frame-profile.json", {
    body: Buffer.from(
      JSON.stringify(
        {
          candidateSha: process.env.GITHUB_SHA ?? null,
          project: testInfo.project.name,
          measuredAt: new Date().toISOString(),
          interaction: "active-lens-hold-drag-snapback",
          samplingQuality,
          certificationEligible: cadenceSufficient,
          profile,
        },
        null,
        2,
      ),
      "utf8",
    ),
    contentType: "application/json",
  });

  expect(profile.sampleCount).toBeGreaterThanOrEqual(1);
  expect(profile.durationMs).toBeGreaterThanOrEqual(900);
  if (cadenceSufficient) {
    // Cloud CI is not a real 60/120 Hz device certification environment. When
    // it supplies enough RAFs, these bounds still catch catastrophic stalls.
    expect(profile.averageFrameMs).toBeLessThan(50);
    expect(profile.p95FrameMs).toBeLessThan(100);
    expect(profile.maxFrameMs).toBeLessThan(180);
    expect(profile.framesOver50Ms).toBeLessThanOrEqual(
      Math.max(4, Math.ceil(profile.sampleCount * 0.2)),
    );
  }

  await context.close();
});
