import { expect, test } from "@playwright/test";

const VIEWPORTS = [
  { width: 375, height: 844 },
  { width: 390, height: 844 },
  { width: 393, height: 844 },
  { width: 430, height: 844 },
] as const;

test(
  "installed app shell survives representative navigation without duplicate chrome: records explicit required navbar and page-width geometry",
  async ({ browser }, testInfo) => {
    test.skip(
      testInfo.project.name !== "ios-pwa-portrait",
      "One isolated WebKit installed-app context records the canonical mobile viewport matrix.",
    );

    const baseURL = process.env.E2E_BASE_URL ?? "http://127.0.0.1:4173";
    const parsed = new URL(baseURL);
    if (!["127.0.0.1", "localhost"].includes(parsed.hostname)) {
      throw new Error(`Refusing navbar geometry evidence against non-local app origin: ${parsed.origin}`);
    }

    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
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
    await context.addInitScript(() => {
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
    });

    const page = await context.newPage();
    await page.goto(`${baseURL}/`, { waitUntil: "domcontentloaded" });
    await expect(page.locator("[data-v3-liquid-tabbar]")).toBeVisible();

    const evidence = [];
    for (const viewport of VIEWPORTS) {
      await page.setViewportSize(viewport);
      await page.evaluate(() => window.scrollTo(0, 0));
      await expect(page.locator("[data-v3-liquid-tabbar]")).toHaveAttribute(
        "data-collapsed",
        "false",
      );

      const measured = await page.evaluate(() => {
        const rect = (element: HTMLElement) => {
          const bounds = element.getBoundingClientRect();
          return {
            left: bounds.left,
            right: bounds.right,
            top: bounds.top,
            bottom: bounds.bottom,
            width: bounds.width,
            height: bounds.height,
            centerX: bounds.left + bounds.width / 2,
          };
        };
        const nav = document.querySelector<HTMLElement>("[data-v3-liquid-tabbar]");
        const material = nav?.querySelector<HTMLElement>(".v3-liquid-tabbar__material") ?? null;
        const lens = nav?.querySelector<HTMLElement>(".v3-liquid-tabbar__lens") ?? null;
        const active = nav?.querySelector<HTMLElement>('[data-v3-tab-index][aria-current="page"]') ?? null;
        const items = nav
          ? Array.from(nav.querySelectorAll<HTMLElement>("[data-v3-tab-index]"))
          : [];
        if (!nav || !material || !lens || !active || items.length !== 5) return null;
        const navRect = rect(nav);
        return {
          viewportWidth: window.innerWidth,
          viewportHeight: window.innerHeight,
          documentScrollWidth: document.documentElement.scrollWidth,
          documentClientWidth: document.documentElement.clientWidth,
          bodyScrollWidth: document.body.scrollWidth,
          navbar: navRect,
          material: rect(material),
          lens: rect(lens),
          selectedItem: rect(active),
          touchTargets: items.map(rect),
          bottomOffset: window.innerHeight - navRect.bottom,
        };
      });

      expect(measured, `${viewport.width}x${viewport.height} geometry must render`).not.toBeNull();
      if (!measured) continue;
      expect(measured.documentScrollWidth).toBeLessThanOrEqual(measured.documentClientWidth + 2);
      expect(measured.bodyScrollWidth).toBeLessThanOrEqual(measured.documentClientWidth + 2);
      expect(Math.abs(measured.lens.centerX - measured.selectedItem.centerX)).toBeLessThanOrEqual(3);
      measured.touchTargets.forEach((target) => {
        expect(target.width).toBeGreaterThanOrEqual(44);
        expect(target.height).toBeGreaterThanOrEqual(44);
      });
      evidence.push(measured);
    }

    expect(evidence).toHaveLength(VIEWPORTS.length);
    await testInfo.attach("navbar-required-geometry.json", {
      body: Buffer.from(
        `${JSON.stringify(
          {
            candidateSha: process.env.GITHUB_SHA ?? null,
            project: testInfo.project.name,
            measurements: evidence,
          },
          null,
          2,
        )}\n`,
      ),
      contentType: "application/json",
    });

    await context.close();
  },
);