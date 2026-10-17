import {
  clearAppUpdateBlocker,
  setAppUpdateBlocker,
} from "@/lib/app-update-safety";
import { prefersReducedMotion } from "@/lib/interaction-physics";

export type AppViewTransitionKind = "push" | "pop" | "tab";

type ViewTransitionLike = {
  finished: Promise<void>;
};

type ViewTransitionDocument = Document & {
  startViewTransition?: (
    update: () => void | Promise<void>,
  ) => ViewTransitionLike;
};

const APP_VIEW_TRANSITION_UPDATE_BLOCKER = "app-view-transition";
let appViewTransitionSequence = 0;
const activeViewTransitionMarkers = new Map<string, AppViewTransitionKind>();

function nextViewTransitionBlockerId() {
  appViewTransitionSequence += 1;
  return `${APP_VIEW_TRANSITION_UPDATE_BLOCKER}:${appViewTransitionSequence}`;
}

function activateViewTransitionMarker(
  root: HTMLElement,
  ownerId: string,
  kind: AppViewTransitionKind,
) {
  activeViewTransitionMarkers.set(ownerId, kind);
  root.dataset.solarisViewTransition = kind;
}

function releaseViewTransitionMarker(root: HTMLElement, ownerId: string) {
  activeViewTransitionMarkers.delete(ownerId);
  const remainingKinds = [...activeViewTransitionMarkers.values()];
  const latestKind = remainingKinds.at(-1);
  if (latestKind) {
    root.dataset.solarisViewTransition = latestKind;
    return;
  }
  delete root.dataset.solarisViewTransition;
}

export async function runAppViewTransition(
  kind: AppViewTransitionKind,
  update: () => void | Promise<void>,
) {
  if (typeof document === "undefined") {
    await update();
    return;
  }

  const updateBlockerId = nextViewTransitionBlockerId();
  setAppUpdateBlocker(
    updateBlockerId,
    true,
    "Finish the current navigation transition before updating.",
  );

  const root = document.documentElement;
  try {
    if (prefersReducedMotion()) {
      await update();
      return;
    }

    const transitionDocument = document as ViewTransitionDocument;
    if (typeof transitionDocument.startViewTransition !== "function") {
      await update();
      return;
    }

    activateViewTransitionMarker(root, updateBlockerId, kind);
    let updateRan = false;

    try {
      const transition = transitionDocument.startViewTransition(async () => {
        updateRan = true;
        await update();
      });
      await transition.finished;
    } catch {
      if (!updateRan) await update();
    } finally {
      releaseViewTransitionMarker(root, updateBlockerId);
    }
  } finally {
    clearAppUpdateBlocker(updateBlockerId);
  }
}
