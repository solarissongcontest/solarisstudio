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
    description: "The quickest way to understand the organizer side.",
    questions: [
      {
        question: "What is the organizer workspace?",
        answer: <>It is the private part of Solaris Studio used to run the contest. You can manage editions, entries, juries, televoting, results, confirmations, country accounts and broadcast design here.</>,
      },
      {
        question: "How do I choose which edition I am working on?",
        answer: <>Use the edition button at the top of the organizer pages. Choose an edition from the list. Solaris Studio will keep you on the same type of page when it can.</>,
      },
      {
        question: "What should I check first?",
        answer: <>Open <Link to="/admin/operations" className="font-semibold text-primary">Overview</Link>. It shows the current edition, important missing items, deadlines and things that may need attention.</>,
      },
    ],
  },
  {
    title: "Editions and shows",
    questions: [
      {
        question: "How do I create or edit an edition?",
        answer: <>Open All editions, choose an edition or create a new one, then fill in its basic details. Save after making changes.</>,
      },
      {
        question: "How do I add a semi-final or final?",
        answer: <>Open the edition, then go to Shows. Add the show you need, choose its type and order, then save it.</>,
      },
      {
        question: "What does publication mean?",
        answer: <>Publication controls what visitors are allowed to see. Use it when you are ready to make entries, shows or results public. If something should stay secret, do not publish it yet.</>,
      },
    ],
  },
  {
    title: "Entries and countries",
    questions: [
      {
        question: "How do I add or change an entry?",
        answer: <>Open the edition and go to Entries. Choose the country, then add or edit the artist, song and other entry details. The same entry is used across that edition, even if it appears in both a semi-final and the final.</>,
      },
      {
        question: "How do I manage country accounts?",
        answer: <>Open More, then Country accounts. Use this page to see which user controls each country and to deal with account access when needed.</>,
      },
      {
        question: "How do I manage confirmations?",
        answer: <>Open Delegations. You can see confirmation rounds, country responses and available places. Use the buttons on those pages to open, close or review confirmation activity.</>,
      },
    ],
  },
  {
    title: "Jury voting",
    questions: [
      {
        question: "Where do I enter jury votes?",
        answer: <>Open the edition, then Jury. Choose the jury or country, enter the points, check them and save.</>,
      },
      {
        question: "Why will jury votes not save?",
        answer: <>First check that the correct edition and show are selected and that the country has an entry in that edition. If the page shows a specific error, follow that message. Do not create a second copy of the same entry just to make voting work.</>,
      },
      {
        question: "Can I fix jury votes after saving them?",
        answer: <>Yes, while the organizer tools still allow editing. Open that jury again, change the points and save the corrected ballot.</>,
      },
    ],
  },
  {
    title: "Televoting",
    questions: [
      {
        question: "How do I open televoting?",
        answer: <>Open Televoting, choose the edition and round, check the settings, then open voting when everything is ready. Close it when voting should stop.</>,
      },
      {
        question: "Where do I see submitted televotes?",
        answer: <>Use the televoting organizer pages. They show submitted votes and the information needed to review them.</>,
      },
      {
        question: "What does a suspicious-voting warning mean?",
        answer: <>It means Solaris Studio noticed a voting pattern worth checking. It is not automatic proof that someone cheated. Open the details, review the evidence and decide whether any action is needed.</>,
      },
      {
        question: "What happens if I remove a vote?",
        answer: <>The removed vote no longer counts in the official result. Keep the reason accurate so the moderation history still explains what happened.</>,
      },
    ],
  },
  {
    title: "Results",
    questions: [
      {
        question: "How do I set the jury and televote balance?",
        answer: <>Open the edition&apos;s voting-system page. Choose how much of the result should come from juries and how much should come from televoting, then save.</>,
      },
      {
        question: "How do I calculate or publish results?",
        answer: <>Make sure the votes are complete first. Use the result tools for that edition to calculate the result, check it, then publish it only when it is correct.</>,
      },
      {
        question: "Does Result Lab change the official result?",
        answer: <>No. Result Lab is only for testing alternative outcomes. It does not overwrite the official contest result.</>,
      },
    ],
  },
  {
    title: "Broadcast and design",
    questions: [
      {
        question: "Where do I change the edition design?",
        answer: <>Open Broadcast for the selected edition. Use the design and theme pages to change the visual look used by the edition and broadcast tools.</>,
      },
      {
        question: "How do I change a country or Wiki page design?",
        answer: <>Country page appearance is controlled from the country&apos;s own editor. Organizer broadcast design and country-page design are separate, so changing one should not silently change the other.</>,
      },
      {
        question: "What should I do before a live broadcast?",
        answer: <>Check the entries, running order, jury data, televote settings and result data first. Open the broadcast tools only after those are correct. A beautiful wrong scoreboard is still wrong, tragically.</>,
      },
    ],
  },
  {
    title: "Other organizer pages",
    questions: [
      {
        question: "What is Predictions?",
        answer: <>This page controls prediction rounds shown to public users. Use it to create or manage the rounds and their timing.</>,
      },
      {
        question: "What is Beta feedback?",
        answer: <>This is where feedback from testers is collected so you can see reported problems and improvement ideas.</>,
      },
      {
        question: "What is System health?",
        answer: <>It shows whether important parts of Solaris Studio are working and whether data is moving between connected parts correctly. If it says something is wrong, open the affected item for more detail.</>,
      },
      {
        question: "What does sync mean?",
        answer: <>It simply means keeping the same information up to date in the places that use it. For example, if an entry changes, other pages that show that entry should update too.</>,
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
        description="Open a question to see a simple answer. No developer language required."
      />
      <GuideFAQ sections={SECTIONS} />
    </AdminPage>
  );
}
