import { Link } from "@tanstack/react-router";
import { ArrowRight, type LucideIcon } from "lucide-react";

export type PublicSecondaryLink = {
  to: string;
  title: string;
  description: string;
  icon?: LucideIcon;
};

export function PublicSecondaryLinks({
  title,
  eyebrow = "More",
  items,
}: {
  title: string;
  eyebrow?: string;
  items: PublicSecondaryLink[];
}) {
  return (
    <section className="public-hub-section" aria-label={title}>
      <div className="public-hub-section-heading">
        <p className="public-hub-eyebrow is-muted">{eyebrow}</p>
        <h2>{title}</h2>
      </div>
      <div className="public-secondary-links">
        {items.map(({ to, title: itemTitle, description, icon: Icon }) => (
          <Link key={to} to={to as any} className="public-secondary-link group">
            {Icon ? (
              <span className="public-secondary-link-icon">
                <Icon className="size-4" aria-hidden="true" />
              </span>
            ) : null}
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold">{itemTitle}</span>
              <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                {description}
              </span>
            </span>
            <ArrowRight
              className="mt-1 size-3.5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
              aria-hidden="true"
            />
          </Link>
        ))}
      </div>
    </section>
  );
}
