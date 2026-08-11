import { Link } from "@tanstack/react-router";

import { useContentEvents } from "@/lib/engagement-data";

export function PulseStrip() {
  const { data } = useContentEvents(3);
  const events = data?.events ?? [];

  return (
    <section className="glass p-4 sm:p-5" aria-labelledby="pulse-strip-title">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-primary">
            Solaris Pulse
          </p>
          <h2 id="pulse-strip-title" className="mt-1 font-display text-xl font-bold">
            What changed since your last visit?
          </h2>
        </div>
        <Link to="/pulse" className="shrink-0 text-xs font-bold text-primary">
          Open →
        </Link>
      </div>

      {events.length ? (
        <div className="mt-4 grid gap-2 sm:grid-cols-3">
          {events.map((event) => (
            <a key={event.id} href={event.route} className="rounded-xl bg-surface px-3 py-3">
              <p className="text-[8px] font-bold uppercase tracking-[0.13em] text-muted-foreground">
                {event.event_type.replaceAll("_", " ")}
              </p>
              <p className="mt-1 line-clamp-2 text-sm font-semibold">{event.title}</p>
            </a>
          ))}
        </div>
      ) : (
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          Current edition status, open predictions and followed-country updates are collected in
          one compact view.
        </p>
      )}
    </section>
  );
}
