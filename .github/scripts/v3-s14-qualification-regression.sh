#!/usr/bin/env bash
set -euo pipefail
eval "$(supabase status -o env)"
python3 - "${API_URL:-}" "${DB_URL:-}" <<'PY'
import sys
from urllib.parse import urlparse
for value, schemes in zip(sys.argv[1:], [('http',), ('postgres', 'postgresql')]):
    parsed = urlparse(value)
    if parsed.scheme not in schemes or parsed.hostname not in ('127.0.0.1', 'localhost', '::1'):
        raise SystemExit('Refusing qualification regression against a non-local target')
PY
psql "$DB_URL" -X -v ON_ERROR_STOP=1 -f .github/tests/v3-s14-qualification.sql
