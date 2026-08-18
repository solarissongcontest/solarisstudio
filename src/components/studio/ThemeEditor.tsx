import { useRouterState } from "@tanstack/react-router";
import { lazy, Suspense } from "react";

import { EditionArtworkControl } from "./EditionArtworkControl";
import type { ThemeConfig } from "@/lib/theme";

const LazyThemeEditor = lazy(() =>
  import("./ThemeEditorImpl").then((module) => ({
    default: module.ThemeEditor,
  })),
);

export function ThemeEditor({
  theme,
  onChange,
}: {
  theme: ThemeConfig;
  onChange: (next: ThemeConfig) => void;
}) {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const match = pathname.match(/^\/admin\/design\/([^/]+)/);
  const slug = match?.[1] ? decodeURIComponent(match[1]) : null;

  return (
    <>
      {slug ? <EditionArtworkControl slug={slug} /> : null}

      <Suspense
        fallback={
          <div className="rounded-2xl border border-border bg-surface/35 p-5 text-sm text-muted-foreground">
            Loading theme editor…
          </div>
        }
      >
        <LazyThemeEditor theme={theme} onChange={onChange} />
      </Suspense>
    </>
  );
}
