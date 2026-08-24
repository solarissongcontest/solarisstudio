import { AlertTriangle, LoaderCircle } from "lucide-react";

import { Panel } from "@/components/AppShell";

export type ArchiveQueryState = {
  isLoading: boolean;
  isError: boolean;
};

export function archiveIsLoading(...queries: ArchiveQueryState[]) {
  return queries.some((query) => query.isLoading);
}

export function archiveHasError(...queries: ArchiveQueryState[]) {
  return queries.some((query) => query.isError);
}

export function ArchiveDataLoading({ label = "Loading the archive…" }: { label?: string }) {
  return (
    <Panel className="min-h-32" variant="glass">
      <div className="flex min-h-24 items-center justify-center gap-3" role="status" aria-live="polite">
        <LoaderCircle className="size-5 animate-spin text-primary" aria-hidden="true" />
        <p className="text-sm font-semibold text-muted-foreground">{label}</p>
      </div>
    </Panel>
  );
}

export function ArchiveDataError() {
  return (
    <Panel className="min-h-32" variant="glass">
      <div className="flex min-h-24 items-center justify-center gap-3" role="alert">
        <AlertTriangle className="size-5 text-amber-200" aria-hidden="true" />
        <div>
          <p className="text-sm font-bold">The archive could not be loaded</p>
          <p className="mt-1 text-xs text-muted-foreground">Please refresh the page and try again.</p>
        </div>
      </div>
    </Panel>
  );
}
