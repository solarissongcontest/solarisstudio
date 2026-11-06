# Historical GAG source preflight (TG0 / TG17 / TG19)

This **offline, read-only** validator checks curator-supplied documentary evidence before WORLD-05 (TG7) and WORLD-09 (TG17) map historical GUARD General Assembly records into the **existing** canonical measure/Archive systems. It is not an importer and does not create a new historical database, claim historical authenticity, publish records, or access Supabase.

The source corpus has not been verified as present. Do not invent GAG identifiers, proposal titles, sponsors, or outcomes to manufacture seed data. The canonical World master plan §75 requires preserving the exact identifier, known outcome, documentary source and import timestamp, with `text_availability=unavailable` when text cannot be sourced. **Only a real governed importer may stamp an import timestamp.**

## Invocation

```sh
node scripts/world-gag-import-preflight.mjs \
  --manifest /path/to/curated-gag-manifest.json \
  --source /path/to/original-source.pdf \
  --output /path/to/new-local-preflight-report.json
node --test scripts/__tests__/world-gag-import-preflight.test.mjs
```

Both manifest and original source are mandatory, and the actual source bytes must match `source.documentSha256` exactly. No network requests or database connections are made. The report file is created with owner-only permissions where supported and **never overwritten**. Keep curated source documents and reports outside public assets until WORLD-05/09 explicitly approve their publication scope.

## Manifest schema (illustrative fixture only, NOT real history)

```json
{
  "schemaVersion": 1,
  "source": {
    "documentId": "TEST-ONLY-SOURCE",
    "documentSha256": "<64 lowercase hex characters from the original file>",
    "citation": "Exact documentary citation and repository/accession number",
    "verifiedAt": "2026-11-06T20:00:00Z"
  },
  "records": [
    {
      "identifier": "EXAMPLE-001",
      "outcome": null,
      "sourceLocator": "page 4, item 2",
      "textAvailability": "unavailable"
    }
  ]
}
```

If a historical **outcome** is known, provide both `outcome` and its precise `outcomeSourceLocator`; otherwise leave both null/omitted. If title/sponsor/full text is known, provide the respective exact `title`, `sponsor`, `fullText` **plus** `titleSourceLocator`, `sponsorSourceLocator`, `fullTextSourceLocator`. Do not infer outcome, title or sponsor from an abbreviation. An unavailable full text must remain absent/null. Verified full text can contain original paragraph breaks (`\\n`), carriage returns (`\\r`) and tabs (`\\t`), and must not be flattened or trimmed. Unverified control characters (such as NUL), whitespace-only documents, and unsourced metadata are rejected. Exact identifiers are preserved; Unicode/case-equivalent collisions, extra fields and contradictory text states fail.

Limits: 2 MiB manifest, 32 MiB documentary file, 5,000 records. A report records checked source digest, manifest digest, source locators, known outcomes and factual presence flags without copying document body text into logs. Preflight does **not** verify historical truth beyond consistency with the submitted source bytes; a human must check the source and locator.

## Ownership and handoff

- WORLD-05/TG7 owns authoritative historical measure identifiers, writes/import commands, published state and immutable versioning.
- WORLD-06/TG9 owns resolutions/decision consequences; preflight cannot infer one from a vote.
- WORLD-09/TG17 owns published chronological Archive projection, not duplicate historical GAG records.
- WORLD-02/TG4 owns legal source documents/versions, not the GAG proposal register.
- WORLD-01 governs migrations and authorization; no database modification is included here.

A downstream importer must establish an approved mapping to canonical schema, prove actual source provenance, authorize the actor, enforce idempotency, store `imported_at` in its own transaction, and link to existing document/archive identities. It must not treat this preflight receipt as proof of publication or eligibility. No production migration, rollout, or automated hosted-Supabase test is authorized by this tool.
