import { Link } from "@tanstack/react-router";

import { PageHeader } from "@/components/AppShell";
import { formatEventDateTime } from "@/lib/public-time";
import { cn } from "@/lib/utils";

export function PredictionWorkspaceHeader({
  title,
  description,
  active,
  roundStatus,
  locksAt,
  saved,
}: {
  title: string;
  description: string;
  active: "arena" | "league";
  roundStatus?: string | null;
  locksAt?: string | null;
  saved?: boolean;
}) {
  return (
    <>
      <PageHeader
        eyebrow="Prediction Arena"
        title={title}
        description={description}
        actions={
          <nav className="flex flex-wrap gap-2" aria-label="Prediction workspace">
            <WorkspaceLink to="/predictions" active={active === "arena"}>Arena</WorkspaceLink>
            <WorkspaceLink to="/prediction-league" active={active === "league"}>League</WorkspaceLink>
            <WorkspaceLink to="/me" active={false}>My history</WorkspaceLink>
          </nav>
        }
      />

      {roundStatus || locksAt || saved != null ? (
        <div className="mb-5 grid gap-2 rounded-2xl border border-border/70 bg-surface/55 p-3 sm:grid-cols-3">
          <Status label="Round" value={roundStatus ? roundStatus.replaceAll("_", " ") : "Published"} />
          <Status label="Deadline" value={locksAt ? formatEventDateTime(locksAt) : "No active lock"} />
          <Status label="Your prediction" value={saved ? "Saved" : "Not submitted"} />
        </div>
      ) : null}
    </>
  );
}

function WorkspaceLink({
  to,
  active,
  children,
}: {
  to: string;
  active: boolean;
  children: string;
}) {
  return (
    <Link
      to={to as any}
      aria-current={active ? "page" : undefined}
      className={cn(
        "inline-flex min-h-10 items-center rounded-xl border px-3 text-sm font-semibold",
        active
          ? "border-primary/30 bg-primary/10 text-foreground"
          : "border-border bg-surface text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </Link>
  );
}

function Status({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">{label}</p>
      <p className="mt-1 truncate text-sm font-semibold capitalize">{value}</p>
    </div>
  );
}
