import type { ReactNode } from "react";

import { AtlasMapModule } from "@/components/country/AtlasMapModule";
import type { CountryGeography } from "@/lib/country-semantic-model";
import type { CountryHeroLayout } from "@/lib/visual-theme";

export type PersonalityHeroRendererProps = {
  personality: CountryHeroLayout;
  code: string;
  name: string;
  nativeName?: string | null;
  region?: string | null;
  description?: string | null;
  eyebrow: string;
  actions?: ReactNode;
  flag: ReactNode;
  geography?: CountryGeography | null;
};

function MetaLine({
  nativeName,
  name,
  region,
}: Pick<PersonalityHeroRendererProps, "nativeName" | "name" | "region">) {
  const values = [nativeName && nativeName !== name ? nativeName : null, region].filter(Boolean);
  return values.length ? <p className="country-hero-meta" dir="auto">{values.join(" · ")}</p> : null;
}

function Description({ children }: { children?: string | null }) {
  return children ? <p className="country-hero-description" dir="auto">{children}</p> : null;
}

function StandardCopy({
  eyebrow,
  region,
  name,
  nativeName,
  description,
}: Pick<PersonalityHeroRendererProps, "eyebrow" | "region" | "name" | "nativeName" | "description">) {
  return (
    <div className="country-hero-copy">
      <p className="country-hero-eyebrow">{eyebrow}{region ? ` · ${region}` : ""}</p>
      <h1 className="country-hero-title" dir="auto">{name}</h1>
      <MetaLine nativeName={nativeName} name={name} region={region} />
      <Description>{description}</Description>
    </div>
  );
}

function Actions({ children }: { children?: ReactNode }) {
  return children ? <div className="country-hero-actions">{children}</div> : null;
}

function GenericRenderer(props: PersonalityHeroRendererProps) {
  return (
    <div className="country-hero-layout country-personality-composition country-composition-generic">
      <StandardCopy {...props} />
      <div className="country-hero-flag-zone">{props.flag}</div>
      <Actions>{props.actions}</Actions>
    </div>
  );
}

function GlassRenderer(props: PersonalityHeroRendererProps) {
  return (
    <div className="country-hero-layout country-personality-composition country-composition-glass">
      <div className="country-hero-copy">
        <p className="country-hero-eyebrow">{props.eyebrow}{props.region ? ` · ${props.region}` : ""}</p>
        <h1 className="country-hero-title" dir="auto">{props.name}</h1>
        <MetaLine nativeName={props.nativeName} name={props.name} region={props.region} />
      </div>
      <div className="country-hero-flag-zone">{props.flag}</div>
      <Description>{props.description}</Description>
      <Actions>{props.actions}</Actions>
    </div>
  );
}

function PosterRenderer(props: PersonalityHeroRendererProps) {
  return (
    <div className="country-hero-layout country-personality-composition country-composition-poster">
      <p className="country-poster-index">
        <span>{props.code}</span>
        <span aria-hidden="true">/</span>
        <span>{props.region || "Terra Solaris"}</span>
      </p>
      <div className="country-hero-copy">
        <h1 className="country-hero-title" dir="auto">{props.name}</h1>
        <MetaLine nativeName={props.nativeName} name={props.name} region={props.region} />
        <Description>{props.description}</Description>
      </div>
      <div className="country-hero-flag-zone">{props.flag}</div>
      <Actions>{props.actions}</Actions>
    </div>
  );
}

function MinimalRenderer(props: PersonalityHeroRendererProps) {
  return (
    <div className="country-hero-layout country-personality-composition country-composition-minimal">
      <StandardCopy {...props} />
      <div className="country-hero-flag-zone">{props.flag}</div>
      <Actions>{props.actions}</Actions>
    </div>
  );
}

function RetroRenderer(props: PersonalityHeroRendererProps) {
  return (
    <div className="country-hero-layout country-personality-composition country-composition-retro">
      <div className="country-retro-titlebar" aria-hidden="true">
        <span>Solaris Country Database</span>
        <span className="country-retro-window-controls">_ □ ×</span>
      </div>
      <div className="country-retro-client">
        <StandardCopy {...props} />
        <div className="country-hero-flag-zone">{props.flag}</div>
        <Actions>{props.actions}</Actions>
      </div>
      <div className="country-retro-status" aria-label="Country database status">
        <span>{props.code}</span>
        <span>Ready</span>
      </div>
    </div>
  );
}

function EditorialRenderer(props: PersonalityHeroRendererProps) {
  return (
    <div className="country-hero-layout country-personality-composition country-composition-editorial">
      <StandardCopy {...props} />
      <figure className="country-hero-flag-zone">
        {props.flag}
        <figcaption className="country-editorial-caption">Official flag · {props.code}</figcaption>
      </figure>
      <Actions>{props.actions}</Actions>
    </div>
  );
}

function PassportRenderer(props: PersonalityHeroRendererProps) {
  const native = props.nativeName && props.nativeName !== props.name ? props.nativeName : "—";
  return (
    <div className="country-hero-layout country-personality-composition country-composition-passport">
      <header className="country-passport-header">
        <span>Solaris country record</span>
        <strong>{props.code}</strong>
      </header>
      <div className="country-hero-copy">
        <p className="country-passport-field-label">Country</p>
        <h1 className="country-hero-title" dir="auto">{props.name}</h1>
        <Description>{props.description}</Description>
      </div>
      <dl className="country-passport-fields">
        <div><dt>Region</dt><dd>{props.region || "—"}</dd></div>
        <div><dt>Native name</dt><dd dir="auto">{native}</dd></div>
        <div><dt>Country code</dt><dd>{props.code}</dd></div>
      </dl>
      <div className="country-hero-flag-zone">{props.flag}</div>
      <Actions>{props.actions}</Actions>
    </div>
  );
}

function HeritageRenderer(props: PersonalityHeroRendererProps) {
  return (
    <div className="country-hero-layout country-personality-composition country-composition-heritage">
      <p className="country-archive-label">Country record · {props.code}</p>
      <StandardCopy {...props} />
      <div className="country-hero-flag-zone">{props.flag}</div>
      <dl className="country-archive-fields">
        <div><dt>Reference</dt><dd>{props.code}</dd></div>
        <div><dt>Region</dt><dd>{props.region || "Terra Solaris"}</dd></div>
      </dl>
      <Actions>{props.actions}</Actions>
    </div>
  );
}

function BroadcastRenderer(props: PersonalityHeroRendererProps) {
  return (
    <div className="country-hero-layout country-personality-composition country-composition-broadcast">
      <p className="country-broadcast-channel">{props.eyebrow}</p>
      <div className="country-hero-copy">
        <p className="country-hero-eyebrow">{props.region || "Terra Solaris"}</p>
        <h1 className="country-hero-title" dir="auto">{props.name}</h1>
        <MetaLine nativeName={props.nativeName} name={props.name} region={null} />
        <Description>{props.description}</Description>
      </div>
      <div className="country-hero-flag-zone">{props.flag}</div>
      <Actions>{props.actions}</Actions>
    </div>
  );
}

function AtlasRenderer(props: PersonalityHeroRendererProps) {
  return (
    <div className="country-hero-layout country-personality-composition country-composition-atlas">
      <div className="country-atlas-map">
        <AtlasMapModule countryName={props.name} region={props.region} geography={props.geography} />
      </div>
      <div className="country-atlas-record">
        <StandardCopy {...props} />
        <div className="country-hero-flag-zone">{props.flag}</div>
        <Actions>{props.actions}</Actions>
      </div>
    </div>
  );
}

function DiplomaticRenderer(props: PersonalityHeroRendererProps) {
  return (
    <div className="country-hero-layout country-personality-composition country-composition-diplomatic">
      <StandardCopy {...props} />
      <dl className="country-diplomatic-summary">
        <div><dt>Country code</dt><dd>{props.code}</dd></div>
        <div><dt>Region</dt><dd>{props.region || "Terra Solaris"}</dd></div>
      </dl>
      <div className="country-hero-flag-zone">{props.flag}</div>
      <Actions>{props.actions}</Actions>
    </div>
  );
}

function FestivalRenderer(props: PersonalityHeroRendererProps) {
  return (
    <div className="country-hero-layout country-personality-composition country-composition-festival">
      <div className="country-festival-kicker">{props.region || "Terra Solaris"}</div>
      <div className="country-hero-copy">
        <h1 className="country-hero-title" dir="auto">{props.name}</h1>
        <MetaLine nativeName={props.nativeName} name={props.name} region={null} />
        <Description>{props.description}</Description>
      </div>
      <div className="country-hero-flag-zone">{props.flag}</div>
      <Actions>{props.actions}</Actions>
    </div>
  );
}

function BrutalistRenderer(props: PersonalityHeroRendererProps) {
  return (
    <div className="country-hero-layout country-personality-composition country-composition-brutalist">
      <div className="country-brutalist-code">{props.code}</div>
      <div className="country-hero-copy">
        <p className="country-hero-eyebrow">{props.region || props.eyebrow}</p>
        <h1 className="country-hero-title" dir="auto">{props.name}</h1>
        <Description>{props.description}</Description>
      </div>
      <div className="country-hero-flag-zone">{props.flag}</div>
      <Actions>{props.actions}</Actions>
    </div>
  );
}

function LuxuryRenderer(props: PersonalityHeroRendererProps) {
  return (
    <div className="country-hero-layout country-personality-composition country-composition-luxury">
      <p className="country-hero-eyebrow">{props.eyebrow}{props.region ? ` · ${props.region}` : ""}</p>
      <h1 className="country-hero-title" dir="auto">{props.name}</h1>
      <MetaLine nativeName={props.nativeName} name={props.name} region={props.region} />
      <div className="country-hero-flag-zone">{props.flag}</div>
      <Description>{props.description}</Description>
      <Actions>{props.actions}</Actions>
    </div>
  );
}

function NewspaperRenderer(props: PersonalityHeroRendererProps) {
  return (
    <div className="country-hero-layout country-personality-composition country-composition-newspaper">
      <header className="country-newspaper-masthead">
        <span>Terra Solaris</span>
        <span>{props.region || "World"}</span>
      </header>
      <div className="country-hero-copy">
        <h1 className="country-hero-title" dir="auto">{props.name}</h1>
        <MetaLine nativeName={props.nativeName} name={props.name} region={null} />
        <Description>{props.description}</Description>
      </div>
      <div className="country-hero-flag-zone">{props.flag}</div>
      <Actions>{props.actions}</Actions>
    </div>
  );
}

function ScientificRenderer(props: PersonalityHeroRendererProps) {
  return (
    <div className="country-hero-layout country-personality-composition country-composition-scientific">
      <p className="country-scientific-reference">COUNTRY / {props.code}</p>
      <div className="country-hero-copy">
        <h1 className="country-hero-title" dir="auto">{props.name}</h1>
        <Description>{props.description}</Description>
      </div>
      <dl className="country-scientific-data">
        <div><dt>Region</dt><dd>{props.region || "—"}</dd></div>
        <div><dt>Native name</dt><dd dir="auto">{props.nativeName && props.nativeName !== props.name ? props.nativeName : "—"}</dd></div>
        <div><dt>Code</dt><dd>{props.code}</dd></div>
      </dl>
      <div className="country-hero-flag-zone">{props.flag}</div>
      <Actions>{props.actions}</Actions>
    </div>
  );
}

function CivicRenderer(props: PersonalityHeroRendererProps) {
  return (
    <div className="country-hero-layout country-personality-composition country-composition-civic">
      <p className="country-civic-band">Official country profile</p>
      <StandardCopy {...props} />
      <div className="country-hero-flag-zone">{props.flag}</div>
      <Actions>{props.actions}</Actions>
    </div>
  );
}

function AvantGardeRenderer(props: PersonalityHeroRendererProps) {
  return (
    <div className="country-hero-layout country-personality-composition country-composition-avant">
      <p className="country-avant-index">{props.code}</p>
      <p className="country-avant-region">{props.region || "Terra Solaris"}</p>
      <h1 className="country-hero-title" dir="auto">{props.name}</h1>
      <div className="country-hero-flag-zone">{props.flag}</div>
      <div className="country-avant-copy">
        <MetaLine nativeName={props.nativeName} name={props.name} region={null} />
        <Description>{props.description}</Description>
      </div>
      <Actions>{props.actions}</Actions>
    </div>
  );
}

export function PersonalityHeroRenderer(props: PersonalityHeroRendererProps) {
  switch (props.personality) {
    case "glass-card": return <GlassRenderer {...props} />;
    case "poster": return <PosterRenderer {...props} />;
    case "minimal": return <MinimalRenderer {...props} />;
    case "sci-fi": return <RetroRenderer {...props} />;
    case "editorial": return <EditorialRenderer {...props} />;
    case "passport": return <PassportRenderer {...props} />;
    case "heritage": return <HeritageRenderer {...props} />;
    case "broadcast": return <BroadcastRenderer {...props} />;
    case "panorama": return <AtlasRenderer {...props} />;
    case "classic": return <DiplomaticRenderer {...props} />;
    case "spotlight": return <FestivalRenderer {...props} />;
    case "duotone": return <BrutalistRenderer {...props} />;
    case "monument": return <LuxuryRenderer {...props} />;
    case "newspaper": return <NewspaperRenderer {...props} />;
    case "horizon": return <ScientificRenderer {...props} />;
    case "flag-focus": return <CivicRenderer {...props} />;
    case "ribbon": return <AvantGardeRenderer {...props} />;
    default: return <GenericRenderer {...props} />;
  }
}
