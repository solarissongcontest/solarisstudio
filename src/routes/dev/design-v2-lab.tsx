import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";

import { AppShell } from "@/components/AppShell";
import { CountryDesignV2Hero } from "@/components/country/CountryDesignV2Hero";
import { CountryDesignV2Styles } from "@/components/country/CountryDesignV2Styles";
import {
  COUNTRY_ACCENT_OPTIONS,
  COUNTRY_CONTENT_LAYOUT_OPTIONS,
  COUNTRY_HERO_V2_OPTIONS,
  COUNTRY_SURFACE_OPTIONS,
  countryDesignCssVariables,
  countryDesignFontCss,
  defaultCountryDesignV2,
  type CountryDesignV2,
} from "@/lib/country-design-v2";

export const Route = createFileRoute("/dev/design-v2-lab")({
  head: () => ({ meta: [{ title: "Country Design V2 Lab — Solaris Studio" }] }),
  component: CountryDesignV2Lab,
});

const VIEWPORTS = [320, 360, 390, 430, 768, 1024, 1440] as const;

function CountryDesignV2Lab() {
  const [surface, setSurface] = useState<CountryDesignV2["surface"]>("glass");
  const [hero, setHero] = useState<CountryDesignV2["hero"]["layout"]>("centered");
  const [layout, setLayout] = useState<CountryDesignV2["content"]["defaultLayout"]>("magazine");
  const [accent, setAccent] = useState<CountryDesignV2["accent"]>("soft");
  const [motion, setMotion] = useState<CountryDesignV2["motion"]>("subtle");
  const [viewport, setViewport] = useState<number>(390);
  const [longName, setLongName] = useState(false);
  const [highContrast, setHighContrast] = useState(false);

  const design = useMemo(() => {
    const base = defaultCountryDesignV2();
    return {
      ...base,
      surface,
      hero: { ...base.hero, layout, alignment: hero === "centered" ? "center" : "left" },
      content: { defaultLayout: layout },
      accent,
      motion,
    } satisfies CountryDesignV2;
  }, [surface, hero, layout, accent, motion]);

  return (
    <>
      <CountryDesignV2Styles />
      <AppShell>
        <header className="data-panel p-5">
          <p className="text-xs font-semibold uppercase tracking-[.12em] text-muted-foreground">Design QA</p>
          <h1 className="mt-2 text-3xl font-bold">Country Design V2 Lab</h1>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground">
            Stress independent surfaces, hero layouts, content compositions and accessibility states without changing a real country.
          </p>
        </header>

        <section className="data-panel mt-4 grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
          <Control label="Surface" value={surface} onChange={(value) => setSurface(value as CountryDesignV2["surface"])} options={COUNTRY_SURFACE_OPTIONS} />
          <Control label="Hero" value={hero} onChange={(value) => setHero(value as CountryDesignV2["hero"]["layout"])} options={COUNTRY_HERO_V2_OPTIONS} />
          <Control label="Content" value={layout} onChange={(value) => setLayout(value as CountryDesignV2["content"]["defaultLayout"])} options={COUNTRY_CONTENT_LAYOUT_OPTIONS} />
          <Control label="Accent" value={accent} onChange={(value) => setAccent(value as CountryDesignV2["accent"])} options={COUNTRY_ACCENT_OPTIONS} />
          <Control label="Motion" value={motion} onChange={(value) => setMotion(value as CountryDesignV2["motion"])} options={[{ id: "subtle", label: "Subtle" }, { id: "medium", label: "Medium" }, { id: "heavy", label: "Heavy" }]} />
          <Control label="Viewport" value={String(viewport)} onChange={(value) => setViewport(Number(value))} options={VIEWPORTS.map((id) => ({ id: String(id), label: `${id}px` }))} />
          <Toggle label="Hostile long name" checked={longName} onChange={setLongName} />
          <Toggle label="High contrast" checked={highContrast} onChange={setHighContrast} />
        </section>

        <section className={highContrast ? "mt-4 contrast-150" : "mt-4"}>
          <div className="mx-auto overflow-x-auto rounded-xl border border-border bg-background/50 p-2" style={{ width: "100%" }}>
            <div
              className="country-design-v2"
              data-country-surface={design.surface}
              data-country-accent={design.accent}
              data-country-motion={design.motion}
              data-country-default-layout={design.content.defaultLayout}
              style={{ ...countryDesignCssVariables(design), width: `${viewport}px`, maxWidth: "100%" }}
              data-design-v2-lab-preview
            >
              {countryDesignFontCss(design) ? <style>{countryDesignFontCss(design)}</style> : null}
              <CountryDesignV2Hero
                design={design}
                code="QA"
                name={longName ? "The Federated Commonwealth of Extremely Long Country Naming Conventions" : "Solaris QA"}
                nativeName={longName ? "An Even Longer Native Country Name Used For Stress Testing" : "Solaris"}
                region="Terra Solaris"
                description="A hostile but factual fixture used to verify reflow, content hierarchy, flags and actions across the new independent design axes."
                flagImage="/personality-qa-flag.svg"
                actions={<><button type="button">Wiki</button><button type="button">Compare</button><button type="button">Follow</button></>}
              />
              <section
                className="country-personality-card mt-4 p-5"
                data-country-section-layout={layout}
                data-country-section-emphasis="normal"
              >
                <p className="text-xs font-semibold uppercase tracking-[.12em] text-primary">Content layout</p>
                <h2 className="mt-2 text-2xl font-semibold">{COUNTRY_CONTENT_LAYOUT_OPTIONS.find((item) => item.id === layout)?.label}</h2>
                <p className="mt-3 text-sm leading-7 text-muted-foreground">
                  This section intentionally uses the same page-wide surface material as the hero while changing only composition and emphasis.
                </p>
              </section>
            </div>
          </div>
        </section>
      </AppShell>
    </>
  );
}

function Control({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: readonly { id: string; label: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="grid gap-1 text-xs font-semibold">
      {label}
      <select value={value} onChange={(event) => onChange(event.target.value)} className="min-h-11 rounded-xl border border-border bg-background px-3 text-sm">
        {options.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
      </select>
    </label>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <label className="flex min-h-11 items-center justify-between gap-3 rounded-xl border border-border bg-background px-3 text-xs font-semibold">
      {label}
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
    </label>
  );
}
