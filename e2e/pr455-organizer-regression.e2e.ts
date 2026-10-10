import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  expect,
  test,
  type BrowserContext,
  type Page,
  type TestInfo,
} from "@playwright/test";

type OrganizerSession = {
  access_token: string;
  user: { id: string; email?: string | null };
  [key: string]: unknown;
};

type LocalBrowserConfig = {
  supabaseUrl: string;
  publishableKey: string;
  email: string;
  password: string;
  baseURL: string;
};

type PreflightCase = {
  label: string;
  path: string;
  viewport: { width: number; height: number };
};

type NetworkRecord = {
  status: number;
  method: string;
  resourceType: string;
  url: string;
};

type PreflightAudit = {
  label: string;
  route: string;
  viewport: { width: number; height: number };
  classification: string;
  durationMs: number;
  navigation: {
    documentStatus: number | null;
    navigationError: string | null;
    finalPath: string;
    routeLooksWrong: boolean;
  };
  rendering: {
    title: string;
    rootContentMounted: boolean;
    bodyContentMounted: boolean;
    mainVisible: boolean;
    headingVisible: boolean;
    mainCount: number;
    h1Count: number;
    overflow: number;
    loadingVisible: boolean;
    errorBoundaryVisible: boolean;
    setupMessageVisible: boolean;
  };
  auth: {
    authPlaceholderVisible: boolean;
    sessionStoragePresent: boolean;
    localAuthResponses: NetworkRecord[];
  };
  supabase: {
    expectedUrl: string;
    localRequests: NetworkRecord[];
    remoteRequests: NetworkRecord[];
    dataApiFailures: NetworkRecord[];
    protectedApiFailures: NetworkRecord[];
  };
  runtime: {
    consoleErrors: string[];
    pageErrors: string[];
    failedRequests: string[];
    failedCriticalResponses: NetworkRecord[];
  };
};

const organizerCases: readonly PreflightCase[] = [
  {
    label: "desktop-hosts",
    path: "/admin/hosts",
    viewport: { width: 1440, height: 1000 },
  },
  {
    label: "desktop-integrity-declarations",
    path: "/televoting/admin/integrity-declarations",
    viewport: { width: 1440, height: 1000 },
  },
  {
    label: "mobile-entries",
    path: "/admin/entries/ssc22",
    viewport: { width: 390, height: 844 },
  },
  {
    label: "mobile-results-reveal",
    path: "/admin/results-reveal",
    viewport: { width: 390, height: 844 },
  },
  {
    label: "landscape-results-reveal",
    path: "/admin/results-reveal",
    viewport: { width: 844, height: 390 },
  },
] as const;

function requireLocalBrowserConfig(): LocalBrowserConfig {
  const supabaseUrl = process.env.E2E_SUPABASE_URL;
  const publishableKey = process.env.E2E_SUPABASE_PUBLISHABLE_KEY;
  const email = process.env.E2E_ORGANIZER_EMAIL;
  const password = process.env.E2E_ORGANIZER_PASSWORD;
  const baseURL = process.env.E2E_BASE_URL ?? "http://127.0.0.1:4173";

  if (!supabaseUrl || !publishableKey || !email || !password) {
    throw new Error(
      "PR455 organizer preflight requires the seeded local Organizer and local Supabase identity.",
    );
  }
  if (!/^http:\/\/(?:127\.0\.0\.1|localhost):\d+/.test(supabaseUrl)) {
    throw new Error(`Refusing PR455 organizer preflight against non-local Supabase: ${supabaseUrl}`);
  }
  if (!/^http:\/\/(?:127\.0\.0\.1|localhost):\d+/.test(baseURL)) {
    throw new Error(`Refusing PR455 organizer preflight against non-local app URL: ${baseURL}`);
  }

  return { supabaseUrl, publishableKey, email, password, baseURL };
}

async function signInOrganizer(config: LocalBrowserConfig): Promise<OrganizerSession> {
  const response = await fetch(
    `${config.supabaseUrl.replace(/\/$/, "")}/auth/v1/token?grant_type=password`,
    {
      method: "POST",
      headers: {
        apikey: config.publishableKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email: config.email, password: config.password }),
    },
  );
  const raw = await response.text();
  expect(response.ok, `Seeded local Organizer must sign in: ${raw}`).toBeTruthy();

  const session = JSON.parse(raw) as OrganizerSession;
  expect(session.access_token, "Local Organizer sign-in must return an access token").toBeTruthy();

  const userResponse = await fetch(`${config.supabaseUrl.replace(/\/$/, "")}/auth/v1/user`, {
    headers: {
      apikey: config.publishableKey,
      Authorization: `Bearer ${session.access_token}`,
    },
  });
  const userBody = await userResponse.text();
  expect(
    userResponse.ok,
    `Seeded local Organizer token must resolve through local Auth: ${userBody}`,
  ).toBeTruthy();

  return session;
}

async function installOrganizerState(
  context: BrowserContext,
  config: LocalBrowserConfig,
  session: OrganizerSession,
) {
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
    ({ key, value }) => localStorage.setItem(key, JSON.stringify(value)),
    { key: `sb-${projectRef}-auth-token`, value: session },
  );

  await context.addInitScript(() => {
    const originalError = console.error.bind(console);
    console.error = (...args: unknown[]) => {
      const first = args[0];
      if (
        typeof first === "string" &&
        first.includes("Can't perform a React state update on a component that hasn't mounted yet")
      ) {
        const stack = new Error("React state-update diagnostic").stack ?? "stack unavailable";
        originalError(...args, `\nReact state-update diagnostic stack:\n${stack}`);
        return;
      }
      originalError(...args);
    };
  });
}

function isHostedSupabase(url: string) {
  try {
    return new URL(url).hostname.endsWith(".supabase.co");
  } catch {
    return false;
  }
}

function classifyAudit(audit: Omit<PreflightAudit, "classification">): string {
  if (audit.supabase.remoteRequests.length > 0) return "ENVIRONMENT_MISMATCH";
  if (
    audit.navigation.navigationError ||
    !audit.rendering.rootContentMounted ||
    !audit.rendering.bodyContentMounted
  ) {
    return "APP_BOOT_FAILURE";
  }
  if (
    audit.auth.authPlaceholderVisible ||
    audit.auth.localAuthResponses.some((record) => record.status === 401 || record.status === 403)
  ) {
    return "AUTH_BOOTSTRAP_FAILURE";
  }
  if (
    audit.navigation.routeLooksWrong ||
    (audit.navigation.documentStatus !== null && audit.navigation.documentStatus >= 400)
  ) {
    return "ROUTING_FAILURE";
  }
  if (audit.rendering.errorBoundaryVisible) return "ERROR_BOUNDARY";
  if (audit.supabase.protectedApiFailures.length > 0) return "RLS_PERMISSION_FAILURE";
  if (audit.supabase.dataApiFailures.length > 0) return "DATA_API_FAILURE";
  if (!audit.rendering.mainVisible || !audit.rendering.headingVisible) return "SEMANTIC_READINESS_FAILURE";
  if (audit.runtime.pageErrors.length > 0 || audit.runtime.consoleErrors.length > 0) {
    return "APP_RUNTIME_FAILURE";
  }
  if (audit.runtime.failedRequests.length > 0 || audit.runtime.failedCriticalResponses.length > 0) {
    return "NETWORK_FAILURE";
  }
  if (audit.rendering.overflow > 2) return "RESPONSIVE_LAYOUT_FAILURE";
  return "OK";
}

function criticalResource(resourceType: string, url: string) {
  return (
    ["document", "script", "stylesheet", "font"].includes(resourceType) ||
    /\/(?:rest|auth|storage)\/v1\//i.test(url) ||
    isHostedSupabase(url)
  );
}

function ignoreConsoleError(message: string) {
  return (
    /favicon|hydration (?:failed because|completed but contains)|a tree hydrated but some attributes/i.test(
      message,
    ) ||
    /^Failed to load resource: the server responded with a status of \d{3}(?: \([^)]*\))?$/i.test(
      message.trim(),
    )
  );
}

async function persistAudit(testInfo: TestInfo, audit: PreflightAudit) {
  const body = JSON.stringify(audit, null, 2);
  const artifactDir = path.resolve("artifacts/browser-audit/preflight");
  await mkdir(artifactDir, { recursive: true });
  await writeFile(path.join(artifactDir, `${audit.label}.json`), `${body}\n`, "utf8");
  await testInfo.attach("route-audit.json", {
    body,
    contentType: "application/json",
  });
  testInfo.annotations.push({ type: "classification", description: audit.classification });
  console.log(`PR455_PREFLIGHT_RESULT ${JSON.stringify({
    route: audit.route,
    viewport: audit.viewport,
    classification: audit.classification,
    documentStatus: audit.navigation.documentStatus,
    finalPath: audit.navigation.finalPath,
    remoteSupabaseRequests: audit.supabase.remoteRequests.length,
    protectedApiFailures: audit.supabase.protectedApiFailures.length,
    dataApiFailures: audit.supabase.dataApiFailures.length,
    consoleErrors: audit.runtime.consoleErrors.length,
    pageErrors: audit.runtime.pageErrors.length,
    overflow: audit.rendering.overflow,
  })}`);
}

async function auditOrganizerRoute(
  page: Page,
  testInfo: TestInfo,
  config: LocalBrowserConfig,
  currentCase: PreflightCase,
) {
  const startedAt = Date.now();
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  const failedRequests: string[] = [];
  const failedCriticalResponses: NetworkRecord[] = [];
  const localRequests: NetworkRecord[] = [];
  const remoteRequests: NetworkRecord[] = [];
  const localAuthResponses: NetworkRecord[] = [];

  page.on("console", (message) => {
    if (message.type() === "error" && !ignoreConsoleError(message.text())) {
      consoleErrors.push(message.text());
    }
  });
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("requestfailed", (request) => {
    const failure = request.failure()?.errorText ?? "failed";
    if (!/ERR_ABORTED|NS_BINDING_ABORTED|cancelled|canceled/i.test(failure)) {
      failedRequests.push(`${request.method()} ${request.url()} — ${failure}`);
    }
  });
  page.on("response", (response) => {
    const request = response.request();
    const record: NetworkRecord = {
      status: response.status(),
      method: request.method(),
      resourceType: request.resourceType(),
      url: response.url(),
    };
    if (record.url.startsWith(config.supabaseUrl)) {
      localRequests.push(record);
      if (/\/auth\/v1\//i.test(record.url)) localAuthResponses.push(record);
    }
    if (isHostedSupabase(record.url)) remoteRequests.push(record);
    if (record.status >= 400 && criticalResource(record.resourceType, record.url)) {
      failedCriticalResponses.push(record);
    }
  });
  page.on("request", (request) => {
    if (!isHostedSupabase(request.url())) return;
    if (remoteRequests.some((record) => record.url === request.url() && record.method === request.method())) {
      return;
    }
    remoteRequests.push({
      status: 0,
      method: request.method(),
      resourceType: request.resourceType(),
      url: request.url(),
    });
  });

  let documentStatus: number | null = null;
  let navigationError: string | null = null;
  try {
    const response = await page.goto(currentCase.path, { waitUntil: "domcontentloaded" });
    documentStatus = response?.status() ?? null;
  } catch (error) {
    navigationError = error instanceof Error ? error.message : String(error);
  }

  const mainVisible = await page
    .locator("main")
    .first()
    .waitFor({ state: "visible", timeout: 15_000 })
    .then(() => true)
    .catch(() => false);
  const headingVisible = await page
    .locator("h1")
    .first()
    .waitFor({ state: "visible", timeout: 15_000 })
    .then(() => true)
    .catch(() => false);

  const pageState = await page.evaluate(() => {
    const visible = (node: Element) => {
      const element = node as HTMLElement;
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return (
        style.display !== "none" &&
        style.visibility !== "hidden" &&
        rect.width > 0 &&
        rect.height > 0
      );
    };
    const bodyText = document.body.textContent?.replace(/\s+/g, " ").trim() ?? "";
    const authStorageKey = Object.keys(localStorage).find(
      (key) => key.startsWith("sb-") && key.endsWith("-auth-token"),
    );
    const mainCount = [...document.querySelectorAll("main")].filter(visible).length;
    const h1Count = [...document.querySelectorAll("h1")].filter(visible).length;
    const root = document.querySelector("#root, #app, [data-router-managed], body > div");
    const loadingVisible = [...document.querySelectorAll('[aria-busy="true"], [data-loading="true"]')].some(
      visible,
    );

    return {
      title: document.title,
      finalPath: location.pathname,
      bodyContentMounted: bodyText.length > 0,
      rootContentMounted: Boolean(root?.textContent?.trim()),
      mainCount,
      h1Count,
      overflow:
        Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - window.innerWidth,
      loadingVisible,
      errorBoundaryVisible: /Something went wrong|This page didn't load|Organizer could not open/i.test(
        bodyText,
      ),
      setupMessageVisible: /setup required|not configured|configuration required/i.test(bodyText),
      authPlaceholderVisible:
        location.pathname.startsWith("/auth") ||
        /sign in to continue|authentication required|session expired/i.test(bodyText),
      sessionStoragePresent: Boolean(authStorageKey && localStorage.getItem(authStorageKey)),
    };
  });

  const routeLooksWrong =
    pageState.finalPath.startsWith("/auth") ||
    pageState.finalPath === "/404" ||
    pageState.finalPath === "/not-found";
  const dataApiFailures = localRequests.filter(
    (record) => /\/rest\/v1\//i.test(record.url) && record.status >= 400,
  );
  const protectedApiFailures = dataApiFailures.filter(
    (record) => record.status === 401 || record.status === 403,
  );

  const withoutClassification: Omit<PreflightAudit, "classification"> = {
    label: currentCase.label,
    route: currentCase.path,
    viewport: currentCase.viewport,
    durationMs: Date.now() - startedAt,
    navigation: {
      documentStatus,
      navigationError,
      finalPath: pageState.finalPath,
      routeLooksWrong,
    },
    rendering: {
      title: pageState.title,
      rootContentMounted: pageState.rootContentMounted,
      bodyContentMounted: pageState.bodyContentMounted,
      mainVisible,
      headingVisible,
      mainCount: pageState.mainCount,
      h1Count: pageState.h1Count,
      overflow: pageState.overflow,
      loadingVisible: pageState.loadingVisible,
      errorBoundaryVisible: pageState.errorBoundaryVisible,
      setupMessageVisible: pageState.setupMessageVisible,
    },
    auth: {
      authPlaceholderVisible: pageState.authPlaceholderVisible,
      sessionStoragePresent: pageState.sessionStoragePresent,
      localAuthResponses,
    },
    supabase: {
      expectedUrl: config.supabaseUrl,
      localRequests,
      remoteRequests,
      dataApiFailures,
      protectedApiFailures,
    },
    runtime: {
      consoleErrors,
      pageErrors,
      failedRequests,
      failedCriticalResponses,
    },
  };
  const audit: PreflightAudit = {
    ...withoutClassification,
    classification: classifyAudit(withoutClassification),
  };

  await persistAudit(testInfo, audit);

  expect(audit.supabase.remoteRequests, `${currentCase.path} must never contact hosted Supabase`).toEqual([]);
  expect(audit.navigation.navigationError, `${currentCase.path} navigation must complete`).toBeNull();
  expect(audit.navigation.documentStatus, `${currentCase.path} should return a document response`).not.toBeNull();
  expect(audit.navigation.documentStatus!, `${currentCase.path} document must be successful`).toBeLessThan(400);
  expect(audit.rendering.rootContentMounted, `${currentCase.path} application root must mount`).toBeTruthy();
  expect(audit.rendering.bodyContentMounted, `${currentCase.path} body must contain application content`).toBeTruthy();
  expect(audit.rendering.mainVisible, `${currentCase.path} needs a visible main landmark`).toBeTruthy();
  expect(audit.rendering.headingVisible, `${currentCase.path} needs a visible page heading`).toBeTruthy();
  expect(audit.rendering.mainCount, `${currentCase.path} should contain one visible main landmark`).toBe(1);
  expect(audit.rendering.h1Count, `${currentCase.path} should contain one visible h1`).toBe(1);
  expect(audit.auth.sessionStoragePresent, `${currentCase.path} must retain the seeded local auth session`).toBeTruthy();
  expect(audit.auth.authPlaceholderVisible, `${currentCase.path} must not fall back to an auth placeholder`).toBeFalsy();
  expect(audit.navigation.routeLooksWrong, `${currentCase.path} must not redirect to an error/auth route`).toBeFalsy();
  expect(audit.rendering.errorBoundaryVisible, `${currentCase.path} must not render an error boundary`).toBeFalsy();
  expect(audit.supabase.protectedApiFailures, `${currentCase.path} must not hit local 401/403 Data API failures`).toEqual([]);
  expect(audit.supabase.dataApiFailures, `${currentCase.path} must not hit failing local Data API requests`).toEqual([]);
  expect(audit.runtime.pageErrors, `${currentCase.path} must not throw browser runtime errors`).toEqual([]);
  expect(audit.runtime.consoleErrors, `${currentCase.path} must not emit actionable console errors`).toEqual([]);
  expect(audit.runtime.failedRequests, `${currentCase.path} must not contain failed requests`).toEqual([]);
  expect(audit.runtime.failedCriticalResponses, `${currentCase.path} must not contain failed critical responses`).toEqual([]);
  expect(audit.rendering.overflow, `${currentCase.path} must not overflow the viewport horizontally`).toBeLessThanOrEqual(2);
}

test.describe("PR455 organizer fail-fast preflight", () => {
  let config: LocalBrowserConfig;
  let session: OrganizerSession;

  test.beforeAll(async () => {
    config = requireLocalBrowserConfig();
    session = await signInOrganizer(config);
  });

  test.beforeEach(async ({ context }) => {
    await installOrganizerState(context, config, session);
  });

  for (const currentCase of organizerCases) {
    test(`${currentCase.label}: ${currentCase.path}`, async ({ page }, testInfo) => {
      await page.setViewportSize(currentCase.viewport);
      await auditOrganizerRoute(page, testInfo, config, currentCase);
    });
  }
});
