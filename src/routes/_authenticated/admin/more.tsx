import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  BarChart3,
  BookOpen,
  CalendarDays,
  ClipboardCheck,
  ExternalLink,
  Gavel,
  History,
  KeyRound,
  ListTree,
  Rocket,
  Settings,
  ShieldCheck,
  Sparkles,
  Trophy,
  Users,
} from "lucide-react";

import { useAdminContext } from "@/components/admin/AdminContext";
import { AdminCard, AdminCardHeader, AdminPageHeader } from "@/components/admin/AdminUI";
import { loadOrganizerMoreRouteAccess } from "@/lib/v3-organizer-more-access";

export const Route = createFileRoute("/_authenticated/admin/more")({
  head: () => ({ meta: [{ title: "More — Solaris Organizer" }] }),
  component: MoreAdmin,
});

const groups = [
  {
    title: "Governance",
    description: "Rules, integrity decisions and appeal safeguards.",
    items: [
      { label: "Investigations", description: "Triage reports, evidence and governed integrity cases.", to: "/admin/integrity-investigations", icon: ShieldCheck },
      { label: "Rule rulings", description: "Review pre-clearance requests before delegations act.", to: "/admin/integrity-preclearance", icon: Gavel },
      { label: "Appeals", description: "Review sanctions through the independent appeal workflow.", to: "/admin/integrity-appeals", icon: Gavel },
      { label: "Rules manager", description: "Draft, validate and publish governed rulebook releases.", to: "/admin/rules-manager", icon: BookOpen },
      { label: "Interpretations", description: "Publish official rule clarifications and precedent.", to: "/admin/rule-interpretations", icon: BookOpen },
    ],
  },
  {
    title: "Platform",
    description: "Identity, access and account administration.",
    items: [
      { label: "Access & permissions", description: "Users, roles, capabilities, access simulation and authorization health.", to: "/admin/access-permissions", icon: KeyRound },
      { label: "Country accounts", description: "Manage who can sign in for each delegation.", to: "/admin/country-accounts", icon: Users },
    ],
  },
  {
    title: "Integrations",
    description: "Health, delivery and background-system boundaries.",
    items: [
      { label: "System health", description: "Check data synchronization, stale bindings and integration failures.", to: "/admin/sync-health", icon: Settings },
      { label: "Delivery & jobs", description: "Inspect push delivery receipts, queue state and Solaris scheduler runs.", to: "/admin/system-operations", icon: Settings },
    ],
  },
  {
    title: "Engagement",
    description: "Low-frequency fan participation and editorial tools.",
    items: [
      { label: "Predictions", description: "Create and manage prediction rounds for visitors.", to: "/admin/predictions", icon: Sparkles },
      { label: "Fantasy SSC", description: "Manage roster costs, budget, lock windows and scoring.", to: "/admin/fantasy", icon: Trophy },
      { label: "Community moderation", description: "Moderate public fan display identities without changing scores.", to: "/admin/community-moderation", icon: ShieldCheck },
      { label: "Anniversary", description: "Manage anniversary content, milestones and archive moments.", to: "/admin/anniversary", icon: Trophy },
    ],
  },
  {
    title: "Product QA",
    description: "Feedback studies, scenario coverage and public usability evidence.",
    items: [
      { label: "Feedback Studies", description: "Open Beta 1, Beta 2 and Beta 3 as distinct historical study datasets from one canonical QA workspace.", to: "/admin/feedback-studies", icon: BarChart3 },
      { label: "Organizer Acceptance Test", description: "Run the canonical organizer scenarios and record whether each workflow passes.", to: "/admin/beta-test", icon: ClipboardCheck },
      { label: "QA Coverage", description: "Compare capability scenarios, device coverage, missing checks and reported defects.", to: "/admin/admin-beta-feedback", icon: BarChart3 },
      { label: "Public UX", description: "Review privacy-respecting public navigation, search and task-completion telemetry.", to: "/admin/public-ux", icon: BarChart3 },
    ],
  },
  {
    title: "System",
    description: "Operational defaults, maintenance controls and rollout state.",
    items: [
      {
        label: "System settings",
        description: "Operational schedule, custom reminders, platform maintenance and audit history. Remaining settings stay in their owning domain until governed.",
        to: "/admin/system",
        icon: Settings,
      },
      { label: "Feature rollout", description: "See and control which Solaris Studio capabilities are enabled.", to: "/admin/feature-rollout", icon: Rocket },
    ],
  },
  {
    title: "Historical tools",
    description: "Edition administration, archive context and safe rehearsal tools.",
    items: [
      { label: "Manage editions", description: "Create editions and manage their lifecycle and settings.", to: "/admin/editions", icon: Trophy },
      { label: "HOD history", description: "See who managed each delegation in past editions.", to: "/admin/hod-history", icon: History },
      { label: "Time Machine", description: "Inspect historical edition state without mutating production.", to: "/admin/time-machine", icon: History },
      { label: "Simulation Lab", description: "Rehearse an edition safely without changing canonical state.", to: "/admin/edition-simulator", icon: ClipboardCheck },
      { label: "Edition dates", description: "Maintain historical main-event dates used by anniversary and archive features.", to: "/admin/anniversary-dates", icon: CalendarDays },
    ],
  },
  {
    title: "Help & Directory",
    description: "Guidance and deliberate access to the full specialist tool inventory.",
    items: [
      { label: "Organizer guide", description: "Plain-language instructions for the main Organizer workflows.", to: "/admin/guide", icon: BookOpen },
      { label: "All Organizer tools", description: "Open the complete categorized specialist-page directory.", to: "/admin/menu", icon: ListTree },
    ],
  },
] as const;

const morePaths = groups.flatMap((group) => group.items.map((item) => item.to));

function MoreAdmin() {
  const { editionId } = useAdminContext();
  const access = useQuery({
    queryKey: ["v3-organizer-more-access", editionId ?? "unscoped"],
    queryFn: () => loadOrganizerMoreRouteAccess(morePaths, editionId ?? null),
    retry: false,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });

  const visibleGroups = access.data
    ? groups
        .map((group) => ({
          ...group,
          items: group.items.filter((item) => access.data[item.to] === true),
        }))
        .filter((group) => group.items.length > 0)
    : [];

  return (
    <div className="mx-auto max-w-3xl">
      <AdminPageHeader
        eyebrow="Solaris Organizer"
        title="More"
        description="Low-frequency governance, platform, integration, engagement, QA, system and historical tools."
      />

      <div className="space-y-4">
        {access.isPending ? (
          <AdminCard>
            <AdminCardHeader
              title="Checking access"
              description="Solaris is verifying which specialist tools are available in your current Organizer context."
            />
          </AdminCard>
        ) : access.isError ? (
          <AdminCard>
            <AdminCardHeader
              title="Specialist access unavailable"
              description="Solaris could not verify your permissions, so specialist destinations are hidden until access can be checked safely."
            />
            <button
              type="button"
              className="admin-action-secondary w-full"
              onClick={() => void access.refetch()}
            >
              Retry access check
            </button>
          </AdminCard>
        ) : visibleGroups.length === 0 ? (
          <AdminCard>
            <AdminCardHeader
              title="No specialist tools available"
              description="Your current permissions do not expose any low-frequency Organizer tools in this context."
            />
          </AdminCard>
        ) : (
          visibleGroups.map((group) => (
            <AdminCard key={group.title}>
              <AdminCardHeader title={group.title} description={group.description} />
              <div className="divide-y divide-white/[0.07]">
                {group.items.map((item) => {
                  const Icon = item.icon;
                  return (
                    <Link key={item.to} to={item.to as any} className="admin-list-row group">
                      <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-white/[0.07] bg-white/[0.03] text-muted-foreground group-hover:text-foreground">
                        <Icon className="size-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold text-foreground">{item.label}</span>
                        <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">{item.description}</span>
                      </span>
                      <span className="text-muted-foreground">›</span>
                    </Link>
                  );
                })}
              </div>
            </AdminCard>
          ))
        )}

        <AdminCard>
          <AdminCardHeader title="Public site" description="Open the public Solaris Studio in a new tab." />
          <Link to="/" target="_blank" className="admin-action-secondary w-full">
            <ExternalLink className="size-4" /> Open public site
          </Link>
        </AdminCard>
      </div>
    </div>
  );
}
