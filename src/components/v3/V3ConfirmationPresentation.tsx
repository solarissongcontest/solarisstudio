import type { ReactNode } from "react";

import "./V3ConfirmationPresentation.css";

const WORKFLOW_PHASES = [
  {
    label: "Identity",
    detail: "Delegation and participation",
  },
  {
    label: "Plan",
    detail: "Selection method",
  },
  {
    label: "Entry",
    detail: "Song, media and release",
  },
  {
    label: "Review",
    detail: "Checks and authoritative submit",
  },
] as const;

/**
 * V3 owns presentation only. The children remain the canonical Confirmation
 * engine, so validation, autosave, duplicate detection and submission authority
 * cannot drift into a second mobile-only implementation.
 */
export function V3ConfirmationPresentation({ children }: { children: ReactNode }) {
  return (
    <section
      className="v3-confirmation-presentation"
      data-v3-confirmation-presentation=""
      aria-label="Confirmation workflow"
    >
      <ol className="v3-confirmation-workflow" aria-label="Confirmation workflow overview">
        {WORKFLOW_PHASES.map((phase, index) => (
          <li key={phase.label} className="v3-confirmation-workflow-phase">
            <span className="v3-confirmation-workflow-index" aria-hidden="true">
              {index + 1}
            </span>
            <span className="min-w-0">
              <strong>{phase.label}</strong>
              <span>{phase.detail}</span>
            </span>
          </li>
        ))}
      </ol>

      <div className="v3-confirmation-engine" data-v3-confirmation-shared-engine="">
        {children}
      </div>
    </section>
  );
}
