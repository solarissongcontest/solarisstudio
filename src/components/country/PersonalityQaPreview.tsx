import type { CSSProperties } from "react";

import { CountryIdentityHero } from "@/components/country/CountryIdentityHero";
import { type PersonalityFixture } from "@/lib/personality-fixtures";
import type { CountryHeroLayout } from "@/lib/visual-theme";

export type PersonalityPreviewSurface = "country" | "wiki";

export function PersonalityQaPreview({
  personality,
  fixture,
  surface,
  viewport,
  textScale = 1,
  rtl = false,
  highContrast = false,
}: {
  personality: CountryHeroLayout;
  fixture: PersonalityFixture;
  surface: PersonalityPreviewSurface;
  viewport: number;
  textScale?: number;
  rtl?: boolean;
  highContrast?: boolean;
}) {
  return (
    <div
      className="mx-auto overflow-hidden rounded-xl border border-border bg-background"
      style={{
        width: `${viewport}px`,
        flexShrink: 0,
        fontSize: `${textScale}em`,
        filter: highContrast ? "contrast(1.18)" : undefined,
      }}
      dir={rtl ? "rtl" : "ltr"}
      data-personality-qa-preview
      data-preview-surface={surface}
      data-preview-width={viewport}
    >
      <div
        className="country-profile-v8 p-3 sm:p-4"
        data-country-personality={personality}
        style={{ "--solaris-accent": fixture.accentColor } as CSSProperties}
      >
        <CountryIdentityHero
          personality={personality}
          code={fixture.code}
          name={fixture.name}
          nativeName={fixture.nativeName}
          region={fixture.region}
          description={fixture.description}
          flagImage={fixture.flagImage}
          accentColor={fixture.accentColor}
          compact={surface === "wiki"}
          eyebrow={surface === "wiki" ? "Solaris Wiki" : "Terra Solaris"}
          actions={
            <>
              <button type="button">Wiki</button>
              <button type="button">Compare</button>
              <button type="button">Follow</button>
            </>
          }
        />

        {surface === "country" ? (
          <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(14rem,1fr)]">
            <section className="data-panel p-4">
              <p className="text-xs font-semibold uppercase tracking-[.08em] text-muted-foreground">About</p>
              <p className="mt-2 text-sm leading-relaxed">
                {fixture.description || "No description is available for this QA fixture."}
              </p>
            </section>
            <section className="data-panel p-4">
              <p className="text-xs font-semibold uppercase tracking-[.08em] text-muted-foreground">Quick facts</p>
              <dl className="mt-3 space-y-2">
                {(fixture.facts.length ? fixture.facts.slice(0, 4) : [{ label: "Status", value: "No facts" }]).map((fact) => (
                  <div key={fact.label} className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 text-xs">
                    <dt className="text-muted-foreground">{fact.label}</dt>
                    <dd className="text-right font-medium">{fact.value}</dd>
                  </div>
                ))}
              </dl>
            </section>
            <section className="data-panel p-4 lg:col-span-2">
              <p className="text-xs font-semibold uppercase tracking-[.08em] text-muted-foreground">Current entry</p>
              <p className="mt-2 text-sm font-semibold">Aurora Vale · Northern Lights</p>
              <p className="mt-1 text-xs text-muted-foreground">SSC 22 · Published canonical entry</p>
            </section>
          </div>
        ) : (
          <div className="wiki-reading-grid mt-4">
            <aside className="wiki-toc data-panel p-4">
              <p className="text-xs font-semibold uppercase tracking-[.08em]">Contents</p>
              <ol className="mt-2 space-y-1 text-xs text-muted-foreground">
                <li>Introduction</li>
                <li>Solaris Song Contest</li>
                <li>History</li>
              </ol>
            </aside>
            <article className="min-w-0">
              <h2 className="text-xl font-semibold">Introduction</h2>
              <p className="mt-3 max-w-[66ch] text-sm leading-7">
                This deliberately plain paragraph checks that personality intensity fades into long-form reading rather than turning every sentence into a themed component.
              </p>
              <h2 className="mt-6 text-xl font-semibold">Solaris Song Contest</h2>
              <p className="mt-3 max-w-[66ch] text-sm leading-7">
                Article structure stays readable while headings, factual surfaces and metadata retain enough of the selected source grammar to keep the identity coherent.
              </p>
            </article>
            <aside className="wiki-infobox data-panel p-4">
              <p className="text-xs font-semibold uppercase tracking-[.08em]">Quick facts</p>
              <dl className="mt-3 space-y-2">
                {(fixture.facts.length ? fixture.facts.slice(0, 5) : [{ label: "Status", value: "No facts" }]).map((fact) => (
                  <div key={fact.label} className="text-xs">
                    <dt className="text-muted-foreground">{fact.label}</dt>
                    <dd className="mt-0.5 font-medium">{fact.value}</dd>
                  </div>
                ))}
              </dl>
            </aside>
          </div>
        )}
      </div>
    </div>
  );
}
