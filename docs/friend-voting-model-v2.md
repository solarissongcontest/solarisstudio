# Friend-voting model v2

Solaris Studio uses `friend-voting-model-v2` for organizer-facing relationship analysis.

## Purpose

The model estimates how unusual a voter/controller → target-country relationship is relative to available historical evidence. It is a review signal, not an adjudication engine and never establishes guilt by itself.

## Evidence layers

1. Relationship anomaly: opportunity-aware support frequency, maximum-score concentration and observed score magnitude.
2. Historical deviation: comparison with the same controller/target history where available, otherwise a conservative controller-level baseline.
3. Reciprocity: mutual support across comparable editions, smoothed for small samples.
4. Intensity: normalized score intensity and maximum-score behaviour relative to the controller's wider behaviour.
5. Jury and televote: analyzed independently, then reported together.
6. Cross-channel: repeated support by the same controller in both channels in the same edition is corroborating evidence, not two independent voters.
7. Country strength: relationship scores are compared with the target country's field-wide normalized performance in the same edition/channel.
8. Network: existing HOD coordination-group analysis remains a corroborating graph signal.

## Small samples

Proportions use a configurable Beta prior. Independent editions remain the primary sample unit. One edition is capped at 29 and two editions at 49 by default. Confidence is calculated separately from risk and incorporates evidence count, independent editions, historical baseline size, channel coverage and consistency.

## Avoiding double counting

Raw observations are deduplicated within an edition/channel for a relationship before relationship-level statistics are calculated. Jury and televote observations from the same controller and edition do not increase the independent-edition count.

## Risk language

0–29 Normal, 30–49 Notable, 50–64 Review, 65–79 Strong, 80–89 High, 90–100 Critical.

These labels mean review priority only. Preferred UI language is `risk`, `anomaly`, `evidence`, `pattern`, `review`, `confidence`, `coordination signal`, and `unusual relationship`. Do not describe a statistical signal as confirmed fraud or guilt.

## Reproducibility

Results expose `modelVersion`. The persisted `advanced_model_config` JSON is organizer-controlled and is updated through the existing server-only audited settings RPC. Canonical voting data remains the source of truth; analytical results should be regenerated when source voting data or model configuration changes.
