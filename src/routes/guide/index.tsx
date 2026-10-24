import { createFileRoute, Link } from "@tanstack/react-router";
import {
  BookOpen,
  CircleHelp,
  Flag,
  Search,
  ShieldCheck,
  Sparkles,
  Trophy,
  User,
  Vote,
} from "lucide-react";
import { useMemo, useState } from "react";

import { AppShell, PageHeader } from "@/components/AppShell";
import { GuideFAQ } from "@/components/GuideFAQ";
import { filterGuideSections } from "@/lib/v3-public-guide-search";

export const Route = createFileRoute("/guide/")({
  head: () => ({
    meta: [
      { title: "Help — Solaris Studio" },
      {
        name: "description",
        content: "Searchable help for exploring Solaris, participating, voting, results, accounts, rules and fan features.",
      },
    ],
  }),
  component: PublicGuidePage,
});

const SECTIONS = [
  {
    title: "Start here",
    description: "The five main Solaris areas and what they are for.",
    questions: [
      {
        question: "What is Solaris Studio?",
        searchText: "home explore participate results me contest app",
        answer: (
          <>
            Solaris Studio is the digital home of Solaris Song Contest. The public app is organised around five
            stable areas: <strong>Home</strong> for what matters now, <strong>Explore</strong> for discovering the
            contest, <strong>Participate</strong> for responsibilities and participation, <strong>Results</strong>
            for official outcomes and analysis, and <strong>Me</strong> for your Solaris identity and account.
          </>
        ),
      },
      {
        question: "Where should I start?",
        searchText: "new user navigation home explore",
        answer: (
          <>
            Open <Link to="/" className="font-semibold text-primary">Home</Link> for the current contest context.
            If you want to browse rather than act, use <Link to="/explore" className="font-semibold text-primary">Explore</Link>.
            Solaris surfaces time-sensitive responsibilities through Participate instead of expecting you to remember
            a hidden route.
          </>
        ),
      },
      {
        question: "Do I need an account?",
        searchText: "anonymous sign in login account public",
        answer: (
          <>
            No. Public discovery, published results and other public content remain available without signing in.
            Sign in when a feature belongs to you, such as a delegation responsibility, saved fan activity or account
            settings. <Link to="/me" className="font-semibold text-primary">Me</Link> is the canonical entry point
            for personal identity and account access.
          </>
        ),
      },
    ],
  },
  {
    title: "Explore Solaris",
    description: "Find editions, countries, shows, stories and historical material.",
    questions: [
      {
        question: "How do I find an edition, country or show?",
        searchText: "edition country show artist song archive discover",
        answer: (
          <>
            Start in <Link to="/explore" className="font-semibold text-primary">Explore</Link>. It is the discovery
            area for editions, countries, artists, songs, shows, stories and archive material. Entity pages keep the
            relevant history and current public context together.
          </>
        ),
      },
      {
        question: "Where is historical and reference information?",
        searchText: "wiki encyclopedia history archive reference old editions",
        answer: (
          <>
            Historical discovery lives under Explore and the retained archive/reference surfaces. The
            <Link to="/wiki" className="font-semibold text-primary"> Wiki</Link> remains available for detailed
            country reference while the V3 archive migration converges older reference capabilities.
          </>
        ),
      },
      {
        question: "What is Solaris Pulse?",
        searchText: "pulse updates activity recent follow feed",
        answer: (
          <>
            Pulse is a contextual update feed for recent public Solaris activity. It is not a second task center:
            official responsibilities still belong in Participate, while Pulse helps you catch up on public changes.
          </>
        ),
      },
    ],
  },
  {
    title: "Participating and voting",
    description: "Official responsibilities and optional public participation stay clearly separated.",
    questions: [
      {
        question: "Where do I see what my delegation needs to do?",
        searchText: "responsibilities tasks confirmation entry media jury delegation hod",
        answer: (
          <>
            Open <Link to="/participate" className="font-semibold text-primary">Participate</Link>. It is the
            canonical place for official responsibilities such as Confirmation, Entry, Media and Jury, alongside a
            separate area for optional participation when available.
          </>
        ),
      },
      {
        question: "Where do I confirm participation or fix a requested change?",
        searchText: "confirmation correction changes required edit reopen response",
        answer: (
          <>
            Start from <Link to="/participate" className="font-semibold text-primary">Participate</Link>. Solaris
            should surface the current Confirmation state and the next valid action there. If an organizer requests
            a correction, follow that current responsibility rather than starting a second response.
          </>
        ),
      },
      {
        question: "How do Jury and public televoting differ?",
        searchText: "jury televote voting required optional ballot",
        answer: (
          <>
            Jury can be an official delegation responsibility, while public televoting is optional participation.
            Solaris keeps those meanings separate even when both happen during the same show. Always use the current
            action shown by Participate or the show experience; the server-confirmed state decides whether voting is
            open and whether a submission was accepted.
          </>
        ),
      },
      {
        question: "Can I change a submitted vote?",
        searchText: "edit ballot submitted voting receipt",
        answer: (
          <>
            Only when the authoritative voting round allows it. Use the state and actions Solaris shows after your
            submission. A successful submission is confirmed by the server, not merely by the browser showing a
            button press.
          </>
        ),
      },
    ],
  },
  {
    title: "Results and analysis",
    description: "Official outcomes first, deeper analysis second.",
    questions: [
      {
        question: "Where do I see the official result?",
        searchText: "winner ranking combined jury televote official result points",
        answer: (
          <>
            Open <Link to="/results" className="font-semibold text-primary">Results</Link>. The official published
            result is the primary content. Jury, televote and deeper analysis appear only when the relevant result
            layers are public.
          </>
        ),
      },
      {
        question: "Where can I see detailed voting?",
        searchText: "scorechart matrix detailed voting points table",
        answer: (
          <>
            Published detailed voting is available through the Results experience and
            <Link to="/scorecharts" className="font-semibold text-primary"> Scorecharts</Link> where the publication
            policy allows it.
          </>
        ),
      },
      {
        question: "What is Result Lab?",
        searchText: "simulation hypothetical result lab alternate weights jury televote",
        answer: (
          <>
            <Link to="/result-lab" className="font-semibold text-primary">Result Lab</Link> is analytical and
            hypothetical. It lets you explore alternate scenarios from published result data without changing the
            official result.
          </>
        ),
      },
      {
        question: "What is Taste DNA?",
        searchText: "personal taste ranking jury televote preference voting dna",
        answer: (
          <>
            Taste DNA is about <strong>your personal preference model</strong>: rank a published field and compare
            your taste with public result layers. Voting DNA is different; it analyses contest or country voting
            patterns rather than your private taste ballot.
          </>
        ),
      },
      {
        question: "Where are Records and other specialist tools?",
        searchText: "records relationships analysis compare tools statistics",
        answer: (
          <>
            Results progressively reveals deeper analysis after the official outcome. The
            <Link to="/tools" className="font-semibold text-primary"> Tools</Link> directory remains available for
            deliberate access to specialist analysis without turning the Results root into a wall of links.
          </>
        ),
      },
    ],
  },
  {
    title: "Me and your account",
    description: "Identity, history, personal activity and account controls belong together.",
    questions: [
      {
        question: "What is Me?",
        searchText: "identity account history activity receipts settings my solaris",
        answer: (
          <>
            <Link to="/me" className="font-semibold text-primary">Me</Link> is the V3 home for your Solaris
            identity, membership context, history, activity, receipts, following, saved content and account access.
            Legacy personal routes may remain during migration, but you should not need to choose between several
            competing personal dashboards.
          </>
        ),
      },
      {
        question: "How do I sign in or manage my account?",
        searchText: "login sign in password recovery email session device account",
        answer: (
          <>
            Open <Link to="/me" className="font-semibold text-primary">Me</Link>. If you are signed out, it provides
            the sign-in entry; when authenticated, it leads into your personal Solaris context and account controls.
            Authentication and delegation permissions are resolved by Solaris rather than inferred from which page
            you happened to open.
          </>
        ),
      },
      {
        question: "Where do I find things I did in older editions?",
        searchText: "history old editions activity receipts participation submissions",
        answer: (
          <>
            Historical memberships, participation and personal activity belong under Me. Historical views keep the
            edition context that applied at the time instead of silently replacing it with the current contest.
          </>
        ),
      },
    ],
  },
  {
    title: "Predictions and Fantasy",
    description: "Optional fan participation never masquerades as an official delegation responsibility.",
    questions: [
      {
        question: "How do Predictions work?",
        searchText: "predictions prediction league picks forecast fan optional",
        answer: (
          <>
            Open <Link to="/predictions" className="font-semibold text-primary">Predictions</Link> for available fan
            prediction rounds. Prediction state is separate from official contest results and delegation workflows.
          </>
        ),
      },
      {
        question: "What is Fantasy?",
        searchText: "fantasy fan game optional team league",
        answer: (
          <>
            Fantasy is optional fan participation. When available, Solaris shows its own state and deadlines without
            presenting it as something a delegation is required to complete.
          </>
        ),
      },
    ],
  },
  {
    title: "Rules, safety and more help",
    description: "Use official rules and contextual safety routes when the answer affects a real contest action.",
    questions: [
      {
        question: "Where are the official rules?",
        searchText: "rulebook rules regulation interpretation effective version",
        answer: (
          <>
            Open <Link to="/rules" className="font-semibold text-primary">Rules</Link> for the public rulebook.
            Workflow warnings should link to the relevant rule when a specific rule explains a requirement.
          </>
        ),
      },
      {
        question: "How do I report an integrity or safety concern?",
        searchText: "integrity report concern safety trust protected",
        answer: (
          <>
            Use <Link to="/integrity" className="font-semibold text-primary">Trust & Integrity</Link> for concerns
            that need a protected reporting or case process. Do not put sensitive case information into ordinary
            public feedback or search fields.
          </>
        ),
      },
      {
        question: "What if I know a page exists but cannot find it?",
        searchText: "directory all pages find route navigation sitemap",
        answer: (
          <>
            Search Solaris first. For deliberate low-frequency browsing, the
            <Link to="/site-directory" className="font-semibold text-primary"> Site Directory</Link> lists retained
            public destinations. Normal tasks should still be reachable from their canonical V3 area without needing
            the directory.
          </>
        ),
      },
    ],
  },
] as const;

function PublicGuidePage() {
  const [query, setQuery] = useState("");
  const filteredSections = useMemo(() => filterGuideSections(SECTIONS, query), [query]);
  const resultCount = useMemo(
    () => filteredSections.reduce((count, section) => count + section.questions.length, 0),
    [filteredSections],
  );

  return (
    <AppShell>
      <PageHeader
        eyebrow="Help"
        title="How can we help?"
        description="Start with the Solaris area that owns what you are trying to do. Search the guide for unusual cases."
      />

      <section className="mb-6 grid gap-2 sm:grid-cols-2 xl:grid-cols-3" aria-label="Help topics">
        <HelpRoute to="/explore" icon={CircleHelp} title="Explore" description="Discover editions, countries, shows, stories and archive material." />
        <HelpRoute to="/participate" icon={Flag} title="Participate" description="See responsibilities, corrections and optional participation." />
        <HelpRoute to="/results" icon={Trophy} title="Results" description="Open official outcomes first, then deeper analysis." />
        <HelpRoute to="/me" icon={User} title="Me & account" description="Identity, history, personal activity and account access." />
        <HelpRoute to="/predictions" icon={Sparkles} title="Predictions & Fantasy" description="Optional fan participation and prediction experiences." />
        <HelpRoute to="/rules" icon={BookOpen} title="Rules" description="Read and search the official SSC rulebook." />
        <HelpRoute to="/televoting/how-to-vote" icon={Vote} title="Voting help" description="Open detailed guidance for public voting." />
        <HelpRoute to="/integrity" icon={ShieldCheck} title="Report a concern" description="Use Trust & Integrity for protected reports and decisions." />
      </section>

      <section className="mb-6" aria-labelledby="guide-search-title">
        <h2 id="guide-search-title" className="sr-only">Search help</h2>
        <label className="relative block" htmlFor="guide-search">
          <Search
            className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <input
            id="guide-search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search help, e.g. jury, account or results"
            className="min-h-12 w-full rounded-2xl border border-border/75 bg-surface/45 pl-10 pr-4 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-primary/45 focus:ring-2 focus:ring-primary/15"
          />
        </label>
        {query.trim() ? (
          <div className="mt-2 flex min-h-8 items-center justify-between gap-3 text-xs text-muted-foreground">
            <p aria-live="polite">
              {resultCount === 1 ? "1 help answer" : `${resultCount} help answers`} found
            </p>
            <button
              type="button"
              onClick={() => setQuery("")}
              className="min-h-8 rounded-lg px-2 font-semibold text-foreground hover:bg-surface"
            >
              Clear search
            </button>
          </div>
        ) : null}
      </section>

      {filteredSections.length ? (
        <GuideFAQ sections={filteredSections} />
      ) : (
        <section className="data-panel rounded-2xl p-5" role="status">
          <h2 className="font-display text-lg font-semibold">No matching help topic</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Try a broader phrase, or use the canonical Solaris areas above. The Site Directory remains available for
            deliberate page-by-page browsing.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setQuery("")}
              className="min-h-11 rounded-xl border border-border bg-surface px-4 text-sm font-semibold"
            >
              Clear search
            </button>
            <Link
              to="/site-directory"
              className="inline-flex min-h-11 items-center rounded-xl border border-border bg-surface px-4 text-sm font-semibold"
            >
              Open Site Directory
            </Link>
          </div>
        </section>
      )}
    </AppShell>
  );
}

function HelpRoute({
  to,
  icon: Icon,
  title,
  description,
}: {
  to: string;
  icon: typeof CircleHelp;
  title: string;
  description: string;
}) {
  return (
    <Link
      to={to as any}
      className="group flex min-h-28 items-start gap-3 rounded-2xl border border-border/70 bg-surface/45 p-4 transition-colors hover:border-primary/30 hover:bg-surface/75"
    >
      <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-primary/15 bg-primary/[0.08] text-primary">
        <Icon className="size-4" aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold">{title}</span>
        <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">{description}</span>
      </span>
    </Link>
  );
}
