import type { ReactNode } from "react";

import { LiquidGlassBackdrop } from "@/components/LiquidGlassBackdrop";
import { cn } from "@/lib/utils";

export function EditionHero({
  eyebrow,
  title,
  subtitle,
  description,
  artwork,
  artworkAlt,
  logo,
  logoAlt,
  liquidGlass = false,
  status,
  winner,
}: {
  eyebrow: string;
  title: string;
  subtitle?: string | null;
  description?: string | null;
  artwork?: string | null;
  artworkAlt: string;
  logo?: string | null;
  logoAlt?: string;
  liquidGlass?: boolean;
  status: ReactNode;
  winner?: ReactNode;
}) {
  const plateImage = logo ?? artwork;
  const plateAlt = logo ? (logoAlt ?? `${title} logo`) : artworkAlt;

  return (
    <header
      className="edition-hero"
      data-has-artwork={artwork ? "true" : "false"}
      data-has-logo={logo ? "true" : "false"}
      data-liquid-glass={liquidGlass ? "true" : undefined}
    >
      {artwork ? (
        <div className="edition-hero-artwork" aria-hidden="true">
          <img src={artwork} alt="" fetchPriority="high" decoding="async" />
        </div>
      ) : null}
      {liquidGlass ? (
        <LiquidGlassBackdrop
          variant="hero"
          className="edition-hero-liquid-glass"
        />
      ) : null}
      <div className="edition-hero-copy">
        <div className="edition-hero-status">{status}</div>
        <p className="edition-kicker">{eyebrow}</p>
        <h1>{title}</h1>
        {subtitle ? <p className="edition-hero-subtitle">{subtitle}</p> : null}
        {description ? <p className="edition-hero-description">{description}</p> : null}
        {winner ? <div className="edition-hero-winner">{winner}</div> : null}
      </div>
      {plateImage ? (
        <figure className="edition-artwork-plate">
          <img
            src={plateImage}
            alt={plateAlt}
            loading="eager"
            decoding="async"
          />
        </figure>
      ) : null}
    </header>
  );
}

export function EditionNavigation({
  label,
  items,
  liquidGlass = false,
}: {
  label: string;
  items: readonly { href: string; label: string; available?: boolean }[];
  liquidGlass?: boolean;
}) {
  return (
    <nav
      className="edition-navigation"
      aria-label={label}
      data-liquid-glass={liquidGlass ? "true" : undefined}
    >
      {liquidGlass ? (
        <LiquidGlassBackdrop
          variant="control"
          className="edition-navigation-liquid-glass"
        />
      ) : null}
      {items.filter((item) => item.available !== false).map((item) => (
        <a key={item.href} href={item.href}>{item.label}</a>
      ))}
    </nav>
  );
}

export function EditionQuickFacts({
  facts,
}: {
  facts: readonly { label: string; value: ReactNode }[];
}) {
  return (
    <dl className="edition-quick-facts" aria-label="Edition quick facts">
      {facts.map((fact) => (
        <div key={fact.label}>
          <dt>{fact.label}</dt>
          <dd>{fact.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function EditionSection({
  id,
  eyebrow,
  title,
  description,
  meta,
  children,
  className,
}: {
  id?: string;
  eyebrow: string;
  title: string;
  description?: string;
  meta?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section id={id} className={cn("edition-section", className)}>
      <header className="edition-section-heading">
        <div>
          <p className="edition-kicker">{eyebrow}</p>
          <h2>{title}</h2>
          {description ? <p>{description}</p> : null}
        </div>
        {meta ? <div className="edition-section-meta">{meta}</div> : null}
      </header>
      {children}
    </section>
  );
}

export function EditionEmptyState({ children }: { children: ReactNode }) {
  return <div className="edition-empty-state"><p>{children}</p></div>;
}
