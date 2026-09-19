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
  return (
    <PublicDataState
      kind="loading"
      title={label}
      description="Published Solaris data is being prepared for this view."
    />
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
