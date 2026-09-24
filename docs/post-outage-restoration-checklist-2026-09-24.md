# Solaris Studio post-outage restoration checklist — 24 September 2026

Use this checklist before disabling global maintenance mode after the Supabase restriction clears.

## 1. Verify the platform, not just the dashboard

- Confirm the production Supabase project is no longer service-restricted.
- Verify an ordinary anonymous Data API read succeeds.
- Verify an authenticated read succeeds.
- Verify a harmless authenticated write in a non-production-critical test path succeeds and can be rolled back or cleaned up.
- Confirm no HTTP 402 service-restriction responses are being returned.
- Confirm egress usage has reset for the new billing period.

A green project-health badge alone is not sufficient.

## 2. Verify canonical application surfaces

Smoke-test at minimum:

- signed-out Home and public navigation;
- Countries and a real country profile;
- Editions and a real edition page;
- Shows and a real show detail page;
- Results and Scorecharts;
- Encyclopedia;
- Country Voting DNA;
- Prediction League;
- Fantasy SSC;
- Confirmations;
- Televoting;
- signed-in MySolaris;
- Country/HOD workspace;
- Organizer operations;
- Organizer Time Machine;
- Organizer Command Assistant;
- invalid/deep-link routes and permission-denied states.

## 3. Verify writes safely

Before reopening timed processes:

- submit and update a test confirmation;
- verify duplicate/replay protection;
- verify a test Televoting flow without publishing unintended results;
- verify Organizer mutations use Permission Engine v2;
- verify failed writes are visibly failed and never appear successful;
- verify no client automatically retries a mutation after an ambiguous response.

## 4. Accessibility representative matrix

Target remains WCAG 2.2 AA. Verify:

- keyboard-only global and section navigation;
- mobile drawer open/close, focus and Escape;
- command-palette focus return;
- Encyclopedia search/filter;
- Voting DNA country index and data table;
- Prediction League edition selector and leaderboard;
- Fantasy roster selection without drag-and-drop, captain selection and save state;
- Time Machine timestamp/evidence navigation;
- Command Assistant input and result navigation;
- 200% browser zoom;
- 320 px viewport reflow;
- large browser text;
- reduced-motion preference;
- loading, empty, unavailable and error states;
- statuses understandable without colour.

## 5. Performance re-baseline

The 24 September LCP sample is contaminated by the Supabase restriction. After restoration:

- collect fresh Web Vitals separately from the outage period;
- recheck Country profile mobile LCP/INP;
- recheck Home desktop CLS;
- recheck Editions, Results and Scorecharts desktop CLS;
- verify the archive-loading layout-reservation change reduced shifts;
- investigate only repeated post-restoration failures with useful sample counts.

Do not use the outage-era 119-second Country LCP as a normal baseline.

## 6. Deadline recovery

Before reopening Solaris Studio:

- identify every confirmation, voting, submission, publication or administrative deadline that fell during maintenance;
- publish replacement dates;
- ensure no participant is penalised for a deadline that elapsed while Solaris Studio was unavailable;
- reopen affected processes where necessary;
- make the replacement timetable visible before removing the maintenance page.

## 7. Remove maintenance mode

Only after the checks above:

1. set `GLOBAL_MAINTENANCE_MODE` to `false`;
2. run Quality;
3. run Browser Audit against the real application;
4. run Rules + Integrity migration rehearsal;
5. deploy;
6. perform production smoke verification;
7. verify the maintenance page is gone on every domain routed to the Solaris Studio Worker;
8. keep the maintenance implementation for one release as rollback insurance.

## 8. Follow-up cleanup

- retain client-side HTTP 402 detection as defence in depth;
- update the performance baseline with clean post-restoration field data;
- complete the Public IA v3 retirement evidence sample before deleting its fallback;
- review production advisors only after normal service is restored;
- do not mutate or rewrite already-applied migration history.
