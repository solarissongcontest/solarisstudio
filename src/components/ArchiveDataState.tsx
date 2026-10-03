import { AppRouteSkeleton } from "@/components/app/AppRouteStateFrame";
import { useSolarisApp } from "@/components/app/AppRuntime";
import { PublicDataState } from "@/components/public/PublicDataState";

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
  const { isAppMode } = useSolarisApp();

  if (isAppMode) {
    return (
      <div className="py-2" aria-live="polite" aria-busy="true">
        <span className="sr-only">{label}</span>
        <AppRouteSkeleton />
      </div>
    );
  }

  return (
    <div
      className="min-h-[calc(100svh-14rem)]"
      data-archive-loading-reserve="true"
    >
      <PublicDataState
        kind="loading"
        title={label}
        description="Published Solaris data is being prepared for this view."
      />
    </div>
  );
}

export function ArchiveDataError() {
  return (
    <PublicDataState
      kind="error"
      title="The archive could not be loaded"
      description="Refresh the page and try again. Published data has not been replaced with placeholder content."
    />
  );
}
