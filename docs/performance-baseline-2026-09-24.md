# Production performance baseline — 24 September 2026

## Evidence quality

Solaris is collecting real-user LCP, INP and CLS field telemetry. The 24 September snapshot has more samples than the 20 September baseline, but the production Supabase service is currently restricted. Network-dependent LCP and some interaction timings collected during the restriction are therefore **not a clean performance baseline**.

Treat repeated layout-shift signals as actionable now. Re-baseline network/data performance after normal Supabase service resumes.

## Current 14-day signals

Representative route/device/metric groups with at least two samples:

| Route | Device | Metric | Samples | p75 | Poor samples |
| --- | --- | --- | ---: | ---: | ---: |
| `/countries/ABE` | mobile | LCP | 12 | 10,241 ms | 11 |
| `/` | desktop | CLS | 6 | 0.7725 | 4 |
| `/countries/OLA` | mobile | LCP | 3 | 6,408 ms | 3 |
| `/countries/ABE` | mobile | INP | 6 | 880 ms | 3 |
| show detail | mobile | CLS | 6 | 0.407 | 3 |
| show detail | mobile | LCP | 23 | 3,015 ms | 2 |
| `/editions/ssc-20` | mobile | LCP | 7 | 2,910 ms | 2 |
| `/` | mobile | LCP | 12 | 1,032.5 ms | 2 |
| `/countries` | mobile | INP | 3 | 732 ms | 2 |
| `/` | mobile | INP | 8 | 310 ms | 2 |
| `/editions/ssc-20` | desktop | CLS | 2 | 0.75925 | 2 |
| `/scorecharts` | desktop | CLS | 5 | 0.728 | 2 |
| `/editions/ssc-22` | desktop | CLS | 4 | 0.718 | 2 |
| `/editions` | desktop | CLS | 4 | 0.715 | 2 |
| `/countries/ABE` | desktop | CLS | 2 | 0.715 | 2 |
| `/results` | desktop | CLS | 4 | 0.4715 | 2 |
| `/countries` | desktop | CLS | 2 | 0.454 | 2 |
| `/voting-dna` | desktop | CLS | 3 | 0.3615 | 1 |
| `/encyclopedia` | desktop | CLS | 5 | 0.004 | 1 |
| `/my-solaris` | desktop | LCP | 3 | 232 ms | 0 |

Extreme values such as the 119,376 ms desktop LCP sample group on `/countries/ABE` are treated as outage-contaminated evidence, not as a normal product baseline.

## Changes already made

- Passive live-result refresh was reduced from a 3-second database poll to a 30-second cadence.
- Focus and visibility changes still invalidate results promptly.
- Country theme/background data is route-scoped rather than fetched globally.
- Stable public reference data uses longer cache lifetimes.
- Country profile rendering no longer blocks its identity surface on the full historical archive.
- The country placement chart is lazy-loaded and no longer forces the charting bundle into every country-profile visit.
- Factual country flags use explicit dimensions and priority where they are above-the-fold.
- Archive loading states reserve viewport-height layout space so the normal page does not replace a tiny loading card and push the footer/content through the viewport.
- During the current outage, the global maintenance response prevents normal application polling and Supabase-backed route rendering.

## Current priority

1. Keep the archive-loading layout-reservation fix and re-measure CLS after normal service resumes.
2. Re-baseline country-profile LCP/INP after the database restriction clears.
3. Recheck Home, Editions, Results and Scorecharts CLS with clean post-restoration field samples.
4. Investigate any route that still has repeated poor CLS after the loading-state change.
5. Avoid architecture rewrites based on outage-contaminated LCP.

Performance acceptance must show sample counts beside p75 values. Synthetic traces may diagnose a problem but are not field data.
