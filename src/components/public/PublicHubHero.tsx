import type { ReactNode } from "react";

export function PublicHubHero({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow: string;
  title: string;
  description: string;
  actions?: ReactNode;
}) {
  return (
    <header className="public-hub-hero">
      <div className="min-w-0">
        <p className="public-hub-eyebrow">{eyebrow}</p>
        <h1 className="public-hub-title">{title}</h1>
        <p className="public-hub-description">{description}</p>
      </div>
      {actions ? <div className="public-hub-actions">{actions}</div> : null}
    </header>
  );
}
