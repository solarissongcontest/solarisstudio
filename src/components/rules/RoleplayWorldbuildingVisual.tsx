import {
  ArrowRight,
  CheckCircle2,
  Clock3,
  Flag,
  History,
  Map,
  ShieldCheck,
  UsersRound,
} from "lucide-react";

const DORMANCY_EDITIONS = [1, 2, 3, 4, 5, 6] as const;

export function RoleplayWorldbuildingVisual() {
  return (
    <section
      className="space-y-4"
      aria-labelledby="roleplay-visual-guide"
      data-roleplay-worldbuilding-visual=""
    >
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-primary/75">
            Visual guide
          </p>
          <h2 id="roleplay-visual-guide" className="mt-1 text-lg font-bold tracking-[-0.02em]">
            Who controls what?
          </h2>
        </div>
        <Map className="size-5 text-primary/70" aria-hidden="true" />
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <VisualLane
          icon={Flag}
          eyebrow="Your country"
          title="You control the internal story"
          detail="Government, culture, cities, domestic events and the actions of institutions you control."
          accent="emerald"
        />
        <VisualLane
          icon={UsersRound}
          eyebrow="Shared story"
          title="Consent controls permanent effects"
          detail="Wars and diplomacy can be shared, but a protected country cannot be permanently rewritten by somebody else."
          accent="amber"
        />
        <VisualLane
          icon={Map}
          eyebrow="Official canon"
          title="One canonical map"
          detail="Permanent border and sovereignty outcomes are registered so official Solaris records never contradict each other."
          accent="sky"
        />
      </div>

      <div className="overflow-hidden rounded-[1.35rem] border border-indigo-300/15 bg-indigo-300/[0.045] p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.15em] text-indigo-200/70">
              Dormancy clock
            </p>
            <h3 className="mt-1 text-base font-bold">Six fully HODless completed Editions</h3>
          </div>
          <span className="inline-flex min-h-8 items-center gap-2 rounded-full border border-indigo-200/15 bg-black/10 px-3 text-[11px] font-bold text-indigo-100">
            <Clock3 className="size-3.5" aria-hidden="true" />
            Completed Editions only
          </span>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-6">
          {DORMANCY_EDITIONS.map((edition) => (
            <div
              key={edition}
              className={
                edition === 6
                  ? "rounded-xl border border-indigo-200/25 bg-indigo-200/10 px-2 py-3 text-center"
                  : "rounded-xl border border-white/[0.07] bg-black/10 px-2 py-3 text-center"
              }
            >
              <span className="block font-mono text-[10px] font-black text-muted-foreground">
                HODLESS
              </span>
              <span className="mt-1 block text-xl font-black">{edition}</span>
              <span className="mt-1 block text-[10px] leading-4 text-muted-foreground">
                {edition === 6 ? "Dormant after completion" : "Still protected"}
              </span>
            </div>
          ))}
        </div>

        <div className="mt-4 flex items-start gap-2 rounded-xl border border-white/[0.07] bg-black/10 px-3 py-3 text-xs leading-5 text-muted-foreground">
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
          <span>
            If the country has an active HOD at any point in an Edition, that Edition does not count toward the six-Edition Dormant threshold.
          </span>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <StatusCard
          icon={ShieldCheck}
          label="Protected"
          title="Active or fewer than six fully HODless Editions"
          items={[
            "May be invaded in roleplay",
            "Cannot be unilaterally annexed or erased",
            "Withdrawal alone does not remove protection",
          ]}
          tone="emerald"
        />
        <StatusCard
          icon={Map}
          label="Dormant"
          title="Six consecutive fully HODless Editions completed"
          items={[
            "May be permanently conquered or partitioned",
            "May be completely eliminated from the present-day map",
            "Historical SSC records remain untouched",
          ]}
          tone="indigo"
        />
      </div>

      <div className="rounded-[1.35rem] border border-white/[0.08] bg-black/10 p-4 sm:p-5">
        <div className="flex items-center gap-2">
          <History className="size-4.5 text-primary" aria-hidden="true" />
          <h3 className="text-sm font-bold">If an HOD returns</h3>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
          <ReturnState
            label="Before elimination"
            title="Protection resumes"
            detail="The country becomes protected again immediately. Unilateral permanent alteration stops."
          />
          <ArrowRight className="mx-auto hidden size-4 text-muted-foreground sm:block" aria-hidden="true" />
          <ReturnState
            label="After canonical elimination"
            title="A new outcome is needed"
            detail="Restoration, a successor state or another continuation may happen, but old borders do not automatically return."
          />
        </div>
      </div>
    </section>
  );
}

function VisualLane({
  icon: Icon,
  eyebrow,
  title,
  detail,
  accent,
}: {
  icon: typeof Map;
  eyebrow: string;
  title: string;
  detail: string;
  accent: "emerald" | "amber" | "sky";
}) {
  const accentClass =
    accent === "emerald"
      ? "border-emerald-300/15 bg-emerald-300/[0.05] text-emerald-200"
      : accent === "amber"
        ? "border-amber-300/15 bg-amber-300/[0.05] text-amber-200"
        : "border-sky-300/15 bg-sky-300/[0.05] text-sky-200";

  return (
    <article className={`rounded-[1.25rem] border p-4 ${accentClass}`}>
      <div className="flex items-center gap-2">
        <span className="grid size-9 place-items-center rounded-xl border border-current/15 bg-black/10">
          <Icon className="size-4" aria-hidden="true" />
        </span>
        <span className="text-[10px] font-black uppercase tracking-[0.14em] opacity-75">{eyebrow}</span>
      </div>
      <h3 className="mt-3 text-sm font-bold text-foreground">{title}</h3>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">{detail}</p>
    </article>
  );
}

function StatusCard({
  icon: Icon,
  label,
  title,
  items,
  tone,
}: {
  icon: typeof Map;
  label: string;
  title: string;
  items: string[];
  tone: "emerald" | "indigo";
}) {
  const classes =
    tone === "emerald"
      ? "border-emerald-300/15 bg-emerald-300/[0.045] text-emerald-200"
      : "border-indigo-300/15 bg-indigo-300/[0.045] text-indigo-200";

  return (
    <article className={`rounded-[1.35rem] border p-4 sm:p-5 ${classes}`}>
      <div className="flex items-center gap-2">
        <Icon className="size-4" aria-hidden="true" />
        <span className="text-[10px] font-black uppercase tracking-[0.15em]">{label}</span>
      </div>
      <h3 className="mt-2 text-sm font-bold text-foreground">{title}</h3>
      <ul className="mt-3 space-y-2">
        {items.map((item) => (
          <li key={item} className="flex gap-2 text-xs leading-5 text-muted-foreground">
            <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-current" aria-hidden="true" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </article>
  );
}

function ReturnState({ label, title, detail }: { label: string; title: string; detail: string }) {
  return (
    <article className="rounded-xl border border-white/[0.07] bg-white/[0.025] p-3.5">
      <p className="text-[10px] font-black uppercase tracking-[0.13em] text-primary/75">{label}</p>
      <p className="mt-1.5 text-sm font-bold">{title}</p>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">{detail}</p>
    </article>
  );
}
