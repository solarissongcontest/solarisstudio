import { createFileRoute, Link } from "@tanstack/react-router";

import { AppShell, PageHeader } from "@/components/AppShell";
import { GuideFAQ } from "@/components/GuideFAQ";

export const Route = createFileRoute("/guide/")({
  head: () => ({
    meta: [
      { title: "How to use Solaris Studio" },
      {
        name: "description",
        content: "Simple answers to common questions about using the public Solaris Studio website.",
      },
    ],
  }),
  component: PublicGuidePage,
});

const SECTIONS = [
  {
    title: "Start here",
    description: "The basics if you have never used Solaris Studio before.",
    questions: [
      {
        question: "What is Solaris Studio?",
        answer: (
          <>
            Solaris Studio is the website for following Solaris Song Contest. You can look through editions, countries, entries, shows, results, records and voting history. Some pages also let you make predictions or take part in voting.
          </>
        ),
      },
      {
        question: "Do I need an account?",
        answer: (
          <>
            No. Most public pages work without an account. You only need to sign in for things linked to you, such as your country account or predictions.
          </>
        ),
      },
      {
        question: "Where should I start?",
        answer: (
          <>
            Use <Link to="/editions" className="font-semibold text-primary">Editions</Link> to choose a contest edition, <Link to="/countries" className="font-semibold text-primary">Countries</Link> to find a country, or <Link to="/shows" className="font-semibold text-primary">Shows</Link> to find a semi-final or final.
          </>
        ),
      },
    ],
  },
  {
    title: "Editions, countries and shows",
    questions: [
      {
        question: "How do I find an edition?",
        answer: (
          <>
            Open <Link to="/editions" className="font-semibold text-primary">Editions</Link>. Choose the edition you want. Its page shows the host, countries taking part, shows and available results.
          </>
        ),
      },
      {
        question: "How do I find a country?",
        answer: (
          <>
            Open <Link to="/countries" className="font-semibold text-primary">Countries</Link> and choose a country. A country page can show its entries, placements, points, history and other information added by the country.
          </>
        ),
      },
      {
        question: "What is the Wiki?",
        answer: (
          <>
            The <Link to="/wiki" className="font-semibold text-primary">Wiki</Link> is the longer information page for each country. It can include history, facts, images and extra sections. Think of it as the country&apos;s detailed profile.
          </>
        ),
      },
      {
        question: "How do I see a semi-final or final?",
        answer: (
          <>
            Open <Link to="/shows" className="font-semibold text-primary">Shows</Link>. Pick the show you want. If its results are public, the show page will display them.
          </>
        ),
      },
    ],
  },
  {
    title: "Results and voting",
    questions: [
      {
        question: "Where can I see full voting details?",
        answer: (
          <>
            Open <Link to="/scorecharts" className="font-semibold text-primary">Full Scorecharts</Link>. Choose a public show to see the full voting table.
          </>
        ),
      },
      {
        question: "What is Result Lab?",
        answer: (
          <>
            Result Lab lets you test a different version of an already published result. For example, you can change the jury and televote balance or remove a jury. It does not change the official result.
          </>
        ),
      },
      {
        question: "What are Voting links?",
        answer: (
          <>
            Voting links shows countries that often give each other points or have similar voting habits over time.
          </>
        ),
      },
      {
        question: "What are Records?",
        answer: (
          <>
            Records collects notable contest history, such as wins, placements, streaks and other all-time statistics.
          </>
        ),
      },
    ],
  },
  {
    title: "Predictions and tools",
    questions: [
      {
        question: "How do predictions work?",
        answer: (
          <>
            Open <Link to="/predictions" className="font-semibold text-primary">Predictions</Link>, choose an available round and make your picks before it closes. After the real result is public, you can compare your prediction with what happened.
          </>
        ),
      },
      {
        question: "What is Taste DNA?",
        answer: (
          <>
            Taste DNA compares your ranking with the jury, televote and overall results. It shows which one was closest to your own ranking.
          </>
        ),
      },
      {
        question: "What is Result replay?",
        answer: (
          <>
            Result replay plays through a published result and points out the biggest lead changes, jumps and other important moments.
          </>
        ),
      },
      {
        question: "What are Archive Games?",
        answer: (
          <>
            Archive Games are small games made from old Solaris results. They are another way to explore contest history.
          </>
        ),
      },
      {
        question: "Where are all the tools?",
        answer: (
          <>
            Open <Link to="/tools" className="font-semibold text-primary">Tools</Link> to see the result, prediction, comparison and archive tools in one place.
          </>
        ),
      },
    ],
  },
  {
    title: "Taking part",
    questions: [
      {
        question: "Where do I go if I need to confirm participation?",
        answer: (
          <>
            Open <Link to="/participate" className="font-semibold text-primary">Take part</Link>. If confirmations are open, the page will show what you can do and where to continue.
          </>
        ),
      },
      {
        question: "How do I vote in the televote?",
        answer: (
          <>
            Open the televoting page when voting is open. Follow the instructions for that round, choose your votes, check them, then submit them. The page will tell you if voting is closed or unavailable.
          </>
        ),
      },
      {
        question: "Can I change a submitted vote?",
        answer: (
          <>
            Only if that voting round allows it. Read the message shown after you submit. If editing is available, Solaris Studio will show the option there.
          </>
        ),
      },
    ],
  },
  {
    title: "Your Solaris account",
    questions: [
      {
        question: "How do I sign in?",
        answer: (
          <>
            Open <Link to="/auth" className="font-semibold text-primary">Sign in</Link>. Country accounts use the Instagram username as the Solaris Studio username. Admin accounts use their email address.
          </>
        ),
      },
      {
        question: "What is My Solaris?",
        answer: (
          <>
            My Solaris is your personal area. Depending on your account, it can show your profile, activity and country controls.
          </>
        ),
      },
      {
        question: "How do I edit my country page?",
        answer: (
          <>
            Sign in to the country account, open My Solaris, then open the country page editor. Change the section you want and save it. Appearance changes how the public country and Wiki pages look.
          </>
        ),
      },
      {
        question: "What if I forget my password?",
        answer: (
          <>
            If your country account has a recovery email, use Forgot password on the sign-in page. Solaris Studio sends a link so you can choose a new password. If no recovery email was added, you cannot reset it yourself.
          </>
        ),
      },
    ],
  },
];

function PublicGuidePage() {
  return (
    <AppShell>
      <PageHeader
        eyebrow="Help"
        title="How to use Solaris Studio"
        description="Choose a question below. The answers use simple words and tell you what to open."
      />
      <GuideFAQ sections={SECTIONS} />
    </AppShell>
  );
}
