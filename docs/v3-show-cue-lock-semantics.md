# V3 show cue lock semantics

This note is the normative clarification for the rundown lock behavior implemented by the V3 show/cue authority cutover.

The rundown lock is a **structural editing lock**, not a prerequisite for live cue execution and not a personal ownership lease over the show.

Canonical behavior:

- `v3_save_show_rundown` rejects structural edits while `studio2Rundown.lockedAt` is present.
- `v3_transition_show_cue` does **not** require the rundown to be locked or unlocked. Live execution remains governed by cue revision CAS, legal cue transitions, show scope and broadcast-management authorization.
- `v3_set_show_rundown_lock` uses the same rundown revision CAS. A stale acquire/release request fails rather than overwriting newer cue state.
- `lockedBy`, `lockedAt` and `lockReason` are audit/context metadata. They do not grant exclusive runtime authority.
- Any actor who currently satisfies canonical broadcast-management authorization may release the lock. This is deliberate stale-lock recovery: an abandoned browser/session cannot create an immortal rundown lock.
- An unauthorized actor cannot acquire, release or use the lock to mutate rundown/cue state.
- Cue execution while the structural lock is held preserves the lock; it does not silently clear editor state.

The local disposable-Supabase contract `.github/tests/v3-show-cue-lock-contract.sql` proves edit rejection while locked, stale-revision unlock rejection, live execution while locked, collaborative authorized recovery and monotonic rundown revisions.

This clarification supersedes any earlier wording that implied entering a live cue *requires* the structural rundown lock. The current canonical runtime intentionally keeps editing coordination separate from live execution authority.
