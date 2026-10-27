export class StaleSolarisAuthTransitionError extends Error {
  constructor() {
    super("A newer Solaris authentication transition replaced this request.");
    this.name = "StaleSolarisAuthTransitionError";
  }
}

export type SolarisAuthTransition = {
  generation: number;
  isCurrent: () => boolean;
};

let generation = 0;
let mutationTail: Promise<void> = Promise.resolve();

/**
 * Establishes latest-intent ownership for browser session mutations. The
 * generation is process-local presentation/concurrency state only; server Auth
 * and auth.sessions remain the canonical source of session validity.
 */
export function beginSolarisAuthTransition(): SolarisAuthTransition {
  const ownGeneration = ++generation;
  return {
    generation: ownGeneration,
    isCurrent: () => ownGeneration === generation,
  };
}

/**
 * Serializes session-changing SDK calls. If a newer transition starts while an
 * older mutation is in flight, the older result is cleaned up before the newer
 * mutation may install its session.
 */
export async function runSolarisAuthMutation<T>(
  transition: SolarisAuthTransition,
  mutation: () => Promise<T>,
  staleCleanup?: (value: T) => Promise<void> | void,
): Promise<T> {
  let release!: () => void;
  const previous = mutationTail;
  mutationTail = new Promise<void>((resolve) => {
    release = resolve;
  });

  await previous.catch(() => undefined);
  try {
    if (!transition.isCurrent()) throw new StaleSolarisAuthTransitionError();
    const value = await mutation();
    if (!transition.isCurrent()) {
      await staleCleanup?.(value);
      throw new StaleSolarisAuthTransitionError();
    }
    return value;
  } finally {
    release();
  }
}
