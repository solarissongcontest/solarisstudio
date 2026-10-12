import { Link } from "@tanstack/react-router";
import { ChevronLeft, CircleHelp } from "lucide-react";
import type { ReactNode } from "react";

import type { V3FocusedTaskChrome } from "@/lib/v3-focused-task-chrome";
import { V3FoundationShell } from "./V3Foundation";
import "@/styles/v3-focused-task-shell.css";

export type V3FocusedTaskShellProps = {
  chrome: V3FocusedTaskChrome;
  editionLabel?: string | null;
  statusLabel?: string | null;
  children: ReactNode;
};

/**
 * Focused V3 chrome for critical participant workflows.
 *
 * This component owns presentation only. The caller supplies canonical task
 * chrome from `resolveV3FocusedTaskChrome`; mutation state, workflow truth,
 * back-stack history and submission success remain outside this shell.
 */
export function V3FocusedTaskShell({
  chrome,
  editionLabel,
  statusLabel,
  children,
}: V3FocusedTaskShellProps) {
  const context = [editionLabel?.trim(), statusLabel?.trim()].filter(Boolean) as string[];

  return (
    <V3FoundationShell>
      <div className="v3-focused-task-shell" data-v3-focused-task-shell={chrome.screenId}>
        <header className="v3-focused-task-toolbar">
          <div className="v3-focused-task-toolbar__side v3-focused-task-toolbar__side--start">
            <Link
              to={chrome.backTo as any}
              className="v3-focused-task-toolbar__button v3-focused-task-toolbar__back"
              aria-label={`Back to ${chrome.backLabel}`}
            >
              <ChevronLeft className="size-5" aria-hidden="true" />
              <span>{chrome.backLabel}</span>
            </Link>
          </div>

          <div className="v3-focused-task-toolbar__title-wrap">
            <h1 className="v3-focused-task-toolbar__title">{chrome.title}</h1>
            {context.length ? (
              <p className="v3-focused-task-toolbar__context" aria-label={context.join(", ")}>
                {context.join(" · ")}
              </p>
            ) : null}
          </div>

          <div className="v3-focused-task-toolbar__side v3-focused-task-toolbar__side--end">
            {chrome.helpTo ? (
              <Link
                to={chrome.helpTo as any}
                className="v3-focused-task-toolbar__button v3-focused-task-toolbar__icon"
                aria-label={`Help for ${chrome.title}`}
              >
                <CircleHelp className="size-5" aria-hidden="true" />
              </Link>
            ) : null}
          </div>
        </header>

        <main className="v3-focused-task-content" data-v3-critical-task-content>
          {children}
        </main>
      </div>
    </V3FoundationShell>
  );
}
