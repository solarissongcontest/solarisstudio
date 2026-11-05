import { expect, test, type Page, type TestInfo } from "@playwright/test";

import { auditPage, sitemapRoutes, STATIC_PUBLIC_ROUTES } from "./audit-helpers";

const fullAudit = process.env.E2E_FULL_AUDIT === "1";

const PR_SMOKE_PUBLIC_ROUTES = [
  "/",
  "/auth",
  "/confirmations",
  "/countries",
  "/editions",
  "/integrity",
  "/jury-voting",
  "/participate",
  "/pulse",
  "/result-lab",
  "/rules",
  "/encyclopedia",
  "/site-directory",
  "/stories",
  "/tools",
  "/televoting",
  "/wiki",
] as const;

const publicRouteAuditSet = fullAudit ? [...STATIC_PUBLIC_ROUTES].sort() : [...PR_SMOKE_PUBLIC_ROUTES];

async function auditRoutes(page: Page, routes: string[], testInfo: TestInfo) {
  const failures: string[] = [];
  const context = page.context();

  for (const route of routes) {
    const routePage = await context.newPage();
    try {
      if (/^\/wiki\/[^/]+$/.test(route)) {
        await routePage.goto(route, { waitUntil: "domcontentloaded" });
        await expect(
          routePage.locator(".wiki-loading"),
          `${route} must finish its transient Wiki loading state before the accessibility audit`,
        ).toHaveCount(0, { timeout: 15_000 });
      }
      await test.step(route, () => auditPage(routePage, route, testInfo));
    } catch (error) {
      failures.push(`${route}: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      await routePage.close();
    }
  }

  expect(failures, "Every public route should pass the viewport audit").toEqual([]);
}

for (const route of publicRouteAuditSet) {
  test(`public route ${route} passes at this viewport`, async ({ page }, testInfo) => {
    await test.step(route, () => auditPage(page, route, testInfo));
  });
}

test("real Country and Wiki pages pass collision and flag audits at this viewport", async ({ page, baseURL }, testInfo) => {
  const discovered = await sitemapRoutes(baseURL!);
  const country = discovered.find((route) => /^\/countries\/[^/]+$/.test(route));
  const wiki = discovered.find((route) => /^\/wiki\/[^/]+$/.test(route));
  const routes = [country, wiki].filter((route): route is string => Boolean(route));
  expect(routes.length, "Sitemap should expose representative Country and Wiki routes").toBeGreaterThanOrEqual(2);
  await auditRoutes(page, routes, testInfo);
});

test("representative non-country dynamic route passes desktop audit", async ({ page, baseURL }, testInfo) => {
  test.skip(testInfo.project.name !== "public-1440", "Additional dynamic route smoke runs once at desktop baseline");

  const discovered = await sitemapRoutes(baseURL!);
  const representativeDynamic = [
    discovered.find((route) => /^\/editions\/[^/]+$/.test(route)),
  ].filter((route): route is string => Boolean(route));

  await auditRoutes(page, representativeDynamic, testInfo);
});

test("Country directory renders the correct mobile-web and desktop browse composition", async ({ page }, testInfo) => {
  test.skip(!["public-320", "public-390", "public-768", "public-1440"].includes(testInfo.project.name));
  await page.goto("/countries", { waitUntil: "domcontentloaded" });
  const directory = page.locator("[data-country-directory-experience]");
  const mobile = ["public-320", "public-390"].includes(testInfo.project.name);
  await expect(directory).toHaveAttribute(
    "data-country-directory-experience", mobile ? "mobile-web" : "desktop-web",
  );
  await expect(page.getByRole("heading", { name: "Countries", exact: true })).toHaveCount(1);
  if (mobile) {
    await expect(page.locator("[data-country-directory-web-header]")).toBeVisible();
    await expect(directory.locator(".v3-countries-web-list")).toBeVisible();
    await expect(directory.locator(".v3-countries-region-rail")).toHaveCount(0);
    await expect(directory.getByRole("combobox", { name: "Filter by region" })).toBeVisible();
  } else {
    await expect(directory.locator(".v3-countries-region-rail")).toBeVisible();
    await expect(directory.locator(".v3-countries-desktop-grid")).toBeVisible();
    await expect(page.locator("[data-country-directory-web-header]")).toHaveCount(0);
  }
  await expect(directory.getByRole("searchbox", { name: "Search countries" })).toBeVisible();
  await expect(directory.locator('a[href^="/countries/"]').first()).toBeVisible();
  const ratio = await directory.locator('[data-flag-frame="standard"]').first().evaluate((frame) => {
    const bounds = frame.getBoundingClientRect();
    return bounds.width / bounds.height;
  });
  expect(ratio, "Country flags should remain 3:2 in every website directory").toBeCloseTo(1.5, 1);
  if (["public-390", "public-1440"].includes(testInfo.project.name)) {
    await testInfo.attach(`country-directory-${testInfo.project.name}.png`, {
      body: await page.screenshot({ fullPage: true }),
      contentType: "image/png",
    });
  }
  const search = directory.getByRole("searchbox", { name: "Search countries" });
  await search.fill("zz-no-such-solaris-country");
  await expect(directory.getByText("No countries found")).toBeVisible();
  await search.fill("");
  const overflow = await page.evaluate(() =>
    Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - window.innerWidth,
  );
  expect(overflow, "Country directory must not overflow the browser viewport").toBeLessThanOrEqual(2);
  if (!mobile) {
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(directory).toHaveAttribute("data-country-directory-experience", "mobile-web");
    await expect(directory.locator(".v3-countries-web-list")).toBeVisible();
    await page.setViewportSize({ width: 1440, height: 900 });
    await expect(directory).toHaveAttribute("data-country-directory-experience", "desktop-web");
  }
  // The directory is a navigation surface, not just a visually correct catalogue.
  await directory.locator('a[href^="/countries/"]').first().click();
  await expect(page).toHaveURL(/\/countries\/[^/]+\/?$/);
});

test("Public directory family distinguishes mobile website from desktop explorer", async ({ page }, testInfo) => {
  test.skip(!["public-390", "public-1440"].includes(testInfo.project.name));
  const mobile = testInfo.project.name === "public-390";
  for (const route of ["/site-directory", "/tools"]) {
    await page.goto(route, { waitUntil: "domcontentloaded" });
    const directory = page.locator("[data-directory-experience]");
    await expect(directory).toHaveAttribute(
      "data-directory-experience", mobile ? "mobile-web" : "desktop-web",
    );
    await expect(page.locator("[data-directory-boot]")).toHaveCount(0);
    const title = route === "/tools" ? "Tools" : "All Solaris pages";
    await expect(page.getByRole("heading", { level: 1, name: title })).toHaveCount(1);
    if (mobile) {
      await expect(page.locator("[data-directory-mobile-header]")).toBeVisible();
      await expect(directory.locator(".v3-directory-mobile-list").first()).toBeVisible();
      await expect(directory.locator(".v3-directory-desktop-rail")).toHaveCount(0);
      await expect(directory.getByRole("combobox")).toBeVisible();
    } else {
      await expect(page.locator("[data-directory-mobile-header]")).toHaveCount(0);
      await expect(directory.locator(".v3-directory-desktop-rail")).toBeVisible();
      await expect(directory.locator(".v3-directory-desktop-grid").first()).toBeVisible();
    }

    const search = directory.getByRole("searchbox", {
      name: route === "/tools" ? "Search Solaris tools" : "Search Solaris Studio pages",
    });
    await expect(search).toBeVisible();
    await search.fill("unfindable-solaris-navigation-item");
    await expect(directory.getByText(route === "/tools" ? "No matching tools" : "No matching pages")).toBeVisible();
    await search.fill("");
    await expect(directory.locator("a[href^='/']").first()).toBeVisible();

    const overflow = await page.evaluate(() =>
      Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - window.innerWidth,
    );
    expect(overflow, `${route} must not overflow at ${testInfo.project.name}`).toBeLessThanOrEqual(2);
    await testInfo.attach(`directory-family-${route.slice(1)}-${testInfo.project.name}.png`, {
      body: await page.screenshot({ fullPage: true }),
      contentType: "image/png",
    });
  }
});

test("Editions archive keeps distinct mobile-browser and desktop browse layouts", async ({ page }, testInfo) => {
  test.skip(!["public-390", "public-1440"].includes(testInfo.project.name));
  const mobile = testInfo.project.name === "public-390";
  await page.goto("/editions", { waitUntil: "domcontentloaded" });
  const directory = page.locator("[data-directory-experience]");
  await expect(directory).toHaveAttribute(
    "data-directory-experience", mobile ? "mobile-web" : "desktop-web",
    { timeout: 15_000 },
  );
  await expect(page.getByRole("heading", { level: 1, name: "Editions" })).toHaveCount(1);
  if (mobile) {
    await expect(page.locator("[data-directory-mobile-header]")).toBeVisible();
    await expect(directory.getByRole("combobox", { name: "Browse edition history" })).toBeVisible();
    await expect(directory.locator(".v3-directory-desktop-rail")).toHaveCount(0);
  } else {
    await expect(page.locator("[data-directory-mobile-header]")).toHaveCount(0);
    await expect(directory.locator(".v3-directory-desktop-rail")).toBeVisible();
  }
  const search = directory.getByRole("searchbox", { name: "Search editions" });
  await expect(search).toBeVisible();
  await search.fill("zz-no-such-solaris-edition");
  await expect(directory.getByText("No matching editions")).toBeVisible();
  await search.fill("");
  const overflow = await page.evaluate(() =>
    Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - window.innerWidth,
  );
  expect(overflow, "Editions should not overflow").toBeLessThanOrEqual(2);
  await testInfo.attach(`directory-family-editions-${testInfo.project.name}.png`, {
    body: await page.screenshot({ fullPage: true }),
    contentType: "image/png",
  });
});

test("Stories and Reference preserve editorial mobile-web and desktop discovery", async ({ page }, testInfo) => {
  test.skip(!["public-390", "public-1440"].includes(testInfo.project.name));
  const mobile = testInfo.project.name === "public-390";

  await page.goto("/stories", { waitUntil: "domcontentloaded" });
  const stories = page.locator(".v3-stories-directory");
  await expect(stories).toHaveAttribute("data-directory-experience", mobile ? "mobile-web" : "desktop-web");
  await expect(stories.getByRole("searchbox", { name: "Search published stories" })).toBeVisible();
  if (mobile) {
    await expect(stories.locator("[data-directory-mobile-header]")).toBeVisible();
    await expect(page.getByRole("heading", { level: 1, name: "Stories" })).toBeVisible();
  } else {
    await expect(stories.locator("[data-directory-mobile-header]")).toHaveCount(0);
    await expect(page.getByRole("heading", { level: 1, name: /Stories that survived/ })).toBeVisible();
  }

  await page.goto("/encyclopedia", { waitUntil: "domcontentloaded" });
  const reference = page.locator(".v3-reference-directory");
  const disabled = page.getByText("Reference is not enabled yet");
  await expect.poll(async () => (await reference.count()) > 0 || (await disabled.count()) > 0).toBe(true);
  if (await reference.count()) {
    await expect(reference).toHaveAttribute("data-directory-experience", mobile ? "mobile-web" : "desktop-web");
    await expect(reference.getByRole("searchbox", { name: "Search Reference" })).toBeVisible();
    if (mobile) {
      await expect(reference.locator("[data-directory-mobile-header]")).toBeVisible();
      await expect(reference.getByRole("combobox", { name: "Filter Reference" })).toBeVisible();
    } else {
      await expect(reference.locator("[data-directory-mobile-header]")).toHaveCount(0);
      await expect(reference.locator(".v3-directory-desktop-rail")).toBeVisible();
    }
  } else {
    // A rollout-off state is legitimate but is not proof the enabled layout passed.
    await expect(disabled).toBeVisible();
  }
  const overflow = await page.evaluate(() =>
    Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - window.innerWidth,
  );
  expect(overflow, "Reference must not overflow its browser viewport").toBeLessThanOrEqual(2);
  await testInfo.attach(`directory-family-reference-${testInfo.project.name}.png`, {
    body: await page.screenshot({ fullPage: true }), contentType: "image/png",
  });
});

test("Country Glass atmosphere and Edition mobile toolbar keep their visible bounds", async ({ page }, testInfo) => {
  test.skip(!["public-320", "public-390", "public-768", "public-1440"].includes(testInfo.project.name));
  test.skip(process.env.E2E_REAL_DATA !== "1", "Abeven Glass and SSC20 require the real archive, which the seeded audit runner does not contain.");

  await page.goto("/countries/ABE", { waitUntil: "domcontentloaded" });
  const atmosphere = page.locator(".country-v2-liquid-glass-scene-flag");
  await expect(atmosphere).toBeVisible();
  const coverage = await atmosphere.evaluate((image) => {
    const hero = image.closest(".country-v2-hero")!.getBoundingClientRect();
    const flag = image.getBoundingClientRect();
    return { left: flag.left - hero.left, right: flag.right - hero.right, top: flag.top - hero.top, bottom: flag.bottom - hero.bottom, fit: getComputedStyle(image).objectFit };
  });
  expect(coverage.left).toBeLessThan(-20);
  expect(coverage.right).toBeGreaterThan(20);
  expect(coverage.top).toBeLessThan(-20);
  expect(coverage.bottom).toBeGreaterThan(20);
  expect(coverage.fit).toBe("cover");
  await testInfo.attach("abeven-glass.png", { body: await page.locator(".country-v2-hero").screenshot(), contentType: "image/png" });

  await page.goto("/wiki/ABE", { waitUntil: "domcontentloaded" });
  await expect(page.locator(".country-v2-liquid-glass-scene-flag")).toBeVisible();
  await expect(page.getByRole("navigation", { name: "breadcrumb" })).toHaveCount(1);
  await testInfo.attach("abeven-wiki-glass.png", { body: await page.locator(".country-v2-hero").screenshot(), contentType: "image/png" });

  await page.goto("/editions/ssc-20", { waitUntil: "domcontentloaded" });
  const edition = page.locator(".edition-public-page");
  await expect(edition.locator("h1")).toHaveText("SSC 20");
  await expect(edition.locator(".edition-hero-subtitle")).toHaveCount(0);
  await expect(edition.locator(".public-current-status")).toHaveCount(0);
  if (["public-320", "public-390"].includes(testInfo.project.name)) {
    const nav = edition.locator(".edition-navigation-mobile");
    await expect(nav).toBeVisible();
    const dimensions = await nav.evaluate((element) => {
      const parent = element.getBoundingClientRect();
      const controls = [...element.children].map((child) => child.getBoundingClientRect());
      return { clipped: controls.some((rect) => rect.left < parent.left - 1 || rect.right > parent.right + 1), overflow: document.documentElement.scrollWidth - window.innerWidth };
    });
    expect(dimensions.clipped).toBe(false);
    expect(dimensions.overflow).toBeLessThanOrEqual(1);
  }
  await testInfo.attach("ssc20-hero.png", { body: await page.locator(".edition-hero").screenshot(), contentType: "image/png" });
});

test("wide square and tall flag fixtures fill consistent 3:2 frames without distortion", async ({ page }, testInfo) => {
  test.skip(!["public-320", "public-390", "public-768", "public-1440"].includes(testInfo.project.name));
  await page.goto("/dev/flag-media", { waitUntil: "domcontentloaded" });
  await expect(page.locator('[data-flag-frame="standard"]')).toHaveCount(3);
  for (const frame of await page.locator('[data-flag-frame="standard"]').all()) {
    const geometry = await frame.evaluate((node) => ({ ratio: node.getBoundingClientRect().width / node.getBoundingClientRect().height, fit: getComputedStyle(node.querySelector("img")!).objectFit }));
    expect(geometry.ratio).toBeCloseTo(1.5, 2);
    expect(geometry.fit).toBe("cover");
  }
  if (testInfo.project.name === "public-390") await testInfo.attach("wide-square-tall-flags-390.png", { body: await page.screenshot(), contentType: "image/png" });
});

test("real country directory flags share their canonical crop", async ({ page }, testInfo) => {
  test.skip(!["public-320", "public-390", "public-768", "public-1440"].includes(testInfo.project.name));
  test.skip(process.env.E2E_REAL_DATA !== "1", "The six real country records are absent from the seeded audit archive.");
  await page.goto("/countries", { waitUntil: "domcontentloaded" });
  // The current database spells these two names Ampsia and Aquliateria.
  // The wide/square/tall fixture additionally covers unusual source ratios.
  const names = ["Abeven", "Adelanor", "Alberia", "Ampsia", "Aotea", "Aquliateria"];
  const directory = page.locator("[data-country-directory-experience]");
  const search = directory.getByRole("searchbox", { name: "Search countries" });
  await expect(directory.locator('a[href^="/countries/"]').first()).toBeVisible();
  for (const name of names) {
    await search.fill(name);
    const card = directory.locator('a[href^="/countries/"]').filter({ hasText: name }).first();
    await expect(card, `${name} directory card`).toBeVisible();
    const frame = card.locator('[data-flag-frame="standard"]');
    await expect(frame).toBeVisible();
    const result = await frame.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      const image = element.querySelector("img");
      const imageRect = image?.getBoundingClientRect();
      return { ratio: rect.width / rect.height, fit: image ? getComputedStyle(image).objectFit : null, transform: image ? getComputedStyle(image).transform : null, covered: imageRect ? imageRect.left <= rect.left + 1 && imageRect.right >= rect.right - 1 && imageRect.top <= rect.top + 1 && imageRect.bottom >= rect.bottom - 1 : false };
    });
    expect(result.ratio, `${name} frame ratio`).toBeCloseTo(1.5, 2);
    expect(result.fit, `${name} must fill its frame`).toBe("cover");
    expect(result.covered, `${name} must reach every frame edge`).toBe(true);
    expect(result.transform, `${name} must have no independent axis scaling`).not.toMatch(/matrix\([^,]+,\s*[^,]+,\s*[^,]+,/);
  }
  await search.fill("");
  if (testInfo.project.name === "public-390") {
    await testInfo.attach("country-directory-six-flags-390.png", { body: await page.screenshot({ fullPage: true }), contentType: "image/png" });
  }
});

for (let shard = 0; shard < 4; shard += 1) {
  test(`all indexable routes pass desktop audit — shard ${shard + 1}`, async ({ page, baseURL }, testInfo) => {
    test.skip(!fullAudit, "Full sitemap inventory is reserved for manual/full audit runs");
    test.skip(testInfo.project.name !== "public-1440", "Full inventory runs at desktop baseline");
    const discovered = (await sitemapRoutes(baseURL!)).sort();
    await auditRoutes(
      page,
      discovered.filter((_, index) => index % 4 === shard),
      testInfo,
    );
  });
}

test("representative page families remain usable at 200% text size", async ({ page }, testInfo) => {
  test.skip(
    !["public-390", "public-1440"].includes(testInfo.project.name),
    "Text zoom runs once on a mobile and desktop baseline",
  );

  const context = page.context();
  for (const route of ["/countries", "/site-directory", "/tools", "/editions", "/stories", "/encyclopedia", "/pulse", "/prediction-league", "/result-lab", "/rules", "/integrity"]) {
    const routePage = await context.newPage();
    try {
      await routePage.goto(route, { waitUntil: "domcontentloaded" });
      // Country discovery deliberately waits for runtime app/website identity
      // before mounting its heading. A DOMContentLoaded-only check can inspect
      // that short-lived boot state instead of the actual country directory.
      // Wait for the real page first; do not hide a missing heading after zoom.
      if (route === "/countries") {
        await expect(
          routePage.locator("[data-country-directory-boot]"),
          "Countries runtime boot must finish before accessibility verification",
        ).toHaveCount(0, { timeout: 15_000 });
      }
      if (route === "/site-directory" || route === "/tools" || route === "/editions") {
        await expect(
          routePage.locator("[data-directory-boot]"),
          `${route} runtime boot must finish before accessibility verification`,
        ).toHaveCount(0, { timeout: 15_000 });
      }
      await expect(
        routePage.locator("h1:visible"),
        `${route} must expose one visible heading before text enlargement`,
      ).toHaveCount(1, { timeout: 15_000 });
      await routePage.evaluate(() => {
        document.documentElement.style.fontSize = "200%";
      });
      await expect(
        routePage.locator("h1:visible"),
        `${route} must retain one visible heading after text enlargement`,
      ).toHaveCount(1);
      await routePage.waitForTimeout(100);

      const geometry = await routePage.evaluate(() => ({
        overflow: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - window.innerWidth,
        h1Visible: [...document.querySelectorAll<HTMLElement>("h1")].filter((node) => {
          const rect = node.getBoundingClientRect();
          const style = getComputedStyle(node);
          return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden";
        }).length,
      }));

      expect(geometry.overflow, `${route} should not horizontally overflow at 200% text`).toBeLessThanOrEqual(2);
      expect(geometry.h1Visible, `${route} should retain one visible page heading at 200% text`).toBe(1);
    } finally {
      await routePage.close();
    }
  }
});

test("captures the final visual archetypes for review", async ({ page }, testInfo) => {
  test.skip(
    !["public-390", "public-1440"].includes(testInfo.project.name),
    "Archetype captures run on one mobile and one desktop baseline",
  );

  const archetypes = [
    ["directory", "/editions"],
    ["data", "/result-lab"],
    ["operational", "/confirmations"],
    ["governance", "/rules"],
    ["feed", "/pulse"],
  ] as const;

  const context = page.context();
  for (const [name, route] of archetypes) {
    const routePage = await context.newPage();
    try {
      await routePage.goto(route, { waitUntil: "domcontentloaded" });
      await expect(routePage.locator("main").first()).toBeVisible();
      await testInfo.attach(
        `final-${name}-${testInfo.project.name}.png`,
        { body: await routePage.screenshot({ fullPage: true }), contentType: "image/png" },
      );
    } finally {
      await routePage.close();
    }
  }
});
