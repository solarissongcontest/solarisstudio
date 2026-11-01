import { expect, test, type Page } from "@playwright/test";

async function mobileHeroContract(page: Page) {
  return page.evaluate(() => {
    const visible = (selector: string) => {
      const element = document.querySelector<HTMLElement>(selector);
      if (!element) return false;
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity) !== 0
        && rect.width > 0 && rect.height > 0;
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

test("versioned local maintenance runtime moves an injected HOD portal into Confirmation", async ({ page }) => {
  const response = await page.goto("/", { waitUntil: "domcontentloaded" });
  expect(response?.status()).toBe(503);

  await page.evaluate(() => {
    const portal = document.createElement("section");
    portal.className = "hod-portal";
    portal.setAttribute("data-test-hod-portal", "true");
    portal.textContent = "Fixture HOD portal";
    document.body.appendChild(portal);
  });

  await page.addScriptTag({ url: "/assets/terraos-maintenance.js?v=e2e-hod-relocation" });

  await expect(page.locator('[data-confirmation-host] > .hod-portal[data-test-hod-portal="true"]')).toHaveCount(1);
  await expect(page.locator('[data-confirmation-fallback]')).toBeHidden();
});
