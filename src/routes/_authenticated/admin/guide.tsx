import { createFileRoute, Link } from "@tanstack/react-router";
import { Search, X } from "lucide-react";
import { useMemo, useState } from "react";

import { AdminPage } from "@/components/admin/AdminShell";
import { AdminPageHeader } from "@/components/admin/AdminUI";
import { GuideFAQ } from "@/components/GuideFAQ";
import {
  countOrganizerGuideAnswers,
  filterOrganizerGuideSections,
} from "@/lib/organizer-guide-search";

export const Route = createFileRoute("/_authenticated/admin/guide")({
  head: () => ({
    meta: [
      { title: "Organizer guide — Solaris Organizer" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: AdminGuidePage,
});

const SECTIONS = [
  {
    title: "Start here",
    description: "The quickest way to understand Solaris Organizer V3.",
    questions: [
      {
        question: "What is Solaris Organizer?",
        answer: (
          <>
            Solaris Organizer is the private contest-management side of Solaris Studio and its V3 operational
            control system. Its permanent destinations are Overview, Tasks, Control, Live and More. Specialist
            systems such as Confirmations, Jury, Televote, Results and Broadcast still exist underneath, but
            ordinary work should begin from the state or task that needs attention rather than from a technical
            service name.
          </>
        ),
      },
      {
        question: "Where should I start when I open the Organizer?",
        answer: (
          <>
            Start with <Link to="/admin/operations" className="font-semibold text-primary">Overview</Link>. It shows
            the selected edition, readiness, important problems, deadlines, recent changes and the next recommended
            action. If Solaris already knows what needs attention, you should not have to remember which specialist
            page owns it.
          </>
        ),
      },
      {
        question: "How do I choose which edition I am working on?",
        answer: (
          <>
            Use the edition context control in Organizer. Edition-scoped pages must show the selected edition near
            the top of the page, and critical review or confirmation surfaces repeat that scope. Switching editions
            should preserve the equivalent workspace where it is valid instead of silently substituting another
            edition.
          </>
        ),
      },
      {
        question: "What do the five main Organizer destinations mean?",
        answer: (
          <>
            <strong>Overview</strong> explains what needs attention now. <strong>Tasks</strong> is the operational
            action queue. <strong>Control</strong> contains deliberate contest-management workspaces such as
            Delegations, Contest, Voting, Results &amp; Publication, Communications and Production. <strong>Live</strong>
            is for operating the active show. <strong>More</strong> contains low-frequency, specialist, governance,
            platform, Product QA and historical tools.
          </>
        ),
      },
      {
        question: "Where are Delegations, Contest and Voting now?",
        answer: (
          <>
            They are first-class domains inside <Link to="/admin/control" className="font-semibold text-primary">Control</Link>,
            not competing top-level apps. This keeps the permanent navigation stable while preserving the specialist
            workspaces organizers still need.
          </>
        ),
      },
    ],
  },
  {
    title: "Delegations",
    description: "Control → participation, confirmations, rounds and access.",
    questions: [
      {
        question: "Where do I review confirmation responses?",
        answer: (
          <>
            Open Control, then Delegations and Confirmations. The overview should show which submissions need
            organizer review, need delegation changes, are ready or are still waiting before you open an individual
            response.
          </>
        ),
      },
      {
        question: "Where do I open or schedule a submission round?",
        answer: (
          <>
            Open Control, then Delegations and Confirmations. Use the rounds workspace to create, open, close or
            schedule the waves in which delegations can submit.
          </>
        ),
      },
      {
        question: "Where do I see National Finals and delegation deadlines?",
        answer: (
          <>
            Open the Delegations calendar from Control. It is the place for submission rounds, National Finals,
            reveals and other delegation dates for the selected edition.
          </>
        ),
      },
      {
        question: "How do I help a delegation regain access to its response?",
        answer: (
          <>
            Open Control, then Delegations and Delegation access. Recovery access is a specialist fallback. A
            correctly linked signed-in country account can also open its own editable confirmation without a recovery
            code when canonical workflow state allows editing.
          </>
        ),
      },
      {
        question: "Where did the old Confirmations Admin go?",
        answer: (
          <>
            Its capability belongs to Control → Delegations. Existing confirmation routes may remain during
            migration, but they are compatibility paths rather than a separate Organizer product model.
          </>
        ),
      },
    ],
  },
  {
    title: "Contest",
    description: "Control → entries, media, shows, running order and participation.",
    questions: [
      {
        question: "How do I create a semi-final or final?",
        answer: (
          <>
            Open Control, then Contest and Shows. Create or review the show in the selected edition before building
            its line-up. Consequential show operations must stay bound to the explicit edition and show context.
          </>
        ),
      },
      {
        question: "How do I review an entry or media?",
        answer: (
          <>
            Open Control, then Contest. Entry review and Media review show the current authoritative submission or
            asset state, validation evidence and the valid next decisions. Request corrections instead of editing
            participant-owned truth into a second copy.
          </>
        ),
      },
      {
        question: "How do I work with allocation and running order?",
        answer: (
          <>
            Open Control, then Contest and Running order. Use the edition/show-scoped workflow there rather than a
            dashboard shortcut that creates separate mutation logic.
          </>
        ),
      },
      {
        question: "Where do I mark a country withdrawn or disqualified?",
        answer: (
          <>
            Open Control, then Contest and Participant status. Change the participation state there instead of
            deleting the country or destroying its edition history.
          </>
        ),
      },
    ],
  },
  {
    title: "Voting",
    description: "Control → rounds, Jury, Televote, declarations and integrity.",
    questions: [
      {
        question: "Where do I manage voting state?",
        answer: (
          <>
            Open Control, then Voting. The overview links to the current round state, Jury, Televote, declarations
            and integrity work for the selected edition. Opening or closing official voting is an authoritative
            operation, not a browser-only toggle.
          </>
        ),
      },
      {
        question: "Where do I review Jury work?",
        answer: (
          <>
            Open Control, then Voting and Jury. Use its operational state, ballot readiness and exceptions to decide
            what needs intervention. Participant Jury submissions remain separate from Organizer review authority.
          </>
        ),
      },
      {
        question: "Where do I manage public voting?",
        answer: (
          <>
            Open Control, then Voting and Televote. Use the exact show/round context for intake, aggregate totals,
            validation and operational state rather than inferring official voting state from a local timer.
          </>
        ),
      },
      {
        question: "Where do I review suspicious ballots or friend-voting signals?",
        answer: (
          <>
            Open Control, then Voting and Integrity. Integrity warnings and friend-voting signals are evidence for
            organizer review, not automatic proof that someone cheated.
          </>
        ),
      },
      {
        question: "Where did the old Televoting Admin go?",
        answer: (
          <>
            Its capabilities are contextualized inside Control → Voting and Results &amp; Publication. Specialist
            compatibility routes can remain while migration is incomplete, but the normal Organizer mental model is
            the contest operation being performed.
          </>
        ),
      },
    ],
  },
  {
    title: "Results & publication",
    description: "Control → calculate, review, lock and deliberately publish official outcomes.",
    questions: [
      {
        question: "What is the Results lifecycle?",
        answer: (
          <>
            Treat Results as a deliberate lifecycle: input, calculate, review, lock and publish. Do not use one
            ambiguous button that quietly performs several official transitions at once.
          </>
        ),
      },
      {
        question: "How do I choose what visitors can see?",
        answer: (
          <>
            Open Control, then Results &amp; Publication and the Publication workspace for the selected edition.
            Public visibility is separate from calculation and review, so unpublished or unfinished result state
            stays private until the relevant publication operation allows it.
          </>
        ),
      },
      {
        question: "Does hiding a result delete it?",
        answer: (
          <>
            No. Publication controls visibility. Historical and official contest data should normally remain
            preserved so it can be reviewed, corrected or published according to the canonical lifecycle.
          </>
        ),
      },
    ],
  },
  {
    title: "Production and Live",
    description: "Configure presentation in Control; operate the active show in Live.",
    questions: [
      {
        question: "Where do I change the edition design or broadcast setup?",
        answer: (
          <>
            Open Control, then Production. Broadcast &amp; design and Edition theme configure the selected edition's
            presentation. Configuration belongs in Control; live execution belongs in Live.
          </>
        ),
      },
      {
        question: "What belongs in Live?",
        answer: (
          <>
            Live is for operating the active show: show state, now/next, voting state, result readiness, live cues,
            active incidents and the next valid operation. It should not become another permanent configuration
            warehouse.
          </>
        ),
      },
      {
        question: "What should I check before a live broadcast?",
        answer: (
          <>
            Resolve blocking readiness items first, then verify show context, running order, voting state, official
            result readiness and publication intent. Live should make the next operational decision clear without
            requiring you to remember a chain of admin routes.
          </>
        ),
      },
    ],
  },
  {
    title: "Tasks, More and troubleshooting",
    description: "Exception work, low-frequency tools, diagnostics and historical administration.",
    questions: [
      {
        question: "What belongs in Tasks?",
        answer: (
          <>
            Tasks is the exception/action queue. It can contain actionable, blocked, waiting, failed, overdue or
            resolved operational work derived from canonical state. A notification is not automatically task truth,
            and completed canonical work should resolve its task instead of requiring manual housekeeping.
          </>
        ),
      },
      {
        question: "What belongs in More?",
        answer: (
          <>
            More is for low-frequency and specialist groups such as Governance, Platform, Integrations, Engagement,
            Product QA, System and Historical tools. Anything routinely needed during ordinary contest operation
            belongs in Control, Tasks, Live or a contextual action instead.
          </>
        ),
      },
      {
        question: "Where do I manage country accounts or historical HOD data?",
        answer: (
          <>
            Open More and the relevant platform or historical tool. These capabilities remain available without
            competing with the everyday operational workspaces.
          </>
        ),
      },
      {
        question: "What is System health?",
        answer: (
          <>
            System health helps diagnose synchronization, failed jobs and other operational inconsistencies. It is
            an observability surface, not a substitute for the canonical state owned by each domain.
          </>
        ),
      },
      {
        question: "How do I find a specialist page when I cannot remember where it is?",
        answer: (
          <>
            Start from Overview, Tasks or Control when Solaris already knows the operational context. For deliberate
            specialist exploration, use More and Organizer search instead of memorizing legacy route names.
          </>
        ),
      },
    ],
  },
];

function AdminGuidePage() {
  const [query, setQuery] = useState("");
  const filteredSections = useMemo(
    () => filterOrganizerGuideSections(SECTIONS, query),
    [query],
  );
  const answerCount = countOrganizerGuideAnswers(filteredSections);
  const totalAnswerCount = countOrganizerGuideAnswers(SECTIONS);
  const hasQuery = Boolean(query.trim());

  return (
    <AdminPage>
      <AdminPageHeader
        eyebrow="Help"
        title="How to use the organizer tools"
        description="Start from the operational state or task that matters, then move into the authoritative workspace when deliberate control is needed."
      />

      <section className="mb-5 rounded-2xl border border-white/[0.07] bg-white/[0.02] p-4 sm:p-5">
        <label htmlFor="organizer-guide-search" className="text-sm font-semibold text-foreground">
          Find Organizer guidance
        </label>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          Search by workspace or question instead of remembering a legacy route name.
        </p>
        <div className="relative mt-3">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <input
            id="organizer-guide-search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            autoComplete="off"
            placeholder="Search Jury, confirmations, publication…"
            aria-describedby="organizer-guide-search-status"
            className="min-h-11 w-full rounded-xl border border-white/[0.08] bg-background/55 py-2.5 pl-10 pr-10 text-sm text-foreground outline-none transition focus:border-primary/60 focus:ring-2 focus:ring-primary/20"
          />
          {query ? (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="Clear guide search"
              className="absolute right-2 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-white/[0.06] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
            >
              <X aria-hidden="true" className="size-4" />
            </button>
          ) : null}
        </div>
        <p
          id="organizer-guide-search-status"
          aria-live="polite"
          className="mt-2 text-xs text-muted-foreground"
        >
          {hasQuery
            ? `${answerCount} answer${answerCount === 1 ? "" : "s"} found`
            : `${totalAnswerCount} answers across ${SECTIONS.length} sections`}
        </p>
      </section>

      {filteredSections.length ? (
        <GuideFAQ sections={filteredSections} />
      ) : (
        <div className="data-panel rounded-2xl p-5 text-center">
          <p className="text-sm font-semibold text-foreground">
            No guide answers match “{query.trim()}”.
          </p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            Try a workspace such as Voting, Delegations, Live or Results.
          </p>
          <button
            type="button"
            onClick={() => setQuery("")}
            className="admin-action-secondary mt-4"
          >
            Clear search
          </button>
        </div>
      )}
    </AdminPage>
  );
}
