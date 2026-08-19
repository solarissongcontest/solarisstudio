import type { CSSProperties } from "react";

import type {
  CountryMedia,
  CountryProfile,
  CountryProfileSection,
} from "@/lib/country-account";
import {
  autoFactRows,
  normalizeCountryPageSection,
  sectionVisibleOn,
  type CountryPageSection,
} from "@/lib/country-page-builder";
import type { Country } from "@/lib/data";

export function CountryCustomSections({
  country,
  profile,
  sections,
  media,
  surface,
}: {
  country: Country;
  profile?: CountryProfile | null;
  sections: CountryProfileSection[] | CountryPageSection[];
  media: CountryMedia[];
  surface: "country" | "wiki";
}) {
  const visible = (sections as CountryPageSection[])
    .map(normalizeCountryPageSection)
    .filter((section) => sectionVisibleOn(section, surface))
    .sort((a, b) => a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at));

  if (!visible.length) return null;

  return (
    <div className="space-y-4" data-country-custom-sections={surface}>
      {visible.map((section) => (
        <CountryCustomSection
          key={section.id}
          country={country}
          profile={profile}
          section={section}
          media={media}
          surface={surface}
        />
      ))}
    </div>
  );
}

function CountryCustomSection({
  country,
  profile,
  section,
  media,
  surface,
}: {
  country: Country;
  profile?: CountryProfile | null;
  section: ReturnType<typeof normalizeCountryPageSection>;
  media: CountryMedia[];
  surface: "country" | "wiki";
}) {
  if (section.section_type === "divider") {
    return (
      <div className="py-3" aria-hidden="true">
        <div className="h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent" />
      </div>
    );
  }

  const style = section.background_tint
    ? ({ backgroundColor: `${section.background_tint}d9` } as CSSProperties)
    : undefined;
  const wrapperClass = surface === "wiki"
    ? "min-w-0 rounded-2xl border border-border/70 bg-surface/60 p-4 sm:p-5"
    : "glass min-w-0 overflow-hidden p-4 sm:p-5";

  if (section.section_type === "quote") {
    return (
      <section className={wrapperClass} style={style}>
        {section.kicker && <Kicker>{section.kicker}</Kicker>}
        {section.heading && <h2 className="font-display text-xl font-semibold">{section.heading}</h2>}
        <blockquote className="mt-3 border-l-2 border-primary/50 pl-4 font-display text-lg italic leading-8 text-foreground sm:text-xl">
          {section.body}
        </blockquote>
      </section>
    );
  }

  if (section.section_type === "facts") {
    const rows = autoFactRows(profile);
    return (
      <section className={wrapperClass} style={style}>
        {section.kicker && <Kicker>{section.kicker}</Kicker>}
        <h2 className="font-display text-xl font-semibold">{section.heading || "Quick facts"}</h2>
        {rows.length ? (
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {rows.map((row) => (
              <div key={row.label} className="rounded-xl border border-border/60 bg-background/20 p-3">
                <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-muted-foreground">{row.label}</p>
                <p className="mt-1 break-words text-sm font-semibold">{row.value}</p>
              </div>
            ))}
          </div>
        ) : <p className="mt-3 text-sm text-muted-foreground">No national facts have been published for this block yet.</p>}
      </section>
    );
  }

  if (section.section_type === "gallery") {
    return (
      <section className={wrapperClass} style={style}>
        {section.kicker && <Kicker>{section.kicker}</Kicker>}
        <h2 className="font-display text-xl font-semibold">{section.heading || "Gallery"}</h2>
        {media.length ? (
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {media.map((item) => (
              <figure key={item.id} className="overflow-hidden rounded-xl bg-background/20">
                <img src={item.public_url} alt={item.alt_text || item.caption || `${country.name} gallery image`} loading="lazy" className="aspect-[4/3] w-full object-cover" />
                {item.caption && <figcaption className="p-2 text-[10px] leading-4 text-muted-foreground">{item.caption}</figcaption>}
              </figure>
            ))}
          </div>
        ) : <p className="mt-3 text-sm text-muted-foreground">No gallery images have been published yet.</p>}
      </section>
    );
  }

  const hasImage = Boolean(section.image_url);
  const imageFirst = section.image_layout === "left";
  const sideBySide = hasImage && ["split", "left", "right"].includes(section.image_layout);
  const full = hasImage && section.image_layout === "full";
  const content = (
    <div className={sideBySide ? "min-w-0" : ""}>
      {section.kicker && <Kicker>{section.kicker}</Kicker>}
      {section.heading && <h2 className="font-display text-xl font-semibold sm:text-2xl">{section.heading}</h2>}
      {section.body && <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-muted-foreground">{section.body}</p>}
    </div>
  );
  const image = hasImage ? (
    <figure className={full ? "-mx-4 -mt-4 mb-4 sm:-mx-5 sm:-mt-5" : "min-w-0"}>
      <img
        src={section.image_url ?? ""}
        alt={section.image_caption || `${country.name} section image`}
        loading="lazy"
        className={full ? "max-h-[520px] w-full object-cover" : section.image_layout === "wide" ? "mt-4 max-h-[420px] w-full rounded-xl object-cover" : "max-h-80 w-full rounded-xl object-cover"}
      />
      {section.image_caption && <figcaption className={`${full ? "px-4 sm:px-5" : ""} mt-2 text-[10px] leading-4 text-muted-foreground`}>{section.image_caption}</figcaption>}
    </figure>
  ) : null;

  return (
    <section className={wrapperClass} style={style}>
      {full ? image : null}
      {sideBySide ? (
        <div className="grid gap-4 md:grid-cols-2 md:items-start">
          {imageFirst ? image : content}
          {imageFirst ? content : image}
        </div>
      ) : (
        <>
          {content}
          {!full ? image : null}
        </>
      )}
    </section>
  );
}

function Kicker({ children }: { children: string }) {
  return <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.17em] text-primary">{children}</p>;
}
