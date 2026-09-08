import { createFileRoute, Link } from "@tanstack/react-router";

import { AdminPage } from "@/components/admin/AdminShell";
import { AdminPageHeader } from "@/components/admin/AdminUI";
import { GuideFAQ } from "@/components/GuideFAQ";

export const Route = createFileRoute("/_authenticated/admin/guide")({
  head: () => ({
    meta: [
      { title: "Organizer guide — Solaris Organizer" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminGuidePage,
});

const SECTIONS = [
  {
    title: "Start here",
    description: "The quickest way to understand Solaris Organizer.",
    questions: [
      {
        question: "What is Solaris Organizer?",
        answer: (
          <>
            Solaris Organizer is the private contest-management side of Solaris Studio. The main workspaces are
            Delegations, Contest, Voting, Publish, Broadcast and Administration. Confirmations and public
            televoting still have their own technical systems underneath, but you manage them through these normal
            Organizer workflows.
          </>
        ),
      },
      {
        question: "Where should I start when I open the Organizer?",
        answer: (
          <>
            Start with <Link to="/admin/operations" className="font-semibold text-primary">Overview</Link>. It shows
            the selected edition, readiness, important problems, deadlines and the next things that need attention.
          </>
        ),
      },
      {
        question: "How do I choose which edition I am working on?",
        answer: (
          <>
            Use the edition button in the top bar. Solaris Organizer keeps you in the same workspace when it can,
            so switching editions from Contest or Voting should not make you hunt for the equivalent page again.
          </>
        ),
      },
      {
        question: "What do the main Organizer sections mean?",
        answer: (
          <>
            Delegations is for participation and submissions. Contest is for shows, entries and running order.
            Voting is for rules, juries, public voting, integrity and results. Publish controls what visitors can
            see. Broadcast controls design and presentation. Administration contains accounts, history and system
            tools.
          </>
        ),
      },
    ],
  },
  {
    title: "Delegations",
    description: "Participation, submissions, rounds and access.",
    questions: [
      {
        question: "Where do I review confirmation responses?",
        answer: (
          <>
            Open Delegations, then Responses. The overview first shows how many submissions need organizer review,
            need delegation changes, are ready or are still waiting.
          </>
        ),
      },
      {
        question: "Where do I open or schedule a submission round?",
        answer: (
          <>
            Open Delegations, then Rounds. Use that page to create, open, close or schedule the waves in which
            delegations can submit.
          </>
        ),
      },
      {
        question: "Where do I see National Finals and delegation deadlines?",
        answer: (
          <>
            Open Delegations, then Calendar. It is the place for submission rounds, National Finals, reveals and
            other delegation dates.
          </>
        ),
      },
      {
        question: "How do I help a delegation regain access to its response?",
        answer: (
          <>
            Open Delegations, then Access. Recovery codes remain available as a fallback. A correctly linked
            signed-in country account can also open its own editable confirmation without a recovery code when
            editing is allowed.
          </>
        ),
      },
      {
        question: "Where did the old Confirmations Admin go?",
        answer: (
          <>
            It is now presented as Delegations inside Solaris Organizer. The existing confirmation routes may still
            exist internally for compatibility, but you should not need to think of Confirmations as a separate
            admin product.
          </>
        ),
      },
    ],
  },
  {
    title: "Contest",
    description: "Shows, entries, allocations, running order and participation.",
    questions: [
      {
        question: "How do I create a semi-final or final?",
        answer: (
          <>
            Open Contest, then Shows. Create the show, choose its type and order, and save it before building the
            line-up.
          </>
        ),
      },
      {
        question: "How do I add or edit an entry?",
        answer: (
          <>
            Open Contest, then Entries. Choose the show and country, then edit the artist, song and entry details.
            This workspace also handles allocations and running order.
          </>
        ),
      },
      {
        question: "How do I bring confirmed countries into the contest?",
        answer: (
          <>
            Open Contest, then Sync. Use it to bring approved delegation information into a Solaris show without
            rebuilding the line-up manually.
          </>
        ),
      },
      {
        question: "Where do I mark a country withdrawn or disqualified?",
        answer: (
          <>
            Open Contest, then Participation. Change the participation status there instead of deleting the country
            or destroying its edition history.
          </>
        ),
      },
    ],
  },
  {
    title: "Voting",
    description: "Rules, juries, public voting, integrity and official results.",
    questions: [
      {
        question: "Where do I change jury and public-vote rules?",
        answer: (
          <>
            Open Voting, then Rules. That is where you configure enabled vote types, point scales, weighting,
            qualifiers and tie-break rules for the selected edition.
          </>
        ),
      },
      {
        question: "Where do I enter or correct jury votes?",
        answer: (
          <>
            Open Voting, then Jury. Choose the jury or country, enter the ballot, review it and save. The jury
            voting window is controlled from the Jury workspace rather than appearing on unrelated pages.
          </>
        ),
      },
      {
        question: "How do I open public voting?",
        answer: (
          <>
            Open Voting, then Public voting. Choose the round and entries, check eligibility and timing, then open
            voting when the round is ready.
          </>
        ),
      },
      {
        question: "Where do I review suspicious ballots or friend-voting signals?",
        answer: (
          <>
            Open Voting, then Integrity. Integrity warnings and friend-voting signals are evidence for organizer
            review, not automatic proof that someone cheated.
          </>
        ),
      },
      {
        question: "Where do I work with official public-vote totals and results?",
        answer: (
          <>
            Open Voting, then Results. Use the public-voting result tools and the official televote totals for the
            show, then review the combined result before publication.
          </>
        ),
      },
      {
        question: "Where did the old Televoting Admin go?",
        answer: (
          <>
            It is now presented as the Public voting, Integrity and Results parts of Voting. The specialist backend
            and old routes can remain internally, but organizers should navigate by the contest task instead.
          </>
        ),
      },
    ],
  },
  {
    title: "Publish",
    description: "Control exactly what becomes public.",
    questions: [
      {
        question: "How do I choose what visitors can see?",
        answer: (
          <>
            Open Publish for the selected edition. You can reveal countries, entries, running order, qualifiers,
            results and detailed voting in stages. Keep anything private until it is actually ready.
          </>
        ),
      },
      {
        question: "Does hiding a result delete it?",
        answer: (
          <>
            No. Publication controls visibility. Making a result private should keep the underlying contest data so
            it can be reviewed or published later.
          </>
        ),
      },
      {
        question: "Should I publish results from the Voting page?",
        answer: (
          <>
            Calculate and verify them in Voting, then control public visibility in Publish. Keeping calculation and
            publication separate reduces the chance of accidentally revealing unfinished results.
          </>
        ),
      },
    ],
  },
  {
    title: "Broadcast",
    description: "Artwork, themes, scoreboard and live presentation.",
    questions: [
      {
        question: "Where do I change the edition design or scoreboard?",
        answer: (
          <>
            Open Broadcast. The selected edition can have a default design, while individual shows can override it
            when they need different artwork or presentation settings.
          </>
        ),
      },
      {
        question: "What should I check before a live broadcast?",
        answer: (
          <>
            Check the line-up, running order, voting status, official result data and publication plan first. Then
            use Broadcast for the actual presentation and scoreboard setup.
          </>
        ),
      },
    ],
  },
  {
    title: "Administration and troubleshooting",
    description: "Accounts, history, diagnostics and low-frequency controls.",
    questions: [
      {
        question: "Where do I manage country accounts?",
        answer: (
          <>
            Open Administration, then Accounts. That area manages the account attached to each delegation and its
            access status.
          </>
        ),
      },
      {
        question: "Where do I manage HOD history?",
        answer: (
          <>
            Open Administration, then HOD history. Historical HOD assignments matter for country history and for
            voting analysis that needs to distinguish different people managing the same country over time.
          </>
        ),
      },
      {
        question: "What is System health?",
        answer: (
          <>
            System health checks whether important Solaris data is synchronized and whether integrations have stale
            or failed work. Start there if one Organizer area appears inconsistent with another.
          </>
        ),
      },
      {
        question: "Where are deadlines and the audit history?",
        answer: (
          <>
            Open Administration, then System. Deadlines, audit information and other low-frequency system controls
            live there instead of competing with everyday contest tasks.
          </>
        ),
      },
      {
        question: "How do I find a page when I cannot remember where it is?",
        answer: (
          <>
            Use Search in the top bar or press Ctrl/Cmd + K. Search understands Organizer areas such as Delegations,
            Contest, Voting, Publish and Administration as well as current-edition tools.
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
        description="Navigate by the contest task you are trying to complete, not by the technical service behind it."
      />
      <GuideFAQ sections={SECTIONS} />
    </AdminPage>
  );
}
