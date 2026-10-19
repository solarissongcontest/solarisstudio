import { Link } from "@tanstack/react-router";
import { ChevronLeft, CircleHelp } from "lucide-react";
import { useEffect, type ReactNode } from "react";

import {
  clearAppUpdateBlocker,
  setAppUpdateBlocker,
} from "@/lib/app-update-safety";
import type { V3FocusedTaskChrome } from "@/lib/v3-focused-task-chrome";
import { V3FoundationShell } from "./V3Foundation";
import "@/styles/v3-focused-task-shell.css";

export type V3FocusedTaskShellProps = {
  chrome: V3FocusedTaskChrome;
  editionLabel?: string | null;
  statusLabel?: string | null;
  contentWidth?: "standard" | "wide";
  children: ReactNode;
};

/**
 * Shared focused chrome for critical participant workflows.
 *
 * The shell deliberately removes global navigation and page-swipe affordances,
 * keeps canonical exit/help destinations visible, and blocks service-worker
 * activation while the critical workflow is mounted. Feature code still owns
 * draft state, mutation authority, receipts and unsaved-exit confirmation.
 *
 * The toolbar title and content wrapper deliberately do not claim document
 * heading or main-landmark ownership. The route-owned critical-task screen owns
 * the page's single H1 and main landmark, preventing duplicate/nested landmarks.
 */
export function V3FocusedTaskShell({
  chrome,
  editionLabel,
  statusLabel,
  contentWidth = "standard",
  children,
}: V3FocusedTaskShellProps) {
  const context = [editionLabel?.trim(), statusLabel?.trim()].filter(Boolean) as string[];
  const updateBlockerId = `v3-focused-task:${chrome.screenId}`;

  useEffect(() => {
    setAppUpdateBlocker(
      updateBlockerId,
      true,
      `Finish or leave ${chrome.title} before updating Solaris Studio.`,
    );
    return () => clearAppUpdateBlocker(updateBlockerId);
  }, [chrome.title, updateBlockerId]);

  return (
    <V3FoundationShell>
      <div
        className="v3-focused-task-shell"
        data-v3-focused-task-shell={chrome.screenId}
        data-v3-swipe-owner="content"
      >
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
            <p className="v3-focused-task-toolbar__title">{chrome.title}</p>
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

        <div
          className="v3-focused-task-content"
          data-v3-critical-task-content
          data-v3-focused-task-width={contentWidth}
        >
          {children}
        </div>
      </div>
    </V3FoundationShell>
  );
}
