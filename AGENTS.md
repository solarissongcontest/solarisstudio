<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Solaris Studio V3 — fresh-chat engineering guide

This is orientation, **not** a new product, database, or release authority. Read the applicable owner-provided canonical sources: `v3-plan.txt`, `V3 System plan (use this when u need to implement system stuff).txt`, `Public side v3 (use this for v3 public implementation).txt`, `Admin v3 (use this for admin v3 implementing).txt`, `V3 bottom bar plan (use this for making the bottom page bar).txt`, `Complete v3 coordinative master plan.txt`, and `CANONICAL AUTHORITY, RELEASE READINESS & CERTIFICATION ADDENDUM for v3.txt`. Obtain any required source absent from the checkout rather than guessing. Newer explicit owner decisions, production safety, and domain-specific canonical rules take precedence. The [single checklist/merge queue](https://github.com/solarissongcontest/solarisstudio/issues/574) coordinates work; `docs/v3/final-week-release-approval-packet.md` describes evidence, not permission. **Current merge-process authority:** [`docs/v3/merge-review-policy.md`](docs/v3/merge-review-policy.md) (owner update, 14 Nov 2026). A separate ChatGPT/QA/Integrator session is not required for a merge; the authorized implementing session may verify and integrate its own PR when all applicable technical and GitHub gates pass.

- **Start from reality:** fetch current `main` and record its SHA. Inspect relevant open/merged PRs, exact changed paths, current code, tests, registries, and CI; never treat an old snapshot or PR description as live proof.
- **One task, one owner:** claim the authorized checklist task in issue #574 before changes. Work only that task; coordinate shared files and overlapping PRs through the canonical queue (the same authorized session may act as integrator), reuse verified work, and stop after reporting the named task.
- **Keep canonical writers:** preserve working behavior and one authoritative mutation path per critical domain. The System/Supabase owner alone changes `supabase/migrations/**` and canonical schema/RPC authority; other lanes request missing contracts. Never introduce a competing writer or bypass RLS.
- **Protect Lovable history:** retain the warning above. Never force-push or rewrite already-pushed history, including rebases, amendments, or squashes of pushed commits. Use additive commits on a safely based branch.
- **Isolate tests:** CI, Playwright, browser/screenshot audits, previews, QA, and migration rehearsals must use local/disposable Supabase and loopback test targets (including legacy Confirmation clients). Reject hosted Supabase URLs and **fail closed** if local infrastructure is missing. Never fall back to production or expose production secrets.
- **Separate production permissions:** no hosted migration, deploy/promotion, public-write enablement, secret change, or RLS weakening without specific, separate owner approval.
- **Review without artificial blockers:** perform and document risk-tiered self-review and objective checks under `docs/v3/merge-review-policy.md`. Do not invent a second AI reviewer or independent merge approval; do not bypass real branch protection or separate production authorization.
- **Verify the exact candidate:** run focused checks and applicable Quality, isolated Browser, S13/S15, bundle, freshness, security, S14/S16 and release gates at the actual PR head. Recheck `main` and exact head/paths before a safe, authorized merge; stale green checks are not evidence.
- **Report evidence:** provide starting/final `main` SHAs, PR/issue URLs, exact changed paths, test commands/results, CI run links, local-isolation proof, and unresolved risks. `DONE` requires verified integration; a pushed branch or open PR is `PARTIAL`.
