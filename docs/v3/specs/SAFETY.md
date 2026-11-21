# CRITICAL SOLARIS STUDIO INFRASTRUCTURE RULE: PROTECT SUPABASE EGRESS

This instruction is permanent and takes priority over convenience, speed, testing coverage, or implementation workflow.

Solaris Studio previously consumed almost the entire Supabase Free Plan egress allowance because automated GitHub Actions / Playwright browser tests repeatedly connected to the hosted production Supabase project. This must NEVER be allowed to happen again.

## Absolute rule

AUTOMATED TESTING, CI, GITHUB ACTIONS, PLAYWRIGHT, BROWSER AUDITS, DEVELOPMENT BUILDS, PREVIEW BUILDS, QA CRAWLS, SCREENSHOT TESTS, MIGRATION REHEARSALS, AND OTHER MACHINE-GENERATED TEST TRAFFIC MUST NEVER CONNECT TO THE PRODUCTION/HOSTED SOLARIS STUDIO SUPABASE PROJECT.

Production Supabase is for the real Solaris Studio application and legitimate production users only.

## Required architecture

1. GitHub Actions and CI must use an isolated LOCAL Supabase stack, normally:
   http://127.0.0.1:54321
   or another explicitly local/loopback address.

2. Browser Audit / Playwright must start and use its own local Supabase instance.

3. CI must fail immediately if a Supabase URL resolves to:
   https://*.supabase.co
   or any other hosted/non-local Supabase endpoint.

4. Production Supabase configuration must never be made available to CI unless there is an exceptional, explicitly approved production smoke test whose scope is deliberately tiny.

5. Never use production Supabase as a convenient fallback when:
   - E2E environment variables are missing
   - local Supabase fails to start
   - mocks are unavailable
   - test data is missing
   - a browser test requires real data

   In all such cases, FAIL THE TEST instead of falling back to production.

6. All Supabase clients used by CI must be isolated, including:
   - VITE_SUPABASE_URL
   - SUPABASE_URL
   - E2E_SUPABASE_URL
   - VITE_CONFIRMATIONS_SUPABASE_URL
   - CONFIRMATIONS_SUPABASE_URL
   - any future Supabase client, schema, service, integration, or environment variable

7. Production Supabase credentials and URLs should live only in the production runtime configuration, especially Cloudflare where appropriate. Do not expose them unnecessarily to GitHub Actions.

8. Never commit privileged Supabase credentials, service-role keys, database passwords, or other production secrets to the repository.

## CI safety guards must remain permanent

The repository must retain automated safeguards that verify:

- Playwright workflows use local Supabase.
- Browser CI refuses hosted Supabase URLs.
- Quality CI cannot silently fall back to production configuration.
- Legacy Confirmations clients cannot escape to hosted Supabase during CI.
- New workflows cannot introduce hosted Supabase access without failing CI.

If any change removes, weakens, bypasses, or replaces one of these safeguards, treat that change as a HIGH-RISK INFRASTRUCTURE REGRESSION.

Do not remove a guard simply because it makes a test difficult to run.

Fix the test architecture instead.

## When adding new workflows or tests

Before creating or modifying any:

- GitHub Action
- Playwright test
- browser audit
- crawler
- screenshot suite
- integration test
- migration rehearsal
- load test
- automated QA process

check whether it can generate Supabase traffic.

If yes, explicitly prove that it uses LOCAL/ISOLATED Supabase before allowing it to run.

Do not assume this from naming or configuration.

Verify it.

## Production smoke tests

If a real production Supabase smoke test is genuinely required:

- it must be deliberately designed as a tiny bounded test
- it must not crawl pages
- it must not run across viewport matrices
- it must not loop through countries, editions, shows, participants, results, votes, or other large datasets
- it must not run on every commit
- it must not run repeatedly because of branch updates
- it must have an explicit request/query budget
- it must stop immediately on unexpected repetition
- it should preferably be manually triggered

Normal CI must NEVER require production Supabase.

## Egress-awareness rule

When implementing a feature, consider both the number of requests and the amount of data returned.

Avoid:

- repeated fetching of the same static data
- unnecessary polling
- duplicated queries across components
- querying large tables when only a few fields are needed
- refetching countries, editions, shows, results, participants, rulebooks, etc. unnecessarily
- uncontrolled retries
- request loops
- mounting multiple duplicate realtime subscriptions
- downloading full records where a small projection is sufficient

Prefer caching, deduplication, query narrowing, and server-side aggregation where appropriate.

## Emergency behavior

If Supabase traffic unexpectedly spikes:

1. Stop or cancel automated jobs generating the traffic.
2. Identify the caller from Supabase Edge Logs.
3. Check source organization/IP/user-agent and requested paths.
4. Disable the offending workflow or process before continuing development.
5. Do not continue high-volume testing until the cause is understood and fixed.
6. Verify afterward that automated requests have fallen back to normal/zero levels.

## Migration rule

Whenever Solaris Studio migrates to a new Supabase project:

DO NOT point CI or browser testing at the new production project.

Before production cutover, verify that:

- Browser Audit uses local Supabase.
- Quality CI uses isolated/local Supabase values.
- no GitHub Action contains the new production Supabase URL
- no GitHub Action receives production Supabase credentials
- automated tests cannot fall back to the new production project
- egress protections and regression tests still pass

Only then may the new production Supabase project be connected to Solaris Studio.

## Decision rule for ChatGPT / coding agents

When working on Solaris Studio, NEVER trade these protections away just to make implementation or tests easier.

If a requested implementation would cause CI, browser tests, automated agents, or development tooling to generate significant traffic against production Supabase, redesign the implementation instead.

If uncertain whether something might use production Supabase, investigate before running it.

Assume that uncontrolled automated production Supabase traffic is a release-blocking defect.

Protecting production egress is part of correctness, not an optional optimization.

The previous ~5 GB egress incident must not be repeated.