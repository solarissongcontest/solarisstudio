import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(path, "utf8");

describe("App Experience v3 cold launch offline and reconnect foundation", () => {
  it("routes only true installed-app launches through the restoration entry point", () => {
    const manifest = JSON.parse(source("public/site.webmanifest")) as { start_url?: string };
    const launch = source("src/routes/app-launch.tsx");
    expect(manifest.start_url).toBe("/app-launch");
    expect(launch).toContain('createFileRoute("/app-launch")');
    expect(launch).toContain("getAppLaunchDestination");
    expect(launch).toContain("supabase.auth");
    expect(launch).toContain(".getSession()");
    expect(launch).toContain("APP_LAUNCH_SESSION_TIMEOUT_MS");
    expect(launch).toContain("Promise.race");
    expect(launch).toContain('"cold_launch_session_timeout"');
    expect(launch).toContain('pathname: "/"');
    expect(launch).toContain("markAppNavigationRestore");
    expect(launch).toContain("replace: true");
  });

  it("hydrates app connectivity from deterministic HTML before browser state is read", () => {
    const connectivity = source("src/lib/app-connectivity.ts");
    const runtime = source("src/components/app/AppRuntime.tsx");
    expect(connectivity).toContain("hydrationSafeAppConnectivitySnapshot");
    expect(connectivity).toContain('status: "online"');
    expect(connectivity).toContain("serviceRestricted: false");
    expect(runtime).toContain("hydrationSafeAppConnectivitySnapshot()");
    expect(runtime).toContain("createAppConnectivityController(setConnectivity)");
  });

  it("never cold-launches directly into critical official submission routes", () => {
    const navigation = source("src/lib/app-navigation.ts");
    expect(navigation).toContain("coldLaunchDestinationAllowed");
    expect(navigation).toContain("confirmations|jury-voting|televoting|next-in-line");
    expect(navigation).toContain("app-launch|auth|reset|recover");
    expect(navigation).toContain("show-mode");
    expect(navigation).toContain("APP_LAUNCH_RESTORE_MAX_AGE_MS");
    expect(navigation).toContain("defaultEntry(tab, signedIn)");
  });

  it("keeps navigational HTML network-only while serving a dedicated offline app shell", () => {
    const worker = source("public/sw.js");
    const offline = source("public/offline.html");
    expect(worker).toContain("return await fetch(request)");
    expect(worker).not.toContain("cache.put(request, response.clone())\n    return response;\n  } catch");
    expect(offline).toContain('class="tabbar"');
    expect(offline).toContain('data-tab="participate"');
    expect(offline).toContain('href="/participate"');
    expect(offline).toContain('window.addEventListener("online"');
    expect(offline).toContain("solaris:offline-public-index:v1");
    expect(offline).toContain("Official submissions are never queued");
  });

  it("reconciles safe read state only after verified connectivity recovery", () => {
    const connectivity = source("src/lib/app-connectivity.ts");
    const reconciler = source("src/components/app/AppReconnectReconciler.tsx");
    const root = source("src/routes/__root.tsx");
    expect(connectivity).toContain("APP_CONNECTIVITY_RECOVERED_EVENT");
    expect(connectivity).toContain('previousStatus !== "online"');
    expect(reconciler).toContain('chrome.archetype === "task"');
    expect(reconciler).toContain("invalidateQueries");
    expect(reconciler).toContain("router.invalidate");
    expect(root).toContain("<AppReconnectReconciler />");
  });

  it("does not replay official mutations during offline or reconnect handling", () => {
    const worker = source("public/sw.js");
    const reconciler = source("src/components/app/AppReconnectReconciler.tsx");
    expect(worker).toContain('request.method !== "GET"');
    expect(reconciler).not.toContain("mutate");
    expect(reconciler).not.toContain("submit");
  });
});
