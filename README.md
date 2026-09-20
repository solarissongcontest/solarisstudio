# Solaris Studio

Solaris Studio is the operating system behind Solaris Song Contest: editions, countries, entries, voting, broadcast, publication, predictions, historical reference and analytics.

## Current documentation

Start here for the current production architecture and release documentation.

- **Production status:** [MERGE_STATUS.md](./MERGE_STATUS.md)
- **Architecture:** [docs/architecture.md](./docs/architecture.md)
- **Permission model:** [docs/permission-engine-v2-authorization-inventory.md](./docs/permission-engine-v2-authorization-inventory.md)
- **Database and migrations:** [docs/database-and-migrations.md](./docs/database-and-migrations.md)
- **Testing and release gates:** [docs/testing-and-release.md](./docs/testing-and-release.md)
- **Public IA retirement evidence:** [docs/public-ia-v3-retirement-readiness-2026-09-20.md](./docs/public-ia-v3-retirement-readiness-2026-09-20.md)
- **Performance baseline:** [docs/performance-baseline-2026-09-20.md](./docs/performance-baseline-2026-09-20.md)
- **Accessibility verification:** [docs/accessibility-verification-2026-09-20.md](./docs/accessibility-verification-2026-09-20.md)
- **Legacy retirement inventory:** [docs/engineering/legacy-retirement-inventory-2026-09-20.md](./docs/engineering/legacy-retirement-inventory-2026-09-20.md)
- **Completion products:** [docs/products/completion-products.md](./docs/products/completion-products.md)

Historical implementation and merge plans live under `docs/archive/` and are not current architecture specifications.

## Architecture note

The large authenticated edition workspace implementation lives under:

`src/features/admin/edition/AdminEditionRoute.tsx`

The TanStack route file at:

`src/routes/_authenticated/admin/$slug.tsx`

is intentionally kept small and re-exports the route. Heavy editors are lazy-loaded behind their existing component paths.

## Development

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

CI regenerates TanStack's route tree before validating the build. `src/routeTree.gen.ts` is generated and must not be edited manually.

## Supabase

Browser-safe configuration:

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

Database migrations live in `supabase/migrations/`. Applied migrations are historical records; change production schema with a new migration rather than rewriting an applied one.

## Cloudflare Workers

Solaris Studio uses TanStack Start / Nitro and deploys to Cloudflare Workers.

```bash
bun install && bun run build
npx nitro deploy --prebuilt
```

Do not add `@cloudflare/vite-plugin`; Nitro already emits the Worker build used by the deployment flow.
