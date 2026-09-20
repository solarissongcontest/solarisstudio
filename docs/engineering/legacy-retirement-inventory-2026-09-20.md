# Legacy and compatibility retirement inventory — 20 September 2026

This inventory distinguishes rollback/history from genuinely dead runtime code. The presence of the word `legacy` is not, by itself, a deletion warrant.

| Area | Current classification | Decision |
| --- | --- | --- |
| Public IA legacy navigation | rollback-only, still reachable through rollout branch | retain until Beta 3 + production evidence gate passes; then delete runtime branch |
| Old public URL redirects | compatibility | retain where shipped bookmarks/messages/search indexes may use them |
| `user_roles` | rollback/history | retain read-only until historical permission evidence/rollback need is separately retired |
| Country/Wiki personality aliases | compatibility with persisted designs | retain until persisted values are fully canonicalized and telemetry proves old values unreachable |
| Standalone Televoting bridges | historical/reference where no runtime import remains | remove only verified dead runtime/config dependencies; do not rewrite historical repositories |
| Applied migration files | migration history | never delete/rewrite to make history prettier |
| Beta telemetry | current evidence source | retain while Public IA retirement gates depend on it |

## Retirement procedure

For a database object:

1. trace application references;
2. trace SQL views/functions/triggers/policies;
3. inspect row count and recent writes;
4. inspect FKs and dependent objects;
5. decide whether historical records require archival;
6. remove application dependency first;
7. create a new cleanup migration;
8. rehearse migration and run advisors;
9. verify production.

Objects whose use is unknown are not deletion candidates.

## Current destructive gate

The Public IA legacy shell is the most visible retained rollback layer. Its technical retirement work is prepared, but deletion remains intentionally blocked by insufficient Beta 3 evidence. Forcing deletion now would violate the completion programme's own gate.
