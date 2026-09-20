# Testing and release gates

## Required CI

A release candidate must pass:

- production build;
- fresh TanStack route generation;
- TypeScript;
- unit/integration tests;
- lint;
- Browser Audit;
- relevant migration/security rehearsal.

Tests are changed only when product behavior intentionally changes. Tests are not weakened merely to obtain a green check.

## Product verification

New public products must verify:

- feature-flag disabled state;
- publication boundary;
- loading/error/empty state;
- mobile layout;
- keyboard access;
- direct reload/deep link;
- search/navigation discovery;
- no private-data leakage.

Fantasy additionally verifies:

- exact roster size;
- uniqueness;
- eligibility;
- budget;
- server-time lock;
- captain membership;
- published-result scoring gate;
- deterministic scoring version.

Prediction League additionally verifies:

- scoring version remains historical;
- public leaderboard opt-in;
- result-publication isolation.

## Public IA legacy retirement

Legacy navigation deletion is not controlled by opinion. Existing Beta 3 gates, production telemetry, green CI and manual role/device smoke must all pass. Insufficient sample size is a blocker, not permission to round the number upward until it becomes emotionally convenient.
