import { createFileRoute, Link } from "@tanstack/react-router";

import { AdminPage } from "@/components/admin/AdminShell";
import { AdminPageHeader } from "@/components/admin/AdminUI";
import { GuideFAQ } from "@/components/GuideFAQ";

export const Route = createFileRoute("/_authenticated/admin/guide")({
  head: () => ({
    meta: [
      { title: "Organizer guide — Solaris Studio" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminGuidePage,
});

const SECTIONS = [
  {
    title: "Start here",
    description: "The Organizer is arranged by what you are trying to do, not by the service that stores the data.",
    questions: [
      {
        question: "What is Solaris Organizer?",
        answer: (
          <>
            Solaris Organizer is the private contest-management side of Solaris Studio. Confirmations and public
            televoting are part of the same Organizer, so you do not need to learn separate admin products.
          </>
        ),
      },
      {
        question: "What are the main Organizer sections?",
        answer: (
          <>
            Use Overview for readiness, Delegations for participation and submissions, Contest for shows and
            entries, Voting for jury and public voting, Publish for visibility, Broadcast for presentation, and
            Administration for accounts and system tools.
          </>
        ),
      },
      {
        question: "How do I choose which edition I am working on?",
        answer: (
          <>
            Use the edition selector in the top bar. The selected edition follows you through the Organizer so you
            do not need to keep choosing it again on every page.
          </>
        ),
      },
      {
        question: "What should I check first?",
        answer: (
          <>
            Open <Link to="/admin/operations" className="font-semibold text-primary">Overview</Link>. It shows the
            current edition, readiness problems and the most useful next action.
          </>
        ),
      },
      {
        question: "How do I find a page if I forget where it is?",
        answer: (
          <>
            Use Organizer search from the top bar. Search for a task such as jury, publication, Oland, running
            order or system health instead of trying to remember a route.
          </>
        ),
      },
    ],
  },
  {
    title: "Delegations",
    description: "Participation, submissions, rounds, calendars and delegation access live together.",
    questions: [
      {
        question: "Where do I review confirmation responses?",
        answer: (
          <>
            Open Delegations, then Responses. Items needing an organizer decision are prioritized ahead of ready or
            waiting delegations.
          </>
        ),
      },
      {
        question: "Where do I open or close a confirmation round?",
        answer: (
          <>
            Open Delegations, then Rounds. Use that page for submission waves, timing and capacity instead of
            looking for a separate Confirmations admin area.
          </>
        ),
      },
      {
        question: "Where do I see National Finals and delegation deadlines?",
        answer: (
          <>
            Open Delegations, then Calendar. It keeps delegation-related dates together so you can see what is
            approaching without opening each country separately.
          </>
        ),
      },
      {
        question: "How do I move confirmed countries into the contest?",
        answer: (
          <>
            Use Delegations → Rounds → Line-up sync, or the Sync to contest shortcut on the Delegations overview.
            Choose the confirmation wave and target show before applying the sync.
          </>
        ),
      },
      {
        question: "How do I help a delegation regain access?",
        answer: (
          <>
            Open Delegations → Access. Recovery access is a fallback for a delegation that cannot reach an existing
            response through its normal country account.
          </>
        ),
      },
      {
        question: "Can a signed-in country account edit its confirmation without a recovery code?",
        answer: (
          <>
            Yes. Solaris Studio matches the signed-in country account to that country&apos;s saved response. If editing
            is allowed for the edition, round and response, the delegation can open its response without a recovery code.
          </>
        ),
      },
    ],
  },
  {
    title: "Contest",
    description: "Build the edition itself here: shows, entries, allocations and running order.",
    questions: [
      {
        question: "How do I add a semi-final or Grand Final?",
        answer: (
          <>
            Open Contest → Shows. Create the stage, choose its type and order, then save it. The Contest overview
            shows which shows still need entries.
          </>
        ),
      },
      {
        question: "How do I add or change an entry?",
        answer: (
          <>
            Open Contest → Entries. Choose the show and country, then edit the artist, song and other entry details.
          </>
        ),
      },
      {
        question: "Where do allocation and running order happen?",
        answer: (
          <>
            Open Contest → Entries. The workflow moves through line-up, allocation and running order so the stage
            you are working on stays visible.
          </>
        ),
      },
      {
        question: "Where do I mark a country withdrawn or disqualified?",
        answer: (
          <>
            Open the Contest overview and use Participation status. Change the status instead of deleting the
            historical participant record.
          </>
        ),
      },
    ],
  },
  {
    title: "Voting",
    description: "Jury voting, public voting, integrity and results are one workflow.",
    questions: [
      {
        question: "Where do I configure jury and televote rules?",
        answer: (
          <>
            Open Voting → Rules for the selected edition. Configure point scales, weighting, qualifiers and
            tie-break rules there.
          </>
        ),
      },
      {
        question: "Where do I enter jury votes?",
        answer: (
          <>
            Open Voting → Jury. Choose the jury, enter its ballot and check completion from the same voting section.
          </>
        ),
      },
      {
        question: "Where do I open public voting?",
        answer: (
          <>
            Open Voting → Public voting. Configure the round and entries, then open or close voting when the round
            should accept ballots.
          </>
        ),
      },
      {
        question: "Where do I see submitted public ballots?",
        answer: (
          <>
            Open Voting → Public voting for round activity and ballot data. Use Voting → Results when you are
            preparing the official result.
          </>
        ),
      },
      {
        question: "What does an Integrity warning mean?",
        answer: (
          <>
            It means Solaris Studio found a voting pattern worth reviewing. It is evidence for investigation, not
            automatic proof of cheating. Open Voting → Integrity and review the underlying signals before acting.
          </>
        ),
      },
      {
        question: "Where is friend-voting intelligence now?",
        answer: (
          <>
            It is part of Voting → Integrity. Relationship, signal and network analysis belong with the rest of the
            integrity workflow rather than being a separate top-level admin product.
          </>
        ),
      },
      {
        question: "Where do official televote totals go?",
        answer: (
          <>
            Use Voting → Results. Official aggregate totals are separate from individual public ballots and feed
            the show result calculation.
          </>
        ),
      },
    ],
  },
  {
    title: "Publish",
    description: "Publishing is separate from calculating results so private data does not become public by accident.",
    questions: [
      {
        question: "How do I choose what visitors can see?",
        answer: (
          <>
            Open Publish for the selected edition. Control the visibility of countries, entries, running order,
            qualifiers, results and detailed voting there.
          </>
        ),
      },
      {
        question: "Does calculating a result publish it automatically?",
        answer: (
          <>
            No. Voting produces the official result; Publish controls whether that information is visible on the
            public site. Keep the release private until you have checked it.
          </>
        ),
      },
      {
        question: "Can I make something private again?",
        answer: (
          <>
            Yes. Changing publication visibility should hide the public layer without deleting the underlying
            contest data.
          </>
        ),
      },
    ],
  },
  {
    title: "Broadcast",
    description: "Design and presentation tools have one permanent home.",
    questions: [
      {
        question: "Where do I change the edition design?",
        answer: (
          <>
            Open Broadcast. Edit the edition design, artwork, scoreboard and live presentation settings there.
          </>
        ),
      },
      {
        question: "Can one show use different broadcast settings?",
        answer: (
          <>
            Yes. A show can override the edition default. Keep the edition design as the normal baseline and use a
            show override only when that round genuinely needs something different.
          </>
        ),
      },
      {
        question: "What should I check before a live broadcast?",
        answer: (
          <>
            Finish entries and running order in Contest, verify ballots and results in Voting, check visibility in
            Publish, then use Broadcast for the live presentation.
          </>
        ),
      },
    ],
  },
  {
    title: "Administration",
    description: "Low-frequency account, history, diagnostics and testing tools live here.",
    questions: [
      {
        question: "How do I manage country accounts?",
        answer: (
          <>
            Open Administration → Accounts. Use it for country account status and access rather than treating
            account management as part of everyday contest setup.
          </>
        ),
      },
      {
        question: "What is HOD history?",
        answer: (
          <>
            HOD history records who managed a country in each edition. Solaris Studio uses it when historical
            analysis needs to distinguish different people behind the same delegation.
          </>
        ),
      },
      {
        question: "What is System health?",
        answer: (
          <>
            System health checks whether important Solaris Studio data and integrations agree. Use it when a sync,
            voting binding or cross-system workflow looks wrong.
          </>
        ),
      },
      {
        question: "What does sync mean when I see it in an error?",
        answer: (
          <>
            It means keeping the same contest information consistent everywhere that uses it. If an entry changes,
            the dependent Organizer and public views should receive the same canonical information.
          </>
        ),
      },
      {
        question: "Where are predictions and testing tools?",
        answer: (
          <>
            Open Administration. Predictions, beta feedback, acceptance testing and other occasional tools live
            there so they do not compete with everyday edition work.
          </>
        ),
      },
      {
        question: "Where do I create or archive an edition?",
        answer: (
          <>
            Open Administration → All editions, or use the edition selector. Edition creation and archive controls
            are intentionally separate from the current edition&apos;s Contest workflow.
          </>
        ),
      },
    ],
  },
];

function AdminGuidePage() {
  return (
    <AdminPage>
      <AdminPageHeader
        eyebrow="Help"
        title="How to use the organizer tools"
        description="Find the task you are trying to do. The Organizer handles which underlying Solaris service is involved."
      />
      <GuideFAQ sections={SECTIONS} />
    </AdminPage>
  );
}
