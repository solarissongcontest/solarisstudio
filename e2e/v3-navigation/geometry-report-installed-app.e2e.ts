import { expect, test, type BrowserContext, type Page } from "@playwright/test";

import { V3_NAVIGATION_GEOMETRY } from "../../src/lib/v3-navigation-geometry";
import type { V3NavigationReferenceGeometry } from "../../src/lib/v3-navigation-reference-baseline";

type E2ESession = {
  access_token: string;
  user: { id: string; email?: string | null };
  [key: string]: unknown;
};

function config() {
  const supabaseUrl = process.env.E2E_SUPABASE_URL;
  const publishableKey = process.env.E2E_SUPABASE_PUBLISHABLE_KEY;
  const email = process.env.E2E_COUNTRY_EMAIL;
  const password = process.env.E2E_COUNTRY_PASSWORD;
  const baseURL = process.env.E2E_BASE_URL ?? "http://127.0.0.1:4173";
  const missing = !supabaseUrl || !publishableKey || !email || !password;
  if (missing && process.env.CI) {
    throw new Error("V3 geometry evidence requires the isolated local Supabase fixture.");
  }
  test.skip(missing, "Local V3 geometry fixture is unavailable");
  const parsed = new URL(supabaseUrl!);
  if (!["127.0.0.1", "localhost"].includes(parsed.hostname)) {
    throw new Error(`Refusing V3 geometry evidence against hosted Supabase: ${parsed.origin}`);
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

async function measureExpanded(page: Page) {
  return page.evaluate(() => {
    const bar = document.querySelector<HTMLElement>("[data-v3-liquid-tabbar]");
    const material = bar?.querySelector<HTMLElement>(".v3-liquid-tabbar__material") ?? null;
    const lens = bar?.querySelector<HTMLElement>(".v3-liquid-tabbar__lens") ?? null;
    const items = bar
      ? Array.from(bar.querySelectorAll<HTMLElement>("[data-v3-tab-index]"))
      : [];
    const icons = bar
      ? Array.from(bar.querySelectorAll<SVGElement>(".v3-liquid-tabbar__icon"))
      : [];
    if (!bar || !material || !lens || items.length !== 5 || icons.length !== 5) return null;

    const barRect = bar.getBoundingClientRect();
    const materialRect = material.getBoundingClientRect();
    const lensRect = lens.getBoundingClientRect();
    const itemRects = items.map((item) => item.getBoundingClientRect());
    const iconRects = icons.map((icon) => icon.getBoundingClientRect());
    const materialStyle = getComputedStyle(material);
    const lensStyle = getComputedStyle(lens);

    return {
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      barBottom: barRect.bottom,
      shellWidth: materialRect.width,
      shellHeight: materialRect.height,
      horizontalInset: Math.min(materialRect.left, window.innerWidth - materialRect.right),
      shellRadius: Number.parseFloat(materialStyle.borderTopLeftRadius),
      slotWidth: itemRects.reduce((sum, rect) => sum + rect.width, 0) / itemRects.length,
      iconOpticalSize: iconRects.reduce((sum, rect) => sum + rect.width, 0) / iconRects.length,
      iconCenterX: itemRects.map((rect) => rect.left + rect.width / 2),
      lensWidth: lensRect.width,
      lensHeight: lensRect.height,
      lensRadius: Number.parseFloat(lensStyle.borderTopLeftRadius),
      lensCenterX: lensRect.left + lensRect.width / 2,
      overflow:
        Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - window.innerWidth,
    };
  });
}

async function measureCompact(page: Page) {
  await page.evaluate(() => {
    const spacer = document.createElement("div");
    spacer.dataset.v3GeometryScrollFixture = "";
    spacer.style.height = "1600px";
    spacer.style.pointerEvents = "none";
    document.body.append(spacer);
    window.scrollTo(0, 420);
  });
  await expect(page.locator("[data-v3-liquid-tabbar]")).toHaveAttribute("data-collapsed", "true");
  return page.evaluate(() => {
    const material = document.querySelector<HTMLElement>(".v3-liquid-tabbar__material");
    if (!material) return null;
    const rect = material.getBoundingClientRect();
    return { width: rect.width, height: rect.height };
  });
}

test("installed app shell survives representative navigation without duplicate chrome: emits exact-candidate geometry tokens for N14 comparison", async ({
  browser,
}, testInfo) => {
  test.skip(testInfo.project.name !== "ios-pwa-portrait", "Focused installed-iOS contract only");

  const session = await signIn();
  const { baseURL } = config();
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    reducedMotion: "reduce",
  });
  await installSession(context, session);
  const page = await context.newPage();
  await page.goto(`${baseURL}/my-solaris/account`, { waitUntil: "domcontentloaded" });
  await expect(page.locator("[data-v3-liquid-tabbar]")).toBeVisible();

  const expanded = await measureExpanded(page);
  expect(expanded).not.toBeNull();
  if (!expanded) return;
  const compact = await measureCompact(page);
  expect(compact).not.toBeNull();
  if (!compact) return;

  const actual: V3NavigationReferenceGeometry = {
    shellWidth: expanded.shellWidth,
    shellMaxWidth: V3_NAVIGATION_GEOMETRY.shellMaxWidth,
    shellHeightExpanded: expanded.shellHeight,
    shellHeightCompact: compact.height,
    horizontalInset: expanded.horizontalInset,
    bottomInset: expanded.viewportHeight - expanded.barBottom,
    shellRadius: expanded.shellRadius,
    slotWidth: expanded.slotWidth,
    iconOpticalSize: expanded.iconOpticalSize,
    iconCenterX: expanded.iconCenterX,
    lensWidth: expanded.lensWidth,
    lensHeight: expanded.lensHeight,
    lensRadius: expanded.lensRadius,
    lensCenterX: expanded.lensCenterX,
    lensOvershootMax: V3_NAVIGATION_GEOMETRY.lensOvershootMax,
    compactWidth: compact.width,
    compactHeight: compact.height,
    shadowSpreadBudget: V3_NAVIGATION_GEOMETRY.shadowSpreadBudget,
    viewportWidth: expanded.viewportWidth,
  };

  for (const [key, value] of Object.entries(actual)) {
    if (Array.isArray(value)) {
      expect(value).toHaveLength(5);
      value.forEach((entry) => expect(Number.isFinite(entry)).toBe(true));
    } else {
      expect(Number.isFinite(value), `${key} must be a finite measured token`).toBe(true);
    }
  }
  expect(expanded.overflow).toBeLessThanOrEqual(2);
  expect(actual.shellHeightCompact).toBeLessThan(actual.shellHeightExpanded);
  expect(actual.compactWidth).toBeLessThanOrEqual(actual.shellWidth + 1);

  await testInfo.attach("v3-navigation-geometry.json", {
    body: Buffer.from(
      JSON.stringify(
        {
          candidateSha: process.env.GITHUB_SHA ?? null,
          project: testInfo.project.name,
          measuredAt: new Date().toISOString(),
          referenceStatus: "awaiting-approved-instagram-baseline",
          geometry: actual,
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
