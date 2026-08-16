import { createFileRoute, Link } from "@tanstack/react-router";
import { Calculator, ShieldAlert, ShieldCheck, Sparkles, Vote } from "lucide-react";

const STEPS = [
  {
    icon: Vote,
    title: "1. Register",
    body: "Choose a display name and your home Solaris country. Your home country is your voter identity, even when the entries receiving points are not countries.",
  },
  {
    icon: Sparkles,
    title: "2. Spread your 20 points",
    body: "Give out exactly 20 points across at least 5 different entries, with a maximum of 10 points to any single entry. Where self-voting restrictions apply, your own eligible entry is locked.",
  },
  {
    icon: ShieldCheck,
    title: "3. One genuine ballot",
    body: "Each round accepts one televote per voter. Vote according to your own preferences rather than coordinating scores with other delegations or arranging reciprocal support.",
  },
  {
    icon: Calculator,
    title: "4. Conversion to televote points",
    body: "After voting closes, eligible entries are ranked from the submitted results and converted into the organizer's fixed televote point pool. Published converted points are whole numbers and the allocated pool is kept exact.",
  },
] as const;

export const Route = createFileRoute("/televoting/how-to-vote")({
  head: () => ({
    meta: [
      { title: "How to Vote — Solaris Studio" },
      { name: "description", content: "Rules for the Solaris Song Contest televote." },
    ],
  }),
  component: HowToVotePage,
});

function HowToVotePage() {
  return (
    <div className="mx-auto max-w-3xl py-4 sm:py-8">
      <header className="mb-8 text-center">
        <p className="text-[10px] uppercase tracking-[0.28em] text-sky-100/70">Solaris Televoting</p>
        <h1 className="font-display mt-3 text-5xl uppercase leading-[0.9] sm:text-6xl">How the televote works</h1>
        <p className="mx-auto mt-5 max-w-xl text-sm leading-relaxed text-muted-foreground">Everything you need to know before casting a Solaris televote.</p>
      </header>

      <div className="space-y-3">
        {STEPS.map(({ icon: Icon, title, body }) => (
          <section key={title} className="glass flex gap-4 p-5">
            <div className="grid size-10 shrink-0 place-items-center rounded-xl border border-sky-200/15 bg-sky-200/10 text-sky-100"><Icon className="size-5" /></div>
            <div><h2 className="font-medium">{title}</h2><p className="mt-1 text-sm leading-relaxed text-muted-foreground">{body}</p></div>
          </section>
        ))}
      </div>

      <section className="mt-4 rounded-[2rem] border border-amber-300/25 bg-amber-300/8 p-5">
        <div className="flex gap-3">
          <ShieldAlert className="mt-0.5 size-5 shrink-0 text-amber-200" />
          <div>
            <h2 className="font-medium">Fair-voting and friend-voting warning</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">Your ballot should reflect your genuine preferences. Do not coordinate scores, arrange reciprocal support or maximum-score swaps, submit duplicate ballots, or attempt to manipulate the result.</p>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">Coordinated, duplicate, manipulated, or otherwise invalid ballots may be automatically excluded, reviewed by the organizers, or removed from the official result. Integrity checks are supporting evidence and do not claim to identify every possible case perfectly.</p>
          </div>
        </div>
      </section>

      <div className="mt-6 flex justify-center"><Link to="/televoting" className="inline-flex min-h-11 items-center justify-center rounded-xl border border-white/12 bg-white/[0.05] px-5 text-sm transition hover:bg-white/[0.08]">Back to Televoting</Link></div>
    </div>
  );
}
