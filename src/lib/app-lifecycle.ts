export const APP_RESUME_EVENT = "solaris:app-resume";

export type AppResumeDetail = {
  resumedAt: number;
  backgroundDurationMs: number;
};

export function isCriticalAppWorkflowPath(pathname: string) {
  return (
    /^\/(confirmations|jury-voting|televoting|next-in-line)(\/|$)/.test(pathname) ||
    /^\/(admin|country-hub)(\/|$)/.test(pathname)
  );
}

export function dispatchAppResume(detail: AppResumeDetail) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<AppResumeDetail>(APP_RESUME_EVENT, { detail }));
}
