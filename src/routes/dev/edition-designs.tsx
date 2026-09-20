import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";

import { AppShell } from "@/components/AppShell";
import {
  EditionHero,
  EditionNavigation,
  EditionQuickFacts,
  EditionSection,
} from "@/components/edition/EditionPublicPrimitives";
import { EditionPublicStyles } from "@/components/EditionPublicStyles";
import {
  EDITION_DESIGN_FIXTURES,
  EDITION_PUBLIC_STYLES,
  type EditionPublicStyle,
} from "@/lib/edition-public-design";

export const Route = createFileRoute("/dev/edition-designs")({
  head: () => ({ meta: [{ title: "Edition Design Lab — Solaris Studio" }] }),
  component: EditionDesignLab,
});

const VIEWPORTS = [320, 390, 768, 1024, 1440] as const;

function EditionDesignLab() {
  const [style, setStyle] = useState<EditionPublicStyle>("cinematic");
  const [fixtureId, setFixtureId] = useState<(typeof EDITION_DESIGN_FIXTURES)[number]["id"]>("a");
  const [viewport, setViewport] = useState<number>(1024);
  const [reducedTransparency, setReducedTransparency] = useState(false);
  const fixture = useMemo(() => EDITION_DESIGN_FIXTURES.find((item) => item.id === fixtureId)!, [fixtureId]);

  useEffect(() => {
    const body = document.body;
    const previousTheme = body.dataset.entityTheme;
    const previousStyle = body.dataset.editionPublicStyle;
    body.dataset.entityTheme = "edition";
    body.dataset.editionPublicStyle = style;
    body.style.setProperty("--edition-public-radius", style === "editorial" || style === "minimal" ? "0px" : "24px");
    body.style.setProperty("--edition-hero-glow", ".72");
    body.style.setProperty("--edition-surface-strength", ".82");
    body.style.setProperty("--edition-focal-x", "50%");
    body.style.setProperty("--edition-focal-y", "50%");
    return () => {
      if (previousTheme) body.dataset.entityTheme = previousTheme; else delete body.dataset.entityTheme;
      if (previousStyle) body.dataset.editionPublicStyle = previousStyle; else delete body.dataset.editionPublicStyle;
      ["--edition-public-radius", "--edition-hero-glow", "--edition-surface-strength", "--edition-focal-x", "--edition-focal-y"].forEach((key) => body.style.removeProperty(key));
    };
  }, [style]);

  const title = fixture.id === "c"
    ? "The Grand Solaris Song Celebration of the Northern Constellations"
    : fixture.id === "d" ? "SSC 0" : "SSC 42";
  const entries = Array.from({ length: Math.min(fixture.entries, 12) }, (_, index) => ({
    country: ["Asteria", "Borealis", "Crastao", "Demeria", "Elarion", "Fjordland"][index % 6],
    song: `Archive song ${index + 1}`,
  }));

  return <>
    <EditionPublicStyles />
    <AppShell>
      <header className="data-panel p-5">
        <p className="text-xs font-semibold uppercase tracking-[.12em] text-muted-foreground">Internal design QA</p>
        <h1 className="mt-2 text-3xl font-bold">Edition design lab</h1>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground">Every persisted design, hostile archive fixture and target viewport in one deterministic surface.</p>
      </header>
      <section className="data-panel mt-4 grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
        <Control label="Design" value={style} onChange={(value) => setStyle(value as EditionPublicStyle)} options={EDITION_PUBLIC_STYLES.map((item) => ({ id: item.id, label: item.label }))} />
        <Control label="Fixture" value={fixtureId} onChange={(value) => setFixtureId(value as typeof fixtureId)} options={EDITION_DESIGN_FIXTURES.map((item) => ({ id: item.id, label: `${item.id.toUpperCase()} · ${item.label}` }))} />
        <Control label="Viewport" value={String(viewport)} onChange={(value) => setViewport(Number(value))} options={VIEWPORTS.map((item) => ({ id: String(item), label: `${item}px` }))} />
        <label className="flex min-h-11 items-center justify-between gap-3 rounded-xl border border-border bg-background px-3 text-xs font-semibold">Reduce transparency<input type="checkbox" checked={reducedTransparency} onChange={(event) => setReducedTransparency(event.target.checked)} /></label>
      </section>
      <div className={`mt-4 overflow-x-auto border border-border bg-background/40 p-2 ${reducedTransparency ? "[&_.edition-navigation]:!backdrop-blur-none" : ""}`}>
        <div data-edition-lab-frame style={{ width: `${viewport}px`, maxWidth: "100%", containerType: "inline-size" }} className="mx-auto">
          <main className="edition-public-page" data-edition-design-lab>
            <EditionHero
              eyebrow={fixture.id === "c" ? "The Free Metropolitan District of Saint Solaris-upon-Aurora" : "Port Aurora"}
              title={title}
              subtitle="Light Across The Water"
              description={fixture.id === "d" ? null : "A deterministic archive fixture for artwork, typography, result and participant stress testing."}
              artwork={fixture.artwork ? "/solaris-studio-social.jpg" : null}
              artworkAlt="Abstract edition artwork fixture"
              status={<span className="rounded-full border border-current px-3 py-1 text-[10px] font-bold uppercase tracking-wider">Archive</span>}
              winner={fixture.results ? <div className="edition-winner-identity"><span className="grid size-12 place-items-center rounded-full bg-primary text-primary-foreground">★</span><div><p className="edition-kicker">Winner</p><p className="edition-winner-name">Asteria</p><p className="edition-winner-points">412 points</p></div></div> : null}
            />
            <EditionNavigation label="Fixture navigation" items={[{ href: "#lab-overview", label: "Overview" }, { href: "#lab-entries", label: "Entries", available: fixture.entries > 0 }, { href: "#lab-results", label: "Results", available: fixture.results }, { href: "#lab-shows", label: "Shows" }]} />
            <div id="lab-overview"><EditionQuickFacts facts={[{ label: "Edition", value: "SSC 42" }, { label: "Countries", value: fixture.entries || "—" }, { label: "Semi-finals", value: fixture.entries ? 2 : "—" }, { label: "Finalists", value: fixture.results ? 26 : "—" }]} /></div>
            {entries.length ? <EditionSection id="lab-entries" eyebrow="Listen to the edition" title="Revealed entries" description="Public-safe entry fixture." meta={`${fixture.entries} entries`}><div className="edition-entry-grid">{entries.map((entry, index) => <article className="edition-entry" key={`${entry.country}-${index}`}><p className="edition-kicker">{entry.country}</p><h3 className="mt-2 font-semibold">{entry.song}</h3><p className="mt-1 text-xs text-muted-foreground">Fixture Artist</p></article>)}</div></EditionSection> : null}
            {fixture.results ? <EditionSection id="lab-results" eyebrow="Grand Final" title="Results"><div className="edition-ranking"><ol>{entries.slice(0, 5).map((entry, index) => <li className="edition-ranking-row" key={entry.country}><span>#{index + 1}</span><span>◆</span><strong>{entry.country}</strong><span>{412 - index * 27}</span></li>)}</ol></div></EditionSection> : null}
            <EditionSection id="lab-shows" eyebrow="SSC 42" title="Shows"><div className="edition-show-list">{["Semi-Final One", "Semi-Final Two", "Grand Final"].map((show) => <a className="edition-show-row" href="#lab-shows" key={show}><p className="edition-kicker">Show</p><h3 className="mt-1 text-lg font-bold">{show}</h3></a>)}</div></EditionSection>
          </main>
        </div>
      </div>
    </AppShell>
  </>;
}

function Control({ label, value, options, onChange }: { label: string; value: string; options: readonly { id: string; label: string }[]; onChange: (value: string) => void }) {
  return <label className="grid gap-1 text-xs font-semibold">{label}<select value={value} onChange={(event) => onChange(event.target.value)} className="min-h-11 rounded-xl border border-border bg-background px-3 text-sm">{options.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}</select></label>;
}
