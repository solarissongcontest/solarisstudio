/** Native HTML deliberately works even when the client entry never executes. */
export function PrimarySurfaceRecovery({ surface }: { surface: "home" | "participate" }) {
  return (
    <aside className="mt-7 max-w-xl text-sm leading-6" aria-label="Loading help">
      <p role="status">Opening Solaris Studio…</p>
      <details className="mt-3">
        <summary className="min-h-11 cursor-pointer py-3 font-semibold focus-visible:outline focus-visible:outline-2">
          Taking longer than expected?
        </summary>
        <p className="text-muted-foreground">
          The full experience has not finished loading. Check your connection and try loading this page again.
          If it still does not open, try a new browser tab. No account actions have been submitted by this loading page.
        </p>
        <form action={surface === "home" ? "/" : "/participate"} method="get">
          <button type="submit" className="mt-3 min-h-11 rounded-lg border border-border px-4 font-semibold focus-visible:outline focus-visible:outline-2">
            Reload this page
          </button>
        </form>
      </details>
      <noscript><p>JavaScript is unavailable. Enable JavaScript to open the full experience. The links above still work.</p></noscript>
    </aside>
  );
}
