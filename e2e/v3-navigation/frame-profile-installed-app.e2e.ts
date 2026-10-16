import { expect, test, type BrowserContext, type Page } from "@playwright/test";

type E2ESession = {
  access_token: string;
  user: { id: string; email?: string | null };
  [key: string]: unknown;
};

type FrameProfile = {
  sampleCount: number;
  durationMs: number;
  averageFrameMs: number;
  p95FrameMs: number;
  maxFrameMs: number;
  framesOver34Ms: number;
  framesOver50Ms: number;
};

function config() {
  const supabaseUrl = process.env.E2E_SUPABASE_URL;
  const publishableKey = process.env.E2E_SUPABASE_PUBLISHABLE_KEY;
  const email = process.env.E2E_COUNTRY_EMAIL;
  const password = process.env.E2E_COUNTRY_PASSWORD;
  const baseURL = process.env.E2E_BASE_URL ?? "http://127.0.0.1:4173";
  const missing = !supabaseUrl || !publishableKey || !email || !password;
  if (missing && process.env.CI) {
    throw new Error("V3 frame profiling requires the isolated local Supabase fixture.");
  }
  test.skip(missing, "Local V3 frame-profile fixture is unavailable");
  const parsed = new URL(supabaseUrl!);
  if (!["127.0.0.1", "localhost"].includes(parsed.hostname)) {
    throw new Error(`Refusing V3 frame profiling against hosted Supabase: ${parsed.origin}`);
  }
  return {
    supabaseUrl: supabaseUrl!,
    publishableKey: publishableKey!,
    email: email!,
    password: password!,
    baseURL,
  };
}

async function signIn(): Promise<E2ESession> {
  const { supabaseUrl, publishableKey, email, password } = config();
  const response = await fetch(
    `${supabaseUrl.replace(/\/$/, "")}/auth/v1/token?grant_type=password`,
    {
      method: "POST",
      headers: { apikey: publishableKey, "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    },
  );
  expect(response.ok).toBeTruthy();
  return (await response.json()) as E2ESession;
}

async function installSession(context: BrowserContext, session: E2ESession) {
  const { supabaseUrl, baseURL } = config();
  const projectRef = new URL(supabaseUrl).hostname.split(".")[0];
  await context.addCookies([
    {
      name: "solaris_e2e_maintenance_bypass",
      value: "1",
      url: baseURL,
      httpOnly: true,
      secure: false,
      sameSite: "Lax",
    },
  ]);
  await context.addInitScript(
    ({ key, value }) => {
      localStorage.setItem(key, JSON.stringify(value));
      localStorage.setItem("solaris:app-first-run-complete:v1", "1");
      Object.defineProperty(navigator, "standalone", { configurable: true, value: true });
      const original = window.matchMedia.bind(window);
      window.matchMedia = ((query: string) => {
        if (query === "(display-mode: standalone)") {
          return {
            matches: true,
            media: query,
            onchange: null,
            addListener: () => undefined,
            removeListener: () => undefined,
            addEventListener: () => undefined,
            removeEventListener: () => undefined,
            dispatchEvent: () => false,
          } as MediaQueryList;
        }
        return original(query);
      }) as typeof window.matchMedia;
    },
    { key: `sb-${projectRef}-auth-token`, value: session },
  );
}

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

  const session = await signIn();
  const { baseURL } = config();
  // Override the project's Reduced Motion context only for this profiling slice.
  // N12 Reduced Motion is tested separately; here we need the actual visual path.
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    reducedMotion: "no-preference",
    hasTouch: true,
    isMobile: true,
  });
  await installSession(context, session);
  const page = await context.newPage();
  await page.goto(`${baseURL}/my-solaris/account`, { waitUntil: "domcontentloaded" });
  const nav = page.locator("[data-v3-liquid-tabbar]");
  await expect(nav).toBeVisible();
  const active = nav.locator('[data-v3-tab-index][aria-current="page"]');
  const bounds = await active.boundingBox();
  expect(bounds).not.toBeNull();
  if (!bounds) return;

  const startX = bounds.x + bounds.width / 2;
  const startY = bounds.y + bounds.height / 2;
  await startFrameSampler(page, 950);

  await active.dispatchEvent("pointerdown", {
    pointerId: 77,
    pointerType: "touch",
    button: 0,
    clientX: startX,
    clientY: startY,
  });
  for (let step = 1; step <= 14; step += 1) {
    await active.dispatchEvent("pointermove", {
      pointerId: 77,
      pointerType: "touch",
      button: 0,
      clientX: startX - step * 4,
      clientY: startY,
    });
    await page.waitForTimeout(16);
  }
  await active.dispatchEvent("pointercancel", {
    pointerId: 77,
    pointerType: "touch",
    button: 0,
    clientX: startX - 56,
    clientY: startY,
  });
  await expect(page.locator(".v3-liquid-tabbar__material")).toHaveAttribute(
    "data-dragging",
    "false",
  );

  const profile = await finishFrameSampler(page);
  expect(profile.sampleCount).toBeGreaterThanOrEqual(20);
  // Cloud CI is not a 60/120 Hz device certification environment. These limits
  // catch catastrophic main-thread stalls while the attached metrics remain the
  // evidence used for trend review and real-device comparison.
  expect(profile.averageFrameMs).toBeLessThan(50);
  expect(profile.p95FrameMs).toBeLessThan(100);
  expect(profile.maxFrameMs).toBeLessThan(180);
  expect(profile.framesOver50Ms).toBeLessThanOrEqual(
    Math.max(4, Math.ceil(profile.sampleCount * 0.2)),
  );

  await testInfo.attach("v3-navigation-frame-profile.json", {
    body: Buffer.from(
      JSON.stringify(
        {
          candidateSha: process.env.GITHUB_SHA ?? null,
          project: testInfo.project.name,
          measuredAt: new Date().toISOString(),
          interaction: "active-lens-drag-cancel",
          profile,
        },
        null,
        2,
      ),
      "utf8",
    ),
    contentType: "application/json",
  });

  await context.close();
});
