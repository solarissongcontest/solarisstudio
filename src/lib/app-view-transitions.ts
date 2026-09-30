export type AppViewTransitionKind = "push" | "pop" | "tab";

type ViewTransitionLike = {
  finished: Promise<void>;
};

type ViewTransitionDocument = Document & {
  startViewTransition?: (
    update: () => void | Promise<void>,
  ) => ViewTransitionLike;
};

function prefersReducedMotion() {
  if (typeof window === "undefined") return true;
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}

export async function runAppViewTransition(
  kind: AppViewTransitionKind,
  update: () => void | Promise<void>,
) {
  if (typeof document === "undefined" || prefersReducedMotion()) {
    await update();
    return;
  }

  const transitionDocument = document as ViewTransitionDocument;
  if (typeof transitionDocument.startViewTransition !== "function") {
    await update();
    return;
  }

  const root = document.documentElement;
  root.dataset.solarisViewTransition = kind;

  try {
    const transition = transitionDocument.startViewTransition(async () => {
      await update();
    });
    await transition.finished;
  } catch {
    await update();
  } finally {
    delete root.dataset.solarisViewTransition;
  }
}
