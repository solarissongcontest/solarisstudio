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
        question: "What are the organizer pages?",
        answer: (
          <>
            They are the private pages used to run the contest. You can manage editions, entries, juries, televoting, results, confirmations, country accounts and broadcast design here.
          </>
        ),
      },
      {
        question: "How do I choose which edition I am working on?",
        answer: (
          <>
            Use the edition button at the top. Choose an edition from the list. Solaris Studio will keep you on the same type of page when it can.
          </>
        ),
      },
      {
        question: "What should I check first?",
        answer: (
          <>
            Open <Link to="/admin/operations" className="font-semibold text-primary">Overview</Link>. It shows the current edition, important missing items, deadlines and what to do next.
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
            Open All editions, choose an edition or create a new one, then fill in its basic details. Save after making changes.
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
            Open What visitors can see for the edition. Use it when you are ready to make entries, shows or results public. Keep anything private until it is ready to be shown.
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
            Open the edition and go to Entries. Choose the country, then add or edit the artist, song and other entry details. The same entry is used across that edition, even if it appears in both a semi-final and the final.
          </>
        ),
      },
      {
        question: "How do I manage country accounts?",
        answer: (
          <>
            Open More, then Country accounts. This page shows which user can sign in for each country and lets you manage access when needed.
          </>
        ),
      },
      {
        question: "How do I manage confirmations?",
        answer: (
          <>
            Open Delegations. You can see confirmation rounds, country responses and available places. Use the buttons there to open, close or review confirmations.
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
            Open the edition, then Jury. Choose the jury or country, enter the points, check them and save.
          </>
        ),
      },
      {
        question: "Why will jury votes not save?",
        answer: (
          <>
            First check that the correct edition and show are selected and that the country has an entry in that edition. If the page shows a specific error, follow that message. Do not create a second copy of the same entry just to make voting work.
          </>
        ),
      },
      {
        question: "Can I fix jury votes after saving them?",
        answer: (
          <>
            Yes, while editing is still allowed. Open that jury again, change the points and save the corrected vote.
          </>
        ),
      },
    ],
  },
  {
    title: "Televoting",
    questions: [
      {
        question: "How do I open televoting?",
        answer: (
          <>
            Open Televoting, choose the edition and round, check the settings, then open voting when everything is ready. Close it when voting should stop.
          </>
        ),
      },
      {
        question: "Where do I see submitted televotes?",
        answer: (
          <>
            Open the Televoting organizer pages. They show submitted votes and the information you need to check them.
          </>
        ),
      },
      {
        question: "What does a suspicious-vote warning mean?",
        answer: (
          <>
            It means Solaris Studio noticed a voting pattern worth checking. It is not automatic proof that someone cheated. Open the details, look at the information shown and decide whether any action is needed.
          </>
        ),
      },
      {
        question: "What happens if I remove a vote?",
        answer: (
          <>
            The removed vote no longer counts in the official result. Keep the reason accurate so the change history still explains what happened.
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
            Open Voting rules for the edition. Choose how much of the result should come from juries and how much should come from televoting, then save.
          </>
        ),
      },
      {
        question: "How do I calculate or publish results?",
        answer: (
          <>
            Make sure the votes are complete first. Use the result page for that edition to calculate the result, check it, then make it public only when it is correct.
          </>
        ),
      },
      {
        question: "Does Result Lab change the official result?",
        answer: (
          <>
            No. Result Lab is only for testing another version of a result. It does not change the official contest result.
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
            Open Broadcast for the selected edition. Use the design pages to change the artwork, colours, scoreboard and other broadcast visuals.
          </>
        ),
      },
      {
        question: "How do I change a country or Wiki page design?",
        answer: (
          <>
            Country page appearance is controlled from the country&apos;s own editor. Broadcast design and country-page design are separate.
          </>
        ),
      },
      {
        question: "What should I do before a live broadcast?",
        answer: (
          <>
            Check the entries, running order, jury votes, televote settings and result information first. Open the broadcast tools after those are correct.
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
            This page controls prediction rounds shown to public users. Use it to create or manage the rounds and their timing.
          </>
        ),
      },
      {
        question: "What is Public tester feedback?",
        answer: (
          <>
            This is where feedback from public-site testers is collected so you can see reported problems and improvement ideas.
          </>
        ),
      },
      {
        question: "What is System check?",
        answer: (
          <>
            It checks whether important parts of Solaris Studio are working and using the same information. If something needs attention, the page shows which part to check.
          </>
        ),
      },
      {
        question: "What does sync mean when I see it in an error?",
        answer: (
          <>
            It means keeping the same information up to date in every place that uses it. For example, if an entry changes, other pages that show that entry should update too.
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
