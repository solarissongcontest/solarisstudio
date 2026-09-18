import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

import { AppShell } from "@/components/AppShell";
import { CountryPersonalityStyles } from "@/components/CountryPersonalityStyles";
import {
  PersonalityQaPreview,
  type PersonalityPreviewSurface,
} from "@/components/country/PersonalityQaPreview";
import { COUNTRY_PERSONALITY_SOURCES } from "@/lib/country-personality-sources";
import { PERSONALITY_QA_FIXTURES } from "@/lib/personality-fixtures";

export const Route = createFileRoute("/dev/personality-gallery")({
  head: () => ({ meta: [{ title: "Personality Gallery — Solaris Studio" }] }),
  component: PersonalityGalleryRoute,
});

type GalleryView = "country-mobile" | "country-desktop" | "wiki-mobile" | "wiki-desktop";

const VIEW_CONFIG: Record<GalleryView, { label: string; surface: PersonalityPreviewSurface; width: number }> = {
  "country-mobile": { label: "390px Country", surface: "country", width: 390 },
  "country-desktop": { label: "1440px Country", surface: "country", width: 1440 },
  "wiki-mobile": { label: "390px Wiki", surface: "wiki", width: 390 },
  "wiki-desktop": { label: "1440px Wiki", surface: "wiki", width: 1440 },
};

function PersonalityGalleryRoute() {
  return (
    <>
      <CountryPersonalityStyles />
      <PersonalityGallery />
    </>
  );
}

function PersonalityGallery() {
  const [view, setView] = useState<GalleryView>("country-mobile");
  const config = VIEW_CONFIG[view];
  const fixture = PERSONALITY_QA_FIXTURES[0];

  return (
    <AppShell>
      <main className="space-y-5" data-personality-gallery>
        <header className="data-panel p-5">
          <p className="text-xs font-semibold uppercase tracking-[.12em] text-muted-foreground">Collection QA</p>
          <h1 className="mt-2 text-3xl font-bold">Personality Gallery</h1>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground">
            The same country is rendered in every personality so duplicate compositions, giant flags, generic lower sections and weak source translations are visible immediately.
          </p>
          <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Gallery view">
            {(Object.entries(VIEW_CONFIG) as Array<[GalleryView, typeof config]>).map(([id, item]) => (
              <button
                key={id}
                type="button"
                onClick={() => setView(id)}
                aria-pressed={view === id}
                className={view === id ? "min-h-11 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground" : "min-h-11 rounded-lg border border-border bg-surface px-3 text-sm font-semibold"}
              >
                {item.label}
              </button>
            ))}
          </div>
        </header>

        <div className="space-y-8">
          {COUNTRY_PERSONALITY_SOURCES.map((source, index) => (
            <section key={source.id} className="data-panel overflow-hidden p-3 sm:p-4" data-gallery-personality={source.id}>
              <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[.12em] text-muted-foreground">{String(index + 1).padStart(2, "0")} · {source.compositionFamily}</p>
                  <h2 className="mt-1 text-lg font-semibold">{source.sourceName}</h2>
                </div>
                <p className="text-xs text-muted-foreground">{source.flag.mobile[0]}×{source.flag.mobile[1]} mobile flag max</p>
              </div>
              <div className={config.width > 500 ? "overflow-x-auto pb-2" : ""}>
                <PersonalityQaPreview personality={source.id} fixture={fixture} surface={config.surface} viewport={config.width} />
              </div>
            </section>
          ))}
        </div>
      </main>
    </AppShell>
  );
}
