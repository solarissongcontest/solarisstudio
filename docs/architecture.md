# Solaris Studio architecture

## Runtime

Solaris Studio is a single TanStack Start application deployed to Cloudflare Workers and backed by the production Supabase project.

The product has three primary experience layers:

1. **Public Solaris** — published contest information, participation, results and engagement products.
2. **MySolaris** — authenticated participant/delegation tasks, entry, voting, notices, country editing and account state.
3. **Solaris Organizer** — capability-protected contest operations, publication, Integrity, rules and administrative tooling.

Confirmations and Televoting are integrated product domains, not separate production applications.

## Canonical state

- Supabase is the canonical persisted state.
- Permission Engine v2 is the authorization model.
- Edition state and show publication controls determine what is public.
- Public historical products consume the same publication-safe data boundary as existing public pages.
- Result calculation does not imply result publication.
- Client clocks never decide deadlines for security-sensitive submissions.

## Routes and navigation

Public navigation uses the five-area IA: Home, Explore, Participate, Results and Me.

Organizer navigation is domain-based, with specialist tools discoverable through All Organizer tools and command/search surfaces.

TanStack route files are filesystem-generated. `src/routeTree.gen.ts` is generated during build and remains untracked.

## Feature rollout

Studio product surfaces use the central feature registry and database feature flags.

Lifecycle:

`planned → implemented/disabled → internal verification → rollout eligible → enabled`

A route existing is not enough to declare a feature production-ready.

## Data boundaries

Public products may use:

- published editions;
- published shows;
- publication-safe participants;
- published result rows;
- detailed ballots only where the detailed-voting publication switch permits them.

They may not expose drafts, organizer notes, private ballots, Integrity evidence or unpublished outcomes.

## Authorization

Organizer routes are authenticated and ultimately enforced by Permission Engine v2 plus database RLS/RPC capability checks.

Do not:

- authorize from `user_metadata`;
- expose service-role credentials to browser code;
- rebuild role logic ad hoc inside new products.

## Historical reconstruction

Time Machine is intentionally read-only and evidence-based. It can reconstruct only what Solaris actually recorded. Missing historical evidence is displayed as incomplete rather than synthesized.
