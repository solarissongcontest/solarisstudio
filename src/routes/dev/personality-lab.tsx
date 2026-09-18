import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";

import { AppShell } from "@/components/AppShell";
import { CountryPersonalityStyles } from "@/components/CountryPersonalityStyles";
import {
  PersonalityQaPreview,
  type PersonalityPreviewSurface,
} from "@/components/country/PersonalityQaPreview";
import {
  COUNTRY_PERSONALITY_SOURCES,
  countryPersonalitySource,
} from "@/lib/country-personality-sources";
import { countryPersonalityDivergence } from "@/lib/country-personality-divergence";
import { PERSONALITY_QA_FIXTURES } from "@/lib/personality-fixtures";
import type { CountryHeroLayout } from "@/lib/visual-theme";

export const Route = createFileRoute("/dev/personality-lab")({
  head: () => ({ meta: [{ title: "Personality Lab — Solaris Studio" }] }),
  component: PersonalityLabRoute,
});

const VIEWPORTS = [320, 360, 375, 390, 430, 768, 1024, 1280, 1440, 1920] as const;

function PersonalityLabRoute() {
  return (
    <>
      <CountryPersonalityStyles />
      <PersonalityLab />
    </>
  );
}

function PersonalityLab() {
  const [personality, setPersonality] = useState<CountryHeroLayout>(COUNTRY_PERSONALITY_SOURCES[0].id);
  const [fixtureId, setFixtureId] = useState(PERSONALITY_QA_FIXTURES[0].id);
  const [surface, setSurface] = useState<PersonalityPreviewSurface>("country");
  const [viewport, setViewport] = useState<number>(390);
  const [light, setLight] = useState(false);
  const [rtl, setRtl] = useState(false);
  const [text200, setText200] = useState(false);
  const [highContrast, setHighContrast] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);

  const source = countryPersonalitySource(personality);
  const divergence = countryPersonalityDivergence(personality);
  const fixture = useMemo(
    () => PERSONALITY_QA_FIXTURES.find((item) => item.id === fixtureId) ?? PERSONALITY_QA_FIXTURES[0],
    [fixtureId],
  );

  return (
    <AppShell>
      <div className="space-y-5" data-personality-lab>
        <header className="data-panel p-5">
          <p className="text-xs font-semibold uppercase tracking-[.12em] text-muted-foreground">Design QA</p>
          <h1 className="mt-2 text-3xl font-bold">Personality Lab</h1>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground">
            Stress one Country/Wiki personality against canonical fixtures, hostile names, exact viewport widths and accessibility states before visual approval.
          </p>
        </header>

        <section className="data-panel grid gap-4 p-4 md:grid-cols-2 xl:grid-cols-4" aria-label="Personality Lab controls">
          <label className="grid gap-1 text-xs font-semibold">
            Country fixture
            <select value={fixtureId} onChange={(event) => setFixtureId(event.target.value as typeof fixtureId)} className="min-h-11 rounded-lg border border-border bg-background px-3 text-sm">
              {PERSONALITY_QA_FIXTURES.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
            </select>
          </label>
          <label className="grid gap-1 text-xs font-semibold">
            Personality
            <select value={personality} onChange={(event) => setPersonality(event.target.value as CountryHeroLayout)} className="min-h-11 rounded-lg border border-border bg-background px-3 text-sm">
              {COUNTRY_PERSONALITY_SOURCES.map((item) => <option key={item.id} value={item.id}>{item.sourceName}</option>)}
            </select>
          </label>
          <label className="grid gap-1 text-xs font-semibold">
            Surface
            <select value={surface} onChange={(event) => setSurface(event.target.value as PersonalityPreviewSurface)} className="min-h-11 rounded-lg border border-border bg-background px-3 text-sm">
              <option value="country">Country</option>
              <option value="wiki">Wiki</option>
            </select>
          </label>
          <label className="grid gap-1 text-xs font-semibold">
            Viewport
            <select value={viewport} onChange={(event) => setViewport(Number(event.target.value))} className="min-h-11 rounded-lg border border-border bg-background px-3 text-sm">
              {VIEWPORTS.map((width) => <option key={width} value={width}>{width}px</option>)}
            </select>
          </label>

          <Toggle label="Light mode" checked={light} onChange={setLight} />
          <Toggle label="RTL" checked={rtl} onChange={setRtl} />
          <Toggle label="200% text" checked={text200} onChange={setText200} />
          <Toggle label="High contrast" checked={highContrast} onChange={setHighContrast} />
          <Toggle label="Reduced motion" checked={reducedMotion} onChange={setReducedMotion} />
        </section>

        <section className={light ? "light overflow-x-auto rounded-xl bg-background p-3 text-foreground" : "dark overflow-x-auto rounded-xl bg-background p-3 text-foreground"} data-reduced-motion={reducedMotion ? "true" : "false"}>
          {reducedMotion ? (
            <style>{`[data-reduced-motion="true"] *, [data-reduced-motion="true"] *::before, [data-reduced-motion="true"] *::after { animation-duration: 0.001ms !important; animation-iteration-count: 1 !important; transition-duration: 0.001ms !important; scroll-behavior: auto !important; }`}</style>
          ) : null}
          <PersonalityQaPreview
            personality={personality}
            fixture={fixture}
            surface={surface}
            viewport={viewport}
            textScale={text200 ? 2 : 1}
            rtl={rtl}
            highContrast={highContrast}
          />
        </section>

        <section className="data-panel grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4" aria-label="Source metadata">
          <Meta label="Source" value={source.sourceName} />
          <Meta label="Pinned version" value={source.version || source.pinnedRef?.slice(0, 12) || "Pinned external source"} />
          <Meta label="License" value={source.license} />
          <Meta label="Composition" value={source.compositionFamily} />
          <Meta label="Flag max desktop" value={`${source.flag.desktop[0]}×${source.flag.desktop[1]}`} />
          <Meta label="Flag max mobile" value={`${source.flag.mobile[0]}×${source.flag.mobile[1]}`} />
          <Meta label="Source divergence" value={divergence.budgetStatus === "approved" ? "Approved" : "Classified · visual budget review pending"} />
          <Meta label="QA status" value="Lab-ready · human approval pending" />
        </section>

        <section className="data-panel p-4" aria-label="Source divergence decisions">
          <div className="grid gap-4 lg:grid-cols-4">
            <DivergenceList label="KEEP" values={divergence.keep} />
            <DivergenceList label="REMAP" values={divergence.remap} />
            <DivergenceList label="REMOVE FOR SAFETY" values={divergence.removeForSafety} />
            <DivergenceList label="SOLARIS ADD" values={divergence.solarisAdd} />
          </div>
          <p className="mt-4 border-t border-border/60 pt-3 text-xs leading-relaxed text-muted-foreground">
            {divergence.note} Structural and visual replacement percentages are intentionally not fabricated; approval is recorded only after rendered source-vs-Solaris review.
          </p>
        </section>
      </div>
    </AppShell>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <label className="flex min-h-11 items-center justify-between gap-3 rounded-lg border border-border bg-background px-3 text-sm font-medium">
      {label}
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
    </label>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return <div><p className="text-[10px] font-semibold uppercase tracking-[.1em] text-muted-foreground">{label}</p><p className="mt-1 break-words text-sm font-medium">{value}</p></div>;
}

function DivergenceList({ label, values }: { label: string; values: readonly string[] }) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-[.1em] text-muted-foreground">{label}</p>
      <ul className="mt-2 space-y-1.5 text-xs leading-relaxed">
        {values.map((value) => <li key={value}>• {value}</li>)}
      </ul>
    </div>
  );
}
