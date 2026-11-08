# Solaris Studio V3: final release approval packet (manual, external)

This document specifies the offline **--certified** gate for the tracked full-V3 blocker matrix. It is **not** an approval, deployment instruction, migration plan, or production credential. **Do not check real approval packets, account data, or tokens into the repository.**

## Three separate decisions are required

A successful PR-local Quality/Browser/S13/S15 check, the blocker matrix `releaseCertified` flag and an automated job never authorize:

1. A hosted production database migration.
2. A production deployment (including Worker Builds that deploy from `main`).
3. Reopening public write workflows or disabling maintenance.

The actual owner/operator must inspect the underlying decision records independently. The checker only validates the structure and exact-SHA consistency of those *claims*. It **does not authenticate signers, verify GitHub checks online, or authorize/perform any operation**. A fabricated JSON record has no standing.

## Usage

At the frozen candidate checkout, after real human approval and a complete full-scope, zero-blocker evidence review:

```bash
candidate_sha="$(git rev-parse HEAD)"
node scripts/check-v3-final-week-blockers.mjs \
  --file docs/v3/final-week-release-blocker-matrix.json \
  --candidate-sha "$candidate_sha" \
  --certified \
  --approval-file /protected/operator-evidence/v3-approval.json
```

Without `--approval-file`, `--certified` rejects the decision even if someone sets `releaseCertified: true`. The `--release` check is intentionally a separate *preflight* rather than production authorization.

## Packet contract

This **illustrative template is not approved evidence**, and the placeholders cannot pass as an actual candidate. All records must be backed by real human decisions and independently checked references. A separate, exact-SHA evidence record is required for S13, S14, S15, S16, security and production-isolation gates:

```json
{
  "schemaVersion": 1,
  "scope": "full_solaris_studio_v3",
  "decision": "GO_FULL_V3",
  "candidateSha": "<exact lowercase SHA of certified deployment>",
  "releaseManager": {
    "name": "<authorized human release manager>",
    "decisionRef": "<verified release-go decision record>"
  },
  "scopeReview": {
    "decision": "full_scope_accepted",
    "reviewedBy": "<authorized World/Public/Organizer scope reviewer>",
    "evidenceRef": "<complete capability and governance scope review>",
    "excludedCapabilities": []
  },
  "authorizations": {
    "hostedMigration": {
      "approved": true,
      "approvedBy": "<production database owner>",
      "evidenceRef": "<independent database migration approval>"
    },
    "productionDeployment": {
      "approved": true,
      "approvedBy": "<release/deployment owner>",
      "evidenceRef": "<independent production deployment approval>"
    },
    "publicWriteReopening": {
      "approved": true,
      "approvedBy": "<operations owner>",
      "evidenceRef": "<independent reopening approval>"
    }
  },
  "gates": [
    {"id":"S13","passed":true,"candidateSha":"<exact SHA>","evidenceRef":"<S13 proof>"},
    {"id":"S14","passed":true,"candidateSha":"<exact SHA>","evidenceRef":"<S14 proof>"},
    {"id":"S15","passed":true,"candidateSha":"<exact SHA>","evidenceRef":"<S15 proof>"},
    {"id":"S16","passed":true,"candidateSha":"<exact SHA>","evidenceRef":"<S16 proof>"},
    {"id":"security","passed":true,"candidateSha":"<exact SHA>","evidenceRef":"<security proof>"},
    {"id":"productionIsolation","passed":true,"candidateSha":"<exact SHA>","evidenceRef":"<egress isolation proof>"}
  ]
}
```

The three production-authorization `evidenceRef` values must be **distinct** and must refer to actual decisions. A full-release packet cannot silently exclude mandatory World or product capabilities; limited pilots require a different, explicitly approved process and must never be labeled a full V3 release.

## Current state (8 November 2026)

The blocker matrix deliberately has `coverage: "initial_verified_high_priority_only"` and `releaseCertified: false`. No approved packet has been supplied. The existence of this validator must never be interpreted as a GO decision.
