# Solaris V3 operational error reporting

## Purpose

`buildV3OperationalErrorReport()` defines the privacy-safe structured envelope for terminal or operator-relevant System V3 failures. It supplies the S9 deployment-tagging/error-reporting contract without creating a second operation ledger or a high-volume telemetry stream.

The helper does **not** accept an arbitrary `Error` object. This is deliberate: raw error messages and stacks can contain payload fragments, provider responses, user identifiers or secrets.

## Envelope

Each report contains only:

- exact deployment commit SHA;
- bounded environment and optional release tokens;
- one canonical System domain;
- one bounded command token when applicable;
- operation/correlation UUIDs when available for trace linkage;
- canonical operation error code;
- normalized S9/S10 reliability failure class;
- warning/error/critical severity;
- reconciliation/operator-recovery flags;
- explicit privacy assertions.

The serialized envelope is capped at 2048 characters.

It contains no:

- actor/user/delegation identifier;
- request/response body;
- ballot/vote content;
- notification content;
- arbitrary scope JSON;
- raw provider/database error text;
- stack trace;
- auth token/secret.

## Emission policy

Do not call this helper from component renders, polling loops, every retry attempt or ordinary validation failures just because a log line feels comforting.

Emit one structured report at an authoritative server boundary when a failure is operationally relevant, for example:

- terminal/transient infrastructure failure after the bounded retry policy has been applied;
- dead-letter transition;
- uncertain operation requiring reconciliation;
- operator-required recovery;
- critical system job failure;
- result/publication failure requiring operational action.

Use `emitV3OperationalErrorReport(report, sink)` with the runtime's explicit line sink. The helper itself performs no network request and does not choose a logging vendor.

## Deployment identity

The caller must supply the exact 40-character deployed source SHA plus a bounded environment token. The optional release token may identify the deployment/release generation, but must remain a low-cardinality token.

Do not use deployment SHA/release as a high-cardinality **metric label**. It is a diagnostic field for structured error records and incident correlation.

If a runtime cannot reliably provide its deployed source SHA, treat that as a deployment-observability gap rather than substituting `main`, `latest`, a local timestamp or another fictional identity.

## Correlation and privacy

Operation and correlation IDs are diagnostic trace fields, not metric labels. They permit one incident record to be joined manually to the canonical S2/S4 trace while keeping user identity and semantic payloads out of the report.

The failure class is derived by the merged S9/S10 classifier from the canonical error code and recovery flags, so callers do not invent a second failure taxonomy.

## Cost control

- one report per authoritative operational failure boundary;
- no duplicate report on consumer replay;
- no per-render/client telemetry;
- no full payload/stack capture;
- no new database table;
- no new external service requirement;
- aggregation should use bounded low-cardinality fields such as subsystem/domain/failure class/error code, never operation/user IDs.

## Integration boundary

Chat 7 owns this envelope/guardrail. Chat 1 owns canonical command/RPC boundaries and should adopt it at the appropriate server integration points rather than Chat 7 editing every domain mutation path. Chat 3 may consume aggregate System Health, not raw structured failure records.

Chat 5 should verify exact-SHA runtime tagging and representative failure emission during isolated rehearsal before S9 is considered fully certified.
