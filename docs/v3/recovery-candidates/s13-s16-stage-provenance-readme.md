# S13-S16 exact-stage provenance from isolated PG17.11

Source workflow: .github/workflows/v3-s14-archive-forward-effects-local.yml
After the recovered observed-owner rehearsal produces observed-owner-recovery-proof.json and ordered-recovery-sql/, the checked-in scripts/v3-s13-s16-stage-provenance.mjs rehashes all 29 stage files in the isolated artifact, compares the proof SHA with the checked-out commit, and generates s13-s16-stage-provenance-classification.json.

Each stage includes order, source path, archive path, SHA256, byte size, classification and productionExecutable=false. Categories must remain: 4 explicit local SQL candidates, 13 historical source effects requiring live comparison, 10 local emitted/unqualified SQL files and 2 JavaScript local generators.

This proof does not authorize any stage on hosted production. It is NOT an independent restore of the 15-Nov encrypted database or Storage bytes, nor does it certify Auth/Vault, roles/grants, positive full contest lifecycle or hosted-schema equivalence. Never publish private backup bytes or decrypt in CI.

The classifier validates only exact local artifact bytes and blocks category drift. An operator must create new strictly hosted-only, checksum-pinned forward SQL after reviewing live catalog and independently restored production evidence. Never run the local-only stages against production.
