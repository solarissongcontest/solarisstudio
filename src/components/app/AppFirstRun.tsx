import { Compass, RadioTower, Vote } from "lucide-react";
import { useEffect, useState } from "react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export const APP_FIRST_RUN_COMPLETE_KEY = "solaris:app-first-run-complete:v1";
const SHOW_DELAY_MS = 500;

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

    const timer = window.setTimeout(() => setOpen(true), SHOW_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [isAppMode, pathname]);

  const complete = () => {
    window.localStorage.setItem(APP_FIRST_RUN_COMPLETE_KEY, "1");
    setOpen(false);
    onComplete?.();
  };

  if (!isAppMode) return null;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && open) complete();
        else setOpen(next);
      }}
    >
      <DialogContent
        className="solaris-app-first-run"
        onEscapeKeyDown={complete}
      >
        <DialogHeader>
          <p className="solaris-app-first-run-eyebrow">Solaris Studio</p>
          <DialogTitle>Your SSC companion</DialogTitle>
          <DialogDescription>
            Solaris keeps the contest, participation and live-event state in one app.
          </DialogDescription>
        </DialogHeader>

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
      </DialogContent>
    </Dialog>
  );
}
