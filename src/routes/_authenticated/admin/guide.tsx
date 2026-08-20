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
    description: "The quickest way to understand the organizer pages.",
    questions: [
      {
        question: "What is the Organizer workspace?",
        answer: (
          <>
            It is the private part of Solaris Studio used to run the contest. You can manage editions, entries,
            jury voting, televoting, results, confirmations, country accounts and broadcast design here.
          </>
        ),
      },
      {
        question: "How do I choose which edition I am working on?",
        answer: (
          <>
            Use the edition button at the top. Choose an edition from the list. Solaris Studio keeps you on the
            same type of page when it can.
          </>
        ),
      },
      {
        question: "What should I check first?",
        answer: (
          <>
            Open <Link to="/admin/operations" className="font-semibold text-primary">Overview</Link>. It shows the
            current edition, important missing items, deadlines and what needs attention next.
          </>
        ),
      },
    ],
  },
  {
    title: "Editions and shows",
    questions: [
      {
        question: "How do I create or edit an edition?",
        answer: (
          <>
            Open All editions, choose an edition or create a new one, then fill in its basic details. Save after
            making changes.
          </>
        ),
      },
      {
        question: "How do I add a semi-final or final?",
        answer: (
          <>
            Open the edition, then open Shows. Add the show you need, choose its type and order, then save it.
          </>
        ),
      },
      {
        question: "How do I choose what visitors can see?",
        answer: (
          <>
            Open Publication for the edition. Use it to choose which entries, shows or results are public. Keep
            anything private until it is ready to be shown.
          </>
        ),
      },
    ],
  },
  {
    title: "Entries and countries",
    questions: [
      {
        question: "How do I add or change an entry?",
        answer: (
          <>
            Open the edition and go to Entries &amp; running order. Choose the country, then add or edit the artist,
            song and other entry details. The same entry is used across that edition, even if it appears in both a
            semi-final and the final.
          </>
        ),
      },
      {
        question: "How do I manage country accounts?",
        answer: (
          <>
            Open More, then Country accounts. This page shows which account belongs to each country and lets you
            manage editing access when needed.
          </>
        ),
      },
      {
        question: "How do I manage confirmations?",
        answer: (
          <>
            Open Delegations. You can see confirmation rounds, country responses and available places. Use the
            controls there to open, close or review confirmations.
          </>
        ),
      },
      {
        question: "Can a signed-in country account edit its confirmation without a recovery code?",
        answer: (
          <>
            Yes. Solaris Studio matches the signed-in country account to that country&apos;s saved confirmation. If
            editing is allowed for the edition, round and response, the country sees Edit your response and can
            open it directly. Recovery codes remain available as a fallback.
          </>
        ),
      },
      {
        question: "What is HOD history?",
        answer: (
          <>
            HOD history records who managed a country in past editions. Solaris Studio uses that history when it
            needs to understand voting activity over time.
          </>
        ),
      },
    ],
  },
  {
    title: "Jury voting",
    questions: [
      {
        question: "Where do I enter jury votes?",
        answer: (
          <>
            Open the edition, then Jury voting. Choose the jury or country, enter the points, check them and save.
          </>
        ),
      },
      {
        question: "Why will jury votes not save?",
        answer: (
          <>
            First check that the correct edition and show are selected and that the country has an entry in that
            edition. If the page shows a specific error, follow that message. Do not create a second copy of the
            same edition entry just to make voting work.
          </>
        ),
      },
      {
        question: "Can I fix jury votes after saving them?",
        answer: (
          <>
            Yes, while editing is still allowed. Open that jury again, change the points and save the corrected
            vote.
          </>
        ),
      },
    ],
  },
  {
    title: "Televoting",
    questions: [
      {
        question: "How do I open public televoting?",
        answer: (
          <>
            Open Voting, then Rounds &amp; entries. Choose the edition and round, check the settings and entries,
            then open voting when everything is ready. Close it when voting should stop.
          </>
        ),
      },
      {
        question: "Where do I see submitted televotes?",
        answer: (
          <>
            Open Voting. The voting pages show submitted ballots and the information you need to review them.
          </>
        ),
      },
      {
        question: "What does an Integrity warning mean?",
        answer: (
          <>
            It means Solaris Studio noticed a voting pattern worth checking. It is not automatic proof that
            someone cheated. Open Integrity, read the information shown and decide whether any action is needed.
          </>
        ),
      },
      {
        question: "What is Voting analytics?",
        answer: (
          <>
            Voting analytics shows useful numbers about turnout, how points were spread and how countries or
            entries voted. It is for understanding the vote, not changing it.
          </>
        ),
      },
      {
        question: "What happens if I remove a vote?",
        answer: (
          <>
            A removed vote no longer counts in the official result. Keep the reason accurate so the history still
            explains what happened.
          </>
        ),
      },
    ],
  },
  {
    title: "Results",
    questions: [
      {
        question: "How do I set the jury and televote balance?",
        answer: (
          <>
            Open Voting system for the edition. Choose how much of the result should come from juries and how much
            should come from televoting, then save.
          </>
        ),
      },
      {
        question: "Where do I work with televote points?",
        answer: (
          <>
            Open Televote totals for the edition. This is where the televote points used by the show result are
            reviewed or entered.
          </>
        ),
      },
      {
        question: "How do I calculate or publish results?",
        answer: (
          <>
            Make sure the votes are complete first. Open the result page for that edition, calculate the result,
            check it carefully, then make it public only when it is correct.
          </>
        ),
      },
      {
        question: "Does Result Lab change the official result?",
        answer: (
          <>
            No. Result Lab is only for testing another version of a published result. It never changes the official
            contest result.
          </>
        ),
      },
    ],
  },
  {
    title: "Broadcast and design",
    questions: [
      {
        question: "Where do I change the edition design?",
        answer: (
          <>
            Open Design &amp; broadcast for the selected edition. That page contains the artwork, colours,
            scoreboard and other broadcast settings.
          </>
        ),
      },
      {
        question: "How do I change a country or Wiki page design?",
        answer: (
          <>
            Country page appearance is controlled from the country&apos;s own editor in My Solaris. Design &amp;
            broadcast and country-page appearance are separate.
          </>
        ),
      },
      {
        question: "What should I do before a live broadcast?",
        answer: (
          <>
            Check the entries, running order, jury votes, televote settings and result information first. Open the
            broadcast tools after those are correct.
          </>
        ),
      },
    ],
  },
  {
    title: "Other organizer pages",
    questions: [
      {
        question: "What is Predictions?",
        answer: (
          <>
            Predictions controls the prediction rounds shown to public users. Use it to create or manage the
            rounds and their timing.
          </>
        ),
      },
      {
        question: "What is Public beta feedback?",
        answer: (
          <>
            Public beta feedback collects what public-site testers reported so you can see problems, confusing
            parts and improvement ideas.
          </>
        ),
      },
      {
        question: "What is Admin acceptance test?",
        answer: (
          <>
            Admin acceptance test is the organizer testing checklist. It helps make sure the important organizer
            tasks were actually tried before a release.
          </>
        ),
      },
      {
        question: "What is Admin beta coverage?",
        answer: (
          <>
            Admin beta coverage compares recent organizer test results and shows which areas still have not been
            tested properly.
          </>
        ),
      },
      {
        question: "What is Sync health?",
        answer: (
          <>
            Sync health checks whether important parts of Solaris Studio are using the same information. If
            something needs attention, it shows which part to check.
          </>
        ),
      },
      {
        question: "What does sync mean when I see it in an error?",
        answer: (
          <>
            It means keeping the same information up to date in every place that uses it. For example, if an entry
            changes, other pages that show that entry should update too.
          </>
        ),
      },
      {
        question: "What is System settings?",
        answer: (
          <>
            System settings contains site-wide organizer settings such as deadlines and maintenance tools. Most
            everyday contest work happens elsewhere.
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
        description="Open a question to see a simple answer and what to do next."
      />
      <GuideFAQ sections={SECTIONS} />
    </AdminPage>
  );
}
