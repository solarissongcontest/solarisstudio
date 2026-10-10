export type LifecycleGenerationRef = { current: number };

export type LifecycleGeneration = {
  isCurrent: () => boolean;
  deactivate: () => void;
};

/**
 * Gives one effect generation exclusive authority to publish async results.
 * Cleanup invalidates queued callbacks even when a library has already queued
 * them before unsubscribe() is observed.
 */
export function beginLifecycleGeneration(
  generationRef: LifecycleGenerationRef,
): LifecycleGeneration {
  const generation = ++generationRef.current;
  let active = true;

  return {
    isCurrent: () => active && generation === generationRef.current,
    deactivate: () => {
      if (!active) return;
      active = false;
      if (generationRef.current === generation) generationRef.current += 1;
    },
  };
}
