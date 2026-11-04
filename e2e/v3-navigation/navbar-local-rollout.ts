import { readFileSync } from "node:fs";

import { expect, type BrowserContext, type Page } from "@playwright/test";

const NAVBAR_INSTALLED_APP_CSS_EMULATION = readFileSync("src/styles/app-shell.css", "utf8")
  .replace(/\(display-mode:\s*(?:standalone|window-controls-overlay)\)\s+and\s+/g, "")
  .replace(/\(display-mode:\s*(?:standalone|window-controls-overlay)\)/g, "all");
const NAVBAR_V3_INSTALLED_GEOMETRY = readFileSync(
  "src/styles/v3-installed-app-navbar.css",
  "utf8",
);

export async function applyNavbarInstalledCssEmulation(page: Page) {
  // app-shell.css is linked before V3's component CSS in production. Re-inject
  // the V3 installed-nav owner after the display-mode emulation so the audit
  // preserves that real cascade instead of letting the emulation resurrect the
  // old AppTabBar geometry at the end of <head>.
  await page.addStyleTag({ content: NAVBAR_INSTALLED_APP_CSS_EMULATION });
  await page.addStyleTag({ content: NAVBAR_V3_INSTALLED_GEOMETRY });
}

export type NavbarE2ESession = {
  access_token: string;
  user: { id: string; email?: string | null };
  [key: string]: unknown;
};

type NavbarLocalConfig = {
  supabaseUrl: string;
  publishableKey: string;
  organizerEmail: string;
  organizerPassword: string;
  countryEmail: string;
  countryPassword: string;
  baseURL: string;
};

function requiredLocalConfig(): NavbarLocalConfig {
  const supabaseUrl = process.env.E2E_SUPABASE_URL;
  const publishableKey = process.env.E2E_SUPABASE_PUBLISHABLE_KEY;
  const organizerEmail = process.env.E2E_ORGANIZER_B_EMAIL;
  const organizerPassword = process.env.E2E_ORGANIZER_B_PASSWORD;
  const countryEmail = process.env.E2E_COUNTRY_EMAIL;
  const countryPassword = process.env.E2E_COUNTRY_PASSWORD;
  const baseURL = process.env.E2E_BASE_URL ?? "http://127.0.0.1:4173";

  if (
    !supabaseUrl ||
    !publishableKey ||
    !organizerEmail ||
    !organizerPassword ||
    !countryEmail ||
    !countryPassword
  ) {
    throw new Error(
      "Navbar browser certification requires isolated local Supabase plus Organizer B and country credentials.",
    );
  }

  const supabase = new URL(supabaseUrl);
  const app = new URL(baseURL);
  if (!["127.0.0.1", "localhost"].includes(supabase.hostname)) {
    throw new Error(`Refusing navbar rollout mutation against non-local Supabase: ${supabase.origin}`);
  }
  if (!["127.0.0.1", "localhost"].includes(app.hostname)) {
    throw new Error(`Refusing navbar browser certification against non-local app origin: ${app.origin}`);
  }

  return {
    supabaseUrl,
    publishableKey,
    organizerEmail,
    organizerPassword,
    countryEmail,
    countryPassword,
    baseURL,
  };
}

async function fetchSession(
  supabaseUrl: string,
  publishableKey: string,
  email: string,
  password: string,
): Promise<NavbarE2ESession> {
  const response = await fetch(
    `${supabaseUrl.replace(/\/$/, "")}/auth/v1/token?grant_type=password`,
    {
      method: "POST",
      headers: { apikey: publishableKey, "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    },
  );
  const body = await response.text();
  expect(response.ok, `Local navbar audit identity must sign in: ${body}`).toBeTruthy();
  return JSON.parse(body) as NavbarE2ESession;
}

async function setFeature(
  config: NavbarLocalConfig,
  organizer: NavbarE2ESession,
  key: string,
  targetUserIds: string[],
) {
  const response = await fetch(
    `${config.supabaseUrl.replace(/\/$/, "")}/rest/v1/rpc/studio2_set_feature_flag`,
    {
      method: "POST",
      headers: {
        apikey: config.publishableKey,
        Authorization: `Bearer ${organizer.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        p_key: key,
        p_enabled: true,
        p_admins_only: false,
        p_user_ids: targetUserIds,
        p_edition_ids: [],
      }),
    },
  );
  const body = await response.text();
  expect(response.ok, `Local ${key} navbar rollout mutation must succeed: ${body}`).toBeTruthy();
}

export async function prepareNavbarInstalledContext(
  context: BrowserContext,
  { experience = "installed" }: { experience?: "installed" | "web" } = {},
) {
  const config = requiredLocalConfig();
  const [organizer, country] = await Promise.all([
    fetchSession(
      config.supabaseUrl,
      config.publishableKey,
      config.organizerEmail,
      config.organizerPassword,
    ),
    fetchSession(
      config.supabaseUrl,
      config.publishableKey,
      config.countryEmail,
      config.countryPassword,
    ),
  ]);

  // Navbar certification owns a real V3 route matrix. The local seed keeps most
  // slice flags disabled by default, so explicitly enable only the existing V3
  // slices this proof visits. No production feature state is involved.
  const audience = [country.user.id];
  for (const key of [
    "solaris_app_v3",
    "solaris_app_v3_account_settings",
    "solaris_app_v3_explore",
    "solaris_app_v3_edition_hub",
    "solaris_app_v3_rules_guidance",
    "solaris_app_v3_results",
  ]) {
    await setFeature(config, organizer, key, audience);
  }

  const projectRef = new URL(config.supabaseUrl).hostname.split(".")[0];
  await context.addCookies([
    {
      name: "solaris_e2e_maintenance_bypass",
      value: "1",
      url: config.baseURL,
      httpOnly: true,
      secure: false,
      sameSite: "Lax",
    },
  ]);
  await context.addInitScript(
    ({ key, value, standalone }) => {
      localStorage.setItem(key, JSON.stringify(value));
      localStorage.setItem("solaris:app-first-run-complete:v1", "1");
      Object.defineProperty(navigator, "standalone", { configurable: true, value: standalone });
      const originalMatchMedia = window.matchMedia.bind(window);
      window.matchMedia = ((query: string) => {
        if (query === "(display-mode: standalone)") {
          return {
            matches: standalone,
            media: query,
            onchange: null,
            addListener: () => undefined,
            removeListener: () => undefined,
            addEventListener: () => undefined,
            removeEventListener: () => undefined,
            dispatchEvent: () => false,
          } as MediaQueryList;
        }
        return originalMatchMedia(query);
      }) as typeof window.matchMedia;
    },
    {
      key: `sb-${projectRef}-auth-token`,
      value: country,
      standalone: experience === "installed",
    },
  );

  return { baseURL: config.baseURL, country };
}
