# Forensic PR validation note

PR #451 intentionally targets `audit/pr450-base-snapshot` instead of `main` so the forensic fixes can be reviewed against the exact PR #450 snapshot they were built on.

Quality CI normally runs only for pull requests targeting `main`. The forensic branch therefore temporarily adds `audit/pr450-base-snapshot` to the Quality workflow pull-request branch filter so the actual stacked diff receives the same production-build, typecheck, unit-test and lint gate without retargeting the PR or touching production Supabase.

The Quality job remains explicitly isolated to loopback Supabase URLs. This validation path must never be replaced by hosted-production test traffic.

When the forensic stack is finally rebased/retargeted for merge, this temporary branch-filter entry and its dedicated regression test can be removed if no longer needed.
