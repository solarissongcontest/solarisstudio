#!/usr/bin/env bash
set -euo pipefail
# This helper validates BOTH endpoints before Auth or SQL can execute.
bun --env-file=/dev/null run scripts/v3-s14-publication-handoff-regression.ts
