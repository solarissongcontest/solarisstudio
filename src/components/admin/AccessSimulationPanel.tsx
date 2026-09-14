import { type AccessSimulation, type AccessUser } from "@/lib/permission-engine-admin";
import { buildOrganizerAccessSimulation } from "@/lib/permission-access-simulation";
import type { SolarisCapability } from "@/lib/permissions-v2";
import { AdminCard, AdminCardHeader, AdminStatus } from "./AdminUI";

export function AccessSimulationPanel({
  user,
  simulation,
}: {
  user: AccessUser;
  simulation: AccessSimulation;
}) {
  const access = buildOrganizerAccessSimulation(simulation.capabilities);

  return (
    <AdminCard>
      <div className="mb-4 rounded-xl border border-sky-200/25 bg-sky-200/[0.08] p-3">
        <p className="text-xs font-black uppercase tracking-[0.15em] text-sky-50">
          Access simulation · read only
        </p>
        <p className="mt-1 text-xs leading-5 text-sky-100/75">
          Viewing effective access for {user.displayName}. No actions can be executed from this
          simulation.
        </p>
      </div>
      <AdminCardHeader
        eyebrow="Effective access"
        title={`${access.visibleSurfaceCount} of ${access.surfaces.length} Organizer domains visible`}
        description={
          simulation.editionId
            ? "Scoped to the selected edition, including global access."
            : "Global access only."
        }
      />
      <div className="mb-4 flex flex-wrap gap-2">
        {simulation.roles.map((role) => (
          <AdminStatus key={role} tone="info">
            {humanize(role)}
          </AdminStatus>
        ))}
        {!simulation.roles.length ? <AdminStatus>No roles</AdminStatus> : null}
      </div>

      <div className="mb-4 grid gap-2 sm:grid-cols-3">
        <SimulationMetric label="Visible domains" value={access.visibleSurfaceCount} />
        <SimulationMetric label="Discoverable routes" value={access.allowedRouteCount} />
        <SimulationMetric label="Enabled actions" value={access.enabledActionCount} />
      </div>

      <div className="space-y-2">
        {access.surfaces.map((surface) => (
          <details
            key={surface.id}
            className="group rounded-xl border border-white/[0.07] bg-white/[0.02]"
          >
            <summary className="flex min-h-12 cursor-pointer list-none items-center gap-3 px-3 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">{surface.label}</p>
                <p className="mt-0.5 truncate text-xs text-muted-foreground">
                  {surface.description}
                </p>
              </div>
              <AdminStatus tone={surface.visible ? "ready" : "neutral"}>
                {surface.visible ? "Visible" : "Hidden"}
              </AdminStatus>
            </summary>
            <div className="grid gap-4 border-t border-white/[0.07] px-3 py-3 md:grid-cols-2">
              <SimulationItems title="Routes" items={surface.routes} />
              <SimulationItems title="Actions" items={surface.actions} />
            </div>
          </details>
        ))}
      </div>

      <details className="mt-4 rounded-xl border border-white/[0.07] bg-black/10 p-3">
        <summary className="cursor-pointer text-xs font-semibold text-muted-foreground">
          Advanced · effective capability keys ({simulation.capabilities.length})
        </summary>
        <div className="mt-3 grid gap-1.5 sm:grid-cols-2">
          {simulation.capabilities.map((item) => (
            <code
              key={item}
              className="rounded-lg border border-white/[0.07] bg-white/[0.02] px-2.5 py-2 text-[11px] text-sky-100/80"
            >
              {item}
            </code>
          ))}
          {!simulation.capabilities.length ? (
            <p className="text-xs text-muted-foreground">No effective capabilities.</p>
          ) : null}
        </div>
      </details>
    </AdminCard>
  );
}

function SimulationItems({
  title,
  items,
}: {
  title: string;
  items: Array<{ label: string; capability: SolarisCapability; allowed: boolean }>;
}) {
  return (
    <section>
      <h4 className="text-[10px] font-black uppercase tracking-[0.12em] text-muted-foreground">
        {title}
      </h4>
      <div className="mt-2 space-y-1.5">
        {items.map((item) => (
          <div key={`${item.capability}:${item.label}`} className="flex items-center gap-2 text-xs">
            <span
              aria-hidden="true"
              className={item.allowed ? "text-emerald-200" : "text-muted-foreground"}
            >
              {item.allowed ? "✓" : "—"}
            </span>
            <span className={item.allowed ? "text-foreground" : "text-muted-foreground"}>
              {item.label}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

function SimulationMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3">
      <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 text-xl font-bold">{value}</p>
    </div>
  );
}

function humanize(value: string) {
  return value.replace(/[._-]/g, " ").replace(/\b\w/g, (character) => character.toUpperCase());
}
