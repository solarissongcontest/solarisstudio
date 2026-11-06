import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

import "@/styles/v3-web-top-context.css";
import "@/styles/v3-web-high-contrast.css";

/**
 * Website masthead, deliberately distinct from the installed PWA top context.
 * This header stays in normal document flow. On desktop, the existing
 * website-section navigation takes over as the sticky browse control.
 */
export function V3WebTopContext({
  edition,
  phase,
  actions,
}: {
  edition: string;
  phase?: string | null;
  actions?: ReactNode;
}) {
  return (
    <header className="v3-web-top-context" data-v3-website-header="">
      <Link
        to="/"
        aria-label="Solaris Studio home"
        className="v3-web-top-context__brand"
      >
        <span className="v3-web-top-context__brand-main">SOLARIS</span>
        <span className="v3-web-top-context__brand-secondary">STUDIO</span>
      </Link>

      <div
        className="v3-web-top-context__context"
        aria-label={`${edition}${phase ? `, ${phase}` : ""}`}
      >
        <span className="v3-web-top-context__edition">{edition}</span>
        {phase ? (
          <>
            <span aria-hidden="true" className="v3-web-top-context__separator">/</span>
            <span className="v3-web-top-context__phase">{phase}</span>
          </>
        ) : null}
      </div>

      {actions ? <div className="v3-web-top-context__actions">{actions}</div> : null}
    </header>
  );
}
