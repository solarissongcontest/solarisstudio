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

function nextViewTransitionBlockerId() {
  appViewTransitionSequence += 1;
  return `${APP_VIEW_TRANSITION_UPDATE_BLOCKER}:${appViewTransitionSequence}`;
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

    root.dataset.solarisViewTransition = kind;
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
      delete root.dataset.solarisViewTransition;
    }
  } finally {
    clearAppUpdateBlocker(updateBlockerId);
  }
}
