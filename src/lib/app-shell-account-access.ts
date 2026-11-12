/**
 * Keeps the global shell's identity presentation tied to the newest auth event.
 * Backend authorization remains mandatory; this only prevents stale UI access.
 */
export type ShellIdentity = { id: string | null; email: string | null };

export function createAppShellAccountAccessCoordinator<TAccess>(options: {
  load: (userId: string) => Promise<TAccess>;
  setEmail: (email: string | null) => void;
  setAccess: (value: TAccess) => void;
  emptyAccess: TAccess;
  defer: (callback: () => void) => void;
}) {
  let active = true;
  let generation = 0;
  let currentActorId: string | null | undefined;

  function apply(identity: ShellIdentity, ticket: number) {
    if (!active || ticket !== generation) return;
    options.setEmail(identity.email);
    if (currentActorId !== identity.id) {
      currentActorId = identity.id;
      options.setAccess(options.emptyAccess);
    }
    if (!identity.id) {
      options.setAccess(options.emptyAccess);
      return;
    }
    const requestedActor = identity.id;
    void Promise.resolve().then(() => options.load(requestedActor)).then(
      (access) => {
        if (active && ticket === generation && currentActorId === requestedActor) {
          options.setAccess(access);
        }
      },
      () => {
        // A current failed verification is not permission to keep stale access.
        if (active && ticket === generation && currentActorId === requestedActor) {
          options.setAccess(options.emptyAccess);
        }
      },
    );
  }

  return {
    /** The initial getUser response loses to any later auth event. */
    initial(identity: ShellIdentity) {
      apply(identity, 0);
    },
    /** Called synchronously when Supabase reports an identity change. */
    authChanged(identity: ShellIdentity) {
      if (!active) return;
      const ticket = ++generation;
      if (currentActorId !== identity.id) {
        // Prevent the previous account's privileges/email surviving until the
        // deferred Supabase-safe callback runs.
        currentActorId = identity.id;
        options.setEmail(null);
        options.setAccess(options.emptyAccess);
      }
      options.defer(() => apply(identity, ticket));
    },
    dispose() {
      active = false;
      generation++;
    },
  };
}
