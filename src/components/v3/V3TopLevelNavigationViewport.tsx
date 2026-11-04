import type { ReactNode } from "react";

import { V3TopLevelSwipeSurface } from "./V3TopLevelSwipeSurface";

export type V3TopLevelNavigationViewportProps = {
  children: ReactNode;
  previousSurface?: ReactNode;
  nextSurface?: ReactNode;
  pathname: string;
  searchStr: string;
  activeIndex: number;
  itemCount: number;
  previewReady: boolean;
  interactionKey: string;
  onCommit: (targetIndex: number) => void;
};

/**
 * Canonical composition boundary for V3 top-level page navigation.
 *
 * V3AppShell owns router/tab-memory authority. V3TopLevelSwipeSurface owns
 * gesture recognition and compositor state. This viewport is the deliberately
 * boring seam between them, which keeps those responsibilities from growing
 * into one heroic component that eventually knows everything about everything.
 *
 * Adjacent content must be supplied as live React surfaces by the current route
 * owner. The viewport never fetches data, fabricates screenshots or mounts all
 * five destinations on its own.
 */
export function V3TopLevelNavigationViewport({
  children,
  previousSurface,
  nextSurface,
  pathname,
  searchStr,
  activeIndex,
  itemCount,
  previewReady,
  interactionKey,
  onCommit,
}: V3TopLevelNavigationViewportProps) {
  return (
    <V3TopLevelSwipeSurface
      pathname={pathname}
      searchStr={searchStr}
      activeIndex={activeIndex}
      itemCount={itemCount}
      previousSurface={previousSurface}
      nextSurface={nextSurface}
      previewReady={previewReady}
      interactionKey={interactionKey}
      onCommit={onCommit}
    >
      {children}
    </V3TopLevelSwipeSurface>
  );
}
