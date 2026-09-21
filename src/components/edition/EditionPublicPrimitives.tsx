import { useEffect, useRef, useState, type ReactNode } from "react";

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
  const available = items.filter((item) => item.available !== false);
  const [active, setActive] = useState(available[0]?.href ?? "");
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);
  const primary = available.length > 4 ? available.slice(0, 3) : available;
  const secondary = available.length > 4 ? available.slice(3) : [];

  useEffect(() => {
    const sections = available.map((item) => document.getElementById(item.href.slice(1))).filter((node): node is HTMLElement => !!node);
    if (!sections.length) return;
    const update = () => {
      const threshold = window.innerWidth < 768 ? 150 : 125;
      const current = [...sections].reverse().find((node) => node.getBoundingClientRect().top <= threshold) ?? sections[0];
      setActive(`#${current.id}`);
    };
    const observer = new IntersectionObserver(update, { rootMargin: "-120px 0px -70% 0px", threshold: 0 });
    sections.forEach((node) => observer.observe(node));
    window.addEventListener("scroll", update, { passive: true });
    update();
    return () => { observer.disconnect(); window.removeEventListener("scroll", update); };
  }, [items]);

  useEffect(() => {
    if (!moreOpen) return;
    const close = (event: PointerEvent) => {
      if (!moreRef.current?.contains(event.target as Node)) setMoreOpen(false);
    };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") setMoreOpen(false); };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", close); document.removeEventListener("keydown", escape); };
  }, [moreOpen]);

  const link = (item: (typeof available)[number]) => (
    <a key={item.href} href={item.href} aria-current={active === item.href ? "location" : undefined} onClick={() => { setActive(item.href); setMoreOpen(false); }}>{item.label}</a>
  );

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
      <div className="edition-navigation-desktop">{available.map(link)}</div>
      <div className="edition-navigation-mobile">
        {primary.map(link)}
        {secondary.length ? <div className="edition-navigation-more" ref={moreRef}>
          <button type="button" aria-expanded={moreOpen} aria-controls="edition-navigation-more-panel" aria-current={secondary.some((item) => item.href === active) ? "location" : undefined} onClick={() => setMoreOpen((value) => !value)}>More <span aria-hidden="true">⌄</span></button>
          {moreOpen ? <div id="edition-navigation-more-panel" className="edition-navigation-more-panel">{secondary.map(link)}</div> : null}
        </div> : null}
      </div>
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
