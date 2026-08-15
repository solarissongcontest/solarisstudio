# Solaris Studio

Solaris Studio is the operating system behind Solaris Song Contest: editions, countries, entries, voting, broadcast, publication, predictions and analytics.

## Architecture note

The large authenticated edition workspace implementation lives under:

`src/features/admin/edition/AdminEditionRoute.tsx`

The TanStack route file at:

`src/routes/_authenticated/admin/$slug.tsx`

is intentionally kept tiny and only re-exports the route. This keeps route generation and Lovable route indexing from having to parse the entire edition studio as one route module. Heavy editors such as Theme, Voting, Broadcast, Scoreboard and vote entry are lazy-loaded behind their existing public component paths.

## Development

Install dependencies and run the normal development server with Bun.

```bash
bun install
bun run dev
```

## Quality

```bash
bun run build
bun run typecheck
bun run test
bun run lint
```

The CI workflow also regenerates TanStack's route tree before validating the build. `src/routeTree.gen.ts` is generated and should not be edited manually.

## Supabase

The frontend expects these public environment variables:

```env
VITE_SUPABASE_PROJECT_ID=...
VITE_SUPABASE_URL=...
VITE_SUPABASE_PUBLISHABLE_KEY=...
```

Server/runtime configuration may additionally use:

```env
SUPABASE_PROJECT_ID=...
SUPABASE_URL=...
SUPABASE_PUBLISHABLE_KEY=...
```

Database migrations live in `supabase/migrations/`.

## Cloudflare Workers

Solaris Studio is built with TanStack Start / Nitro and can be deployed to Cloudflare Workers.

Build:

```bash
bun install && bun run build
```

Deploy the prebuilt Nitro output:

```bash
npx nitro deploy --prebuilt
```

Set the Supabase public environment variables in the Cloudflare project before deployment. After the production Cloudflare URL exists, update the corresponding Supabase Auth Site URL and allowed redirect URLs to the production domain.

Do not add `@cloudflare/vite-plugin` to this project. Nitro already emits the Cloudflare Worker build used by the deployment flow.
