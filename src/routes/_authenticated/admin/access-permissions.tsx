import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import {
  Eye,
  KeyRound,
  ListFilter,
  Search,
  ShieldCheck,
  ShieldEllipsis,
  UserRoundCog,
} from "lucide-react";
import { useMemo, useState } from "react";

import { useAdminContext } from "@/components/admin/AdminContext";
import { AccessSimulationPanel } from "@/components/admin/AccessSimulationPanel";
import { AdminPage } from "@/components/admin/AdminShell";
import { PermissionCutoverReadinessPanel } from "@/components/admin/PermissionCutoverReadinessPanel";
import {
  AdminCard,
  AdminCardHeader,
  AdminEmptyState,
  AdminPageHeader,
  AdminStatus,
} from "@/components/admin/AdminUI";
import {
  assignAccessRole,
  grantDirectCapability,
  loadAccessUsers,
  loadPermissionCatalog,
  loadPermissionEvents,
  loadPermissionSummary,
  recordPermissionShadow,
  revokeAccessRole,
  revokeDirectCapability,
  viewAccessAs,
  type AccessUser,
  type PermissionCapability,
} from "@/lib/permission-engine-admin";
import type { SolarisCapability } from "@/lib/permissions-v2";

export const Route = createFileRoute("/_authenticated/admin/access-permissions")({
  head: () => ({
    meta: [
      { title: "Access & permissions — Solaris Organizer" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: AccessPermissionsPage,
});

type AccessTab = "users" | "roles" | "capabilities" | "log" | "readiness";
type AccessChange =
  | {
      kind: "assign-role";
      userId: string;
      roleKey: string;
      editionId: string | null;
    }
  | {
      kind: "revoke-role";
      userId: string;
      roleKey: string;
      editionId: string | null;
    }
  | {
      kind: "grant-capability";
      userId: string;
      capability: SolarisCapability;
      editionId: string | null;
    }
  | {
      kind: "revoke-capability";
      userId: string;
      capability: SolarisCapability;
      editionId: string | null;
    };

const TABS: Array<{ id: AccessTab; label: string }> = [
  { id: "users", label: "Users" },
  { id: "roles", label: "Roles" },
  { id: "capabilities", label: "Capabilities" },
  { id: "log", label: "Access log" },
  { id: "readiness", label: "Readiness" },
];

function AccessPermissionsPage() {
  const queryClient = useQueryClient();
  const { editionId } = useAdminContext();
  const [tab, setTab] = useState<AccessTab>("users");
  const [search, setSearch] = useState("");
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [scope, setScope] = useState<"edition" | "global">("edition");
  const [roleKey, setRoleKey] = useState("");
  const [capabilityKey, setCapabilityKey] = useState<SolarisCapability | "">("");
  const [mismatchesOnly, setMismatchesOnly] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const catalogQuery = useQuery({
    queryKey: ["permission-engine-catalog"],
    queryFn: loadPermissionCatalog,
  });
  const usersQuery = useQuery({
    queryKey: ["permission-engine-users"],
    queryFn: loadAccessUsers,
  });
  const summaryQuery = useQuery({
    queryKey: ["permission-engine-summary"],
    queryFn: loadPermissionSummary,
  });
  const eventsQuery = useQuery({
    queryKey: ["permission-engine-events", mismatchesOnly],
    queryFn: () => loadPermissionEvents(mismatchesOnly),
  });
  useQuery({
    queryKey: ["permission-engine-shadow", "permissions.read", editionId],
    queryFn: async () => {
      await recordPermissionShadow({
        capability: "permissions.read",
        editionId: editionId || null,
        action: "permissions.workspace.view",
        route: "/admin/access-permissions",
      });
      return true;
    },
    staleTime: Number.POSITIVE_INFINITY,
    retry: false,
  });

  const users = useMemo(() => usersQuery.data ?? [], [usersQuery.data]);
  const catalog = catalogQuery.data;
  const selectedUser = users.find((user) => user.userId === selectedUserId) ?? null;
  const filteredUsers = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return users;
    return users.filter((user) =>
      [user.displayName, user.email ?? "", ...user.legacyRoles]
        .join(" ")
        .toLowerCase()
        .includes(needle),
    );
  }, [search, users]);
  const capabilitiesByDomain = useMemo(() => {
    const groups = new Map<string, PermissionCapability[]>();
    for (const item of catalog?.capabilities ?? []) {
      groups.set(item.domain, [...(groups.get(item.domain) ?? []), item]);
    }
    return [...groups.entries()].sort(([left], [right]) => left.localeCompare(right));
  }, [catalog?.capabilities]);

  const change = useMutation({
    mutationFn: async (input: AccessChange) => {
      if (input.kind === "assign-role") await assignAccessRole(input);
      if (input.kind === "revoke-role") await revokeAccessRole(input);
      if (input.kind === "grant-capability") await grantDirectCapability(input);
      if (input.kind === "revoke-capability") await revokeDirectCapability(input);
      return input;
    },
    onSuccess: async (input) => {
      setMessage(changeMessage(input));
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["permission-engine-users"],
        }),
        queryClient.invalidateQueries({
          queryKey: ["permission-engine-summary"],
        }),
      ]);
    },
  });

  const simulation = useMutation({
    mutationFn: ({ userId }: { userId: string }) => viewAccessAs(userId, editionId || null),
  });

  const effectiveScope = scope === "edition" && editionId ? editionId : null;
  const summary = summaryQuery.data;
  const loading = catalogQuery.isLoading || usersQuery.isLoading;
  const pageError = catalogQuery.error ?? usersQuery.error;

  return (
    <AdminPage>
      <div className="mx-auto max-w-6xl space-y-4">
        <AdminPageHeader
          eyebrow="Administration"
          title="Access & permissions"
          description="Assign clear role presets, add narrow exceptions and compare capability decisions with the current organizer gate before enforcement changes."
          actions={<AdminStatus tone="attention">Shadow mode</AdminStatus>}
        />

        <div className="rounded-xl border border-amber-200/20 bg-amber-200/[0.06] px-4 py-3 text-sm text-amber-50">
          <span className="font-bold">Not authoritative yet.</span> Existing access rules still
          decide requests while this workspace records comparison data.
        </div>

        <section
          className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
          aria-label="Permission engine summary"
        >
          <Metric
            label="Users in scope"
            value={users.length}
            hint="Known organizers and delegations"
          />
          <Metric
            label="Role presets"
            value={catalog?.roles.length ?? 0}
            hint="Reusable access bundles"
          />
          <Metric
            label="Capabilities"
            value={catalog?.capabilities.length ?? 0}
            hint="Named operations"
          />
          <Metric
            label="30-day mismatches"
            value={summary?.mismatched ?? 0}
            hint={summary ? `${summary.evaluations} evaluations` : "Loading telemetry"}
            attention={Boolean(summary?.mismatched)}
          />
        </section>

        <AdminCard className="!p-2 sm:!p-2">
          <nav
            className="scroll-slim flex gap-1 overflow-x-auto"
            aria-label="Access and permissions sections"
          >
            {TABS.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setTab(item.id)}
                aria-pressed={tab === item.id}
                className={
                  tab === item.id
                    ? "min-h-10 shrink-0 rounded-xl border border-sky-200/15 bg-sky-200/[0.09] px-4 text-sm font-semibold text-sky-50"
                    : "min-h-10 shrink-0 rounded-xl border border-transparent px-4 text-sm font-semibold text-muted-foreground hover:border-white/[0.07] hover:bg-white/[0.035] hover:text-foreground"
                }
              >
                {item.label}
              </button>
            ))}
          </nav>
        </AdminCard>

        {message ? <Notice>{message}</Notice> : null}
        {change.error ? <ErrorNotice error={change.error} /> : null}

        {loading ? (
          <AdminCard>
            <p className="py-12 text-center text-sm text-muted-foreground">
              Loading permission data…
            </p>
          </AdminCard>
        ) : pageError ? (
          <AdminCard>
            <AdminEmptyState
              icon={ShieldEllipsis}
              title="Permission data unavailable"
              description={errorText(pageError)}
            />
          </AdminCard>
        ) : tab === "users" ? (
          <UsersTab
            users={filteredUsers}
            search={search}
            onSearch={setSearch}
            selectedUser={selectedUser}
            onSelectUser={(userId) => {
              setSelectedUserId(userId);
              simulation.reset();
              setMessage(null);
            }}
            roles={catalog?.roles ?? []}
            capabilities={catalog?.capabilities ?? []}
            scope={scope}
            onScope={setScope}
            editionAvailable={Boolean(editionId)}
            roleKey={roleKey}
            onRoleKey={setRoleKey}
            capabilityKey={capabilityKey}
            onCapabilityKey={setCapabilityKey}
            effectiveScope={effectiveScope}
            busy={change.isPending}
            onChange={(input) => change.mutate(input)}
            onSimulate={(userId) => simulation.mutate({ userId })}
            simulation={simulation.data ?? null}
            simulationError={simulation.error}
          />
        ) : tab === "roles" ? (
          <RolesTab roles={catalog?.roles ?? []} />
        ) : tab === "capabilities" ? (
          <CapabilitiesTab groups={capabilitiesByDomain} />
        ) : tab === "log" ? (
          <AccessLogTab
            events={eventsQuery.data ?? []}
            loading={eventsQuery.isLoading}
            error={eventsQuery.error}
            mismatchesOnly={mismatchesOnly}
            onMismatchesOnly={setMismatchesOnly}
            summary={summary}
          />
        ) : (
          <PermissionCutoverReadinessPanel summary={summary} />
        )}
      </div>
    </AdminPage>
  );
}

function UsersTab({
  users,
  search,
  onSearch,
  selectedUser,
  onSelectUser,
  roles,
  capabilities,
  scope,
  onScope,
  editionAvailable,
  roleKey,
  onRoleKey,
  capabilityKey,
  onCapabilityKey,
  effectiveScope,
  busy,
  onChange,
  onSimulate,
  simulation,
  simulationError,
}: {
  users: AccessUser[];
  search: string;
  onSearch: (value: string) => void;
  selectedUser: AccessUser | null;
  onSelectUser: (userId: string) => void;
  roles: Array<{ key: string; label: string }>;
  capabilities: PermissionCapability[];
  scope: "edition" | "global";
  onScope: (scope: "edition" | "global") => void;
  editionAvailable: boolean;
  roleKey: string;
  onRoleKey: (value: string) => void;
  capabilityKey: SolarisCapability | "";
  onCapabilityKey: (value: SolarisCapability | "") => void;
  effectiveScope: string | null;
  busy: boolean;
  onChange: (change: AccessChange) => void;
  onSimulate: (userId: string) => void;
  simulation: Awaited<ReturnType<typeof viewAccessAs>> | null;
  simulationError: Error | null;
}) {
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(17rem,0.72fr)_minmax(0,1.28fr)] xl:items-start">
      <AdminCard>
        <AdminCardHeader
          eyebrow="Directory"
          title={`${users.length} user${users.length === 1 ? "" : "s"}`}
        />
        <label className="mb-3 flex min-h-11 items-center gap-2 rounded-xl border border-white/[0.1] bg-white/[0.035] px-3">
          <Search className="size-4 shrink-0 text-muted-foreground" />
          <span className="sr-only">Search users</span>
          <input
            value={search}
            onChange={(event) => onSearch(event.target.value)}
            className="min-w-0 flex-1 bg-transparent text-sm outline-none"
            placeholder="Search name, email or role…"
          />
        </label>
        <div className="max-h-[34rem] space-y-1 overflow-y-auto pr-1">
          {users.map((user) => (
            <button
              key={user.userId}
              type="button"
              onClick={() => onSelectUser(user.userId)}
              aria-pressed={selectedUser?.userId === user.userId}
              className={
                selectedUser?.userId === user.userId
                  ? "w-full rounded-xl border border-sky-200/20 bg-sky-200/[0.08] p-3 text-left"
                  : "w-full rounded-xl border border-transparent p-3 text-left hover:border-white/[0.07] hover:bg-white/[0.035]"
              }
            >
              <span className="block truncate text-sm font-semibold">{user.displayName}</span>
              <span className="mt-1 block truncate text-xs text-muted-foreground">
                {user.email ?? "No email shown"}
              </span>
              <span className="mt-2 block text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                {user.legacyRoles.length ? user.legacyRoles.join(", ") : "Capability access"}
              </span>
            </button>
          ))}
          {!users.length ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No matching users.</p>
          ) : null}
        </div>
      </AdminCard>

      {selectedUser ? (
        <div className="space-y-4 xl:sticky xl:top-24">
          <AdminCard strong>
            <AdminCardHeader
              eyebrow="User access"
              title={selectedUser.displayName}
              description={selectedUser.email ?? "No email shown"}
              action={
                <button
                  type="button"
                  onClick={() => onSimulate(selectedUser.userId)}
                  className="admin-action-secondary"
                >
                  <Eye className="size-4" /> View access as
                </button>
              }
            />

            <div className="mb-4 flex flex-wrap gap-2">
              {selectedUser.legacyRoles.map((role) => (
                <AdminStatus key={role} tone="info">
                  Legacy {role}
                </AdminStatus>
              ))}
              {!selectedUser.legacyRoles.length ? <AdminStatus>Capability-only</AdminStatus> : null}
            </div>

            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_12rem]">
              <label>
                <span className="mb-1.5 block text-xs font-semibold text-muted-foreground">
                  New changes apply to
                </span>
                <select
                  value={scope}
                  onChange={(event) => onScope(event.target.value as "edition" | "global")}
                  className="admin-input"
                >
                  <option value="edition" disabled={!editionAvailable}>
                    Selected edition
                  </option>
                  <option value="global">Every edition</option>
                </select>
              </label>
              <div className="rounded-xl border border-white/[0.07] bg-white/[0.025] p-3">
                <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                  Scope
                </p>
                <p className="mt-1 text-sm font-bold">
                  {effectiveScope ? "Current edition" : "Global"}
                </p>
              </div>
            </div>

            <section className="mt-5">
              <h3 className="text-sm font-bold">Role assignments</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Use a preset for the user’s normal job. Edition-scoped assignments do not carry into
                other contests.
              </p>
              <div className="mt-3 space-y-2">
                {selectedUser.assignments.map((assignment) => (
                  <AccessRow
                    key={assignment.id}
                    title={
                      roles.find((role) => role.key === assignment.roleKey)?.label ??
                      assignment.roleKey
                    }
                    scope={scopeLabel(assignment.editionName, assignment.editionId)}
                    onRemove={() =>
                      onChange({
                        kind: "revoke-role",
                        userId: selectedUser.userId,
                        roleKey: assignment.roleKey,
                        editionId: assignment.editionId,
                      })
                    }
                    busy={busy}
                  />
                ))}
                {!selectedUser.assignments.length ? (
                  <EmptyLine>No capability roles assigned.</EmptyLine>
                ) : null}
              </div>
              <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                <select
                  value={roleKey}
                  onChange={(event) => onRoleKey(event.target.value)}
                  className="admin-input min-w-0 flex-1"
                >
                  <option value="">Choose role…</option>
                  {roles.map((role) => (
                    <option key={role.key} value={role.key}>
                      {role.label}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={!roleKey || busy || (scope === "edition" && !editionAvailable)}
                  onClick={() =>
                    onChange({
                      kind: "assign-role",
                      userId: selectedUser.userId,
                      roleKey,
                      editionId: effectiveScope,
                    })
                  }
                  className="admin-action-primary disabled:opacity-45"
                >
                  Assign role
                </button>
              </div>
            </section>

            <section className="mt-6 border-t border-white/[0.07] pt-5">
              <h3 className="text-sm font-bold">Direct exceptions</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Grant only a capability that is intentionally outside the person’s preset role.
              </p>
              <div className="mt-3 space-y-2">
                {selectedUser.directGrants.map((grant) => (
                  <AccessRow
                    key={grant.id}
                    title={
                      capabilities.find((item) => item.key === grant.capability)?.label ??
                      grant.capability
                    }
                    scope={scopeLabel(grant.editionName, grant.editionId)}
                    onRemove={() =>
                      onChange({
                        kind: "revoke-capability",
                        userId: selectedUser.userId,
                        capability: grant.capability,
                        editionId: grant.editionId,
                      })
                    }
                    busy={busy}
                  />
                ))}
                {!selectedUser.directGrants.length ? (
                  <EmptyLine>No direct capability exceptions.</EmptyLine>
                ) : null}
              </div>
              <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                <select
                  value={capabilityKey}
                  onChange={(event) =>
                    onCapabilityKey(event.target.value as SolarisCapability | "")
                  }
                  className="admin-input min-w-0 flex-1"
                >
                  <option value="">Choose capability…</option>
                  {capabilities.map((item) => (
                    <option key={item.key} value={item.key}>
                      {item.label} · {item.key}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={!capabilityKey || busy || (scope === "edition" && !editionAvailable)}
                  onClick={() =>
                    capabilityKey &&
                    onChange({
                      kind: "grant-capability",
                      userId: selectedUser.userId,
                      capability: capabilityKey,
                      editionId: effectiveScope,
                    })
                  }
                  className="admin-action-primary disabled:opacity-45"
                >
                  Grant exception
                </button>
              </div>
            </section>
          </AdminCard>

          {simulation ? (
            <AccessSimulationPanel user={selectedUser} simulation={simulation} />
          ) : null}
          {simulationError ? <ErrorNotice error={simulationError} /> : null}
        </div>
      ) : (
        <AdminCard>
          <AdminEmptyState
            icon={UserRoundCog}
            title="Choose a user"
            description="Select a person to inspect roles, direct grants and their effective read-only access."
          />
        </AdminCard>
      )}
    </div>
  );
}

function RolesTab({
  roles,
}: {
  roles: Array<{
    key: string;
    label: string;
    description: string;
    capabilities: SolarisCapability[];
  }>;
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {roles.map((role) => (
        <AdminCard key={role.key}>
          <AdminCardHeader eyebrow={role.key} title={role.label} description={role.description} />
          <div className="flex flex-wrap gap-1.5">
            {role.capabilities.map((item) => (
              <span
                key={item}
                className="rounded-lg border border-white/[0.07] bg-white/[0.025] px-2 py-1 text-[11px] text-muted-foreground"
              >
                {item}
              </span>
            ))}
          </div>
          <p className="mt-4 text-xs font-semibold text-muted-foreground">
            {role.capabilities.length} capabilities
          </p>
        </AdminCard>
      ))}
    </div>
  );
}

function CapabilitiesTab({ groups }: { groups: Array<[string, PermissionCapability[]]> }) {
  return (
    <div className="space-y-4">
      {groups.map(([domain, capabilities]) => (
        <AdminCard key={domain}>
          <AdminCardHeader
            eyebrow="Capability domain"
            title={humanize(domain)}
            description={`${capabilities.length} named operation${capabilities.length === 1 ? "" : "s"}`}
          />
          <div className="divide-y divide-white/[0.07]">
            {capabilities.map((item) => (
              <div
                key={item.key}
                className="grid gap-2 py-3 first:pt-0 last:pb-0 sm:grid-cols-[minmax(0,1fr)_7rem] sm:items-start"
              >
                <div>
                  <p className="text-sm font-semibold">{item.label}</p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">{item.description}</p>
                  <code className="mt-2 inline-block text-[11px] text-sky-100/80">{item.key}</code>
                </div>
                <AdminStatus
                  tone={
                    item.accessLevel === "administer" || item.accessLevel === "approve"
                      ? "attention"
                      : "neutral"
                  }
                >
                  {humanize(item.accessLevel)}
                </AdminStatus>
              </div>
            ))}
          </div>
        </AdminCard>
      ))}
    </div>
  );
}

function AccessLogTab({
  events,
  loading,
  error,
  mismatchesOnly,
  onMismatchesOnly,
  summary,
}: {
  events: Awaited<ReturnType<typeof loadPermissionEvents>>;
  loading: boolean;
  error: Error | null;
  mismatchesOnly: boolean;
  onMismatchesOnly: (value: boolean) => void;
  summary: Awaited<ReturnType<typeof loadPermissionSummary>> | undefined;
}) {
  return (
    <AdminCard strong>
      <AdminCardHeader
        eyebrow="Shadow telemetry"
        title="Access log"
        description="Compare the current organizer decision with the capability result. A mismatch is evidence to investigate, not an automatic access change."
        action={
          <label className="flex min-h-10 items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.025] px-3 text-xs font-semibold">
            <input
              type="checkbox"
              checked={mismatchesOnly}
              onChange={(event) => onMismatchesOnly(event.target.checked)}
            />
            Mismatches only
          </label>
        }
      />
      {summary ? (
        <div className="mb-4 grid gap-2 sm:grid-cols-3">
          <SmallMetric label="Matched" value={summary.matched} />
          <SmallMetric
            label="Legacy allow / new deny"
            value={summary.legacyAllowedCapabilityDenied}
            attention
          />
          <SmallMetric
            label="Legacy deny / new allow"
            value={summary.legacyDeniedCapabilityAllowed}
            attention
          />
        </div>
      ) : null}
      {loading ? (
        <p className="py-10 text-center text-sm text-muted-foreground">Loading access telemetry…</p>
      ) : error ? (
        <AdminEmptyState
          icon={ListFilter}
          title="Access log unavailable"
          description={errorText(error)}
        />
      ) : events.length ? (
        <div className="space-y-2">
          {events.map((event) => {
            const matched = event.legacyAllowed === event.capabilityAllowed;
            return (
              <div
                key={event.id}
                className="grid gap-2 rounded-xl border border-white/[0.07] bg-white/[0.02] p-3 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_8rem_8rem_10rem] lg:items-center"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{event.displayName}</p>
                  <p className="mt-1 truncate text-xs text-muted-foreground">
                    {event.action}
                    {event.route ? ` · ${event.route}` : ""}
                  </p>
                </div>
                <code className="truncate text-xs text-sky-100/80">{event.capability}</code>
                <Decision label="Current" allowed={event.legacyAllowed} />
                <Decision label="Capability" allowed={event.capabilityAllowed} />
                <div className="lg:text-right">
                  <AdminStatus tone={matched ? "ready" : "blocked"}>
                    {matched ? "Matched" : "Mismatch"}
                  </AdminStatus>
                  <p className="mt-1 text-[10px] text-muted-foreground">
                    {formatDateTime(event.createdAt)}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <AdminEmptyState
          icon={ShieldCheck}
          title={mismatchesOnly ? "No mismatches recorded" : "No evaluations recorded"}
          description="Shadow events appear as protected Organizer routes adopt the comparison check."
        />
      )}
    </AdminCard>
  );
}

function AccessRow({
  title,
  scope,
  onRemove,
  busy,
}: {
  title: string;
  scope: string;
  onRemove: () => void;
  busy: boolean;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-white/[0.07] bg-white/[0.02] p-3">
      <KeyRound className="size-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{title}</p>
        <p className="mt-1 text-xs text-muted-foreground">{scope}</p>
      </div>
      <button
        type="button"
        disabled={busy}
        onClick={onRemove}
        className="admin-action-quiet !min-h-8 !px-2 text-xs disabled:opacity-45"
      >
        Remove
      </button>
    </div>
  );
}

function Metric({
  label,
  value,
  hint,
  attention = false,
}: {
  label: string;
  value: number;
  hint: string;
  attention?: boolean;
}) {
  return (
    <AdminCard>
      <p className="text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground">
        {label}
      </p>
      <div className="mt-2 flex items-center justify-between gap-2">
        <p className="text-2xl font-bold tabular-nums">{value}</p>
        {attention ? <AdminStatus tone="blocked">Review</AdminStatus> : null}
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
    </AdminCard>
  );
}

function SmallMetric({
  label,
  value,
  attention = false,
}: {
  label: string;
  value: number;
  attention?: boolean;
}) {
  return (
    <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3">
      <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
        {label}
      </p>
      <p
        className={
          attention && value ? "mt-1 text-xl font-bold text-amber-100" : "mt-1 text-xl font-bold"
        }
      >
        {value}
      </p>
    </div>
  );
}

function Decision({ label, allowed }: { label: string; allowed: boolean }) {
  return (
    <div>
      <p className="text-[9px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
        {label}
      </p>
      <p
        className={
          allowed
            ? "mt-1 text-xs font-bold text-emerald-200"
            : "mt-1 text-xs font-bold text-rose-200"
        }
      >
        {allowed ? "Allowed" : "Denied"}
      </p>
    </div>
  );
}

function Notice({ children }: { children: string }) {
  return (
    <div className="rounded-xl border border-emerald-200/20 bg-emerald-200/[0.06] px-4 py-3 text-sm text-emerald-50">
      {children}
    </div>
  );
}

function ErrorNotice({ error }: { error: Error | null }) {
  return error ? (
    <div className="rounded-xl border border-rose-200/20 bg-rose-200/[0.06] px-4 py-3 text-sm text-rose-50">
      {errorText(error)}
    </div>
  ) : null;
}

function EmptyLine({ children }: { children: string }) {
  return (
    <p className="rounded-xl border border-dashed border-white/[0.08] px-3 py-4 text-center text-xs text-muted-foreground">
      {children}
    </p>
  );
}

function scopeLabel(editionName: string | null, editionId: string | null) {
  return editionId ? (editionName ?? "One edition") : "Every edition";
}

function changeMessage(change: AccessChange) {
  if (change.kind === "assign-role") return "Role assignment saved.";
  if (change.kind === "revoke-role") return "Role assignment removed.";
  if (change.kind === "grant-capability") return "Direct capability exception saved.";
  return "Direct capability exception removed.";
}

function humanize(value: string) {
  return value.replace(/[._-]/g, " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function errorText(error: unknown) {
  return error instanceof Error && error.message
    ? error.message
    : "Permission Engine request failed.";
}
