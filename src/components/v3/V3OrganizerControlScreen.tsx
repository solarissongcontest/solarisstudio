import { LockKeyhole, SlidersHorizontal } from "lucide-react";

import type {
  V3OrganizerControlModule,
  V3OrganizerControlProjection,
  V3OrganizerControlWorkspace,
} from "@/lib/v3-organizer-control-ia";
import {
  V3ActionCard,
  V3Screen,
  V3ScreenHeader,
  V3Section,
  V3StatusChip,
  V3Surface,
} from "./V3Foundation";

export type V3OrganizerControlScreenProps = {
  projection: V3OrganizerControlProjection;
};

function BlockedWorkspace({ workspace }: { workspace: V3OrganizerControlWorkspace }) {
  return (
    <V3Surface className="p-4">
      <div className="flex items-start gap-3">
        <span
          className="grid size-8 shrink-0 place-items-center rounded-lg bg-white/[0.055] text-white/45"
          aria-hidden="true"
        >
          <LockKeyhole className="size-4" />
        </span>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold">{workspace.label}</p>
            <V3StatusChip tone="warning">Blocked</V3StatusChip>
          </div>
          <p className="mt-1 text-xs leading-5 text-white/48">{workspace.description}</p>
          {workspace.blockedReason ? (
            <p className="mt-2 text-xs font-semibold leading-5 text-white/62">
              {workspace.blockedReason}
            </p>
          ) : null}
        </div>
      </div>
    </V3Surface>
  );
}

function ModuleContent({ module }: { module: V3OrganizerControlModule }) {
  if (module.availability === "blocked") {
    return (
      <V3Surface level="raised" className="p-4">
        <div className="flex items-start gap-3">
          <span
            className="grid size-9 shrink-0 place-items-center rounded-xl bg-white/[0.055] text-white/45"
            aria-hidden="true"
          >
            <LockKeyhole className="size-4" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold">{module.label} is blocked</p>
            <p className="mt-1 text-xs leading-5 text-white/48">{module.description}</p>
            <p className="mt-2 text-xs font-semibold leading-5 text-white/62">
              {module.blockedReason}
            </p>
          </div>
        </div>
      </V3Surface>
    );
  }

  if (!module.workspaces.length) {
    return (
      <V3Surface className="p-4">
        <p className="text-sm font-semibold">No available workspaces</p>
        <p className="mt-1 text-xs leading-5 text-white/48">{module.description}</p>
      </V3Surface>
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {module.workspaces.map((workspace) =>
        workspace.availability === "blocked" ? (
          <BlockedWorkspace key={workspace.id} workspace={workspace} />
        ) : (
          <V3ActionCard
            key={workspace.id}
            title={workspace.label}
            description={workspace.description}
            icon={SlidersHorizontal}
            tone="neutral"
            to={workspace.route}
          />
        ),
      )}
    </div>
  );
}

/**
 * Navigation-only Organizer Control surface.
 *
 * Capability evaluation and operation risk are resolved before this projection.
 * Control opens authoritative workspaces; it never performs the operation from
 * the tile itself.
 */
export function V3OrganizerControlScreen({ projection }: V3OrganizerControlScreenProps) {
  return (
    <V3Screen>
      <V3ScreenHeader
        kicker="Organizer · Control"
        title={projection.context.editionLabel}
        description="Open the authoritative workspace for an operational domain. Risky actions stay inside that workspace."
      />

      <V3Surface level="raised" className="p-5">
        <div className="grid grid-cols-2 gap-3">
          <div className="v3-surface p-4">
            <span className="block text-2xl font-bold tabular-nums tracking-[-0.04em]">
              {projection.availableModuleCount}
            </span>
            <span className="mt-1 block text-xs leading-5 text-white/48">Available domains</span>
          </div>
          <div className="v3-surface p-4">
            <span className="block text-2xl font-bold tabular-nums tracking-[-0.04em]">
              {projection.blockedModuleCount}
            </span>
            <span className="mt-1 block text-xs leading-5 text-white/48">Blocked domains</span>
          </div>
        </div>
      </V3Surface>

      {projection.modules.map((module) => (
        <V3Section
          key={module.domain}
          title={module.label}
          meta={
            module.availability === "blocked" ? (
              <V3StatusChip tone="warning">Blocked</V3StatusChip>
            ) : (
              <V3StatusChip tone="progress">Available</V3StatusChip>
            )
          }
        >
          <ModuleContent module={module} />
        </V3Section>
      ))}
    </V3Screen>
  );
}
