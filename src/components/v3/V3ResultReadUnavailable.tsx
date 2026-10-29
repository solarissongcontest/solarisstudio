import { V3AppShell } from "./V3AppShell";
import { V3Screen, V3Surface } from "./V3Foundation";

/** A failed canonical publication read cannot authorize legacy result truth. */
export function V3ResultReadUnavailable({
  title = "Published results unavailable",
}: {
  title?: string;
}) {
  return (
    <V3AppShell editionLabel="Solaris Studio" phaseLabel="Results" activeArea="results">
      <V3Screen>
        <V3Surface className="p-5">
          <h1 className="text-2xl font-bold">{title}</h1>
          <p role="alert" className="mt-2 text-sm text-[var(--v3-text-secondary)]">
            Published results could not be loaded. Please try again shortly.
          </p>
        </V3Surface>
      </V3Screen>
    </V3AppShell>
  );
}
