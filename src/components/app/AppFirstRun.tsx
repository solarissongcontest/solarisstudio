import { Compass, RadioTower, Vote } from "lucide-react";
import { useEffect, useState } from "react";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

export const APP_FIRST_RUN_COMPLETE_KEY = "solaris:app-first-run-complete:v1";

function allowedOnPath(pathname: string) {
  return !(
    pathname === "/app-launch" ||
    pathname.startsWith("/auth") ||
    pathname.startsWith("/admin") ||
    pathname.startsWith("/confirmations") ||
    pathname.startsWith("/jury-voting") ||
    pathname.startsWith("/televoting") ||
    pathname.startsWith("/next-in-line") ||
    pathname.startsWith("/broadcast/")
  );
}

export function appFirstRunComplete() {
  if (typeof window === "undefined") return true;
  return window.localStorage.getItem(APP_FIRST_RUN_COMPLETE_KEY) === "1";
}

export function AppFirstRun({
  isAppMode,
  pathname,
  onComplete,
}: {
  isAppMode: boolean;
  pathname: string;
  onComplete?: () => void;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!isAppMode || !allowedOnPath(pathname)) return;
    if (window.localStorage.getItem(APP_FIRST_RUN_COMPLETE_KEY) === "1") return;
    setOpen(true);
  }, [isAppMode, pathname]);

  const complete = () => {
    window.localStorage.setItem(APP_FIRST_RUN_COMPLETE_KEY, "1");
    setOpen(false);
    onComplete?.();
  };

  if (!isAppMode) return null;

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent
        side="bottom"
        showCloseButton={false}
        aria-label="Welcome to Solaris Studio"
        className="solaris-app-first-run"
        onInteractOutside={(event) => event.preventDefault()}
        onEscapeKeyDown={(event) => event.preventDefault()}
      >
        <SheetHeader>
          <p className="solaris-app-first-run-eyebrow">Solaris Studio</p>
          <SheetTitle>Your SSC companion</SheetTitle>
          <SheetDescription>
            Solaris keeps the contest, participation and live-event state in one app.
          </SheetDescription>
        </SheetHeader>

        <div className="solaris-app-first-run-grid">
          <div className="solaris-app-first-run-row">
            <Vote className="size-5" aria-hidden="true" />
            <div>
              <strong>Participate</strong>
              <span>Your required tasks, deadlines and voting windows.</span>
            </div>
          </div>
          <div className="solaris-app-first-run-row">
            <RadioTower className="size-5" aria-hidden="true" />
            <div>
              <strong>Show Mode</strong>
              <span>Reliable voting and result phases alongside the YouTube broadcast.</span>
            </div>
          </div>
          <div className="solaris-app-first-run-row">
            <Compass className="size-5" aria-hidden="true" />
            <div>
              <strong>Explore & Results</strong>
              <span>Countries, editions, shows and official published data.</span>
            </div>
          </div>
        </div>

        <button
          type="button"
          className="solaris-app-first-run-continue"
          onClick={complete}
        >
          Continue
        </button>
      </SheetContent>
    </Sheet>
  );
}
