import { lazy, Suspense } from "react";

import type {
  BroadcastRowData,
  ScoreboardConfig,
} from "@/lib/scoreboard";
import type { ThemeConfig } from "@/lib/theme";

const LazyScoreboardEditor = lazy(() =>
  import("./ScoreboardEditorImpl").then((module) => ({
    default: module.ScoreboardEditor,
  })),
);

export function ScoreboardEditor({
  config,
  onChange,
  rows,
  theme,
  showName,
  onReset,
}: {
  config: ScoreboardConfig;
  onChange: (next: ScoreboardConfig) => void;
  rows: BroadcastRowData[];
  theme: ThemeConfig;
  showName: string;
  onReset?: () => void;
}) {
  return (
    <Suspense
      fallback={
        <div className="rounded-2xl border border-border bg-surface/35 p-5 text-sm text-muted-foreground">
          Loading scoreboard editor…
        </div>
      }
    >
      <LazyScoreboardEditor
        config={config}
        onChange={onChange}
        rows={rows}
        theme={theme}
        showName={showName}
        onReset={onReset}
      />
    </Suspense>
  );
}
