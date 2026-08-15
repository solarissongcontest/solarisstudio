import { lazy, Suspense } from "react";

import type { BroadcastConfig } from "@/lib/broadcast";

const LazyBroadcastEditor = lazy(() =>
  import("./BroadcastEditorImpl").then((module) => ({
    default: module.BroadcastEditor,
  })),
);

export function BroadcastEditor({
  config,
  onChange,
}: {
  config: BroadcastConfig;
  onChange: (next: BroadcastConfig) => void;
}) {
  return (
    <Suspense
      fallback={
        <div className="rounded-2xl border border-border bg-surface/35 p-5 text-sm text-muted-foreground">
          Loading broadcast editor…
        </div>
      }
    >
      <LazyBroadcastEditor config={config} onChange={onChange} />
    </Suspense>
  );
}
