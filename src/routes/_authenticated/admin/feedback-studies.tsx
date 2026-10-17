import { createFileRoute, Link } from "@tanstack/react-router";
import { BarChart3, History, Route as RouteIcon, Users } from "lucide-react";

import { AdminPage } from "@/components/admin/AdminShell";
import {
  AdminCard,
  AdminCardHeader,
  AdminPageHeader,
  AdminStatus,
} from "@/components/admin/AdminUI";

export const Route = createFileRoute("/_authenticated/admin/feedback-studies")({
  head: () => ({
    meta: [
      { title: "Feedback Studies — Solaris Organizer" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: FeedbackStudiesPage,
});

const studies = [
  {
    id: "beta-3",
    label: "Beta 3 · Navigation & findability",
    description:
      "Current navigation study with task outcomes, first-click evidence, release gates and reported defects.",
    to: "/admin/beta3-feedback",
    status: "Current study",
    icon: RouteIcon,
  },
  {
    id: "beta-2",
    label: "Beta 2 · Public usability",
    description:
      "Public-site usability study with release-readiness measures, task success, comparisons and bug reports.",
    to: "/admin/beta2-feedback",
    status: "Historical study",
    icon: BarChart3,
  },
  {
    id: "beta-1",
    label: "Beta 1 · Baseline archive",
    description:
      "Original closed questionnaire and response archive retained as the baseline for later study comparisons.",
    to: "/admin/beta1-feedback",
    status: "Historical archive",
    icon: History,
  },
] as const;

function FeedbackStudiesPage() {
  return (
    <AdminPage>
      <div className="mx-auto max-w-5xl space-y-4">
        <AdminPageHeader
          eyebrow="Product QA"
          title="Feedback Studies"
          description="One Product QA entry point for Solaris usability research. Beta 1, Beta 2 and Beta 3 remain separate historical datasets, so later studies never rewrite earlier evidence."
          actions={<AdminStatus tone="info">3 preserved studies</AdminStatus>}
        />

        <AdminCard strong>
          <AdminCardHeader
            eyebrow="Study model"
            title="Historical evidence stays distinct"
            description="The V3 workspace consolidates navigation, not source data. Each study keeps its own participants, devices, scenarios, responses and defect evidence."
          />
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <StudyField label="Tester" value="participant identity" icon={Users} />
            <StudyField label="Device" value="test environment" icon={BarChart3} />
            <StudyField label="Scenario" value="task being tested" icon={RouteIcon} />
            <StudyField label="Defect" value="linked issue evidence" icon={History} />
          </div>
        </AdminCard>

        <section className="space-y-3" aria-label="Feedback studies">
          {studies.map((study) => {
            const Icon = study.icon;
            return (
              <AdminCard key={study.id} className="!p-4">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                  <span className="grid size-11 shrink-0 place-items-center rounded-xl border border-white/[0.07] bg-white/[0.03] text-muted-foreground">
                    <Icon className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-semibold text-foreground">{study.label}</h2>
                      <AdminStatus tone={study.id === "beta-3" ? "info" : "neutral"}>
                        {study.status}
                      </AdminStatus>
                    </div>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">
                      {study.description}
                    </p>
                  </div>
                  <Link to={study.to as any} className="admin-action-secondary shrink-0">
                    Open study
                  </Link>
                </div>
              </AdminCard>
            );
          })}
        </section>

        <AdminCard>
          <AdminCardHeader
            title="Related Product QA"
            description="Feedback studies explain what testers experienced. Release certification and aggregate public telemetry remain separate QA authorities."
          />
          <div className="grid gap-2 sm:grid-cols-3">
            <Link to="/admin/beta-test" className="admin-action-secondary w-full">
              Acceptance Test
            </Link>
            <Link to="/admin/admin-beta-feedback" className="admin-action-secondary w-full">
              QA Coverage
            </Link>
            <Link to="/admin/public-ux" className="admin-action-secondary w-full">
              Public UX
            </Link>
          </div>
        </AdminCard>
      </div>
    </AdminPage>
  );
}

function StudyField({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon: typeof Users;
}) {
  return (
    <div className="rounded-xl border border-white/[0.07] bg-black/10 p-3">
      <Icon className="size-4 text-muted-foreground" />
      <p className="mt-2 text-xs font-semibold text-foreground">{label}</p>
      <p className="mt-1 text-[11px] leading-4 text-muted-foreground">{value}</p>
    </div>
  );
}
