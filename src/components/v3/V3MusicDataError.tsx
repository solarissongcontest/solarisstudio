import { RefreshCw } from "lucide-react";

import {
  V3Screen,
  V3ScreenHeader,
  V3Surface,
} from "./V3Foundation";

export function V3MusicDataError({
  title,
  description,
  onRetry,
}: {
  title: string;
  description: string;
  onRetry: () => void | Promise<unknown>;
}) {
  return (
    <V3Screen>
      <V3ScreenHeader title={title} description={description} />
      <V3Surface level="raised" className="p-5">
        <p className="text-sm leading-6 text-white/55">
          The canonical public music projection could not be loaded. Solaris will not substitute raw Entry data or guess identity while it is unavailable.
        </p>
        <button
          type="button"
          onClick={() => void onRetry()}
          className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.07] px-4 text-sm font-semibold text-white/88 transition hover:bg-white/[0.11] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70"
        >
          <RefreshCw className="size-4" aria-hidden="true" />
          Retry
        </button>
      </V3Surface>
    </V3Screen>
  );
}
