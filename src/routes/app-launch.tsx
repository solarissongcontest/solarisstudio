import { createFileRoute, ScriptOnce } from "@tanstack/react-router";

import { APP_LAUNCH_TRANSACTION_KEY } from "@/lib/app-launch-lifecycle";
import { APP_NAVIGATION_STORAGE_KEY } from "@/lib/app-navigation";

const APP_LAUNCH_BOOTSTRAP_SCRIPT = `(() => {
  try {
    if (window.location.pathname !== "/app-launch") return;
    let navigationSnapshot = null;
    try {
      navigationSnapshot = window.localStorage.getItem(${JSON.stringify(APP_NAVIGATION_STORAGE_KEY)});
    } catch {}
    try {
      window.sessionStorage.setItem(
        ${JSON.stringify(APP_LAUNCH_TRANSACTION_KEY)},
        JSON.stringify({
          version: 1,
          startedAt: new Date().toISOString(),
          navigationSnapshot:
            typeof navigationSnapshot === "string" ? navigationSnapshot : null,
        }),
      );
    } catch {}
    window.location.replace("/");
  } catch {
    if (window.location.pathname === "/app-launch") window.location.replace("/");
  }
})();`;

export const Route = createFileRoute("/app-launch")({
  head: () => ({
    meta: [{ title: "Opening Solaris Studio…" }, { name: "robots", content: "noindex, nofollow" }],
  }),
  component: AppLaunchPage,
});

function AppLaunchPage() {
  return (
    <>
      {/* Parsing-time trampoline: no auth, telemetry, timer or hydration owner. */}
      <ScriptOnce>{APP_LAUNCH_BOOTSTRAP_SCRIPT}</ScriptOnce>
      <main
        id="main-content"
        className="grid min-h-[100svh] place-items-center bg-background px-6 text-center"
        aria-busy="true"
        aria-live="polite"
      >
        <div>
          <img
            src="/icon-192.png?v=img2340-20260929"
            alt=""
            className="mx-auto size-20 rounded-[1.35rem]"
          />
          <p className="mt-5 text-[10px] font-black uppercase tracking-[.16em] text-primary">
            Solaris Studio
          </p>
          <h1 className="mt-2 text-2xl font-bold tracking-[-.03em]">Opening your app…</h1>
          <div
            className="mx-auto mt-5 h-1 w-28 overflow-hidden rounded-full bg-white/10"
            aria-hidden="true"
          >
            <span className="block h-full w-1/2 animate-pulse rounded-full bg-primary" />
          </div>
        </div>
      </main>
    </>
  );
}
