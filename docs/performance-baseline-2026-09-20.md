# Production performance baseline — 20 September 2026

## Evidence quality

Solaris is collecting real-user LCP, INP and CLS field telemetry. The current route/device groups are still small, generally 2–6 samples, so this document records **signals to investigate**, not universal conclusions.

## Current 14-day signals

Representative groups with at least two samples:

| Route | Device | Metric | Samples | p75 | Poor samples |
| --- | --- | --- | ---: | ---: | ---: |
| `/` | desktop | CLS | 3 | 0.777 | 2 |
| `/` | mobile | INP | 4 | 508 ms | 1 |
| `/` | mobile | LCP | 6 | 907 ms | 1 |
| `/editions/ssc-22` | desktop | CLS | 3 | 0.359 | 1 |
| `/results` | desktop | CLS | 3 | 0.248 | 1 |
| `/scorecharts` | desktop | CLS | 3 | 0.390 | 1 |
| `/shows` | desktop | CLS | 3 | 0.362 | 1 |
| `/my-solaris` | desktop | CLS | 3 | 0.019 | 0 |
| `/my-solaris` | desktop | INP | 2 | 52 ms | 0 |

The existing Organizer Public UX dashboard exposes route/device p75 and sample counts so these signals can be followed as the sample grows.

## Changes already made

- Passive live-result refresh was reduced from a 3-second database poll to a 30-second cadence.
- Focus and visibility changes still invalidate results promptly.
- Public IA starts on the canonical new shell, so a successful global-v3 lookup does not intentionally flash the old shell first.
- New completion products are rollout-gated and therefore cannot add production traffic before verification.

## Current priority

1. Accumulate a larger comparable sample.
2. Investigate repeated CLS on Home, edition detail, Results, Scorecharts and Shows.
3. Recheck mobile Home INP with a larger field sample and browser trace.
4. Avoid broad layout rewrites based on three observations.

Performance acceptance uses real sample counts beside every p75 value. Synthetic lab traces may diagnose a problem but are not mislabeled as field data.
