import { expect, test, type Page } from "@playwright/test";

const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);

async function mobileHeroContract(page: Page) {
  return page.evaluate(() => {
    const visible = (selector: string) => {
      const element = document.querySelector<HTMLElement>(selector);
      if (!element) return false;
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== "none"
        && style.visibility !== "hidden"
        && Number(style.opacity) !== 0
        && rect.width > 0
        && rect.height > 0;
    };

    return {
      mainVisible: visible(".hero-device-main"),
      leftVisible: visible(".hero-device-left"),
      rightVisible: visible(".hero-device-right"),
      overflows: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) > window.innerWidth + 1,
    };
  });
}

test("phone hero contract is sensitive to accidentally restoring the side devices", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const response = await page.goto("/", { waitUntil: "domcontentloaded" });
  expect(response?.status()).toBe(503);

  const expected = {
    mainVisible: true,
    leftVisible: false,
    rightVisible: false,
    overflows: false,
  };
  expect(await mobileHeroContract(page)).toEqual(expected);

  await page.addStyleTag({
    content: ".hero-device-left,.hero-device-right{display:block!important;visibility:visible!important;opacity:1!important}",
  });

  expect(await mobileHeroContract(page)).not.toEqual(expected);
});

test("maintenance artwork makes no remote image requests", async ({ page }) => {
  const remoteImages: string[] = [];
  page.on("request", (request) => {
    if (request.resourceType() !== "image") return;
    const url = new URL(request.url());
    if (!["http:", "https:"].includes(url.protocol)) return;
    if (!LOCAL_HOSTS.has(url.hostname)) remoteImages.push(request.url());
  });

  const response = await page.goto("/", { waitUntil: "domcontentloaded" });
  expect(response?.status()).toBe(503);

  const photos = page.locator('[data-photo-kind="photo"]');
  await expect(photos).toHaveCount(3);
  for (let index = 0; index < 3; index += 1) {
    const photo = photos.nth(index);
    await photo.scrollIntoViewIfNeeded();
    await expect.poll(() => photo.evaluate((image) =>
      image instanceof HTMLImageElement && image.complete ? image.naturalWidth : 0,
    )).toBeGreaterThan(0);
  }

  expect(remoteImages).toEqual([]);
});

test("versioned local maintenance runtime moves the server-injected HOD portal into Confirmation", async ({ page }) => {
  await page.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.resourceType() !== "document" || url.pathname !== "/") {
      await route.fallback();
      return;
    }

    const response = await route.fetch();
    const html = await response.text();
    const injected = html.replace(
      "<footer>",
      '<section class="hod-portal" data-test-hod-portal="true">Fixture HOD portal</section><footer>',
    );
    if (injected === html) throw new Error("maintenance fixture could not find the server portal insertion point");
    await route.fulfill({ response, body: injected });
  });

  const response = await page.goto("/", { waitUntil: "domcontentloaded" });
  expect(response?.status()).toBe(503);

  const runtimeSource = await page.locator('script[src*="/assets/terraos-maintenance.js"]').getAttribute("src");
  expect(runtimeSource).toBeTruthy();
  const runtime = new URL(runtimeSource!, page.url());
  expect(runtime.origin).toBe(new URL(page.url()).origin);
  expect(runtime.pathname).toBe("/assets/terraos-maintenance.js");
  expect(runtime.searchParams.get("v")).toBeTruthy();

  await expect(page.locator('[data-confirmation-host] > .hod-portal[data-test-hod-portal="true"]')).toHaveCount(1);
  await expect(page.locator('[data-confirmation-fallback]')).toBeHidden();
});
