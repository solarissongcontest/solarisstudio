import { createFileRoute, ScriptOnce } from "@tanstack/react-router";

import { APP_LAUNCH_TRANSACTION_KEY } from "@/lib/app-launch-lifecycle";
import { APP_NAVIGATION_STORAGE_KEY } from "@/lib/app-navigation";

const APP_LAUNCH_BOOTSTRAP_SCRIPT = `(() => {
  try {
    if (window.location.pathname !== "/app-launch") return;
    let navigationSnapshot = null;
    let safeRoot = "/";
    try {
      navigationSnapshot = window.localStorage.getItem(${JSON.stringify(APP_NAVIGATION_STORAGE_KEY)});
      if (typeof navigationSnapshot === "string") {
        const parsed = JSON.parse(navigationSnapshot);
        if (parsed?.activeTab === "explore") safeRoot = "/explore";
        else if (parsed?.activeTab === "participate") safeRoot = "/participate";
        else if (parsed?.activeTab === "results") safeRoot = "/results";
        else if (parsed?.activeTab === "me") safeRoot = "/auth";
      }
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
    window.location.replace(safeRoot);
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
        className="grid min-h-[100svh] place-items-center bg-[#020817] px-6 text-center text-white"
        aria-busy="true"
        aria-live="polite"
      >
        <div className="flex flex-col items-center">
          <img
            src="/solaris-studio-mark.png"
            alt=""
            aria-hidden="true"
            width={256}
            height={256}
            className="size-16 object-contain"
          />
          <p className="mt-4 text-[10px] font-black uppercase tracking-[.16em] text-white/78">
            Solaris Studio
          </p>
          <p className="sr-only" role="status">
            Opening Solaris Studio.
          </p>
        </div>
      </main>
    </>
  );
}
